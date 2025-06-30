# Visual Studio Code Editor Messaging Protocol

This document describes the UDP-based messaging protocol used by Visual Studio Code Editor package for communication between Unity Editor and Visual Studio Code.

The name of this package is `com.hackerzhuli.code`. The name of the official package this is forked from is `com.unity.ide.visualstudio`. The messaging protocol is modified for better development experience with Visual Studio Code.

## Overview

The protocol uses UDP as the primary transport with automatic fallback to TCP for large messages. The communication is bidirectional, allowing both Unity and Visual Studio Code to send messages to each other.

## Network Configuration

### Port Calculation
- **Messaging Port**: `58000 + (ProcessId % 1000)`
- **Protocol**: UDP (primary), TCP (fallback for large messages)
- **Address**: Binds to `IPAddress.Any` (0.0.0.0)

### Client Timeout Configuration
- **Timeout Period**: Clients are removed after **4 seconds** of inactivity
- **Heartbeat Requirement**: Clients must send messages at least once within the timeout period to stay registered

## Message Format

Messages are serialized in binary format using little-endian encoding:

```
[4 bytes] Message Type (int32)
[4 bytes] String Length (int32)
[N bytes] String Value (UTF-8 encoded)
```

### Message Structure
- **Type**: 32-bit integer representing the MessageType enum value
- **Value**: UTF-8 encoded string with length prefix
- **Origin**: Set by receiver to identify sender's endpoint

### Serialization Details
- **Integer Encoding**: Little-endian 32-bit integers
- **String Encoding**: UTF-8 with 32-bit length prefix
- **Empty Strings**: Represented as length 0 followed by no data
- **Null Strings**: Treated as empty strings

## Message Types

All available message types:

| Type | Value | Description | Value Format |
|------|-------|-------------|-------------|
| `None` | 0 | Default/unspecified message type | Empty string |
| `Ping` | 1 | Heartbeat request | Empty string |
| `Pong` | 2 | Heartbeat response | Empty string |
| `Play` | 3 | Start play mode | Empty string |
| `Stop` | 4 | Stop play mode | Empty string |
| `Pause` | 5 | Pause play mode | Empty string |
| `Unpause` | 6 | Unpause play mode | Empty string |
| ~~`Build`~~ | 7 | ~~Build project~~ (Obsolete) | - |
| `Refresh` | 8 | Refresh asset database | Empty String |
| `Info` | 9 | Info message from Unity logs | Log message content with optional stack trace |
| `Error` | 10 | Error message from Unity logs | Error message content with stack trace |
| `Warning` | 11 | Warning message from Unity logs | Warning message content with optional stack trace |
| ~~`Open`~~ | 12 | ~~Open file/asset~~ (Obsolete) | - |
| ~~`Opened`~~ | 13 | ~~File/asset opened confirmation~~ (Obsolete) | - |
| `Version` | 14 | Request/response for package version | Empty string (request) / Version string (response) |
| ~~`UpdatePackage`~~ | 15 | ~~Update package~~ (Obsolete) | - |
| `ProjectPath` | 16 | Request/response for Unity project path | Empty string (request) / Full project path (response) |
| `Tcp` | 17 | Internal message for TCP fallback coordination | `"<port>:<length>"` format |
| `RunStarted` | 18 | Test run started | JSON serialized TestAdaptorContainer with complete test hierarchy |
| `RunFinished` | 19 | Test run finished | JSON serialized TestResultAdaptorContainer (single result, no children) |
| `TestStarted` | 20 | Notification that a test has started | Check specific section below for details |
| `TestFinished` | 21 | Notification that a test has finished | Check specific section below for details |
| `TestListRetrieved` | 22 | Notification that test list has been retrieved | Check specific section below for details |
| `RetrieveTestList` | 23 | Request to retrieve list of available tests | Check specific section below for details |
| `ExecuteTests` | 24 | Request to execute specific tests | Check specific section below for details / Response is empty string|
| `ShowUsage` | 25 | Show usage information | JSON serialized FileUsage object |
| `CompilationFinished` | 100 | Notification that compilation has finished | Empty string |
| `PackageName` | 101 | Request/response for package name | Empty string (request) / Package name string (response) |
| `Online` | 102 | Notifies clients that this package is online and ready to receive messages | Empty string |
| `Offline` | 103 | Notifies clients that this package is offline and can not receive messages | Empty string |
| `IsPlaying` | 104 | Notification of current play mode state | "true" (in play mode) / "false" (in edit mode) |

