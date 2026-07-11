@echo off
REM KATLAB TrackingMonitor stopper - kills whatever LISTENs on the server
REM port read from Config\repos.yaml (same source as the launcher, F10).
REM Force-kill is safe: SQLite writes are transactional.

setlocal
cd /d "%~dp0.."

echo [1/2] Reading port from Config\repos.yaml...
set "PORT="
for /f "tokens=2 delims=:" %%p in ('findstr /r /c:"^ *port:" Config\repos.yaml') do set /a PORT=%%p
if not defined PORT (
    echo [ABORT] Could not read server port from Config\repos.yaml.
    "%SystemRoot%\System32\timeout.exe" /t 5
    exit /b 1
)

echo [2/2] Stopping server on port %PORT%...
set "FOUND="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do (
    taskkill /pid %%a /t /f >nul 2>&1 && echo     Killed PID %%a.
    set "FOUND=1"
)
if not defined FOUND (
    echo     Server was not running - nothing to stop.
) else (
    echo     Server stopped.
)

"%SystemRoot%\System32\timeout.exe" /t 3
endlocal
