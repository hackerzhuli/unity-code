#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Configuration interface for platform-specific build settings
 */
interface PlatformConfig {
  /** Internal platform identifier */
  name: string;
  /** Directory path containing platform-specific binaries */
  binDir: string;
  /** Human-readable platform description */
  description: string;
  /** VS Code marketplace target identifier for vsce packaging */
  vsceTarget: string;
}

/**
 * Platform configurations for all supported architectures
 * Maps platform names to their specific build configurations
 */
const PLATFORMS: Record<string, PlatformConfig> = {
  win_x64: {
    name: 'win_x64',
    binDir: 'bin/win_x64',
    description: 'Windows x64',
    vsceTarget: 'win32-x64'
  },
  win_arm64: {
    name: 'win_arm64',
    binDir: 'bin/win_arm64',
    description: 'Windows ARM64',
    vsceTarget: 'win32-arm64'
  },
  linux_x64: {
    name: 'linux_x64',
    binDir: 'bin/linux_x64',
    description: 'Linux x64',
    vsceTarget: 'linux-x64'
  },
  linux_arm64: {
    name: 'linux_arm64',
    binDir: 'bin/linux_arm64',
    description: 'Linux ARM64',
    vsceTarget: 'linux-arm64'
  },
  mac_x64: {
    name: 'mac_x64',
    binDir: 'bin/mac_x64',
    description: 'macOS x64',
    vsceTarget: 'darwin-x64'
  },
  mac_arm64: {
    name: 'mac_arm64',
    binDir: 'bin/mac_arm64',
    description: 'macOS ARM64',
    vsceTarget: 'darwin-arm64'
  }
};

/** Path to the VS Code ignore file */
const VSCODEIGNORE_PATH = '.vscodeignore';
/** Backup path for the original VS Code ignore file */
const BACKUP_PATH = '.vscodeignore.backup';
/** Path to the main README file */
const README_PATH = 'README.md';
/** Path to the extension-specific README file */
const README_EXTENSION_PATH = 'README_MARKETPLACE.md';
/** Backup path for the original README file */
const README_BACKUP_PATH = 'README.md.backup';

/**
 * Package class for managing platform-specific build operations.
 * Mainly it runs vsce, but will ignore other platform directories.
 */
class Package {
  private originalVsCodeIgnore: string = '';
  private originalReadme: string = '';
  private projectRoot: string;

