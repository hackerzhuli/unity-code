import * as vscode from 'vscode';
import * as fs from 'fs';
import { CSharpDocHoverProvider } from './csharpDocHoverProvider.js';
import { UnityDetector } from './unityDetector.js';
import { UnityTestProvider } from './unityTestProvider.js';
import { UnityMessagingClient } from './unityMessagingClient.js';
import { UnityPackageHelper } from './unityPackageHelper.js';
import { UnityProjectManager } from './unityProjectManager.js';
import { UnityConsoleManager } from './unityConsole.js';
import { NativeBinaryLocator } from './nativeBinaryLocator.js';
import { UnityDebuggerManager } from './debugger.js';
import { StatusBar } from './statusBar.js';

// Global variables for Unity services
let globalUnityDetector: UnityDetector | null = null;
let globalUnityTestProvider: UnityTestProvider | null = null;
let globalUnityMessagingClient: UnityMessagingClient | null = null;
let globalUnityPackageHelper: UnityPackageHelper | null = null;
let globalUnityProjectManager: UnityProjectManager | null = null;
let globalUnityConsoleManager: UnityConsoleManager | null = null;

// Global reference to Native Binary Locator
let globalNativeBinaryLocator: NativeBinaryLocator | null = null;
// Global reference to Unity Debugger Manager
let globalUnityDebuggerManager: UnityDebuggerManager | null = null;

// Global status bar manager
let globalStatusBar: StatusBar | null = null;

/**
 * Handle renaming of a single file and its corresponding meta file
 * @param oldUri The original file URI
 * @param newUri The new file URI
 */
