# Unity Code

A Visual Studio Code extension that enhances Unity development workflow with automated tools and documentation features.

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

## VS Code Forks
Should work in any VS Code fork, however my Unity package only supports popular VS Code forks for now but you can create a pull request for your favorate VS Code fork.

### Auto-refresh on C# File Save
When you save a C# file in a Unity project, the extension will trigger Unity's asset database refresh.

This ensures Unity detects your code changes and triggers recompilation.

### Settings
You can control the auto-refresh behavior with this setting:

- `unitycode.autoRefreshUnity` (default: `true`): Enable/disable automatic Unity asset database refresh when C# files are saved
