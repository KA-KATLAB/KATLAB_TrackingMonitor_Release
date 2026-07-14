@echo off
REM KATLAB TrackingMonitor DEMO stopper - kills whatever LISTENs on the demo
REM port. Port is read from the generated Demo\runtime\repos.demo.yaml (same
REM source the demo launcher uses); falls back to 8101 (CFT-13 fixed demo
REM port) if the demo has never been generated. Force-kill is safe: SQLite
REM writes are transactional. Real tracker on 8100 is never touched.

setlocal
cd /d "%~dp0..\.."

echo [1/2] Reading demo port from Demo\runtime\repos.demo.yaml...
set "PORT="
if exist "Demo\runtime\repos.demo.yaml" (
    for /f "tokens=2 delims=:" %%p in ('findstr /r /c:"^ *port:" Demo\runtime\repos.demo.yaml') do set /a PORT=%%p
)
if not defined PORT set /a PORT=8101

echo [2/2] Stopping DEMO server on port %PORT%...
set "FOUND="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do (
    taskkill /pid %%a /t /f >nul 2>&1 && echo     Killed PID %%a.
    set "FOUND=1"
)
if not defined FOUND (
    echo     Demo server was not running - nothing to stop.
) else (
    echo     Demo server stopped.
)

"%SystemRoot%\System32\timeout.exe" /t 3
endlocal
