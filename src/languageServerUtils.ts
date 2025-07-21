import * as vscode from 'vscode';

/**
 * Utility functions for Dot Rush language server analysis
 * These functions depend on VS Code API and are specific to Dot Rush language server integration
 */

/**
 * Checks if a symbol represents a type (class, interface, struct, or enum).
 * 
 * @param symbol The document symbol to check
 * @returns True if the symbol is a type, false otherwise
 */
export function isTypeSymbol(symbol: vscode.DocumentSymbol): boolean {
    return symbol.kind === vscode.SymbolKind.Class ||
           symbol.kind === vscode.SymbolKind.Interface ||
           symbol.kind === vscode.SymbolKind.Struct ||
           symbol.kind === vscode.SymbolKind.Enum;
}


/**
 * Determines the qualified type name for a symbol using Dot Rush namespace hierarchy
 * @param symbol The document symbol
 * @param constructedPath The path constructed from namespace hierarchy
 * @returns The qualified type name
 */
export function getQualifiedTypeName(symbol: vscode.DocumentSymbol, constructedPath: string): string {
    // For Dot Rush, we build the qualified name by traversing the namespace hierarchy
    //console.log(`Using constructed path for qualified name: ${constructedPath}`);
    return constructedPath;
}

/**
 * Find a symbol by traversing the symbol tree using the given full path.
 * Uses Dot Rush language server symbol structure.
 * 
 * @param symbols The root document symbols to search in
 * @param fullPath The full dotted path to the symbol (e.g., "Namespace.Class.Method")
 * @returns The found symbol or null if not found
 */
export function findSymbolByPath(symbols: vscode.DocumentSymbol[], fullPath: string): vscode.DocumentSymbol | null {
    if (!symbols || symbols.length === 0 || !fullPath) {
        return null;
    }
    
    const pathParts = fullPath.split('.');
    return findSymbolRecursiveDotRush(symbols, pathParts, 0);
}

/**
 * Dot Rush symbol search implementation.
 * Dot Rush creates namespace symbols that can contain dots in their names.
 */
function findSymbolRecursiveDotRush(
    symbols: vscode.DocumentSymbol[], 
    pathParts: string[], 
    currentIndex: number
): vscode.DocumentSymbol | null {
    const targetName = pathParts[currentIndex];
    //console.log(`[DotRush] Looking for symbol: ${targetName} at index ${currentIndex}, available symbols: ${symbols.map(s => `${s.name}(${s.kind})`).join(', ')}`);
    
    for (const symbol of symbols) {
        let symbolNameToMatch = symbol.name;
        
        // For method symbols, extract just the method name before the opening parenthesis
        if (symbol.kind === vscode.SymbolKind.Method) {
            const parenIndex = symbol.name.indexOf('(');
            symbolNameToMatch = parenIndex !== -1 ? symbol.name.substring(0, parenIndex) : symbol.name;
        }
        
        // Check for exact match first
        if (symbolNameToMatch === targetName) {
            //console.log(`[DotRush] Found matching symbol: ${symbol.name} (matched as ${symbolNameToMatch}), kind: ${symbol.kind}, has children: ${symbol.children?.length || 0}`);
            
            // If this is the last part of the path, we found our target
            if (currentIndex === pathParts.length - 1) {
                return symbol;
            }
            
            // Otherwise, continue searching in children
            if (symbol.children && symbol.children.length > 0) {
                const result = findSymbolRecursiveDotRush(symbol.children, pathParts, currentIndex + 1);
                if (result) {
                    return result;
                }
            }
        }
        
        // DotRush-specific: Handle namespace symbols that contain dots in their names
        // This handles cases like "Name.Space.You.Are" where the namespace contains dots
        if (symbol.kind === vscode.SymbolKind.Namespace && symbolNameToMatch.includes('.') && symbolNameToMatch.startsWith(targetName)) {
            const remainingPath = pathParts.slice(currentIndex).join('.');
            if (remainingPath.startsWith(symbolNameToMatch)) {
                //console.log(`[DotRush] Found namespace symbol with dots: ${symbol.name}, matching start of path: ${remainingPath}`);
                
                // Calculate how many path parts this namespace symbol consumes
                const namespaceParts = symbolNameToMatch.split('.');
                const newIndex = currentIndex + namespaceParts.length;
                
                // If this namespace consumes all remaining path parts, we found our target
                if (newIndex === pathParts.length) {
                    return symbol;
                }
                
                // Otherwise, continue searching in children with the updated index
                if (symbol.children && symbol.children.length > 0 && newIndex < pathParts.length) {
                    const result = findSymbolRecursiveDotRush(symbol.children, pathParts, newIndex);
                    if (result) {
                        return result;
                    }
                }
            }
        }
    }
    
    return null;
}


/**
 * Extracts XML documentation comments from the text document for a given symbol.
 * XML docs appear as lines starting with /// right before the symbol's range.
 * 
 * @param document The text document containing the symbol
 * @param symbol The document symbol to extract XML docs for
 * @returns The extracted XML documentation as a string, or empty string if none found, note that /// will be removed
 */
export function extractXmlDocumentation(document: vscode.TextDocument, symbol: vscode.DocumentSymbol): string {
    if (!document || !symbol || !symbol.range) {
        return '';
    }

    const symbolStartLine = symbol.range.start.line;
    
    // If the symbol is at the very beginning of the document, there can't be any docs above it
    if (symbolStartLine === 0) {
        return '';
    }

    const xmlDocLines: string[] = [];
    
    // Start from the line just before the symbol and work backwards
    for (let lineNumber = symbolStartLine - 1; lineNumber >= 0; lineNumber--) {
        const line = document.lineAt(lineNumber);
        const lineText = line.text;
        
        // Remove leading whitespace
        const trimmedLine = lineText.trim();
        
        // Check if this line is an XML doc comment
        if (trimmedLine.startsWith('///')) {
            // Extract the content after /// (remove the /// and any space after it)
            const docContent = trimmedLine.substring(3);
            // Add to the beginning of the array since we're working backwards
            xmlDocLines.unshift(docContent);
        } else if (trimmedLine.length === 0) {
            // Empty line - continue looking for more XML docs above
            continue;
        } else {
            // Non-XML doc line encountered - stop searching
            break;
        }
    }
    
    // Join all XML doc lines with newlines
    return xmlDocLines.join('\n');
}