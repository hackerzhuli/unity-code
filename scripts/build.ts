#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Build class for compiling and bundling TypeScript code
 */
class Build {
  private projectRoot: string;
  private srcDir: string;
  private outDir: string;
  private entryPoint: string;

  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.srcDir = path.join(this.projectRoot, 'src');
    this.outDir = path.join(this.projectRoot, 'out');
    this.entryPoint = path.join(this.srcDir, 'extension.ts');
  }

  /**
   * Ensure esbuild is available
   */
  private ensureEsbuildDependency(): void {
    try {
      execSync('npx esbuild --version', { 
        cwd: this.projectRoot, 
        stdio: 'pipe' 
      });
    } catch (_error) {
      console.log('Installing esbuild...');
      execSync('npm install --save-dev esbuild', { 
        cwd: this.projectRoot, 
        stdio: 'inherit' 
      });
    }
  }

  /**
   * Clean the output directory
   */
  private clean(): void {
    console.log('Cleaning output directory...');
    try {
      execSync('npx rimraf out', { 
        cwd: this.projectRoot, 
        stdio: 'inherit' 
      });
    } catch (error) {
      console.warn('Failed to clean output directory:', error);
    }
  }

  /**
   * Create output directory if it doesn't exist
   */
  private ensureOutDir(): void {
    if (!fs.existsSync(this.outDir)) {
      fs.mkdirSync(this.outDir, { recursive: true });
    }
  }

  /**
   * Bundle TypeScript code using esbuild
   */
  private bundle(): void {
    console.log('Bundling TypeScript code...');
    
    const esbuildArgs = [
      this.entryPoint,
      '--bundle',
      '--outfile=' + path.join(this.outDir, 'extension.js'),
      '--external:vscode',
      '--format=cjs',
      '--platform=node',
      '--target=node18',
      '--sourcemap',
      '--minify'
    ];

    try {
      execSync(`npx esbuild ${esbuildArgs.join(' ')}`, { 
        cwd: this.projectRoot, 
        stdio: 'inherit' 
      });
      console.log('Bundle created successfully!');
    } catch (error) {
      throw new Error(`Bundling failed: ${error}`);
    }
  }



  /**
   * Main build method
   */
  public async build(): Promise<void> {
    console.log('Starting Unity Code extension build...');

    try {
      // Ensure dependencies
      this.ensureEsbuildDependency();

      // Clean output directory
      this.clean();

      // Ensure output directory exists
      this.ensureOutDir();

      // Bundle main extension code
      this.bundle();

      console.log('Build completed successfully!');
    } catch (error) {
      console.error('Build failed:', error);
      process.exit(1);
    }
  }
}

// Main execution
if (require.main === module) {
  const build = new Build();
  build.build().catch((error) => {
    console.error('Build script failed:', error);
    process.exit(1);
  });
}

export { Build };