# Changelog

## [1.1.1] - 2025-08-01

### 🔧 Improvements & Bug Fixes

### Fixed
- 🛠️ **Unity Messaging** - Fixed message handler conflicts by replacing single handler with typed event emitters, ensuring compilation finished events are properly received by test provider

### Improved
- 🔄 **Test Provider** - Simplified message handling by moving JSON parsing logic into the messaging client

## [1.1.0] - 2025-07-21

### 🚀 Features

### Added
- 🎨 **USS Language Server** - Complete IDE experience for Unity Style Sheets (USS) development
  - **Blazing fast performance** - Written in Rust and built from the ground up for speed
  - **Smart auto-completion** - Property names, values, selectors, pseudo-classes, and asset URLs
  - **Advanced validation** - 100% USS-native diagnostics that validate syntax, asset paths, and property values
  - **Rich hover documentation** - Unity-specific tooltips with syntax examples and direct links to official documentation
  - **Professional formatting** - Document and selection formatting for USS and TSS files
  - **Intelligent refactoring** - Rename operations for ID and class selectors
  - **Asset path completion** - Auto-complete asset paths from `Assets` down to individual sprites
  - **Unity element awareness** - Knows all Unity UXML elements like `Button` and `Label`
- 🔧 **Enhanced Documentation System** - Improved fallback C# documentation with native binary support

### 🔧 Improvements & Bug Fixes

### Fixed
- 🛠️ **Documentation Hover** - Improved handling of inheritdoc and normalized paths for fallback documentation
- 🛠️ **XML Documentation** - Fixed empty top-level tags exclusion from markdown output
- 🛠️ **Asset Management** - Enhanced meta file deletion handling for deleted assets
- 🛠️ **Symbol Lookup** - Better symbol lookup for empty ranges in hover provider

### Improved
- 🎨 **Assets** - Updated image assets to WebP format for better performance

## [1.0.3] - 2025-07-07

### 🔧 Improvements & Bug Fixes

### Fixed
- 🛠️ **Documentation Hover** - Fixed unnecessary separator display in hover tooltips when only XML documentation is present without documentation links. 
- 🛠️ **Documentation Hover** - Now ignoring summary, returns, param, and exception tags from XML docs in hover display because Dot Rush already covered these.

## [1.0.2] - 2025-07-05

### 🚀 Features

-  rebranding: Rename from Unity Code to Unity Code Pro because of name conflicts with an existing vs code extension.

## [1.0.1] - 2025-07-05

### 🔧 Improvements & Bug Fixes

### Fixed
- 🛠️ **Asset database Refresh** - Prevent asset database refresh when Unity is in Play Mode

### Improved
- 📦 **Settings** - Improved description of settings to make them clearer and more precise

## [1.0.0] - 2025-07-04

### 🎉 Initial Release

First stable release of Unity Code Pro - bringing Unity IDE capabilities to VS Code-based code editors.

### Added
- 🧪 **Unity Test Explorer** - Run Unity tests directly in editor with inline results
- 📊 **Unity Console Integration** - Real-time logs with clickable stack traces
- 🐛 **Integrated Debugger** - Unity debugging with MonoDebugger
- 📚 **Intelligent Documentation** - Hover docs with Unity API and .NET links
- 🔍 **Advanced Code Analysis** - Roslyn-powered Unity-specific static analysis
- 🔄 **Smart Asset Management** - Automatic meta file handling and asset refresh
