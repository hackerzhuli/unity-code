import * as fs from 'fs';
import * as vscode from 'vscode';

/**
 * Result interface for decompiled file analysis
 */
export interface DecompiledFileInfo {
    isDecompiled: boolean;
    assemblyName?: string;
    assemblyFileName?: string;
}

/**
 * Helper class to analyze decompiled source files
 * 
 * This class determines if a source file is decompiled by analyzing ONLY the first line
 * of the file. It looks for assembly information patterns commonly used by C# development
 * extensions when generating decompiled source files.
 */
export class DecompiledFileHelper {
    /**
     * Regular expression to match assembly information in the first line
     * Matches patterns like: #region Assembly Unity.InputSystem, Version=1.14.0.0, Culture=neutral, PublicKeyToken=null
     * Captures valid C# assembly names following .NET naming conventions:
     * - Must start with letter or underscore
     * - Can contain letters, digits, underscores, and dots (for namespaces)
     * - Case-insensitive matching
     */
    private static readonly ASSEMBLY_REGEX = /assembly\s+([a-zA-Z_][a-zA-Z0-9_.]*)/i;

    /**
     * Analyzes a file path to determine if it's a decompiled file
     * @param filePath The file path to analyze
     * @returns Promise<DecompiledFileInfo> Information about the decompiled file
     */
    public static async analyzeFile(filePath: string): Promise<DecompiledFileInfo> {
        try {
            // Read only the first line to optimize performance
            const fileHandle = await fs.promises.open(filePath, 'r');
            const buffer = Buffer.alloc(1024); // Allocate buffer for first line
            const { bytesRead } = await fileHandle.read(buffer, 0, 1024, 0);
            await fileHandle.close();
            
            const content = buffer.subarray(0, bytesRead).toString('utf8');
            const firstLine = content.split('\n')[0];
            
            return this.analyzeContent(firstLine);
        } catch (_error) {
            // If we can't read the file, assume it's not decompiled
            return { isDecompiled: false };
        }
    }

    /**
     * Analyzes a VS Code URI to determine if it's a decompiled file
     * @param uri The VS Code URI to analyze
     * @returns Promise<DecompiledFileInfo> Information about the decompiled file
     */
    public static async analyzeUri(uri: vscode.Uri): Promise<DecompiledFileInfo> {
        return this.analyzeFile(uri.fsPath);
    }

    /**
     * Analyzes file content to determine if it's from a decompiled file
     * @param content The file content to analyze
     * @returns DecompiledFileInfo Information about the decompiled file
     */
    public static analyzeContent(content: string): DecompiledFileInfo {
        if (!content || content.trim().length === 0) {
            return { isDecompiled: false };
        }

        // Get the first line
        const firstLine = content.split('\n')[0].trim();
        
        // Check if it matches the assembly pattern
        const match = firstLine.match(this.ASSEMBLY_REGEX);
        
        if (match && match[1]) {
            const assemblyName = match[1];
            const assemblyFileName = assemblyName + '.dll';
            
            return {
                isDecompiled: true,
                assemblyName,
                assemblyFileName
            };
        }

        return { isDecompiled: false };
    }
}