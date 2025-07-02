# Status Bar

 ## Unity Status
Displays Unity's connection status using the custom `$(unity-cube)` icon instead of text.

**Status Indicators:**
- **Green**: Unity Editor is online and connected
- **Yellow**: Unity Editor is connected but not responding
- **Red**: Unity Editor is not connected

**Features:**
- Click to show detailed connection status
- Real-time updates based on Unity Editor state
- Automatic detection when Unity starts/stops

## Hot Reload Status

The Hot Reload Status bar item shows the current status of Hot Reload for Unity in your project.

### Features
- **Dynamic Detection**: Only appears when the `com.singularitygroup.hotreload` package is detected in your Unity project
- **Real-time Updates**: Shows current Hot Reload status (running/not running)
- **Click Action**: Click to show detailed Hot Reload status information
- **Custom Icon**: Uses the `$(hot-reload)` icon for easy identification
- **Automatic Updates**: Monitors package installation/uninstallation during compilation

### Status Indicators
- **Green Check ($(check)$(hot-reload))**: Hot Reload is running
- **Gray X ($(x)$(hot-reload))**: Hot Reload is installed but not running

### Dynamic Behavior
- **Startup**: Checks for Hot Reload package when extension activates
- **Compilation Events**: Re-checks package status after every Unity compilation
- **Installation**: Automatically creates status bar when package is installed
- **Uninstallation**: Automatically removes status bar when package is uninstalled

### Implementation Notes

#### Architecture
The status bar functionality is now encapsulated in a dedicated `StatusBar` class located in `src/statusBar.ts`:
- **Modular Design**: All status bar related code is separated from the main extension file
- **Object-Oriented**: Uses a class-based approach for better organization and maintainability
- **Dependency Injection**: Services are injected during initialization for loose coupling

#### Technical Details
- Uses `UnityPackageHelper` to detect the Hot Reload package
- Dynamic creation/removal based on package detection
- Listens to `CompilationFinished` messages for real-time updates
- Proper cleanup when extension is deactivated or package is removed
- Status bar items are created dynamically in Unity projects only
- Encapsulated in `StatusBar` class with methods for creation, updating, and disposal