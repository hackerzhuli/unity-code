/**
 * Utility functions that don't depend on VS Code API
 * These can be safely imported and tested without VS Code environment
 */

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