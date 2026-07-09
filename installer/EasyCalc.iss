; EasyCalc Windows installer (Inno Setup 6+).
; Build:  ISCC.exe /DAppVersion=0.2.0 installer\EasyCalc.iss
; Output: installer\Output\EasyCalc-Setup-<version>.exe
;
; Per-user install (no admin) so first-run AND self-update never prompt for
; elevation. The self-updater runs this same exe with
;   /VERYSILENT /SUPPRESSMSGBOXES /CLOSEAPPLICATIONS /NORESTART
; which closes the running server so files unlock, swaps them, then the silent
; [Run] step relaunches the server (no new window); the already-open app window
; polls /api/version and reloads itself onto the new build.

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
; Close the running server so its files unlock during the swap. We relaunch it
; ourselves (see [Run]/[Code]), so leave RestartApplications off to avoid a
; double start.
CloseApplications=yes
RestartApplications=no

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
; Launch via wscript.exe — Inno's default CreateProcess can't execute a .vbs
; (fails with "code 193 / not a valid Win32 application").
; Interactive install: offer to launch (server + app window).
Filename: "{sys}\wscript.exe"; Parameters: """{app}\EasyCalc.vbs"""; WorkingDir: "{app}"; Description: "Launch EasyCalc now"; Flags: nowait postinstall skipifsilent
; Silent self-update: relaunch the server ONLY (no new window). The still-open
; app window polls /api/version and reloads itself onto the new build.
Filename: "{sys}\wscript.exe"; Parameters: """{app}\EasyCalc.vbs"" /noopen"; WorkingDir: "{app}"; Flags: nowait; Check: IsSilent

; NOTE: user projects live in Documents\Project Model and are intentionally
; never touched by install or uninstall.

[Code]
function IsSilent: Boolean;
begin
  Result := WizardSilent;
end;
