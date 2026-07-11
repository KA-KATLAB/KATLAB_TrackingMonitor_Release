@echo off
REM KATLAB TrackingMonitor restarter - stop (if running), then launch fresh
REM in its own console window, exactly like double-clicking the start script.

call "%~dp0stop_tracking_monitor.bat"
start "KATLAB TrackingMonitor" "%~dp0start_tracking_monitor.bat"
