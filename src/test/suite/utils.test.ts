import * as assert from 'assert';

// Import the utility functions for testing
import { isInAssetsFolder } from '../../utils.js';

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
});