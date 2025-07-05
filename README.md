## A word from author
The Unity extension is not too bad but not that good either, and what's worse, it is not available in VS Code forks. That is why I built Unity Code Pro. So VS Code and any fork can become a real Unity IDE.

**⚠️ About the name:** Sorry for the Pro at the end of the name that sounds like a paid extension, I intended to call it Unity Code, but vs marketplace doesn't allow extensions with the same name, and the name is already taken by an extension named Unity Code which was abandoned the day it was published years ago. So I had to change the name to Unity Code Pro, but it is still totally free and open source.

## Description

Unity Code Pro is a powerful Visual Studio Code extension that brings professional Unity development tools directly to your favorite code editor. Whether you're using VS Code, Cursor, Windsurf, or Trae, Unity Code Pro delivers a seamless Unity development experience with integrated testing, debugging, and intelligent documentation features.

**🎯 Perfect for developers who want:**
- **🤖 AI-Powered Development** - Use advanced AI-powered editors like Cursor, Windsurf, or Trae with full Unity IDE capabilities
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

![Unity Tests](./assets/Run%20Unity%20Tests%20In%20Trae.png)

### 📊 Unity Console
See Unity logs in your code editor with clickable stack trace!

- **Real-time Unity logs** - See all Unity console output directly in your editor
- **Clickable stack traces** - Navigate directly to the source of the logs
- **Log filtering** - Search specific words to find the logs you need

![Unity Console](./assets/Unity%20Console.png)

### 🐛 Unity Debugger
Attach to Unity Editor from your code editor using the integrated MonoDebugger and crush the bugs!

- **Seamless debugging experience** - Attach to Unity Editor with one click
- **Full breakpoint support** - Set breakpoints, inspect variables, and step through code
- **MonoDebugger integration** - Professional-grade debugging capabilities
- **No external tools required** - Everything you need built right into your editor

![Debug](./assets/Debug%20in%20Trae.png)

### 📚 Intelligent Documentation
Shows beautiful markdown from xml docs for in project classes and members. Show docs links for classes from Unity official Scripting API or official Unity packages, also doc links for official classes from .NET.

- **Hover documentation** - Show links for C# documentation on mouse hover
- **Unity API links** - Direct links to official Unity Scripting API documentation
- **Smart context awareness** - Know which Unity package and version this class is from and show you the link to docs

![Hover Doc Link](./assets/Hover%20Doc%20Link.png)

### 🔍 Advanced Code Analysis
- **Roslyn-powered static analysis** - Unity-specific code analysis that understands Unity patterns and best practices
- **Real-time problem detection** - See issues, warnings, and suggestions directly in your editor as you type
- **Unity-aware diagnostics** - Specialized analyzers for Unity-specific code patterns and performance optimizations
- **Instant feedback** - No need to compile or switch to Unity to see code issues

![Static Analysis](./assets/Static%20Analysis.png)

### 🔄 Smart Asset Management
Automatically renames Unity `.meta` files when you rename assets in your code editor, making refactoring class names more easy. It also does the right thing when you move or delete an asset in your code editor.

- **Automatic meta file handling** - Unity `.meta` files are automatically renamed when you rename or move files
- **Asset database refresh** - Automatic Unity recompilation when you save C# scripts
- **Smart Unity awareness** - Knows about whether you're in play mode, whether Unity maybe compiling, and whether you are running Hot Reload for Unity

![Status Bar](./assets/Status%20Bar.png)

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
