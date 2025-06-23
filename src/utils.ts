/**
 * Utility functions that don't depend on VS Code API
 * These can be safely imported and tested without VS Code environment
 */

import yargsParser from 'yargs-parser';
import * as fs from 'fs';
import { promisify } from 'util';

/**
 * Console log with automatic truncation for long messages
 * Limits the entire log message to a maximum length to prevent console spam
 * @param message The message to log (can contain template literals)
 * @param maxLength Maximum length of the entire log message (default: 200)
 */
export function logWithLimit(message: string, maxLength: number = 200): void {
    if (message.length <= maxLength) {
        console.log(message);
    } else {
        const truncated = `${message.substring(0, maxLength)}... (truncated, original length: ${message.length})`;
        console.log(truncated);
    }
}

/**
 * Check if a file path is inside the Assets folder of a specific workspace
 * @param filePath The file path to check
 * @param workspacePath The workspace root path (optional for backward compatibility)
 * @returns boolean True if the file is in the Assets folder
 */
export function isInAssetsFolder(filePath: string, workspacePath?: string): boolean {
    const normalizedFilePath = filePath.replace(/\\/g, '/');
    
    if (workspacePath) {
        const normalizedWorkspacePath = workspacePath.replace(/\\/g, '/');
        const assetsPath = normalizedWorkspacePath + '/Assets';
        
        // Check if the file is inside the Assets folder of the specific workspace
        return normalizedFilePath.startsWith(assetsPath + '/') || normalizedFilePath === assetsPath;
    }
    
    // Fallback to old behavior for backward compatibility
    return normalizedFilePath.includes('/Assets/') || normalizedFilePath.endsWith('/Assets');
}

/**
 * Generic function to extract project path from command line arguments
 * @param command The full command line string
 * @param optionKeys Array of option keys to search for, in priority order
 * @param contextName Name for logging context (e.g., 'Unity', 'Hot Reload')
 * @returns The project path if found, undefined otherwise
 */
export function extractProjectPathFromCommand(
    command: string,
    optionKeys: string[],
    contextName: string
): string | undefined {
    if (!command) {
        return undefined;
    }
    
    try {
        // Parse command line arguments using yargs-parser
        const argv = yargsParser(command, {
            configuration: {
                'short-option-groups': false,  // Prevent options from being split into individual chars
                'camel-case-expansion': false,
                'strip-aliased': false,
                'strip-dashed': false
            }
        });
        
        // Helper function to find case-insensitive key in argv
        const findCaseInsensitiveKey = (targetKey: string): string | undefined => {
            // First try exact match
            if (argv[targetKey]) {
                return targetKey;
            }
            
            // Then try case-insensitive search
            const lowerTargetKey = targetKey.toLowerCase();
            for (const key of Object.keys(argv)) {
                if (key.toLowerCase() === lowerTargetKey) {
                    return key;
                }
            }
            return undefined;
        };
        
        // Search for project path in order of priority
        for (const optionKey of optionKeys) {
            const foundKey = findCaseInsensitiveKey(optionKey);
            if (foundKey && argv[foundKey]) {
                const value = argv[foundKey];
                // Ensure value is a non-empty string (not just a boolean flag)
                if (typeof value === 'string' && value.trim() !== '') {
                    const projectPath = String(value);
                    console.log(`UnityCode: Extracted ${contextName} project path from '${foundKey}': ${projectPath}`);
                    return projectPath;
                }
            }
        }
        
        console.log(`UnityCode: No ${contextName} project path found in command: ${command}`);
        return undefined;
        
    } catch (error) {
        console.error(`UnityCode: Error parsing ${contextName} command line arguments: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}

/**
 * Checks if two paths match using file system resolution (files must exist, otherwise always don't match)
 * Handles path normalization, case sensitivity, and symbolic links
 * @param path1 First project path to compare
 * @param path2 Second project path to compare
 * @returns True if paths match, false otherwise
 */
export async function pathsMatch(path1: string, path2: string): Promise<boolean> {
    try {
        // Get canonical paths for comparison
        const realpath = promisify(fs.realpath);
        const canonicalPath1 = await realpath(path1);
        const canonicalPath2 = await realpath(path2);
        
        // Normalize paths to lowercase for case-insensitive comparison on Windows
        const normalizedPath1 = canonicalPath1.toLowerCase();
        const normalizedPath2 = canonicalPath2.toLowerCase();
        
        return normalizedPath1 === normalizedPath2;
        
    } catch (_error) {
        // If we can't resolve paths, they don't match
        return false;
    }
}