Note:
- Message value greater than or equal to 100 means it does not exist in the official package but was added in this package.

### Value Format Details

Detailed value formats for some of the types:

- **Empty Requests**: `Ping`, `Pong`, `None` always use empty string values
- **Version**: 
  - Request: Empty string
  - Response: Package version string (e.g., "2.0.17")
- **ProjectPath**: 
  - Request: Empty string  
  - Response: Full path to Unity project directory
- **PackageName**: 
  - Request: Empty string
  - Response: Package name string (e.g., "com.hackerzhuli.code")
- **Online**: Empty string - sent when this package comes online after domain reload or editor startup
- **Offline**: Empty string - sent when this package goes offline before domain reload or editor shutdown
- **IsPlaying**: 
  - Value: "true" when Unity is in play mode, "false" when in edit mode
  - Sent automatically when play mode state changes (entering/exiting play mode)
  - Sent to new clients when they connect or when this package comes online
- **Tcp**: Internal format `"<port>:<length>"` where port is the TCP listener port and length is the expected message size
- **Test Messages**: Value format depends on Unity's test runner implementation and may contain JSON or structured data

#### RetrieveTestList (Value: 23)
- **Format**: Test mode string ("EditMode" or "PlayMode")
- **Example**: `"EditMode"`
- **Description**: Requests the list of available tests for the specified test mode

#### ExecuteTests (Value: 24)
- **Format**: `TestMode:FullTestName`
- **Example**: `"EditMode:MyNamespace.MyTestClass.MyTestMethod"`
- **Description**: Executes a specific test identified by its full name in the specified test mode

Response:
- A response that is empty is sent to the original client to confirm that the message is received and already processed.

#### TestStarted (Value: 20)
- **Format**: JSON serialized TestAdaptorContainer
- **C# Structure**:
  
```csharp
[Serializable]
internal class TestAdaptorContainer
{
    public TestAdaptor[] TestAdaptors;
}

[Serializable]
internal class TestAdaptor
{
  /// <summary>
  /// The ID of the test tree node. The ID can change if you add new tests to the suite. Use UniqueName, if you want to have a more permanent point of reference.
  /// </summary>
  public string Id;
  
  /// <summary>
  /// The name of the test node.
  /// </summary>
  public string Name;
  
  /// <summary>
  /// The full name of the test including namespace and class.
  /// </summary>
  public string FullName;

  /// <summary>
  /// The full name of the type containing the test method.
  /// </summary>
  public string Type;
  
  /// <summary>
  /// The name of the test method.
  /// </summary>
  public string Method;

  /// <summary>
  /// The location of the assembly containing the test.
  /// </summary>
  public string Assembly;
  
  /// <summary>
  /// Index of parent in TestAdaptors array, -1 for root.
  /// </summary>
  public int Parent;

  /// <summary>
  /// Source location of the test in format "Assets/Path/File.cs:LineNumber".
  /// Only populated for methods and types, null for namespaces or assemblies or other things
  /// </summary>
  public string SourceLocation;

  /// <summary>
  /// Indicates if the test has the UnityTest attribute(if it is a method).
  /// </summary>
  public bool IsHaveUnityTestAttribute;

  /// <summary>
  /// A unique generated name for the test node. E.g., Tests.dll/MyNamespace/MyTestClass/[Tests][MyNamespace.MyTestClass.MyTest].
  /// </summary>
  public string UniqueName;
}
```

- **Description**: Sent when a test starts execution, contains test metadata and hierarchy

#### TestFinished (Value: 21)
- **Format**: JSON serialized TestResultAdaptorContainer
- **Important**: Each message contains exactly one test result. The `TestResultAdaptors` array always contains a single element with no children data. This is an optimization to avoid sending redundant data.

- **C# Structure**:

