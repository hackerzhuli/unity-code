import * as vscode from 'vscode';
import { DecompiledFileHelper, DecompiledFileInfo } from './decompiledFileHelper';
import { UnityPackageHelper, PackageInfo } from './unityPackageHelper';
import { UnityProjectManager } from './unityProjectManager';
import { UnityBinaryManager } from './unityBinaryManager';
import { getQualifiedTypeName, isTypeSymbol, extractXmlDocumentation } from './languageServerUtils';
import { xmlToMarkdown } from './xmlToMarkdown';
import { extractMajorMinorVersion } from './utils';

/**
 * Hover provider that adds documentation links to C# symbols
 * 
 * Uses Dot Rush language server which constructs qualified names from namespace hierarchy in symbol tree.
 * 
 * See docs/LanguageServerIntegration.md for Dot Rush symbol handling details
 */
export class CSharpDocHoverProvider implements vscode.HoverProvider {
    private readonly unityPackageHelper: UnityPackageHelper | undefined;
    private readonly unityProjectManager: UnityProjectManager | undefined;
    private readonly unityBinaryManager: UnityBinaryManager | undefined;

    constructor(unityPackageHelper?: UnityPackageHelper, unityProjectManager?: UnityProjectManager, unityBinaryManager?: UnityBinaryManager) {
        this.unityPackageHelper = unityPackageHelper;
        this.unityProjectManager = unityProjectManager;
        this.unityBinaryManager = unityBinaryManager;
    }

    /**
     * Unity packages that should use the standard Unity documentation URL instead of package-specific URLs
     */
    private readonly unityPackageExclusions: string[] = [
        // Add package names here that should use standard Unity docs
        // Example: 'com.unity.render-pipelines.core',
        // 'com.unity.ugui' // UI package might use standard docs
    ];

