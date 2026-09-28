@echo off
REM KATLAB TrackingMonitor - DEMO launcher (PLAN v0.2.6.0 R-BD: SILENT).
REM Zero connection to real repos: generates a scratch demo repo under
REM Demo\runtime\ (gitignored), uses a separate demo database, then
REM starts the server HIDDEN via pythonw -> Demo\runtime\demo.log. The
REM demo NEVER spawns the Chronicle loop (KATLAB_TRACKER_CONFIG set ->
REM the A.2 guard). Lives in Scripts\Demo\ -> repo root two levels up.

setlocal
REM Do not let an inherited CD variable shadow CMD's current-directory value.
set "CD="
cd /d "%~dp0..\.."
if errorlevel 1 (
    echo [ABORT] Could not enter the tracker repository root.
    exit /b 1
)
set "KATLAB_TRACKER_DEMO=1"
set "KATLAB_TRACKER_CONFIG=%cd%\Demo\runtime\repos.demo.yaml"
set "KATLAB_TRACKER_DB=%cd%\Demo\runtime\demo.db"
set "KATLAB_TRACKER_ACTIVITY_DIR=%cd%\Demo\runtime\activity"

echo [1/5] Checking venv...
set "FRESH_VENV="
if not exist ".venv\Scripts\python.exe" (
    python -m venv .venv
    if errorlevel 1 (
        echo [ABORT] venv creation failed - is Python on PATH?
        pause
        exit /b 1
    )
    set "FRESH_VENV=1"
)
set "PY=.venv\Scripts\python.exe"

REM A new venv needs PyYAML before the config/port preflight can run.
if defined FRESH_VENV (
    echo [2/5] Installing backend requirements...
    "%PY%" -m pip install -q -r Backend\requirements.txt
    if errorlevel 1 (
        echo [ABORT] pip install failed.
        pause
        exit /b 1
    )
)

echo [0/5] Checking demo port and health...
"%PY%" -m Scripts.lifecycle_port preflight demo
if errorlevel 10 if not errorlevel 11 (
    endlocal
    exit /b 0
)
if errorlevel 1 (
    echo [ABORT] Demo preflight failed; nothing was launched.
    exit /b 1
)

if not defined FRESH_VENV (
    echo [2/5] Installing backend requirements...
    "%PY%" -m pip install -q -r Backend\requirements.txt
    if errorlevel 1 (
        echo [ABORT] pip install failed.
        pause
        exit /b 1
    )
)

echo [3/5] Checking frontend build...
if not exist "Frontend\dist\index.html" (
    pushd Frontend
    call npm install --no-fund --no-audit
    if errorlevel 1 ( popd & echo [ABORT] npm install failed. & pause & exit /b 1 )
    call npm run build
    if errorlevel 1 ( popd & echo [ABORT] npm build failed. & pause & exit /b 1 )
    popd
)

echo [4/5] Generating demo data (Demo\runtime\)...
"%PY%" Scripts\demo_bootstrap.py
if errorlevel 1 (
    echo [ABORT] demo bootstrap failed.
    pause
    exit /b 1
)

echo [5/5] Starting DEMO HIDDEN (log: Demo\runtime\demo.log)...
if exist "Demo\runtime\demo.log" move /y "Demo\runtime\demo.log" "Demo\runtime\demo.prev.log" >nul 2>&1
REM Use the shared helper so no CMD wrapper survives the setup window.
"%PY%" Scripts\launch_hidden.py demo
if errorlevel 1 (
    echo [ABORT] Could not launch the demo - see errors above.
    pause
    exit /b 1
)
"%PY%" -m Scripts.lifecycle_port ready demo
if errorlevel 1 (
    echo [ABORT] Demo health was not confirmed; the child may still be starting. See Demo\runtime\demo.log.
    exit /b 1
)
endlocal
exit /b 0
