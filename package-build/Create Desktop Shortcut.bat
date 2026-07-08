@echo off
rem Creates a Desktop shortcut "EasyCalc" that launches the app with its icon.
setlocal
set "TARGET=%~dp0EasyCalc.vbs"
set "ICON=%~dp0EasyCalc.ico"
powershell -NoProfile -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\EasyCalc.lnk');" ^
  "$s.TargetPath='%TARGET%';" ^
  "$s.WorkingDirectory='%~dp0';" ^
  "$s.IconLocation='%ICON%';" ^
  "$s.WindowStyle=7;" ^
  "$s.Description='EasyCalc';" ^
  "$s.Save()"
echo Created "EasyCalc" shortcut on your Desktop.
pause
