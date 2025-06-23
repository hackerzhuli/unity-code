import * as assert from 'assert';

// Import the utility functions for testing
import { isInAssetsFolder, extractUnityProjectPath, extractHotReloadProjectPath } from '../../utils.js';

describe('Utils Unit Tests', () => {
	describe('isInAssetsFolder', () => {
		it('should correctly identify Assets folder paths', () => {
			assert.strictEqual(isInAssetsFolder('/Unity/MyProject/Assets/Scripts/Player.cs'), true);
			assert.strictEqual(isInAssetsFolder('C:\\Unity\\MyProject\\Assets\\Textures\\logo.png'), true);
			assert.strictEqual(isInAssetsFolder('/Unity/MyProject/Assets'), true);
			assert.strictEqual(isInAssetsFolder('/Unity/MyProject/Library/metadata'), false);
			assert.strictEqual(isInAssetsFolder('/Unity/MyProject/ProjectSettings/ProjectVersion.txt'), false);
		});
	});

	describe('extractProjectPath', () => {
		describe('Cross-Platform Tests', () => {
			it('should extract project paths from various platforms and formats', () => {
				const testCases = [
					// Windows tests
					{
						description: 'Windows -projectPath with quotes',
						command: 'Unity.exe -batchmode -projectPath "C:\\Unity Projects\\MyGame" -quit',
						expected: 'C:\\Unity Projects\\MyGame'
					},
					{
						description: 'Windows -createProject with quotes',
						command: 'Unity.exe -createProject "D:\\New Project\\TestGame" -batchmode',
						expected: 'D:\\New Project\\TestGame'
					},
					{
						description: 'Windows lowercase -projectpath without quotes',
						command: 'C:\\Unity\\6000.0.51f1\\Editor\\Unity.exe -projectpath F:\\projects\\unity\\TestUnityCode',
						expected: 'F:\\projects\\unity\\TestUnityCode'
					},
					{
						description: 'Windows Unity Hub command',
						command: '"C:\\Program Files\\Unity\\Hub\\Editor\\2023.1.0f1\\Editor\\Unity.exe" -projectPath "C:\\Users\\Developer\\Documents\\Unity Projects\\MyGame" -useHub -hubIPC',
						expected: 'C:\\Users\\Developer\\Documents\\Unity Projects\\MyGame'
					},
					// macOS tests
					{
						description: 'macOS -projectPath with quotes',
						command: '/Applications/Unity/Hub/Editor/2023.1.0f1/Unity.app/Contents/MacOS/Unity -projectPath "/Users/developer/Unity Projects/Mobile Game" -batchmode',
						expected: '/Users/developer/Unity Projects/Mobile Game'
					},
					{
						description: 'macOS -createProject without quotes',
						command: '/Applications/Unity/Unity.app/Contents/MacOS/Unity -createProject /Users/dev/UnityProjects/Game -batchmode',
						expected: '/Users/dev/UnityProjects/Game'
					},
					// Linux tests
					{
						description: 'Linux -projectPath with quotes',
						command: '/opt/Unity/Editor/Unity -projectPath "/home/user/Unity Projects/Game" -batchmode',
						expected: '/home/user/Unity Projects/Game'
					},
					{
						description: 'Linux -createProject without quotes',
						command: '/usr/bin/unity-editor -createProject /home/dev/UnityProjects/Game -batchmode',
						expected: '/home/dev/UnityProjects/Game'
					}
				];

				testCases.forEach(({ description, command, expected }, index) => {
					const result = extractUnityProjectPath(command);
					assert.strictEqual(result, expected, `Test case ${index + 1} failed: ${description}`);
				});
			});

			it('should handle special characters and encoding', () => {
				const testCases = [
					{
						description: 'Chinese characters',
						command: 'C:\\Unity\\6000.0.51f1\\Editor\\Unity.exe -createproject F:\\projects\\unity\\测试UnityCode',
						expected: 'F:\\projects\\unity\\测试UnityCode'
					},
					{
						description: 'Special characters and underscores',
						command: 'Unity.exe -projectPath "C:\\Projects\\My-Game_v2.0" -batchmode',
						expected: 'C:\\Projects\\My-Game_v2.0'
					},
					{
						description: 'Unix special characters',
						command: '/opt/Unity/Editor/Unity -projectPath "/home/user/unity-projects/my_game-v2.0" -batchmode',
						expected: '/home/user/unity-projects/my_game-v2.0'
					}
				];

				testCases.forEach(({ description, command, expected }, index) => {
					const result = extractUnityProjectPath(command);
					assert.strictEqual(result, expected, `Special character test ${index + 1} failed: ${description}`);
				});
			});
		});

		describe('Case Sensitivity and Priority Tests', () => {
			it('should handle case-insensitive options and priority rules', () => {
				const testCases = [
					{
						description: 'lowercase -projectpath',
						command: 'C:\\Unity\\6000.0.51f1\\Editor\\Unity.exe -projectpath F:\\projects\\unity\\TestUnityCode -useHub',
						expected: 'F:\\projects\\unity\\TestUnityCode'
					},
					{
						description: 'lowercase -createproject',
						command: 'Unity.exe -createproject "D:\\NewProjects\\TestGame" -batchmode',
						expected: 'D:\\NewProjects\\TestGame'
					},
					{
						description: 'mixed case -ProjectPath (converted to camelCase)',
						command: 'Unity.exe -ProjectPath "C:\\Projects\\MixedCase" -batchmode',
						expected: 'C:\\Projects\\MixedCase'
					},
					{
						description: 'projectPath priority over createProject',
						command: 'Unity.exe -createProject "/tmp/create" -projectPath "/tmp/project" -batchmode',
						expected: '/tmp/project'
					},
					{
						description: 'lowercase projectpath priority over createproject',
						command: 'Unity.exe -createproject "/tmp/create" -projectpath "/tmp/project" -batchmode',
						expected: '/tmp/project'
					}
				];

				testCases.forEach(({ description, command, expected }, index) => {
					const result = extractUnityProjectPath(command);
					assert.strictEqual(result, expected, `Case/Priority test ${index + 1} failed: ${description}`);
				});
			});
		});

		describe('Edge Cases and Error Handling', () => {
			it('should handle various edge cases', () => {
				const testCases = [
					{
						description: 'complex command with multiple options',
						command: 'Unity.exe -batchmode -quit -logFile "C:\\logs\\unity.log" -projectPath "C:\\Projects\\MyGame" -executeMethod BuildScript.Build',
						expected: 'C:\\Projects\\MyGame'
					},
					{
						description: 'relative paths',
						command: 'Unity.exe -projectPath "./MyProject" -batchmode',
						expected: './MyProject'
					},
					{
						description: 'empty command',
						command: '',
						expected: undefined
					},
					{
						description: 'no project path options',
						command: 'Unity.exe -batchmode -quit -logFile unity.log',
						expected: undefined
					}
				];

				testCases.forEach(({ description, command, expected }, index) => {
					const result = extractUnityProjectPath(command);
					assert.strictEqual(result, expected, `Edge case test ${index + 1} failed: ${description}`);
				});
			});

			it('should handle null/undefined commands', () => {
				// TypeScript prevents passing null/undefined, but we test the runtime behavior
				const result1 = extractUnityProjectPath(null!);
				const result2 = extractUnityProjectPath(undefined!);
				assert.strictEqual(result1, undefined);
				assert.strictEqual(result2, undefined);
			});
		});
	});

	describe('Integration Tests - Real Unity Command Lines', () => {
		it('should handle real Unity command lines from all platforms', () => {
			const testCases = [
				// Windows test cases
				{
					description: 'Unity Hub with quoted executable path and project path',
					command: '"C:\\Program Files\\Unity\\Hub\\Editor\\2023.1.0f1\\Editor\\Unity.exe" -projectPath "C:\\Users\\Developer\\Documents\\Unity Projects\\MyGame" -useHub -hubIPC -cloudEnvironment production -licensingIpc LicenseClient-Developer -hubSessionId 12345',
					expected: 'C:\\Users\\Developer\\Documents\\Unity Projects\\MyGame'
				},
				{
					description: 'Unity 6000 with lowercase projectpath (from docs example)',
					command: 'C:\\Unity\\6000.0.51f1\\Editor\\Unity.exe -projectpath F:\\projects\\unity\\TestUnityCode -useHub -hubIPC -cloudEnvironment production',
					expected: 'F:\\projects\\unity\\TestUnityCode'
				},
				{
					description: 'Unity createproject with quoted path (from docs example)',
					command: 'C:\\Unity\\6000.0.51f1\\Editor\\Unity.exe -createproject "F:\\projects\\unity\\Test Unity Code 2"',
					expected: 'F:\\projects\\unity\\Test Unity Code 2'
				},
				// macOS test cases
				{
					description: 'Unity Hub on macOS with quoted paths',
					command: '/Applications/Unity/Hub/Editor/2023.1.0f1/Unity.app/Contents/MacOS/Unity -projectPath "/Users/developer/Unity Projects/Mobile Game" -batchmode -quit',
					expected: '/Users/developer/Unity Projects/Mobile Game'
				},
				{
					description: 'Unity createProject on macOS with template',
					command: '/Applications/Unity/Unity.app/Contents/MacOS/Unity -createproject "/Users/developer/New Projects/VR Game" -cloneFromTemplate "/Applications/Unity/Unity.app/Contents/Resources/PackageManager/ProjectTemplates/com.unity.template.3d"',
					expected: '/Users/developer/New Projects/VR Game'
				},
				// Linux test cases
				{
					description: 'Unity on Linux with quoted paths',
					command: '/opt/Unity/Editor/Unity -projectPath "/home/user/Unity Projects/Linux Game" -batchmode -nographics -quit',
					expected: '/home/user/Unity Projects/Linux Game'
				},
				{
					description: 'Unity on Linux with build method',
					command: '/usr/bin/unity-editor -projectpath /home/dev/unity-projects/server-game -batchmode -executeMethod BuildScript.BuildLinuxServer',
					expected: '/home/dev/unity-projects/server-game'
				},
				// Special cases
				{
					description: 'Chinese characters in path',
					command: 'C:\\Unity\\6000.0.51f1\\Editor\\Unity.exe -createproject F:\\projects\\unity\\测试UnityCode',
					expected: 'F:\\projects\\unity\\测试UnityCode'
				},
				{
					description: 'Very long command line with many options',
					command: '"C:\\Program Files\\Unity\\Hub\\Editor\\2023.1.0f1\\Editor\\Unity.exe" -batchmode -quit -nographics -silent-crashes -logFile "C:\\logs\\unity-build.log" -projectPath "C:\\CI\\Unity Projects\\Build Project" -executeMethod BuildScript.BuildAll -buildTarget StandaloneWindows64 -customArgs arg1=value1,arg2=value2',
					expected: 'C:\\CI\\Unity Projects\\Build Project'
				}
			];

			testCases.forEach(({ description, command, expected }, index) => {
				const result = extractUnityProjectPath(command);
				assert.strictEqual(result, expected, `Integration test ${index + 1} failed: ${description}`);
			});
		});
	});

	describe('extractHotReloadProjectPath', () => {
		describe('Basic Functionality Tests', () => {
			it('should extract project path from -u option', () => {
				const command = 'CodePatcherCLI.exe -u "F:\\projects\\unity\\TestUnityCode" -s "Library/com.singularitygroup.hotreload/Solution\\TestUnityCode.sln"';
				const result = extractHotReloadProjectPath(command);
				assert.strictEqual(result, 'F:\\projects\\unity\\TestUnityCode');
			});

			it('should extract project path from -u option without quotes', () => {
				const command = 'CodePatcherCLI.exe -u F:\\projects\\unity\\TestUnityCode -s Library/Solution.sln';
				const result = extractHotReloadProjectPath(command);
				assert.strictEqual(result, 'F:\\projects\\unity\\TestUnityCode');
			});

			it('should handle paths with spaces in quotes', () => {
				const command = 'CodePatcherCLI.exe -u "C:\\My Unity Projects\\Hot Reload Game" -s "Library/Solution.sln"';
				const result = extractHotReloadProjectPath(command);
				assert.strictEqual(result, 'C:\\My Unity Projects\\Hot Reload Game');
			});

			it('should handle Unix-style paths', () => {
				const command = 'CodePatcherCLI -u "/home/user/unity-projects/my-game" -s "Library/Solution.sln"';
				const result = extractHotReloadProjectPath(command);
				assert.strictEqual(result, '/home/user/unity-projects/my-game');
			});

			it('should handle macOS paths', () => {
				const command = 'CodePatcherCLI -u "/Users/developer/Unity Projects/VR Game" -s "Library/Solution.sln"';
				const result = extractHotReloadProjectPath(command);
				assert.strictEqual(result, '/Users/developer/Unity Projects/VR Game');
			});
		});

		describe('Case Sensitivity Tests', () => {
			it('should handle uppercase -U option (case insensitive)', () => {
				const command = 'CodePatcherCLI.exe -U "F:\\projects\\unity\\TestUnityCode" -s "Library/Solution.sln"';
				const result = extractHotReloadProjectPath(command);
				assert.strictEqual(result, 'F:\\projects\\unity\\TestUnityCode');
			});

			it('should prioritize exact match over case-insensitive match', () => {
				// This tests the priority logic where exact match comes first
				const command = 'CodePatcherCLI.exe -u "F:\\exact\\match" -U "F:\\case\\insensitive"';
				const result = extractHotReloadProjectPath(command);
				assert.strictEqual(result, 'F:\\exact\\match');
			});
		});

		describe('Special Characters and Encoding Tests', () => {
			it('should handle paths with Chinese characters', () => {
				const command = 'CodePatcherCLI.exe -u "F:\\projects\\unity\\测试UnityCode" -s "Library/Solution.sln"';
				const result = extractHotReloadProjectPath(command);
				assert.strictEqual(result, 'F:\\projects\\unity\\测试UnityCode');
			});

			it('should handle paths with special characters', () => {
				const command = 'CodePatcherCLI.exe -u "C:\\Projects\\My-Game_v2.0@test" -s "Library/Solution.sln"';
				const result = extractHotReloadProjectPath(command);
				assert.strictEqual(result, 'C:\\Projects\\My-Game_v2.0@test');
			});

			it('should handle relative paths', () => {
				const command = 'CodePatcherCLI.exe -u "../unity-projects/relative-game" -s "Library/Solution.sln"';
				const result = extractHotReloadProjectPath(command);
				assert.strictEqual(result, '../unity-projects/relative-game');
			});
		});

		describe('Edge Cases and Error Handling', () => {
			it('should return undefined for empty command', () => {
				const result = extractHotReloadProjectPath('');
				assert.strictEqual(result, undefined);
			});

			it('should return undefined for null command', () => {
				const result = extractHotReloadProjectPath(null as unknown as string);
				assert.strictEqual(result, undefined);
			});

			it('should return undefined when no -u option is found', () => {
				const command = 'CodePatcherCLI.exe -s "Library/Solution.sln" -other option';
				const result = extractHotReloadProjectPath(command);
				assert.strictEqual(result, undefined);
			});

			it('should return undefined when -u option has no value', () => {
				const command = 'CodePatcherCLI.exe -u -s "Library/Solution.sln"';
				const result = extractHotReloadProjectPath(command);
				assert.strictEqual(result, undefined);
			});

			it('should handle malformed command gracefully', () => {
				const command = 'CodePatcherCLI.exe -u "unclosed quote -s Library';
				const result = extractHotReloadProjectPath(command);
				// Should not throw an error, may return undefined or partial result
				assert.ok(result === undefined || typeof result === 'string');
			});
		});

		describe('Integration Tests - Real Hot Reload Command Lines', () => {
			it('should handle real Hot Reload command line from documentation', () => {
				const command = '"C:\\Users\\hacke\\AppData\\Local\\singularitygroup-hotreload\\asset-store\\executables_1-13-7\\CodePatcherCLl.exe" -u "F:\\projects\\unity\\TestUnityCode" -s "Library/com.singularitygroup.hotreload/Solution\\TestUnityCode.sln"';
				const result = extractHotReloadProjectPath(command);
				assert.strictEqual(result, 'F:\\projects\\unity\\TestUnityCode');
			});

			it('should handle Windows Hot Reload command with different executable path', () => {
				const command = 'C:\\Tools\\HotReload\\CodePatcherCLI.exe -u "D:\\Unity\\MyProject" -s "Library/Solution.sln"';
				const result = extractHotReloadProjectPath(command);
				assert.strictEqual(result, 'D:\\Unity\\MyProject');
			});

			it('should handle macOS Hot Reload command', () => {
				const command = '/Applications/HotReload/CodePatcherCLI -u "/Users/dev/Unity Projects/Mobile Game" -s "Library/Solution.sln"';
				const result = extractHotReloadProjectPath(command);
				assert.strictEqual(result, '/Users/dev/Unity Projects/Mobile Game');
			});

			it('should handle Linux Hot Reload command', () => {
				const command = '/opt/hotreload/CodePatcherCLI -u "/home/developer/unity-projects/server-game" -s "Library/Solution.sln"';
				const result = extractHotReloadProjectPath(command);
				assert.strictEqual(result, '/home/developer/unity-projects/server-game');
			});
		});
	});
});