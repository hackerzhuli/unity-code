import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { isInsideDirectory as isInDirectory, normalizePath } from './utils.js';
import { UnityMessagingClient } from './unityMessagingClient.js';
import { UnityTestProvider } from './unityTestProvider.js';
import { UnityDetector } from './unityDetector.js';

/**
 * Unity Project Manager class for centralized Unity project detection and management
 * Detects Unity project status once during async initialization and caches the result
 */
export class UnityProjectManager {
    /** path of the Unity project(normalized) */
    private unityProjectPath: string | null = null;
    private isInitialized: boolean = false;
    private messagingClient?: UnityMessagingClient;
    private testProvider?: UnityTestProvider;
    private unityDetector?: UnityDetector;
    private disposables: vscode.Disposable[] = [];
    private lastRefreshTime: number = 0;
    private pendingRefreshTimeout?: NodeJS.Timeout;
    private readonly DEFAULT_ASSET_REFRESH_DELAY_SECONDS = 10; // 10 seconds default

    /**
     * Create a new Unity Project Manager instance
     * Call init() to perform Unity project detection
     */
    constructor() {
        // Empty constructor - detection happens in init()
    }

    /**
     * Initialize Unity project detection (can only be called once)
     * @param workspaceFolders The workspace folders to check for Unity projects
     * @returns Promise<string | null> The detected Unity project path
     */
    public async init(workspaceFolders?: readonly vscode.WorkspaceFolder[]): Promise<string | null> {
        if (this.isInitialized) {
            return this.unityProjectPath;
        }

        this.unityProjectPath = await this.detectUnityProjectPath(workspaceFolders);
        this.isInitialized = true;
        
        if (this.unityProjectPath) {
            console.log(`UnityProjectManager: Detected Unity project at: ${this.unityProjectPath}`);
        } else {
            console.log('UnityProjectManager: No Unity project detected in workspace');
        }
        
        return this.unityProjectPath;
    }

    /**
     * Asynchronously detect Unity project path from workspace folders
     * @param workspaceFolders The workspace folders to check
     * @returns Promise<string | null> The Unity project path or null if not found
     */
    private async detectUnityProjectPath(workspaceFolders?: readonly vscode.WorkspaceFolder[]): Promise<string | null> {
        const folders = workspaceFolders || vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return null;
        }
        
        // Check each workspace folder for Unity project
        for (const folder of folders) {
            if (await this.isUnityProjectByPath(folder.uri.fsPath)) {
                return await normalizePath(folder.uri.fsPath);
            }
        }
        
