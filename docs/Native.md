# Native Code
Native binaries are included in bin directory. Their source code is not in this project, and they will be built and copied to the bin directory here.

They are:
- `unity_code_native` - The binary that does Unity Editor detection
- `MonoDebugger` - The debugger for Unity games

## Directory Structure
```
bin/
├── win_x64/
│   ├── unity_code_native.exe
│   └── MonoDebugger.exe
├── linux_x64/
│   ├── unity_code_native
│   └── MonoDebugger
├── mac_arm64/
│   ├── unity_code_native
│   └── MonoDebugger
```

## Native Binary Locator

The `NativeBinaryLocator` class provides a centralized way to locate native binaries across different platforms. It's implemented as a singleton to ensure consistent binary path resolution throughout the extension.

### Features

- **Platform Detection**: Automatically detects the current platform (Windows, Linux, macOS)
- **Binary Path Resolution**: Provides dedicated methods for each binary type
- **Existence Checking**: Verifies that binaries exist before returning paths
- **Cross-Platform Support**: Handles platform-specific file extensions and paths

### Usage

```typescript
import { getNativeBinaryLocator, NativeBinary } from './nativeBinaryLocator.js';

// Initialize the locator (usually done once in extension activation)
const locator = getNativeBinaryLocator(extensionRoot);

// Get specific binary paths
const unityNativePath = locator.getUnityCodeNativePath();
const debuggerPath = locator.getMonoDebuggerPath();

// Check platform support
if (locator.isPlatformSupported()) {
    // Platform is supported
}

// Get all available binaries
const allBinaries = locator.getAllBinaryPaths();
```

### Platform Support

Currently, only Windows (win_x64) is fully supported. Linux and macOS support may be added in future releases when the corresponding native binaries are available.

### Integration

The `UnityDetector` class now uses `NativeBinaryLocator` to find the `unity_code_native` binary, providing better error handling and platform compatibility.
