@echo off
REM KATLAB TrackingMonitor DEMO restarter - stop (if running), then
REM relaunch SILENTLY (v0.2.6.0 R-BD: hidden server, log at
REM Demo\runtime\demo.log; regenerates fresh demo data each launch),
REM exactly like double-clicking start_demo.bat.

call "%~dp0stop_demo.bat"
REM CALL reuses this setup session; bare START of a BAT leaves a CMD /K window.
call "%~dp0start_demo.bat"
exit /b %errorlevel%
