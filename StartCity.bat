@echo off
title AI City OS
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
start "" /b cmd /c "ping -n 3 127.0.0.1 >nul & start http://localhost:3000"
node server.js
pause
