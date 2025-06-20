import * as vscode from 'vscode';

/**
 * Hover provider that adds documentation links to C# symbols
 */
export class CSharpDocHoverProvider implements vscode.HoverProvider {
    
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
            const docLink = this.generateDocumentationLink(symbolInfo);
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
                        console.log(`Symbol found via definition: ${symbolInfo.fullyQualifiedName}`);
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
            
            let symbolDetails: {
                symbolKind: vscode.SymbolKind;
                containerName?: string;
                namespace?: string;
                isMethod: boolean;
                isClass: boolean;
                isProperty: boolean;
                actualSymbolName?: string;
            } | undefined;
            
            if(definition.range.isEmpty){
                console.log('Definition range is empty, trying fallback to single top-level type.');
                // Fallback: if range is empty, try to find a single top-level type in the file
                symbolDetails = await this.getSymbolInfoForEmptyRange(definitionDocument, word);
            } else {
                // Get detailed symbol information using document symbol provider
                symbolDetails = await this.getDetailedSymbolInfo(definitionDocument, definition.range.start);
            }
            
            // Use namespace from symbol hierarchy only - no fallbacks for reliability
            const effectiveNamespace = symbolDetails?.namespace;
            
            // Determine if it's Unity or .NET based on namespace only
            const isUnity = this.isUnityDefinition(effectiveNamespace);
            const isDotNet = this.isDotNetDefinition(effectiveNamespace);
            
            // Use actual symbol name from definition if available, otherwise fall back to original word
            const actualName = symbolDetails?.actualSymbolName || word;
            
            // Construct fully qualified name using only reliable symbol-based namespace
            let fullyQualifiedName = actualName;
            if (effectiveNamespace) {
                fullyQualifiedName = `${effectiveNamespace}.${actualName}`;
            }
            // No fallback namespace guessing - use only what we can reliably determine
            
            // If we have a container name and it's a method, update the fully qualified name
            if (symbolDetails?.containerName && symbolDetails.isMethod) {
                const containerFullName = effectiveNamespace ? `${effectiveNamespace}.${symbolDetails.containerName}` : symbolDetails.containerName;
                fullyQualifiedName = `${containerFullName}.${actualName}`;
            }
            
