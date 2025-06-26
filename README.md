## Unity Code

A Visual Studio Code extension that enhances Unity development workflow with neat automatic tools, Unity Tests, and great official doc links or xml docs when mouse hover a symbol.

## Features

### Automatic Meta File Renaming
Automatically renames Unity `.meta` files when you rename assets in VS Code, making refactoring class names more easy.

### C# Documentation Hover
Shows beautiful markdown from xml docs for in project classes and members.

Show docs links for classes from Unity official Scripting API or official Unity packages, also doc links for official classes from .NET and also some popular .NET libraries. 

### Unity Test Explorer
Detects and displays Unity tests in VS Code's Test Explorer. Run tests directly inside VS Code!

Also there is code lens above test methods and classes, run tests right after you wrote your code, just click on the run test button above the test method you changed(you must save the file to trigger Unity's refresh, see settings below).

Also, you need to install my Visual Studio Editor package in Unity in order to leverage the full power of this extension. You can click run tests right when Unity Editor is compiling, and the tests will run right after the compile finished(Even Rider can't do this reliablely)! Thanks to my Unity package and this extension understanding Unity perfectly!

### Language Server Integration
Works with both C# Dev Kit and Dot Rush. Pick what you want.

### VS Code Forks
Should work in any VS Code fork, however my Unity package only supports popular VS Code forks for now but you can create a pull request for your favorate VS Code fork.

### Auto-refresh on C# File Save
When you save a C# file in a Unity project, the extension will trigger Unity's asset database refresh.

This ensures Unity detects your code changes and triggers recompilation.

### Unity Log Forwarding
Receive Unity Editor log messages (Info, Warning, Error) directly in VS Code's Output Channel.

Logs appear in the "Unity Logs" output channel with timestamps. You can access them via:
- Command Palette: `Unity Code: Show Unity Logs`
- View → Output → Select "Unity Logs" from dropdown

Logs are also forwarded to the Debug Console for developers.

### Unity Console
View Unity logs in a dedicated console panel with filtering and clickable stack traces.

The Unity Console appears in VS Code's bottom panel and provides:
- Real-time Unity log display with Info, Warning, and Error filtering
- Clickable stack traces that navigate directly to source files
- Clear logs functionality and log history management
- Command Palette: `Unity Code: Show Unity Console`

### Unity Debugging
Debug Unity projects directly from VS Code using the integrated MonoDebugger.

Features include:
- **Attach to Unity Editor**: Seamlessly attach debugger to running Unity Editor
- **Breakpoint Support**: Set and manage breakpoints in C# scripts
- **Variable Inspection**: View and modify variable values during debugging
- **Step Through Code**: Step over, into, and out of functions
- **Call Stack Navigation**: Navigate through the execution call stack
- **Exception Handling**: Break on exceptions with detailed information
- **Configurable Options**: Customize debugging behavior through VS Code settings

**Platform Support**: Currently Windows x64 only (more platforms planned)

See [Debugger Usage Guide](./docs/DebuggerUsage.md) for detailed setup and usage instructions.

### Settings
You can control the extension behavior with these settings:

- `unity-code.autoRefreshUnity` (default: `true`): Enable/disable automatic Unity asset database refresh when C# files are saved
- `unity-code.refreshTestsOnWindowFocus` (default: `true`): Automatically refresh Unity tests when VS Code window regains focus
- `unity-code.showUnityLogs` (default: `true`): Enable/disable Unity log messages forwarding to VS Code Output Channel
