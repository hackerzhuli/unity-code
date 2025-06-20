import * as vscode from 'vscode';

/**
 * Hover provider that adds documentation links to C# symbols
 */
export class CSharpDocHoverProvider implements vscode.HoverProvider {
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
            }

            // Generate documentation link based on symbol origin
            const docLink = await this.generateDocumentationLink(symbolInfo);
            if (!docLink) {
                return undefined; // No documentation link available
            }

            // Create hover content with symbol info and documentation link
            return this.createHoverWithDocLink(symbolInfo, docLink);

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
            
            let symbolInfo: SymbolInfo | undefined;
            
            if(definition.range.isEmpty){
                console.log('Definition range is empty, trying fallback to single top-level type.');
                // Fallback: if range is empty, try to find a single top-level type in the file
                symbolInfo = await this.getSymbolInfoForEmptyRange(definitionDocument, word);
            } else {
                // Get detailed symbol information using document symbol provider
                symbolInfo = await this.getSymbolInfoFromPosition(definitionDocument, definition.range.start);
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
    }

    /**
     * Checks if a symbol represents a type (class, interface, struct, or enum).
     * 
     * @param symbol The document symbol to check
     * @returns True if the symbol is a type, false otherwise
     */
    private isTypeSymbol(symbol: vscode.DocumentSymbol): boolean {
        return symbol.kind === vscode.SymbolKind.Class ||
               symbol.kind === vscode.SymbolKind.Interface ||
               symbol.kind === vscode.SymbolKind.Struct ||
               symbol.kind === vscode.SymbolKind.Enum;
    }

    /**
     * Find the single top-level type in the symbol hierarchy.
     * 
     * Returns SymbolInfo for the top-level type if there is exactly one,
     * otherwise returns undefined if there are multiple or no top-level types.
     * 
     * @param symbols The document symbols to search through
     * @returns SymbolInfo for the single top-level type, or undefined
     */
    private findTopLevelType(symbols: vscode.DocumentSymbol[]): SymbolInfo | undefined {
        const topLevelTypes: vscode.DocumentSymbol[] = [];
        let topLevelTypePath = "";

        const searchSymbols = (symbolList: vscode.DocumentSymbol[], path: string, isInsideType: boolean = false) => {
            for (const symbol of symbolList) {
                const isType = this.isTypeSymbol(symbol);
                
                if (isType && !isInsideType) {
                    // This is a top-level type (not nested inside another type)
                    topLevelTypes.push(symbol);
                    topLevelTypePath = combinePath(path, symbol.name);
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
            return {
                name: typeSymbol.name,
                type: topLevelTypePath,
                kind: typeSymbol.kind
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
            const topLevelType = this.findTopLevelType(symbols);
            
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

            return this.findSymbolAtPosition(symbols, position, "", false);
        } catch (error) {
            console.error('Error getting detailed symbol info:', error);
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
    ): SymbolInfo | undefined {
        for (const symbol of symbols) {
            // Check if position is within this symbol's range
            if (symbol.range.contains(position)) {
                // If this symbol has children, search recursively for a more specific match
                if (symbol.children && symbol.children.length > 0) {
                    if (!isTopLevelTypeFound){
                        topLevelTypePath = combinePath(topLevelTypePath, symbol.name);
                        if(this.isTypeSymbol(symbol)){
                            isTopLevelTypeFound = true;
                        }
                    }
                    const childResult = this.findSymbolAtPosition(symbol.children, position, topLevelTypePath, isTopLevelTypeFound);
                    if (childResult) {
                        // Found a more specific symbol within this one
                        return childResult;
                    }
                }
                
                return {
                    name: symbol.name,
                    type: topLevelTypePath,
                    kind: symbol.kind
                };
            }
        }
        
        return undefined;
    }

    /**
     * Checks if a file path is from any package in PackageCache
     * @param filePath The file path to check
     * @returns True if the file path is from a package, false otherwise
     */
    private isPackagePath(filePath: string): boolean {
        // Check if the path contains Library/PackageCache directory
        return filePath.includes('Library/PackageCache') || filePath.includes('Library\\PackageCache');
    }

    /**
     * Extract package information from a file path
     * @param filePath The file path to extract package info from
     * @returns Package information or undefined if not a valid package
     */
    private async extractPackageInfo(filePath: string): Promise<{ name: string, version: string } | undefined> {
        try {
            // Match pattern like: Library/PackageCache/com.unity.localization@f2647f7408bd or Library\PackageCache\com.unity.localization@f2647f7408bd
            const packageMatch = filePath.match(/Library[/\\]PackageCache[/\\]([^/\\@]+)@([^/\\]+)/);
            if (packageMatch && packageMatch.length >= 3) {
                const packageName = packageMatch[1];
                const packageHash = packageMatch[2];
                
                // Construct path to package.json
                const packageCacheIndex = filePath.indexOf('PackageCache');
                const packageStart = filePath.indexOf(packageName, packageCacheIndex);
                const packageDir = filePath.substring(0, packageStart + packageName.length + 1 + packageHash.length);
                const packageJsonPath = packageDir + '/package.json';
                
                // Try to read the actual version from package.json
                try {
                    const packageJsonUri = vscode.Uri.file(packageJsonPath);
                    const packageJsonContent = await vscode.workspace.fs.readFile(packageJsonUri);
                    const packageJson = JSON.parse(packageJsonContent.toString());
                    
                    return {
                        name: packageName,
                        version: packageJson.version || packageHash // Fallback to hash if version not found
                    };
                } catch (packageJsonError) {
                    console.warn(`Could not read package.json for ${packageName}, using hash as version:`, packageJsonError);
                    // Fallback to using the hash as version
                    return {
                        name: packageName,
                        version: packageHash
                    };
                }
            }
            return undefined;
        } catch (error) {
            console.error('Error extracting package info:', error);
            return undefined;
        }
    }

    /**
     * Generate documentation link based on symbol type using configuration
     */
    private async generateDocumentationLink(symbolInfo: SymbolInfo): Promise<string | undefined> {
        // Check if this is a package symbol from PackageCache
         if (symbolInfo.definitionLocation && this.isPackagePath(symbolInfo.definitionLocation.uri.fsPath)) {
             const packageInfo = await this.extractPackageInfo(symbolInfo.definitionLocation.uri.fsPath);
             if (packageInfo) {
                 const packageUrl = this.generatePackageDocumentationLink(symbolInfo.type, packageInfo);
                 if (packageUrl) {
                     return packageUrl;
                 }
                 // If no package-specific URL generated, fall through to standard documentation
             }
         }

        // Fall back to standard documentation link
        const config = this.findMatchingConfig(symbolInfo.type);
        if (!config) {
            return undefined;
        }

        return this.generateLinkFromConfig(symbolInfo.type, config);
    }

    /**
     * Generate package-specific documentation link based on package type
     * @param typeName The fully qualified type name
     * @param packageInfo The package information
     * @returns The package documentation URL or undefined if not supported
     */
    private generatePackageDocumentationLink(typeName: string, packageInfo: { name: string, version: string }): string | undefined {
        // Handle Unity packages
        if (packageInfo.name.startsWith('com.unity')) {
            // Skip package-specific URL if this package is in the exclusion list
            if (this.unityPackageExclusions.includes(packageInfo.name)) {
                return undefined; // Fall back to standard documentation
            }
            return this.generateUnityPackageLink(typeName, packageInfo);
        }
        
        // Handle other popular packages (can be extended in the future)
        // Example: Newtonsoft.Json, NUnit, etc.
        // For now, return undefined to fall back to standard documentation
        
        console.log(`No specific documentation handler for package: ${packageInfo.name}`);
        return undefined;
    }

    /**
     * Generate Unity package documentation link
     * @param typeName The fully qualified type name
     * @param packageInfo The Unity package information
     * @returns The Unity package documentation URL
     */
    private generateUnityPackageLink(typeName: string, packageInfo: { name: string, version: string }): string {
        // Extract semantic version from the version string (remove hash/commit if present)
        let cleanVersion = packageInfo.version;
        
        // Try to extract semantic version pattern (e.g., "1.5.2" from "1.5.2-preview.1" or hash)
        const versionMatch = packageInfo.version.match(/^(\d+\.\d+(?:\.\d+)?)/); 
        if (versionMatch) {
            cleanVersion = versionMatch[1];
        } else {
            // If no semantic version found, try to read from package.json
            // For now, use the raw version as fallback
            console.warn(`Could not extract semantic version from: ${packageInfo.version}`);
        }
        
        // Type name should already be in the correct format for Unity package docs
        const transformedTypeName = typeName;
        
        // Generate Unity package documentation URL
        // Format: https://docs.unity3d.com/Packages/com.unity.localization@1.5/api/UnityEngine.Localization.Settings.AsynchronousBehaviour.html
        const packageUrl = `https://docs.unity3d.com/Packages/${packageInfo.name}@${cleanVersion}/api/${transformedTypeName}.html`;
        
        console.log(`Generated Unity package documentation URL: ${packageUrl}`);
        return packageUrl;
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
    private createHoverWithDocLink(symbolInfo: SymbolInfo, docLink: string): vscode.Hover {
        const hoverContent = new vscode.MarkdownString();
        
        // Use the type name for the documentation link text
        const typeName = symbolInfo.type;
        
        // Show only one line with the documentation link using type name as link text
        hoverContent.appendMarkdown(`View docs for [${typeName}](${docLink})`);
        
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
     */
    type: string;
    
    /** The VS Code symbol kind (Class, Method, Property, etc.) */
    kind: vscode.SymbolKind;
    
    /** The location where this symbol is defined (used for Unity package detection) */
    definitionLocation?: vscode.Location;
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
