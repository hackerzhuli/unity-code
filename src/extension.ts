import * as vscode from 'vscode';
import * as fs from 'fs';
import { CSharpDocHoverProvider } from './csharpDocHoverProvider.js';
import { UnityTestProvider } from './unityTestProvider.js';
import { UnityPackageHelper } from './unityPackageHelper.js';
import { UnityProjectManager } from './unityProjectManager.js';
import { UnityMessagingClient } from './unityMessagingClient.js';
import { UnityDetector } from './unityDetector.js';
import { UnityConsoleManager } from './unityConsole.js';
import { NativeBinaryLocator } from './nativeBinaryLocator.js';
import { UnityDebuggerManager } from './debugger.js';

// Global reference to test provider for auto-refresh functionality
let globalTestProvider: UnityTestProvider | null = null;
// Global reference to package helper for package information
let globalPackageHelper: UnityPackageHelper | null = null;
// Global reference to Unity project manager
let globalUnityProjectManager: UnityProjectManager | null = null;
// Global reference to Unity status bar item
let globalUnityStatusBarItem: vscode.StatusBarItem | null = null;
let globalUnityMessagingClient: UnityMessagingClient | null = null;
let globalUnityDetector: UnityDetector | null = null;

// Global reference to Unity Console manager
let globalUnityConsoleManager: UnityConsoleManager | null = null;

// Global reference to Native Binary Locator
let globalNativeBinaryLocator: NativeBinaryLocator | null = null;
// Global reference to Unity Debugger Manager
let globalUnityDebuggerManager: UnityDebuggerManager | null = null;

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
    const isOldInAssets = await globalUnityProjectManager.isInAssetsFolder(oldUri.fsPath);
    const isNewInAssets = await globalUnityProjectManager.isInAssetsFolder(newUri.fsPath);
    
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
    const config = vscode.workspace.getConfiguration('unity-code');
    const autoRefreshEnabled = config.get<boolean>('autoRefreshUnity', true);
    
    if (!autoRefreshEnabled || !globalUnityMessagingClient) {
        return;
    }

    // don't refresh if it's a .meta file
    if (document.uri.fsPath.endsWith(".meta")){
        return;
    }

    // Check if we have a Unity project and the file is within it
    if (!globalUnityProjectManager || !globalUnityProjectManager.isWorkingWithUnityProject()) {
        return;
    }
    
    // Check if the saved file is in the assets folder
    // anything in assets folder is fine, except a .meta file
    if (!globalUnityProjectManager.isInAssetsFolder(document.uri.fsPath)) {
        return;
    }

    console.log(`UnityCode: file saved: ${document.fileName}, refreshing Unity and tests...`);
    await globalUnityMessagingClient.refreshAssetDatabase();
}

/**
 * Handle window focus events for auto-refresh
 */
async function onDidChangeWindowState(windowState: vscode.WindowState): Promise<void> {
    // Check if window focus refresh is enabled
    const config = vscode.workspace.getConfiguration('unity-code');
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
 * Create and initialize the Unity status bar item
 */
function createUnityStatusBarItem(): vscode.StatusBarItem {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'unity-code.showConnectionStatus';
    updateUnityStatusBarItem(statusBarItem, false, false);
    statusBarItem.show();
    return statusBarItem;
}

/**
 * Update the Unity status bar item based on connection status
 * @param statusBarItem The status bar item to update
 * @param connected Whether Unity process is detected and connected
 * @param online Whether Unity is online and responding to messages
 */
function updateUnityStatusBarItem(statusBarItem: vscode.StatusBarItem, connected: boolean, online: boolean): void {
    if (online) {
        statusBarItem.text = '$(check)Unity';
        statusBarItem.tooltip = 'Unity Editor is connected';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
    } else if (connected) {
        statusBarItem.text = '$(clock)Unity';
        statusBarItem.tooltip = 'Unity Editor is detected but not connected';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
        statusBarItem.text = '$(x)Unity';
        statusBarItem.tooltip = 'Unity Editor is not detected';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.offlineBackground');
    }
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
        // Also log to Debug Console for developers
        console.log(`[Unity Info] ${message}`);
    });

    // Handle Warning messages
    globalUnityMessagingClient.onWarningMessage.subscribe((message) => {
        globalUnityConsoleManager?.addLog('warning', message);
        console.warn(`[Unity Warning] ${message}`);
    });

    // Handle Error messages
    globalUnityMessagingClient.onErrorMessage.subscribe((message) => {
        globalUnityConsoleManager?.addLog('error', message);
        console.error(`[Unity Error] ${message}`);
    });
}

/**
 * Start monitoring Unity connection status and update status bar using events
 */
