# Unity Console
We have a dedicated custom WebView window that user can open to see Unity Console logs. There are 3 sections of the window, the top toolbar, the content section and the details section below. The content section is the log, the users can select logs, and the details section will show the full log.

## Toolbar
can toggle whether error/warning/info log will be shown(also these toggle will display a number that shows how many logs are shown of that type). There is also a button to clear the logs.

## Content section
Each log just shows the first line of the log and an icon on the left to identify whether it is error/warning/info.

## Details section
Shows full content of the selected log.

if stack trace is detected, should convert that into a link, when user click on that, will go to that source line in VS Code.

Note that we should only create a link if we detected the file exists.

Example Log:
```
AnotherMethod
UnityEngine.Debug:Log (object)
Script:AnotherMethod () (at Assets/Scripts/Script.cs:12)
Script:Awake () (at Assets/Scripts/Script.cs:8)
```

In the example, you can see that we should create links for both source lines, because the file exists(the path shown in log is relative path in a Unity project).