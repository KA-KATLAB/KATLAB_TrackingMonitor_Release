@echo off
REM KATLAB TrackingMonitor launcher (PLAN v0.1.0.0 I.2).
REM Every step aborts on failure (F54) - a failed pip/npm must not launch
REM a broken server. Host/port come from Config\repos.yaml via main.py (F10).

setlocal
cd /d "%~dp0.."

echo [1/4] Checking venv...
if not exist ".venv\Scripts\python.exe" (
    python -m venv .venv
    if errorlevel 1 (
        echo [ABORT] venv creation failed - is Python on PATH?
        exit /b 1
    )
)
set "PY=.venv\Scripts\python.exe"

echo [2/4] Installing backend requirements...
"%PY%" -m pip install -q -r Backend\requirements.txt
if errorlevel 1 (
    echo [ABORT] pip install failed - see errors above.
    exit /b 1
)

echo [3/4] Checking frontend build...
if not exist "Frontend\dist\index.html" (
    echo     Frontend\dist missing - building (first run, F20)...
    pushd Frontend
    call npm install --no-fund --no-audit
    if errorlevel 1 (
        popd
        echo [ABORT] npm install failed - is Node.js installed?
        exit /b 1
    )
    call npm run build
    if errorlevel 1 (
        popd
        echo [ABORT] npm build failed - see errors above.
        exit /b 1
    )
    popd
)

echo [4/4] Starting TrackingMonitor (host/port from Config\repos.yaml)...
"%PY%" -m Backend.app.main
if errorlevel 1 (
    echo [EXIT] Server stopped with an error (config problem? see message above).
    exit /b 1
)
endlocal
