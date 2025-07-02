import * as vscode from 'vscode';
import { UnityPackageHelper } from './unityPackageHelper.js';
import { UnityDetector } from './unityDetector.js';
import { UnityMessagingClient, MessageType } from './unityMessagingClient.js';
import { UnityProjectManager } from './unityProjectManager.js';

/**
 * Manages Unity and Hot Reload status bar items
 */
export class StatusBar {
    private unityStatusBarItem: vscode.StatusBarItem | null = null;
    private hotReloadStatusBarItem: vscode.StatusBarItem | null = null;
    private context: vscode.ExtensionContext;
    private packageHelper: UnityPackageHelper | null = null;
    private unityDetector: UnityDetector | null = null;
    private messagingClient: UnityMessagingClient | null = null;

    private projectManager: UnityProjectManager | null = null;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Initialize the status bar with Unity services
     */
    public initialize(
        packageHelper: UnityPackageHelper | null,
        unityDetector: UnityDetector | null,
        messagingClient: UnityMessagingClient | null,
        projectManager: UnityProjectManager | null
    ): void {
        this.packageHelper = packageHelper;
        this.unityDetector = unityDetector;
        this.messagingClient = messagingClient;
        this.projectManager = projectManager;
    }

    /**
     * Create and show Unity status bar item
     */
    public createUnityStatusBar(): void {
        if (this.unityStatusBarItem) {
            return; // Already created
        }

        this.unityStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.unityStatusBarItem.command = 'unity-code.showConnectionStatus';
        this.updateUnityStatus(false, false);
        this.unityStatusBarItem.show();
        
        // Add to subscriptions for proper cleanup
        this.context.subscriptions.push(this.unityStatusBarItem);
        
        console.log('UnityCode: Unity status bar created');
    }

    /**
     * Create and show Hot Reload status bar item
     */
    public createHotReloadStatusBar(): void {
        if (this.hotReloadStatusBarItem) {
            return; // Already created
        }

        this.hotReloadStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        this.hotReloadStatusBarItem.command = 'unity-code.showHotReloadStatus';
        this.updateHotReloadStatus(false);
        this.hotReloadStatusBarItem.show();
        
        // Add to subscriptions for proper cleanup
        this.context.subscriptions.push(this.hotReloadStatusBarItem);
        
        console.log('UnityCode: Hot Reload status bar created');
    }

    /**
     * Update Unity status bar item based on connection status
     */
    public updateUnityStatus(connected: boolean, online: boolean): void {
        if (!this.unityStatusBarItem) {
            return;
        }

        if (online) {
            this.unityStatusBarItem.text = '$(check)$(unity-cube)';
            this.unityStatusBarItem.tooltip = 'Unity Editor is connected';
            this.unityStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        } else if (connected) {
            this.unityStatusBarItem.text = '$(clock)$(unity-cube)';
            this.unityStatusBarItem.tooltip = 'Unity Editor is detected but not connected';
            this.unityStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            this.unityStatusBarItem.text = '$(x)$(unity-cube)';
            this.unityStatusBarItem.tooltip = 'Unity Editor is not detected';
            this.unityStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.offlineBackground');
        }
    }

    /**
     * Update Hot Reload status bar item based on status
     */
    public updateHotReloadStatus(isRunning: boolean): void {
        if (!this.hotReloadStatusBarItem) {
            return;
        }

        if (isRunning) {
            this.hotReloadStatusBarItem.text = '$(check)$(hot-reload)';
            this.hotReloadStatusBarItem.tooltip = 'Hot Reload for Unity is running';
            this.hotReloadStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
        } else {
            this.hotReloadStatusBarItem.text = '$(x)$(hot-reload)';
            this.hotReloadStatusBarItem.tooltip = 'Hot Reload for Unity is not running';
            this.hotReloadStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.offlineBackground');
        }
    }

    /**
     * Check if Hot Reload package is installed and create status bar if needed
     */
    public async checkAndCreateHotReloadStatusBar(): Promise<void> {
        if (!this.packageHelper) {
            return;
        }

        // Update packages to get latest information
        await this.packageHelper.updatePackages();
        
        // Check if Hot Reload package is installed
        const hotReloadPackage = this.packageHelper.getPackageByName('com.singularitygroup.hotreload');
        
        if (hotReloadPackage && !this.hotReloadStatusBarItem) {
            this.createHotReloadStatusBar();
            console.log('UnityCode: Hot Reload package detected, status bar created');
        }
    }

    /**
     * Start monitoring Unity connection and Hot Reload status
     */
    public startMonitoring(): void {
        this.startUnityStatusMonitoring();
        this.setupHotReloadCompilationHandler();
    }

