import assert from 'assert';
import { isInAssetsFolder } from '../../utils.js';

describe('Extension Unit Tests', () => {
    describe('isInAssetsFolder', () => {
        it('should return true for files in Assets folder', () => {
            assert.strictEqual(isInAssetsFolder('/project/Assets/Scripts/test.cs'), true);
            assert.strictEqual(isInAssetsFolder('C:\\Unity\\Assets\\Models\\player.fbx'), true);
            assert.strictEqual(isInAssetsFolder('/project/Assets'), true);
        });

        it('should return false for files outside Assets folder', () => {
            assert.strictEqual(isInAssetsFolder('/project/Library/test.asset'), false);
            assert.strictEqual(isInAssetsFolder('/project/ProjectSettings/ProjectVersion.txt'), false);
            assert.strictEqual(isInAssetsFolder('/project/Packages/manifest.json'), false);
        });
    });
});