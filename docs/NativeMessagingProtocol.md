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
| 1 | GetUnityState | Request is empty, response is ProcessState | Get the current state of Unity process, including whether Hot Reload is enabled.

``` rust
pub enum MessageType{
    None,
    GetUnityState,
}

pub struct ProcessState {
    UnityProcessId: u32, // 0 if Unity is not running
    IsHotReloadEnabled: bool,
}
```

Notes for GetUnityState:
- Even if there is no request, if Unity state change is detected, the client will still get the message, note that whether Hot Reload is enabled is not reliable, because a new Hot Reload for Unity process will not be detected unless requested (for performance reasons)
- If a client wants to know whether Hot Reload is enabled for sure, it must send the request.
- Detecting processes can be slow, it can take up to 100ms.
