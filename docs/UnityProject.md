# Unity Project
Here is a typical Unity project structure.

```
Assets/
ProjectSettings/
|-- ProjectVersion.txt
Library/
Packages/
```

The core is that `ProjectVersion.txt` is used to store the Unity version of the project.

Example:
```
m_EditorVersion: 6000.0.51f1
m_EditorVersionWithRevision: 6000.0.51f1 (01c3ff5872c5)
```

just grab the `6000.0.51f1` part and use it as the version Unity.

## Unity Editor Version Detection

The `UnityProjectManager.getUnityEditorVersion()` method reads and parses the Unity editor version from the `ProjectVersion.txt` file.

**Example usage:**
```typescript
const manager = new UnityProjectManager();
await manager.init();
const version = manager.getUnityEditorVersion();
// Returns: "6000.0.51f1" or "2023.3.15f1" or null
```

**Common version string formats:**
- `"6000.0.51f1"` - Unity 6000.0.51f1
- `"2023.3.15f1"` - Unity 2023.3.15f1
- `"2022.3.42f1"` - Unity 2022.3.42f1
- `"2021.3.35f1"` - Unity 2021.3.35f1

