import * as vscode from 'vscode';
import * as fs from 'fs';
import { isInAssetsFolder } from './utils.js';
import { CSharpDocHoverProvider } from './csharpDocHoverProvider.js';
import { UnityTestProvider } from './unityTestProvider.js';
import { UnityPackageHelper } from './unityPackageHelper.js';
import { UnityProjectManager } from './unityProjectManager.js';

// Global reference to test provider for auto-refresh functionality
let globalTestProvider: UnityTestProvider | null = null;
// Global reference to package helper for package information
let globalPackageHelper: UnityPackageHelper | null = null;
// Global reference to Unity project manager
let globalUnityProjectManager: UnityProjectManager | null = null;

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
    
    // Check if we have a Unity project and both paths are within it
    if (!globalUnityProjectManager || !globalUnityProjectManager.isWorkingWithUnityProject()) {
        return;
    }
    
    // Check if both old and new paths are in the Assets folder of the Unity project
    const workspacePath = globalUnityProjectManager!.getUnityProjectPath()!;
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
    const autoRefreshEnabled = config.get<boolean>('autoRefreshUnity', true);
    
    if (!autoRefreshEnabled || !globalTestProvider) {
        return;
    }

    // Check if the saved file is a C# file
    if (document.languageId !== 'csharp') {
        return;
    }

    // Check if we have a Unity project and the file is within it
    if (!globalUnityProjectManager || !globalUnityProjectManager.isWorkingWithUnityProject()) {
        return;
    }
    
    // Check if the saved file is within the Unity project path
    if (!globalUnityProjectManager.isFileInUnityProject(document.uri.fsPath)) {
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
export async function activate(context: vscode.ExtensionContext) {
    console.log('UnityCode extension is now active!');
    
    // Initialize Unity project manager with current workspace folders
    globalUnityProjectManager = new UnityProjectManager();
    await globalUnityProjectManager.init(vscode.workspace.workspaceFolders);
    
    registerEventListeners(context);
    
    // Initialize Unity test provider only for Unity projects
    await initializeUnityServices(context);
}

/**
 * Initialize Unity test provider and package helper for Unity projects
 * @param context The extension context
 */
async function initializeUnityServices(context: vscode.ExtensionContext): Promise<void> {
    const unityProjectPath = globalUnityProjectManager!.getUnityProjectPath();
    if (!unityProjectPath) {
        // No Unity project found, register hover provider without package helper
        registerHoverProvider(context, undefined);
        return;
    }
    
    // Initialize test provider for Unity projects
    const testProvider = new UnityTestProvider(context, unityProjectPath);
    globalTestProvider = testProvider; // Store reference for auto-refresh
    
    // Initialize package helper for Unity projects
    const packageHelper = new UnityPackageHelper(unityProjectPath);
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