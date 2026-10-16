@echo off
setlocal
cd /d "%~dp0"
title NoteLive Studio - Arreglar .gitignore

echo ================================================
echo   NoteLive Studio - Arreglo de seguridad GitHub
echo ================================================
echo.
if not exist "package.json" (
  echo ERROR: No encuentro package.json.
  echo Mueve este archivo a la carpeta del CODIGO FUENTE,
  echo junto a package.json y SUBIR-A-GITHUB.bat.
  echo No lo ejecutes desde la carpeta donde instalaste el programa.
  pause
  exit /b 1
)

> ".gitignore" echo # Local credentials and user-specific configuration: NEVER publish these
>> ".gitignore" echo config.json
>> ".gitignore" echo tokens.json
>> ".gitignore" echo .env
>> ".gitignore" echo .env.*
>> ".gitignore" echo !.env.example
>> ".gitignore" echo(
>> ".gitignore" echo # Dependencies and build output
>> ".gitignore" echo node_modules/
>> ".gitignore" echo dist/
>> ".gitignore" echo release/
>> ".gitignore" echo(
>> ".gitignore" echo # Logs and operating-system files
>> ".gitignore" echo *.log
>> ".gitignore" echo .DS_Store
>> ".gitignore" echo Thumbs.db
>> ".gitignore" echo desktop.ini

findstr /x /c:"config.json" ".gitignore" >nul || goto :fail
findstr /x /c:"tokens.json" ".gitignore" >nul || goto :fail

echo .gitignore corregido. Ahora excluye config.json y tokens.json.
echo Puedes comprobarlo abriendo .gitignore con el Bloc de notas.
echo.
echo IMPORTANTE: vuelve a ejecutar SUBIR-A-GITHUB.bat desde esta misma carpeta.
echo.
pause
exit /b 0

:fail
echo ERROR: No pude comprobar el contenido de .gitignore.
pause
exit /b 1
