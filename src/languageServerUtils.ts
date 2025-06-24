import * as vscode from 'vscode';

/**
 * Utility functions for language server detection and analysis
 * These functions depend on VS Code API and are specific to C# language server integration
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
 * Language server types that can be detected
 */
export enum LanguageServerType {
    DotRush = 'DotRush',
    CSharpDevKit = 'CSharpDevKit'
}

/**
 * Information about detected language server
 */
export interface LanguageServerInfo {
    type: LanguageServerType;
    hasNamespaceSymbols: boolean;
    hasDetailFields: boolean;
    sampleDetails: Array<{ name: string; detail: string }>;
}

/**
 * Analyzes document symbols to detect which C# language server is being used
 * and logs information about the language server based on symbol structure
 * 
 * @param symbols The document symbols to analyze
 * @returns Information about the detected language server
 */
export function detectLanguageServer(symbols: vscode.DocumentSymbol[]): LanguageServerInfo {
    if (symbols.length === 0) {
        return {
            type: LanguageServerType.CSharpDevKit,
            hasNamespaceSymbols: false,
            hasDetailFields: false,
            sampleDetails: []
        };
    }
    
    const hasNamespaceSymbols = symbols.some(s => s.kind === vscode.SymbolKind.Namespace);
    const typeSymbols = symbols.filter(s => isTypeSymbol(s));
    const hasDetailFields = typeSymbols.some(s => s.detail && s.detail.trim().length > 0);
    
    // Collect sample detail fields for debugging
    const sampleDetails = typeSymbols
        .slice(0, 2)
        .filter(s => s.detail && s.detail.trim().length > 0)
        .map(s => ({ name: s.name, detail: s.detail! }));
    
    let detectedType: LanguageServerType;
    if (hasNamespaceSymbols) {
        detectedType = LanguageServerType.DotRush;
    } else {
        // Default to C# Dev Kit when we can't definitively detect DotRush
        detectedType = LanguageServerType.CSharpDevKit;
    }
    
    return {
        type: detectedType,
        hasNamespaceSymbols,
        hasDetailFields,
        sampleDetails
    };
}

/**
 * Logs information about the language server based on symbol structure
 * @param symbols The document symbols to analyze
 */
export function logLanguageServerInfo(symbols: vscode.DocumentSymbol[]): void {
    const info = detectLanguageServer(symbols);
    
    switch (info.type) {
        case LanguageServerType.DotRush:
            console.log('Language server detection: Likely Dot Rush (namespace symbols present)');
            break;
        case LanguageServerType.CSharpDevKit:
            console.log('Language server detection: Likely C# Dev Kit (no namespaces, detail fields present)');
            break;
        default:
            console.log('Language server detection: Unknown (no clear indicators)');
            break;
    }
    
    // Log sample detail fields for debugging
    info.sampleDetails.forEach(sample => {
        console.log(`Sample detail field - ${sample.name}: "${sample.detail}"`);
    });
}

/**
 * Determines the qualified type name for a symbol, preferring detail field when available
 * @param symbol The document symbol
 * @param constructedPath The path constructed from namespace hierarchy
 * @returns The best available qualified type name
 */
export function getQualifiedTypeName(symbol: vscode.DocumentSymbol, constructedPath: string): string {
    // If detail field exists and contains a dot (indicating qualification), prefer it
    // This handles C# Dev Kit which provides fully qualified names in detail
    if (symbol.detail && symbol.detail.includes('.')) {
        console.log(`Using detail field for qualified name: ${symbol.detail}`);
        return symbol.detail;
    }
    
    // Fall back to constructed path (Dot Rush or when detail is not qualified)
    console.log(`Using constructed path for qualified name: ${constructedPath}`);
    return constructedPath;
}

/**
 * Find a symbol by traversing the symbol tree using the given full path.
 * This function uses the provided language server information to optimize the search strategy.
 * 
 * @param symbols The root document symbols to search in
 * @param fullPath The full dotted path to the symbol (e.g., "Namespace.Class.Method")
 * @param languageServerInfo Information about the detected language server
 * @returns The found symbol or null if not found
 */
