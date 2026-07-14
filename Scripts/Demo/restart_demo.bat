@echo off
REM KATLAB TrackingMonitor DEMO restarter - stop (if running), then relaunch
REM in its own console window (regenerates fresh demo data each launch),
REM exactly like double-clicking start_demo.bat.

call "%~dp0stop_demo.bat"
start "KATLAB TrackingMonitor DEMO" "%~dp0start_demo.bat"
