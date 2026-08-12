@echo off
REM KATLAB TrackingMonitor launcher (PLAN v0.2.6.0 R-BD: SILENT ops).
REM The checks below run VISIBLY here (F54 - aborts must be readable);
REM the server then starts HIDDEN via pythonw with all output going to
REM data\logs\tracker.log, and this window closes. The server OWNS the
REM Chronicle regen loop (R-BC) - one process, one port: the UI at /
REM and the Chronicle at /chronicle/ on the same configured port.

setlocal
cd /d "%~dp0.."

REM [0/4] Port from Config\repos.yaml (F10) + the RV8 already-running
REM guard - also makes the log rotation below safe by construction.
set "PORT="
for /f "tokens=2 delims=:" %%p in ('findstr /r /c:"^ *port:" Config\repos.yaml') do set /a PORT=%%p
if not defined PORT set /a PORT=8100
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo Already running - opening http://127.0.0.1:%PORT%
    start "" "http://127.0.0.1:%PORT%"
    exit /b 0
)

echo [1/4] Checking venv...
if not exist ".venv\Scripts\python.exe" (
    python -m venv .venv
    if errorlevel 1 (
        echo [ABORT] venv creation failed - is Python on PATH?
        pause
        exit /b 1
    )
)
set "PY=.venv\Scripts\python.exe"
set "PYW=.venv\Scripts\pythonw.exe"

echo [2/4] Installing backend requirements...
"%PY%" -m pip install -q -r Backend\requirements.txt
if errorlevel 1 (
    echo [ABORT] pip install failed - see errors above.
    pause
    exit /b 1
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
REM RV27: data/ is gitignored WHOLE - without this mkdir the >> below
REM fails on the missing dir and pythonw never starts.
if not exist "data\logs" mkdir "data\logs"
REM RV6 rotation (one previous session kept); RV16: a failure is
REM non-fatal (a crash-window orphan may hold chronicle.log briefly).
if exist "data\logs\tracker.log" move /y "data\logs\tracker.log" "data\logs\tracker.prev.log" >nul 2>&1
if exist "data\logs\chronicle.log" move /y "data\logs\chronicle.log" "data\logs\chronicle.prev.log" >nul 2>&1
REM RV1 - the EXACT silent-launch form: `start` alone EATS redirection
REM (pythonw would crash on its invalid bare handles); a plain call
REM WAITS forever (batch cmd waits even for GUI apps); the cmd /c
REM wrapper owns the redirect and dies with this console - pythonw
REM (GUI subsystem, never console-attached) survives with the handles.
start "" /b cmd /c ""%PYW%" -m Backend.app.main >> "data\logs\tracker.log" 2>&1"
"%SystemRoot%\System32\timeout.exe" /t 3 /nobreak >nul
echo started - UI http://127.0.0.1:%PORT% - Chronicle /chronicle/ - logs data\logs\
start "" "http://127.0.0.1:%PORT%"
endlocal
