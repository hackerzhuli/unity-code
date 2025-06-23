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
        // Unity command line options are completely case insensitive
        // We need to check all possible case variations dynamically
        
        // Helper function to find case-insensitive key in argv
        const findCaseInsensitiveKey = (targetKey: string): string | undefined => {
            const lowerTargetKey = targetKey.toLowerCase();
            for (const key of Object.keys(argv)) {
                if (key.toLowerCase() === lowerTargetKey) {
                    return key;
                }
            }
            return undefined;
        };
        
        // Priority 1: projectPath variants (highest priority)
        const projectPathKey = findCaseInsensitiveKey('projectPath');
        if (projectPathKey && argv[projectPathKey]) {
            const projectPath = String(argv[projectPathKey]);
            console.log(`UnityCode: Extracted project path from '${projectPathKey}': ${projectPath}`);
            return projectPath;
        }
        
        // Priority 2: createProject variants (lower priority)
        const createProjectKey = findCaseInsensitiveKey('createProject');
        if (createProjectKey && argv[createProjectKey]) {
            const projectPath = String(argv[createProjectKey]);
            console.log(`UnityCode: Extracted project path from '${createProjectKey}': ${projectPath}`);
            return projectPath;
        }
        
        console.log(`UnityCode: No project path found in command: ${command}`);
        return undefined;
        
    } catch (error) {
        console.error(`UnityCode: Error parsing command line arguments: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}

/**
 * Extracts the project path from Hot Reload for Unity (CodePatcherCLI) command line arguments
 * @param command The full command line string from CodePatcherCLI process
 * @returns The project path if found, undefined otherwise
 */
export function extractHotReloadProjectPath(command: string): string | undefined {
    if (!command) {
        return undefined;
    }
    
    try {
        // Parse command line arguments using yargs-parser
        const argv = yargsParser(command, {
            configuration: {
                'short-option-groups': false,  // Prevent -u from being split
                'camel-case-expansion': false,
                'strip-aliased': false,
                'strip-dashed': false,
            }
        });
        
        // Helper function to find case-insensitive key in argv
        // Windows command line options can be case insensitive, but prioritize exact match
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
        
        // Look for -u option (project path for Hot Reload for Unity)
        const uKey = findCaseInsensitiveKey('u');
        if (uKey && argv[uKey]) {
            const value = argv[uKey];
            // Check if the value is a meaningful string (not just a boolean flag)
            if (typeof value === 'string' && value.trim() !== '') {
                const projectPath = String(value);
                console.log(`UnityCode: Extracted Hot Reload project path from '${uKey}': ${projectPath}`);
                return projectPath;
            }
        }
        
        console.log(`UnityCode: No Hot Reload project path found in command: ${command}`);
        return undefined;
        
    } catch (error) {
        console.error(`UnityCode: Error parsing Hot Reload command line arguments: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
    }
}