    /**
     * Configuration for documentation link generation
     */
    private readonly docLinkConfigs: DocLinkConfig[] = [
        {
            name: 'Unity Engine',
            namespace: 'UnityEngine',
            urlTemplate: 'https://docs.unity3d.com/{unityVersion}/Documentation/ScriptReference/{typeName}.html',
            namespaceRemoveLevel: 1,
            requiresUnityVersion: true
        },
        {
            name: 'Unity UI',
            namespace: 'UnityEngine.UI',
            urlTemplate: 'https://docs.unity3d.com/{unityVersion}/Documentation/ScriptReference/{typeName}.html',
            namespaceRemoveLevel: 2,
            requiresUnityVersion: true
        },
        {
            name: 'Unity Editor',
            namespace: 'UnityEditor',
            urlTemplate: 'https://docs.unity3d.com/{unityVersion}/Documentation/ScriptReference/{typeName}.html',
            namespaceRemoveLevel: 1,
            requiresUnityVersion: true
        },
        {
            name: '.NET Framework',
            namespace: 'System',
            urlTemplate: 'https://docs.microsoft.com/en-us/dotnet/api/{typeName}',
            isLowerCase: true
        },
        {
            name: 'NUnit',
            namespace: 'NUnit',
            urlTemplate: 'https://docs.nunit.org/api/{typeName}.html',
        },
        {
            name: 'NewtonsoftJson',
            namespace: 'Newtonsoft.Json',
            urlTemplate: 'https://www.newtonsoft.com/json/help/html/T_{typeName}.html',
            dotReplacement: '_'
        }
    ];

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        try {
            // Get symbol information using definition provider
            const symbolInfo = await this.getSymbolInfo(document, position);
            if (!symbolInfo) {
                return undefined;
            }            
            // Generate documentation link based on symbol origin (optional)
            const docLinkInfo = await this.generateDocLink(symbolInfo);
            
            // Create hover content with symbol info and optional documentation link
            // Even if no documentation link is available, we still want to show XML docs
            return await this.createHoverWithDocLink(symbolInfo, docLinkInfo);
        } catch (error) {
            console.error('Error in CSharpDocHoverProvider:', error);
            return undefined;
        }
    }

    /**
     * Get symbol information using definition provider
     */
    private async getSymbolInfo(document: vscode.TextDocument, position: vscode.Position): Promise<SymbolInfo | undefined> {
        try {
            // Get the word at the current position
            const wordRange = document.getWordRangeAtPosition(position);
            if (!wordRange) {
                return undefined;
            }

            const word = document.getText(wordRange);
            
            // Get definition locations (can be Location[] or LocationLink[])
            const definitions = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
                'vscode.executeDefinitionProvider',
                document.uri,
                position
            );

            // console.log(`there are ${definitions.length} definitions found for word: ${word}`);

            if (definitions && definitions.length > 0) {
                // Convert LocationLink to Location if needed
                const location = this.extractLocationFromDefinition(definitions[0]);
                if (location) {
                    // Analyze the definition to extract symbol information
                    const symbolInfo = await this.analyzeDefinition(location, word, document);
                    if (symbolInfo) {
                        // console.log(`Symbol found via definition: ${symbolInfo.type}`);
                        return symbolInfo;
                    }
                }
            }

            return undefined;

        } catch (_error) {
            console.error('Error getting symbol info:', _error);
            return undefined;
        }
    }

    /**
     * Extract Location from definition result (handles both Location and LocationLink)
     */
    private extractLocationFromDefinition(definition: vscode.Location | vscode.LocationLink): vscode.Location | undefined {
        if ('uri' in definition && 'range' in definition) {
            // It's a Location
            // console.log('it is a Location');
            return definition as vscode.Location;
        } else if ('targetUri' in definition && 'targetRange' in definition) {
            // It's a LocationLink
            // console.log('it is a LocationLink');
            const locationLink = definition as vscode.LocationLink;
            return new vscode.Location(locationLink.targetUri, locationLink.targetRange);
        }
        return undefined;
    }

    /**
     * Analyze definition location to extract symbol information
     */
    private async analyzeDefinition(definition: vscode.Location, word: string, _originalDocument: vscode.TextDocument): Promise<SymbolInfo | undefined> {
        try {
            // Open the definition document
            const definitionDocument = await vscode.workspace.openTextDocument(definition.uri);
            
            // Get document symbols for Dot Rush analysis
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                definitionDocument.uri
            );

            if (!symbols || symbols.length === 0) {
                return undefined;
            }
            
            let symbolInfo: SymbolInfo | undefined;
            
            if(definition.range.isEmpty){
                // console.log('Definition range is empty, trying fallback to single top-level type.');
                // Fallback: if range is empty, try to find a single top-level type in the file
                symbolInfo = await this.getSymbolInfoForEmptyRange(definitionDocument, word);
            } else {
                // Get detailed symbol information using document symbol provider
                symbolInfo = await this.getSymbolInfoFromPosition(definitionDocument, definition.range.start);
            }
            
            // Add definition location to symbol info for Unity package detection
            if (symbolInfo) {
                symbolInfo.definitionLocation = definition;
                
                // Check if this symbol is from a decompiled file
                const decompiledInfo = await this.checkDecompiledFile(definition.uri);
                if (decompiledInfo.isDecompiled) {
                    symbolInfo.isFromDecompiledFile = true;
                    symbolInfo.assemblyName = decompiledInfo.assemblyName;
                }
            }
            
            return symbolInfo;
        } catch (_error) {
            console.error('Error analyzing definition:', _error);
            return undefined;
        }
    }
    
    /**
     * Check if a file is decompiled using DecompiledFileHelper
     */
    private async checkDecompiledFile(uri: vscode.Uri): Promise<DecompiledFileInfo> {
        return await DecompiledFileHelper.analyzeUri(uri);
    }

    /**
     * Find the single top-level type in the symbol hierarchy.
     * 
     * Returns SymbolInfo for the top-level type if there is exactly one,
     * otherwise returns undefined if there are multiple or no top-level types.
     * 
     * @param symbols The document symbols to search through
     * @param document The text document to extract XML documentation from
     * @returns SymbolInfo for the single top-level type, or undefined
     */
    private findTopLevelType(symbols: vscode.DocumentSymbol[], document: vscode.TextDocument): SymbolInfo | undefined {
        const topLevelTypes: vscode.DocumentSymbol[] = [];
        let topLevelTypePath = "";

        const searchSymbols = (symbolList: vscode.DocumentSymbol[], path: string, isInsideType: boolean = false) => {
            for (const symbol of symbolList) {
                // Use definitive type detection for Dot Rush
                const isType = isTypeSymbol(symbol);
                
                if (isType && !isInsideType) {
                    // This is a top-level type (not nested inside another type)
                    topLevelTypes.push(symbol);
                    // Use getQualifiedTypeName for Dot Rush namespace hierarchy
                    topLevelTypePath = getQualifiedTypeName(symbol, combinePath(path, symbol.name));
                }

                if(topLevelTypes.length > 1){
                    return;
                }
                
                // Recursively search children
                if (symbol.children && symbol.children.length > 0) {
                    // If this symbol is a type, mark that we're now inside a type
                    searchSymbols(symbol.children, combinePath(path, symbol.name), isInsideType || isType);
                }
            }
        };
        
        searchSymbols(symbols, "", false);
        
        // Return SymbolInfo only if there's exactly one top-level type
        if (topLevelTypes.length === 1) {
            const typeSymbol = topLevelTypes[0];
              // Determine the fully qualified type name using Dot Rush namespace hierarchy
            const qualifiedTypeName = getQualifiedTypeName(typeSymbol, topLevelTypePath);
              // Extract XML documentation for the symbol
            const xmlDocs = extractXmlDocumentation(document, typeSymbol);
            // console.log(`abc [findTopLevelType] Extracted XML docs for ${typeSymbol.name}: "${xmlDocs}"`);

            return {
                    name: typeSymbol.name,
                    type: qualifiedTypeName,
                    kind: typeSymbol.kind,
                    fullSymbolName: qualifiedTypeName,
                    xmlDocs: xmlDocs
                };
        }
        
        return undefined;
    }

    /**
     * Get symbol information for empty range by checking if file contains only one top-level type
     */
    private async getSymbolInfoForEmptyRange(document: vscode.TextDocument, _word: string): Promise<SymbolInfo | undefined> {
        try {
            // Get document symbols
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );

            if (!symbols || symbols.length === 0) {
                return undefined;
            }
            // Find the single top-level type, returns undefined if multiple or none found
            const topLevelType = this.findTopLevelType(symbols, document);
            
            if (!topLevelType) {
                // console.log('Cannot determine symbol for empty range - multiple or no top-level types found.');
            }
            
            return topLevelType;
            
        } catch (_error) {
            console.error('Error getting symbol info for empty range:', _error);
            return undefined;
        }
    }
    
    /**
     * Get detailed symbol information using document symbol provider
     */
    private async getSymbolInfoFromPosition(document: vscode.TextDocument, position: vscode.Position): Promise<SymbolInfo | undefined> {
        try {
            // Get document symbols
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );

            if (!symbols || symbols.length === 0) {
                return undefined;
            }

            return this.findSymbolAtPosition(symbols, position, "", false, document, "");
        } catch (_error) {
            console.error('Error getting detailed symbol info:', _error);
            return undefined;
        }
    }
    
    /**
     * Find symbol at position and return SymbolInfo directly
     */
    private findSymbolAtPosition(
        symbols: vscode.DocumentSymbol[], 
        position: vscode.Position,
        /* the fully qualified name of the top level type that contains the symbols if exists, otherwise that path we accumulate as we go down the hierarchy */
        topLevelTypePath: string,
        isTopLevelTypeFound:boolean,
        document: vscode.TextDocument,
        /* the absolutely full path including all nested levels */
        fullPath: string = ""
    ): SymbolInfo | undefined {
        for (const symbol of symbols) {
            // Check if position is within this symbol's range
            if (symbol.range.contains(position)) {
                let updatedTopLevelTypePath = topLevelTypePath;
                let updatedIsTopLevelTypeFound = isTopLevelTypeFound;
                
                // If this symbol has children, search recursively for a more specific match
                if (symbol.children && symbol.children.length > 0) {
                    if (!isTopLevelTypeFound){
                        if(isTypeSymbol(symbol)){
                            // For Dot Rush, use the constructed path from namespace hierarchy
                            updatedTopLevelTypePath = getQualifiedTypeName(symbol, combinePath(topLevelTypePath, symbol.name));
                            updatedIsTopLevelTypeFound = true;
                        } else {
                            // Not a type yet, continue building the path
                            updatedTopLevelTypePath = combinePath(topLevelTypePath, symbol.name);
                        }
                    }
                    
                    // Update the full path with current symbol
                    const updatedFullPath = combinePath(fullPath, symbol.name);
                    
                    const childResult = this.findSymbolAtPosition(symbol.children, position, updatedTopLevelTypePath, updatedIsTopLevelTypeFound, document, updatedFullPath);
                    if (childResult) {
                        // Found a more specific symbol within this one
                        return childResult;
                    }
                }
                // For the target symbol, determine the qualified type name using Dot Rush hierarchy
                // If this is a type symbol, use its own qualification
                // Otherwise, use the top-level type path we've been building
                const qualifiedTypeName = isTypeSymbol(symbol) 
                    ? getQualifiedTypeName(symbol, updatedTopLevelTypePath)
                    : updatedTopLevelTypePath;
                  // Extract XML documentation for the symbol
                const xmlDocs = extractXmlDocumentation(document, symbol);
                // console.log(`abc [findSymbolAtPosition] Extracted XML docs for ${symbol.name}: "${xmlDocs}"`);
                
                // Generate full symbol name including parameter types for methods
                // Use the absolutely full path for fullSymbolName
                const fullSymbolName = this.generateFullSymbolName(symbol, fullPath);
                
                return {
                    name: symbol.name,
                    type: qualifiedTypeName,
                    kind: symbol.kind,
                    fullSymbolName: fullSymbolName,
                    xmlDocs: xmlDocs
                };
            }
        }
        
        return undefined;
    }

    /**
     * Generate full symbol name including parameter types for methods
     * For non-method symbols, returns the qualified type name
     * For methods, returns the full signature including parameter types
     */
    private generateFullSymbolName(symbol: vscode.DocumentSymbol, qualifiedTypeName: string): string {
        return `${qualifiedTypeName}.${symbol.name}`;
    }

    /**
     * Generate documentation link based on symbol type using configuration
     */
    private async generateDocLink(symbolInfo: SymbolInfo): Promise<DocLinkInfo | undefined> {
        // Check if this is a package symbol from PackageCache
        if (symbolInfo.definitionLocation && this.unityPackageHelper && this.unityPackageHelper.isPackagePath(symbolInfo.definitionLocation.uri.fsPath)) {
            const packageInfo = await this.unityPackageHelper.getPackageByPath(symbolInfo.definitionLocation.uri.fsPath);
            if (packageInfo) {
                const packageLinks = this.generatePackageDocumentationLink(symbolInfo.type, packageInfo);
                if (packageLinks) {
                    const url = packageLinks.apiUrl || undefined;
                    return { url, packageInfo: packageLinks.packageInfo, packageLinks };
                } else {
                    // Try to generate standard documentation link
                    const config = this.findMatchingConfig(symbolInfo.type);
                    const url = config ? this.generateLinkFromConfig(symbolInfo.type, config) : undefined;
                    return { url, packageInfo, packageLinks: undefined };
                }
            }
        }

        // Check if the symbol is from a decompiled file
        if (symbolInfo.definitionLocation) {
            const decompiledInfo = await this.checkDecompiledFile(symbolInfo.definitionLocation.uri);
            if (decompiledInfo.isDecompiled && decompiledInfo.assemblyName && this.unityPackageHelper) {
                const packageInfo = this.unityPackageHelper.getPackageByAssembly(decompiledInfo.assemblyName);
                if (packageInfo) {
                    const packageLinks = this.generatePackageDocumentationLink(symbolInfo.type, packageInfo);
                    if (packageLinks) {
                        // Use apiUrl if available, otherwise fall back to manualUrl, or undefined if neither exists
                        const url = packageLinks.apiUrl || packageLinks.manualUrl || undefined;
                        return { url, packageInfo: packageLinks.packageInfo, packageLinks };
                    } else {
                        // Even if no package-specific links, we can still show package information
                        // Try to generate standard documentation link
                        const config = this.findMatchingConfig(symbolInfo.type);
                        const url = config ? this.generateLinkFromConfig(symbolInfo.type, config) : undefined;
                        return { url, packageInfo, packageLinks: undefined };
                    }
                }
            }
        }

        // Fall back to standard documentation link
        const config = this.findMatchingConfig(symbolInfo.type);
        if (!config) {
            return undefined;
        }

        const url = this.generateLinkFromConfig(symbolInfo.type, config);
        return url ? { url, packageInfo: undefined } : undefined;
    }



    /**
     * Generate package-specific documentation links based on package type
     * @param typeName The fully qualified type name
     * @param packageInfo The package information
     * @returns The package documentation links or undefined if not supported
     */
    private generatePackageDocumentationLink(typeName: string, packageInfo: PackageInfo): PackageDocumentationLinks | undefined {
        // Check if package has documentationUrl field
        if (packageInfo.documentationUrl) {
            // If documentationUrl exists, use it for package documentation
            // For Unity packages, we can also generate API links if the documentationUrl is from Unity's official site
            if (packageInfo.documentationUrl.includes('docs.unity3d.com')) {
                // This is a Unity package with official documentation URL
                // We can generate both package and API links
                return this.generateUnityPackageLinksFromDocUrl(typeName, packageInfo);
            } else {
                // Non-Unity package with documentationUrl - only provide package link, no class-specific API link
                // console.log(`Using documentationUrl for package ${packageInfo.name}: ${packageInfo.documentationUrl}`);
                return {
                    apiUrl: undefined, // No class-specific API link for non-Unity packages
                    manualUrl: packageInfo.documentationUrl!,
                    packageInfo
                };
            }
        }
        
        // Fall back to old pattern-based approach when documentationUrl is not available
        // Handle Unity packages
        if (packageInfo.name.startsWith('com.unity')) {
            // Skip package-specific URL if this package is in the exclusion list
            if (this.unityPackageExclusions.includes(packageInfo.name)) {
                return undefined; // Fall back to standard documentation
            }
            return this.generateUnityPackageLinks(typeName, packageInfo);
        }
        
        // Handle other popular packages (can be extended in the future)
        // Example: Newtonsoft.Json, NUnit, etc.
        // For now, return undefined to fall back to standard documentation
        
        // console.log(`No specific documentation handler for package: ${packageInfo.name}`);
        return undefined;
    }

    /**
     * Generate Unity package documentation links (both API and manual)
     * @param typeName The fully qualified type name
     * @param packageInfo The Unity package information
     * @returns The Unity package documentation links, or undefined if version extraction fails
     */
    private generateUnityPackageLinks(typeName: string, packageInfo: PackageInfo): PackageDocumentationLinks | undefined {
        // Extract major.minor version from the version string (Unity package URLs only use two components)
        const cleanVersion = extractMajorMinorVersion(packageInfo.version);
        if (!cleanVersion) {
            console.warn(`Could not extract major.minor version from: ${packageInfo.version}`);
            return undefined;
        }
        
        // Type name should already be in the correct format for Unity package docs
        const transformedTypeName = typeName;
        
        // Generate Unity package API documentation URL
        // Format: https://docs.unity3d.com/Packages/com.unity.localization@1.5/api/UnityEngine.Localization.Settings.AsynchronousBehaviour.html
        const apiUrl = `https://docs.unity3d.com/Packages/${packageInfo.name}@${cleanVersion}/api/${transformedTypeName}.html`;
        
        // Generate Unity package manual documentation URL
        // Format: https://docs.unity3d.com/Packages/com.unity.localization@1.5/manual/index.html
        const manualUrl = `https://docs.unity3d.com/Packages/${packageInfo.name}@${cleanVersion}/manual/index.html`;
        
        // console.log(`Generated Unity package API URL: ${apiUrl}`);
        // console.log(`Generated Unity package manual URL: ${manualUrl}`);
        
        return {
            apiUrl,
            manualUrl,
            packageInfo
        };
    }

    /**
     * Generate Unity package documentation links using documentationUrl
     * @param typeName The fully qualified type name
     * @param packageInfo The Unity package information with documentationUrl
     * @returns The Unity package documentation links
     */
    private generateUnityPackageLinksFromDocUrl(typeName: string, packageInfo: PackageInfo): PackageDocumentationLinks {
        // Extract package name and version from documentationUrl
        // Expected format: https://docs.unity3d.com/Packages/com.unity.inputsystem@1.14/manual/index.html
        const urlMatch = packageInfo.documentationUrl!.match(/\/Packages\/(.*?)@([^/]+)\//); 
        
        if (urlMatch) {
            const packageName = urlMatch[1];
            const version = urlMatch[2];
            
            // Generate API URL using extracted info
            const apiUrl = `https://docs.unity3d.com/Packages/${packageName}@${version}/api/${typeName}.html`;
            
            // console.log(`Generated Unity package API URL from documentationUrl: ${apiUrl}`);
            // console.log(`Using provided manual URL: ${packageInfo.documentationUrl}`);
            
            return {
                apiUrl,
                manualUrl: packageInfo.documentationUrl!,
                packageInfo
            };
        } else {
            // If we can't parse the URL, fall back to using documentationUrl as manual link only
            console.warn(`Could not parse Unity package URL format: ${packageInfo.documentationUrl}`);
            return {
                apiUrl: undefined,
                manualUrl: packageInfo.documentationUrl!,
                packageInfo
            };
        }
    }

    /**
     * Find the matching configuration for a given type name
     */
    private findMatchingConfig(typeName: string): DocLinkConfig | undefined {
        return this.docLinkConfigs.find(config => 
            typeName.startsWith(config.namespace + '.')
        );
    }

    /**
     * Generate documentation link using the provided configuration
     */
    private generateLinkFromConfig(typeName: string, config: DocLinkConfig): string | undefined {
        let transformedTypeName = typeName;

        // Remove namespace levels if specified (default: 0)
        const namespaceRemoveLevel = config.namespaceRemoveLevel ?? 0;
        if (namespaceRemoveLevel > 0) {
            const parts = typeName.split('.');
            if (parts.length > namespaceRemoveLevel) {
                transformedTypeName = parts.slice(namespaceRemoveLevel).join('.');
            }
        }

        // Replace dots with specified string if configured
        if (config.dotReplacement !== undefined) {
            transformedTypeName = transformedTypeName.replace(/\./g, config.dotReplacement);
        }

        // Apply lowercase transformation if specified (default: false)
        if (config.isLowerCase === true) {
            transformedTypeName = transformedTypeName.toLowerCase();
        }

        // Clean up any trailing slashes or backslashes
        transformedTypeName = transformedTypeName.replace(/[/\\]+$/, '');

        // Start with the URL template
        let url = config.urlTemplate;

        // Replace typeName placeholder
        url = url.replace('{typeName}', transformedTypeName);

        // Handle Unity version replacement if required
        if (config.requiresUnityVersion && url.includes('{unityVersion}')) {
            if (!this.unityProjectManager) {
                // No Unity project manager available, cannot generate versioned URL
                return undefined;
            }

            const unityVersion = this.unityProjectManager.getUnityEditorVersion();
            if (!unityVersion) {
                // No Unity version detected, cannot generate versioned URL
                return undefined;
            }

            // Extract major.minor version using utility function
            const shortVersion = extractMajorMinorVersion(unityVersion);
            if (!shortVersion) {
                // Invalid version format, cannot generate versioned URL
                return undefined;
            }
            url = url.replace('{unityVersion}', shortVersion);
        }

        return url;
    }
      /**
     * Create hover content with documentation link using type name
     */
    private async createHoverWithDocLink(symbolInfo: SymbolInfo, docLinkInfo?: DocLinkInfo): Promise<vscode.Hover> {
        const hoverContent = new vscode.MarkdownString();
        // Show XML documentation if available (at the top)
        // console.log(`abc Adding XML docs for symbol: ${symbolInfo.name}, docs is: ${symbolInfo.xmlDocs}`);
        // console.log(`abc XML docs length: ${symbolInfo.xmlDocs.length}, trimmed length: ${symbolInfo.xmlDocs.trim().length}`);
        
        let addedXmlDocs = false;
        let xmlDocsToUse = symbolInfo.xmlDocs;

        // Fallback mechanism: if no XML docs and symbol is from decompiled file, request from native binary
        var isFallback = false;
        if ((!xmlDocsToUse || xmlDocsToUse.trim().length === 0) && 
            symbolInfo.isFromDecompiledFile && 
            this.unityBinaryManager) {
            try {
                isFallback = true;
                console.log(`CSharpDocHoverProvider: Requesting docs for symbol: ${symbolInfo.fullSymbolName}`);
                const response = await this.unityBinaryManager.requestSymbolDocs(
                    symbolInfo.fullSymbolName,
                    symbolInfo.assemblyName,
                    symbolInfo.definitionLocation?.uri.fsPath
                );
                if (response && response.Documentation) {
                    xmlDocsToUse = response.Documentation;
                }
            } catch (error) {
                console.warn('CSharpDocHoverProvider: Failed to get symbol documentation from native binary:', error);
            }
        }

        // Convert XML docs to Markdown format
        const markdownDocs = xmlToMarkdown(xmlDocsToUse!, isFallback? []: ["summary", "returns", "param", "exception"]);
        // console.log(`abc Converted to markdown: ${markdownDocs}`);
        if(markdownDocs){
            hoverContent.appendMarkdown(markdownDocs);
            addedXmlDocs = true;
        }
        
        // Only show documentation link information if available
        if (docLinkInfo) {
            // Add separator only if we have both XML docs and doc links
            if (addedXmlDocs) {
                hoverContent.appendMarkdown('\n\n---\n\n');
            }
            // Add package information if available
            if (docLinkInfo.packageInfo) {
                let embedded = '';
                if (docLinkInfo.packageInfo.isEmbedded) {
                    embedded = `(embedded)`;
                }
                hoverContent.appendMarkdown(`From package \`${docLinkInfo.packageInfo.displayName}\`(${docLinkInfo.packageInfo.name})${embedded}, version \`${docLinkInfo.packageInfo.version}\`\n\n`);
            }
            
            // Show documentation link only if URL is available
            if (docLinkInfo.url) {
                const typeName = symbolInfo.type;
                hoverContent.appendMarkdown(`View docs for [${typeName}](${docLinkInfo.url})`);
            }
            
            // Add package documentation link for Unity packages using consolidated packageLinks
            if (docLinkInfo.packageLinks) {
                const packageDisplayName = docLinkInfo.packageLinks.packageInfo.displayName || docLinkInfo.packageLinks.packageInfo.name;
                const linkPrefix = docLinkInfo.url ? '\n\n' : '';
                hoverContent.appendMarkdown(`${linkPrefix}View docs for package [${packageDisplayName}](${docLinkInfo.packageLinks.manualUrl})`);
            }
        }
        
        // If we have no content at all, return undefined to indicate no hover should be shown
        if (hoverContent.value.trim().length === 0) {
            return new vscode.Hover(new vscode.MarkdownString(`No documentation available for \`${symbolInfo.name}\``));
        }
        
        // Make the markdown trusted to allow links
        hoverContent.isTrusted = true;

        return new vscode.Hover(hoverContent);
    }
}

