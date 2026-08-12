@echo off
REM KATLAB TrackingMonitor - DEMO launcher (PLAN v0.2.6.0 R-BD: SILENT).
REM Zero connection to real repos: generates a scratch demo repo under
REM Demo\runtime\ (gitignored), uses a separate demo database, then
REM starts the server HIDDEN via pythonw -> data\logs\demo.log. The
REM demo NEVER spawns the Chronicle loop (KATLAB_TRACKER_CONFIG set ->
REM the A.2 guard). Lives in Scripts\Demo\ -> repo root two levels up.

setlocal
cd /d "%~dp0..\.."

REM [0/5] Demo port (RV24: the generated yaml if present, else the
REM fixed 8101 - the yaml doesn't exist before [4/5] on a fresh clone)
REM + the RV8 already-running guard.
set "PORT="
if exist "Demo\runtime\repos.demo.yaml" (
    for /f "tokens=2 delims=:" %%p in ('findstr /r /c:"^ *port:" Demo\runtime\repos.demo.yaml') do set /a PORT=%%p
)
if not defined PORT set /a PORT=8101
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo Demo already running - opening http://127.0.0.1:%PORT%
    start "" "http://127.0.0.1:%PORT%"
    exit /b 0
)

echo [1/5] Checking venv...
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

echo [2/5] Installing backend requirements...
"%PY%" -m pip install -q -r Backend\requirements.txt
if errorlevel 1 (
    echo [ABORT] pip install failed.
    pause
    exit /b 1
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

echo [5/5] Starting DEMO HIDDEN (log: data\logs\demo.log)...
set "KATLAB_TRACKER_CONFIG=%cd%\Demo\runtime\repos.demo.yaml"
set "KATLAB_TRACKER_DB=%cd%\Demo\runtime\demo.db"
if not exist "data\logs" mkdir "data\logs"
if exist "data\logs\demo.log" move /y "data\logs\demo.log" "data\logs\demo.prev.log" >nul 2>&1
start "" /b cmd /c ""%PYW%" -m Backend.app.main >> "data\logs\demo.log" 2>&1"
"%SystemRoot%\System32\timeout.exe" /t 3 /nobreak >nul
echo started - DEMO UI http://127.0.0.1:%PORT% - log data\logs\demo.log
start "" "http://127.0.0.1:%PORT%"
endlocal
