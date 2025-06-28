import * as path from 'path';
import { normalizePath } from './utils.js';

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

    // If no project path is available, we can't process the stack trace
    if (!projectPath || !projectPath.trim()) {
        return stackTrace;
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