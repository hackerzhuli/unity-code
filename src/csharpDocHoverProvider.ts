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
     * Check if type is from Unity
     */
    private isUnityType(typeName: string): boolean {
        return typeName.startsWith('UnityEngine.') || typeName.startsWith('UnityEditor.');
    }

    /**
     * Check if type is from .NET
     */
    private isDotNetType(typeName: string): boolean {
        return typeName.startsWith('System.');
    }

    /**
     * Generate documentation link based on symbol type
     */
    private generateDocumentationLink(symbolInfo: SymbolInfo): string | undefined {
        // Check if the type is from Unity or .NET
        if (this.isUnityType(symbolInfo.type)) {
            return this.generateUnityDocLink(symbolInfo.type);
        } else if (this.isDotNetType(symbolInfo.type)) {
            return this.generateDotNetDocLink(symbolInfo.type);
        }
        return undefined;
    }

    /**
     * Generate Unity documentation link
     */
    private generateUnityDocLink(typeName: string): string {
        // Unity documentation URL pattern
        const baseUrl = 'https://docs.unity3d.com/ScriptReference';
        let className = typeName;
        
        // Remove Unity namespace prefixes in the correct order
        if (className.startsWith('UnityEngine.UI.')) {
            className = className.replace(/^UnityEngine\.UI\./, '');
        } else if (className.startsWith('UnityEngine.')) {
            className = className.replace(/^UnityEngine\./, '');
        } else if (className.startsWith('UnityEditor.')) {
            className = className.replace(/^UnityEditor\./, '');
        }
        
        // Remove any trailing slashes or backslashes
        className = className.replace(/[/\\]+$/, '');
        
        return `${baseUrl}/${className}.html`;
    }

    /**
     * Generate .NET documentation link
     */
    private generateDotNetDocLink(typeName: string): string {
        // Microsoft .NET documentation URL pattern
        const baseUrl = 'https://docs.microsoft.com/en-us/dotnet/api';
        const fullyQualifiedName = typeName.toLowerCase();
        return `${baseUrl}/${fullyQualifiedName}`;
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
