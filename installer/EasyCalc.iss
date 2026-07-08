; EasyCalc Windows installer (Inno Setup 6+).
; Build:  ISCC.exe /DAppVersion=0.2.0 installer\EasyCalc.iss
; Output: installer\Output\EasyCalc-Setup-<version>.exe
;
; Per-user install (no admin) so first-run AND self-update never prompt for
; elevation. The self-updater runs this same exe with
;   /SILENT /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS
; which closes the running app, swaps files, and relaunches it.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
; Stable AppId → updates upgrade in place instead of installing side by side.
AppId={{6D3A9F42-1C7E-4B8A-9E4D-EA5C0F1B2C33}
AppName=EasyCalc
AppVersion={#AppVersion}
AppPublisher=EasyCalc
DefaultDirName={localappdata}\EasyCalc
DefaultGroupName=EasyCalc
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=EasyCalc-Setup-{#AppVersion}
SetupIconFile=..\package-build\EasyCalc.ico
UninstallDisplayIcon={app}\EasyCalc.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; Close/restart the running app around a file swap (belt-and-braces with the
; command-line flags the updater passes).
CloseApplications=yes
RestartApplications=yes

[Tasks]
Name: "desktopicon"; Description: "Create a &Desktop shortcut"; GroupDescription: "Shortcuts:"

[InstallDelete]
; Upgrades from the pre-rename layout: drop the orphaned node.exe (now shipped
; as EasyCalc.exe) so it doesn't linger as ~89MB of dead weight.
Type: files; Name: "{app}\node\node.exe"

[Files]
; Everything the packaged app needs: bundled node, server, web, seed data, icon.
Source: "..\package-build\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
; Primary launcher: EasyCalc.vbs → hidden console + own app window.
Name: "{group}\EasyCalc";        Filename: "{app}\EasyCalc.vbs"; IconFilename: "{app}\EasyCalc.ico"; WorkingDir: "{app}"; Comment: "Launch EasyCalc"
Name: "{group}\EasyCalc (troubleshoot console)"; Filename: "{app}\start.bat"; IconFilename: "{app}\EasyCalc.ico"; WorkingDir: "{app}"; Comment: "Launch EasyCalc with a visible console for debugging"
Name: "{group}\Uninstall EasyCalc"; Filename: "{uninstallexe}"
Name: "{userdesktop}\EasyCalc";  Filename: "{app}\EasyCalc.vbs"; IconFilename: "{app}\EasyCalc.ico"; WorkingDir: "{app}"; Comment: "Launch EasyCalc"; Tasks: desktopicon

[Run]
; Offer to launch after a normal (interactive) install. Silent self-updates skip
; this and rely on RestartApplications to relaunch the app that was closed.
Filename: "{app}\EasyCalc.vbs"; Description: "Launch EasyCalc now"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent

; NOTE: user projects live in Documents\Project Model and are intentionally
; never touched by install or uninstall.
