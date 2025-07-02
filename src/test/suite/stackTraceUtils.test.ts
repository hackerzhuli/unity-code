import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { parseUnityTestStackTraceSourceLocation, processTestStackTraceToMarkdown, parseUnityConsoleStackTraceSourceLocation, processConsoleLogStackTraceToMarkdown } from '../../stackTraceUtils';

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

            it('should handle relative path', () => {
                const stackTrace = 'at Hackerzhuli.Code.Editor.Testing.TestAdaptorUtilsTests.GetNodeType_ConcreteTestNodes_ValidateSpecificExamples () [0x0000f] in .\\Packages\\Code\\Editor\\Testing\\TestAdaptorUtilsTests.cs:132';
                const result = parseUnityTestStackTraceSourceLocation(stackTrace);
                
                assert.notStrictEqual(result, null);
                assert.strictEqual(result!.filePath, '.\\Packages\\Code\\Editor\\Testing\\TestAdaptorUtilsTests.cs');
                assert.strictEqual(result!.lineNumber, 132);
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
        const tempDir = path.join(process.cwd(), 'temp-stack-trace-test-dir');
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

        it('should handle stack trace with relative path with leading dot (Windows)', async () => {
            const stackTrace = `at Hackerzhuli.Code.Editor.Testing.TestAdaptorUtilsTests.GetNodeType_ConcreteTestNodes_ValidateSpecificExamples () [0x0000f] in .\\Packages\\Code\\Editor\\Testing\\TestAdaptorUtilsTests.cs:132`;
            const result = await processTestStackTraceToMarkdown(stackTrace, testProjectPath);
            
            // Should contain markdown link with relative path
            assert.strictEqual(result.includes('[Packages/Code/Editor/Testing/TestAdaptorUtilsTests.cs:132]'), true);
            assert.strictEqual(result.includes('file:///'), true);
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
            const outsidePath = path.join(process.cwd(), 'outside.cs');
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
        
        it('should handle paths within project but outside Assets directory', async () => {
            // Create a file in the project root (not in Assets)
            const projectRootFile = path.join(testProjectPath, 'ProjectSettings', 'ProjectVersion.cs');
            const stackTrace = `at TestNamespace.TestClass.TestMethod () [0x00001] in ${projectRootFile}:10`;
            
            // Create the test file temporarily
            const mkdir = promisify(fs.mkdir);
            const writeFile = promisify(fs.writeFile);
            const unlink = promisify(fs.unlink);
            const rmdir = promisify(fs.rmdir);
            
            try {
                await mkdir(path.dirname(projectRootFile), { recursive: true });
                await writeFile(projectRootFile, 'test content');
                
                const result = await processTestStackTraceToMarkdown(stackTrace, testProjectPath);
                
                // Should contain relative path from project root, not just the filename
                assert.strictEqual(result.includes('[ProjectSettings/ProjectVersion.cs:10]'), true);
                assert.strictEqual(result.includes('file:///'), true);
                
                // Clean up
                await unlink(projectRootFile);
                await rmdir(path.dirname(projectRootFile));
            } catch (error) {
                // Clean up on error
                try {
                    await unlink(projectRootFile);
                    await rmdir(path.dirname(projectRootFile));
                } catch (_cleanupError) {
                    // Ignore cleanup errors
                }
                throw error;
            }
        });

        it('should normalize relative paths with leading dot', async () => {
            // Test case for relative path with leading dot that needs normalization
            const relativePath = '.\\Library\\PackageCache\\com.unity.test-framework@dfdbd02f5918\\UnityEngine.TestRunner\\NUnitExtensions\\Attributes\\TestEnumerator.cs';
            const stackTrace = `at UnityEngine.TestTools.TestEnumerator+<Execute>d__7.MoveNext () [0x0004e] in ${relativePath}:44`;
            
            const result = await processTestStackTraceToMarkdown(stackTrace, testProjectPath);
            
            // Should normalize the path and remove leading dot
            assert.strictEqual(result.includes('[Library/PackageCache/com.unity.test-framework@dfdbd02f5918/UnityEngine.TestRunner/NUnitExtensions/Attributes/TestEnumerator.cs:44]'), true);
            assert.strictEqual(result.includes('file:///'), true);
            // Should not contain the leading dot
            assert.strictEqual(result.includes('./'), false);
        });
    });

    describe('parseUnityConsoleStackTraceSourceLocation', () => {
        
        describe('Basic console log parsing', () => {
            it('should parse relative path correctly', () => {
                const logLine = 'Script:AnotherMethod () (at Assets/Scripts/Script.cs:12)';
                const result = parseUnityConsoleStackTraceSourceLocation(logLine);
                
                assert.notStrictEqual(result, null);
                const expectedStartIndex = logLine.indexOf('(at ') + 4; // Position after "(at "
                const expectedEndIndex = logLine.indexOf(')', expectedStartIndex);
                assert.strictEqual(result!.startIndex, expectedStartIndex);
                assert.strictEqual(result!.endIndex, expectedEndIndex);
                assert.strictEqual(result!.filePath, 'Assets/Scripts/Script.cs');
                assert.strictEqual(result!.lineNumber, 12);
            });
            
            it('should parse nested directory path', () => {
                const logLine = 'GameManager:Start () (at Assets/Scripts/Managers/GameManager.cs:25)';
                const result = parseUnityConsoleStackTraceSourceLocation(logLine);
                
                assert.notStrictEqual(result, null);
                assert.strictEqual(result!.filePath, 'Assets/Scripts/Managers/GameManager.cs');
                assert.strictEqual(result!.lineNumber, 25);
            });
            
            it('should parse path with spaces in directory names', () => {
                const logLine = 'PlayerController:Update () (at Assets/My Scripts/Player Controller.cs:45)';
                const result = parseUnityConsoleStackTraceSourceLocation(logLine);
                
                assert.notStrictEqual(result, null);
                assert.strictEqual(result!.filePath, 'Assets/My Scripts/Player Controller.cs');
                assert.strictEqual(result!.lineNumber, 45);
            });
        });
        
        describe('Different file extensions', () => {
            it('should parse .cs files', () => {
                const logLine = 'Test:Method () (at Scripts/Test.cs:10)';
                const result = parseUnityConsoleStackTraceSourceLocation(logLine);
                
                assert.notStrictEqual(result, null);
                assert.strictEqual(result!.filePath, 'Scripts/Test.cs');
                assert.strictEqual(result!.lineNumber, 10);
            });
            
            it('should parse .js files', () => {
                const logLine = 'Script:Function () (at Scripts/script.js:15)';
                const result = parseUnityConsoleStackTraceSourceLocation(logLine);
                
                assert.notStrictEqual(result, null);
                assert.strictEqual(result!.filePath, 'Scripts/script.js');
                assert.strictEqual(result!.lineNumber, 15);
            });
        });
        
        describe('Edge cases and invalid inputs', () => {
            it('should return null for log without "(at " keyword', () => {
                const logLine = 'Script:Method () in Assets/Scripts/Script.cs:10';
                const result = parseUnityConsoleStackTraceSourceLocation(logLine);
                
                assert.strictEqual(result, null);
            });
            
            it('should return null for log without closing parenthesis', () => {
                const logLine = 'Script:Method () (at Assets/Scripts/Script.cs:10';
                const result = parseUnityConsoleStackTraceSourceLocation(logLine);
                
                assert.strictEqual(result, null);
            });
            
            it('should return null for log without line number', () => {
                const logLine = 'Script:Method () (at Assets/Scripts/Script.cs)';
                const result = parseUnityConsoleStackTraceSourceLocation(logLine);
                
                assert.strictEqual(result, null);
            });
            
            it('should return null for invalid file extension', () => {
                const logLine = 'Script:Method () (at Assets/Scripts/Script.txt:10)';
                const result = parseUnityConsoleStackTraceSourceLocation(logLine);
                
                assert.strictEqual(result, null);
            });
            
            it('should return null for empty string', () => {
                const result = parseUnityConsoleStackTraceSourceLocation('');
                assert.strictEqual(result, null);
            });
            
            it('should handle multiple "(at " occurrences correctly', () => {
                const logLine = 'Script:Method (at something) (at Assets/Scripts/Script.cs:20)';
                const result = parseUnityConsoleStackTraceSourceLocation(logLine);
                
                assert.notStrictEqual(result, null);
                assert.strictEqual(result!.filePath, 'Assets/Scripts/Script.cs');
                assert.strictEqual(result!.lineNumber, 20);
            });
        });
        
        describe('Real-world examples', () => {
            it('should parse typical Unity console log format', () => {
                const logLine = 'Script:Awake () (at Assets/Scripts/Script.cs:8)';
                const result = parseUnityConsoleStackTraceSourceLocation(logLine);
                
                assert.notStrictEqual(result, null);
                assert.strictEqual(result!.filePath, 'Assets/Scripts/Script.cs');
                assert.strictEqual(result!.lineNumber, 8);
                
                // Verify that the extracted substring matches expected source location
                const extractedSourceLocation = logLine.substring(result!.startIndex, result!.endIndex);
                assert.strictEqual(extractedSourceLocation, 'Assets/Scripts/Script.cs:8');
            });
        });
    });

    describe('processConsoleLogStackTraceToMarkdown', () => {
        const tempDir = path.join(process.cwd(), 'temp-console-log-test-dir');
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
                console.warn('Console log cleanup failed:', error);
            }
        });
        
        it('should return empty string for empty log text', async () => {
            const result = await processConsoleLogStackTraceToMarkdown('', testProjectPath);
            assert.strictEqual(result, '');
        });
        
        it('should return original log when no project path provided', async () => {
            const logText = 'Script:Method () (at Assets/Scripts/Script.cs:10)';
            const result = await processConsoleLogStackTraceToMarkdown(logText, '');
            assert.strictEqual(result, logText);
        });
        
        it('should process console log with relative path', async () => {
            const relativePath = 'Assets/Scripts/TestScript.cs';
            const logText = `TestScript:TestMethod () (at ${relativePath}:25)`;
            const result = await processConsoleLogStackTraceToMarkdown(logText, testProjectPath);
            
            // Should contain markdown link with relative path
            assert.strictEqual(result.includes(`[${relativePath}:25]`), true);
            assert.strictEqual(result.includes('file:///'), true);
        });
        
        it('should keep original line when no source location found', async () => {
            const logText = 'Some debug message without source location';
            const result = await processConsoleLogStackTraceToMarkdown(logText, testProjectPath);
            assert.strictEqual(result, logText);
        });
        
        it('should handle multiple lines in console log', async () => {
            const relativePath = 'Assets/Scripts/TestScript.cs';
            const logText = [
                `TestScript:Method1 () (at ${relativePath}:10)`,
                'Debug message without location',
                `TestScript:Method2 () (at ${relativePath}:20)`
            ].join('\n');
            
            const result = await processConsoleLogStackTraceToMarkdown(logText, testProjectPath);
            const lines = result.split('\n');
            
            // Should have 3 lines
            assert.strictEqual(lines.length, 3);
            
            // First and third lines should contain markdown links
            assert.strictEqual(lines[0].includes(`[${relativePath}:10]`), true);
            assert.strictEqual(lines[2].includes(`[${relativePath}:20]`), true);
            
            // Second line should remain unchanged
            assert.strictEqual(lines[1], 'Debug message without location');
        });
        
        it('should handle absolute paths correctly', async () => {
            const absolutePath = testFile;
            const logText = `TestScript:TestMethod () (at ${absolutePath}:15)`;
            
            const result = await processConsoleLogStackTraceToMarkdown(logText, testProjectPath);
            
            // Should contain the absolute path in the link
            assert.strictEqual(result.includes(absolutePath), true);
            assert.strictEqual(result.includes('file:///'), true);
        });
        
        it('should handle paths with spaces', async () => {
            const pathWithSpaces = 'Assets/My Scripts/Test Script.cs';
            const logText = `TestScript:Method () (at ${pathWithSpaces}:30)`;
            
            const result = await processConsoleLogStackTraceToMarkdown(logText, testProjectPath);
            
            // Should contain markdown link with the spaced path
            assert.strictEqual(result.includes(`[${pathWithSpaces}:30]`), true);
            assert.strictEqual(result.includes('file:///'), true);
        });
    });
});