    /**
     * Start monitoring Unity connection status and update status bar using events
     */
    private startUnityStatusMonitoring(): void {
        if (!this.messagingClient || !this.unityStatusBarItem) {
            return;
        }

        // Update status bar immediately with current state
        const connected = this.messagingClient.connected;
        const online = this.messagingClient.unityOnline;
        this.updateUnityStatus(connected, online);

        // Subscribe to connection status changes for immediate updates
        this.messagingClient.onConnectionStatus.subscribe((isConnected) => {
            if (this.unityStatusBarItem) {
                const currentOnline = this.messagingClient?.unityOnline || false;
                this.updateUnityStatus(isConnected, currentOnline);
            }
        });

        // Subscribe to online status changes for immediate updates
        this.messagingClient.onOnlineStatus.subscribe((isOnline) => {
            if (this.unityStatusBarItem) {
                const currentConnected = this.messagingClient?.connected || false;
                this.updateUnityStatus(currentConnected, isOnline);
            }
        });

        // Subscribe to Unity state changes to update Hot Reload status
        if (this.unityDetector && this.hotReloadStatusBarItem) {
            this.unityDetector.onUnityStateChanged.subscribe((event) => {
                if (this.hotReloadStatusBarItem) {
                    this.updateHotReloadStatus(event.isHotReloadEnabled || false);
                }
            });
            
            // Update Hot Reload status bar immediately with current state
            this.updateHotReloadStatus(this.unityDetector.isHotReloadEnabled);
        }
    }

    /**
     * Set up Hot Reload status bar update handler for compilation finished events
     */
    private setupHotReloadCompilationHandler(): void {
        if (!this.messagingClient || !this.projectManager?.isWorkingWithUnityProject()) {
            return;
        }

        // Add our own CompilationFinished handler for Hot Reload status updates
        this.messagingClient.onMessage(MessageType.CompilationFinished, async () => {
            console.log('UnityCode: Compilation finished, checking Hot Reload package status...');
            await this.updateHotReloadStatusBarOnCompilation();
        });
    }

    /**
     * Update Hot Reload status bar based on package installation status after compilation
     */
    private async updateHotReloadStatusBarOnCompilation(): Promise<void> {
        if (!this.packageHelper) {
            return;
        }

        try {
            // Update packages to get latest information
            await this.packageHelper.updatePackages();
            
            // Check if Hot Reload package is installed
            const hotReloadPackage = this.packageHelper.getPackageByName('com.singularitygroup.hotreload');
            const isInstalled = hotReloadPackage !== undefined;
            
            // Check current status bar state
            const hasStatusBar = this.hotReloadStatusBarItem !== null;
            
            if (isInstalled && !hasStatusBar) {
                // Package was installed, create status bar
                this.createHotReloadStatusBar();
                
                // Start monitoring if Unity detector is available
                if (this.unityDetector) {
                    this.unityDetector.onUnityStateChanged.subscribe((event) => {
                        if (this.hotReloadStatusBarItem) {
                            this.updateHotReloadStatus(event.isHotReloadEnabled || false);
                        }
                    });
                    
                    // Update immediately with current state
                    this.updateHotReloadStatus(this.unityDetector.isHotReloadEnabled);
                }
                
                console.log('UnityCode: Hot Reload package installed, status bar created');
            } else if (!isInstalled && hasStatusBar) {
                // Package was uninstalled, remove status bar
                this.hotReloadStatusBarItem?.dispose();
                this.hotReloadStatusBarItem = null;
                console.log('UnityCode: Hot Reload package uninstalled, status bar removed');
            }
            
            // If package is installed and status bar exists, just update the status
            if (isInstalled && hasStatusBar && this.unityDetector) {
                this.updateHotReloadStatus(this.unityDetector.isHotReloadEnabled);
            }
            
        } catch (error) {
            console.error('UnityCode: Error updating Hot Reload status after compilation:', error);
        }
    }

    /**
     * Get the Unity status bar item
     */
    public getUnityStatusBarItem(): vscode.StatusBarItem | null {
        return this.unityStatusBarItem;
    }

    /**
     * Get the Hot Reload status bar item
     */
    public getHotReloadStatusBarItem(): vscode.StatusBarItem | null {
        return this.hotReloadStatusBarItem;
    }

    /**
     * Dispose of all status bar items
     */
    public dispose(): void {
        if (this.unityStatusBarItem) {
            this.unityStatusBarItem.dispose();
            this.unityStatusBarItem = null;
        }
        
        if (this.hotReloadStatusBarItem) {
            this.hotReloadStatusBarItem.dispose();
            this.hotReloadStatusBarItem = null;
        }
    }
}