```csharp
[Serializable]
internal class TestResultAdaptorContainer
{
    public TestResultAdaptor[] TestResultAdaptors; // Always contains exactly one element
}

[Serializable]
internal class TestResultAdaptor
{
  /// <summary>
  /// The name of the test node.
  /// </summary>
  public string Name;
  
  /// <summary>
  /// Gets the full name of the test result.
  /// </summary>
  public string FullName;

  /// <summary>
  /// The number of test cases that passed when running the test and all its children.
  /// </summary>
  public int PassCount;
  
  /// <summary>
  /// The number of test cases that failed when running the test and all its children.
  /// </summary>
  public int FailCount;
  
  /// <summary>
  /// The number of test cases that were inconclusive when running the test and all its children.
  /// </summary>
  public int InconclusiveCount;
  
  /// <summary>
  /// The number of test cases that were skipped when running the test and all its children.
  /// </summary>
  public int SkipCount;

  /// <summary>
  /// Gets the state of the result as a string.
  /// Returns one of these values: Inconclusive, Skipped, Skipped:Ignored, Skipped:Explicit, Passed, Failed, Failed:Error, Failed:Cancelled, Failed:Invalid.
  /// </summary>
  public string ResultState;
  
  /// <summary>
  /// Any stacktrace associated with an error or failure, empty if the test passed (only avaiable for leaf tests)
  /// </summary>
  public string StackTrace;

  /// <summary>
  /// The test status as a simplified enum value.
  /// </summary>
  public TestStatusAdaptor TestStatus;

  /// <summary>
  /// The number of asserts executed when running the test and all its children.
  /// </summary>
  public int AssertCount;
  
  /// <summary>
  /// Gets the elapsed time for running the test in seconds.
  /// </summary>
  public double Duration;
  
  /// <summary>
  /// Gets the time the test started running as Unix timestamp (milliseconds since epoch).
  /// </summary>
  public long StartTime;
  
  /// <summary>
  /// Gets the time the test finished running as Unix timestamp (milliseconds since epoch).
  /// </summary>
  public long EndTime;
  
  /// <summary>
  /// The error message associated with a test failure or with not running the test, empty if the test (and its children) passed
  /// </summary>
  public string Message;
  
  /// <summary>
  /// Gets all logs during the test(only available for leaf tests)(no stack trace for logs is available)
  /// </summary>
  public string Output;
  
  /// <summary>
  /// True if this result has any child results.
  /// </summary>
  public bool HasChildren;

  /// <summary>
  /// Index of parent in TestResultAdaptors array, -1 for root.
  /// </summary>
  public int Parent;
}

[Serializable]
internal enum TestStatusAdaptor
{
    Passed,        // 0
    Skipped,       // 1
    Inconclusive,  // 2
    Failed,        // 3
}
```

- **Description**: Sent when a test finishes execution. Each message contains exactly one test result without any children data, ensuring efficient and non-redundant messaging.

#### RunStarted (Value: 18)
- **Format**: JSON serialized TestAdaptorContainer
- **C# Structure**: Uses the same TestAdaptorContainer and TestAdaptor structures as TestStarted (see TestStarted section for complete structure)
- **Description**: Sent when a test run begins execution. Contains the complete test hierarchy that will be executed, including all parent nodes and children. This provides the full context of what tests are about to run.
- **Usage**: Clients can use this to prepare UI, show progress indicators, or track which tests are part of the current run.

#### ShowUsage (Value: 25)
- **Format**: JSON serialized FileUsage object
- **C# Structure**:

```csharp
[Serializable]
internal class FileUsage
{
    /// <summary>
    /// The file path to show usage for. Can be absolute or relative to project.
    /// </summary>
    public string Path;
    
    /// <summary>
    /// Optional array of GameObject names representing the hierarchy path within a scene.
    /// Used when showing usage of a specific GameObject in a Unity scene.
    /// Example: ["ParentObject", "ChildObject", "TargetObject"]
    /// </summary>
    public string[] GameObjectPath;
}
```

- **Description**: Requests Unity to show usage/location of a specific file or GameObject. Unity will focus the Project window and select the specified asset, or open a scene and select a GameObject if a hierarchy path is provided.
- **Behavior**:
  - For non-scene files: Selects and pings the asset in the Project window
  - For .unity scene files: Prompts to open the scene (single, additive, or cancel), then optionally navigates to a specific GameObject using the GameObjectPath
  - Handles both absolute and relative file paths, normalizing them to project-relative paths
- **Example**: `{"Path":"Assets/Scenes/MainScene.unity","GameObjectPath":["UI","Canvas","Button"]}`

