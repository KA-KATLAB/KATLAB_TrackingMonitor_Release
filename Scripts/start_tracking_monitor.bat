@echo off
REM KATLAB TrackingMonitor launcher (PLAN v0.2.6.0 R-BD: SILENT ops).
REM The checks below run VISIBLY here (F54 - aborts must be readable);
REM the server then starts HIDDEN via pythonw with all output going to
REM data\logs\tracker.log, and this window closes. The server OWNS the
REM Chronicle regen loop (R-BC) - one process, one port: the UI at /
REM and the Chronicle at /chronicle/ on the same configured port.

setlocal
cd /d "%~dp0.."
if errorlevel 1 (
    echo [ABORT] Could not enter the tracker repository root.
    exit /b 1
)

echo [1/4] Checking venv...
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
    echo [2/4] Installing backend requirements...
    "%PY%" -m pip install -q -r Backend\requirements.txt
    if errorlevel 1 (
        echo [ABORT] pip install failed - see errors above.
        pause
        exit /b 1
    )
)

echo [0/4] Checking tracker port and health...
"%PY%" -m Scripts.lifecycle_port preflight tracker
if errorlevel 10 if not errorlevel 11 (
    endlocal
    exit /b 0
)
if errorlevel 1 (
    echo [ABORT] Tracker preflight failed; nothing was launched.
    exit /b 1
)

REM Avoid pip mutation while a verified tracker is already running.
if not defined FRESH_VENV (
    echo [2/4] Installing backend requirements...
    "%PY%" -m pip install -q -r Backend\requirements.txt
    if errorlevel 1 (
        echo [ABORT] pip install failed - see errors above.
        pause
        exit /b 1
    )
)

echo [3/4] Checking frontend build...
if not exist "Frontend\dist\index.html" (
    echo     Frontend\dist missing - building ^(first run, F20^)...
    pushd Frontend
    call npm install --no-fund --no-audit
    if errorlevel 1 (
        popd
        echo [ABORT] npm install failed - is Node.js installed?
        pause
        exit /b 1
    )
    call npm run build
    if errorlevel 1 (
        popd
        echo [ABORT] npm build failed - see errors above.
        pause
        exit /b 1
    )
    popd
)

echo [4/4] Starting HIDDEN (logs: data\logs\)...
REM Create the ignored log directory before rotating the previous session.
if not exist "data\logs" mkdir "data\logs"
REM RV6 rotation (one previous session kept); RV16: a failure is
REM non-fatal (a crash-window orphan may hold chronicle.log briefly).
if exist "data\logs\tracker.log" move /y "data\logs\tracker.log" "data\logs\tracker.prev.log" >nul 2>&1
if exist "data\logs\chronicle.log" move /y "data\logs\chronicle.log" "data\logs\chronicle.prev.log" >nul 2>&1
REM The short-lived helper owns redirection; no persistent CMD wrapper.
"%PY%" Scripts\launch_hidden.py tracker
if errorlevel 1 (
    echo [ABORT] Could not launch the tracker - see errors above.
    pause
    exit /b 1
)
"%PY%" -m Scripts.lifecycle_port ready tracker
if errorlevel 1 (
    echo [ABORT] Tracker health was not confirmed; the child may still be starting. See data\logs\tracker.log.
    exit /b 1
)
endlocal
exit /b 0
