@echo off
rem Troubleshooting launcher: runs EasyCalc with a VISIBLE console so startup
rem errors are readable. Normal use goes through EasyCalc.vbs (hidden console +
rem app window). Closing this console stops the server.
title EasyCalc (console)
cd /d "%~dp0"
set "QM_DATA_DIR=%~dp0data"
set "QM_WEB_DIST=%~dp0web"
rem Update checks read this public GitHub repo's latest release. Set it once.
set "QM_UPDATE_REPO=skolvolt/EasyCalc"
echo Starting EasyCalc on http://localhost:8321 ...
start "" /min cmd /c "timeout /t 3 >nul & start http://localhost:8321"
node\EasyCalc.exe app\server.mjs
pause
