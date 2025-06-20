# Unity Test Explorer

The Unity Test Explorer provides seamless integration between VS Code and Unity's test framework, allowing you to discover, run, and debug Unity tests directly from your editor.

## Features

- **Automatic Unity Detection**: Automatically detects running Unity Editor processes and establishes communication
- **Test Discovery**: Discovers both EditMode and PlayMode tests from your Unity project
- **Test Execution**: Run individual tests or test suites directly from VS Code
- **Real-time Results**: View test results, including pass/fail status, execution time, and error details
- **Intelligent Port Detection**: Automatically calculates the correct messaging port based on Unity's process ID

## How It Works

### Unity Process Detection

The extension automatically detects Unity Editor processes using a dedicated `UnityProcessDetector` class:

1. **Cross-Platform Discovery**: Uses the `systeminformation` package to detect Unity processes on Windows, macOS, and Linux
2. **Precise Filtering**: Only detects actual Unity Editor processes (Unity.exe on Windows, Unity on macOS/Linux), excluding:
   - Unity-related tools (UnityShaderCompiler.exe, UnityPackageManager, etc.)
   - Child Unity processes (processes with Unity parents are filtered out)
3. **Port Calculation**: Calculates messaging port using Unity's formula: `56002 + (ProcessId % 1000)`
4. **Connectivity Testing**: Tests each detected Unity process to find the active one
5. **Automatic Connection**: Establishes UDP communication with the responsive Unity instance

### Communication Protocol

The extension implements Unity's Visual Studio Editor Messaging Protocol:

- **Primary Transport**: UDP for fast, lightweight communication
- **Fallback Transport**: TCP for large messages (>8KB)
- **Message Format**: Binary serialization with little-endian encoding
- **Heartbeat**: Automatic ping/pong to maintain connection

### Test Integration

Once connected, the extension can:

- Request test lists using `RetrieveTestList` messages
- Execute specific tests using `ExecuteTests` messages
- Receive real-time test status updates via `TestStarted` and `TestFinished` messages
- Parse test hierarchies and results from JSON-serialized test data

## Usage

### Prerequisites

1. **Unity Editor**: Must have Unity Editor running with a project loaded
2. **Unity Package**: Ensure Unity's Visual Studio Editor package is installed and enabled
3. **Cross-Platform**: Supports Unity process detection on Windows, macOS, and Linux

### Getting Started

1. **Start Unity**: Launch Unity Editor and open your project
2. **Open VS Code**: Open your Unity project folder in VS Code
3. **Automatic Detection**: The extension will automatically detect and connect to Unity
4. **View Tests**: Use the Test Explorer panel to view and run your Unity tests

### Manual Connection

If automatic detection fails, you can manually refresh the connection:

```typescript
import { UnityMessagingClient } from './unityMessagingClient';

const client = new UnityMessagingClient();

// Check for Unity processes
const processes = await client.getUnityProcesses();
console.log('Unity processes:', processes);

// Attempt connection
const connected = await client.connect();
if (connected) {
    console.log('Connected to Unity on port:', client.getCurrentPort());
}
```

## Troubleshooting

### Connection Issues

**Problem**: "No Unity processes detected"
- **Solution**: Ensure Unity Editor is running and has a project loaded
- **Check**: Verify Unity.exe appears in Windows Task Manager

**Problem**: "No Unity processes responded to ping"
- **Solution**: Check Windows Firewall settings for UDP port access
- **Alternative**: Try restarting Unity Editor to refresh the messaging service

**Problem**: "Failed to connect to Unity"
- **Solution**: Use the refresh connection feature to re-detect Unity processes
- **Check**: Ensure Unity's Visual Studio Editor package is installed and enabled

### Port Conflicts

**Problem**: Multiple Unity instances running
- **Solution**: The extension will test all detected Unity processes and connect to the first responsive one
- **Note**: Each Unity process uses a unique port based on its process ID

### Performance Considerations

- **Process Detection**: Runs only when establishing connection, not continuously
- **Heartbeat**: Lightweight ping/pong every 3 seconds to maintain connection
- **Message Size**: Large test data automatically uses TCP fallback for reliability

## API Reference

### UnityMessagingClient

Main class for Unity communication:

```typescript
class UnityMessagingClient {
    // Connection management
    async connect(): Promise<boolean>
    disconnect(): void
    async refreshConnection(): Promise<boolean>
    
    // Process detection
    async getUnityProcesses(): Promise<number[]>
    getCurrentPort(): number
    
    // Messaging
    async sendMessage(type: MessageType, value: string): Promise<void>
    onMessage(type: MessageType, handler: (message: UnityMessage) => void): void
    
    // Test operations
    async requestTestList(testMode: 'EditMode' | 'PlayMode'): Promise<void>
    async executeTests(testMode: 'EditMode' | 'PlayMode', testName: string): Promise<void>
    
    // Status
    get connected(): boolean
}
```

### Message Types

Supported Unity message types:

- `Ping` / `Pong`: Heartbeat messages
- `Version`: Unity version information
- `ProjectPath`: Unity project directory path
- `RetrieveTestList`: Request available tests
- `ExecuteTests`: Run specific tests
- `TestStarted` / `TestFinished`: Test execution status
- `TestListRetrieved`: Test discovery results

## Implementation Details

### Process Detection Algorithm

1. Execute `tasklist /FI "IMAGENAME eq Unity.exe" /FO CSV /NH`
2. Parse CSV output to extract process IDs
3. Calculate port for each process: `56002 + (PID % 1000)`
4. Test connectivity by sending UDP ping to each port
5. Return first responsive port as active Unity instance

### Connection Testing

- **Timeout**: 2-second timeout per port test
- **Method**: Send UDP ping message and wait for any response
- **Fallback**: If no Unity responds, connection fails gracefully
- **Retry**: Manual refresh available through `refreshConnection()`

### Error Handling

- **Process Detection Errors**: Logged as warnings, fallback to manual configuration
- **Connection Timeouts**: Graceful failure with descriptive error messages
- **Socket Errors**: Automatic cleanup and connection state management
- **Message Parsing**: Robust error handling for malformed Unity messages