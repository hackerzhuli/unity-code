import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';
import { UnityPackageHelper } from '../../unityPackageHelper';

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const rm = promisify(fs.rm);

describe('UnityPackageHelper Unit Tests', () => {
    let tempDir: string;
    let packageHelper: UnityPackageHelper;
    let packageCacheDir: string;

    beforeEach(async () => {
        // Create a temporary directory for testing
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'unity-package-test-'));
        packageCacheDir = path.join(tempDir, 'Library', 'PackageCache');
        await mkdir(packageCacheDir, { recursive: true });
        
        packageHelper = new UnityPackageHelper(tempDir);
    });

    afterEach(async () => {
        // Clean up temporary directory
        try {
            await rm(tempDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    describe('Package Discovery', () => {
        it('should handle empty PackageCache directory', async () => {
            await packageHelper.updatePackages();
            
            const packages = packageHelper.getAllPackages();
            assert.strictEqual(packages.length, 0);
        });

        it('should parse package.json correctly', async () => {
            // Create a mock package directory
            const packageDir = path.join(packageCacheDir, 'com.unity.inputsystem@7fe8299111a7');
            await mkdir(packageDir, { recursive: true });
            
            // Create package.json
            const packageJson = {
                name: 'com.unity.inputsystem',
                version: '1.7.0',
                displayName: 'Input System',
                description: 'A new input system for Unity'
            };
            await writeFile(path.join(packageDir, 'package.json'), JSON.stringify(packageJson, null, 2));
            
            await packageHelper.updatePackages();
            
            const packageInfo = packageHelper.getPackageByName('com.unity.inputsystem');
            assert.ok(packageInfo);
            assert.strictEqual(packageInfo.name, 'com.unity.inputsystem');
            assert.strictEqual(packageInfo.version, '1.7.0');
            assert.strictEqual(packageInfo.displayName, 'Input System');
            assert.strictEqual(packageInfo.description, 'A new input system for Unity');
        });

        it('should parse assembly definition files correctly', async () => {
            // Create a mock package directory
            const packageDir = path.join(packageCacheDir, 'com.unity.inputsystem@7fe8299111a7');
            const runtimeDir = path.join(packageDir, 'Runtime');
            await mkdir(runtimeDir, { recursive: true });
            
            // Create package.json
            const packageJson = {
                name: 'com.unity.inputsystem',
                version: '1.7.0'
            };
            await writeFile(path.join(packageDir, 'package.json'), JSON.stringify(packageJson, null, 2));
            
            // Create assembly definition file
            const asmdef = {
                name: 'Unity.InputSystem',
                rootNamespace: 'UnityEngine.InputSystem',
                references: ['Unity.ugui']
            };
            await writeFile(path.join(runtimeDir, 'Unity.InputSystem.asmdef'), JSON.stringify(asmdef, null, 2));
            
            await packageHelper.updatePackages();
            
            const packageInfo = packageHelper.getPackageByName('com.unity.inputsystem');
            assert.ok(packageInfo);
            assert.strictEqual(packageInfo.assemblies.length, 1);
            
            const assembly = packageInfo.assemblies[0];
            assert.strictEqual(assembly.name, 'Unity.InputSystem');
            assert.strictEqual(assembly.rootNamespace, 'UnityEngine.InputSystem');
        });

        it('should handle multiple assembly definitions in one package', async () => {
            // Create a mock package directory
            const packageDir = path.join(packageCacheDir, 'com.unity.inputsystem@7fe8299111a7');
            const runtimeDir = path.join(packageDir, 'Runtime');
            const testsDir = path.join(packageDir, 'Tests');
            await mkdir(runtimeDir, { recursive: true });
            await mkdir(testsDir, { recursive: true });
            
            // Create package.json
            const packageJson = {
                name: 'com.unity.inputsystem',
                version: '1.7.0'
            };
            await writeFile(path.join(packageDir, 'package.json'), JSON.stringify(packageJson, null, 2));
            
            // Create runtime assembly definition
            const runtimeAsmdef = {
                name: 'Unity.InputSystem',
                references: []
            };
            await writeFile(path.join(runtimeDir, 'Unity.InputSystem.asmdef'), JSON.stringify(runtimeAsmdef, null, 2));
            
            // Create tests assembly definition
            const testsAsmdef = {
                name: 'Unity.InputSystem.Tests',
                references: ['Unity.InputSystem']
            };
            await writeFile(path.join(testsDir, 'Unity.InputSystem.Tests.asmdef'), JSON.stringify(testsAsmdef, null, 2));
            
            await packageHelper.updatePackages();
            
            const packageInfo = packageHelper.getPackageByName('com.unity.inputsystem');
            assert.ok(packageInfo);
            assert.strictEqual(packageInfo.assemblies.length, 2);
            
            const assemblyNames = packageInfo.assemblies.map(a => a.name).sort();
            assert.deepStrictEqual(assemblyNames, ['Unity.InputSystem', 'Unity.InputSystem.Tests']);
        });

        it('should handle multiple top-level subdirectories with assembly definitions', async () => {
            // Create a package with multiple top-level subdirectories, each containing one assembly definition
            const packageDir = path.join(packageCacheDir, 'com.unity.render-pipelines.universal@14.0.9');
            
            // Create top-level subdirectories only
            const runtimeDir = path.join(packageDir, 'Runtime');
            const editorDir = path.join(packageDir, 'Editor');
            const shadersDir = path.join(packageDir, 'Shaders');
            const testsDir = path.join(packageDir, 'Tests');
            
            await mkdir(runtimeDir, { recursive: true });
            await mkdir(editorDir, { recursive: true });
            await mkdir(shadersDir, { recursive: true });
            await mkdir(testsDir, { recursive: true });
            
            // Create package.json
            const packageJson = {
                name: 'com.unity.render-pipelines.universal',
                version: '14.0.9',
                displayName: 'Universal Render Pipeline',
                description: 'The Universal Render Pipeline (URP) is a Scriptable Render Pipeline'
            };
            await writeFile(path.join(packageDir, 'package.json'), JSON.stringify(packageJson, null, 2));
            
            // Create assembly definitions in top-level subdirectories only
            const assemblies = [
                {
                    name: 'Unity.RenderPipelines.Universal.Runtime',
                    dir: runtimeDir,
                    references: ['Unity.RenderPipelines.Core.Runtime', 'Unity.Mathematics']
                },
                {
                    name: 'Unity.RenderPipelines.Universal.Editor',
                    dir: editorDir,
                    references: ['Unity.RenderPipelines.Universal.Runtime', 'Unity.RenderPipelines.Core.Editor']
                },
                {
                    name: 'Unity.RenderPipelines.Universal.Shaders',
                    dir: shadersDir,
                    references: []
                },
                {
                    name: 'Unity.RenderPipelines.Universal.Tests',
                    dir: testsDir,
                    references: ['Unity.RenderPipelines.Universal.Runtime', 'Unity.TestRunner']
                }
            ];
            
            for (const assembly of assemblies) {
                const asmdef = {
                    name: assembly.name,
                    references: assembly.references,
                    includePlatforms: assembly.name.includes('Editor') ? ['Editor'] : [],
                    excludePlatforms: assembly.name.includes('Tests') ? [] : undefined
                };
                await writeFile(
                    path.join(assembly.dir, `${assembly.name}.asmdef`),
                    JSON.stringify(asmdef, null, 2)
                );
            }
            
            await packageHelper.updatePackages();
            
            const packageInfo = packageHelper.getPackageByName('com.unity.render-pipelines.universal');
            assert.ok(packageInfo);
            assert.strictEqual(packageInfo.assemblies.length, 4);
            
            // Verify all assemblies were found
            const assemblyNames = packageInfo.assemblies.map(a => a.name).sort();
            const expectedNames = [
                'Unity.RenderPipelines.Universal.Editor',
                'Unity.RenderPipelines.Universal.Runtime',
                'Unity.RenderPipelines.Universal.Shaders',
                'Unity.RenderPipelines.Universal.Tests'
            ];
            assert.deepStrictEqual(assemblyNames, expectedNames);
            
            // Verify specific assemblies exist
            const runtimeAssembly = packageInfo.assemblies.find(a => a.name === 'Unity.RenderPipelines.Universal.Runtime');
            assert.ok(runtimeAssembly);
            
            const editorAssembly = packageInfo.assemblies.find(a => a.name === 'Unity.RenderPipelines.Universal.Editor');
            assert.ok(editorAssembly);
        });

        it('should handle simple package structure with top-level assemblies', async () => {
            // Create a package with simple top-level subdirectories containing assembly definitions
            const packageDir = path.join(packageCacheDir, 'com.unity.addressables@1.21.19');
            
            // Create top-level subdirectories only
            const runtimeDir = path.join(packageDir, 'Runtime');
            const editorDir = path.join(packageDir, 'Editor');
            const testsDir = path.join(packageDir, 'Tests');
            
            await mkdir(runtimeDir, { recursive: true });
            await mkdir(editorDir, { recursive: true });
            await mkdir(testsDir, { recursive: true });
            
            // Create package.json
            const packageJson = {
                name: 'com.unity.addressables',
                version: '1.21.19',
                displayName: 'Addressables'
            };
            await writeFile(path.join(packageDir, 'package.json'), JSON.stringify(packageJson, null, 2));
            
            // Create assembly definitions in top-level subdirectories only
            const assemblies = [
                {
                    name: 'Unity.Addressables',
                    dir: runtimeDir,
                    references: ['Unity.ResourceManager']
                },
                {
                    name: 'Unity.Addressables.Editor',
                    dir: editorDir,
                    references: ['Unity.Addressables']
                },
                {
                    name: 'Unity.Addressables.Tests',
                    dir: testsDir,
                    references: ['Unity.Addressables', 'Unity.TestRunner']
                }
            ];
            
            for (const assembly of assemblies) {
                const asmdef = {
                    name: assembly.name,
                    references: assembly.references
                };
                await writeFile(
                    path.join(assembly.dir, `${assembly.name}.asmdef`),
                    JSON.stringify(asmdef, null, 2)
                );
            }
            
            await packageHelper.updatePackages();
            
            const packageInfo = packageHelper.getPackageByName('com.unity.addressables');
            assert.ok(packageInfo);
            assert.strictEqual(packageInfo.assemblies.length, 3);
            
            // Verify all assemblies were found
            const assemblyNames = packageInfo.assemblies.map(a => a.name).sort();
            const expectedNames = [
                'Unity.Addressables',
                'Unity.Addressables.Editor',
                'Unity.Addressables.Tests'
            ];
            assert.deepStrictEqual(assemblyNames, expectedNames);
            
            const runtimeAssembly = packageInfo.assemblies.find(a => a.name === 'Unity.Addressables');
            assert.ok(runtimeAssembly);
         });



         it('should handle packages with empty directories and malformed assembly definitions', async () => {
             const packageDir = path.join(packageCacheDir, 'com.unity.test.malformed@1.0.0');
             
             // Create various directory structures
             const emptyDir = path.join(packageDir, 'EmptyDirectory');
             const validDir = path.join(packageDir, 'Runtime');
             const malformedDir = path.join(packageDir, 'Malformed');
             
             await mkdir(emptyDir, { recursive: true });
             await mkdir(validDir, { recursive: true });
             await mkdir(malformedDir, { recursive: true });
             
             // Create package.json
             const packageJson = {
                 name: 'com.unity.test.malformed',
                 version: '1.0.0'
             };
             await writeFile(path.join(packageDir, 'package.json'), JSON.stringify(packageJson, null, 2));
             
             // Create a valid assembly definition
             const validAsmdef = {
                 name: 'Unity.Test.Valid',
                 references: []
             };
             await writeFile(path.join(validDir, 'Unity.Test.Valid.asmdef'), JSON.stringify(validAsmdef, null, 2));
             
             // Create malformed assembly definition (invalid JSON)
             await writeFile(path.join(malformedDir, 'Unity.Test.Malformed.asmdef'), '{ "name": "Unity.Test.Malformed", invalid json }');
             
             await packageHelper.updatePackages();
             
             const packageInfo = packageHelper.getPackageByName('com.unity.test.malformed');
             assert.ok(packageInfo);
             
             // Should only find the valid assembly definition (malformed JSON should be skipped)
             assert.strictEqual(packageInfo.assemblies.length, 1);
             assert.strictEqual(packageInfo.assemblies[0].name, 'Unity.Test.Valid');
         });
    });

    describe('Package Queries', () => {
        beforeEach(async () => {
            // Set up test packages
            await createTestPackage('com.unity.inputsystem@7fe8299111a7', {
                name: 'com.unity.inputsystem',
                version: '1.7.0'
            }, [{
                name: 'Unity.InputSystem',
                subdirectory: 'Runtime'
            }]);
            
            await createTestPackage('com.unity.ugui@abc123def456', {
                name: 'com.unity.ugui',
                version: '1.0.0'
            }, [{
                name: 'UnityEngine.UI',
                subdirectory: 'Runtime'
            }]);
            
            await packageHelper.updatePackages();
        });

        it('should find package by name', () => {
            const packageInfo = packageHelper.getPackageByName('com.unity.inputsystem');
            assert.ok(packageInfo);
            assert.strictEqual(packageInfo.name, 'com.unity.inputsystem');
            assert.strictEqual(packageInfo.version, '1.7.0');
        });

        it('should find package by assembly name', () => {
            const packageInfo = packageHelper.getPackageByAssembly('Unity.InputSystem');
            assert.ok(packageInfo);
            assert.strictEqual(packageInfo.name, 'com.unity.inputsystem');
        });

        it('should return undefined for non-existent package', () => {
            const packageInfo = packageHelper.getPackageByName('com.nonexistent.package');
            assert.strictEqual(packageInfo, undefined);
        });

        it('should return undefined for non-existent assembly', () => {
            const packageInfo = packageHelper.getPackageByAssembly('NonExistent.Assembly');
            assert.strictEqual(packageInfo, undefined);
        });

        it('should return all packages', () => {
            const packages = packageHelper.getAllPackages();
            assert.strictEqual(packages.length, 2);
            
            const packageNames = packages.map(p => p.name).sort();
            assert.deepStrictEqual(packageNames, ['com.unity.inputsystem', 'com.unity.ugui']);
        });
    });

    describe('Package Updates', () => {
        it('should handle missing PackageCache directory gracefully', async () => {
            // Create helper with non-existent directory
            const nonExistentHelper = new UnityPackageHelper('/non/existent/path');
            
            // Should not throw
            await nonExistentHelper.updatePackages();
            
            const packages = nonExistentHelper.getAllPackages();
            assert.strictEqual(packages.length, 0);
        });

        it('should clear all data', async () => {
            await createTestPackage('com.unity.test@123456', {
                name: 'com.unity.test',
                version: '1.0.0'
            }, []);
            
            await packageHelper.updatePackages();
            assert.strictEqual(packageHelper.getAllPackages().length, 1);
            
            packageHelper.clear();
            assert.strictEqual(packageHelper.getAllPackages().length, 0);
        });
    });

    // Helper function to create test packages
    async function createTestPackage(
        directoryName: string, 
        packageJson: Record<string, unknown>, 
        assemblies: Array<{name: string, subdirectory: string, references?: string[], rootNamespace?: string, includePlatforms?: string[], excludePlatforms?: string[]}>
    ): Promise<void> {
        const packageDir = path.join(packageCacheDir, directoryName);
        await mkdir(packageDir, { recursive: true });
        
        // Create package.json
        await writeFile(path.join(packageDir, 'package.json'), JSON.stringify(packageJson, null, 2));
        
        // Create assembly definitions
        for (const assembly of assemblies) {
            const assemblyDir = path.join(packageDir, assembly.subdirectory);
            await mkdir(assemblyDir, { recursive: true });
            
            const asmdef: Record<string, unknown> = {
                name: assembly.name,
                references: assembly.references || []
            };
            
            // Add optional properties if provided
            if (assembly.rootNamespace) {
                asmdef.rootNamespace = assembly.rootNamespace;
            }
            if (assembly.includePlatforms && assembly.includePlatforms.length > 0) {
                asmdef.includePlatforms = assembly.includePlatforms;
            }
            if (assembly.excludePlatforms && assembly.excludePlatforms.length > 0) {
                asmdef.excludePlatforms = assembly.excludePlatforms;
            }
            
            await writeFile(
                path.join(assemblyDir, `${assembly.name}.asmdef`), 
                JSON.stringify(asmdef, null, 2)
            );
        }
    }
});