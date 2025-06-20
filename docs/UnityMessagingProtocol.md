# Unity Visual Studio Editor Messaging Protocol

This document describes the UDP-based messaging protocol used by Unity's Visual Studio Editor package for communication between Unity Editor and Visual Studio(or other IDEs).

## Overview

The protocol uses UDP as the primary transport with automatic fallback to TCP for large messages. The communication is bidirectional, allowing both Unity and Visual Studio to send messages to each other.

## Network Configuration

### Port Calculation
- **Messaging Port**: `56002 + (ProcessId % 1000)`
- **Protocol**: UDP (primary), TCP (fallback for large messages)
- **Address**: Binds to `IPAddress.Any` (0.0.0.0)

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

All available message types in the Unity Visual Studio integration:

| Type | Value | Description | Value Format |
|------|-------|-------------|-------------|
| `None` | 0 | Default/unspecified message type | Empty string |
| `Ping` | 1 | Heartbeat request | Empty string |
| `Pong` | 2 | Heartbeat response | Empty string |
| `Play` | 3 | Start play mode | - |
| `Stop` | 4 | Stop play mode | - |
| `Pause` | 5 | Pause play mode | - |
| `Unpause` | 6 | Unpause play mode | - |
| `Build` | 7 | Build project | - |
| `Refresh` | 8 | Refresh asset database | - |
| `Info` | 9 | Information message | - |
| `Error` | 10 | Error message | - |
| `Warning` | 11 | Warning message | - |
| `Open` | 12 | Open file/asset | - |
| `Opened` | 13 | File/asset opened confirmation | - |
| `Version` | 14 | Request/response for package version | Empty string (request) / Version string (response) |
| `UpdatePackage` | 15 | Update package | - |
| `ProjectPath` | 16 | Request/response for Unity project path | Empty string (request) / Full project path (response) |
| `Tcp` | 17 | Internal message for TCP fallback coordination | `"<port>:<length>"` format |
| `RunStarted` | 18 | Test run started | - |
| `RunFinished` | 19 | Test run finished | - |
| `TestStarted` | 20 | Notification that a test has started | Check specific section below for details |
| `TestFinished` | 21 | Notification that a test has finished | Check specific section below for details |
| `TestListRetrieved` | 22 | Notification that test list has been retrieved | Check specific section below for details |
| `RetrieveTestList` | 23 | Request to retrieve list of available tests | Check specific section below for details |
| `ExecuteTests` | 24 | Request to execute specific tests | Check specific section below for details |
| `ShowUsage` | 25 | Show usage information | - |
| `CompilationFinished` | 26 | Notification that compilation has finished | Empty string |

### Value Format Details

Detailed value formats are provided only for message types relevant to this implementation:

- **Empty Requests**: `Ping`, `Pong`, `None` always use empty string values
- **Version**: 
  - Request: Empty string
  - Response: Package version string (e.g., "2.0.17")
- **ProjectPath**: 
  - Request: Empty string  
  - Response: Full path to Unity project directory
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
      public string Id;
      public string Name;
      public string FullName;
      public string Type;        // TypeInfo?.FullName
      public string Method;      // Method?.Name
      public string Assembly;    // TypeInfo?.Assembly?.Location
      public int Parent;         // Index of parent in TestAdaptors array, -1 for root
  }
  ```
- **Description**: Sent when a test starts execution, contains test metadata and hierarchy

#### TestFinished (Value: 21)
- **Format**: JSON serialized TestResultAdaptorContainer
- **C# Structure**:
```csharp
    [Serializable]
    internal class TestResultAdaptorContainer
    {
        public TestResultAdaptor[] TestResultAdaptors;
    }
  
    [Serializable]
    internal class TestResultAdaptor
    {
        public string Name;
        public string FullName;
        public int PassCount;
        public int FailCount;
        public int InconclusiveCount;
        public int SkipCount;
        public string ResultState; // Empty string in current implementation
        public string StackTrace;
        public TestStatusAdaptor TestStatus;
        public int Parent;         // Index of parent in TestResultAdaptors array, -1 for root
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
- **Description**: Sent when a test finishes execution, contains test results and status

#### TestListRetrieved (Value: 22)
- **Format**: `TestMode:JsonData`
- **Structure**: `TestModeName + ":" + JSON serialized TestAdaptorContainer`
- **TestModeName**: "EditMode" or "PlayMode"
- **JsonData**: Uses the same TestAdaptorContainer structure as TestStarted
- **Description**: Response containing the hierarchical test structure as JSON for the requested test mode

## Protocol Flow

### Client Registration
1. Client sends any message to Unity's messaging port
2. Unity registers the client's endpoint and timestamp
3. Unity responds appropriately based on message type
4. Client must send messages at least every 4 seconds to stay registered

### Heartbeat Mechanism
- Send `Ping` message to Unity
- Unity responds with `Pong` message
- Clients are automatically removed after 4 seconds of inactivity

### Large Message Handling (TCP Fallback)

When a message exceeds the 8KB UDP buffer limit, the protocol automatically switches to TCP for reliable delivery of large messages.

#### Fallback Trigger
- **Condition**: Serialized message size ≥ 8192 bytes (`UdpSocket.BufferSize`)
- **Detection**: Sender checks buffer length before UDP transmission
- **Scope**: Applies to individual messages, not the entire connection

#### Detailed Process

**1. Sender (Unity or Client)**:
   - Detects message size exceeds UDP buffer limit
   - Creates a temporary TCP listener on an available port (system-assigned)
   - Replaces original message with `Tcp` control message
   - Sends UDP message with `MessageType.Tcp` and value format: `"<port>:<length>"`
   - Waits for incoming TCP connection on the listener port
   - Sends the actual large message over TCP connection
   - Closes TCP connection and listener after transmission

**2. Receiver (Unity or Client)**:
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
- The protocol is designed for localhost communication between Unity and external tools
- Message serialization uses little-endian encoding for cross-platform compatibility

## Error Handling

- **Socket Exceptions**: Unity will attempt to rebind on domain reload
- **Firewall Issues**: Check Windows Firewall settings for UDP port access
- **Port Conflicts**: Unity uses `ReuseAddress` but conflicts may still occur
- **Message Size**: Messages larger than 8KB automatically use TCP fallback
- **Client Timeout**: Clients are removed after 4 seconds of inactivity

## Security Considerations

- **Local Communication Only**: Protocol is designed for localhost communication
- **No Authentication**: No built-in authentication mechanism
- **Process ID Based Ports**: Ports are predictable based on Unity process ID
- **Firewall Configuration**: Ensure UDP ports are accessible for the messaging to work

## Limitations

- **UDP Reliability**: No guaranteed delivery (inherent UDP limitation)
- **Message Ordering**: No guaranteed order (inherent UDP limitation)
- **Buffer Size**: 8KB limit for UDP messages (larger messages use TCP)
- **Platform Support**: Some features are Windows-specific
- **Client Management**: Automatic cleanup after 4 seconds of inactivity

## Troubleshooting

1. **Connection Issues**: Verify Unity process ID and calculated port
2. **Firewall Blocks**: Check Windows Firewall settings
3. **Port Conflicts**: Another application might be using the calculated port
4. **Message Format**: Ensure proper binary serialization format
5. **Client Timeout**: Send heartbeat messages every 3 seconds or less