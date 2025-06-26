# Doc Links

## Doc Links for Packages

The hover provider now supports enhanced documentation link generation using the `documentationUrl` field from Unity package.json files.

### Packages that don't have documentationUrl
For packages without a `documentationUrl` field, the system falls back to pattern-based link generation:
- **Unity packages**: Generate links based on package name and version using Unity's documentation URL patterns
- **Other packages**: No package-specific documentation links are generated

### Packages that have documentationUrl
When a package contains a `documentationUrl` field in its package.json, this URL takes priority:

#### Unity Official Packages
If the `documentationUrl` points to Unity's official documentation site (docs.unity3d.com):
- **Package documentation**: Uses the provided `documentationUrl`
- **Class documentation**: Generates API links by extracting package name and version from the `documentationUrl`

#### Non-Unity Packages
For packages with `documentationUrl` that are not from Unity's official site:
- **Package documentation**: Uses the provided `documentationUrl`
- **Class documentation**: No class-specific API links are generated

### Example

For a Unity package with:
```json
{
  "name": "com.unity.inputsystem",
  "version": "1.14.0",
  "documentationUrl": "https://docs.unity3d.com/Packages/com.unity.inputsystem@1.14/manual/index.html"
}
```

The system generates:
- **Package docs**: `https://docs.unity3d.com/Packages/com.unity.inputsystem@1.14/manual/index.html` (from documentationUrl)
- **Class docs**: `https://docs.unity3d.com/Packages/com.unity.inputsystem@1.14/api/UnityEngine.InputSystem.DefaultInputActions.html` (generated from documentationUrl pattern)