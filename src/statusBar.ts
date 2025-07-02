import * as vscode from 'vscode';
import { UnityPackageHelper } from './unityPackageHelper.js';
import { UnityDetector } from './unityDetector.js';
import { UnityMessagingClient } from './unityMessagingClient.js';

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
    private hotReloadPollingTimer: NodeJS.Timeout | null = null;

    constructor(
        context: vscode.ExtensionContext,
        packageHelper: UnityPackageHelper | null,
        unityDetector: UnityDetector | null,
        messagingClient: UnityMessagingClient | null
    ) {
        this.context = context;
        this.packageHelper = packageHelper;
        this.unityDetector = unityDetector;
        this.messagingClient = messagingClient;

        // Subscribe to package updates to handle Hot Reload status bar changes
        if (this.packageHelper) {
            this.packageHelper.onPackagesUpdated.subscribe(() => {
                this.updateHotReloadStatusBarExistenceAndStatus();
            });
        } else {
            console.error('Status Bar: StatusBar - no packageHelper available for subscription');
        }

        this.createUnityStatusBar();
        this.startUnityStatusMonitoring();
        this.updateHotReloadStatusBarExistenceAndStatus();
    }

    /**
     * Create and show Unity status bar item
     */
    private createUnityStatusBar(): void {
        if (this.unityStatusBarItem) {
            return; // Already created
        }

        this.unityStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
        this.unityStatusBarItem.command = 'unity-code.showConnectionStatus';
        this.updateUnityStatus(false, false);
        this.unityStatusBarItem.show();

        // Add to subscriptions for proper cleanup
        this.context.subscriptions.push(this.unityStatusBarItem);
    }

    /**
     * Create and show Hot Reload status bar item
     */
    private createHotReloadStatusBar(): void {
        if (this.hotReloadStatusBarItem) {
            return; // Already created
        }

        this.hotReloadStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.hotReloadStatusBarItem.command = 'unity-code.showHotReloadStatus';
        this.updateHotReloadStatus(false);
        this.hotReloadStatusBarItem.show();

        // Add to subscriptions for proper cleanup
        this.context.subscriptions.push(this.hotReloadStatusBarItem);
    }

    /**
     * Update Unity status bar item based on connection status
     */
    private updateUnityStatus(connected: boolean, online: boolean): void {
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
    private updateHotReloadStatus(isRunning: boolean): void {
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
     * Update hot reload status bar item existence and status based on Hot Reload package installation
     */
    private updateHotReloadStatusBarExistenceAndStatus(): void {
        if (!this.packageHelper) {
            console.error('Status Bar: No packageHelper available in handlePackagesUpdated');
            return;
        }

        try {
            // Check if Hot Reload package is installed
            const hotReloadPackage = this.packageHelper.getPackageByName('com.singularitygroup.hotreload');
            const isInstalled = hotReloadPackage !== undefined;

            // Check current status bar state
            const hasStatusBar = this.hotReloadStatusBarItem !== null;

            if (isInstalled != hasStatusBar) {
                // Package is installed
                if (isInstalled) {
                    // Package was installed, create status bar
                    console.log('Status Bar: Creating Hot Reload status bar (package installed, no status bar)');
                    this.createHotReloadStatusBar();

                    // Start monitoring if Unity detector is available
                    if (this.unityDetector) {
                        console.log('Status Bar: Setting up Unity detector monitoring for Hot Reload');
                        this.unityDetector.onUnityStateChanged.subscribe((event) => {
                            if (this.hotReloadStatusBarItem) {
                                this.updateHotReloadStatus(event.isHotReloadEnabled || false);
                            }
                        });

                        // Update immediately with current state
                        this.updateHotReloadStatus(this.unityDetector.isHotReloadEnabled);

                        // Start polling for hot reload status every 3 seconds
                        this.startHotReloadPolling();
                    } else {
                        console.log('Status Bar: No Unity detector available for Hot Reload monitoring');
                    }

                    console.log('Status Bar: Hot Reload package installed, status bar created');
                } else {
                    // Package was uninstalled, remove status bar
                    console.log('Status Bar: Removing Hot Reload status bar (package uninstalled)');
                    this.stopHotReloadPolling();
                    this.hotReloadStatusBarItem?.dispose();
                    this.hotReloadStatusBarItem = null;
                    console.log('Status Bar: Hot Reload package uninstalled, status bar removed');
                }
            }

            // If package is installed and status bar exists, just update the status
            if (isInstalled && hasStatusBar && this.unityDetector) {
                this.updateHotReloadStatus(this.unityDetector.isHotReloadEnabled);
            }

        } catch (error) {
            console.error('Status Bar: Error handling packages updated event:', error);
        }
    }

    /**
     * Start polling for hot reload status every 3 seconds
     */
    private startHotReloadPolling(): void {
        if (this.hotReloadPollingTimer) {
            return; // Already polling
        }

        console.log('Status Bar: Starting hot reload status polling (every 3 seconds)');

        this.hotReloadPollingTimer = setInterval(async () => {
            if (!this.unityDetector || !this.hotReloadStatusBarItem) {
                return;
            }

            try {
                const state = await this.unityDetector.requestUnityState(1000);
                if (state) {
                    //console.log(`Status Bar: Polled hot reload status - Running: ${state.IsHotReloadEnabled}`);
                    this.updateHotReloadStatus(state.IsHotReloadEnabled);
                }
            } catch (error) {
                console.error('Status Bar: Error polling hot reload status:', error);
            }
        }, 3000); // Poll every 3 seconds
    }

    /**
     * Stop polling for hot reload status
     */
    private stopHotReloadPolling(): void {
        if (this.hotReloadPollingTimer) {
            console.log('Status Bar: Stopping hot reload status polling');
            clearInterval(this.hotReloadPollingTimer);
            this.hotReloadPollingTimer = null;
        }
    }

    /**
     * Dispose of all status bar items
     */
    public dispose(): void {
        this.stopHotReloadPolling();

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