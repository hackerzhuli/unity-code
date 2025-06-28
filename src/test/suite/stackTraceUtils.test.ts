import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { parseUnityTestStackTraceSourceLocation, processTestStackTraceToMarkdown } from '../../stackTraceUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Stack Trace Utils Unit Tests', () => {
    
    describe('parseUnityTestStackTraceSourceLocation', () => {
        
        describe('Windows platform stack traces', () => {
            it('should parse Windows absolute path correctly', () => {
                const stackTrace = 'at Something.Yall.hallo.Huma.YallTest.AnotherMethod () [0x00001] in F:\\projects\\unity\\TestUnityCode\\Assets\\Scripts\\Editor\\YallTest.cs:32';
                const result = parseUnityTestStackTraceSourceLocation(stackTrace);
                
                assert.notStrictEqual(result, null);
                const expectedStartIndex = stackTrace.indexOf(' in ') + 4; // Position after " in "
                assert.strictEqual(result!.startIndex, expectedStartIndex);
                assert.strictEqual(result!.endIndex, stackTrace.length);
                assert.strictEqual(result!.filePath, 'F:\\projects\\unity\\TestUnityCode\\Assets\\Scripts\\Editor\\YallTest.cs');
                assert.strictEqual(result!.lineNumber, 32);
            });
            
            it('should parse Windows path with different drive letter', () => {
                const stackTrace = 'at MyNamespace.TestClass.TestMethod () [0x00001] in C:\\Unity\\Projects\\MyProject\\Assets\\Tests\\TestScript.cs:15';
                const result = parseUnityTestStackTraceSourceLocation(stackTrace);
                
                assert.notStrictEqual(result, null);
                assert.strictEqual(result!.filePath, 'C:\\Unity\\Projects\\MyProject\\Assets\\Tests\\TestScript.cs');
                assert.strictEqual(result!.lineNumber, 15);
            });
        });
        
        describe('macOS platform stack traces', () => {
            it('should parse macOS absolute path correctly', () => {
                const stackTrace = 'at Something.Yall.hallo.Huma.YallTest.AnotherMethod () [0x00001] in /Users/user/projects/unity/TestUnityCode/Assets/Scripts/Editor/YallTest.cs:32';
                const result = parseUnityTestStackTraceSourceLocation(stackTrace);
                
                assert.notStrictEqual(result, null);
                const expectedStartIndex = stackTrace.indexOf(' in ') + 4; // Position after " in "
                assert.strictEqual(result!.startIndex, expectedStartIndex);
                assert.strictEqual(result!.endIndex, stackTrace.length);
                assert.strictEqual(result!.filePath, '/Users/user/projects/unity/TestUnityCode/Assets/Scripts/Editor/YallTest.cs');
                assert.strictEqual(result!.lineNumber, 32);
            });
            
            it('should parse macOS path with spaces in directory names', () => {
                const stackTrace = 'at MyNamespace.TestClass.TestMethod () [0x00001] in /Users/john doe/Unity Projects/My Game/Assets/Scripts/GameLogic.cs:128';
                const result = parseUnityTestStackTraceSourceLocation(stackTrace);
                
                assert.notStrictEqual(result, null);
                assert.strictEqual(result!.filePath, '/Users/john doe/Unity Projects/My Game/Assets/Scripts/GameLogic.cs');
                assert.strictEqual(result!.lineNumber, 128);
            });
        });
        
        describe('Linux platform stack traces', () => {
            it('should parse Linux absolute path correctly', () => {
                const stackTrace = 'at Something.Yall.hallo.Huma.YallTest.AnotherMethod () [0x00001] in /home/user/projects/unity/TestUnityCode/Assets/Scripts/Editor/YallTest.cs:32';
                const result = parseUnityTestStackTraceSourceLocation(stackTrace);
                
                assert.notStrictEqual(result, null);
                const expectedStartIndex = stackTrace.indexOf(' in ') + 4; // Position after " in "
                assert.strictEqual(result!.startIndex, expectedStartIndex);
                assert.strictEqual(result!.endIndex, stackTrace.length);
                assert.strictEqual(result!.filePath, '/home/user/projects/unity/TestUnityCode/Assets/Scripts/Editor/YallTest.cs');
                assert.strictEqual(result!.lineNumber, 32);
            });
            
            it('should parse Linux path with different user directory', () => {
                const stackTrace = 'at TestNamespace.UninTest.ValidateLogic () [0x00001] in /home/developer/woinspace/unity-project/Assets/Tests/UnitTests.cs:99';
                const result = parseUnityTestStackTraceSourceLocation(stackTrace);
                
                assert.notStrictEqual(result, null);
                assert.strictEqual(result!.filePath, '/home/developer/woinspace/unity-project/Assets/Tests/UnitTests.cs');
                assert.strictEqual(result!.lineNumber, 99);
            });
        });
        
        describe('Different file extensions', () => {
            it('should parse .cs files', () => {
                const stackTrace = 'at Test.Method () [0x00001] in /path/to/Script.cs:10';
                const result = parseUnityTestStackTraceSourceLocation(stackTrace);
                
                assert.notStrictEqual(result, null);
                assert.strictEqual(result!.filePath, '/path/to/Script.cs');
                assert.strictEqual(result!.lineNumber, 10);
            });
            
            it('should parse .js files', () => {
                const stackTrace = 'at Test.Method () [0x00001] in /path/to/script.js:25';
                const result = parseUnityTestStackTraceSourceLocation(stackTrace);
                
                assert.notStrictEqual(result, null);
                assert.strictEqual(result!.filePath, '/path/to/script.js');
                assert.strictEqual(result!.lineNumber, 25);
            });
            
            it('should parse .cpp files', () => {
                const stackTrace = 'at Native.Function () [0x00001] in /path/to/native.cpp:150';
                const result = parseUnityTestStackTraceSourceLocation(stackTrace);
                
                assert.notStrictEqual(result, null);
                assert.strictEqual(result!.filePath, '/path/to/native.cpp');
                assert.strictEqual(result!.lineNumber, 150);
            });
        });
        
        describe('Edge cases and invalid inputs', () => {
            it('should return null for stack trace without " in " keyword', () => {
                const stackTrace = 'at Something.Method () [0x00001] at SomeLocation:32';
                const result = parseUnityTestStackTraceSourceLocation(stackTrace);
                
                assert.strictEqual(result, null);
            });
            
            it('should return null for stack trace without line number', () => {
                const stackTrace = 'at Something.Method () [0x00001] in /path/to/file.cs';
                const result = parseUnityTestStackTraceSourceLocation(stackTrace);
                
                assert.strictEqual(result, null);
            });
            
            it('should return null for stack trace with invalid file extension', () => {
                const stackTrace = 'at Something.Method () [0x00001] in /path/to/file.txt:32';
                const result = parseUnityTestStackTraceSourceLocation(stackTrace);
                
                assert.strictEqual(result, null);
            });
            
            it('should return null for empty string', () => {
                const result = parseUnityTestStackTraceSourceLocation('');
                assert.strictEqual(result, null);
            });
            
            it('should return null for stack trace with invalid line number format', () => {
                const stackTrace = 'at Something.Method () [0x00001] in /path/to/file.cs:abc';
                const result = parseUnityTestStackTraceSourceLocation(stackTrace);
                
                assert.strictEqual(result, null);
            });
            
            it('should handle multiple colons in file path correctly', () => {
                const stackTrace = 'at Something.Method () [0x00001] in C:\\path:with:colons\\file.cs:42';
                const result = parseUnityTestStackTraceSourceLocation(stackTrace);
                
                assert.notStrictEqual(result, null);
                assert.strictEqual(result!.filePath, 'C:\\path:with:colons\\file.cs');
                assert.strictEqual(result!.lineNumber, 42);
            });
            
            it('should handle very large line numbers', () => {
                const stackTrace = 'at Something.Method () [0x00001] in /path/to/file.cs:999999';
                const result = parseUnityTestStackTraceSourceLocation(stackTrace);
                
                assert.notStrictEqual(result, null);
                assert.strictEqual(result!.lineNumber, 999999);
            });
        });
        
        describe('Real-world examples from documentation', () => {
            it('should parse the first example from UnityTestExplorer.md', () => {
                const stackTrace = 'at Something.Yall.hallo.Huma.YallTest.AnotherMethod () [0x00001] in F:\\projects\\unity\\TestUnityCode\\Assets\\Scripts\\Editor\\YallTest.cs:32';
                const result = parseUnityTestStackTraceSourceLocation(stackTrace);
                
                assert.notStrictEqual(result, null);
                assert.strictEqual(result!.filePath, 'F:\\projects\\unity\\TestUnityCode\\Assets\\Scripts\\Editor\\YallTest.cs');
                assert.strictEqual(result!.lineNumber, 32);
                
                // Verify that the extracted substring matches expected source location
                const extractedSourceLocation = stackTrace.substring(result!.startIndex, result!.endIndex);
                assert.strictEqual(extractedSourceLocation, 'F:\\projects\\unity\\TestUnityCode\\Assets\\Scripts\\Editor\\YallTest.cs:32');
            });
            
            it('should parse the second example from UnityTestExplorer.md', () => {
                const stackTrace = 'at Something.Yall.hallo.Huma.YallTest.Test2 () [0x00001] in F:\\projects\\unity\\TestUnityCode\\Assets\\Scripts\\Editor\\YallTest.cs:27';
                const result = parseUnityTestStackTraceSourceLocation(stackTrace);
                
                assert.notStrictEqual(result, null);
                assert.strictEqual(result!.filePath, 'F:\\projects\\unity\\TestUnityCode\\Assets\\Scripts\\Editor\\YallTest.cs');
                assert.strictEqual(result!.lineNumber, 27);
                
                // Verify that the extracted substring matches expected source location
                const extractedSourceLocation = stackTrace.substring(result!.startIndex, result!.endIndex);
                assert.strictEqual(extractedSourceLocation, 'F:\\projects\\unity\\TestUnityCode\\Assets\\Scripts\\Editor\\YallTest.cs:27');
            });
        });
    });
    
    describe('processTestStackTraceToMarkdown', () => {
        const tempDir = path.join(__dirname, 'temp-stack-trace-test-dir');
        const testProjectPath = path.join(tempDir, 'TestProject');
        const testFile = path.join(testProjectPath, 'Assets', 'Scripts', 'TestScript.cs');
        
        before(async () => {
            // Create test directory structure
            const mkdir = promisify(fs.mkdir);
            const writeFile = promisify(fs.writeFile);
            
            await mkdir(path.dirname(testFile), { recursive: true });
            await writeFile(testFile, 'test content');
        });
        
        after(async () => {
            // Clean up test directories
            const rmdir = promisify(fs.rmdir);
            const unlink = promisify(fs.unlink);
            
            try {
                await unlink(testFile);
                await rmdir(path.dirname(testFile));
                await rmdir(path.dirname(path.dirname(testFile)));
                await rmdir(testProjectPath);
                await rmdir(tempDir);
            } catch (error) {
                console.warn('Cleanup failed:', error);
            }
        });
        
        it('should return empty string for empty stack trace', async () => {
            const result = await processTestStackTraceToMarkdown('', testProjectPath);
            assert.strictEqual(result, '');
        });
        
        it('should return original stack trace when no project path provided', async () => {
            const stackTrace = 'at Something.Method () [0x00001] in /path/to/file.cs:10';
            const result = await processTestStackTraceToMarkdown(stackTrace, '');
            assert.strictEqual(result, stackTrace);
        });
        
        it('should process stack trace with absolute path within project', async () => {
            const stackTrace = `at TestNamespace.TestClass.TestMethod () [0x00001] in ${testFile}:25`;
            const result = await processTestStackTraceToMarkdown(stackTrace, testProjectPath);
            
            // Should contain markdown link with relative path
            assert.strictEqual(result.includes('[Assets/Scripts/TestScript.cs:25]'), true);
            assert.strictEqual(result.includes('file:///'), true);
        });
        
        it('should keep original line when no source location found', async () => {
            const stackTrace = 'Some log message without source location';
            const result = await processTestStackTraceToMarkdown(stackTrace, testProjectPath);
            assert.strictEqual(result, stackTrace);
        });
        
        it('should handle multiple lines in stack trace', async () => {
            const stackTrace = [
                `at TestNamespace.TestClass.TestMethod () [0x00001] in ${testFile}:25`,
                'Some other log line',
                `at AnotherNamespace.AnotherClass.AnotherMethod () [0x00002] in ${testFile}:30`
            ].join('\n');
            
            const result = await processTestStackTraceToMarkdown(stackTrace, testProjectPath);
            const lines = result.split('\n\n');
            
            // Should have 3 lines separated by double newlines
            assert.strictEqual(lines.length, 3);
            
            // First and third lines should contain markdown links
            assert.strictEqual(lines[0].includes('[Assets/Scripts/TestScript.cs:25]'), true);
            assert.strictEqual(lines[2].includes('[Assets/Scripts/TestScript.cs:30]'), true);
            
            // Second line should remain unchanged
            assert.strictEqual(lines[1], 'Some other log line');
        });
        
        it('should handle paths outside project correctly', async () => {
            const outsidePath = path.join(__dirname, 'outside.cs');
            const stackTrace = `at TestNamespace.TestClass.TestMethod () [0x00001] in ${outsidePath}:25`;
            
            // Create the outside file temporarily
            const writeFile = promisify(fs.writeFile);
            const unlink = promisify(fs.unlink);
            
            try {
                await writeFile(outsidePath, 'test content');
                
                const result = await processTestStackTraceToMarkdown(stackTrace, testProjectPath);
                
                // Should contain the absolute path since it's outside the project
                assert.strictEqual(result.includes(outsidePath), true);
                assert.strictEqual(result.includes('file:///'), true);
                
                await unlink(outsidePath);
            } catch (error) {
                // Clean up on error
                try {
                    await unlink(outsidePath);
                } catch (_cleanupError) {
                    // Ignore cleanup errors
                }
                throw error;
            }
        });
    });
});