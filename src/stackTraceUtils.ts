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
                let absolutePath: string;
                
                // Handle both absolute and relative paths
                if (path.isAbsolute(sourceLocation.filePath)) {
                    absolutePath = sourceLocation.filePath;
                    const normalizedFilePath = await normalizePath(sourceLocation.filePath);
                    const normalizedProjectPath = await normalizePath(projectPath);
                    
                    if (normalizedFilePath.startsWith(normalizedProjectPath)) {
                        processedPath = path.relative(normalizedProjectPath, normalizedFilePath);
                        // Ensure forward slashes for consistency
                        processedPath = processedPath.replace(/\\/g, '/');
                    }
                } else {
                    // For relative paths, join with project path to get absolute path
                    absolutePath = path.join(projectPath, sourceLocation.filePath);
                    // Normalize the absolute path and handle it like any other absolute path
                    const normalizedAbsolutePath = await normalizePath(absolutePath);
                    const normalizedProjectPath = await normalizePath(projectPath);
                    
                    if (normalizedAbsolutePath.startsWith(normalizedProjectPath)) {
                        processedPath = path.relative(normalizedProjectPath, normalizedAbsolutePath);
                        // Ensure forward slashes for consistency
                        processedPath = processedPath.replace(/\\/g, '/');
                    } else {
                        // If not within project, use the normalized absolute path
                        processedPath = normalizedAbsolutePath;
                    }
                    absolutePath = normalizedAbsolutePath;
                }
                
                // Create VS Code markdown link format: [text](file:///absolute/path#line)
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
 * Parses a Unity Console log stack trace line to identify the source location part.
 * Unity Console logs have a different format than test stack traces.
 * 
 * Expected format:
 * - "Script:AnotherMethod () (at Assets/Scripts/Script.cs:12)"
 * - "Script:Awake () (at Assets/Scripts/Script.cs:8)"
 * 
 * @param logLine A single line from Unity Console log
 * @returns StackTraceSourceLocation object with indices and parsed data, or null if no source location found
 */
export function parseUnityConsoleStackTraceSourceLocation(logLine: string): StackTraceSourceLocation | null {
    // Unity console log pattern: "ClassName:Method () (at FilePath:LineNumber)"
    // The source location part is "FilePath:LineNumber" after "(at " and before ")"
    
    const atKeyword = '(at ';
    const atIndex = logLine.lastIndexOf(atKeyword);
    
    if (atIndex === -1) {
        return null;
    }
    
    // Find the closing parenthesis after "(at "
    const closingParenIndex = logLine.indexOf(')', atIndex);
    if (closingParenIndex === -1) {
        return null;
    }
    
    // Start of source location is after "(at "
    const sourceLocationStart = atIndex + atKeyword.length;
    
    // Extract the text between "(at " and ")"
    const sourceLocationText = logLine.substring(sourceLocationStart, closingParenIndex).trim();
    const colonMatch = sourceLocationText.match(/^(.+):(\d+)$/);
    
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
    
    return {
        startIndex: sourceLocationStart,
        endIndex: closingParenIndex,
        filePath,
        lineNumber
    };
}

/**
 * Process Unity Console log stack trace to make file paths clickable in VS Code
 * Converts relative paths to absolute paths and formats as markdown links
 * @param logText The Unity Console log text (can be multi-line)
 * @param projectPath The Unity project path
 * @returns The processed log with clickable file links
 */
export async function processConsoleLogStackTraceToMarkdown(logText: string, projectPath: string): Promise<string> {
    if (!logText || !logText.trim()) {
        return '';
    }

    // If no project path is available, we can't process the log
    if (!projectPath || !projectPath.trim()) {
        return logText;
    }

    // Process each line of the log
    const lines = logText.split('\n');
    const processedLines: string[] = [];
    
    for (const line of lines) {
        const sourceLocation = parseUnityConsoleStackTraceSourceLocation(line);
        
        if (sourceLocation) {
            try {
                // Unity console logs typically use relative paths
                let absolutePath = sourceLocation.filePath;
                
                // If it's a relative path, make it absolute
                if (!path.isAbsolute(sourceLocation.filePath)) {
                    absolutePath = path.join(projectPath, sourceLocation.filePath);
                }
                
                const normalizedAbsolutePath = await normalizePath(absolutePath);                
                const markdownLink = `[${sourceLocation.filePath}:${sourceLocation.lineNumber}](file:///${normalizedAbsolutePath.replace(/\\/g, '/')}#${sourceLocation.lineNumber})`;
                
                // Replace the source location part with the markdown link
                const beforeSourceLocation = line.substring(0, sourceLocation.startIndex);
                const afterSourceLocation = line.substring(sourceLocation.endIndex);
                const processedLine = beforeSourceLocation + markdownLink + afterSourceLocation;
                processedLines.push(processedLine);
                
            } catch (error) {
                // If path processing fails, keep the original line
                console.warn(`Failed to process console log path: ${sourceLocation.filePath}`, error);
                processedLines.push(line);
            }
        } else {
            // No source location found, keep the original line
            processedLines.push(line);
        }
    }
    
    return processedLines.join('\n');
}