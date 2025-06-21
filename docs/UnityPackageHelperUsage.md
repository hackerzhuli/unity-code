# UnityPackageHelper Usage Guide

The `UnityPackageHelper` class provides functionality to scan and query Unity packages in a Unity project's PackageCache directory.

## Basic Usage

### Importing and Creating an Instance

```typescript
import { UnityPackageHelper, PackageInfo, AssemblyInfo } from './unityPackageHelper.js';

// Create an instance with the Unity project path
const packageHelper = new UnityPackageHelper('/path/to/unity/project');
```

### Scanning Packages

```typescript
// Scan for packages (only scans changed or new packages)
await packageHelper.updatePackages();

// Get all packages
const allPackages = packageHelper.getAllPackages();
console.log(`Found ${allPackages.length} packages`);
```

### Querying Package Information

```typescript
// Find package by name
const inputSystemPackage = packageHelper.getPackageByName('com.unity.inputsystem');
if (inputSystemPackage) {
    console.log(`Input System version: ${inputSystemPackage.version}`);
    console.log(`Assemblies: ${inputSystemPackage.assemblies.map(a => a.name).join(', ')}`);
}

// Find package by assembly name
const packageWithUI = packageHelper.getPackageByAssembly('UnityEngine.UI');
if (packageWithUI) {
    console.log(`Package containing UnityEngine.UI: ${packageWithUI.name}`);
}
```

## Integration with VS Code Extension

The `UnityPackageHelper` is automatically initialized when the extension activates in a Unity project:

```typescript
import { getPackageHelper } from './extension.js';

// Get the global package helper instance
const packageHelper = getPackageHelper();
if (packageHelper) {
    const packages = packageHelper.getAllPackages();
    // Use package information...
}
```

## Available Commands

- **Unity Code: Refresh Packages** - Manually refresh the package cache

## Data Structures

### PackageInfo

```typescript
interface PackageInfo {
    name: string;              // Package name (e.g., "com.unity.inputsystem")
    version: string;           // Package version (e.g., "1.7.0")
    displayName?: string;      // Human-readable name
    description?: string;      // Package description
    directoryName: string;     // Directory name with hash
    directoryPath: string;     // Full path to package directory
    assemblies: AssemblyInfo[]; // Assembly definitions in this package
}
```

### AssemblyInfo

```typescript
interface AssemblyInfo {
    name: string;              // Assembly name (e.g., "Unity.InputSystem")
    asmdefPath: string;        // Path to the .asmdef file
    rootNamespace?: string;    // Root namespace for the assembly
    references: string[];      // Referenced assemblies
}
```

## Performance Considerations

- The helper only scans packages that have changed since the last scan
- Package directories are identified by their commit hash in the directory name
- If a directory name hasn't changed, the package content is assumed unchanged
- Initial scan may take some time for projects with many packages

## Error Handling

The helper gracefully handles common error scenarios:

- Missing PackageCache directory (logs warning and continues)
- Malformed package.json files (skips the package)
- Invalid assembly definition files (skips the assembly)
- Permission errors (logs error and continues)

## Example: Finding All Input System Assemblies

```typescript
const packageHelper = getPackageHelper();
if (packageHelper) {
    const inputPackage = packageHelper.getPackageByName('com.unity.inputsystem');
    if (inputPackage) {
        console.log('Input System assemblies:');
        inputPackage.assemblies.forEach(assembly => {
            console.log(`- ${assembly.name}`);
            if (assembly.references.length > 0) {
                console.log(`  References: ${assembly.references.join(', ')}`);
            }
        });
    }
}
```

## Example: Package Dependency Analysis

```typescript
const packageHelper = getPackageHelper();
if (packageHelper) {
    const allPackages = packageHelper.getAllPackages();
    
    // Find packages that depend on Unity.ugui
    const uguiDependents = allPackages.filter(pkg => 
        pkg.assemblies.some(asm => asm.references.includes('Unity.ugui'))
    );
    
    console.log('Packages depending on Unity.ugui:');
    uguiDependents.forEach(pkg => {
        console.log(`- ${pkg.name} (${pkg.version})`);
    });
}
```