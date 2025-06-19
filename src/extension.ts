import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { isInAssetsFolder } from './utils.js';

/**
 * Check if the workspace is a Unity project by looking for ProjectSettings/ProjectVersion.txt
 * @param workspaceFolder The workspace folder to check
 * @returns Promise<boolean> True if the workspace is a Unity project
 */
export async function isUnityProject(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
    return isUnityProjectByPath(workspaceFolder.uri.fsPath);
}

/**
 * Check if a directory is a Unity project by looking for ProjectSettings/ProjectVersion.txt
 * @param projectPath The project directory path to check
 * @returns Promise<boolean> True if the directory is a Unity project
 */
export async function isUnityProjectByPath(projectPath: string): Promise<boolean> {
    try {
        const projectVersionPath = path.join(projectPath, 'ProjectSettings', 'ProjectVersion.txt');
        const fsAccess = promisify(fs.access);
        await fsAccess(projectVersionPath, fs.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

// isInAssetsFolder function is now imported from ./utils

/**
 * @param {vscode.ExtensionContext} context
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('CodeUnity extension is now active!');

    // Register the command to manually rename meta files
    const disposable = vscode.commands.registerCommand('codeunity.renameMetaFiles', function () {
        vscode.window.showInformationMessage('CodeUnity: Manually renaming meta files');
        // This would scan the workspace and fix any mismatched meta files
    });

    context.subscriptions.push(disposable);
    
    // Listen for file rename events using workspace API
    const renameDisposable = vscode.workspace.onDidRenameFiles(async event => {
        // Check if we're in a Unity project
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }
        
        // Check if this is a Unity project
        const isUnity = await isUnityProject(workspaceFolders[0]);
        if (!isUnity) {
            return;
        }
        
        // Process each renamed file
        for (const file of event.files) {
            const oldUri = file.oldUri;
            const newUri = file.newUri;
            
            // Check if this is a Unity project file (not a meta file itself)
            // and if it's in the Assets folder
            if (!oldUri.fsPath.endsWith('.meta') && 
                !newUri.fsPath.endsWith('.meta') && 
                isInAssetsFolder(oldUri.fsPath)) {
                
                const oldMetaPath = `${oldUri.fsPath}.meta`;
                const newMetaPath = `${newUri.fsPath}.meta`;
                
                // Check if the meta file exists
                if (fs.existsSync(oldMetaPath)) {
                    try {
                        // Rename the meta file to match the renamed file
                        fs.renameSync(oldMetaPath, newMetaPath);
                        vscode.window.showInformationMessage(`Renamed meta file: ${path.basename(newMetaPath)}`);
                    } catch (error) {
                        vscode.window.showErrorMessage(`Error renaming meta file: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
        }
    });

    context.subscriptions.push(renameDisposable);
}

export function deactivate() {}