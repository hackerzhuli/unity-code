#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface PlatformConfig {
  name: string;
  binDir: string;
  description: string;
  vsceTarget: string;
}

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

const VSCODEIGNORE_PATH = '.vscodeignore';
const BACKUP_PATH = '.vscodeignore.backup';

/**
 * Package class for managing platform-specific build operations.
 * Mainly it runs vsce, but will ignore other platform directories.
 */
class Package {
  private originalVsCodeIgnore: string = '';
  private projectRoot: string;

  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
  }

  private readVsCodeIgnore(): string {
    const vscodeignorePath = path.join(this.projectRoot, VSCODEIGNORE_PATH);
    return fs.readFileSync(vscodeignorePath, 'utf8');
  }

  private writeVsCodeIgnore(content: string): void {
    const vscodeignorePath = path.join(this.projectRoot, VSCODEIGNORE_PATH);
    fs.writeFileSync(vscodeignorePath, content, 'utf8');
  }

  private backupVsCodeIgnore(): void {
    this.originalVsCodeIgnore = this.readVsCodeIgnore();
    const backupPath = path.join(this.projectRoot, BACKUP_PATH);
    fs.writeFileSync(backupPath, this.originalVsCodeIgnore, 'utf8');
  }

  private restoreVsCodeIgnore(): void {
    this.writeVsCodeIgnore(this.originalVsCodeIgnore);
    const backupPath = path.join(this.projectRoot, BACKUP_PATH);
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }
  }

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

  private ensureVsceDependency(): void {
    try {
      execSync('npx vsce --version', { 
        cwd: this.projectRoot, 
        stdio: 'pipe' 
      });
    } catch (error) {
      console.log('Installing @vscode/vsce...');
      execSync('npm install -g @vscode/vsce', { 
        cwd: this.projectRoot, 
        stdio: 'inherit' 
      });
    }
  }

  private ensureOvxDependency(): void {
    try {
      execSync('npx ovsx --version', { 
        cwd: this.projectRoot, 
        stdio: 'pipe' 
      });
    } catch (error) {
      console.log('Installing ovsx...');
      execSync('npm install -g ovsx', { 
        cwd: this.projectRoot, 
        stdio: 'inherit' 
      });
    }
  }

  private getVsixFilePath(platform: PlatformConfig): string {
    // Read package.json to get name and version
    const packageJsonPath = path.join(this.projectRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const { name, version } = packageJson;
    
    // Construct the VSIX file name that vsce generates
    const vsixFileName = `${name}-${platform.vsceTarget}-${version}.vsix`;
    return path.join(this.projectRoot, vsixFileName);
  }

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
      // Always restore the original .vscodeignore
      this.restoreVsCodeIgnore();
      console.log('Restored original .vscodeignore');
    }
  }
}

// Main execution
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

export { Package as PlatformBuilder, PLATFORMS };