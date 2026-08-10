@echo off
REM KATLAB - ONE double-click for everything (IMPL-5, user 2026-08-06).
REM Underscore prefix keeps this bat sorted on top of Scripts\.
REM 1) starts the TrackingMonitor server (its own window) unless port
REM    8100 already listens (the Config\repos.yaml default port);
REM 2) starts the Chronicle LIVING SITE (live.bat: regen loop window +
REM    live-reload serve window on port 8200).

cd /d "%~dp0"

netstat -ano | findstr /C:"127.0.0.1:8100" | findstr LISTENING >nul
if not errorlevel 1 (
    echo [1/2] TrackingMonitor already running on 8100.
    goto chronicle
)

echo [1/2] Starting TrackingMonitor (own window)...
start "KATLAB TrackingMonitor" start_tracking_monitor.bat

set TRIES=0
:wait_tracker
timeout /t 2 /nobreak >nul
netstat -ano | findstr /C:"127.0.0.1:8100" | findstr LISTENING >nul
if not errorlevel 1 goto chronicle
set /a TRIES+=1
if %TRIES% lss 30 goto wait_tracker
echo [WARN] tracker not up after ~60s - Chronicle will serve the
echo        existing site and catch up on its next loop tick.

:chronicle
echo [2/2] Starting the Chronicle living site (own windows)...
start "KATLAB Chronicle" "%~dp0Chronicle\live.bat"

echo Done. Tracker UI:   http://127.0.0.1:8100
echo       Chronicle:    http://127.0.0.1:8200
