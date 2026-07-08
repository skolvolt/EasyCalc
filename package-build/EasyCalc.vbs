' EasyCalc launcher.
' Runs the server with NO console window and opens the app in its own chromeless
' window (Edge/Chrome --app mode). The server runs as EasyCalc.exe (a renamed
' node.exe) so it is easy to find, watch, and stop in Task Manager.
Option Explicit

Dim sh, fso, base, url, env, edge, chrome, browser, profile

Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
url  = "http://localhost:8321"

' Config the server reads (mirror of start.bat). Set QM_UPDATE_REPO once.
Set env = sh.Environment("PROCESS")
env("QM_DATA_DIR")    = base & "\data"
env("QM_WEB_DIST")    = base & "\web"
env("QM_UPDATE_REPO") = "skolvolt/EasyCalc"

' 1) Start the server hidden (window style 0), detached.
sh.CurrentDirectory = base
sh.Run """" & base & "\node\EasyCalc.exe"" ""app\server.mjs""", 0, False

' 2) Give it a moment to bind the port.
WScript.Sleep 2500

' 3) Open the app in its own window. Edge ships with Windows; fall back to Chrome,
'    then to the default browser (a normal tab) if neither is found.
edge   = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe"
chrome = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\Google\Chrome\Application\chrome.exe"
If fso.FileExists(edge) Then
  browser = edge
ElseIf fso.FileExists(chrome) Then
  browser = chrome
Else
  browser = ""
End If

If browser <> "" Then
  ' Dedicated profile dir → a clean, app-like window (no user tabs/extensions).
  profile = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\EasyCalc\window"
  sh.Run """" & browser & """ --app=" & url & " --user-data-dir=""" & profile & """ --window-size=1500,950", 1, False
Else
  sh.Run url, 1, False
End If
