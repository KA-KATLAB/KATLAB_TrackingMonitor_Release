@echo off
REM KATLAB TrackingMonitor stopper: clear the configured listener or fail.

setlocal
cd /d "%~dp0.."
if errorlevel 1 (
    echo [ABORT] Could not enter the tracker repository root.
    exit /b 1
)

set "PY=.venv\Scripts\python.exe"
if not exist "%PY%" (
    echo [ABORT] Tracker venv Python is unavailable; the port was not checked.
    exit /b 1
)

"%PY%" -m Scripts.lifecycle_port stop tracker
if errorlevel 1 (
    echo [ABORT] Tracker port was not confirmed clear.
    exit /b 1
)

endlocal
exit /b 0
