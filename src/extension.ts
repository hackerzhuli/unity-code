import * as vscode from 'vscode';
import { CSharpDocHoverProvider } from './csharpDocHoverProvider';
import { UnityTestProvider } from './unityTestProvider';
import { UnityMessagingClient } from './unityMessagingClient';
import { UnityPackageHelper } from './unityPackageHelper';
import { UnityProjectManager } from './unityProjectManager';
import { UnityConsoleManager } from './unityConsole';
import { NativeBinaryLocator } from './nativeBinaryLocator';
import { UnityDebuggerManager } from './debugger';
import { StatusBar } from './statusBar';
import { UnityBinaryManager } from './unityBinaryManager';

// Global variables for Unity services
let globalUnityBinaryManager: UnityBinaryManager | null = null;
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
 * Register Unity log message handlers to display logs in Unity Console WebView
 */
function registerUnityLogHandlers(context: vscode.ExtensionContext): void {
    if (!globalUnityMessagingClient) {
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
        if (globalUnityBinaryManager && globalUnityPackageHelper) {
            const isHotReloadInstalled = globalUnityPackageHelper.getPackageByName('com.singularitygroup.hotreload') !== undefined;
            const isHotReloadRunning = globalUnityBinaryManager.isHotReloadEnabled;

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

    context.subscriptions.push(
        refreshTestsDisposable,
        showHotReloadStatusDisposable,
        showConnectionStatusDisposable,
        runTestsDisposable
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

    // Initialize unified Unity Binary Manager (handles both UDP detection and language server)
    globalUnityBinaryManager = new UnityBinaryManager(unityProjectPath, globalNativeBinaryLocator);

    globalUnityMessagingClient = new UnityMessagingClient(globalUnityBinaryManager);

    // Initialize test provider for Unity projects
    globalUnityTestProvider = new UnityTestProvider(context, globalUnityMessagingClient, globalUnityProjectManager!);

    // Register file event listeners in UnityProjectManager
    globalUnityProjectManager!.registerEventListeners(context, globalUnityMessagingClient, globalUnityTestProvider, globalUnityBinaryManager);

    // Initialize package helper for Unity projects
    const packageHelper = new UnityPackageHelper(unityProjectPath);
    globalUnityPackageHelper = packageHelper;

    // Register C# documentation hover provider with the initialized package helper
    registerHoverProvider(context, packageHelper);

    // Register Unity log message handlers
    registerUnityLogHandlers(context);

    // Start unified Unity Binary Manager (both UDP detection and language server)
    try {
        await globalUnityBinaryManager.start();
        console.log('UnityCode: Unity Binary Manager started successfully');
    } catch (error) {
        console.error('UnityCode: Failed to start Unity Binary Manager:', error);
    }

    // Initialize package helper and setup compilation finished handler
    if (globalUnityPackageHelper) {
        await globalUnityPackageHelper.initialize();
        globalUnityPackageHelper.setupCompilationFinishedHandler(globalUnityMessagingClient);
    }

    // Initialize status bar for Unity projects
    if (globalUnityProjectManager && globalUnityProjectManager.isWorkingWithUnityProject()) {
        globalStatusBar = new StatusBar(
            context,
            globalUnityPackageHelper,
            globalUnityBinaryManager,
            globalUnityMessagingClient
        );
    } else {
        console.error('UnityCode: StatusBar not initialized');
    }
}

function cleanup() {
    globalUnityTestProvider?.dispose();
    globalUnityBinaryManager?.dispose();
    globalUnityMessagingClient?.dispose();
    globalUnityConsoleManager?.dispose();
    globalUnityDebuggerManager?.deactivate();
    globalStatusBar?.dispose();
    globalUnityProjectManager?.dispose();
    globalUnityBinaryManager = null;
    globalUnityMessagingClient = null;
    globalUnityTestProvider = null;
    globalUnityPackageHelper = null;
    globalUnityDebuggerManager = null;
    globalUnityConsoleManager = null;
    globalStatusBar = null;
    globalUnityProjectManager = null;
}

/**
 * Register the C# documentation hover provider
 * @param context The extension context
 * @param packageHelper The package helper instance (optional)
 */
function registerHoverProvider(context: vscode.ExtensionContext, packageHelper?: UnityPackageHelper): void {
    const hoverProvider = new CSharpDocHoverProvider(packageHelper, globalUnityProjectManager || undefined, globalUnityBinaryManager || undefined);
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