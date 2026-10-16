@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

echo ================================================
echo                NoteLive Studio
echo      Modo de desarrollo / primera ejecucion
echo ================================================
echo.
where.exe node >nul 2>nul
if errorlevel 1 goto missing_node
where.exe npm >nul 2>nul
if errorlevel 1 goto missing_npm

if not exist "node_modules\electron\dist\electron.exe" (
  echo Preparando dependencias de la aplicacion. Esto solo se hace la primera vez...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto install_failed
)

echo Iniciando NoteLive Studio...
call npm start
if errorlevel 1 goto run_failed
goto finish

:missing_node
echo No se encontro Node.js. Para ejecutar desde el codigo fuente instala Node.js 22.12 o posterior desde https://nodejs.org/.
goto finish

:missing_npm
echo No se encontro npm. Reinstala Node.js desde https://nodejs.org/.
goto finish

:install_failed
echo No se pudieron instalar las dependencias. Revisa la conexion y vuelve a intentarlo.
goto finish

:run_failed
echo NoteLive Studio se cerro con un error. Revisa el mensaje anterior.

:finish
echo.
pause
