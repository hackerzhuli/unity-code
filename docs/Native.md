# Native Code
Native binaries are included in bin directory. Their source code is not in this project, and they will be built and copied to the bin directory here.

They are:
- `unity_code_native` - The binary that does Unity Editor detection
- `MonoDebugger` - The debugger for Unity games

Directory structure:
```
bin/
├── win_x64/
│   └── unity_code_native.exe
│   └── MonoDebugger.exe
├── linux_x64/
│   └── unity_code_native
│   └── MonoDebugger
├── mac_arm64/
│   └── unity_code_native
│   └── MonoDebugger
```
