@echo off
echo ===================================
echo   eBook Translate — Build installer
echo ===================================
echo.

echo [1/4] Build frontend React...
cd frontend
call npm install
call npm run build
if errorlevel 1 ( echo ERREUR build frontend & pause & exit /b 1 )
cd ..

echo.
echo [2/4] Build backend Python (PyInstaller)...
cd backend

if exist "..\backend-dist" rmdir /s /q "..\backend-dist"

venv\Scripts\pip install pyinstaller >nul 2>&1

venv\Scripts\pyinstaller --onefile --name ebook-backend --distpath ..\backend-dist ^
  --hidden-import uvicorn.logging ^
  --hidden-import uvicorn.loops ^
  --hidden-import uvicorn.loops.auto ^
  --hidden-import uvicorn.protocols ^
  --hidden-import uvicorn.protocols.http ^
  --hidden-import uvicorn.protocols.http.auto ^
  --hidden-import uvicorn.protocols.http.h11_impl ^
  --hidden-import uvicorn.protocols.websockets ^
  --hidden-import uvicorn.protocols.websockets.auto ^
  --hidden-import uvicorn.protocols.websockets.websockets_impl ^
  --hidden-import uvicorn.lifespan ^
  --hidden-import uvicorn.lifespan.on ^
  --collect-all starlette ^
  --collect-all anyio ^
  --collect-all mistralai ^
  --collect-all httpx ^
  --collect-all httpcore ^
  --collect-all ebooklib ^
  main.py

if errorlevel 1 ( echo ERREUR build backend & pause & exit /b 1 )
cd ..

echo.
echo [3/4] Build Electron installer...
cd electron
call npm install
call npm run build
if errorlevel 1 ( echo ERREUR build Electron & pause & exit /b 1 )
cd ..

echo.
echo ===================================
echo   Build termine !
echo   Installeur : dist-electron\
echo ===================================
pause
