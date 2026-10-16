@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
echo ================================================
echo     NoteLive Studio - Actualizaciones automaticas
echo ================================================
echo.
where.exe node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instala Node.js 22 o posterior desde https://nodejs.org/
  pause
  exit /b 1
)
node configure-updates.js
echo.
pause
