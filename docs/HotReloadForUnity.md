# Hot Reload for Unity
Disable Auto Refresh when Hot Reload for Unity is enabled

How to detect if Hot Reload for Unity is enabled?

Find the process of name CodePatcherCLI(add platform specific extension), extract it's command line, find -u option and that is the project path of the Unity project, match that and we know if Hot Reload for Unity is enabled for that project.

Example command line(some irrelevant parts removed)
```
"C:\Users\hacke\AppData\Local\singularitygroup-hotreload\asset-store\executables_1-13-7\CodePatcherCLl.exe"-u "F:\projects\unity\TestUnityCode" -s "Library/com.singularitygroup.hotreload/Solution\TestUnityCode.sln"
```

## Notes
- Unlike Unity, we don't want to detect Hot Reload for Unity actively, only detect right when needed (lazy), because it can enable and disable at any time.
- paths are always quoted
- 
