@echo off
rem Single EasyCalc launcher for the dev phase: runs the API server + Vite
rem (hot-reload, so it always reflects the latest code) and opens the app in its
rem own Edge app-window. The two dev consoles start MINIMIZED so build errors
rem stay readable but out of the way. Closing them stops the servers.
title EasyCalc launcher
cd /d "%~dp0"
echo Starting EasyCalc (dev, hot-reload)...
start "EasyCalc API" /min cmd /k "npm run server"
start "EasyCalc Web" /min cmd /k "npm run dev -- --strictPort"
rem give Vite a moment to bind :5173, then open the app window
timeout /t 5 >nul
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app=http://localhost:5173 --user-data-dir="%LOCALAPPDATA%\EasyCalc\window-dev" --window-size=1500,950
) else (
  start "" http://localhost:5173
)
exit
