import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { isInAssetsFolder } from './utils.js';
import { CSharpDocHoverProvider } from './csharpDocHoverProvider.js';
import { UnityTestProvider } from './unityTestProvider.js';
import { UnityPackageHelper } from './unityPackageHelper.js';

// Global reference to test provider for auto-refresh functionality
let globalTestProvider: UnityTestProvider | null = null;
// Global reference to package helper for package information
let globalPackageHelper: UnityPackageHelper | null = null;

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
 * Handle C# file save events for auto-refresh
 */
async function onDidSaveDocument(document: vscode.TextDocument): Promise<void> {
    // Check if auto-refresh is enabled
    const config = vscode.workspace.getConfiguration('unitycode');
    const autoRefreshEnabled = config.get<boolean>('autoRefreshTests', true);
    
    if (!autoRefreshEnabled || !globalTestProvider) {
        return;
    }

    // Check if the saved file is a C# file
    if (document.languageId !== 'csharp') {
        return;
    }

    // Check if the file is in a Unity project
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
        return;
    }

    const isUnity = await isUnityProject(workspaceFolder);
    if (!isUnity) {
        return;
    }

    console.log(`UnityCode: C# file saved: ${document.fileName}, refreshing Unity and tests...`);
    
    try {
        // Refresh Unity's asset database only (no test refresh due to compilation time)
        if (globalTestProvider.messagingClient.connected) {
            console.log(`UnityCode: Connection status - Connected: ${globalTestProvider.messagingClient.connected}, Port: ${globalTestProvider.messagingClient.getCurrentPort()}`);
            
            await globalTestProvider.messagingClient.refreshAssetDatabase();
            console.log('UnityCode: Sent refresh command to Unity (tests will not be auto-refreshed due to compilation time)');
        } else {
            console.log('UnityCode: Not connected to Unity, skipping refresh');
            console.log('UnityCode: Attempting to reconnect to Unity...');
            const reconnected = await globalTestProvider.messagingClient.refreshConnection();
            if (reconnected) {
                console.log('UnityCode: Reconnected successfully, sending refresh...');
                await globalTestProvider.messagingClient.refreshAssetDatabase();
                console.log('UnityCode: Sent refresh command to Unity');
            } else {
                console.log('UnityCode: Failed to reconnect to Unity');
            }
        }
    } catch (error) {
        console.error('UnityCode: Error during auto-refresh:', error);
    }
}

/**
 * Handle window focus events for auto-refresh
 */
async function onDidChangeWindowState(windowState: vscode.WindowState): Promise<void> {
    // Check if window focus refresh is enabled
    const config = vscode.workspace.getConfiguration('unitycode');
    const refreshOnFocusEnabled = config.get<boolean>('refreshOnWindowFocus', true);
    
    if (!refreshOnFocusEnabled || !globalTestProvider || !windowState.focused) {
        return;
    }

    console.log('UnityCode: Window regained focus, refreshing tests...');
    
    try {
        // Only refresh tests when window gains focus
        if (globalTestProvider.messagingClient.connected) {
            await globalTestProvider.refreshTests();
        }
    } catch (error) {
        console.error('UnityCode: Error during focus refresh:', error);
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

    // Register the command to manually refresh tests
    const refreshTestsDisposable = vscode.commands.registerCommand('unitycode.refreshTests', async function () {
        if (globalTestProvider) {
            vscode.window.showInformationMessage('Unity Code: Refreshing tests...');
            try {
                await globalTestProvider.refreshTests();
                vscode.window.showInformationMessage('Unity Code: Tests refreshed successfully');
            } catch (error) {
                vscode.window.showErrorMessage(`Unity Code: Failed to refresh tests: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else {
            vscode.window.showWarningMessage('Unity Code: Test provider not available');
        }
    });

    // Register the command to manually refresh packages
    const refreshPackagesDisposable = vscode.commands.registerCommand('unitycode.refreshPackages', async function () {
        if (globalPackageHelper) {
            vscode.window.showInformationMessage('Unity Code: Refreshing packages...');
            try {
                await globalPackageHelper.updatePackages();
                const packageCount = (await globalPackageHelper.getAllPackages()).length;
                vscode.window.showInformationMessage(`Unity Code: Packages refreshed successfully (${packageCount} packages found)`);
            } catch (error) {
                vscode.window.showErrorMessage(`Unity Code: Failed to refresh packages: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else {
            vscode.window.showWarningMessage('Unity Code: Package helper not available');
        }
    });

    // Listen for file rename events using workspace API
    const renameDisposable = vscode.workspace.onDidRenameFiles(onDidRenameFiles);

    // Listen for file save events for auto-refresh
    const saveDisposable = vscode.workspace.onDidSaveTextDocument(onDidSaveDocument);

    // Listen for window state changes for focus-based refresh
    const windowStateDisposable = vscode.window.onDidChangeWindowState(onDidChangeWindowState);

    context.subscriptions.push(
        disposable, 
        refreshTestsDisposable,
        refreshPackagesDisposable,
        renameDisposable, 
        saveDisposable,
        windowStateDisposable
    );
}

/**
 * @param {vscode.ExtensionContext} context
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('UnityCode extension is now active!');
    registerEventListeners(context);
    
    // Initialize Unity test provider only for Unity projects
    initializeUnityTestProvider(context);
}

/**
 * Initialize Unity test provider and package helper for Unity projects
 * @param context The extension context
 */
async function initializeUnityTestProvider(context: vscode.ExtensionContext): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        // No workspace folders, register hover provider without package helper
        registerHoverProvider(context, undefined);
        return;
    }
    
    let unityProjectFound = false;
    
    // Check if any workspace folder is a Unity project
    for (const folder of workspaceFolders) {
        const isUnity = await isUnityProject(folder);
        if (isUnity) {
            unityProjectFound = true;
            
            // Initialize test provider for Unity projects
            const testProvider = new UnityTestProvider(context);
            globalTestProvider = testProvider; // Store reference for auto-refresh
            
            // Initialize package helper for Unity projects
            const packageHelper = new UnityPackageHelper(folder.uri.fsPath);
            globalPackageHelper = packageHelper;
            
            console.log('UnityCode: Package helper initialized (packages will be loaded lazily when needed)');
            
            // Register C# documentation hover provider with the initialized package helper
            registerHoverProvider(context, packageHelper);
            
            context.subscriptions.push({
                dispose: () => {
                    testProvider.dispose();
                    globalTestProvider = null;
                    globalPackageHelper = null;
                }
            });
            break; // Only need one test provider instance
        }
    }
    
    // If no Unity project found, still register hover provider without package helper
    if (!unityProjectFound) {
        registerHoverProvider(context, undefined);
    }
}

/**
 * Register the C# documentation hover provider
 * @param context The extension context
 * @param packageHelper The package helper instance (optional)
 */
function registerHoverProvider(context: vscode.ExtensionContext, packageHelper?: UnityPackageHelper): void {
    const hoverProvider = new CSharpDocHoverProvider(packageHelper);
    const hoverDisposable = vscode.languages.registerHoverProvider(
        { scheme: 'file', language: 'csharp' },
        hoverProvider
    );
    
    context.subscriptions.push(hoverDisposable);
}

/**
 * Get the global package helper instance
 * @returns UnityPackageHelper instance or null if not initialized
 */
export function getPackageHelper(): UnityPackageHelper | null {
    return globalPackageHelper;
}

export function deactivate() {}