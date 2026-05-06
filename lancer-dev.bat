@echo off
chcp 65001 >nul
title eBook Translate - Demarrage
echo.
echo  ================================
echo    eBook Translate - Demarrage
echo  ================================
echo.

:: Verifie Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Python n'est pas installe.
    echo Telecharger : https://www.python.org/downloads/
    pause & exit /b 1
)

:: Verifie Node
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Node.js n'est pas installe.
    echo Telecharger : https://nodejs.org/
    pause & exit /b 1
)

:: Supprime le venv si deja present pour repartir propre
if exist "backend\venv" (
    echo [1/4] Environnement Python existant detecte.
) else (
    echo [1/4] Creation de l'environnement Python...
    python -m venv backend\venv
)

echo [2/4] Installation des dependances Python...
call backend\venv\Scripts\activate.bat
pip install -r backend\requirements.txt -q --no-warn-script-location
if errorlevel 1 (
    echo.
    echo [ERREUR] Echec installation Python. Nettoyage et nouvelle tentative...
    rmdir /s /q backend\venv
    python -m venv backend\venv
    call backend\venv\Scripts\activate.bat
    pip install -r backend\requirements.txt
    if errorlevel 1 (
        echo [ERREUR] Impossible d'installer les dependances.
        pause & exit /b 1
    )
)

:: Installation frontend
if not exist "frontend\node_modules" (
    echo [3/4] Installation des dependances frontend...
    cd frontend
    call npm install
    cd ..
) else (
    echo [3/4] Dependances frontend OK.
)

:: Installation Electron
if not exist "electron\node_modules" (
    echo [3b/4] Installation des dependances Electron...
    cd electron
    call npm install
    cd ..
) else (
    echo [3b/4] Dependances Electron OK.
)

echo [4/4] Demarrage des serveurs...

:: Lance le backend
start "eBook-Backend" cmd /c "call backend\venv\Scripts\activate.bat && cd backend && uvicorn main:app --port 8000 --reload --log-level info"

:: Attend que le backend soit pret
echo Attente du backend...
:wait_loop
timeout /t 1 /nobreak >nul
curl -s http://localhost:8000/api/config >nul 2>&1
if errorlevel 1 goto wait_loop

:: Lance le frontend Vite (sans ouvrir le navigateur, Electron s'en charge)
start "eBook-Frontend" /min cmd /c "cd frontend && npm run dev"

:: Attend que Vite soit pret sur le port 3000
echo Attente du frontend...
:wait_vite
timeout /t 1 /nobreak >nul
curl -s http://localhost:3000 >nul 2>&1
if errorlevel 1 goto wait_vite

:: Lance Electron en mode dev (charge depuis localhost:3000)
start "eBook-Electron" cmd /c "cd electron && node_modules\.bin\electron ."

echo.
echo  Application demarree dans Electron.
echo  Appuyez sur une touche pour tout arreter.
echo.
pause >nul

taskkill /f /fi "WINDOWTITLE eq eBook-Backend*" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq eBook-Frontend*" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq eBook-Electron*" >nul 2>&1
taskkill /f /im "electron.exe" >nul 2>&1
echo Arret effectue.
