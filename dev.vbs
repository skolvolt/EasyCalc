' EasyCalc dev launcher.
' Runs the hot-reload servers (API + Vite) with NO windows — nothing in the
' taskbar — and opens the app in its own Edge window. When you close the app
' window, this project's dev servers are stopped. For debugging startup errors,
' run dev.bat instead (visible consoles).
Option Explicit

Dim sh, fso, base, edge, profile

Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = base

' Ensure node/npm resolve even if launched with a minimal PATH.
Dim env
Set env = sh.Environment("PROCESS")
env("PATH") = sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs;" & env("PATH")

' Start the hidden hot-reload servers. If they happen to be running already, a
' second start just fails harmlessly on the busy port (nothing shown).
sh.Run "cmd /c npm run server", 0, False
sh.Run "cmd /c npm run dev -- --strictPort", 0, False

' Wait until Vite is actually serving :5173 (up to ~25s cold start).
Dim i
For i = 1 To 50
  If HttpOk("http://localhost:5173/") Then Exit For
  WScript.Sleep 500
Next

profile = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\EasyCalc\window-dev"
edge    = sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe"

If Not fso.FileExists(edge) Then
  sh.Run "http://localhost:5173", 1, False   ' no Edge — fall back to default browser
  WScript.Quit
End If

' Open the app in its own Edge window (async; the launcher process returns fast).
sh.Run """" & edge & """ --app=http://localhost:5173 --user-data-dir=""" & profile & """ --window-size=1500,950", 1, False

' Poll until every Edge process for our window profile is gone (= window closed),
' then stop this project's dev servers only. A dedicated user-data-dir means no
' other Edge windows share it, so this tracks exactly our app window.
WScript.Sleep 3000
Do While CountLike("%window-dev%") > 0
  WScript.Sleep 2500
Loop
StopServers

' ---- helpers ----

' Count running processes whose command line matches a WMI LIKE pattern.
Function CountLike(pat)
  Dim wmi
  Set wmi = GetObject("winmgmts:\\.\root\cimv2")
  CountLike = wmi.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE CommandLine LIKE '" & pat & "'").Count
End Function

' True only if url actually answers with HTTP 200 (server really is up).
Function HttpOk(url)
  On Error Resume Next
  Dim http, ok
  ok = False
  Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
  http.Open "GET", url, False
  http.Send
  If Err.Number = 0 Then
    If http.Status = 200 Then ok = True
  End If
  On Error GoTo 0
  HttpOk = ok
End Function

' Terminate this project's dev servers (leaves unrelated node apps running).
Sub StopServers()
  Dim wmi, list, p
  Set wmi = GetObject("winmgmts:\\.\root\cimv2")
  Set list = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE (Name='node.exe' OR Name='esbuild.exe') AND CommandLine LIKE '%quotemodel%'")
  For Each p In list
    p.Terminate()
  Next
End Sub
