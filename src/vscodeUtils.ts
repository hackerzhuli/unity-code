import * as fs from 'fs';
import * as nodePath from 'path';
import * as vscode from 'vscode';

/**
 * Opens a file at a specific line in VS Code editor
 * @param filePath - The Unity file path (relative or absolute)
 * @param lineNumber - The line number to navigate to (1-based)
 * @param unityProjectPath - The Unity project root path
 */
export async function openFileAtLine(filePath: string, lineNumber: number, unityProjectPath: string): Promise<void> {
    try {
        let absolutePath: string;
        
        // If the filePath is already absolute, use it as is
        if (nodePath.isAbsolute(filePath)) {
            absolutePath = filePath;
        } else {
            // Handle relative paths by resolving them against the Unity project root
            absolutePath = nodePath.resolve(unityProjectPath, filePath);
        }
        
        // Check if file exists
        if (!fs.existsSync(absolutePath)) {
            vscode.window.showErrorMessage(`File not found: ${absolutePath}`);
            return;
        }
        
        // Open the file
        const document = await vscode.workspace.openTextDocument(absolutePath);
        const editor = await vscode.window.showTextDocument(document);
        
        // Navigate to the specific line (convert to 0-based index)
        const position = new vscode.Position(Math.max(0, lineNumber - 1), 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to open file: ${error}`);
    }
}