/**
 * Represents symbol information for documentation hover functionality.
 * @interface SymbolInfo
 */
interface SymbolInfo {
    /** The name of the symbol (e.g., "MyClass", "MyMethod") */
    name: string;
    
    /** 
     * The fully qualified name of the top-level type that contains this symbol.
     * This always points to the outermost type (class, interface, struct, enum) regardless
     * of how deeply nested the symbol is within that type.
     * Format: "Namespace.TopLevelTypeName"
     * 
     * For C# Dev Kit: Derived from the detail field when available
     * For Dot Rush: Constructed from namespace hierarchy in symbol tree
     */
    type: string;
    
    /** The VS Code symbol kind (Class, Method, Property, etc.) */
    kind: vscode.SymbolKind;
    
    /** The location where this symbol is defined (used for Unity package detection) */
    definitionLocation?: vscode.Location;
      /** 
     * The fully qualified symbol name including namespace, type, and member name.
     * For methods, includes parameter types in parentheses.
     * Examples:
     * - Type: "MyNamespace.MyClass"
     * - Method: "MyNamespace.MyClass.MyMethod(int, string)"
     * - Property: "MyNamespace.MyClass.MyProperty"
     * This is used for querying the native binary for XML documentation.
     */
    fullSymbolName: string;
    
    /** 
     * The extracted XML documentation comments for this symbol.
     * Contains the content of /// comments that appear before the symbol's range,
     * with /// markers and leading whitespace removed.
     */
    xmlDocs?: string;
    
