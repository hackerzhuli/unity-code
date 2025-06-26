# Unity Code Debugger Usage Guide

This guide explains how to use the Unity Code Debugger feature in the UnityCode extension.

## Prerequisites

- **Platform Support**: Currently only Windows x64 is supported
- **Unity Project**: Must be working within a Unity project (detected by `ProjectSettings/ProjectVersion.txt`)
- **MonoDebugger Binary**: The extension includes the required `MonoDebugger.exe` binary

## Setting Up Debugging

### Automatic Configuration

The Unity Code Debugger will automatically detect when you're working in a Unity project and configure itself appropriately.

### Manual Configuration

If you need to create a custom debug configuration:

1. Open the Debug view in VS Code (Ctrl+Shift+D)
2. Click "create a launch.json file" if you don't have one
3. Select "Unity Code" from the environment list
4. This will create a basic configuration like:

This will add the following configuration to your `.vscode/launch.json`:

```json
{
    "name": "Unity Code Attach",
    "type": "unity-code",
    "request": "attach",
    "cwd": "${workspaceFolder}"
}
```

## Debugger Settings

The extension provides several configuration options in VS Code settings:

### Core Settings

- **`unity-code.debugger.stepOverPropertiesAndOperators`** (default: `true`)
  - Step over properties and operators when debugging Unity code

- **`unity-code.debugger.projectAssembliesOnly`** (default: `true`)
  - Only debug project assemblies, excluding Unity engine and third-party libraries

### Advanced Settings

- **`unity-code.debugger.automaticSourceLinkDownload`** (default: `false`)
  - Automatically download source files using SourceLink when debugging

- **`unity-code.debugger.symbolSearchPaths`** (default: `[]`)
  - Additional paths to search for debug symbols

- **`unity-code.debugger.searchMicrosoftSymbolServer`** (default: `false`)
  - Search Microsoft symbol server for debug symbols

## How to Debug

1. **Start Unity Editor**: Make sure Unity Editor is running with your project
2. **Set Breakpoints**: Place breakpoints in your C# scripts within VS Code
3. **Start Debugging**: 
   - Press `F5` or
   - Go to Run and Debug view (`Ctrl+Shift+D`) and click "Start Debugging"
   - Select "Unity Attach" configuration if prompted
4. **Attach to Unity**: The debugger will automatically attach to the running Unity Editor
5. **Debug Your Code**: Trigger the code paths in Unity to hit your breakpoints

## Debugging Features

### Supported Operations
- **Breakpoints**: Set and manage breakpoints in C# scripts
- **Step Through Code**: Step over, step into, and step out of functions
- **Variable Inspection**: View and modify variable values
- **Call Stack**: Navigate through the call stack
- **Watch Expressions**: Monitor specific expressions
- **Exception Handling**: Break on exceptions

### Evaluation Options
- **Timeout Settings**: Configurable evaluation timeouts
- **Method Evaluation**: Allow method calls during debugging
- **ToString Calls**: Enable ToString() method calls for object inspection
- **String Ellipsization**: Truncate long strings for better readability

## Troubleshooting

### Common Issues

1. **"Unity debugging is not supported on this platform"**
   - Solution: Currently only Windows x64 is supported. Ensure you're running on a compatible platform.

2. **"MonoDebugger binary not found"**
   - Solution: Reinstall the extension or check if the binary exists in `bin/win_x64/MonoDebugger.exe`

3. **Debugger won't attach**
   - Ensure Unity Editor is running
   - Check that your project is properly detected as a Unity project
   - Verify the working directory (`cwd`) is set to your Unity project root

4. **Breakpoints not hitting**
   - Ensure you're building with debug symbols
   - Check that `projectAssembliesOnly` setting matches your debugging needs
   - Verify the code path is actually being executed in Unity

### Debug Logs

The extension logs debug information to the VS Code Developer Console. To view:

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run "Developer: Toggle Developer Tools"
3. Check the Console tab for Unity Code debug messages

## Technical Details

### Transport ID
The debugger uses a unique transport ID in the format `dotrush-${process.pid}` for external type resolution.

### Binary Location
The MonoDebugger binary is located at:
- Windows: `bin/win_x64/MonoDebugger.exe`
- Linux: `bin/linux_x64/MonoDebugger` (planned)
- macOS: `bin/mac_arm64/MonoDebugger` (planned)

### Configuration Provider
The extension registers a debug configuration provider for the `unity` debug type, which automatically configures the debugger with appropriate settings for Unity development.