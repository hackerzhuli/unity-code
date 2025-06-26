# Unity Detection
We have a native binary (unity_code_native) that lives in bin directory that we run as child process to detect Unity.

It has a messaging protocol [here]().

Use to detect whether Unity is running and whether Hot Reload For Unity is enabled.

This program takes an argument that is the Unity project path, it only detects Unity Editor that is opened with that path.

Note that now we only support Windows, so, for other platforms, we just never detect Unity for now.