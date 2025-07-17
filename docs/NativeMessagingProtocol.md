# Messaging Protocol

## About the Server
The server is implemented in rust, so the following types or structs are rust types or structs.

## Base configuration
We communicate through udp socket.

Port: 50000 + (pid % 1000)

Drops the client if no message is sent for 30 seconds.

## Message format
A u8 for message type, an u32 for request id(0 if no request), an u32 for payload length, the rest is a utf8 string, which is serialized json from corresponding struct(can be empty if there is no struct for that message type). Note that multibyte integers are little endian in the message.

### Message table
| Message type | Name | Payload | Description |
| --- | --- | --- | --- |
| 0 | None | Empty | Does nothing(no response), but can be used to keep the connection alive |
| 1 | GetUnityState | Request is empty, response is ProcessState | Get the current state of Unity process, including whether Hot Reload is enabled |
| 2 | GetSymbolDocs | Request is SymbolDocsRequest, response is SymbolDocsResponse | Get XML documentation for a C# symbol |

``` rust
pub enum MessageType{
    None,
    GetUnityState,
    GetSymbolDocs,
}

pub struct ProcessState {
    UnityProcessId: u32, // 0 if Unity is not running
    IsHotReloadEnabled: bool,
}

pub struct SymbolDocsRequest {
    SymbolName: String,        // Full symbol name including namespace and type
    AssemblyName: Option<String>, // Optional assembly name to search in
    SourceFilePath: Option<String>, // Optional source file path (must be from user code)
}

pub struct SymbolDocsResponse {
    Success: bool,
    Documentation: Option<String>, // XML documentation string if found
    ErrorMessage: Option<String>,  // Error message if failed
}
```

Notes for GetUnityState:
- Even if there is no request, if Unity state change is detected, the client will still get the message, note that whether Hot Reload is enabled is not reliable, because a new Hot Reload for Unity process will not be detected unless requested (for performance reasons)
- If a client wants to know whether Hot Reload is enabled for sure, it must send the request.
- Detecting processes can be slow, it can take up to 100ms.

Notes for GetSymbolDocs:
- Either AssemblyName or SourceFilePath must be provided to determine which assembly to search
- If both are provided, AssemblyName takes precedence
- SourceFilePath is only valid for user code assemblies (not package cache assemblies)
- Documentation compilation and caching may take some time on first request
- Returns XML documentation string as defined in C# XML documentation comments