function startUnityStatusMonitoring(): void {
    if (!globalUnityMessagingClient || !globalUnityStatusBarItem) {
        return;
    }

    // Update status bar immediately with current state
    const connected = globalUnityMessagingClient.connected;
    const online = globalUnityMessagingClient.unityOnline;
    updateUnityStatusBarItem(globalUnityStatusBarItem, connected, online);

    // Subscribe to connection status changes for immediate updates
    globalUnityMessagingClient.onConnectionStatus.subscribe((isConnected) => {
        if (globalUnityStatusBarItem) {
            const currentOnline = globalTestProvider?.messagingClient.unityOnline || false;
            updateUnityStatusBarItem(globalUnityStatusBarItem, isConnected, currentOnline);
        }
    });

    // Subscribe to online status changes for immediate updates
    globalUnityMessagingClient.onOnlineStatus.subscribe((isOnline) => {
        if (globalUnityStatusBarItem) {
            const currentConnected = globalTestProvider?.messagingClient.connected || false;
            updateUnityStatusBarItem(globalUnityStatusBarItem, currentConnected, isOnline);
        }
    });
}

/**
 * Register all event listeners and commands
 * @param context The extension context
 */
function registerEventListeners(context: vscode.ExtensionContext): void {
    // Register the command to manually refresh tests
    const refreshTestsDisposable = vscode.commands.registerCommand('unity-code.refreshTests', async function () {
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



    // Register the command to show Unity connection status
    const showConnectionStatusDisposable = vscode.commands.registerCommand('unity-code.showConnectionStatus', function () {
        if (globalTestProvider) {
            const connected = globalTestProvider.messagingClient.connected;
            const online = globalTestProvider.messagingClient.unityOnline;
            const processId = globalTestProvider.messagingClient.connectedUnityProcessId;
            
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
    const runTestsDisposable = vscode.commands.registerCommand('unity-code.runTests', async function (testFullNames: string[]) {
        if (!globalTestProvider) {
            vscode.window.showWarningMessage('Unity Code: Test provider not available');
            return;
        }

        if (!globalTestProvider.messagingClient.connected) {
            vscode.window.showErrorMessage('Unity Code: Not connected to Unity Editor. Make sure Unity is running.');
            return;
        }

        if (!testFullNames || testFullNames.length === 0) {
            vscode.window.showWarningMessage('Unity Code: No tests specified to run');
            return;
        }

        try {
            // Create a test run request for the specific tests
            const testItems: vscode.TestItem[] = [];
            
            // Find test items by their full names
            for (const fullName of testFullNames) {
                const testItem = globalTestProvider.findTestByFullName(fullName);
                if (testItem) {
                    testItems.push(testItem);
                }
            }

            if (testItems.length === 0) {
                vscode.window.showWarningMessage('Unity Code: Could not find test items to run');
                return;
            }

            // Create and execute test run request
            const request = new vscode.TestRunRequest(testItems);
            await globalTestProvider.runTests(request, new vscode.CancellationTokenSource().token);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Unity Code: Failed to run tests: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    // Listen for file rename events using workspace API
    const renameDisposable = vscode.workspace.onDidRenameFiles(onDidRenameFiles);

    // Listen for file save events for auto-refresh
    const saveDisposable = vscode.workspace.onDidSaveTextDocument(onDidSaveDocument);

    // Listen for window state changes for focus-based refresh
    const windowStateDisposable = vscode.window.onDidChangeWindowState(onDidChangeWindowState);

    // Create Unity status bar item for Unity projects
    if (globalUnityProjectManager && globalUnityProjectManager.isWorkingWithUnityProject()) {
        globalUnityStatusBarItem = createUnityStatusBarItem();
    }

    context.subscriptions.push(
        refreshTestsDisposable,
        showConnectionStatusDisposable,
        runTestsDisposable,
        renameDisposable, 
        saveDisposable,
        windowStateDisposable
    );
    
    // Add status bar item to subscriptions for proper cleanup
    if (globalUnityStatusBarItem) {
        context.subscriptions.push(globalUnityStatusBarItem);
    }
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
    globalTestProvider = new UnityTestProvider(context, globalUnityMessagingClient);
    
    // Initialize package helper for Unity projects
    const packageHelper = new UnityPackageHelper(unityProjectPath);
    globalPackageHelper = packageHelper;
    
    console.log('UnityCode: Package helper initialized (packages will be loaded lazily when needed)');
    
    // Register C# documentation hover provider with the initialized package helper
    registerHoverProvider(context, packageHelper);
    
    await globalUnityDetector.start();

    // Start Unity status monitoring if status bar item exists
    if (globalUnityStatusBarItem) {
        startUnityStatusMonitoring();
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
    globalTestProvider?.dispose();
    globalUnityDetector?.stop();
    globalUnityMessagingClient?.dispose();
    globalUnityConsoleManager?.dispose();
    globalUnityDebuggerManager?.deactivate();
    globalUnityDetector = null;
    globalUnityMessagingClient = null;
    globalTestProvider = null;
    globalPackageHelper = null;
    globalUnityStatusBarItem = null;
    globalUnityDebuggerManager = null;
    globalUnityConsoleManager = null;
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

export function deactivate() {
    cleanup();
}
