@echo off
REM KATLAB TrackingMonitor DEMO stopper: clear port 8101 or fail.

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

set "PY=.venv\Scripts\python.exe"
if not exist "%PY%" (
    echo [ABORT] Demo venv Python is unavailable; the port was not checked.
    exit /b 1
)

"%PY%" -m Scripts.lifecycle_port stop demo
if errorlevel 1 (
    echo [ABORT] Demo port was not confirmed clear.
    exit /b 1
)

endlocal
exit /b 0
