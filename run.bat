@echo off
REM AI-Assisted Rapid Exam Preparation System
REM Windows Quick Start Script

echo ==========================================
echo AI Exam Preparation System - Setup
echo ==========================================

REM Check Python
python --version

REM Create virtual environment if not exists
if not exist "backend\venv" (
    echo Creating virtual environment...
    cd backend
    python -m venv venv
    call venv\Scripts\activate.bat
    pip install --upgrade pip
    pip install -r requirements.txt
    cd ..
) else (
    echo Virtual environment exists.
    call backend\venv\Scripts\activate.bat
)

REM Create uploads directory
if not exist "backend\uploads" mkdir backend\uploads

REM Download NLTK data
echo Downloading NLTK data...
python -c "import nltk; nltk.download('punkt', quiet=True); nltk.download('stopwords', quiet=True); nltk.download('punkt_tab', quiet=True)"

echo ==========================================
echo Starting servers...
echo ==========================================

REM Start backend server
echo Starting backend server...
start "Backend Server" cmd /k "cd backend && python app.py"

REM Wait for backend to start
timeout /t 3 /nobreak

REM Start frontend server
echo Starting frontend server...
start "Frontend Server" cmd /k "python -m http.server 8080"

echo ==========================================
echo Servers running!
echo ==========================================
echo Frontend: http://localhost:8080
echo Backend API: http://localhost:5000
echo.
echo Close the command windows to stop servers

REM Open browser
timeout /t 2 /nobreak
start http://localhost:8080

pause
