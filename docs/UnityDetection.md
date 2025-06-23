# Unity Detection

Find a process with name Unity(add platform specific extension), extract it's command line, find -projectPath option and that is the project path of the Unity project.

example(on Windows)(unrelated part ommited)
``` sh
C:\Unity\6000.0.51f1\Editor\Unity.exe -projectpath F:\projects\unity\TestUnityCode
```

another example(on Windows)(project path quoted)(unrelated part ommited)
``` sh
C:\Unity\6000.0.51f1\Editor\Unity.exe -createproject "F:\projects\unity\Test Unity Code 2"
```

yet another example(on Windows)(Chinese path)(unrelated part ommited)
``` sh
C:\Unity\6000.0.51f1\Editor\Unity.exe -createproject F\projects\unity\测试UnityCode
```


## Notes
- the option can also be named -projectpath, -createProject, -createproject(so it is not case sensitive, specifically test this)
- the path can be quoted or not quoted(if there is no space in path, it may not be quoted)
