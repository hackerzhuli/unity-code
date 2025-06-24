import yargsParser from 'yargs-parser';
import * as fs from 'fs';
import { promisify } from 'util';
import * as nodePath from 'path'

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
 * Normalize a path, if the path doesn't exist on file system, then the original will be returned (it will not be normalized)
 * @param path The path to normalize
 * @returns The normalized path, if file exists, same file always return the same result
 */
export async function normalizePath(path: string): Promise<string> {
    try {
        // calls the native version to get the REAL path
        const realpath = promisify(fs.realpath.native);
        return await realpath(path);
    } catch (_error) {
        return path;
    }
}

/**
 * Checks if a given file or directory path is located inside a specified parent directory.
 * Both must exist on file system, otherwise return false.
 * @param {string} dirPath The path to the potential parent directory.
 * @param {string} path The path to the file or directory to check for containment.
 * @returns {Promise<boolean>} A promise that resolves to true if the item is inside the parent directory, false otherwise.
 */
export async function isInsideDirectory(dirPath: string, path: string): Promise<boolean> {
    // check both exist on file system
    const access = promisify(fs.access);
    try {
        await access(dirPath, fs.constants.F_OK);
        await access(path, fs.constants.F_OK);
    } catch (_error) {
        return false;
    }

    // Get real paths to handle symbolic links and normalize paths
    const normalizedDirPath = await normalizePath(dirPath);
    const normalizedPath = await normalizePath(path);
    
    // Check if the path starts with the directory path
    return normalizedPath.startsWith(normalizedDirPath) && normalizedPath.length > normalizedDirPath.length && (normalizedPath[normalizedDirPath.length] === nodePath.sep) ;
}