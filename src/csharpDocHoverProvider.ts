import * as vscode from 'vscode';
import { DecompiledFileHelper, DecompiledFileInfo } from './decompiledFileHelper.js';
import { UnityPackageHelper, PackageInfo } from './unityPackageHelper.js';
import { getQualifiedTypeName, detectLanguageServer, LanguageServerInfo, isTypeSymbol, extractXmlDocumentation } from './languageServerUtils.js';
import { xmlToMarkdown } from './xmlToMarkdown.js';

/**
 * Hover provider that adds documentation links to C# symbols
 * 
 * Supports multiple language servers with different symbol handling:
 * - C# Dev Kit: Uses detail field for fully qualified type names, no namespace symbols
 * - Dot Rush: Constructs qualified names from namespace hierarchy in symbol tree
 * 
 * See docs/LanguageServerIntegration.md for detailed differences
 */
export class CSharpDocHoverProvider implements vscode.HoverProvider {
    private readonly unityPackageHelper: UnityPackageHelper | undefined;

    constructor(unityPackageHelper?: UnityPackageHelper) {
        this.unityPackageHelper = unityPackageHelper;
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
            urlTemplate: 'https://docs.unity3d.com/ScriptReference/{typeName}.html',
            namespaceRemoveLevel: 1
        },
        {
            name: 'Unity UI',
            namespace: 'UnityEngine.UI',
            urlTemplate: 'https://docs.unity3d.com/ScriptReference/{typeName}.html',
            namespaceRemoveLevel: 2
        },
        {
            name: 'Unity Editor',
            namespace: 'UnityEditor',
            urlTemplate: 'https://docs.unity3d.com/ScriptReference/{typeName}.html',
            namespaceRemoveLevel: 1
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
            }            // Generate documentation link based on symbol origin (optional)
            const docLinkInfo = await this.generateDocumentationLink(symbolInfo);
            
            // Create hover content with symbol info and optional documentation link
            // Even if no documentation link is available, we still want to show XML docs
            return this.createHoverWithDocLink(symbolInfo, docLinkInfo);

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

            console.log(`there are ${definitions.length} definitions found for word: ${word}`);

            if (definitions && definitions.length > 0) {
                // Convert LocationLink to Location if needed
                const location = this.extractLocationFromDefinition(definitions[0]);
                if (location) {
                    // Analyze the definition to extract symbol information
                    const symbolInfo = await this.analyzeDefinition(location, word, document);
                    if (symbolInfo) {
                        console.log(`Symbol found via definition: ${symbolInfo.type}`);
                        return symbolInfo;
                    }
                }
            }

