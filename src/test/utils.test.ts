import { describe, it } from 'mocha';
import { strict as assert } from 'assert';
import { extractMajorMinorVersion } from '../utils';

describe('extractMajorMinorVersion', () => {
    describe('Unity version formats', () => {
        it('should extract major.minor from Unity LTS versions', () => {
            assert.equal(extractMajorMinorVersion('2023.3.15f1'), '2023.3');
            assert.equal(extractMajorMinorVersion('2022.3.42f1'), '2022.3');
            assert.equal(extractMajorMinorVersion('2021.3.33f1'), '2021.3');
        });

        it('should extract major.minor from Unity Tech Stream versions', () => {
            assert.equal(extractMajorMinorVersion('6000.0.51f1'), '6000.0');
            assert.equal(extractMajorMinorVersion('6000.1.12f1'), '6000.1');
            assert.equal(extractMajorMinorVersion('2024.1.5f1'), '2024.1');
        });

        it('should extract major.minor from Unity alpha/beta versions', () => {
            assert.equal(extractMajorMinorVersion('2024.2.0a15'), '2024.2');
            assert.equal(extractMajorMinorVersion('2024.3.0b1'), '2024.3');
            assert.equal(extractMajorMinorVersion('6000.2.0a1'), '6000.2');
        });
    });

    describe('Semantic version formats', () => {
        it('should extract major.minor from standard semantic versions', () => {
            assert.equal(extractMajorMinorVersion('1.2.3'), '1.2');
            assert.equal(extractMajorMinorVersion('10.15.20'), '10.15');
            assert.equal(extractMajorMinorVersion('0.1.0'), '0.1');
        });

        it('should extract major.minor from semantic versions with pre-release', () => {
            assert.equal(extractMajorMinorVersion('1.2.3-alpha.1'), '1.2');
            assert.equal(extractMajorMinorVersion('2.0.0-beta.5'), '2.0');
            assert.equal(extractMajorMinorVersion('1.5.0-rc.2'), '1.5');
        });

        it('should extract major.minor from semantic versions with build metadata', () => {
            assert.equal(extractMajorMinorVersion('1.2.3+20240101'), '1.2');
            assert.equal(extractMajorMinorVersion('2.0.0-beta.1+exp.sha.5114f85'), '2.0');
        });
    });

    describe('Edge cases', () => {
        it('should return undefined for invalid inputs', () => {
            assert.equal(extractMajorMinorVersion(''), undefined);
            assert.equal(extractMajorMinorVersion('invalid'), undefined);
            assert.equal(extractMajorMinorVersion('1'), undefined);
            assert.equal(extractMajorMinorVersion('1.'), undefined);
            assert.equal(extractMajorMinorVersion('.2'), undefined);
            assert.equal(extractMajorMinorVersion('a.b.c'), undefined);
        });

        it('should return undefined for null/undefined inputs', () => {
            assert.equal(extractMajorMinorVersion(null as unknown as string), undefined);
            assert.equal(extractMajorMinorVersion(undefined as unknown as string), undefined);
        });

        it('should return undefined for non-string inputs', () => {
            assert.equal(extractMajorMinorVersion(123 as unknown as string), undefined);
            assert.equal(extractMajorMinorVersion({} as unknown as string), undefined);
            assert.equal(extractMajorMinorVersion([] as unknown as string), undefined);
        });

        it('should handle versions with only major.minor', () => {
            assert.equal(extractMajorMinorVersion('1.2'), '1.2');
            assert.equal(extractMajorMinorVersion('10.5'), '10.5');
            assert.equal(extractMajorMinorVersion('2023.3'), '2023.3');
        });

        it('should handle versions with leading zeros', () => {
            assert.equal(extractMajorMinorVersion('01.02.03'), '01.02');
            assert.equal(extractMajorMinorVersion('2023.03.15f1'), '2023.03');
        });
    });
});