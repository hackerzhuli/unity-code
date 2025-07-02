import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { UnityProjectManager } from './unityProjectManager';
import { parseUnityConsoleStackTraceSourceLocation } from './stackTraceUtils';
import { openFileAtLine } from './vscodeUtils';

export interface UnityLogEntry {
    id: string;
    type: 'info' | 'warning' | 'error';
    message: string;
    timestamp: Date;
    stackTrace?: string;
}

export class UnityConsoleProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'unityConsole';
    
    public _view?: vscode.WebviewView;
    private _logs: UnityLogEntry[] = [];
    private _logCounter = 0;
    private _selectedLogId: string | null = null;
    private _unityProjectManager: UnityProjectManager | null;
    private extensionPath: string;
    private _ignoreDuplicateLogs: boolean = true; // Default to true as specified
    private _updateTimer: NodeJS.Timeout | null = null;
    private _pendingUpdate = false;
    private static readonly UPDATE_INTERVAL_MS = 200;
    private static readonly MAX_LOGS = 500;
    
    constructor(
        private readonly _extensionUri: vscode.Uri,
        unityProjectManager: UnityProjectManager | null,
    ) {
        this._unityProjectManager = unityProjectManager;
        this.extensionPath = _extensionUri.fsPath;
    }
    
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };
        
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        
        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.command || message.type) {
                    case 'clearLogs':
                        this.clearLogs();
                        break;
                    case 'toggleFilter':
                        this._updateWebview();
                        break;
                    case 'selectLog':
                        this._selectedLogId = message.logId;
                        break;
                    case 'openFile':
                        if (message.stackTraceLine) {
                            this._openFileFromStackTrace(message.stackTraceLine);
                        }
                        break;
                    case 'webviewReady':
                        // Webview is ready to receive logs (e.g., after being hidden and shown again)
                        // Use immediate update for better responsiveness when webview is ready
                        this._updateWebview();
                        break;
                    case 'toggleIgnoreDuplicates':
                        this._ignoreDuplicateLogs = message.enabled;
                        // Save setting to VS Code configuration
                        vscode.workspace.getConfiguration('unity-code').update('ignoreDuplicateLogs', this._ignoreDuplicateLogs, vscode.ConfigurationTarget.Global);
                        break;
                }
            },
            undefined
        );
        
        // Listen for visibility changes
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                // Re-send logs when the view becomes visible again
                // Use immediate update for better responsiveness when the view becomes visible
                this._updateWebview();
            }
        });
        
        // Load ignore duplicates setting from VS Code configuration
        this._ignoreDuplicateLogs = vscode.workspace.getConfiguration('unity-code').get('ignoreDuplicateLogs', true);
        
        // Send initial data
        this._updateWebview();
    }
    
    public addLog(type: 'info' | 'warning' | 'error', message: string, stackTrace?: string): void {
        const logEntry: UnityLogEntry = {
            id: (++this._logCounter).toString(),
            type,
            message,
            timestamp: new Date(),
            stackTrace: stackTrace || ''
        };
        
        // Check for duplicates if ignore duplicates is enabled
        if (this._ignoreDuplicateLogs) {
            const isDuplicate = this._logs.some(existingLog => 
                existingLog.message === logEntry.message && 
                existingLog.stackTrace === logEntry.stackTrace &&
                existingLog.type === logEntry.type
            );
            
            if (isDuplicate) {
                return; // Don't store duplicate log
            }
        }
        
        this._logs.push(logEntry);
        
        // Keep only the last 100 logs to prevent performance issues
        if (this._logs.length > UnityConsoleProvider.MAX_LOGS) {
            this._logs = this._logs.slice(-UnityConsoleProvider.MAX_LOGS);
        }
        
        this._scheduleWebviewUpdate();
    }
    
    public clearLogs(): void {
        this._logs = [];
        this._selectedLogId = null;
        
        // Cancel any pending updates and update immediately for clear operation
        if (this._updateTimer) {
            clearTimeout(this._updateTimer);
            this._updateTimer = null;
        }
        this._pendingUpdate = false;
        this._updateWebview();
    }
    
    private _scheduleWebviewUpdate(): void {
        if (this._pendingUpdate) {
            return; // Update already scheduled
        }
        
        this._pendingUpdate = true;
        
        if (this._updateTimer) {
            clearTimeout(this._updateTimer);
        }
        
        this._updateTimer = setTimeout(() => {
            this._updateWebview();
            this._pendingUpdate = false;
            this._updateTimer = null;
        }, UnityConsoleProvider.UPDATE_INTERVAL_MS);
    }
    
    private _updateWebview(): void {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateLogs',
                logs: this._logs,
                selectedLogId: this._selectedLogId,
                ignoreDuplicateLogs: this._ignoreDuplicateLogs
            });
        }
    }
    
    private async _openFileFromStackTrace(stackTraceLine: string): Promise<void> {
        try {
            // Use the utility function to parse Unity console stack trace
            const sourceLocation = parseUnityConsoleStackTraceSourceLocation(stackTraceLine);
            
            if (!sourceLocation) {                
                console.error(`Could not parse file path from stack trace line: ${stackTraceLine}`);
                return;
            }
            
            // Get Unity project path from the project manager
            const unityProjectPath = this._unityProjectManager?.getUnityProjectPath();
            if (!unityProjectPath) {
                console.error('UnityProjectManager is not initialized or Unity project path is not available');
                return;
            }
            
            await openFileAtLine(sourceLocation.filePath, sourceLocation.lineNumber, unityProjectPath);
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to parse stack trace: ${error instanceof Error ? error.message : String(error)}`);
        }
    }


    
    private _getHtmlForWebview(webview: vscode.Webview): string {
        try {
            const htmlPath = path.join(this.extensionPath, 'assets/unityConsole.html');
            const cssPath = path.join(this.extensionPath, 'assets/unityConsole.css');
            const jsPath = path.join(this.extensionPath, 'assets/unityConsole.js');
            
            // Get URIs for the external files
            const cssUri = webview.asWebviewUri(vscode.Uri.file(cssPath));
            const jsUri = webview.asWebviewUri(vscode.Uri.file(jsPath));
            const cspSource = webview.cspSource;
            
            let html = fs.readFileSync(htmlPath, 'utf8');
            
            // Replace placeholders with actual URIs
            html = html.replace(/{{cssUri}}/g, cssUri.toString());
            html = html.replace(/{{jsUri}}/g, jsUri.toString());
            html = html.replace(/{{cspSource}}/g, cspSource);
            
            return html;
        } catch (error) {
            console.error('Failed to load Unity Console HTML template:', error);
            // Fallback to a simple error message
            return `<!DOCTYPE html>
<html><body><h1>Error loading Unity Console</h1><p>Failed to load the HTML template.</p></body></html>`;
        }
    }
}

export class UnityConsoleManager {
    private _provider?: UnityConsoleProvider;
    private _disposables: vscode.Disposable[] = [];
    
    constructor(
        private readonly _context: vscode.ExtensionContext,
        private readonly _unityProjectManager: UnityProjectManager | null
    ) {
        this._context = _context;
        this._unityProjectManager = _unityProjectManager;
    }
    
    public initialize(): void {
        this._provider = new UnityConsoleProvider(
            this._context.extensionUri,
            this._unityProjectManager
        );
        
        // Register the webview provider
        const providerDisposable = vscode.window.registerWebviewViewProvider(
            UnityConsoleProvider.viewType,
            this._provider
        );
        
        // Register command to show Unity Console
        const showConsoleCommand = vscode.commands.registerCommand(
            'unity-code.showUnityConsole',
            () => {
                // Focus the Unity Console view - this will trigger resolveWebviewView if not already resolved
                vscode.commands.executeCommand('unityConsole.focus');
            }
        );
        
        this._disposables.push(providerDisposable, showConsoleCommand);
        this._context.subscriptions.push(...this._disposables);
    }
    
    public addLog(type: 'info' | 'warning' | 'error', message: string): void {
        if (!this._provider) {
            return;
        }
        
        // Parse message to separate log content from stack trace
        // Unity logs often contain stack traces after the main message
        const lines = message.split('\n');
        let logMessage = lines[0] || message;
        let stackTrace = '';
        
        // Look for stack trace patterns (lines starting with "at " or containing file paths)
        const stackTraceStartIndex = lines.findIndex(line => 
            line.trim().startsWith('at ') || 
            line.includes('.cs:') || 
            line.includes('UnityEngine.') ||
            line.includes('UnityEditor.')
        );
        
        if (stackTraceStartIndex > 0) {
            logMessage = lines.slice(0, stackTraceStartIndex).join('\n').trim();
            stackTrace = lines.slice(stackTraceStartIndex).join('\n').trim();
        } else if (lines.length > 1) {
            // If no clear stack trace pattern, but multiple lines, treat first line as message
            logMessage = lines[0];
            stackTrace = lines.slice(1).join('\n').trim();
        }
        
        this._provider.addLog(type, logMessage, stackTrace);
    }
    
    public clearLogs(): void {
        this._provider?.clearLogs();
    }
    
    public dispose(): void {
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }
}