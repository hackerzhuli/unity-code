import * as si from 'systeminformation';

export interface UnityProcess {
    pid: number;
    name: string;
    command?: string;
    parentPid?: number;
}

export class UnityProcessDetector {
    private static readonly UNITY_PROCESS_NAMES = {
        win32: ['Unity.exe'],
        darwin: ['Unity'],
        linux: ['Unity']
    };

    /**
     * Detects running Unity editor processes, excluding child processes and other Unity tools
     * @returns Array of Unity editor process information
     */
    public async detectUnityProcesses(): Promise<UnityProcess[]> {
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
            
            // Convert to our interface format
            const result: UnityProcess[] = parentProcesses.map(proc => ({
                pid: proc.pid || 0,
                name: proc.name || '',
                command: proc.command,
                parentPid: proc.parentPid
            })).filter(proc => proc.pid > 0);
            
            console.log(`UnityCode: Returning ${result.length} valid Unity processes`);
            result.forEach(proc => {
                console.log(`UnityCode: Unity process - PID: ${proc.pid}, Name: ${proc.name}`);
            });
            
            return result;
            
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
                    
                    if (isUnityParent) {
                        console.log(`UnityCode: Filtering out child Unity process:`, {
                            childPid: proc.pid,
                            childName: proc.name,
                            parentPid: proc.parentPid,
                            parentName: parentProc.name
                        });
                    }
                    
                    return isUnityParent;
                }
                return false;
            });
            
            return !hasUnityParent;
        });
    }
}