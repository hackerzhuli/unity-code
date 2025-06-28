# Tests
Integration with Unity Test Runner.

## Stack Trace
Example Stack Trace from Unity Tests(windows)(we expect absolute path here) in Edit Mode:

```
at Something.Yall.hallo.Huma.YallTest.AnotherMethod () [0x00001] in F:\projects\unity\TestUnityCode\Assets\Scripts\Editor\YallTest.cs:32
at Something.Yall.hallo.Huma.YallTest.Test2 () [0x00001] in F:\projects\unity\TestUnityCode\Assets\Scripts\Editor\YallTest.cs:27
```

Example Stack Trace from Unity Tests in Play Mode(this is the same format as stack trace from Unity Logs):
``` txt
Something.Yall.PlayMode.PlayModeTests/d__8:MoveNext () (at Assets/Scripts/Editor/PlayModeTests.cs:139)
UnityEditor.EditorApplication:Internal_CallUpdateFunctions ()
```

