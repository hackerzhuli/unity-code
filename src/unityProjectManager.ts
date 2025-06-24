import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { isInsideDirectory as isInDirectory, normalizePath } from './utils.js';

/**
 * Unity Project Manager class for centralized Unity project detection and management
 * Detects Unity project status once during async initialization and caches the result
 */
export class UnityProjectManager {
    /** path of the Unity project(normalized) */
    private unityProjectPath: string | null = null;
    private isInitialized: boolean = false;

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
            console.log(`UnityCode: Detected Unity project at: ${this.unityProjectPath}`);
        } else {
            console.log('UnityCode: No Unity project detected in workspace');
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
     * Check if a given path is inside the Assets folder of this Unity project
     * @param path The path to check
     * @returns boolean True if the path is in the Assets folder, the path must exist on file system, otherwise false
     */
    public async isInAssetsFolder(path: string): Promise<boolean> {
        if (this.unityProjectPath) {
            return await isInDirectory(this.unityProjectPath + '/Assets', path);
        }
        return false;
    }
}