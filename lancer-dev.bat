@echo off
chcp 65001 >nul
title MVS Traduction - Demarrage
echo.
echo  ================================
echo    MVS Traduction - Demarrage
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

echo [4/4] Demarrage des serveurs...

:: Lance le backend
start "MVS-Backend" cmd /c "call backend\venv\Scripts\activate.bat && cd backend && uvicorn main:app --port 8000 --reload --log-level info"

:: Attend que le backend soit pret
echo Attente du backend...
:wait_loop
timeout /t 1 /nobreak >nul
curl -s http://localhost:8000/api/config >nul 2>&1
if errorlevel 1 goto wait_loop

:: Lance le frontend avec ouverture auto du navigateur
start "MVS-Frontend" /min cmd /c "cd frontend && npm run dev -- --open"

echo.
echo  Application demarree ! Elle s'ouvre dans votre navigateur.
echo  Appuyez sur une touche pour tout arreter.
echo.
pause >nul

taskkill /f /fi "WINDOWTITLE eq MVS-Backend*" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq MVS-Frontend*" >nul 2>&1
echo Arret effectue.