  /**
   * Initializes the Package builder with project root directory
   */
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
  }

  /**
   * Reads the current .vscodeignore file content
   * @returns The content of the .vscodeignore file
   */
  private readVsCodeIgnore(): string {
    const vscodeignorePath = path.join(this.projectRoot, VSCODEIGNORE_PATH);
    return fs.readFileSync(vscodeignorePath, 'utf8');
  }

  /**
   * Writes content to the .vscodeignore file
   * @param content The content to write to the file
   */
  private writeVsCodeIgnore(content: string): void {
    const vscodeignorePath = path.join(this.projectRoot, VSCODEIGNORE_PATH);
    fs.writeFileSync(vscodeignorePath, content, 'utf8');
  }

  /**
   * Creates a backup of the original .vscodeignore file
   * Stores the content in memory and creates a backup file on disk
   */
  private backupVsCodeIgnore(): void {
    this.originalVsCodeIgnore = this.readVsCodeIgnore();
    const backupPath = path.join(this.projectRoot, BACKUP_PATH);
    fs.writeFileSync(backupPath, this.originalVsCodeIgnore, 'utf8');
  }

  /**
   * Restores the original .vscodeignore file from backup
   * Removes the temporary backup file after restoration
   */
  private restoreVsCodeIgnore(): void {
    this.writeVsCodeIgnore(this.originalVsCodeIgnore);
    const backupPath = path.join(this.projectRoot, BACKUP_PATH);
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
  }

  /**
   * Reads the current README.md file content
   * @returns The content of the README.md file
   */
  private readReadme(): string {
    const readmePath = path.join(this.projectRoot, README_PATH);
    return fs.readFileSync(readmePath, 'utf8');
  }

  /**
   * Writes content to the README.md file
   * @param content The content to write to the README file
   */
  private writeReadme(content: string): void {
    const readmePath = path.join(this.projectRoot, README_PATH);
    fs.writeFileSync(readmePath, content, 'utf8');
  }

  /**
   * Creates a backup of the original README.md file
   * Stores the content in memory and creates a backup file on disk
   */
  private backupReadme(): void {
    this.originalReadme = this.readReadme();
    const backupPath = path.join(this.projectRoot, README_BACKUP_PATH);
    fs.writeFileSync(backupPath, this.originalReadme, 'utf8');
  }

  /**
   * Swaps the main README.md with the extension-specific README
   * This is necessary because the extension marketplace requires different content
   * than the development README
   * @throws Error if the extension README file is not found
   */
  private swapToExtensionReadme(): void {
    const extensionReadmePath = path.join(this.projectRoot, README_EXTENSION_PATH);
    if (!fs.existsSync(extensionReadmePath)) {
      throw new Error(`Extension README not found: ${extensionReadmePath}`);
    }
    const extensionReadmeContent = fs.readFileSync(extensionReadmePath, 'utf8');
    this.writeReadme(extensionReadmeContent);
  }

  /**
   * Restores the original README.md file from backup
   * Removes the temporary backup file after restoration
   */
  private restoreReadme(): void {
    this.writeReadme(this.originalReadme);
    const backupPath = path.join(this.projectRoot, README_BACKUP_PATH);
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
  }

  /**
   * Modifies the .vscodeignore file to exclude binaries for other platforms
   * This ensures that only the target platform's binaries are included in the package
   * @param targetPlatform The platform to build for (other platforms will be excluded)
   * @throws Error if the target platform is not recognized
   */
  private modifyVsCodeIgnoreForPlatform(targetPlatform: string): void {
    const platform = PLATFORMS[targetPlatform];
    if (!platform) {
      throw new Error(`Unknown platform: ${targetPlatform}`);
    }

    let content = this.originalVsCodeIgnore;
    
    // Add exclusions for all other platform directories
    const platformExclusions: string[] = [];
    
    Object.values(PLATFORMS).forEach(p => {
      if (p.name !== platform.name) {
        platformExclusions.push(`bin/${p.name}/**`);
      }
    });

    // Add the platform exclusions to the content
    if (platformExclusions.length > 0) {
      content += '\n# Temporary platform-specific exclusions\n';
      content += platformExclusions.join('\n') + '\n';
    }

    this.writeVsCodeIgnore(content);
  }

  /**
   * Executes the vsce package command for the specified platform
   * Creates a platform-specific .vsix file using VS Code Extension CLI
   * @param platform The platform configuration to package for
   * @throws Error if the vsce package command fails
   */
  private runVscePackage(platform: PlatformConfig): void {
    console.log(`Running vsce package for ${platform.vsceTarget}...`);
    try {
      execSync(`npx vsce package --target ${platform.vsceTarget}`, { 
        cwd: this.projectRoot, 
        stdio: 'inherit' 
      });
    } catch (error) {
      throw new Error(`vsce package failed: ${error}`);
    }
  }

  /**
   * Ensures that the VS Code Extension CLI (vsce) is available
   * Installs it globally if not found
   */
  private ensureVsceDependency(): void {
    try {
      execSync('npx vsce --version', { 
        cwd: this.projectRoot, 
        stdio: 'pipe' 
      });
    } catch (_error) {
      console.log('Installing @vscode/vsce...');
      execSync('npm install -g @vscode/vsce', { 
        cwd: this.projectRoot, 
        stdio: 'inherit' 
      });
    }
  }

  /**
   * Ensures that the Open VSX CLI (ovsx) is available
   * Installs it globally if not found (required for Open VSX marketplace publishing)
   */
  private ensureOvxDependency(): void {
    try {
      execSync('npx ovsx --version', { 
        cwd: this.projectRoot, 
        stdio: 'pipe' 
      });
    } catch (_error) {
      console.log('Installing ovsx...');
      execSync('npm install -g ovsx', { 
        cwd: this.projectRoot, 
        stdio: 'inherit' 
      });
    }
  }

  /**
   * Constructs the expected path to the generated .vsix file
   * The filename follows vsce's naming convention: name-target-version.vsix
   * @param platform The platform configuration
   * @returns The full path to the expected .vsix file
   */
  private getVsixFilePath(platform: PlatformConfig): string {
    // Read package.json to get name and version
    const packageJsonPath = path.join(this.projectRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const { name, version } = packageJson;
    
    // Construct the VSIX file name that vsce generates
    const vsixFileName = `${name}-${platform.vsceTarget}-${version}.vsix`;
    return path.join(this.projectRoot, vsixFileName);
  }

  /**
   * Publishes the generated .vsix file to the Open VSX marketplace
   * Open VSX is an open-source alternative to the VS Code marketplace
   * @param platform The platform configuration for the package to publish
   * @throws Error if the .vsix file is not found or publishing fails
   */
  private publishToOpenVSX(platform: PlatformConfig): void {
    const vsixPath = this.getVsixFilePath(platform);
    
    if (!fs.existsSync(vsixPath)) {
      throw new Error(`VSIX file not found: ${vsixPath}`);
    }
    
    console.log(`Publishing ${vsixPath} to Open VSX...`);
    try {
      execSync(`npx ovsx publish "${vsixPath}"`, { 
        cwd: this.projectRoot, 
        stdio: 'inherit' 
      });
      console.log('Successfully published to Open VSX!');
    } catch (error) {
      throw new Error(`Open VSX publish failed: ${error}`);
    }
  }

  /**
   * Main method to build the extension for a specific platform
   * Handles the complete build process including:
   * - Backing up and modifying configuration files
   * - Running vsce package command
   * - Optionally publishing to Open VSX marketplace
   * - Restoring original configuration files
   * 
   * @param targetPlatform The platform identifier to build for
   * @param publishToOpenVSX Whether to publish to Open VSX marketplace after building
   * @throws Error if the platform is unknown or any build step fails
   */
  public async buildForPlatform(targetPlatform: string, publishToOpenVSX: boolean = false): Promise<void> {
    const platform = PLATFORMS[targetPlatform];
    if (!platform) {
      console.error(`Error: Unknown platform '${targetPlatform}'`);
      console.log('Available platforms:', Object.keys(PLATFORMS).join(', '));
      process.exit(1);
    }

    console.log(`Building Unity Code extension for ${platform.description}...`);

    try {
      // Ensure vsce is available
      this.ensureVsceDependency();

      // Backup original .vscodeignore
      this.backupVsCodeIgnore();
      console.log('Backed up .vscodeignore');

      // Backup original README.md and swap to extension README
      this.backupReadme();
      this.swapToExtensionReadme();
      console.log('Swapped README.md with README_EXTENSION.md');

      // Modify .vscodeignore for the target platform
      this.modifyVsCodeIgnoreForPlatform(targetPlatform);
      console.log(`Modified .vscodeignore to exclude other platforms (keeping ${platform.binDir})`);

      // Run vsce package
      this.runVscePackage(platform);
      console.log('Extension packaged successfully!');

      // Publish to Open VSX if requested
      if (publishToOpenVSX) {
        this.ensureOvxDependency();
        this.publishToOpenVSX(platform);
      }

    } catch (error) {
      console.error('Build failed:', error);
      process.exit(1);
    } finally {
      // Always restore the original .vscodeignore and README
      this.restoreVsCodeIgnore();
      console.log('Restored original .vscodeignore');
      this.restoreReadme();
      console.log('Restored original README.md');
    }
  }
}

/**
 * Main execution block - runs when script is executed directly
 * Parses command line arguments and initiates the build process
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: npm run build:<platform> [--publish-open-vsx]');
    console.log('Available platforms:', Object.keys(PLATFORMS).join(', '));
    console.log('Example: npm run build:win_x64');
    console.log('Example with Open VSX publish: npm run build:win_x64 --publish-open-vsx');
    process.exit(1);
  }

  const targetPlatform = args[0];
  const publishToOpenVSX = args.includes('--publish-open-vsx');
  const builder = new Package();
  
  builder.buildForPlatform(targetPlatform, publishToOpenVSX).catch(error => {
    console.error('Build script failed:', error);
    process.exit(1);
  });
}

// Export the main class and platform configurations for external use
export { Package as PlatformBuilder, PLATFORMS };