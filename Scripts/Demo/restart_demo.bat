@echo off
REM KATLAB TrackingMonitor DEMO restarter - stop (if running), then
REM relaunch SILENTLY (v0.2.6.0 R-BD: hidden server, log at
REM data\logs\demo.log; regenerates fresh demo data each launch),
REM exactly like double-clicking start_demo.bat.

call "%~dp0stop_demo.bat"
start "" "%~dp0start_demo.bat"
