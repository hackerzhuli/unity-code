# Unity Project Manager

The Unity Project Manager is a centralized class-based module for detecting and managing Unity project information within the VS Code extension.

## Overview

This module provides a singleton class that serves as the single source of truth for Unity project detection, eliminating code duplication and improving maintainability across the extension.

## Key Features

### Class-Based Architecture
- `UnityProjectManager` class encapsulates all project detection logic
- Global singleton instance accessible via `getUnityProjectManager()`
- Clean separation between instance methods and static convenience functions

### Core Class Methods

#### Project Detection
- `isUnityProject(workspaceFolder)` - Check if a workspace folder is a Unity project
- `isUnityProjectByPath(projectPath)` - Check if a directory path is a Unity project
- `initializeUnityProjectDetection()` - Initialize and store the detected project path

#### State Access
- `getUnityProjectPath()` - Get the current Unity project path
- `isWorkingWithUnityProject()` - Check if extension is working with a Unity project
- `resetUnityProjectDetection()` - Reset detection state (useful for testing)

#### Utility Methods
- `isFileInUnityProject(filePath)` - Check if a file is within the Unity project

### Convenience Functions
For backward compatibility, the module exports standalone functions that delegate to the global instance:
- `isUnityProject()`, `isUnityProjectByPath()`, `initializeUnityProjectDetection()`
- `getUnityProjectPath()`, `isWorkingWithUnityProject()`, `resetUnityProjectDetection()`
- `isFileInUnityProject()`

## Usage Examples

### Using the Singleton Instance
```typescript
import { getUnityProjectManager } from './unityProjectManager.js';

// Get the global instance
const manager = getUnityProjectManager();

// Initialize during extension activation
const projectPath = await manager.initializeUnityProjectDetection();
if (projectPath) {
    console.log(`Working with Unity project: ${projectPath}`);
}

// Check project status
if (manager.isWorkingWithUnityProject()) {
    const filePath = '/path/to/some/file.cs';
    if (manager.isFileInUnityProject(filePath)) {
        // Process Unity project file
    }
}
```

### Using Convenience Functions (Backward Compatible)
```typescript
import { initializeUnityProjectDetection, getUnityProjectPath, isFileInUnityProject } from './unityProjectManager.js';

// Initialize during extension activation
const projectPath = await initializeUnityProjectDetection();
if (projectPath) {
    console.log(`Working with Unity project: ${projectPath}`);
}

// Check if file is in project
const filePath = '/path/to/some/file.cs';
if (isFileInUnityProject(filePath)) {
    // Process Unity project file
}
```

### Project Validation
```typescript
import { getUnityProjectManager } from './unityProjectManager.js';

const manager = getUnityProjectManager();
const isUnity = await manager.isUnityProjectByPath('/path/to/project');
if (isUnity) {
    // Handle Unity project
}
```

## Benefits

### Code Organization
- Object-oriented design with clear encapsulation
- All Unity project detection logic in one class
- Clear separation of concerns with private/public methods
- Easier to maintain and extend

### Performance
- Single instance with cached state
- Single detection pass during initialization
- No redundant file system checks

### Reliability
- Consistent detection logic across all components
- Single source of truth prevents inconsistencies
- Centralized error handling
- Type safety with TypeScript class structure

### Flexibility
- Can be easily extended with additional methods
- Supports dependency injection patterns
- Easy to mock for testing

## Integration with Other Components

### Extension Activation
The main extension file uses the convenience function `initializeUnityProjectDetection()` during activation to set up the global state.

### Test Provider
The Unity Test Provider can receive the project path as a parameter, eliminating the need for separate detection logic.

### Event Handlers
File save and rename handlers use utility functions to quickly check if files are within the Unity project scope.

## Migration Notes

When migrating from the previous functional approach:

1. **No Breaking Changes**: All existing function calls continue to work due to backward compatibility functions
2. **Optional Migration**: You can gradually migrate to use the class instance directly for better type safety
3. **Testing**: Use `getUnityProjectManager().resetUnityProjectDetection()` for test isolation
4. **Extension**: Add new methods to the `UnityProjectManager` class rather than standalone functions

This class-based approach maintains backward compatibility while providing a more structured, maintainable, and extensible foundation for Unity project management.