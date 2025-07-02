import * as assert from 'assert';
import { DecompiledFileHelper } from '../../decompiledFileHelper';

describe('DecompiledFileHelper Unit Tests', () => {
    describe('analyzeContent', () => {
        it('should identify decompiled files with assembly information', () => {
            const content = '#region Assembly Unity.InputSystem, Version=1.14.0.0, Culture=neutral, PublicKeyToken=null\nusing System;';
            const result = DecompiledFileHelper.analyzeContent(content);
            
            assert.strictEqual(result.isDecompiled, true);
            assert.strictEqual(result.assemblyName, 'Unity.InputSystem');
            assert.strictEqual(result.assemblyFileName, 'Unity.InputSystem.dll');
        });

        it('should handle different assembly name formats', () => {
            const testCases = [
                {
                    content: '#region Assembly UnityEngine.CoreModule, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null',
                    expectedAssembly: 'UnityEngine.CoreModule'
                },
                {
                    content: '#region Assembly System.Core, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089',
                    expectedAssembly: 'System.Core'
                },
                {
                    content: '#region Assembly mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089',
                    expectedAssembly: 'mscorlib'
                }
            ];

            testCases.forEach(testCase => {
                const result = DecompiledFileHelper.analyzeContent(testCase.content);
                assert.strictEqual(result.isDecompiled, true);
                assert.strictEqual(result.assemblyName, testCase.expectedAssembly);
                assert.strictEqual(result.assemblyFileName, testCase.expectedAssembly + '.dll');
            });
        });

        it('should handle flexible assembly identification patterns', () => {
            const testCases = [
                {
                    content: 'Assembly MyCustomAssembly, Version=1.0.0.0',
                    expectedAssembly: 'MyCustomAssembly',
                    description: 'Assembly without #region prefix'
                },
                {
                    content: '// Assembly   Unity.Timeline   , some other info',
                    expectedAssembly: 'Unity.Timeline',
                    description: 'Assembly with extra spaces and comment prefix'
                },
                {
                    content: '/* Assembly System.Collections.Generic*/',
                    expectedAssembly: 'System.Collections.Generic',
                    description: 'Assembly in block comment'
                },
                {
                    content: 'Assembly\tUnity.Networking\t,\tVersion=1.0',
                    expectedAssembly: 'Unity.Networking',
                    description: 'Assembly with tab characters'
                },
                {
                    content: 'SomePrefix Assembly CustomLib, OtherInfo',
                    expectedAssembly: 'CustomLib',
                    description: 'Assembly keyword in middle of line'
                },
                {
                    content: 'Assembly My_Special.Assembly_Name, Version=2.0',
                    expectedAssembly: 'My_Special.Assembly_Name',
                    description: 'Assembly with special characters'
                },
                {
                    content: 'Assembly SingleName,',
                    expectedAssembly: 'SingleName',
                    description: 'Simple assembly name with trailing comma'
                },
                {
                    content: 'ASSEMBLY Unity.Engine, VERSION=1.0',
                    expectedAssembly: 'Unity.Engine',
                    description: 'Case insensitive assembly keyword'
                },
                {
                    content: 'Assembly NoCommaHere Version=1.0',
                    expectedAssembly: 'NoCommaHere',
                    description: 'Assembly without comma separator'
                },
                {
                    content: 'Assembly JustAssemblyName',
                    expectedAssembly: 'JustAssemblyName',
                    description: 'Assembly name only, no additional info'
                }
            ];

            testCases.forEach(testCase => {
                const result = DecompiledFileHelper.analyzeContent(testCase.content);
                assert.strictEqual(result.isDecompiled, true, `Failed for case: ${testCase.description}`);
                assert.strictEqual(result.assemblyName, testCase.expectedAssembly, `Wrong assembly name for case: ${testCase.description}`);
                assert.strictEqual(result.assemblyFileName, testCase.expectedAssembly + '.dll', `Wrong assembly filename for case: ${testCase.description}`);
            });
        });

        it('should handle assembly names with spaces correctly', () => {
            const content = '#region Assembly Unity Input System, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null';
            const result = DecompiledFileHelper.analyzeContent(content);
            
            assert.strictEqual(result.isDecompiled, true);
            assert.strictEqual(result.assemblyName, 'Unity');
            assert.strictEqual(result.assemblyFileName, 'Unity.dll');
        });

        it('should return false for non-decompiled files', () => {
            const testCases = [
                'using System;\nnamespace MyNamespace {',
                '// This is a regular C# file\nusing UnityEngine;',
                '#region MyRegion\nusing System;',
                '#region Assembly\nusing System;', // Missing assembly name
                ''
            ];

            testCases.forEach(content => {
                const result = DecompiledFileHelper.analyzeContent(content);
                assert.strictEqual(result.isDecompiled, false);
                assert.strictEqual(result.assemblyName, undefined);
                assert.strictEqual(result.assemblyFileName, undefined);
            });
        });

        it('should handle empty or whitespace content', () => {
            const testCases = ['', '   ', '\n\n', '\t\t'];
            
            testCases.forEach(content => {
                const result = DecompiledFileHelper.analyzeContent(content);
                assert.strictEqual(result.isDecompiled, false);
            });
        });

        it('should handle content with leading whitespace', () => {
            const content = '   #region Assembly Unity.InputSystem, Version=1.14.0.0, Culture=neutral, PublicKeyToken=null\nusing System;';
            const result = DecompiledFileHelper.analyzeContent(content);
            
            assert.strictEqual(result.isDecompiled, true);
            assert.strictEqual(result.assemblyName, 'Unity.InputSystem');
        });

        it('should only check the first line', () => {
            const content = 'using System;\n#region Assembly Unity.InputSystem, Version=1.14.0.0, Culture=neutral, PublicKeyToken=null';
            const result = DecompiledFileHelper.analyzeContent(content);
            
            assert.strictEqual(result.isDecompiled, false);
        });
    });


});