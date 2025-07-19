# Unity Code Pro - Professional Unity Development in VS Code

🚀 **Supercharge your Unity development workflow with Unity Code Pro!**

Unity Code Pro is a powerful Visual Studio Code extension that brings professional Unity development tools directly to your code editor. Unity Code Pro delivers a seamless Unity development experience with comprehensive features for modern Unity development. And it's 100% free and open source!

> **⚠️ Dependency:** This extension depends on [Dot Rush](https://github.com/JaneySprings/DotRush), which is a C# language server. If you're using C# extension or C# dev kit extension, you have to disable them in order for this extension to function correctly.
> 
> **⚠️ Platform Support:** Currently supports Windows x64 only. For other platforms (Linux, macOS), you can build the extension yourself from the source code.
> 
> **⚠️ Unity Version Requirement:** Our companion Unity package requires Unity 6.0 or higher.

## 🎯 Features

### 🧪 **Unity Test Explorer**
- **Run tests directly in VS Code** - No more switching between Unity and your code editor
- **Inline test results** - See pass/fail status right where your test methods are defined
- **Clickable stack traces** - Click on stack trace line for failed test to go to the source line where it fails instantly.
- **One-click test execution** - Run individual tests or entire test suites with a single click
- **Run tests reliably** - You can click run test when Unity is compiling, and it will run the test right after compilation finishes

![Unity Tests](./assets/Run%20Unity%20Tests%20In%20VS%20Code.webp)

### 📊 **Unity Console Integration**
- **Real-time Unity logs** - See Unity logs directly in VS Code
- **Clickable stack traces** - Navigate directly to the source of the logs
- **Log filtering** - Search specific words to find the logs you need

![Unity Console](./assets/Unity%20Console.webp)

### 🐛 **Integrated Unity Debugger**
- **Seamless debugging experience** - Attach to Unity Editor with one click
- **Full breakpoint support** - Set breakpoints, inspect variables, and step through code
- **MonoDebugger integration** - Professional-grade debugging capabilities
- **No external tools required** - Everything you need built right into VS Code

![Debug](./assets/Debug%20in%20VS%20Code.webp)

### 🎨 **USS Language Server**
Includes the first USS language server for VS Code(no one else have done it for VS Code)! 100% built from scratch for Unity Style Sheets (USS)!

- **Blazing fast performance** - Written in Rust and built from the ground up for speed. Get instant feedback on syntax and values as you type!
- **Complete IDE experience** - Syntax highlighting, comprehensive auto-completion, and advanced diagnostics for Unity Style Sheets (USS)
- **Smart auto-completion** - Property names, values, selectors, pseudo-classes, and asset URLs. Knows all Unity UXML elements like `Button` and `Label`, and can auto-complete asset paths from `Assets` down to individual sprites
- **Advanced validation** - 100% USS-native diagnostics that validate syntax, asset paths, and property values with Unity-level accuracy. Even attempts to validate properties with `var()` functions!
- **Rich hover documentation** - Unity-specific tooltips with syntax examples and direct links to official documentation
- **Professional formatting** - Document and selection formatting for USS and TSS files
- **Intelligent refactoring** - Rename operations for ID and class selectors

Auto Completion:
![USS Auto Completion](./assets/USS%20Auto%20Completion%202.webp)

Diagnostics:
![USS Diagnostics](./assets/USS%20Diagnostics.webp)

Hover Docs:
![USS Hover Documentation](./assets/USS%20Hover%20Docs.webp)

### 📚 **Intelligent Documentation**
- **Hover documentation** - Show links for C# documentation on mouse hover
- **Unity API links** - Direct links to official Unity Scripting API documentation
- **Smart context awareness** - Know which Unity package and version this class is from and show you the link to docs. Also knows the Unity Editor version of the project and show you non Unity package official class doc links accordingly.

![Hover Doc Link](./assets/Hover%20Doc%20Link.webp)

### 🔍 **Advanced Code Analysis**
- **Roslyn-powered static analysis** - Unity-specific code analysis that understands Unity patterns and best practices
- **Real-time problem detection** - See issues, warnings, and suggestions directly in VS Code as you type
- **Unity-aware diagnostics** - Specialized analyzers for Unity-specific code patterns and performance optimizations
- **Instant feedback** - No need to compile or switch to Unity to see code issues

![Static Analysis](./assets/Static%20Analysis.webp)

### 🔄 **Smart Asset Management**
- **Automatic meta file handling** - Unity `.meta` files are automatically renamed or moved when you rename or move files
- **Asset database refresh** - Automatic Unity recompilation when you save C# scripts
- **Seamless file operations** - Move, rename, and delete assets with confidence
- **Smart Unity awareness** - Knows about whether you're in play mode, whether Unity may be compiling, and whether you are running Hot Reload for Unity, and act accordingly

![Status Bar](./assets/Status%20Bar.webp)

## 🌟 What Unity Developers Are Saying:

*"Finally, a Unity extension that just works!"*

*"The integrated test runner is a game-changer. I can run my Unity tests without leaving VS Code."*

*"The hover documentation links saves me so much time."*

## 🚀 Get Started in Minutes

1. **Install Unity Code Pro** from marketplace in your code editor
2. **Install the companion Unity package in your Unity project** - [Visual Studio Code Editor](https://github.com/hackerzhuli/com.hackerzhuli.code)
3. **Start coding!** - All features work automatically once installed

---

*Unity Code Pro - Professional Unity Development in VS Code* 🎮✨