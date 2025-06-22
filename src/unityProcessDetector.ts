import * as si from 'systeminformation';
import * as fs from 'fs';
import { promisify } from 'util';
import { extractProjectPath } from './utils.js';

export interface UnityProcess {
    pid: number;
    name: string;
    command?: string;
    parentPid?: number;
    projectPath?: string;
}

export class UnityProcessDetector {
    private static readonly UNITY_PROCESS_NAMES = {
        win32: ['Unity.exe'],
        darwin: ['Unity'],
        linux: ['Unity']
    };

    /**
     * Detects running Unity editor processes, excluding child processes and other Unity tools
     * @param currentProjectPath Optional path to current Unity project for filtering
     * @returns Array of Unity editor process information
     */
    public async detectUnityProcesses(currentProjectPath?: string): Promise<UnityProcess[]> {
        console.log('UnityCode: Starting Unity process detection...');
        console.log(`UnityCode: Platform: ${process.platform}`);
        
        try {
            console.log('UnityCode: Fetching running processes...');
            const processes = await si.processes();
            
            console.log(`UnityCode: Found ${processes.list.length} total processes`);
            
            // Get platform-specific Unity process names
            const validUnityNames = this.getValidUnityProcessNames();
            console.log(`UnityCode: Looking for processes: ${validUnityNames.join(', ')}`);
            
            // Filter for actual Unity editor processes
            const unityProcesses = processes.list.filter(proc => {
                return this.isValidUnityProcess(proc, validUnityNames);
            });
            
            console.log(`UnityCode: Found ${unityProcesses.length} potential Unity processes`);
            
            // Filter out child processes (processes with Unity parent)
            const parentProcesses = this.filterOutChildProcesses(unityProcesses);
            
            console.log(`UnityCode: Found ${parentProcesses.length} Unity editor processes after filtering children`);
            
            // Convert to our interface format and extract project paths
            const result: UnityProcess[] = parentProcesses.map(proc => {
                const projectPath = extractProjectPath(proc.command || '');
                return {
                    pid: proc.pid || 0,
                    name: proc.name || '',
                    command: proc.command,
                    parentPid: proc.parentPid,
                    projectPath
                };
            }).filter(proc => proc.pid > 0);
            
            // Filter by current project path if provided
            const filteredResult = currentProjectPath ? 
                await this.filterByProjectPath(result, currentProjectPath) : result;
            
            console.log(`UnityCode: Returning ${filteredResult.length} valid Unity processes`);
            filteredResult.forEach(proc => {
                console.log(`UnityCode: Unity process - PID: ${proc.pid}, Name: ${proc.name}, Project: ${proc.projectPath || 'Unknown'}`);
            });
            
            return filteredResult;
            
        } catch (error) {
            console.error('UnityCode: Error detecting Unity processes:', error);
            return [];
        }
    }
    
    /**
     * Gets the valid Unity process names for the current platform
     */
    private getValidUnityProcessNames(): string[] {
        const platform = process.platform as keyof typeof UnityProcessDetector.UNITY_PROCESS_NAMES;
        return UnityProcessDetector.UNITY_PROCESS_NAMES[platform] || UnityProcessDetector.UNITY_PROCESS_NAMES.win32;
    }
    
    /**
     * Checks if a process is a valid Unity editor process
     */
    private isValidUnityProcess(proc: si.Systeminformation.ProcessesProcessData, validNames: string[]): boolean {
        const name = proc.name || '';
        const _command = proc.command || '';
        
        // Check if the process name exactly matches Unity editor names
        const isExactMatch = validNames.some(validName => 
            name === validName || name.toLowerCase() === validName.toLowerCase()
        );
        
        if (isExactMatch) {
            console.log(`UnityCode: Found Unity editor process:`, {
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
     * Filters out child processes that have Unity processes as parents
     */
    private filterOutChildProcesses(processes: si.Systeminformation.ProcessesProcessData[]): si.Systeminformation.ProcessesProcessData[] {
        const validUnityNames = this.getValidUnityProcessNames();
        
        return processes.filter(proc => {
            // If no parent PID, it's definitely not a child
            if (!proc.parentPid) {
                return true;
            }
            
            // Check if parent is also a Unity process
            const hasUnityParent = processes.some(parentProc => {
                if (parentProc.pid === proc.parentPid) {
                    const parentName = parentProc.name || '';
                    const isUnityParent = validUnityNames.some(validName => 
                        parentName === validName || parentName.toLowerCase() === validName.toLowerCase()
                    );
                    
                    return isUnityParent;
                }
                return false;
            });
            
            return !hasUnityParent;
        });
    }
    
    /**
     * Filters Unity processes by matching project path using file system resolution
     * @param processes Array of Unity processes
     * @param currentProjectPath The current project path to match against
     * @returns Filtered array of processes that match the current project
     */
    private async filterByProjectPath(processes: UnityProcess[], currentProjectPath: string): Promise<UnityProcess[]> {
        console.log(`UnityCode: Filtering processes for project: ${currentProjectPath}`);
        
        try {
            // Get canonical path for current project
            const realpath = promisify(fs.realpath);
            const canonicalCurrentPath = await realpath(currentProjectPath);
            console.log(`UnityCode: Canonical current project path: ${canonicalCurrentPath}`);
            
            const matchingProcesses: UnityProcess[] = [];
            
            for (const proc of processes) {
                if (!proc.projectPath) {
                    console.log(`UnityCode: Process ${proc.pid} has no project path, excluding`);
                    continue;
                }
                
                try {
                    // Get canonical path for process project path
                    const canonicalProcPath = await realpath(proc.projectPath);
                    // Normalize paths to lowercase for case-insensitive comparison on Windows
                    const normalizedCurrentPath = canonicalCurrentPath.toLowerCase();
                    const normalizedProcPath = canonicalProcPath.toLowerCase();
                    const matches = normalizedProcPath === normalizedCurrentPath;
                    
                    console.log(`UnityCode: Process ${proc.pid} canonical path: ${canonicalProcPath}, matches: ${matches}`);
                    
                    if (matches) {
                        matchingProcesses.push(proc);
                    }
                } catch (error) {
                    console.log(`UnityCode: Failed to resolve path for process ${proc.pid} (${proc.projectPath}): ${error instanceof Error ? error.message : String(error)}`);
                    // Skip processes with unresolvable paths
                }
            }
            
            console.log(`UnityCode: Found ${matchingProcesses.length} processes matching current project`);
            return matchingProcesses;
            
        } catch (error) {
            console.error(`UnityCode: Failed to resolve current project path (${currentProjectPath}): ${error instanceof Error ? error.message : String(error)}`);
            // Return empty array if we can't resolve the current path
            return [];
        }
    }
    
}