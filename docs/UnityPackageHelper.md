# UnityPackageHelper

A helper class that will find Unity packages in workspace. It supports both cached packages from Library/PackageCache and embedded packages from the Packages directory. First we assume there is only one workspace that is a unity project, and we will take that workspace as a starting point.

## The PackageCache Directory
The Library/PackageCache directory is where Unity will install packages.

Each package is a folder in that directory. The folder name is the package name + "@" + a commit hash, example `com.unity.inputsystem@7fe8299111a7`.

This means that if the folder name changes, the package is updated and we need to update our internal state if needed.

The goal is to scan the PackageCache directory and find all packages. And find all assembly definition files inside of it. The assembly definition is like a C# project file, it defines the name of the dlls the package will put out. The location of the assembly definition is inside of a sub directory of the package directory, typically called Runtime. There can be multiple assembly definition files in a package, typically test assembly in Tests sub directory, and Editor sub directory, but we should not make assumptions about the names of directories that contains assembly definition files, just that it is in top level sub directories in the package directory and one directory can only directly contain one assembly definition file.

The extension of assembly definition file is `.asmdef`, and the content format is JSON. Example:
``` txt
{
    "name": "Unity.InputSystem",
    "rootNamespace": "",
    "references": [
        "Unity.ugui"
    ]
}
```

The name is the most important property we care, that is the name of the assembly that this file will produce, for example, the name `Unity.InputSystem' here will produce the dll 'Unity.InputSystem.dll'.

This helper class should provide the ability to get info(at least name and version) about a package with a package name, also get package info with a .dll file name(a package might have multiple dlls). 

This helper class provide a method to update packages, which only scan PackageCache packages that changed or is new, and not try to look at packages that didn't change. If a package's directory name didn't change, then it didn't change, because the direcotory name contains a commit hash.

Also I forget to mention the most important file in the package directory, that is the package.json file, extract name and version from it, this is the most important info about the packge.

## Packages directory
The Packages directory is where user will put their packages directly in their Unity project, it's called embedded packages. Similar to Library/PackageCache, we detect packages that are directly put in this directory. The key differences for embedded packages are:

1. **No caching optimization**: Since directory names don't contain hashes and may not match package names, we always rescan embedded packages during updates.
2. **Package identification**: We rely on the package.json file to determine the actual package name, not the directory name.
3. **Embedded flag**: All packages have an `isEmbedded` boolean flag to distinguish between cached and embedded packages.

## API Methods

The UnityPackageHelper class now provides these key methods:

- `updatePackages()`: Scans both PackageCache and Packages directories
- `getPackageByName(packageName)`: Get package info by package name
- `getPackageByAssembly(assemblyName)`: Get package info by assembly/dll name
- `getAllPackages()`: Get all packages (both cached and embedded)
- `getEmbeddedPackages()`: Get only embedded packages
- `getCachedPackages()`: Get only cached packages
- `isPackageEmbedded(packageName)`: Check if a specific package is embedded
- `isPackagePath(filePath)`: Check if a file path belongs to any package
- `getPackageByPath(filePath)`: Get package info by file path (async method that finds the package containing the given path)

## PackageInfo Interface

Each package is represented by a PackageInfo object with these properties:

```typescript
interface PackageInfo {
    name: string;           // Package name from package.json
    version: string;        // Package version
    displayName?: string;   // Human-readable name
    description?: string;   // Package description
    documentationUrl?: string; // Documentation URL from package.json
    directoryName: string;  // Directory name on disk
    directoryPath: string;  // Full path to package directory
    assemblies: AssemblyInfo[]; // Assembly definitions found
    isEmbedded: boolean;    // True for Packages/, false for PackageCache/
}
```