async function handleFileRename(oldUri: vscode.Uri, newUri: vscode.Uri): Promise<void> {
    // Check if we have a Unity project and both paths are within it
    if (!globalUnityProjectManager || !globalUnityProjectManager.isWorkingWithUnityProject()) {
        return;
    }

    // Check if the new new path is an asset of the Unity project
    // The old file don't exist any more, so we can't check it
    const isAsset = await globalUnityProjectManager.isAsset(newUri.fsPath);

    if (!isAsset) {
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
 * Refresh Unity asset database if conditions are met
 * @param filePath The file path that triggered the refresh
 * @param action The action that triggered the refresh (for logging)
 */
async function refreshAssetDatabaseIfNeeded(filePath: string, action: string): Promise<void> {
    if (!globalUnityMessagingClient || !globalUnityProjectManager) {
        return;
    }

    // Check if auto-refresh is enabled
    const config = vscode.workspace.getConfiguration('unity-code');
    const autoRefreshEnabled = config.get<boolean>('autoRefreshUnity', true);

    if (!autoRefreshEnabled) {
        return;
    }

    // Check if we have a Unity project and the file is within it
    if (!globalUnityProjectManager.isWorkingWithUnityProject()) {
        return;
    }

    // Check if the file is an asset (not a .meta file and either exists as an asset or has a corresponding .meta file)
    if (filePath.endsWith('.meta')) {
        return;
    }

    const isAsset = globalUnityProjectManager.isAsset(filePath);
    const hasMetaFile = fs.existsSync(`${filePath}.meta`);

    if (!isAsset && !hasMetaFile) {
        return;
    }

    // Skip asset database refresh if tests are currently running
    if (globalUnityTestProvider && globalUnityTestProvider.isTestsRunning()) {
        console.log(`UnityCode: Tests are running, skipping asset database refresh for ${filePath} (${action})`);
        return;
    }

    console.log(`UnityCode: Asset ${filePath} was ${action}, refreshing Unity asset database...`);
    try {
        await globalUnityMessagingClient.refreshAssetDatabase();
    } catch (error) {
        console.error(`UnityCode: Error refreshing asset database after ${action}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Handle deletion of a single file and its corresponding meta file
 * @param deletedUri The deleted file URI
 */
async function handleFileDelete(deletedUri: vscode.Uri): Promise<void> {
    // Check if we have a Unity project
    if (!globalUnityProjectManager || !globalUnityProjectManager.isWorkingWithUnityProject()) {
        return;
    }

    const deletedFilePath = deletedUri.fsPath;
    const metaPath = `${deletedFilePath}.meta`;

    // Check if this was a .cs file with a corresponding meta file (indicating it was a Unity asset)
    const wasCsAsset = deletedFilePath.endsWith('.cs') && fs.existsSync(metaPath);

    // If it was a C# asset file, refresh the asset database before deleting the meta file
    if (wasCsAsset) {
        await refreshAssetDatabaseIfNeeded(deletedFilePath, 'deleted');
    }

    // Delete the meta file if it exists
    await deleteMetaFile(deletedFilePath);
}

/**
 * Delete the meta file for a given asset file
 * @param deletedFilePath The deleted file path
 */
async function deleteMetaFile(deletedFilePath: string): Promise<void> {
    const metaPath = `${deletedFilePath}.meta`;

    // Check if the meta file exists and delete it
    if (fs.existsSync(metaPath)) {
        try {
            fs.unlinkSync(metaPath);
            console.log(`UnityCode: detected asset ${deletedFilePath} was deleted, so deleted meta file ${metaPath}`);
        } catch (error) {
            console.error(`UnityCode: Error deleting meta file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

/**
 * Handle file delete events from VS Code
 * @param event The file delete event
 */
async function onDidDeleteFiles(event: vscode.FileDeleteEvent): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
    }

    // Process each deleted file
    for (const deletedUri of event.files) {
        await handleFileDelete(deletedUri);
    }
}

/**
 * Handle file save events for auto-refresh
 */
async function onDidSaveDocument(document: vscode.TextDocument): Promise<void> {
    await refreshAssetDatabaseIfNeeded(document.uri.fsPath, 'saved');
}

/**
 * Handle creation of a single file and refresh asset database if needed
 * @param createdUri The created file URI
 */
async function handleFileCreate(createdUri: vscode.Uri): Promise<void> {
    await refreshAssetDatabaseIfNeeded(createdUri.fsPath, 'created');
}

/**
 * Handle file create events from VS Code
 * @param event The file create event
 */
async function onDidCreateFiles(event: vscode.FileCreateEvent): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
    }

    // Process each created file
    for (const createdUri of event.files) {
        await handleFileCreate(createdUri);
    }
}

/**
 * Handle Unity compilation finished events for auto-refresh
 */
function setupCompilationFinishedRefresh(): void {
    const config = vscode.workspace.getConfiguration('unity-code');
    const refreshEnabled = config.get<boolean>('refreshTestsOnCompilation', true);

    if (!refreshEnabled) {
        console.log('UnityCode: Compilation finished refresh is disabled');
        return;
    }

    if (!globalUnityTestProvider || !globalUnityProjectManager?.isWorkingWithUnityProject()) {
        return;
    }

    console.log('UnityCode: Setting up compilation finished refresh');
}

/**
 * Register Unity log message handlers to display logs in Unity Console WebView
 */
function registerUnityLogHandlers(context: vscode.ExtensionContext): void {
    if (!globalUnityMessagingClient) {
        return;
    }

    // Check if Unity log forwarding is enabled
    const config = vscode.workspace.getConfiguration('unity-code');
    const showUnityLogs = config.get<boolean>('showUnityLogs', true);

    if (!showUnityLogs) {
        console.log('UnityCode: Unity log forwarding is disabled in settings');
        return;
    }

    // Initialize Unity Console Manager
    globalUnityConsoleManager = new UnityConsoleManager(context, globalUnityProjectManager);
    globalUnityConsoleManager.initialize();

    console.log('UnityCode: Unity Console initialized - logs will appear in Unity Console WebView');

    // Handle Info messages
    globalUnityMessagingClient.onInfoMessage.subscribe((message) => {
        globalUnityConsoleManager?.addLog('info', message);
    });

    // Handle Warning messages
    globalUnityMessagingClient.onWarningMessage.subscribe((message) => {
        globalUnityConsoleManager?.addLog('warning', message);
    });

    // Handle Error messages
    globalUnityMessagingClient.onErrorMessage.subscribe((message) => {
        globalUnityConsoleManager?.addLog('error', message);
    });
}

/**
 * Register all event listeners and commands
 * @param context The extension context
 */
async function registerEventListeners(context: vscode.ExtensionContext): Promise<void> {
    // Register the command to manually refresh tests
    const refreshTestsDisposable = vscode.commands.registerCommand('unity-code.refreshTests', async function () {
        if (globalUnityTestProvider) {
            // Check if tests are currently running
            if (globalUnityTestProvider.isTestsRunning()) {
                vscode.window.showWarningMessage('Unity Code: Tests are currently running. Please wait for tests to complete before refreshing.');
                return;
            }

            vscode.window.showInformationMessage('Unity Code: Refreshing tests...');
            try {
                await globalUnityTestProvider.refreshTests();
                vscode.window.showInformationMessage('Unity Code: Tests refreshed successfully');
            } catch (error) {
                vscode.window.showErrorMessage(`Unity Code: Failed to refresh tests: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else {
            vscode.window.showWarningMessage('Unity Code: Test provider not available');
        }
    });

    // Register the command to show Hot Reload status
    const showHotReloadStatusDisposable = vscode.commands.registerCommand('unity-code.showHotReloadStatus', function () {
        if (globalUnityDetector && globalUnityPackageHelper) {
            const isHotReloadInstalled = globalUnityPackageHelper.getPackageByName('com.singularitygroup.hotreload') !== undefined;
            const isHotReloadRunning = globalUnityDetector.isHotReloadEnabled;

            let statusMessage = '';
            if (isHotReloadInstalled) {
                if (isHotReloadRunning) {
                    statusMessage = 'Hot Reload for Unity is installed and running';
                } else {
                    statusMessage = 'Hot Reload for Unity is installed but not running';
                }
            } else {
                statusMessage = 'Hot Reload for Unity is not installed';
            }

            vscode.window.showInformationMessage(`Hot Reload Status: ${statusMessage}`);
        } else {
            vscode.window.showWarningMessage('Hot Reload Status: Not available (no Unity project detected)');
        }
    });

    // Register the command to show Unity connection status
    const showConnectionStatusDisposable = vscode.commands.registerCommand('unity-code.showConnectionStatus', function () {
        if (globalUnityTestProvider) {
            const connected = globalUnityTestProvider.messagingClient.connected;
            const online = globalUnityTestProvider.messagingClient.unityOnline;
            const processId = globalUnityTestProvider.messagingClient.connectedUnityProcessId;

            let statusMessage = '';
            if (online) {
                statusMessage = `Unity Editor is online and ready (Process ID: ${processId || 'Unknown'})`;
            } else if (connected) {
                statusMessage = `Unity Editor is connected but not responding (Process ID: ${processId || 'Unknown'})`;
            } else {
                statusMessage = 'Unity Editor is not connected. Make sure Unity is running with your project open.';
            }

            vscode.window.showInformationMessage(`Unity Code Connection Status: ${statusMessage}`);
        } else {
            vscode.window.showWarningMessage('Unity Code: Not available (no Unity project detected)');
        }
    });

    // Register the command to run tests from code lens
    const runTestsDisposable = vscode.commands.registerCommand('unity-code.runTests', async function (testId: string) {
        if (!globalUnityTestProvider) {
            vscode.window.showWarningMessage('Unity Code: Test provider not available');
            return;
        }

        if (!globalUnityTestProvider.messagingClient.connected) {
            vscode.window.showErrorMessage('Unity Code: Not connected to Unity Editor. Make sure Unity is running.');
            return;
        }

        if (!testId) {
            vscode.window.showWarningMessage('Unity Code: No test specified to run');
            return;
        }

        try {
            // Find test item by its full name
            const testItem = globalUnityTestProvider.getTestItem(testId);
            if (!testItem) {
                vscode.window.showWarningMessage('Unity Code: Could not find test item to run');
                return;
            }

            // Create and execute test run request
            const request = new vscode.TestRunRequest([testItem]);
            await globalUnityTestProvider.runTests(request, new vscode.CancellationTokenSource().token);

        } catch (error) {
            vscode.window.showErrorMessage(`Unity Code: Failed to run tests: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    // Listen for file rename events using workspace API
    const renameDisposable = vscode.workspace.onDidRenameFiles(onDidRenameFiles);

    // Listen for file delete events using workspace API
    const deleteDisposable = vscode.workspace.onDidDeleteFiles(onDidDeleteFiles);

    // Listen for file create events using workspace API
    const createDisposable = vscode.workspace.onDidCreateFiles(onDidCreateFiles);

    // Listen for file save events for auto-refresh
    const saveDisposable = vscode.workspace.onDidSaveTextDocument(onDidSaveDocument);

    // Initialize status bar for Unity projects
    if (globalUnityProjectManager && globalUnityProjectManager.isWorkingWithUnityProject()) {
        globalStatusBar = new StatusBar(context);
        globalStatusBar.createUnityStatusBar();
        globalStatusBar.checkAndCreateHotReloadStatusBar();
    }

    context.subscriptions.push(
        refreshTestsDisposable,
        showHotReloadStatusDisposable,
        showConnectionStatusDisposable,
        runTestsDisposable,
        renameDisposable,
        deleteDisposable,
        createDisposable,
        saveDisposable
    );
}

/**
 * @param {vscode.ExtensionContext} context
 */
export async function activate(context: vscode.ExtensionContext) {
	console.log('UnityCode extension is now active!');

    // Initialize Native Binary Locator
    globalNativeBinaryLocator = new NativeBinaryLocator(context.extensionPath);
    if (!globalNativeBinaryLocator) {
        console.warn('Failed to initialize NativeBinaryLocator: unsupported platform or architecture');
    }

    // Initialize Unity Debugger Manager
    globalUnityDebuggerManager = new UnityDebuggerManager(context);
    globalUnityDebuggerManager.activate(context);
    console.log('UnityCode: Unity debugger manager initialized');

    // Initialize Unity project manager with current workspace folders
    globalUnityProjectManager = new UnityProjectManager();
    await globalUnityProjectManager.init(vscode.workspace.workspaceFolders);

    await registerEventListeners(context);

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
        vscode.commands.executeCommand('setContext', 'unity-code:hasUnityProject', false);
        registerHoverProvider(context, undefined);
        return;
    }

    // Set context variable to show Unity Console view
    vscode.commands.executeCommand('setContext', 'unity-code:hasUnityProject', true);

    if (!globalNativeBinaryLocator) {
        console.warn('Cannot initialize UnityDetector: NativeBinaryLocator is not available');
        return;
    }

    globalUnityDetector = new UnityDetector(unityProjectPath, globalNativeBinaryLocator);

    globalUnityMessagingClient = new UnityMessagingClient(globalUnityDetector);

    // Initialize test provider for Unity projects
    globalUnityTestProvider = new UnityTestProvider(context, globalUnityMessagingClient, globalUnityProjectManager!);

    // Setup compilation-based test refresh
    setupCompilationFinishedRefresh();

    // Initialize package helper for Unity projects
    const packageHelper = new UnityPackageHelper(unityProjectPath);
    globalUnityPackageHelper = packageHelper;

    console.log('UnityCode: Package helper initialized (packages will be loaded lazily when needed)');

    // Register C# documentation hover provider with the initialized package helper
    registerHoverProvider(context, packageHelper);

    await globalUnityDetector.start();

    // Initialize and start status bar monitoring
    if (globalStatusBar) {
        globalStatusBar.initialize(
            globalUnityPackageHelper,
            globalUnityDetector,
            globalUnityMessagingClient,
            globalUnityProjectManager
        );
        globalStatusBar.startMonitoring();
    }

    // Register Unity log message handlers
    registerUnityLogHandlers(context);

    context.subscriptions.push({
        dispose: () => {
            cleanup();
        }
    });
}

function cleanup() {
    globalUnityTestProvider?.dispose();
    globalUnityDetector?.stop();
    globalUnityMessagingClient?.dispose();
    globalUnityConsoleManager?.dispose();
    globalUnityDebuggerManager?.deactivate();
    globalStatusBar?.dispose();
    globalUnityDetector = null;
    globalUnityMessagingClient = null;
    globalUnityTestProvider = null;
    globalUnityPackageHelper = null;
    globalUnityDebuggerManager = null;
    globalUnityConsoleManager = null;
    globalStatusBar = null;
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
    return globalUnityPackageHelper;
}

export function deactivate() {
    cleanup();
}
