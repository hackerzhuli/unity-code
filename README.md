## A word from author
Hi, I am a long time game developer here. I swtiched to VS Code and forks to develop games this year(2025), said my goodbye to traditional C# IDEs like Visual Studio and Rider. The Unity extension for VS Code is not too bad but not good enough either, and what's worse, it is not available in VS Code forks. That is why I built Unity Code Pro. So VS Code and its forks can become real Unity IDEs. Enable us to develop games more efficiently.

**⚠️ About the name:** Sorry for the Pro at the end of the name that sounds like a paid extension, I intended to call it Unity Code, but vs marketplace doesn't allow extensions with the same name, and the name is already taken by an extension named Unity Code which was abandoned the day it was published years ago. So I had to change the name to Unity Code Pro, but it is still totally free and open source.

**⚠️ Dependency:** This extension depends on [Dot Rush](https://github.com/JaneySprings/DotRush), which is a C# language server. If you're using C# extension or C# dev kit extension, you have to disable them in order for this extension to function correctly.

**⚠️ Platform Support:** Currently supports Windows x64 only. For other platforms (Linux, macOS), you can build the extension yourself from the source code.

**⚠️ Unity Version Requirement:** Our companion Unity package requires Unity 6.0 or higher.

## Description

Unity Code Pro is a powerful Visual Studio Code extension that brings professional Unity development tools directly to your favorite code editor. Whether you're using VS Code, Cursor, or Trae, Unity Code Pro delivers a seamless Unity development experience with integrated testing, debugging, and intelligent documentation features.

**🎯 Perfect for developers who want:**
- **🚀 Faster development cycles** with integrated testing and debugging
- **📖 Better code documentation** with one-click access to Unity and .NET docs
- **💰 Cost-effective solution** that doesn't require expensive subscriptions
- **⚡ Lightweight tooling** that doesn't slow down your development machine

## Features

### 🧪 Unity Test Explorer
Displays Unity tests in your code editor's Testing window. Run tests right where your method is at! See the test results and stack trace(for failed tests) right inside your test method!

- **Run tests directly in your editor** - No more switching between Unity and your code editor
- **Inline test results** - See pass/fail status right where your test methods are defined
- **Clickable stack traces** - Click on stack trace line for failed test to go to the source line where it fails instantly
- **One-click test execution** - Run individual tests or entire test suites with a single click
- **Run tests reliably** - You can click run test when Unity is compiling, and it will run the test right after compilation finishes

![Unity Tests](./assets/Run%20Unity%20Tests%20In%20VS%20Code.webp)

### 📊 Unity Console
See Unity logs in your code editor with clickable stack trace!

- **Real-time Unity logs** - See all Unity console output directly in your editor
- **Clickable stack traces** - Navigate directly to the source of the logs
- **Log filtering** - Search specific words to find the logs you need

![Unity Console](./assets/Unity%20Console.webp)

### 🐛 Unity Debugger
Attach to Unity Editor from your code editor using the integrated MonoDebugger and crush the bugs!

- **Seamless debugging experience** - Attach to Unity Editor with one click
- **Full breakpoint support** - Set breakpoints, inspect variables, and step through code
- **MonoDebugger integration** - Professional-grade debugging capabilities
- **No external tools required** - Everything you need built right into your editor

![Debug](./assets/Debug%20in%20VS%20Code.webp)

### 🎨 USS Language Server
Includes a USS language server! This is the first time someone have built an open source language server for USS! I built it from scratch for anyone who want to do UIToolkit development in VS Code!

- **High performance** - Written in Rust, built from the ground up for performance. Get instant feedback (diagnostics) on syntax and values as you type! 100% high performance as a game dev's code should be!
- **Syntax highlighting** - Beautiful, accurate syntax highlighting for USS and TSS files
- **Comprehensive auto-completion** - Property names, values, selectors, pseudo-classes, and asset URLs. For element names, it knows all Unity Engine UXML elements like `Button` and `Label` and provides auto-completion when you type them. For URLs, auto-completion will complete from `Assets` all the way down to individual sprites in multi-sprite image assets
- **Advanced diagnostics** - Syntax validation, asset path (e.g., `url()` functions) validation, property value validation - everything you need and more. 100% USS native, validates every property that USS has and checks the values you provide with accuracy, producing almost the same errors (and more) as Unity itself does. It goes above and beyond and tries to validate property values even if they contain `var()`, which no one - not Unity, or any CSS language server - does (though it's not 100% accurate since we can't know variable values at runtime)
- **Intelligent hover documentation** - Rich tooltips with syntax examples and keyword explanations. No need to check official docs when you have quick hover documentation that's completely Unity-specific, no browser or CSS complications. Also provides links to official (mostly Unity's) documentation
- **Code formatting** - Document and selection formatting for USS and TSS files
- **Refactoring** - Rename operations for ID and class selectors