#### TestListRetrieved (Value: 22)
- **Format**: `TestMode:JsonData`
- **Structure**: `TestModeName + ":" + JSON serialized TestAdaptorContainer`
- **TestModeName**: "EditMode" or "PlayMode"
- **JsonData**: Uses the same TestAdaptorContainer structure as TestStarted
- **Description**: Response containing the hierarchical test structure as JSON for the requested test mode

## Protocol Flow

### Client Registration
1. Client sends any message to this package's messaging port
2. This package registers the client's endpoint
3. This package responds appropriately based on message type
4. Client must send messages within 4 seconds to stay registered 

### Heartbeat Mechanism
- Send `Ping` message to Unity
- This package responds with `Pong` message
- Clients are automatically removed after 4 seconds of inactivity 

### Online/Offline and Domain Reload
When domain reload starts(typically along with compilation), this package is disabled due to Unity's mechanism. Socket will be disposed and this package can't receive messages for a while(domain reload can take up to a minute depending on the project). The Offline message is sent right before this package's socket is disposed.

Once domain reload finishes, this package will be enabled and socket will be recreated. And previous clients will be preserved. But messages that are not handled or not received at all(when this package is offline) will not be processed. The Online message is sent right after this package's socket is recreated.

### Large Message Handling (TCP Fallback)

When a message exceeds the 8KB UDP buffer limit, the protocol automatically switches to TCP for reliable delivery of large messages.

#### Fallback Trigger
- **Condition**: Serialized message size ≥ 8192 bytes (`UdpSocket.BufferSize`)
- **Detection**: Sender checks buffer length before UDP transmission
- **Scope**: Applies to individual messages, not the entire connection

#### Detailed Process

**1. Sender (This package or Client)**:
   - Detects message size exceeds UDP buffer limit
   - Creates a temporary TCP listener on an available port (system-assigned)
   - Replaces original message with `Tcp` control message
   - Sends UDP message with `MessageType.Tcp` and value format: `"<port>:<length>"`
   - Waits for incoming TCP connection on the listener port
   - Sends the actual large message over TCP connection
   - Closes TCP connection and listener after transmission

**2. Receiver (This package or Client)**:
   - Receives `Tcp` control message via UDP
   - Validates message type is `MessageType.Tcp` (value: 17)
   - Parses message value to extract: `port` and `length`
   - Initiates TCP connection to sender's IP address on specified port
   - Allocates buffer of exact `length` for receiving data
   - Reads complete message from TCP stream (must read exactly `length` bytes)
   - Deserializes received buffer using standard message format
   - Closes TCP connection

#### Critical Implementation Notes

- **Timeout Handling**: TCP operations have 5-second timeout (`ConnectOrReadTimeoutMilliseconds`)
- **Exact Read Required**: Must read exactly `length` bytes from TCP stream
- **Connection Cleanup**: Always close TCP connections and listeners after use
- **Error Recovery**: Failed TCP operations should not crash the UDP messaging loop
- **Thread Safety**: TCP operations run on background threads, ensure proper synchronization
- **Port Availability**: TCP listener uses system-assigned ports (port 0), not fixed ports

## Implementation Notes

- Clients can be implemented in any language that supports UDP sockets and binary serialization
- The protocol is designed for localhost communication between this package and external tools
- Message serialization uses little-endian encoding for cross-platform compatibility

## Error Handling

- **Socket Exceptions**: This package will attempt to rebind on domain reload
- **Port Conflicts**: This package uses `ReuseAddress` but conflicts may still occur
- **Message Size**: Messages larger than 8KB automatically use TCP fallback
- **Client Timeout**: Clients are removed after 4 seconds of inactivity 

## Security Considerations

- **Local Communication Only**: Protocol is designed for localhost communication
- **No Authentication**: No built-in authentication mechanism
- **Process ID Based Ports**: Ports are calculated based on Unity process ID

## Limitations

- **UDP Reliability**: No guaranteed delivery (inherent UDP limitation)
- **Message Ordering**: No guaranteed order (inherent UDP limitation)
- **Buffer Size**: 8KB limit for UDP messages (larger messages use TCP)
- **Client Management**: Automatic cleanup after 4 seconds of inactivity 

## Troubleshooting

1. **Connection Issues**: Verify Unity process ID and calculated port
2. **Port Conflicts**: Another application might be using the calculated port
3. **Client Timeout**: Send heartbeat messages regularly within 4 seconds