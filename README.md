# CodeUnity

CodeUnity is a Visual Studio Code extension designed to enhance your Unity development workflow. It provides tools and automation to make working with Unity projects in VS Code more efficient.

## Features

### Automatic Meta File Renaming

When working with Unity projects, each asset file has an associated `.meta` file that contains important metadata. When you rename a file in VS Code, Unity doesn't automatically rename the corresponding `.meta` file, which can lead to issues with asset references.

CodeUnity solves this problem by:

- Automatically detecting when you rename a file in your Unity project
- Finding the associated `.meta` file
- Renaming the `.meta` file to match the new file name
- Providing status notifications when meta files are renamed

### Smart Project Detection

CodeUnity intelligently detects Unity projects by looking for the `ProjectSettings/ProjectVersion.txt` file, which is present in all Unity projects. This ensures that the extension only activates when you're actually working on a Unity project.

### Assets Folder Focus

The extension specifically targets files within the `Assets` folder of your Unity project, as this is where most of your project files that need `.meta` files will be located. This focused approach ensures that the extension doesn't interfere with other file operations outside of your Unity assets.

## Requirements

- Visual Studio Code 1.74.0 or higher
- A Unity project (containing `.unity` and/or `.meta` files)

## Extension Settings

This extension doesn't require any specific settings to work.

## Known Issues

- Currently only handles file renames, not folder renames
- Only works with the first workspace folder if multiple folders are open

## Release Notes

### 0.1.0

- Initial release
- Automatic meta file renaming when files are renamed in VS Code
- Smart Unity project detection
- Focus on Assets folder for meta file operations

## Development

### Building the Extension

1. Clone the repository
2. Run `npm install` to install dependencies
3. Press `F5` to start debugging

### Testing

Run `npm test` to execute the extension tests.

## License

This extension is licensed under the [MIT License](LICENSE).
