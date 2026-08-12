@echo off
REM KATLAB TrackingMonitor restarter - stop (if running), then start
REM again SILENTLY (v0.2.6.0 R-BD: the server runs hidden, logs at
REM data\logs\ - no persistent window), exactly like double-clicking
REM the start script.

call "%~dp0stop_tracking_monitor.bat"
start "" "%~dp0start_tracking_monitor.bat"