export function findSymbolByPath(symbols: vscode.DocumentSymbol[], fullPath: string, languageServerInfo: LanguageServerInfo): vscode.DocumentSymbol | null {
    if (!symbols || symbols.length === 0 || !fullPath) {
        return null;
    }
    
    const pathParts = fullPath.split('.');
    
    // Delegate to language server-specific implementation
    switch (languageServerInfo.type) {
        case LanguageServerType.DotRush:
            return findSymbolRecursiveDotRush(symbols, pathParts, 0, languageServerInfo);
        case LanguageServerType.CSharpDevKit:
            return findSymbolRecursiveCSharpDevKit(symbols, pathParts, 0, languageServerInfo, fullPath);
        default:
            return null;
    }
}

/**
 * DotRush-specific symbol search implementation.
 * DotRush creates namespace symbols that can contain dots in their names.
 */
function findSymbolRecursiveDotRush(
    symbols: vscode.DocumentSymbol[], 
    pathParts: string[], 
    currentIndex: number,
    languageServerInfo: LanguageServerInfo
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
                const result = findSymbolRecursiveDotRush(symbol.children, pathParts, currentIndex + 1, languageServerInfo);
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
                    const result = findSymbolRecursiveDotRush(symbol.children, pathParts, newIndex, languageServerInfo);
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
 * C# Dev Kit-specific symbol search implementation.
 * C# Dev Kit doesn't create namespace symbols - types appear at top level with fully qualified names in detail field.
 */
function findSymbolRecursiveCSharpDevKit(
    symbols: vscode.DocumentSymbol[], 
    pathParts: string[], 
    currentIndex: number,
    languageServerInfo: LanguageServerInfo,
    fullTargetPath: string
): vscode.DocumentSymbol | null {
    if (currentIndex >= pathParts.length) {
        return null;
    }
    
    console.log(`[CSharpDevKit] Looking for path: ${fullTargetPath} (from index ${currentIndex}), available symbols: ${symbols.map(s => `${s.name}(${s.kind})`).join(', ')}`);
    
    for (const symbol of symbols) {
        // For type symbols, check if the detail field matches our full target path
        if (isTypeSymbol(symbol)) {
            if(!symbol.detail){
                // this is unexpected, C# dev kit type must have detail field, if not, ignore
                continue;
            }

            console.log(`[CSharpDevKit] Checking type symbol: ${symbol.name}, detail: ${symbol.detail}`);
            
            // C# Dev Kit puts the fully qualified name in the detail field
            if (symbol.detail === fullTargetPath) {
                console.log(`[CSharpDevKit] Found exact match via detail field: ${symbol.name}`);
                return symbol;
            }
            
            // Check if this type is part of our target path (for nested symbols)
            if (fullTargetPath.startsWith(symbol.detail + '.')) {
                console.log(`[CSharpDevKit] Type ${symbol.name} is part of target path, searching children`);
                // Calculate how many path parts this type symbol consumes
                const typePathPartsCount = (symbol.detail.match(/\./g) || []).length + 1;
                const newIndex = currentIndex + typePathPartsCount;
                
                if (symbol.children && symbol.children.length > 0 && newIndex < pathParts.length) {
                    const result = findSymbolRecursiveCSharpDevKit(symbol.children, pathParts, newIndex, languageServerInfo, fullTargetPath);
                    if (result) {
                        return result;
                    }
                }
            }
        }
        
        // For non-type symbols (methods, properties, etc.), match by name
        // Non-type symbols cannot have children, so they're always leaf nodes
        const currentTarget = pathParts[currentIndex];
        if (symbol.name === currentTarget) {
            console.log(`[CSharpDevKit] Found matching symbol: ${symbol.name}, kind: ${symbol.kind}`);
            
            // If this is the last part of the path, we found our target
            if (currentIndex === pathParts.length - 1) {
                return symbol;
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