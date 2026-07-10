@echo off
REM KATLAB TrackingMonitor - DEMO launcher. Zero connection to real repos:
REM generates a scratch demo repo under Demo\runtime\ (gitignored), uses a
REM separate demo database, then starts the server on the configured port.

setlocal
cd /d "%~dp0.."

echo [1/5] Checking venv...
if not exist ".venv\Scripts\python.exe" (
    python -m venv .venv
    if errorlevel 1 (
        echo [ABORT] venv creation failed - is Python on PATH?
        exit /b 1
    )
)
set "PY=.venv\Scripts\python.exe"

echo [2/5] Installing backend requirements...
"%PY%" -m pip install -q -r Backend\requirements.txt
if errorlevel 1 (
    echo [ABORT] pip install failed.
    exit /b 1
)

echo [3/5] Checking frontend build...
if not exist "Frontend\dist\index.html" (
    pushd Frontend
    call npm install --no-fund --no-audit
    if errorlevel 1 ( popd & echo [ABORT] npm install failed. & exit /b 1 )
    call npm run build
    if errorlevel 1 ( popd & echo [ABORT] npm build failed. & exit /b 1 )
    popd
)

echo [4/5] Generating demo data (Demo\runtime\)...
"%PY%" Scripts\demo_bootstrap.py
if errorlevel 1 (
    echo [ABORT] demo bootstrap failed.
    exit /b 1
)

echo [5/5] Starting DEMO server (separate demo DB, real data untouched)...
set "KATLAB_TRACKER_CONFIG=%cd%\Demo\runtime\repos.demo.yaml"
set "KATLAB_TRACKER_DB=%cd%\Demo\runtime\demo.db"
"%PY%" -m Backend.app.main
endlocal
