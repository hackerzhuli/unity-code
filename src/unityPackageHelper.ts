import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { isInsideDirectory, normalizePath } from './utils';
import { VoidEventEmitter } from './eventEmitter';

const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const access = promisify(fs.access);

export interface PackageInfo {
    name: string;
    version: string;
    displayName?: string;
    description?: string;
    documentationUrl?: string;
    directoryName: string;
    directoryPath: string;
    assemblies: AssemblyInfo[];
    isEmbedded: boolean;
}

export interface AssemblyInfo {
    name: string;
    asmdefPath: string;
    rootNamespace?: string;
    includePlatforms?: string[];
    excludePlatforms?: string[];
}

/**
 * Helper class to find Unity packages in PackageCache and Packages directories
 */
export class UnityPackageHelper {
    private packages: Map<string, PackageInfo> = new Map();
    private assemblyToPackage: Map<string, PackageInfo> = new Map();
    private scannedDirectories: Set<string> = new Set();
    private scannedEmbeddedDirectories: Set<string> = new Set();
    private packageCachePath: string;
    private packagesPath: string;
    
    /**
     * Event emitted when packages are updated
     */
    public readonly onPackagesUpdated = new VoidEventEmitter();

    constructor(unityProjectPath: string) {
        this.packageCachePath = path.join(unityProjectPath, 'Library', 'PackageCache');
        this.packagesPath = path.join(unityProjectPath, 'Packages');
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
     * Checks if a file path is from any package in PackageCache or Packages
     * @param filePath The file path to check
     * @returns True if the file path is from a package, false otherwise
     */
    public isPackagePath(filePath: string): boolean {
        // Check if the path contains Library/PackageCache or Packages directory
        return filePath.includes('Library/PackageCache') || filePath.includes('Library\\PackageCache') ||
               filePath.includes('/Packages/') || filePath.includes('\\Packages\\');
    }

    /**
     * Get package information by file path - finds the package that contains the given path
     * @param filePath The file path to find the package for (can be package root or any file inside)
     * @returns PackageInfo or undefined if not found in any cached package
     */
    public async getPackageByPath(filePath: string): Promise<PackageInfo | undefined> {
        try {
            // Check all cached packages to see if the path is inside any of them
            for (const packageInfo of this.packages.values()) {
                if (await isInsideDirectory(packageInfo.directoryPath, filePath)) {
                    return packageInfo;
                }
                // Also check if the path exactly matches the package directory
                if (await normalizePath(path.resolve(filePath)) === await normalizePath(path.resolve(packageInfo.directoryPath))) {
                    return packageInfo;
                }
            }
            
            return undefined;
        } catch (error) {
            console.error('UnityCode: Error finding package by path:', error);
            return undefined;
        }
    }

    /**
     * Update packages' information by scanning the PackageCache and Packages directories
     * @returns Promise<void>
     */
    public async updatePackages(): Promise<void> {
        // Scan PackageCache directory
        await this.updatePackageCachePackages();
        
        // Scan Packages directory for embedded packages
        await this.updateEmbeddedPackages();

        this.assemblyToPackage.clear();
        // Rebuild assembly mappings for all packages after scanning
        for (const packageInfo of this.packages.values()) {
            for (const assembly of packageInfo.assemblies) {
                this.assemblyToPackage.set(assembly.name, packageInfo);
            }
        }
        
        // Emit event to notify that packages have been updated
        this.onPackagesUpdated.emit();
    }

    /**
     * Update packages' information by scanning the PackageCache directory
     * @returns Promise<void>
     */
    private async updatePackageCachePackages(): Promise<void> {
        try {
            // Check if PackageCache directory exists
            await access(this.packageCachePath, fs.constants.F_OK);
        } catch {
            console.log('UnityCode: PackageCache directory not found, skipping cached package scan');
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
                    const packageInfo = await this.scanPackage(dirPath, dirName, packageName, false);
                    if (packageInfo) {
                        // Add new package
                        this.packages.set(packageName, packageInfo);
                    }
                } catch (error) {
                    console.error(`UnityCode: Error scanning package directory ${dirName}:`, error);
                }
            }

        } catch (error) {
            console.error('UnityCode: Error updating cached packages:', error);
        }
    }

    /**
     * Update packages' information by scanning the Packages directory for embedded packages
     * @returns Promise<void>
     */
    private async updateEmbeddedPackages(): Promise<void> {
        // Clear existing embedded packages before scanning
        const embeddedPackageNames = Array.from(this.packages.values())
            .filter(pkg => pkg.isEmbedded)
            .map(pkg => pkg.name);
        
        for (const packageName of embeddedPackageNames) {
            this.packages.delete(packageName);
        }
        
        try {
            // Check if Packages directory exists
            await access(this.packagesPath, fs.constants.F_OK);
        } catch {
            console.log('UnityCode: Packages directory not found, skipping embedded package scan');
            return;
        }

        try {
            const packageDirectories = await readdir(this.packagesPath);

            for (const dirName of packageDirectories) {
                const dirPath = path.join(this.packagesPath, dirName);
                
                try {
                    const dirStat = await stat(dirPath);
                    
                    // Skip if not a directory
                    if (!dirStat.isDirectory()) {
                        continue;
                    }

                    // For embedded packages, we always rescan since we can't rely on directory name caching
                    // (directory name doesn't contain hash and might not match package name)
                    
                    // Check if this directory contains a package.json file
                    const packageJsonPath = path.join(dirPath, 'package.json');
                    try {
                        await access(packageJsonPath, fs.constants.F_OK);
                    } catch {
                        // Skip directories without package.json
                        continue;
                    }
                    
                    // Scan this embedded package
                    const packageInfo = await this.scanPackage(dirPath, dirName, dirName, true);
                    if (packageInfo) {
                        // Add new package (use actual package name from package.json)
                        this.packages.set(packageInfo.name, packageInfo);
                    }
                } catch (error) {
                    console.error(`UnityCode: Error scanning embedded package directory ${dirName}:`, error);
                }
            }

        } catch (error) {
            console.error('UnityCode: Error updating embedded packages:', error);
        }
    }

    /**
     * Scan a single package directory
     * @param packagePath The full path to the package directory
     * @param directoryName The directory name
     * @param packageName The extracted package name
     * @param isEmbedded Whether this is an embedded package from Packages directory
     * @returns Promise<PackageInfo | null>
     */
    private async scanPackage(packagePath: string, directoryName: string, packageName: string, isEmbedded: boolean): Promise<PackageInfo | null> {
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
                documentationUrl: packageJson.documentationUrl,
                directoryName,
                directoryPath: packagePath,
                assemblies: [],
                isEmbedded
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
     * Get all embedded packages
     * @returns Array of embedded PackageInfo
     */
    public getEmbeddedPackages(): PackageInfo[] {
        return Array.from(this.packages.values()).filter(pkg => pkg.isEmbedded);
    }

    /**
     * Get all cached packages
     * @returns Array of cached PackageInfo
     */
    public getCachedPackages(): PackageInfo[] {
        return Array.from(this.packages.values()).filter(pkg => !pkg.isEmbedded);
    }

    /**
     * Check if a package is embedded
     * @param packageName The name of the package
     * @returns True if the package is embedded, false if cached, undefined if not found
     */
    public isPackageEmbedded(packageName: string): boolean | undefined {
        const packageInfo = this.packages.get(packageName);
        return packageInfo?.isEmbedded;
    }

    /**
     * Clear all cached package information
     */
    public clear(): void {
        this.packages.clear();
        this.assemblyToPackage.clear();
        this.scannedDirectories.clear();
        this.scannedEmbeddedDirectories.clear();
    }
}