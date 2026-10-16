@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

echo ================================================
echo             NoteLive Studio Builder
echo ================================================
echo.
where.exe node >nul 2>nul
if errorlevel 1 goto missing_node
where.exe npm >nul 2>nul
if errorlevel 1 goto missing_npm

for /f "tokens=1,2,3 delims=.v" %%a in ('node --version') do (
  set NODE_MAJOR=%%a
  set NODE_MINOR=%%b
)
if not defined NODE_MAJOR goto old_node
if %NODE_MAJOR% LSS 22 goto old_node
if %NODE_MAJOR% EQU 22 if %NODE_MINOR% LSS 12 goto old_node

echo [1/3] Instalando dependencias de NoteLive Studio...
call npm install --no-audit --no-fund
if errorlevel 1 goto install_failed

echo.
echo [2/3] Creando el instalador de Windows...
call npm run dist
if errorlevel 1 goto build_failed

echo.
echo [3/3] Proceso terminado.
echo Busca el instalador en la carpeta dist.
explorer "%~dp0dist"
goto finish

:missing_node
echo No se encontro Node.js. Instala Node.js 22 LTS o posterior desde https://nodejs.org/.
goto finish

:missing_npm
echo No se encontro npm. Reinstala Node.js desde https://nodejs.org/.
goto finish

:old_node
echo Se recomienda Node.js 22.12 o posterior para compilar la aplicacion.
echo Instala la version LTS actual desde https://nodejs.org/ y vuelve a ejecutar este archivo.
goto finish

:install_failed
echo No se pudieron instalar las dependencias. Revisa la conexion a Internet y vuelve a intentarlo.
goto finish

:build_failed
echo Fallo la compilacion. Lee el mensaje de error de arriba y vuelve a intentarlo.
goto finish

:finish
echo.
pause