Auto Completion:

![USS Auto Completion](./assets/USS%20Auto%20Completion%202.webp)

Diagnostics:

![USS Diagnostics](./assets/USS%20Diagnostics.webp)

Hover Docs:

![USS Hover Documentation](./assets/USS%20Hover%20Docs.webp)

### 📚 Intelligent Documentation
Shows beautiful markdown from xml docs for in project classes and members. Show docs links for classes from Unity official Scripting API or official Unity packages, also doc links for official classes from .NET.

- **Hover documentation** - Show links for C# documentation on mouse hover
- **Unity API links** - Direct links to official Unity Scripting API documentation
- **Smart context awareness** - Know which Unity package and version this class is from and show you the link to docs

![Hover Doc Link](./assets/Hover%20Doc%20Link.webp)

### 🔍 Advanced Code Analysis
- **Roslyn-powered static analysis** - Unity-specific code analysis that understands Unity patterns and best practices
- **Real-time problem detection** - See issues, warnings, and suggestions directly in your editor as you type
- **Unity-aware diagnostics** - Specialized analyzers for Unity-specific code patterns and performance optimizations
- **Instant feedback** - No need to compile or switch to Unity to see code issues

![Static Analysis](./assets/Static%20Analysis.webp)

### 🔄 Smart Asset Management
Automatically renames Unity `.meta` files when you rename assets in your code editor, making refactoring class names more easy. It also does the right thing when you move or delete an asset in your code editor.

- **Automatic meta file handling** - Unity `.meta` files are automatically renamed when you rename or move files
- **Asset database refresh** - Automatic Unity recompilation when you save C# scripts
- **Smart Unity awareness** - Knows about whether you're in play mode, whether Unity maybe compiling, and whether you are running Hot Reload for Unity

![Status Bar](./assets/Status%20Bar.webp)

## Dependencies
To use this extension, you have to first install my Unity package [Visual Studio Code Editor](https://github.com/hackerzhuli/com.hackerzhuli.code) in Unity. Also this extension depends on [Dot Rush](https://github.com/JaneySprings/DotRush).

## Installation
You can install this extension inside your code editor in the integrated marketplace or use the release binary here in this repo.

## Platform Support
I only support Windows x64.

For people who want to use this extension on other platforms, you have to build it yourself.

If you would like, you can create a fork and publish it as your own extension to share your build with the community. Your extension will be able to work with my Unity package without issues(mostly).

### Build
First you have to build the native binaries, they are [unity_code_native](https://github.com/hackerzhuli/unity_code_native) and [UnityCodeSharp](https://github.com/hackerzhuli/UnityCodeSharp).

Once you have built them, copy them(just the executables are enough) into the platform specific folder in bin directory. Like shown below.

Also there is one assembly, that you want to copy to assemblies folder, it's `Microsoft.Unity.Analyzers.dll`, from publish output from one of our UnityCodeSharp project(you can also get it from NuGet).

```
assets/
├──unityConsole.html
└──...
assemblies/
├──Microsoft.Unity.Analyzers.dll
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
npm run build:win     # Build for Windows x64
npm run build:linux   # Build for Linux x64
npm run build:macarm   # Build for macOS ARM64
```
