import * as fs from 'fs';
import { promisify } from 'util';
import * as nodePath from 'path';
import * as path from 'path';

/**
 * Result of parsing a Unity stack trace line for source location
 */
export interface StackTraceSourceLocation {
    /** Start index of the source location part (file path + line number) */
    startIndex: number;
    /** End index of the source location part (file path + line number) */
    endIndex: number;
    /** The extracted file path */
    filePath: string;
    /** The extracted line number */
    lineNumber: number;
}

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
 * Parses a Unity Test Runner stack trace line to identify the source location part.
 * Supports stack trace formats from Windows, macOS, and Linux platforms.
 * 
 * Expected formats:
 * - Windows: "at Something.Yall.hallo.Huma.YallTest.AnotherMethod () [0x00001] in F:\projects\unity\TestUnityCode\Assets\Scripts\Editor\YallTest.cs:32"
 * - macOS: "at Something.Yall.hallo.Huma.YallTest.AnotherMethod () [0x00001] in /Users/user/projects/unity/TestUnityCode/Assets/Scripts/Editor/YallTest.cs:32"
 * - Linux: "at Something.Yall.hallo.Huma.YallTest.AnotherMethod () [0x00001] in /home/user/projects/unity/TestUnityCode/Assets/Scripts/Editor/YallTest.cs:32"
 * 
 * @param stackTraceLine A single line from Unity Test Runner stack trace
 * @returns StackTraceSourceLocation object with indices and parsed data, or null if no source location found
 */
export function parseUnityTestStackTraceSourceLocation(stackTraceLine: string): StackTraceSourceLocation | null {
    // Unity stack trace pattern: "at ClassName.Method () [0x00001] in FilePath:LineNumber"
    // The source location part is "FilePath:LineNumber" after " in "
    
    const inKeyword = ' in ';
    const inIndex = stackTraceLine.lastIndexOf(inKeyword);
    
    if (inIndex === -1) {
        return null;
    }
    
    // Start of source location is after " in "
    const sourceLocationStart = inIndex + inKeyword.length;
    
    // Find the last colon that separates file path from line number
    // Trim whitespace to handle trailing spaces
    const remainingText = stackTraceLine.substring(sourceLocationStart).trim();
    const colonMatch = remainingText.match(/^(.+):(\d+)$/);
    
    if (!colonMatch) {
        return null;
    }
    
    const filePath = colonMatch[1];
    const lineNumber = parseInt(colonMatch[2], 10);
    
    // Validate that this looks like a valid file path
    // Should end with common code file extensions
    if (!filePath.match(/\.(cs|js|ts|cpp|c|h|hpp)$/i)) {
        return null;
    }
    
    // Source location ends at the end of the trimmed text
    const sourceLocationEnd = sourceLocationStart + remainingText.length;
    
    return {
        startIndex: sourceLocationStart,
        endIndex: sourceLocationEnd,
        filePath,
        lineNumber
    };
}

/**
 * Process Unity test stack trace to make file paths clickable in VS Code
 * Converts absolute paths to relative paths and formats as markdown links
 * @param stackTrace The Unity stack trace string
 * @param projectPath The Unity project path
 * @returns The processed stack trace with clickable file links
 */
export async function processTestStackTraceToMarkdown(stackTrace: string, projectPath: string): Promise<string> {
    if (!stackTrace || !stackTrace.trim()) {
        return '';
    }

    // If no project path is available, still try to process the stack trace
    // by extracting file paths and creating clickable links
    if (!projectPath || !projectPath.trim()) {
        return processStackTraceWithoutProjectPath(stackTrace);
    }

    // Process each line of the stack trace
    const lines = stackTrace.split('\n');
    const processedLines: string[] = [];
    
    for (const line of lines) {
        const sourceLocation = parseUnityTestStackTraceSourceLocation(line);
        
        if (sourceLocation) {
            try {
                let processedPath = sourceLocation.filePath;
                
                // Convert absolute path to relative if it's within the project
                if (path.isAbsolute(sourceLocation.filePath)) {
                    const normalizedFilePath = await normalizePath(sourceLocation.filePath);
                    const normalizedProjectPath = await normalizePath(projectPath);
                    
                    if (normalizedFilePath.startsWith(normalizedProjectPath)) {
                        processedPath = path.relative(normalizedProjectPath, normalizedFilePath);
                        // Ensure forward slashes for consistency
                        processedPath = processedPath.replace(/\\/g, '/');
                    }
                }
                
                // Create VS Code markdown link format: [text](file:///absolute/path#line)
                const absolutePath = path.isAbsolute(sourceLocation.filePath) ? sourceLocation.filePath : path.join(projectPath, sourceLocation.filePath);
                const normalizedAbsolutePath = await normalizePath(absolutePath);
                const markdownLink = `[${processedPath}:${sourceLocation.lineNumber}](file:///${normalizedAbsolutePath.replace(/\\/g, '/')}#${sourceLocation.lineNumber})`;
                
                // Replace the source location part with the markdown link
                const beforeSourceLocation = line.substring(0, sourceLocation.startIndex);
                const afterSourceLocation = line.substring(sourceLocation.endIndex);
                const processedLine = beforeSourceLocation + markdownLink + afterSourceLocation;
                processedLines.push(processedLine);
                
            } catch (error) {
                // If path processing fails, keep the original line
                console.warn(`Failed to process stack trace path: ${sourceLocation.filePath}`, error);
                processedLines.push(line);
            }
        } else {
            // No source location found, keep the original line
            processedLines.push(line);
        }
    }
    
    return processedLines.join('\n\n');
}

/**
 * Process Unity test stack trace to markdown without project path
 * Creates clickable links using absolute paths
 * @param stackTrace The stack trace string to process
 * @returns Promise<string> The processed stack trace with clickable links
 */
function processStackTraceWithoutProjectPath(stackTrace: string): string {
    const lines = stackTrace.split('\n');
    const processedLines: string[] = [];

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) {
            processedLines.push(line);
            continue;
        }

        const sourceLocation = parseUnityTestStackTraceSourceLocation(trimmedLine);
        if (sourceLocation) {
            const { filePath, lineNumber } = sourceLocation;
            // Create VS Code link using absolute path
            const vsCodeLink = `[${path.basename(filePath)}:${lineNumber}](file:///${filePath.replace(/\\/g, '/')}#${lineNumber})`;
            const processedLine = trimmedLine.replace(
                `in ${filePath}:${lineNumber}`,
                `in ${vsCodeLink}`
            );
            processedLines.push(processedLine);
        } else {
            processedLines.push(line);
        }
    }

    return processedLines.join('\n\n');
}