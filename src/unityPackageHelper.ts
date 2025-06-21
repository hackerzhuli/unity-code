import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const access = promisify(fs.access);

export interface PackageInfo {
    name: string;
    version: string;
    displayName?: string;
    description?: string;
    directoryName: string;
    directoryPath: string;
    assemblies: AssemblyInfo[];
}

export interface AssemblyInfo {
    name: string;
    asmdefPath: string;
    rootNamespace?: string;
    includePlatforms?: string[];
    excludePlatforms?: string[];
}

/**
 * Helper class to find Unity packages in PackageCache directory
 */
export class UnityPackageHelper {
    private packages: Map<string, PackageInfo> = new Map();
    private assemblyToPackage: Map<string, PackageInfo> = new Map();
    private scannedDirectories: Set<string> = new Set();
    private packageCachePath: string;

    constructor(unityProjectPath: string) {
        this.packageCachePath = path.join(unityProjectPath, 'Library', 'PackageCache');
    }

    /**
     * Get package information by package name
     * @param packageName The name of the package (e.g., "com.unity.inputsystem")
     * @returns PackageInfo or undefined if not found
     */
    public getPackageByName(packageName: string): PackageInfo | undefined {
        return this.packages.get(packageName);
    }

    /**
     * Get package information by assembly/dll name
     * @param assemblyName The name of the assembly (e.g., "Unity.InputSystem")
     * @returns PackageInfo or undefined if not found
     */
    public getPackageByAssembly(assemblyName: string): PackageInfo | undefined {
        return this.assemblyToPackage.get(assemblyName);
    }

    /**
     * Get all packages
     * @returns Array of all PackageInfo
     */
    public getAllPackages(): PackageInfo[] {
        return Array.from(this.packages.values());
    }

    /**
     * Update packages' information by scanning the PackageCache directory
     * @returns Promise<void>
     */
    public async updatePackages(): Promise<void> {
        try {
            // Check if PackageCache directory exists
            await access(this.packageCachePath, fs.constants.F_OK);
        } catch {
            console.log('UnityCode: PackageCache directory not found, skipping package scan');
            return;
        }

        try {
            const packageDirectories = await readdir(this.packageCachePath);

            for (const dirName of packageDirectories) {
                const dirPath = path.join(this.packageCachePath, dirName);
                
                try {
                    const dirStat = await stat(dirPath);
                    
                    // Skip if not a directory
                    if (!dirStat.isDirectory()) {
                        continue;
                    }

                    // Skip if already scanned - don't scan any directory twice
                    if (this.scannedDirectories.has(dirName)) {
                        continue;
                    }
                    
                    // Mark as scanned immediately to avoid duplicate processing
                    this.scannedDirectories.add(dirName);

                    // Parse package name from directory name (format: packagename@hash)
                    const atIndex = dirName.lastIndexOf('@');
                    if (atIndex === -1) {
                        continue; // Invalid package directory format
                    }

                    const packageName = dirName.substring(0, atIndex);
                    
                    // Scan this package
                    const packageInfo = await this.scanPackage(dirPath, dirName, packageName);
                    if (packageInfo) {
                        // Add new package
                        this.packages.set(packageName, packageInfo);
                    }
                } catch (error) {
                    console.error(`UnityCode: Error scanning package directory ${dirName}:`, error);
                }
            }

            // Clear assembly mappings - will rebuild after scanning
            this.assemblyToPackage.clear();
            // Rebuild assembly mappings for all packages after scanning
            for (const packageInfo of this.packages.values()) {
                for (const assembly of packageInfo.assemblies) {
                    this.assemblyToPackage.set(assembly.name, packageInfo);
                }
            }

        } catch (error) {
            console.error('UnityCode: Error updating packages:', error);
        }
    }

    /**
     * Scan a single package directory
     * @param packagePath The full path to the package directory
     * @param directoryName The directory name
     * @param packageName The extracted package name
     * @returns Promise<PackageInfo | null>
     */
    private async scanPackage(packagePath: string, directoryName: string, packageName: string): Promise<PackageInfo | null> {
        try {
            // Read package.json
            const packageJsonPath = path.join(packagePath, 'package.json');
            const packageJsonContent = await readFile(packageJsonPath, 'utf8');
            const packageJson = JSON.parse(packageJsonContent);

            const packageInfo: PackageInfo = {
                name: packageJson.name || packageName,
                version: packageJson.version || 'unknown',
                displayName: packageJson.displayName,
                description: packageJson.description,
                directoryName,
                directoryPath: packagePath,
                assemblies: []
            };

            // Scan for assembly definition files
            packageInfo.assemblies = await this.scanAssemblyDefinitions(packagePath);

            return packageInfo;
        } catch (error) {
            console.error(`UnityCode: Error scanning package ${packageName}:`, error);
            return null;
        }
    }

    /**
     * Scan for assembly definition files in a package
     * @param packagePath The package directory path
     * @returns Promise<AssemblyInfo[]>
     */
    private async scanAssemblyDefinitions(packagePath: string): Promise<AssemblyInfo[]> {
        const assemblies: AssemblyInfo[] = [];

        try {
            const subdirectories = await readdir(packagePath);

            for (const subdir of subdirectories) {
                const subdirPath = path.join(packagePath, subdir);
                
                try {
                    const subdirStat = await stat(subdirPath);
                    if (!subdirStat.isDirectory()) {
                        continue;
                    }

                    // Look for the .asmdef file in this subdirectory (only one per directory)
                    const files = await readdir(subdirPath);
                    const asmdefFile = files.find(file => file.endsWith('.asmdef'));

                    if (asmdefFile) {
                        const asmdefPath = path.join(subdirPath, asmdefFile);
                        const assemblyInfo = await this.parseAssemblyDefinition(asmdefPath);
                        if (assemblyInfo) {
                            assemblies.push(assemblyInfo);
                        }
                    }
                } catch {
                    // Skip subdirectories that can't be read
                    continue;
                }
            }
        } catch (error) {
            console.error(`UnityCode: Error scanning assembly definitions in ${packagePath}:`, error);
        }

        return assemblies;
    }

    /**
     * Parse an assembly definition file
     * @param asmdefPath The path to the .asmdef file
     * @returns Promise<AssemblyInfo | null>
     */
    private async parseAssemblyDefinition(asmdefPath: string): Promise<AssemblyInfo | null> {
        try {
            const asmdefContent = await readFile(asmdefPath, 'utf8');
            const asmdef = JSON.parse(asmdefContent);

            return {
                name: asmdef.name || path.basename(asmdefPath, '.asmdef'),
                asmdefPath,
                rootNamespace: asmdef.rootNamespace
            };
        } catch (error) {
            console.error(`UnityCode: Error parsing assembly definition ${asmdefPath}:`, error);
            return null;
        }
    }

    /**
     * Get the last scan time
     * @returns number The timestamp of the last scan
     */
    /**
     * Clear all cached package information
     */
    public clear(): void {
        this.packages.clear();
        this.assemblyToPackage.clear();
        this.scannedDirectories.clear();
    }
}