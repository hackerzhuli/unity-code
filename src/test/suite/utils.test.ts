import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { isInsideDirectory, normalizePath } from '../../utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Utils Unit Tests', () => {
    
    describe('isInsideDirectory', () => {
        const tempDir = path.join(__dirname, 'temp-test-dir');
        const subDir = path.join(tempDir, 'subdir');
        const testFile = path.join(subDir, 'test.txt');
        const outsideDir = path.join(__dirname, 'outside-dir');
        const outsideFile = path.join(outsideDir, 'outside.txt');
        
        before(async () => {
            // Create test directory structure
            const mkdir = promisify(fs.mkdir);
            const writeFile = promisify(fs.writeFile);
            
            await mkdir(tempDir, { recursive: true });
            await mkdir(subDir, { recursive: true });
            await writeFile(testFile, 'test content');
            
            await mkdir(outsideDir, { recursive: true });
            await writeFile(outsideFile, 'outside content');
        });
        
        after(async () => {
            // Clean up test directories
            const rmdir = promisify(fs.rmdir);
            const unlink = promisify(fs.unlink);
            
            try {
                await unlink(testFile);
                await unlink(outsideFile);
                await rmdir(subDir);
                await rmdir(outsideDir);
                await rmdir(tempDir);
            } catch (_error) {
                // Ignore cleanup errors
            }
        });
        
        it('should return true when file is inside directory', async () => {
            const result = await isInsideDirectory(tempDir, testFile);
            assert.strictEqual(result, true);
        });
        
        it('should return true when subdirectory is inside directory', async () => {
            const result = await isInsideDirectory(tempDir, subDir);
            assert.strictEqual(result, true);
        });
        
        it('should return false when file is outside directory', async () => {
            const result = await isInsideDirectory(tempDir, outsideFile);
            assert.strictEqual(result, false);
        });
        
        it('should return false when directory is outside target directory', async () => {
            const result = await isInsideDirectory(tempDir, outsideDir);
            assert.strictEqual(result, false);
        });
        
        it('should return false when directory path does not exist', async () => {
            const nonExistentDir = path.join(__dirname, 'non-existent-dir');
            const result = await isInsideDirectory(nonExistentDir, testFile);
            assert.strictEqual(result, false);
        });
        
        it('should return false when file path does not exist', async () => {
            const nonExistentFile = path.join(tempDir, 'non-existent.txt');
            const result = await isInsideDirectory(tempDir, nonExistentFile);
            assert.strictEqual(result, false);
        });
        
        it('should return false when directory path is actually a file', async () => {
            const result = await isInsideDirectory(testFile, subDir);
            assert.strictEqual(result, false);
        });
        
        it('should handle relative paths correctly', async () => {
            const relativeTempDir = path.relative(process.cwd(), tempDir);
            const relativeTestFile = path.relative(process.cwd(), testFile);
            const result = await isInsideDirectory(relativeTempDir, relativeTestFile);
            assert.strictEqual(result, true);
        });
        
        it('should handle paths with different case on Windows', async () => {
            if (process.platform === 'win32') {
                const upperCaseDir = tempDir.toUpperCase();
                const lowerCaseFile = testFile.toLowerCase();
                const result = await isInsideDirectory(upperCaseDir, lowerCaseFile);
                assert.strictEqual(result, true);
            }
        });
    });
    

    
    describe('normalizePath', () => {
        const testDir = path.join(__dirname, 'normalize-test-dir');
        const testFile = path.join(testDir, 'test-file.txt');
        const nestedDir = path.join(testDir, 'nested');
        const nestedFile = path.join(nestedDir, 'nested-file.txt');
        
        before(async () => {
            // Create test directory structure
            const mkdir = promisify(fs.mkdir);
            const writeFile = promisify(fs.writeFile);
            
            await mkdir(testDir, { recursive: true });
            await mkdir(nestedDir, { recursive: true });
            await writeFile(testFile, 'test content');
            await writeFile(nestedFile, 'nested content');
        });
        
        after(async () => {
            // Clean up test directories
            const rmdir = promisify(fs.rmdir);
            const unlink = promisify(fs.unlink);
            
            try {
                await unlink(testFile);
                await unlink(nestedFile);
                await rmdir(nestedDir);
                await rmdir(testDir);
            } catch (error) {
                console.warn('Cleanup failed:', error);
            }
        });
        
        it('should return the same normalized path for absolute paths', async () => {
            const normalizedPath1 = await normalizePath(testFile);
            const normalizedPath2 = await normalizePath(testFile);
            
            assert.strictEqual(normalizedPath1, normalizedPath2);
            assert.strictEqual(typeof normalizedPath1, 'string');
            assert.strictEqual(normalizedPath1.length > 0, true);
        });
        
        it('should return the same normalized path for relative and absolute paths of the same file', async () => {
            const absolutePath = testFile;
            const relativePath = path.relative(process.cwd(), testFile);
            
            const normalizedAbsolute = await normalizePath(absolutePath);
            const normalizedRelative = await normalizePath(relativePath);
            
            assert.strictEqual(normalizedAbsolute, normalizedRelative);
        });
        
        it('should handle paths with different separators on Windows', async () => {
            if (process.platform === 'win32') {
                const pathWithBackslashes = testFile;
                const pathWithForwardSlashes = testFile.replace(/\\/g, '/');
                
                const normalized1 = await normalizePath(pathWithBackslashes);
                const normalized2 = await normalizePath(pathWithForwardSlashes);
                
                assert.strictEqual(normalized1, normalized2);
            }
        });
        
        it('should handle paths with different case on Windows', async () => {
            if (process.platform === 'win32') {
                const lowerCasePath = testFile.toLowerCase();
                const upperCasePath = testFile.toUpperCase();
                const mixedCasePath = testFile;
                
                const normalized1 = await normalizePath(lowerCasePath);
                const normalized2 = await normalizePath(upperCasePath);
                const normalized3 = await normalizePath(mixedCasePath);
                
                // On Windows, fs.realpath preserves the actual case from the file system
                // So we test that all variations resolve to valid paths, but they may have different cases
                assert.strictEqual(typeof normalized1, 'string');
                assert.strictEqual(typeof normalized2, 'string');
                assert.strictEqual(typeof normalized3, 'string');
                
                // Test case-insensitive comparison
                assert.strictEqual(normalized1.toLowerCase(), normalized2.toLowerCase());
                assert.strictEqual(normalized2.toLowerCase(), normalized3.toLowerCase());
            }
        });
        
        it('should handle paths with redundant separators', async () => {
            const pathWithExtraSeparators = testFile.replace(path.sep, path.sep + path.sep);
            
            const normalizedOriginal = await normalizePath(testFile);
            const normalizedExtra = await normalizePath(pathWithExtraSeparators);
            
            assert.strictEqual(normalizedOriginal, normalizedExtra);
        });
        
        it('should handle paths with dot notation (current directory)', async () => {
            const pathWithDot = path.join(path.dirname(testFile), '.', path.basename(testFile));
            
            const normalizedOriginal = await normalizePath(testFile);
            const normalizedDot = await normalizePath(pathWithDot);
            
            assert.strictEqual(normalizedOriginal, normalizedDot);
        });
        
        it('should handle paths with double dot notation (parent directory)', async () => {
            const pathWithDoubleDot = path.join(nestedDir, '..', path.basename(testFile));
            
            const normalizedOriginal = await normalizePath(testFile);
            const normalizedDoubleDot = await normalizePath(pathWithDoubleDot);
            
            assert.strictEqual(normalizedOriginal, normalizedDoubleDot);
        });
        
        it('should return original path for non-existent files', async () => {
            const nonExistentPath = path.join(testDir, 'non-existent-file.txt');
            
            const result = await normalizePath(nonExistentPath);
            
            assert.strictEqual(result, nonExistentPath);
        });
        
        it('should normalize directory paths consistently', async () => {
            const dirPath1 = testDir;
            const dirPath2 = testDir + path.sep;
            const dirPath3 = path.join(testDir, '.');
            
            const normalized1 = await normalizePath(dirPath1);
            const normalized2 = await normalizePath(dirPath2);
            const normalized3 = await normalizePath(dirPath3);
            
            assert.strictEqual(normalized1, normalized2);
            assert.strictEqual(normalized2, normalized3);
        });
        
        it('should handle complex path combinations consistently', async () => {
            // Create various representations of the same file path
            const variations = [
                testFile,
                path.resolve(testFile),
                path.join(path.dirname(testFile), '.', path.basename(testFile)),
                path.join(nestedDir, '..', path.basename(testFile))
            ];
            
            if (process.platform === 'win32') {
                variations.push(
                    testFile.toLowerCase(),
                    testFile.toUpperCase(),
                    testFile.replace(/\\/g, '/')
                );
            }
            
            const normalizedPaths = await Promise.all(
                variations.map(variation => normalizePath(variation))
            );
            
            // All normalized paths should be identical
            const firstNormalized = normalizedPaths[0];
            for (let i = 1; i < normalizedPaths.length; i++) {
                assert.strictEqual(
                    normalizedPaths[i], 
                    firstNormalized,
                    `Path variation ${i} (${variations[i]}) normalized to ${normalizedPaths[i]} instead of ${firstNormalized}`
                );
            }
        });
    });
    

    
});