        return null;
    }

    /**
     * Asynchronously check if a directory is a Unity project
     * @param projectPath The project directory path to check
     * @returns Promise<boolean> True if the directory is a Unity project
     */
    private async isUnityProjectByPath(projectPath: string): Promise<boolean> {
        try {
            const projectVersionPath = path.join(projectPath, 'ProjectSettings', 'ProjectVersion.txt');
            await fs.promises.access(projectVersionPath, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get the Unity project path
     * @returns The Unity project path or null if not detected
     */
    public getUnityProjectPath(): string | null {
        return this.unityProjectPath;
    }

    /**
     * Check if the extension is currently working with a Unity project
     * @returns True if a Unity project is detected
     */
    public isWorkingWithUnityProject(): boolean {
        return this.unityProjectPath !== null;
    }

    /**
     * Check if a given path is within the current Unity project
     * @param path The path to check
     * @returns True if the path is within the Unity project, the path must exist on file system, otherwise false
     */
    public async isInProject(path: string): Promise<boolean> {
        if (!this.unityProjectPath) {
            return false;
        }
        return await isInDirectory(this.unityProjectPath, path);
    }

    /**
     * Check if a given path is an assets file or folder of this Unity project
     * @param path The path to check
     * @param allowMetaFiles Whether to treat .meta files as assets (default: false)
     * @returns boolean True if the path is an asset, otherwise false
     */
    public async isAsset(path: string, allowMetaFiles: boolean = false): Promise<boolean> {
        if (path.endsWith(".meta") && !allowMetaFiles) {
            return false;
        }

        if (this.unityProjectPath) {
            const r = await isInDirectory(this.unityProjectPath + '/Assets', path);
            if (r) {
                return true;
            }

            return await isInDirectory(this.unityProjectPath + "/Packages", path);
        }

        return false;
    }

    /**
     * Register VS Code event listeners for file operations
     * @param context The extension context for managing disposables
     * @param messagingClient The Unity messaging client for asset database refresh
     * @param testProvider Optional test provider to check if tests are running
     * @param unityDetector Optional Unity detector for checking Unity state
     */
    public registerEventListeners(
        context: vscode.ExtensionContext,
        messagingClient?: UnityMessagingClient,
        testProvider?: UnityTestProvider,
        unityDetector?: UnityDetector
    ): void {
        // Store references for use in event handlers
        this.messagingClient = messagingClient;
        this.testProvider = testProvider;
        this.unityDetector = unityDetector;

        // Register file system event listeners
        const renameDisposable = vscode.workspace.onDidRenameFiles(this.onDidRenameFiles.bind(this));
        const deleteDisposable = vscode.workspace.onDidDeleteFiles(this.onDidDeleteFiles.bind(this));
        const createDisposable = vscode.workspace.onDidCreateFiles(this.onDidCreateFiles.bind(this));
        const saveDisposable = vscode.workspace.onDidSaveTextDocument(this.onDidSaveDocument.bind(this));

        // Store disposables for cleanup
        this.disposables.push(renameDisposable, deleteDisposable, createDisposable, saveDisposable);
        
        // Add to extension context for automatic cleanup
        context.subscriptions.push(renameDisposable, deleteDisposable, createDisposable, saveDisposable);
    }

    /**
     * Dispose of all registered event listeners
     */
    public dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose());
        this.disposables = [];
        
        // Clean up pending refresh timeout
        if (this.pendingRefreshTimeout) {
            clearTimeout(this.pendingRefreshTimeout);
            this.pendingRefreshTimeout = undefined;
        }
    }

    /**
     * Handle file rename events from VS Code
     * @param event The file rename event
     */
    private async onDidRenameFiles(event: vscode.FileRenameEvent): Promise<void> {
        if (!this.isWorkingWithUnityProject()) {
            return;
        }

        // Process each renamed file
        for (const file of event.files) {
            // Check if the new path is an asset of the Unity project
            // The old file doesn't exist anymore, so we can't check it
            const isAsset = await this.isAsset(file.newUri.fsPath);

            if (isAsset) {
                await this.renameMetaFile(file.oldUri.fsPath, file.newUri.fsPath);
            }
        }
    }

    /**
     * Handle file delete events from VS Code
     * @param event The file delete event
     */
    private async onDidDeleteFiles(event: vscode.FileDeleteEvent): Promise<void> {
        if (!this.isWorkingWithUnityProject() || !this.messagingClient) {
            return;
        }

        // Check if any deleted files were .cs assets
        let triggerFilePath: string | null = null;
        for (const deletedUri of event.files) {
            const deletedFilePath = deletedUri.fsPath;
            if (deletedFilePath.endsWith('.cs')) {
                // Since the file is deleted, check if it had a .meta file (indicating it was an asset)
                const metaFilePath = `${deletedFilePath}.meta`;
                if (await this.isAsset(metaFilePath, true)) {
                    triggerFilePath = deletedFilePath;
                    break;
                }
            }
        }

        // Refresh asset database once if any .cs assets were deleted
        if (triggerFilePath) {
            await this.refreshAssetDatabaseIfNeeded(triggerFilePath, 'deleted', this.messagingClient);
        }
    }

    /**
     * Handle file create events from VS Code
     * @param event The file create event
     */
    private async onDidCreateFiles(event: vscode.FileCreateEvent): Promise<void> {
        if (!this.isWorkingWithUnityProject() || !this.messagingClient) {
            return;
        }

        // Check if any created files are valid .cs files that should trigger refresh
        let triggerFilePath: string | null = null;
        for (const createdUri of event.files) {
            const filePath = createdUri.fsPath;
            
            // For .cs files, check if file is saved to disk and not empty
            if (filePath.endsWith('.cs')) {
                console.log(`UnityProjectManager: cs file created: ${filePath}`);
                try {
                    // Check if file exists and is not empty
                    const stats = await fs.promises.stat(filePath);
                    if (stats.size > 0) {
                        triggerFilePath = filePath;
                        break;
                    } else {
                        console.log(`UnityProjectManager: Skipping asset database refresh for empty .cs file: ${filePath}`);
                    }
                } catch (_error) {
                    // File doesn't exist or can't be accessed, skip refresh
                    console.log(`UnityProjectManager: Skipping asset database refresh for .cs file not saved to disk: ${filePath}`);
                }
            } else {
                // For non-.cs files, always consider them valid for refresh
                triggerFilePath = filePath;
                break;
            }
        }

        // Refresh asset database once if any valid files were created
        if (triggerFilePath) {
            await this.refreshAssetDatabaseIfNeeded(triggerFilePath, 'created', this.messagingClient);
        }
    }

    /**
     * Handle file save events for auto-refresh
     * @param document The saved document
     */
    private async onDidSaveDocument(document: vscode.TextDocument): Promise<void> {
        if (this.isWorkingWithUnityProject() && this.messagingClient) {
            await this.refreshAssetDatabaseIfNeeded(document.uri.fsPath, 'saved', this.messagingClient);
        }
    }

    /**
     * Rename the meta file for a given asset file
     * @param oldFilePath The original file path
     * @param newFilePath The new file path
     */
    private async renameMetaFile(oldFilePath: string, newFilePath: string): Promise<void> {
        const oldMetaPath = `${oldFilePath}.meta`;
        const newMetaPath = `${newFilePath}.meta`;

        // Check if the meta file exists
        if (fs.existsSync(oldMetaPath)) {
            try {
                // Rename the meta file to match the renamed file
                fs.renameSync(oldMetaPath, newMetaPath);
                console.log(`UnityProjectManager: detected asset ${oldFilePath} is renamed to ${newFilePath}, so Renamed meta file ${oldMetaPath} to ${newMetaPath}`);
            } catch (error) {
                console.error(`UnityProjectManager: Error renaming meta file: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    /**
     * Refresh Unity asset database if conditions are met, with intelligent batching
     * Notes:
     * - Refresh may not be triggered immediately, we have times where we save code changes frequently,
     * - eg. when using an AI agent, we don't want to trigger refresh too frequently, that may waste CPU proccessing power unnecessarily
     * @param filePath The file path that triggered the refresh
     * @param action The action that triggered the refresh (for logging)
     * @param messagingClient The Unity messaging client
     */
    private async refreshAssetDatabaseIfNeeded(
        filePath: string, 
        action: string, 
        messagingClient: UnityMessagingClient
    ): Promise<void> {
        // Check if auto-refresh is enabled
        const config = vscode.workspace.getConfiguration('unity-code');
        const autoRefreshEnabled = config.get<boolean>('autoRefreshAssetDatabase', true);

        if (!autoRefreshEnabled) {
            return;
        }

        // Check if we have a Unity project and the file is within it
        if (!this.isWorkingWithUnityProject()) {
            return;
        }

        // Check if the file is an asset (not a .meta file and either exists as an asset or has a corresponding .meta file)
        if (filePath.endsWith('.meta')) {
            return;
        }

        const isAsset = await this.isAsset(filePath);
        const hasMetaFile = await this.isAsset(`${filePath}.meta`, true);

        if (!isAsset && !hasMetaFile) {
            return;
        }

        // If there's already a pending refresh, don't override it - let it handle the batching
        if (this.pendingRefreshTimeout) {
            console.log(`UnityProjectManager: Asset ${filePath} was ${action}, refresh already pending - batching with existing timeout`);
            return;
        }

        // Implement intelligent refresh batching
        const now = Date.now();
        const timeSinceLastRefresh = now - this.lastRefreshTime;

        // Get configurable refresh delay from settings (in seconds, convert to milliseconds)
        const refreshDelaySeconds = config.get<number>('assetDatabaseRefreshDelay', this.DEFAULT_ASSET_REFRESH_DELAY_SECONDS);
        const refreshDelayMs = refreshDelaySeconds * 1000;

        // If enough time has passed since last refresh, refresh immediately
        if (timeSinceLastRefresh >= refreshDelayMs) {
            console.log(`UnityProjectManager: Asset ${filePath} was ${action}, refreshing Unity asset database...`);
            this.lastRefreshTime = now;
            await this.performAssetDatabaseRefresh(messagingClient);
        } else {
            // Schedule a delayed refresh
            const remainingTime = refreshDelayMs - timeSinceLastRefresh;
            console.log(`UnityProjectManager: Asset ${filePath} was ${action}, batching refresh (will execute in ${Math.ceil(remainingTime / 1000)}s)`);
            
            this.pendingRefreshTimeout = setTimeout(async () => {
                console.log(`UnityProjectManager: Executing batched asset database refresh...`);
                this.lastRefreshTime = Date.now();
                await this.performAssetDatabaseRefresh(messagingClient);
                this.pendingRefreshTimeout = undefined;
            }, remainingTime);
        }
    }

    /**
     * Perform the actual asset database refresh
     * @param messagingClient The Unity messaging client
     */
    private async performAssetDatabaseRefresh(messagingClient: UnityMessagingClient): Promise<void> {
        try {
            // Check if Hot Reload is enabled before refreshing
            if (this.unityDetector) {
                await this.unityDetector.requestUnityState();
                if (this.unityDetector.isHotReloadEnabled) {
                    console.log(`UnityProjectManager: Hot Reload is enabled, skipping asset database refresh`);
                    return;
                }
            }

            // Skip asset database refresh if tests are currently running
            if (this.testProvider && this.testProvider.isTestsRunning()) {
                console.log(`UnityProjectManager: Tests are running, skipping asset database refresh`);
                return;
            }

            await messagingClient.refreshAssetDatabase();
        } catch (error) {
            console.error(`UnityProjectManager: Error refreshing asset database: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}