            return undefined;

        } catch (error) {
            console.error('Error getting symbol info:', error);
            return undefined;
        }
    }

    /**
     * Extract Location from definition result (handles both Location and LocationLink)
     */
    private extractLocationFromDefinition(definition: vscode.Location | vscode.LocationLink): vscode.Location | undefined {
        if ('uri' in definition && 'range' in definition) {
            // It's a Location
            console.log('it is a Location');
            return definition as vscode.Location;
        } else if ('targetUri' in definition && 'targetRange' in definition) {
            // It's a LocationLink
            console.log('it is a LocationLink');
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
            
            // Get document symbols first to detect language server
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                definitionDocument.uri
            );

            if (!symbols || symbols.length === 0) {
                return undefined;
            }

            // Detect language server type
            const languageServerInfo = detectLanguageServer(symbols);
            console.log(`Detected language server: ${languageServerInfo.type}`);
            
            let symbolInfo: SymbolInfo | undefined;
            
            if(definition.range.isEmpty){
                console.log('Definition range is empty, trying fallback to single top-level type.');
                // Fallback: if range is empty, try to find a single top-level type in the file
                symbolInfo = await this.getSymbolInfoForEmptyRange(definitionDocument, word, languageServerInfo);
            } else {
                // Get detailed symbol information using document symbol provider
                symbolInfo = await this.getSymbolInfoFromPosition(definitionDocument, definition.range.start, languageServerInfo);
            }
            
            // Add definition location to symbol info for Unity package detection
            if (symbolInfo) {
                symbolInfo.definitionLocation = definition;
            }
            
            return symbolInfo;
        } catch (error) {
            console.error('Error analyzing definition:', error);
            return undefined;
        }
    }    /**
     * Find the single top-level type in the symbol hierarchy.
     * 
     * Returns SymbolInfo for the top-level type if there is exactly one,
     * otherwise returns undefined if there are multiple or no top-level types.
     * 
     * @param symbols The document symbols to search through
     * @param languageServerInfo Information about the detected language server
     * @param document The text document to extract XML documentation from
     * @returns SymbolInfo for the single top-level type, or undefined
     */
    private findTopLevelType(symbols: vscode.DocumentSymbol[], languageServerInfo: LanguageServerInfo, document: vscode.TextDocument): SymbolInfo | undefined {
        const topLevelTypes: vscode.DocumentSymbol[] = [];
        let topLevelTypePath = "";

        const searchSymbols = (symbolList: vscode.DocumentSymbol[], path: string, isInsideType: boolean = false) => {
            for (const symbol of symbolList) {
                // Use definitive type detection based on language server
                const isType = isTypeSymbol(symbol);
                
                if (isType && !isInsideType) {
                    // This is a top-level type (not nested inside another type)
                    topLevelTypes.push(symbol);
                    // Use getQualifiedTypeName to handle different language servers properly
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
              // Determine the fully qualified type name
            // Prefer detail field if it contains a qualified name (C# Dev Kit)
            // Otherwise use the constructed path (Dot Rush)
            const qualifiedTypeName = getQualifiedTypeName(typeSymbol, topLevelTypePath);
              // Extract XML documentation for the symbol
            const xmlDocs = extractXmlDocumentation(document, typeSymbol);
            console.log(`abc [findTopLevelType] Extracted XML docs for ${typeSymbol.name}: "${xmlDocs}"`);
            
            return {
                name: typeSymbol.name,
                type: qualifiedTypeName,
                kind: typeSymbol.kind,
                detail: typeSymbol.detail,
                xmlDocs: xmlDocs
            };
        }
        
        return undefined;
    }

    /**
     * Get symbol information for empty range by checking if file contains only one top-level type
     */
    private async getSymbolInfoForEmptyRange(document: vscode.TextDocument, _word: string, languageServerInfo: LanguageServerInfo): Promise<SymbolInfo | undefined> {
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
            const topLevelType = this.findTopLevelType(symbols, languageServerInfo, document);
            
            if (!topLevelType) {
                console.log('Cannot determine symbol for empty range - multiple or no top-level types found.');
            }
            
            return topLevelType;
            
        } catch (error) {
            console.error('Error getting symbol info for empty range:', error);
            return undefined;
        }
    }
    
    /**
     * Get detailed symbol information using document symbol provider
     */
    private async getSymbolInfoFromPosition(document: vscode.TextDocument, position: vscode.Position, languageServerInfo: LanguageServerInfo): Promise<SymbolInfo | undefined> {
        try {
            // Get document symbols
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );

            if (!symbols || symbols.length === 0) {
                return undefined;
            }

            return this.findSymbolAtPosition(symbols, position, "", false, languageServerInfo, document);
        } catch (error) {
            console.error('Error getting detailed symbol info:', error);
            return undefined;
        }
    }    /**
     * Find symbol at position and return SymbolInfo directly
     */
    private findSymbolAtPosition(
        symbols: vscode.DocumentSymbol[], 
        position: vscode.Position,
        /* the fully qualified name of the top level type that contains the symbols if exists, otherwise that path we accumulate as we go down the hierarchy */
        topLevelTypePath: string,
        isTopLevelTypeFound:boolean,
        languageServerInfo: LanguageServerInfo,
        document: vscode.TextDocument
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
                            // For C# Dev Kit, use the detail field if available, otherwise combine path
                            updatedTopLevelTypePath = getQualifiedTypeName(symbol, combinePath(topLevelTypePath, symbol.name));
                            updatedIsTopLevelTypeFound = true;
                        } else {
                            // Not a type yet, continue building the path
                            updatedTopLevelTypePath = combinePath(topLevelTypePath, symbol.name);
                        }
                    }
                    
                    const childResult = this.findSymbolAtPosition(symbol.children, position, updatedTopLevelTypePath, updatedIsTopLevelTypeFound, languageServerInfo, document);
                    if (childResult) {
                        // Found a more specific symbol within this one
                        return childResult;
                    }
                }
                  // For the target symbol, determine the best qualified type name
                // If this is a type symbol, use its own qualification
                // Otherwise, use the top-level type path we've been building
                const qualifiedTypeName = isTypeSymbol(symbol) 
                    ? getQualifiedTypeName(symbol, updatedTopLevelTypePath)
                    : updatedTopLevelTypePath;
                  // Extract XML documentation for the symbol
                const xmlDocs = extractXmlDocumentation(document, symbol);
                console.log(`abc [findSymbolAtPosition] Extracted XML docs for ${symbol.name}: "${xmlDocs}"`);
                
                return {
                    name: symbol.name,
                    type: qualifiedTypeName,
                    kind: symbol.kind,
                    detail: symbol.detail,
                    xmlDocs: xmlDocs
                };
            }
        }
        
        return undefined;
    }

    /**
     * Generate documentation link based on symbol type using configuration
     */
    private async generateDocumentationLink(symbolInfo: SymbolInfo): Promise<DocumentationLinkInfo | undefined> {
        // Check if this is a package symbol from PackageCache
        if (symbolInfo.definitionLocation && this.unityPackageHelper && this.unityPackageHelper.isPackagePath(symbolInfo.definitionLocation.uri.fsPath)) {
            // Only update packages when we actually need package information
            await this.unityPackageHelper.updatePackages();
            
            const packageName = this.unityPackageHelper.extractPackageNameFromPath(symbolInfo.definitionLocation.uri.fsPath);
            if (packageName) {
                const packageInfo = this.unityPackageHelper.getPackageByName(packageName);
                if (packageInfo) {
                    const packageLinks = this.generatePackageDocumentationLink(symbolInfo.type, packageInfo);
                    if (packageLinks) {
                        return { url: packageLinks.apiUrl, packageInfo: packageLinks.packageInfo, packageLinks };
                    }
                    // If no package-specific URL generated, fall through to standard documentation
                }
            }
        }

        // Check if the symbol is from a decompiled file
        if (symbolInfo.definitionLocation) {
            const decompiledInfo = await this.checkDecompiledFile(symbolInfo.definitionLocation.uri);
            if (decompiledInfo.isDecompiled && decompiledInfo.assemblyName && this.unityPackageHelper) {
                // Only update packages when we actually need assembly-to-package mapping
                await this.unityPackageHelper.updatePackages();
                
                const packageInfo = this.unityPackageHelper.getPackageByAssembly(decompiledInfo.assemblyName);
                if (packageInfo) {
                    const packageLinks = this.generatePackageDocumentationLink(symbolInfo.type, packageInfo);
                    if (packageLinks) {
                        return { url: packageLinks.apiUrl, packageInfo: packageLinks.packageInfo, packageLinks };
                    }
                    // If no package-specific URL generated, fall through to standard documentation
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
     * Check if a file is a decompiled file and extract assembly information
     * @param uri The URI of the file to check
     * @returns Promise<DecompiledFileInfo> Information about the decompiled file
     */
    private async checkDecompiledFile(uri: vscode.Uri): Promise<DecompiledFileInfo> {
        try {
            return await DecompiledFileHelper.analyzeUri(uri);
        } catch (error) {
            console.error('Error checking decompiled file:', error);
            return { isDecompiled: false };
        }
    }

    /**
     * Generate package-specific documentation links based on package type
     * @param typeName The fully qualified type name
     * @param packageInfo The package information
     * @returns The package documentation links or undefined if not supported
     */
    private generatePackageDocumentationLink(typeName: string, packageInfo: PackageInfo): PackageDocumentationLinks | undefined {
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
        
        console.log(`No specific documentation handler for package: ${packageInfo.name}`);
        return undefined;
    }

    /**
     * Generate Unity package documentation links (both API and manual)
     * @param typeName The fully qualified type name
     * @param packageInfo The Unity package information
     * @returns The Unity package documentation links
     */
    private generateUnityPackageLinks(typeName: string, packageInfo: PackageInfo): PackageDocumentationLinks {
        // Extract major.minor version from the version string (Unity package URLs only use two components)
        let cleanVersion = packageInfo.version;
        
        // Try to extract major.minor version pattern (e.g., "1.5" from "1.5.2-preview.1" or hash)
        const versionMatch = packageInfo.version.match(/^(\d+\.\d+)/); 
        if (versionMatch) {
            cleanVersion = versionMatch[1];
        } else {
            // If no version pattern found, try to read from package.json
            // For now, use the raw version as fallback
            console.warn(`Could not extract major.minor version from: ${packageInfo.version}`);
        }
        
        // Type name should already be in the correct format for Unity package docs
        const transformedTypeName = typeName;
        
        // Generate Unity package API documentation URL
        // Format: https://docs.unity3d.com/Packages/com.unity.localization@1.5/api/UnityEngine.Localization.Settings.AsynchronousBehaviour.html
        const apiUrl = `https://docs.unity3d.com/Packages/${packageInfo.name}@${cleanVersion}/api/${transformedTypeName}.html`;
        
        // Generate Unity package manual documentation URL
        // Format: https://docs.unity3d.com/Packages/com.unity.localization@1.5/manual/index.html
        const manualUrl = `https://docs.unity3d.com/Packages/${packageInfo.name}@${cleanVersion}/manual/index.html`;
        
        console.log(`Generated Unity package API URL: ${apiUrl}`);
        console.log(`Generated Unity package manual URL: ${manualUrl}`);
        
        return {
            apiUrl,
            manualUrl,
            packageInfo
        };
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
    private generateLinkFromConfig(typeName: string, config: DocLinkConfig): string {
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

        // Replace placeholder in URL template
        return config.urlTemplate.replace('{typeName}', transformedTypeName);
    }
      /**
     * Create hover content with documentation link using type name
     */
    private createHoverWithDocLink(symbolInfo: SymbolInfo, docLinkInfo?: DocumentationLinkInfo): vscode.Hover {
        const hoverContent = new vscode.MarkdownString();        // Show XML documentation if available (at the top)
        if (symbolInfo.xmlDocs && symbolInfo.xmlDocs.trim().length > 0) {
            console.log(`abc Adding XML docs for symbol: ${symbolInfo.name}, docs is: ${symbolInfo.xmlDocs}`);
            console.log(`abc XML docs length: ${symbolInfo.xmlDocs.length}, trimmed length: ${symbolInfo.xmlDocs.trim().length}`);
            
            // Convert XML docs to Markdown format
            const markdownDocs = xmlToMarkdown(symbolInfo.xmlDocs);
            console.log(`abc Converted to markdown: ${markdownDocs}`);
            
            hoverContent.appendMarkdown(markdownDocs);
            hoverContent.appendMarkdown('\n\n---\n\n'); // Add a separator
        } else {
            console.log(`abc No XML docs found for symbol: ${symbolInfo.name}, xmlDocs value:`, symbolInfo.xmlDocs);
        }
        
        // Only show documentation link information if available
        if (docLinkInfo) {
            // Use the type name for the documentation link text
            const typeName = symbolInfo.type;
            
            // Add package information if available
            if (docLinkInfo.packageInfo) {
                hoverContent.appendMarkdown(`From package \`${docLinkInfo.packageInfo.displayName}\`(${docLinkInfo.packageInfo.name}), version \`${docLinkInfo.packageInfo.version}\`\n\n`);
            }
            
            // Show documentation link using type name as link text
            hoverContent.appendMarkdown(`View docs for [${typeName}](${docLinkInfo.url})`);
            
            // Add package documentation link for Unity packages using consolidated packageLinks
            if (docLinkInfo.packageLinks) {
                const packageDisplayName = docLinkInfo.packageLinks.packageInfo.displayName || docLinkInfo.packageLinks.packageInfo.name;
                hoverContent.appendMarkdown(`\n\nView docs for package [${packageDisplayName}](${docLinkInfo.packageLinks.manualUrl})`);
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
     * The detail field from the document symbol (language server specific)
     * For C# Dev Kit: Contains fully qualified type name
     * For Dot Rush: Content unknown/not documented
     */
    detail?: string;
    
    /** 
     * The extracted XML documentation comments for this symbol.
     * Contains the content of /// comments that appear before the symbol's range,
     * with /// markers and leading whitespace removed.
     */
    xmlDocs?: string;
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
    
    /** URL template with {typeName} placeholder */
    urlTemplate: string;
    
    /** Number of namespace levels to remove from the type name (default: 0 = no removal) */
    namespaceRemoveLevel?: number;
    
    /** Whether to convert the type name to lowercase (default: false) */
    isLowerCase?: boolean;
    
    /** String to replace dots with in the type name (default: no replacement) */
    dotReplacement?: string;
}

/**
 * Information about documentation link generation result.
 * @interface DocumentationLinkInfo
 */
interface DocumentationLinkInfo {
    /** The generated documentation URL */
    url: string;
    
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
    apiUrl: string;
    
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
