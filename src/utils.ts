import * as fs from 'fs';
import { promisify } from 'util';
import * as nodePath from 'path';


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
 * Checks if a given file or directory path is located inside a specified parent directory(if path is the directory itself, it will return false).
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

/**
 * Extracts the major.minor version from a version string.
 * Supports both semantic versioning (e.g., "1.2.3", "2.0.0-beta.1") and Unity's version format (e.g., "6000.0.51f1", "2023.3.15f1").
 * @param version The version string to parse
 * @returns The major.minor version (e.g., "1.2", "6000.0") or undefined if the format is invalid
 */
export function extractMajorMinorVersion(version: string): string | undefined {
    if (!version || typeof version !== 'string') {
        return undefined;
    }

    // Match major.minor pattern at the start of the version string
    // This handles both semantic versions (1.2.3) and Unity versions (6000.0.51f1)
    const versionMatch = version.match(/^(\d+\.\d+)/);
    
    return versionMatch ? versionMatch[1] : undefined;
}