            return {
                name: actualName,
                fullyQualifiedName,
                namespace: effectiveNamespace,
                isUnity,
                isDotNet,
                symbolKind: symbolDetails?.symbolKind,
                containerName: symbolDetails?.containerName,
                isMethod: symbolDetails?.isMethod,
                isClass: symbolDetails?.isClass,
                isProperty: symbolDetails?.isProperty
            };
            
        } catch (error) {
            console.error('Error analyzing definition:', error);
            return undefined;
        }
    }

    /**
     * Find the namespace containing a specific symbol
     */
    private findNamespaceForSymbol(symbols: vscode.DocumentSymbol[], targetSymbol: vscode.DocumentSymbol): string | undefined {
        const searchForSymbol = (symbolList: vscode.DocumentSymbol[], namespacePath: string[] = []): string | undefined => {
            for (const symbol of symbolList) {
                if (symbol === targetSymbol) {
                    // Found the target symbol, return the current namespace path
                    return namespacePath.length > 0 ? namespacePath.join('.') : undefined;
                }
                
                if (symbol.children && symbol.children.length > 0) {
                    // If this is a namespace, add it to the path
                    const newPath = symbol.kind === vscode.SymbolKind.Namespace 
                        ? [...namespacePath, symbol.name] 
                        : namespacePath;
                    
                    // Recursively search children
                    const result = searchForSymbol(symbol.children, newPath);
                    if (result !== undefined) {
                        return result;
                    }
                }
            }
            return undefined;
        };
        
        return searchForSymbol(symbols);
    }

    /**
     * Find top-level types (non-nested types) in the symbol hierarchy
     */
    private findTopLevelTypes(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
        const topLevelTypes: vscode.DocumentSymbol[] = [];
        
        const searchSymbols = (symbolList: vscode.DocumentSymbol[], isInsideType: boolean = false) => {
            for (const symbol of symbolList) {
                const isTypeSymbol = symbol.kind === vscode.SymbolKind.Class ||
                                   symbol.kind === vscode.SymbolKind.Interface ||
                                   symbol.kind === vscode.SymbolKind.Struct ||
                                   symbol.kind === vscode.SymbolKind.Enum;
                
                if (isTypeSymbol && !isInsideType) {
                    // This is a top-level type (not nested inside another type)
                    topLevelTypes.push(symbol);
                }
                
                // Recursively search children
                if (symbol.children && symbol.children.length > 0) {
                    // If this symbol is a type, mark that we're now inside a type
                    searchSymbols(symbol.children, isInsideType || isTypeSymbol);
                }
            }
        };
        
        searchSymbols(symbols);
        return topLevelTypes;
    }

    /**
     * Get symbol information for empty range by checking if file contains only one top-level type
     */
    private async getSymbolInfoForEmptyRange(document: vscode.TextDocument, _word: string): Promise<{
        symbolKind: vscode.SymbolKind;
        containerName?: string;
        namespace?: string;
        isMethod: boolean;
        isClass: boolean;
        isProperty: boolean;
        actualSymbolName?: string;
    } | undefined> {
        try {
            // Get document symbols
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );

            if (!symbols || symbols.length === 0) {
                return undefined;
            }

            // Find top-level types (classes, interfaces, structs, enums) - types that are not nested inside other types
             const topLevelTypes = this.findTopLevelTypes(symbols);

            // If there's exactly one top-level type, use it
              if (topLevelTypes.length === 1) {
                  const typeSymbol = topLevelTypes[0];
                  
                  // Find the namespace containing this type by searching the symbol hierarchy
                  const namespace = this.findNamespaceForSymbol(symbols, typeSymbol);
                  
                  return {
                      symbolKind: typeSymbol.kind,
                      containerName: undefined, // This is the top-level type itself
                      namespace,
                      isMethod: false,
                      isClass: typeSymbol.kind === vscode.SymbolKind.Class,
                      isProperty: false,
                      actualSymbolName: typeSymbol.name
                  };
              }

            // If there are multiple top-level types or none, we can't determine which one
            console.log(`Found ${topLevelTypes.length} top-level types, cannot determine symbol for empty range.`);
            return undefined;
            
        } catch (error) {
            console.error('Error getting symbol info for empty range:', error);
            return undefined;
        }
    }

    /**
     * Get detailed symbol information using document symbol provider
     */
    private async getDetailedSymbolInfo(document: vscode.TextDocument, position: vscode.Position): Promise<{
        symbolKind: vscode.SymbolKind;
        containerName?: string;
        namespace?: string;
        isMethod: boolean;
        isClass: boolean;
        isProperty: boolean;
        actualSymbolName?: string;
    } | undefined> {
        try {
            // Get document symbols
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );

            if (!symbols || symbols.length === 0) {
                return undefined;
            }

            // Find the symbol at the given position using only position-based lookup
            const foundSymbol = this.findSymbolAtPositionWithPath(symbols, position);
            if (!foundSymbol) {
                return undefined;
            }

            const { symbol, container, symbolPath } = foundSymbol;
            
            // Extract namespace from symbol path - look for namespace symbols in the hierarchy
            const namespace = this.extractNamespaceFromSymbolPath(symbolPath);
            
            return {
                symbolKind: symbol.kind,
                containerName: container?.name,
                namespace,
                isMethod: symbol.kind === vscode.SymbolKind.Method || symbol.kind === vscode.SymbolKind.Constructor,
                isClass: symbol.kind === vscode.SymbolKind.Class,
                isProperty: symbol.kind === vscode.SymbolKind.Property || symbol.kind === vscode.SymbolKind.Field,
                actualSymbolName: symbol.name
            };
        } catch (error) {
            console.error('Error getting detailed symbol info:', error);
            return undefined;
        }
    }

    /**
     * Find symbol at position and track the full symbol path for namespace extraction
     */
    private findSymbolAtPositionWithPath(
        symbols: vscode.DocumentSymbol[], 
        position: vscode.Position,
        symbolPath: vscode.DocumentSymbol[] = []
    ): { symbol: vscode.DocumentSymbol; container?: vscode.DocumentSymbol; symbolPath: vscode.DocumentSymbol[] } | undefined {
        for (const symbol of symbols) {
            // Check if position is within this symbol's range
            if (symbol.range.contains(position)) {
                const currentPath = [...symbolPath, symbol];
                
                // If this symbol has children, search recursively for a more specific match
                if (symbol.children && symbol.children.length > 0) {
                    const childResult = this.findSymbolAtPositionWithPath(symbol.children, position, currentPath);
                    if (childResult) {
                        // Found a more specific symbol within this one
                        return childResult;
                    }
                }
                
                // If no more specific child found, this symbol is our best match
                const container = symbolPath.length > 0 ? symbolPath[symbolPath.length - 1] : undefined;
                return { symbol, container, symbolPath: currentPath };
            }
        }
        
        return undefined;
    }

    /**
     * Extract namespace from symbol path by finding namespace symbols in the hierarchy
     */
    private extractNamespaceFromSymbolPath(symbolPath: vscode.DocumentSymbol[]): string | undefined {
        // Look for namespace symbols in the path and build the full namespace
        const namespaceSymbols = symbolPath.filter(symbol => symbol.kind === vscode.SymbolKind.Namespace);
        
        if (namespaceSymbols.length === 0) {
            return undefined;
        }
        
        // Join all namespace names to form the full namespace
        return namespaceSymbols.map(ns => ns.name).join('.');
    }

    /**
     * Check if definition is from Unity based on namespace only
     */
    private isUnityDefinition(namespace?: string): boolean {
        if (!namespace) {
            return false;
        }
        
        // Check for Unity-specific namespaces
        return namespace.startsWith('UnityEngine') || namespace.startsWith('UnityEditor');
    }

    /**
     * Check if definition is from .NET based on namespace only
     */
    private isDotNetDefinition(namespace?: string): boolean {
        if (!namespace) {
            return false;
        }
        
        // Check for .NET-specific namespaces
        return namespace.startsWith('System') || namespace.startsWith('Microsoft');
    }

    /**
     * Generate documentation link based on symbol origin
     */
    private generateDocumentationLink(symbolInfo: SymbolInfo): string | undefined {
        // For methods, properties, and fields, we should link to the containing class documentation
        // since most documentation systems organize members under their class pages
        if (symbolInfo.isMethod || symbolInfo.isProperty) {
            if (symbolInfo.containerName) {
                // Create a modified symbolInfo for the container class
                const containerSymbolInfo: SymbolInfo = {
                    ...symbolInfo,
                    name: symbolInfo.containerName,
                    fullyQualifiedName: symbolInfo.namespace ? 
                        `${symbolInfo.namespace}.${symbolInfo.containerName}` : 
                        symbolInfo.containerName,
                    isMethod: false,
                    isClass: true,
                    isProperty: false
                };
                
                if (symbolInfo.isUnity) {
                    return this.generateUnityDocLink(containerSymbolInfo);
                } else if (symbolInfo.isDotNet) {
                    return this.generateDotNetDocLink(containerSymbolInfo);
                }
            }
            // If no container found, fall back to original behavior
        }
        
        // For classes and other symbols, use the original logic
        if (symbolInfo.isUnity) {
            return this.generateUnityDocLink(symbolInfo);
        } else if (symbolInfo.isDotNet) {
            return this.generateDotNetDocLink(symbolInfo);
        }
        return undefined;
    }

    /**
     * Generate Unity documentation link
     */
    private generateUnityDocLink(symbolInfo: SymbolInfo): string {
        // Unity documentation URL pattern
        const baseUrl = 'https://docs.unity3d.com/ScriptReference';
        let className = symbolInfo.fullyQualifiedName;
        
        // Remove Unity namespace prefixes in the correct order
        if (className.startsWith('UnityEngine.UI.')) {
            className = className.replace(/^UnityEngine\.UI\./, '');
        } else if (className.startsWith('UnityEngine.')) {
            className = className.replace(/^UnityEngine\./, '');
        } else if (className.startsWith('UnityEditor.')) {
            className = className.replace(/^UnityEditor\./, '');
        }
        
        // Ensure we have a valid class name
        if (!className || className.startsWith('.')) {
            className = symbolInfo.name;
        }
        
        // Remove any trailing slashes or backslashes
        className = className.replace(/[/\\]+$/, '');
        
        return `${baseUrl}/${className}.html`;
    }

    /**
     * Generate .NET documentation link
     */
    private generateDotNetDocLink(symbolInfo: SymbolInfo): string {
        // Microsoft .NET documentation URL pattern
        const baseUrl = 'https://docs.microsoft.com/en-us/dotnet/api';
        const fullyQualifiedName = symbolInfo.fullyQualifiedName.toLowerCase();
        return `${baseUrl}/${fullyQualifiedName}`;
    }

    /**
     * Create hover content with documentation link using class name
     */
    private createHoverWithDocLink(symbolInfo: SymbolInfo, docLink: string): vscode.Hover {
        const hoverContent = new vscode.MarkdownString();
        
        // Extract class name for documentation link text
        let className = symbolInfo.fullyQualifiedName;
        
        // For methods and other class members, extract the containing class name
        if ((symbolInfo.isMethod || symbolInfo.isProperty) && symbolInfo.containerName) {
            // Remove the member name to get the class name
            const lastDotIndex = symbolInfo.fullyQualifiedName.lastIndexOf('.');
            if (lastDotIndex !== -1) {
                className = symbolInfo.fullyQualifiedName.substring(0, lastDotIndex);
            }
        }
        
        // Show only one line with the documentation link using class name as link text
        hoverContent.appendMarkdown(`View docs for [${className}](${docLink})`);
        
        // Make the markdown trusted to allow links
        hoverContent.isTrusted = true;

        return new vscode.Hover(hoverContent);
    }
}

/**
 * Interface for symbol information
 */
interface SymbolInfo {
    name: string;
    fullyQualifiedName: string;
    namespace?: string; // Optional since we only use reliable symbol-based detection
    isUnity: boolean;
    isDotNet: boolean;
    symbolKind?: vscode.SymbolKind;
    containerName?: string; // For methods, this would be the class name
    isMethod?: boolean;
    isClass?: boolean;
    isProperty?: boolean;
}