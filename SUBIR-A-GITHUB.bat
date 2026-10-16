@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
chcp 65001 >nul
title NoteLive Studio - Publicar base v0.3.0 en GitHub

echo ======================================================
echo   NoteLive Studio - Publicar base v0.3.0 en GitHub
echo ======================================================
echo.
echo Este archivo debe estar en la CARPETA DEL CODIGO FUENTE,
echo junto a package.json, server.js y la carpeta desktop.
echo NO lo ejecutes desde la carpeta de instalacion.
echo Repositorio destino: https://github.com/xEINyALF/NoteLive-Studio
echo Etiqueta inicial: v0.3.0
echo.
echo El repositorio es PUBLICO. No se deben subir claves ni sesiones.
echo.

if not exist "package.json" (
  echo ERROR: No encuentro package.json.
  echo Importante: extrae TODO el ZIP FIX2 en una carpeta nueva.
  goto :fail
)
if not exist ".gitignore" (
  echo ERROR: No encuentro .gitignore.
  goto :fail
)
if not exist "VERIFICAR-BASE.ps1" (
  echo ERROR: Falta VERIFICAR-BASE.ps1.
  echo No copies solo este BAT. Usa el ZIP completo FIX2.
  goto :fail
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0VERIFICAR-BASE.ps1"
if errorlevel 1 goto :fail
powershell -NoProfile -ExecutionPolicy Bypass -Command "$lines = Get-Content -LiteralPath '.gitignore'; if (($lines -contains 'config.json') -and ($lines -contains 'tokens.json')) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo ERROR: .gitignore debe excluir config.json y tokens.json.
  echo Ejecuta ARREGLAR-GITIGNORE.bat o vuelve a extraer el ZIP FIX2 completo.
  goto :fail
)
where git.exe >nul 2>nul
if errorlevel 1 (
  echo No encuentro Git. Instala Git for Windows desde https://git-scm.com/download/win
  goto :fail
)

set "CONFIRM="
set /p CONFIRM=Escribe PUBLICAR para subir el codigo y crear el tag v0.3.0: 
if /i not "!CONFIRM!"=="PUBLICAR" (
 echo Cancelado. No se ha subido nada.
 goto :fail
)

echo [1/5] Configurando Git...
if not exist ".git" git init
if errorlevel 1 goto :fail
git branch -M main
if errorlevel 1 goto :fail
git remote get-url origin >nul 2>nul
if errorlevel 1 (
  git remote add origin https://github.com/xEINyALF/NoteLive-Studio.git
) else (
  git remote set-url origin https://github.com/xEINyALF/NoteLive-Studio.git
)
if errorlevel 1 goto :fail

echo [2/5] Configurando identidad del commit...
git config user.name >nul 2>nul
if errorlevel 1 (
 set /p COMMIT_NAME=Nombre para los commits [Note]: 
 if not defined COMMIT_NAME set "COMMIT_NAME=Note"
 call git config user.name "!COMMIT_NAME!"
)
git config user.email >nul 2>nul
if errorlevel 1 (
 set /p COMMIT_EMAIL=Correo para los commits (puedes usar el noreply de GitHub): 
 if not defined COMMIT_EMAIL goto :fail
 call git config user.email "!COMMIT_EMAIL!"
)

echo [3/5] Preparando y verificando archivos...
git add -A
if errorlevel 1 goto :fail
REM Never publish private credential files. Check all tracked paths, including nested folders.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$tracked = git ls-files; $bad = $tracked | Where-Object { $_ -match '(^|/)(config\.json|tokens\.json|\.env($|\.))' }; if ($bad) { $bad | ForEach-Object { Write-Host ('BLOQUEADO: ' + $_) -ForegroundColor Red }; exit 1 } else { exit 0 }"
if errorlevel 1 (
 echo ERROR: Git ha incluido un archivo de configuracion/credenciales.
 echo Se cancela antes de subir nada. No compartas los archivos config.json o tokens.json.
 goto :fail
)
git diff --cached --quiet
if errorlevel 1 (
 git commit -m "NoteLive Studio v0.3.0 with automatic updates"
 if errorlevel 1 goto :fail
) else (
 echo No hay cambios nuevos para confirmar.
)

echo [4/5] Subiendo el codigo a GitHub...
echo Si pide iniciar sesion, sigue las instrucciones de Git Credential Manager.
git push -u origin main
if errorlevel 1 goto :fail

echo [5/5] Publicando etiqueta v0.3.0 para activar la compilacion de Windows...
git rev-parse -q --verify "refs/tags/v0.3.0" >nul 2>nul
if errorlevel 1 (
 git tag -a v0.3.0 -m "NoteLive Studio v0.3.0 - first auto-update capable build"
 if errorlevel 1 goto :fail
)
git push origin v0.3.0
if errorlevel 1 goto :fail

echo.
echo LISTO. GitHub Actions intentara construir el instalador de NoteLive Studio 0.3.0.
echo Abre https://github.com/xEINyALF/NoteLive-Studio/actions
echo y luego https://github.com/xEINyALF/NoteLive-Studio/releases
echo.
echo La instalacion 0.3.0 antigua no tenia actualizador; despues instala una vez
 echo el nuevo instalador que aparezca en Releases. A partir de ahi, las versiones
 echo posteriores podran entregarse mediante el actualizador.
echo.
pause
exit /b 0

:fail
echo.
echo No se completo la publicacion. No borres esta carpeta.
echo Si aparece un error, manda una captura de esta ventana.
pause
exit /b 1
