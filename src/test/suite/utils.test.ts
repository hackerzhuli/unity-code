import * as assert from 'assert';

// Import the utility functions for testing
import { isInAssetsFolder, extractProjectPath } from '../../utils.js';

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
		it('should extract project path from -projectPath option', () => {
			const command = 'Unity.exe -batchmode -projectPath "C:\\Unity Projects\\MyGame" -quit';
			const result = extractProjectPath(command);
			assert.strictEqual(result, 'C:\\Unity Projects\\MyGame');
		});

		it('should extract project path from -createProject option', () => {
			const command = 'Unity.exe -createProject "D:\\New Project\\TestGame" -batchmode';
			const result = extractProjectPath(command);
			assert.strictEqual(result, 'D:\\New Project\\TestGame');
		});

		it('should handle paths without quotes', () => {
			const command = 'Unity.exe -projectPath /Users/dev/UnityProjects/Game -batchmode';
			const result = extractProjectPath(command);
			assert.strictEqual(result, '/Users/dev/UnityProjects/Game');
		});

		it('should handle paths with spaces in quotes', () => {
			const command = 'Unity.exe -batchmode -projectPath "C:\\My Unity Projects\\Space Game" -quit -logFile';
			const result = extractProjectPath(command);
			assert.strictEqual(result, 'C:\\My Unity Projects\\Space Game');
		});

		it('should prioritize projectPath over createProject', () => {
			const command = 'Unity.exe -createProject "/tmp/create" -projectPath "/tmp/project" -batchmode';
			const result = extractProjectPath(command);
			assert.strictEqual(result, '/tmp/project');
		});

		it('should handle complex command lines with multiple options', () => {
			const command = 'Unity.exe -batchmode -quit -logFile "C:\\logs\\unity.log" -projectPath "C:\\Projects\\MyGame" -executeMethod BuildScript.Build';
			const result = extractProjectPath(command);
			assert.strictEqual(result, 'C:\\Projects\\MyGame');
		});

		it('should return undefined for empty command', () => {
			const result = extractProjectPath('');
			assert.strictEqual(result, undefined);
		});

		it('should return undefined for null/undefined command', () => {
			// TypeScript prevents passing null/undefined, but we test the runtime behavior
			const result1 = extractProjectPath(null!);
			const result2 = extractProjectPath(undefined!);
			assert.strictEqual(result1, undefined);
			assert.strictEqual(result2, undefined);
		});

		it('should return undefined when no project path options found', () => {
			const command = 'Unity.exe -batchmode -quit -logFile unity.log';
			const result = extractProjectPath(command);
			assert.strictEqual(result, undefined);
		});

		it('should handle Unix-style paths', () => {
			const command = 'Unity -projectPath "/home/user/Unity Projects/Game" -batchmode';
			const result = extractProjectPath(command);
			assert.strictEqual(result, '/home/user/Unity Projects/Game');
		});

		it('should handle relative paths', () => {
			const command = 'Unity.exe -projectPath "./MyProject" -batchmode';
			const result = extractProjectPath(command);
			assert.strictEqual(result, './MyProject');
		});

		it('should handle paths with special characters', () => {
			const command = 'Unity.exe -projectPath "C:\\Projects\\My-Game_v2.0" -batchmode';
			const result = extractProjectPath(command);
			assert.strictEqual(result, 'C:\\Projects\\My-Game_v2.0');
		});

		it('should extract project path from lowercase -projectpath option', () => {
			const command = 'C:\\Unity\\6000.0.51f1\\Editor\\Unity.exe -projectpath F:\\projects\\unity\\TestUnityCode -useHub -hubIPC -cloudEnvironment production';
			const result = extractProjectPath(command);
			assert.strictEqual(result, 'F:\\projects\\unity\\TestUnityCode');
		});

		it('should extract project path from lowercase -createproject option', () => {
			const command = 'Unity.exe -createproject "D:\\NewProjects\\TestGame" -batchmode';
			const result = extractProjectPath(command);
			assert.strictEqual(result, 'D:\\NewProjects\\TestGame');
		});
	});

	describe('Integration Tests', () => {
		it('should handle real Unity command line examples', () => {
			const testCases = [
				{
					command: '"C:\\Program Files\\Unity\\Hub\\Editor\\2023.1.0f1\\Editor\\Unity.exe" -projectPath "C:\\Users\\Developer\\Documents\\Unity Projects\\MyGame" -useHub -hubIPC -cloudEnvironment production -licensingIpc LicenseClient-Developer -hubSessionId 12345',
					expected: 'C:\\Users\\Developer\\Documents\\Unity Projects\\MyGame'
				},
				{
					command: '/Applications/Unity/Hub/Editor/2023.1.0f1/Unity.app/Contents/MacOS/Unity -projectPath "/Users/developer/Unity Projects/Mobile Game" -batchmode -quit',
					expected: '/Users/developer/Unity Projects/Mobile Game'
				},
				{
					command: 'Unity.exe -createProject "D:\\NewProjects\\TestGame" -cloneFromTemplate "C:\\Templates\\3D" -batchmode',
					expected: 'D:\\NewProjects\\TestGame'
				}
			];

			testCases.forEach(({ command, expected }, index) => {
				const result = extractProjectPath(command);
				assert.strictEqual(result, expected, `Test case ${index + 1} failed`);
			});
		});
	});
});