    /** 
     * Whether this symbol is from a decompiled file.
     * Used to determine if we should fallback to native binary for documentation.
     */
    isFromDecompiledFile?: boolean;
    
    /** 
     * Assembly name if the symbol is from a decompiled file.
     * Used for requesting documentation from native binary.
     */
    assemblyName?: string;
}

/**
 * Configuration for generating documentation links for different libraries/frameworks.
 * @interface DocLinkConfig
 */
interface DocLinkConfig {
    /** Human-readable name of the library/framework */
    name: string;
    
    /** Exact namespace to match against type names */
    namespace: string;
    
    /** URL template with {typeName} and optional {unityVersion} placeholders */
    urlTemplate: string;
    
    /** Number of namespace levels to remove from the type name (default: 0 = no removal) */
    namespaceRemoveLevel?: number;
    
    /** Whether to convert the type name to lowercase (default: false) */
    isLowerCase?: boolean;
    
    /** String to replace dots with in the type name (default: no replacement) */
    dotReplacement?: string;
    
    /** Whether this config requires Unity version information (default: false) */
    requiresUnityVersion?: boolean;
}

/**
 * Information about documentation link generation result.
 * @interface DocumentationLinkInfo
 */
interface DocLinkInfo {
    /** The generated documentation URL */
    url: string | undefined;
    
    /** Package information if the symbol is from a Unity package */
    packageInfo?: PackageInfo;
    
    /** Package documentation links if available */
    packageLinks?: PackageDocumentationLinks;
}

/**
 * Package documentation links containing both API and manual URLs.
 * @interface PackageDocumentationLinks
 */
interface PackageDocumentationLinks {
    /** The API documentation URL for the specific type */
    apiUrl: string | undefined;
    
    /** The package manual documentation URL */
    manualUrl: string;
    
    /** Package information */
    packageInfo: PackageInfo;
}

/**
 * Combine a path and a name to create a fully qualified name.
 * The path is optional and can be null or empty.
 * If the path is provided, it will be prefixed with the name and separated by a dot.
 * If the path is not provided, the name will be returned as is.
 * @param path The path to combine with the name.
 * @param name The name to combine with the path.
 * @returns The combined fully qualified name.
 */
function combinePath(path: string, name: string): string {
    if(!path || path.length === 0){
        return name;
    }
    return path + "." + name;
}
