/**
 * Utility functions that don't depend on VS Code API
 * These can be safely imported and tested without VS Code environment
 */

/**
 * Check if a file path is inside the Assets folder
 * @param filePath The file path to check
 * @returns boolean True if the file is in the Assets folder
 */
export function isInAssetsFolder(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');
    return normalizedPath.includes('/Assets/') || normalizedPath.endsWith('/Assets');
}