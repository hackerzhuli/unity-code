import * as si from 'systeminformation';
import { extractHotReloadProjectPath, projectPathsMatch } from './utils.js';

export interface HotReloadProcess {
    pid: number;
    name: string;
    command?: string;
    parentPid?: number;
    projectPath?: string;
}

export class HotReloadProcessDetector {
    private static readonly HOT_RELOAD_PROCESS_NAMES = {
        win32: ['CodePatcherCLI.exe'],
        darwin: ['CodePatcherCLI'],
        linux: ['CodePatcherCLI']
    };

    /**
     * Checks if Hot Reload for Unity is running for the specified project
     * @param currentProjectPath Optional path to current Unity project for filtering
     * @returns True if Hot Reload is running for the project, false otherwise
     */
    public async isHotReloadRunning(currentProjectPath?: string): Promise<boolean> {
        try {
            const processes = await si.processes();
            
            // Get platform-specific Hot Reload process names
            const validHotReloadNames = this.getValidHotReloadProcessNames();
            
            // Check for Hot Reload processes
            for (const proc of processes.list) {
                if (this.isValidHotReloadProcess(proc, validHotReloadNames)) {
                    // If no project path filter, return true on first match
                    if (!currentProjectPath) {
                        return true;
                    }
                    
                    // Extract project path and check if it matches
                     const projectPath = extractHotReloadProjectPath(proc.command || '');
                     if (projectPath && await projectPathsMatch(projectPath, currentProjectPath)) {
                         return true;
                     }
                }
            }
            
            return false;
            
        } catch (error) {
            console.error('UnityCode: Error detecting Hot Reload processes:', error);
            return false;
        }
    }
    
    /**
     * Gets the valid Hot Reload process names for the current platform
     */
    private getValidHotReloadProcessNames(): string[] {
        const platform = process.platform as keyof typeof HotReloadProcessDetector.HOT_RELOAD_PROCESS_NAMES;
        return HotReloadProcessDetector.HOT_RELOAD_PROCESS_NAMES[platform] || HotReloadProcessDetector.HOT_RELOAD_PROCESS_NAMES.win32;
    }
    
    /**
     * Checks if a process is a valid Hot Reload process
     */
    private isValidHotReloadProcess(proc: si.Systeminformation.ProcessesProcessData, validNames: string[]): boolean {
        const name = proc.name || '';
        const _command = proc.command || '';
        
        // Check if the process name exactly matches Hot Reload process names
        const isExactMatch = validNames.some(validName => 
            name === validName || name.toLowerCase() === validName.toLowerCase()
        );
        
        if (isExactMatch) {
            console.log(`UnityCode: Found Hot Reload process:`, {
                pid: proc.pid,
                name: proc.name,
                command: proc.command,
                parentPid: proc.parentPid
            });
            return true;
        }
        
        return false;
    }
    

    
    /**
     * Checks if Hot Reload for Unity is enabled for the given project path
     * @param projectPath The Unity project path to check
     * @returns True if Hot Reload is enabled for the project, false otherwise
     */
    public async isHotReloadEnabled(projectPath: string): Promise<boolean> {
        return this.isHotReloadRunning(projectPath);
    }
}