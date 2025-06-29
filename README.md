## Description

Unity Code is a Visual Studio Code extension that enhances Unity development experience in Cursor, Windsurf and Trae with Unity Tests, Unity Debugger, and other useful features for Unity devlopment.

## Motivation
Why create my own Unity extension when there is an official Unity extension? Because we are not allowed to use Unity extension and C# Dev Kit(Unity extension depends on) outside of VS Code according to their license or terms of use. That is why I decided to build Unity Code. So I can develop Unity games in Cursor, Windsurf and Trae with ease. So can you, it's totally free and open source!

## Features

### Unity Test Explorer
Displays Unity tests in your code editor's Testing window. Run tests right where your method is at! See the test results and stack trace(for failed tests) right inside your test method!

### Unity Console
See Unity logs in your code editor with clickable stack trace!

### Unity Debugger
Attach to Unity Editor from your code editor using the integrated MonoDebugger and crush the bugs!

### Automatic Meta File Renaming
Automatically renames Unity `.meta` files when you rename assets in your code editor, making refactoring class names more easy. It also does what's needed when you move/delete an asset in your code editor.

### C# Documentation Hover
Shows beautiful markdown from xml docs for in project classes and members. Show docs links for classes from Unity official Scripting API or official Unity packages, also doc links for official classes from .NET.

### Auto-refresh on C# File Save
When you save a C# file in a Unity project, the extension will automatically trigger a recompile (if you have enabled it in settings).

## Dependencies
To use this extension, you have to first install my Unity package [Visual Studio Code Editor](https://github.com/hackerzhuli/com.hackerzhuli.code) in Unity. Also this extension depends on Dot Rush.

## Platform Support
I only support Windows x64.

For people who want to use this extension on other platforms, you have to build it yourself.

If you would like, you can create a fork and publish it as your own extension for other platforms to share your build with the community. Your extension will be able to work with my Unity package without issues.

### Build
First you have to build the native binaries, they are [unity_code_native](https://github.com/hackerzhuli/unity_code_native) and [UnityCodeSharp](https://github.com/hackerzhuli/UnityCodeSharp).

Once you have built them, copy them(just the executables are enough) into the platform specific folder in bin directory. And proceed to build the extension.

``` bash
# Build the extension, TODO: show I include the command to install vsce?
npm install
npm run build
```
