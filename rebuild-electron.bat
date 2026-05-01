@echo off
chcp 65001 >nul
echo [1/2] Build frontend React...
cd frontend
call npm run build
if errorlevel 1 ( echo ERREUR build frontend & pause & exit /b 1 )
cd ..

echo.
echo [2/2] Build Electron installer...
cd electron
call npm run build
if errorlevel 1 ( echo ERREUR build Electron & pause & exit /b 1 )
cd ..

echo.
echo Termine ! Installeur : dist-electron\
pause
