## Motivation
Why create my own extension when there is an official Unity extension? Because we can't use Unity extension and C# Dev Kit (which Unity extension depends on) outside of VS Code. That is why I decided to build Unity Code. So I can develop Unity games in whichever VS Code fork I like with ease. So can you, it's totally free and open source!

## Description

Unity Code is a Visual Studio Code extension that enables good Unity development experience in Cursor, Windsurf and Trae with Unity Tests, Unity Debugger, and other useful features for Unity game development.

## Features

### Unity Test Explorer
Displays Unity tests in your code editor's Testing window. Run tests right where your method is at! See the test results and stack trace(for failed tests) right inside your test method!

### Unity Console
See Unity logs in your code editor with clickable stack trace!

### Unity Debugger
Attach to Unity Editor from your code editor using the integrated MonoDebugger and crush the bugs!

### Automatic Meta File Renaming
Automatically renames Unity `.meta` files when you rename assets in your code editor, making refactoring class names more easy. It also does the right thing when you move or delete an asset in your code editor.

### Mouse hover documentation for C#
Shows beautiful markdown from xml docs for in project classes and members. Show docs links for classes from Unity official Scripting API or official Unity packages, also doc links for official classes from .NET.

### Auto refresh asset database when saving assets
When you save an asset in your code editor, the extension will automatically trigger an asset database refresh (if you have enabled it in settings), which means if you saved a C# script, it will trigger a recompile.

## Dependencies
To use this extension, you have to first install my Unity package [Visual Studio Code Editor](https://github.com/hackerzhuli/com.hackerzhuli.code) in Unity. Also this extension depends on [Dot Rush](https://github.com/JaneySprings/DotRush).

## Platform Support
I only support Windows x64.

For people who want to use this extension on other platforms, you have to build it yourself.

If you would like, you can create a fork and publish it on [Open VSX](https://open-vsx.org/) as your own extension to share your build with the community. Your extension will be able to work with my Unity package without issues.

### Build
First you have to build the native binaries, they are [unity_code_native](https://github.com/hackerzhuli/unity_code_native) and [UnityCodeSharp](https://github.com/hackerzhuli/UnityCodeSharp).

Once you have built them, copy them(just the executables are enough) into the platform specific folder in bin directory. Like shown below.

```
assets/
├──unityConsole.html
└──...
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
└── mac_arm64/
    ├── unity_code_native
    └── MonoDebugger
src/
├──extension.ts
└──...
```

And proceed to build the extension, our build script will only package what's needed, will not include binaries that is not the target platform.

``` bash
# Install dependencies
npm install

# eg. build the package for specific platforms
npm run build:win_x64     # Build for Windows x64
npm run build:linux_x64   # Build for Linux x64
npm run build:mac_arm64   # Build for macOS ARM64
```

### Publishing to Open VSX

The extension also supports direct publishing to the Open VSX Registry.

```bash
# First, set your Open VSX access token as environment variable OVSX_PAT in your terminal or OS

# Then publish a platform-specific build to Open VSX, this will build and publish the extension for the specified platform
npm run publish:win_x64     # Build and publish for Windows x64
npm run publish:mac_arm64   # Build and publish for macOS ARM64
```
