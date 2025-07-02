import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * Supported platforms for native binaries
 */
export enum Platform {
    WindowsX64 = 'win_x64',
    WindowsArm64 = 'win_arm64',
    LinuxX64 = 'linux_x64',
    LinuxArm64 = 'linux_arm64',
    MacOSX64 = 'mac_x64',
    MacOSArm64 = 'mac_arm64'
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
            this.currentPlatform = Platform.WindowsX64;
            this.platformDetectionFailed = true;
        }
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
        const extension = this.isWindowsPlatform() ? '.exe' : '';
        return path.join(binDir, `${binaryName}${extension}`);
    }
    
    /**
     * Check if the current platform is Windows
     */
    private isWindowsPlatform(): boolean {
        return this.currentPlatform === Platform.WindowsX64 || this.currentPlatform === Platform.WindowsArm64;
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
     * Detect the current platform and architecture
     */
    private detectPlatform(): Platform {
        const platform = os.platform();
        const arch = os.arch();
        
        switch (platform) {
            case 'win32':
                if (arch === 'x64') {
                    return Platform.WindowsX64;
                } else if (arch === 'arm64') {
                    return Platform.WindowsArm64;
                }
                throw new Error(`Unsupported Windows architecture: ${arch}. Supported architectures: x64, arm64.`);
            
            case 'linux':
                if (arch === 'x64') {
                    return Platform.LinuxX64;
                } else if (arch === 'arm64') {
                    return Platform.LinuxArm64;
                }
                throw new Error(`Unsupported Linux architecture: ${arch}. Supported architectures: x64, arm64.`);
            
            case 'darwin':
                if (arch === 'x64') {
                    return Platform.MacOSX64;
                } else if (arch === 'arm64') {
                    return Platform.MacOSArm64;
                }
                throw new Error(`Unsupported macOS architecture: ${arch}. Supported architectures: x64, arm64.`);
            
            default:
                throw new Error(`Unsupported platform: ${platform}. Supported platforms: win32, linux, darwin.`);
        }
    }
}