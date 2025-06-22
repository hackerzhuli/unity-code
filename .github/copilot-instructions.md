# Unity Code - VS Code Extension Project

## Project Description

Unity Code is a Visual Studio Code extension designed to enhance the Unity game development workflow. The extension provides automated tools and documentation features that streamline common Unity development tasks, making it easier for developers to work with Unity projects directly from VS Code.

### Key Features

The extension automatically manages Unity meta files when renaming assets, preventing broken references. It provides hover documentation for C# types with direct links to Unity and .NET documentation. The extension intelligently detects Unity projects and only activates in valid Unity environments.

## Tech Stack

### Core Technologies
- **TypeScript 5.8.3** - Primary development language
- **Node.js 24.x** - Runtime environment
- **VS Code Extension API 1.100.0** - Extension framework

### Development Tools
- **ESLint 9.29.0** - Code linting and style enforcement
- **TypeScript ESLint** - TypeScript-specific linting rules
- **Mocha 11.7.0** - Testing framework
- **ESMock 2.7.0** - ES module mocking for tests

### Build System
- **TypeScript Compiler** - Transpilation to JavaScript
- **ES Modules** - Modern module system
- **NPM Scripts** - Build automation

### Project Structure
```
src/
├── extension.ts           # Main extension entry point
├── csharpDocHoverProvider.ts # C# documentation hover functionality
├── utils.ts              # Utility functions
└── test/                 # Test suites
```

### Key Dependencies
- **@types/vscode** - VS Code API type definitions
- **@types/node** - Node.js type definitions
- **@types/mocha** - Mocha testing framework types

## Development Guidelines

### Code Style
- Use TypeScript with strict type checking
- Follow ESLint configuration for consistent code style
- Use ES modules (`import`/`export`) syntax
- Implement proper error handling and logging

### Testing
- Write unit tests using Mocha framework (tests are only needed for functions that are more isolated, that is, don't need VS Code or other complex setups to run)
- Use ESMock for mocking ES modules
- Run tests with `npm test` command

### Build Process
1. **Lint**: `npm run lint` - Check code style and potential issues
2. **Compile**: `npm run compile` - Transpile TypeScript to JavaScript
3. **Test**: `npm test` - Run linting and test suites
4. **Watch**: `npm run watch` - Continuous compilation during development
