# Unity Detector Usage

The `UnityDetector` class provides active monitoring of Unity Editor processes using a native binary and UDP communication protocol. This replaces the passive detection approach with real-time monitoring.

## Features

- **Active Monitoring**: Continuously monitors Unity Editor state using a native binary
- **Real-time Events**: Emits events when Unity state changes (running/stopped, hot reload enabled/disabled)
- **Process ID Tracking**: Provides the current Unity process ID when running
- **Hot Reload Detection**: Detects whether Hot Reload for Unity is enabled
- **Platform Support**: Currently supports Windows only

## Basic Usage

```typescript
import { UnityDetector, UnityDetectionEvent } from './unityDetector.js';

// Create detector for a specific Unity project
const detector = new UnityDetector('/path/to/unity/project');

// Subscribe to Unity state changes
const unsubscribe = detector.onUnityStateChanged.subscribe((event: UnityDetectionEvent) => {
    console.log(`Unity running: ${event.isRunning}`);
    if (event.processId) {
        console.log(`Unity PID: ${event.processId}`);
    }
    console.log(`Hot Reload enabled: ${event.isHotReloadEnabled}`);
});

// Start monitoring
try {
    await detector.start();
    console.log('Unity detection started');
} catch (error) {
    console.error('Failed to start Unity detection:', error);
}

// Check current state
console.log(`Unity running: ${detector.isUnityRunning}`);
console.log(`Unity PID: ${detector.unityProcessId}`);
console.log(`Hot Reload enabled: ${detector.isHotReloadEnabled}`);

// Request fresh state from native binary
await detector.requestUnityState();

// Stop monitoring when done
await detector.stop();
unsubscribe();
```

## Integration with VS Code Extension

The `UnityMessagingClient` automatically uses `UnityDetector` when a project path is provided:

```typescript
import { UnityMessagingClient } from './unityMessagingClient.js';

// Create messaging client with project path
const client = new UnityMessagingClient('/path/to/unity/project', '/path/to/extension/root', unityDetector);

// The client will automatically:
// 1. Initialize UnityDetector
// 2. Subscribe to Unity state changes
// 3. Attempt connections when Unity starts
// 4. Handle disconnections when Unity stops

// Subscribe to connection events
client.onConnectionStatus.subscribe((connected: boolean) => {
    console.log(`Unity connection: ${connected}`);
});

// Clean up when done
client.dispose(); // This will also stop the UnityDetector
```

## Event Data

The `UnityDetectionEvent` interface provides:

```typescript
interface UnityDetectionEvent {
    isRunning: boolean;           // Whether Unity Editor is running
    processId?: number;           // Unity process ID (if running)
    isHotReloadEnabled?: boolean; // Whether Hot Reload for Unity is enabled
}
```

## Properties

- `unityProcessId: number` - Current Unity process ID (0 if not running)
- `isUnityRunning: boolean` - Whether Unity Editor is currently running
- `isHotReloadEnabled: boolean` - Whether Hot Reload for Unity is enabled
- `onUnityStateChanged: EventEmitter<UnityDetectionEvent>` - Event emitter for state changes

## Methods

- `start(): Promise<void>` - Start the Unity detector and native binary
- `stop(): Promise<void>` - Stop the Unity detector and clean up resources
- `requestUnityState(): Promise<void>` - Request current Unity state from native binary

## Platform Support

Currently, Unity detection is only supported on Windows. On other platforms:
- The detector will log a message and return without starting
- No events will be emitted
- All state properties will return default values

## Native Binary

The detector communicates with a native binary located at:
```
bin/win_64/unity_code_native.exe
```

The binary:
- Takes the Unity project path as a command line argument
- Communicates via UDP on port `50000 + (process.pid % 1000)`
- Implements the messaging protocol defined in `NativeMessagingProtocol.md`
- Automatically detects Unity state changes and sends updates
- Drops the connection if no message is received for 30 seconds

## Error Handling

The detector includes comprehensive error handling:
- Failed native binary startup
- UDP connection errors
- Message parsing errors
- Process monitoring failures

Errors are logged to the console and the detector will attempt to recover when possible.

## Migration from Legacy Detection

The old `detectUnityProcesses()` function is deprecated. To migrate:

**Old approach:**
```typescript
const processes = await detectUnityProcesses(projectPath);
const pid = processes[0]?.process.pid;
```

**New approach:**
```typescript
const detector = new UnityDetector(projectPath);
await detector.start();
const pid = detector.unityProcessId;
```

The new approach provides:
- Real-time monitoring instead of one-time detection
- Automatic state change notifications
- Better integration with the messaging system
- More reliable Unity process tracking