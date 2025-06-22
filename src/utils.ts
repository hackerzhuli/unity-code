/**
 * Utility functions that don't depend on VS Code API
 * These can be safely imported and tested without VS Code environment
 */

import yargsParser from 'yargs-parser';

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
 * Extracts the project path from Unity command line arguments
 * @param command The full command line string
 * @returns The project path if found, undefined otherwise
 */
export function extractProjectPath(command: string): string | undefined {
    if (!command) {
        return undefined;
    }
    
    try {
        // Parse command line arguments using yargs-parser
        const argv = yargsParser(command, {
            configuration: {
                'short-option-groups': false,  // Prevent -projectPath from being split into individual chars
                'camel-case-expansion': false,
                'strip-aliased': false,
                'strip-dashed': false
            }
        });
        
        // Look for project path in various Unity option formats
        // Unity uses options like -projectPath, -createProject, etc.
        // Check both camelCase and lowercase variants
        if (argv.projectPath) {
            const projectPath = String(argv.projectPath);
            console.log(`UnityCode: Extracted project path from 'projectPath': ${projectPath}`);
            return projectPath;
        }
        
        if (argv.projectpath) {
            const projectPath = String(argv.projectpath);
            console.log(`UnityCode: Extracted project path from 'projectpath': ${projectPath}`);
            return projectPath;
        }
        
        if (argv.createProject) {
            const projectPath = String(argv.createProject);
            console.log(`UnityCode: Extracted project path from 'createProject': ${projectPath}`);
            return projectPath;
        }
        
        if (argv.createproject) {
            const projectPath = String(argv.createproject);
            console.log(`UnityCode: Extracted project path from 'createproject': ${projectPath}`);
            return projectPath;
        }
        
        console.log(`UnityCode: No project path found in command: ${command}`);
        return undefined;
        
    } catch (error) {
        console.error(`UnityCode: Error parsing command line arguments: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}