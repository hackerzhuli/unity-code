import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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
    private _unityProjectManager?: any;
    private extensionPath: string;
    
    constructor(
        private readonly _extensionUri: vscode.Uri,
        unityProjectManager?: any,
    ) {
        this._unityProjectManager = unityProjectManager;
        this.extensionPath = _extensionUri.fsPath;
    }
    
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
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
                        this._openFileAtLine(message.filePath, message.line);
                        break;
                    case 'webviewReady':
                        // Webview is ready to receive logs (e.g., after being hidden and shown again)
                        this._updateWebview();
                        break;
                }
            },
            undefined
        );
        
        // Listen for visibility changes
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                // Re-send logs when the view becomes visible again
                this._updateWebview();
            }
        });
        
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
        
        this._logs.push(logEntry);
        
        // Keep only the last 1000 logs to prevent memory issues
        if (this._logs.length > 1000) {
            this._logs = this._logs.slice(-1000);
        }
        
        this._updateWebview();
    }
    
    public clearLogs(): void {
        this._logs = [];
        this._selectedLogId = null;
        this._updateWebview();
    }
    
    private _updateWebview(): void {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateLogs',
                logs: this._logs,
                selectedLogId: this._selectedLogId
            });
        }
    }
    
    private async _openFileAtLine(filePath: string, line: number): Promise<void> {
        try {
            // Convert relative Unity path to absolute path
            let absolutePath = filePath;
            if (this._unityProjectManager && !path.isAbsolute(filePath)) {
                const unityProjectPath = this._unityProjectManager.getUnityProjectPath();
                if (unityProjectPath) {
                    absolutePath = path.join(unityProjectPath, filePath);
                }
            }
            
            // Check if file exists
            if (!fs.existsSync(absolutePath)) {
                vscode.window.showWarningMessage(`File not found: ${filePath}`);
                return;
            }
            
            const document = await vscode.workspace.openTextDocument(absolutePath);
            const editor = await vscode.window.showTextDocument(document);
            
            // Navigate to the specific line (VS Code uses 0-based line numbers)
            const position = new vscode.Position(Math.max(0, line - 1), 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position));
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    private _getHtmlForWebview(webview: vscode.Webview): string {
        try {
            const htmlPath = path.join(this.extensionPath, 'assets/unityConsole.html');
            return fs.readFileSync(htmlPath, 'utf8');
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
        private readonly _unityProjectManager?: any
    ) {

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
            'unitycode.showUnityConsole',
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