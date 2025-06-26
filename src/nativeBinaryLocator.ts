import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * Supported platforms for native binaries
 */
export enum Platform {
    Windows = 'win_x64',
    Linux = 'linux_x64',
    MacOS = 'mac_arm64'
}

/**
 * Available native binaries
 */
export enum NativeBinary {
    UnityCodeNative = 'unity_code_native',
    MonoDebugger = 'MonoDebugger'
}

/**
 * class for locating native binaries across platforms
 */
export class NativeBinaryLocator {
    private extensionRoot: string;
    private currentPlatform: Platform;
    
    private platformDetectionFailed: boolean = false;
    
    public constructor(extensionRoot: string) {
        this.extensionRoot = extensionRoot;
        try {
            this.currentPlatform = this.detectPlatform();
            this.platformDetectionFailed = false;
        } catch (error) {
            console.warn(`NativeBinaryLocator: ${error}`);
            // Set to a default value but mark detection as failed
            this.currentPlatform = Platform.Windows;
            this.platformDetectionFailed = true;
        }
    }

    /**
     * Check if the current platform is supported
     */
    public isPlatformSupported(): boolean {
        // If platform detection failed, it's not supported
        if (this.platformDetectionFailed) {
            return false;
        }
        
        // Currently only Windows is fully supported
        return this.currentPlatform === Platform.Windows;
    }

    /**
     * Get the path to unity_code_native binary
     * @returns Path to binary or undefined if not found or platform detection failed
     */
    public getUnityCodeNativePath(): string | undefined {
        if (this.platformDetectionFailed) {
            return undefined;
        }
        const binaryPath = this.getBinaryPath(NativeBinary.UnityCodeNative);
        return this.binaryExists(binaryPath) ? binaryPath : undefined;
    }
    
    /**
     * Get the path to MonoDebugger binary
     * @returns Path to binary or undefined if not found or platform detection failed
     */
    public getMonoDebuggerPath(): string | undefined {
        if (this.platformDetectionFailed) {
            return undefined;
        }
        const binaryPath = this.getBinaryPath(NativeBinary.MonoDebugger);
        return this.binaryExists(binaryPath) ? binaryPath : undefined;
    }
    
    /**
     * Get the base directory for native binaries on current platform
     */
    private getBinDirectory(): string {
        return path.join(this.extensionRoot, 'bin', this.currentPlatform);
    }
    
    /**
     * Get the full path to a native binary
     */
    private getBinaryPath(binaryName: NativeBinary): string {
        const binDir = this.getBinDirectory();
        const extension = this.currentPlatform === Platform.Windows ? '.exe' : '';
        return path.join(binDir, `${binaryName}${extension}`);
    }
    
    /**
     * Check if a binary exists at the given path
     */
    private binaryExists(binaryPath: string): boolean {
        try {
            return fs.existsSync(binaryPath) && fs.statSync(binaryPath).isFile();
        } catch {
            return false;
        }
    }
        
    /**
     * Detect the current platform and validate architecture compatibility
     */
    private detectPlatform(): Platform {
        const platform = os.platform();
        const arch = os.arch();
        
        switch (platform) {
            case 'win32':
                // Windows: support x64 architecture
                if (arch === 'x64') {
                    return Platform.Windows;
                }
                throw new Error(`Unsupported Windows architecture: ${arch}. Only x64 is supported.`);
            
            case 'linux':
                // Linux: support x64 architecture
                if (arch === 'x64') {
                    return Platform.Linux;
                }
                throw new Error(`Unsupported Linux architecture: ${arch}. Only x64 is supported.`);
            
            case 'darwin':
                // macOS: support arm64 architecture (Apple Silicon)
                if (arch === 'arm64') {
                    return Platform.MacOS;
                }
                throw new Error(`Unsupported macOS architecture: ${arch}. Only arm64 is supported.`);
            
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }
    }
}