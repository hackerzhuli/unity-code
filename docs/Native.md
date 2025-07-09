# Native Code
Native binaries are included in bin directory. Their source code is not in this project, and they will be built and copied to the bin directory here.

They are:
- `unity_code_native` - The binary that does Unity Editor detection and serves as a language server
- `MonoDebugger` - The debugger for Unity games

## Directory Structure
```
bin/
├── win_x64/
│   ├── unity_code_native.exe
│   └── MonoDebugger.exe
├── win_arm64/
│   ├── unity_code_native.exe
│   └── MonoDebugger.exe
├── linux_x64/
│   ├── unity_code_native
│   └── MonoDebugger
├── linux_arm64/
│   ├── unity_code_native
│   └── MonoDebugger
├── mac_x64/
│   ├── unity_code_native
│   └── MonoDebugger
├── mac_arm64/
│   ├── unity_code_native
│   └── MonoDebugger
```

## Native Binary Locator

The `NativeBinaryLocator` class provides a centralized way to locate native binaries across different platforms. It's implemented as a singleton to ensure consistent binary path resolution throughout the extension.

### Features

- **Platform Detection**: Automatically detects the current platform and architecture (Windows/Linux/macOS with x64/arm64)
- **Binary Path Resolution**: Provides dedicated methods for each binary type
- **Existence Checking**: Verifies that binaries exist before returning paths
- **Cross-Platform Support**: Handles platform-specific file extensions and paths for all supported platforms

### Usage

```typescript
import { NativeBinaryLocator } from './nativeBinaryLocator.js';

// Initialize the locator (usually done once in extension activation)
const locator = new NativeBinaryLocator(extensionRoot);

// Get specific binary paths
const unityNativePath = locator.getUnityCodeNativePath();
const debuggerPath = locator.getMonoDebuggerPath();

// Check if binaries are available for the current platform
if (unityNativePath && debuggerPath) {
    // Binaries are available for this platform
}
```

### Platform Support

The binary locator supports all major platforms and architectures:
- Windows x64 (win_x64)
- Windows ARM64 (win_arm64)
- Linux x64 (linux_x64)
- Linux ARM64 (linux_arm64)
- macOS x64 (mac_x64)
- macOS ARM64 (mac_arm64)

The locator automatically detects the current platform and architecture, then attempts to locate the appropriate binaries. If binaries are not available for a specific platform, the methods will return `undefined`.

### Integration

The `UnityBinaryManager` class now uses `NativeBinaryLocator` to find the `unity_code_native` binary, providing better error handling and platform compatibility.

## Unity Binary Manager

The Unity Binary Manager provides a unified interface to `unity_code_native`, combining both Unity detection and language server capabilities in a single process.

### Features

- **Unified Process**: Single binary instance for both UDP detection and LSP
- **C# Language Features**: IntelliSense, hover information, and diagnostics via LSP
- **Unity Detection**: Real-time Unity Editor state monitoring via UDP
- **Automatic Management**: Starts and stops with Unity project detection
- **Resource Efficient**: Eliminates the need for separate processes

### Usage

The binary manager is automatically initialized when:
1. A Unity project is detected in the workspace
2. The `unity_code_native` binary is available
3. The extension activates

### Implementation Details

#### Dual Mode Operation
- **UDP Mode**: For Unity Editor detection and state monitoring
- **LSP Mode**: For C# language server functionality
- **Unified Process**: Both modes run in the same binary instance

#### Server Arguments
- `projectPath`: Path to the Unity project root
- `--dual-mode`: Flag to enable both UDP and LSP functionality

#### Document Selector (LSP)
- **Scheme**: `file`
- **Language**: `csharp`

#### File Watching (LSP)
- Monitors `**/*.cs` files for changes
- Automatically synchronizes with the language server

#### Transport
- **UDP**: For Unity detection messages
- **stdio**: For language server communication

### Integration with Unity Detection

The `UnityBinaryManager` uses a single `unity_code_native` binary process that provides both:
- **UDP Detection**: Communicates via UDP for real-time Unity Editor state monitoring
- **Language Server**: Communicates via LSP for C# language features

The binary handles both protocols simultaneously, allowing for comprehensive Unity development support.
