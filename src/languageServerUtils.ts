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
    CSharpDevKit = 'CSharpDevKit',
    Unknown = 'Unknown'
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
            type: LanguageServerType.Unknown,
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
    } else if (hasDetailFields) {
        detectedType = LanguageServerType.CSharpDevKit;
    } else {
        detectedType = LanguageServerType.Unknown;
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
 * Determines if a symbol is definitely a type based on language server information.
 * This provides more reliable type detection than the basic isTypeSymbol function.
 * 
 * @param symbol The document symbol to check
 * @param languageServerInfo Information about the detected language server
 * @returns True if the symbol is definitely a type, false otherwise
 */
export function isDefinitiveTypeSymbol(symbol: vscode.DocumentSymbol, languageServerInfo: LanguageServerInfo): boolean {
    // For unknown language servers, fall back to basic detection
    if (languageServerInfo.type === LanguageServerType.Unknown) {
        // Default to C# Dev Kit behavior as specified
        return isTypeSymbol(symbol);
    }
    
    // For C# Dev Kit, we can be more confident in symbol kinds
    if (languageServerInfo.type === LanguageServerType.CSharpDevKit) {
        return isTypeSymbol(symbol);
    }
    
    // For DotRush, we need to be more careful as it might have different symbol reporting
    if (languageServerInfo.type === LanguageServerType.DotRush) {
        return isTypeSymbol(symbol);
    }
    
    // Fallback to basic detection
    return isTypeSymbol(symbol);
}