@echo off
REM KATLAB TrackingMonitor restarter - stop (if running), then start
REM again SILENTLY (v0.2.6.0 R-BD: the server runs hidden, logs at
REM data\logs\ - no persistent window), exactly like double-clicking
REM the start script.

setlocal
REM Restore CMD's dynamic exit status if an inherited variable shadows it.
set "ERRORLEVEL="
call "%~dp0stop_tracking_monitor.bat"
if errorlevel 1 exit /b %errorlevel%
REM CALL reuses this setup session; bare START of a BAT leaves a CMD /K window.
call "%~dp0start_tracking_monitor.bat"
exit /b %errorlevel%
