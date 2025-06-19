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

/**
 * Handle renaming of a single file and its corresponding meta file
 * @param oldUri The original file URI
 * @param newUri The new file URI
 */
async function handleFileRename(oldUri: vscode.Uri, newUri: vscode.Uri): Promise<void> {
    // Skip meta files themselves
    if (oldUri.fsPath.endsWith('.meta') || newUri.fsPath.endsWith('.meta')) {
        return;
    }
    
    // Find which workspace folder the old file belongs to
    const oldWorkspaceFolder = vscode.workspace.getWorkspaceFolder(oldUri);
    const newWorkspaceFolder = vscode.workspace.getWorkspaceFolder(newUri);
    
    // Both old and new paths must belong to the same workspace
    if (!oldWorkspaceFolder || !newWorkspaceFolder || 
        oldWorkspaceFolder.uri.fsPath !== newWorkspaceFolder.uri.fsPath) {
        return;
    }
    
    // Check if this workspace is a Unity project
    const isUnity = await isUnityProject(oldWorkspaceFolder);
    if (!isUnity) {
        return;
    }
    
    // Check if both old and new paths are in the Assets folder of this workspace
    const workspacePath = oldWorkspaceFolder.uri.fsPath;
    const isOldInAssets = isInAssetsFolder(oldUri.fsPath, workspacePath);
    const isNewInAssets = isInAssetsFolder(newUri.fsPath, workspacePath);
    
    if (!isOldInAssets || !isNewInAssets) {
        return;
    }
    
    await renameMetaFile(oldUri.fsPath, newUri.fsPath);
}

/**
 * Rename the meta file for a given asset file
 * @param oldFilePath The original file path
 * @param newFilePath The new file path
 */
async function renameMetaFile(oldFilePath: string, newFilePath: string): Promise<void> {
    const oldMetaPath = `${oldFilePath}.meta`;
    const newMetaPath = `${newFilePath}.meta`;
    
    // Check if the meta file exists
    if (fs.existsSync(oldMetaPath)) {
        try {
            // Rename the meta file to match the renamed file
            fs.renameSync(oldMetaPath, newMetaPath);
            console.log(`UnityCode: detected asset ${oldFilePath} is renamed to ${newFilePath}, so Renamed meta file ${oldMetaPath} to ${newMetaPath}`);
        } catch (error) {
            console.error(`UnityCode: Error renaming meta file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

/**
 * Handle file rename events from VS Code
 * @param event The file rename event
 */
async function onDidRenameFiles(event: vscode.FileRenameEvent): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
    }
    
    // Process each renamed file
    for (const file of event.files) {
        await handleFileRename(file.oldUri, file.newUri);
    }
}

/**
 * Register all event listeners and commands
 * @param context The extension context
 */
function registerEventListeners(context: vscode.ExtensionContext): void {
    // Register the command to manually rename meta files
    const disposable = vscode.commands.registerCommand('codeunity.renameMetaFiles', function () {
        vscode.window.showInformationMessage('CodeUnity: Manually renaming meta files');
        // This would scan the workspace and fix any mismatched meta files
    });

    // Listen for file rename events using workspace API
    const renameDisposable = vscode.workspace.onDidRenameFiles(onDidRenameFiles);

    context.subscriptions.push(disposable, renameDisposable);
}

/**
 * @param {vscode.ExtensionContext} context
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('UnityCode extension is now active!');
    registerEventListeners(context);
}

export function deactivate() {}