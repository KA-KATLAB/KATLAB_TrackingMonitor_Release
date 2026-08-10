@echo off
REM KATLAB Chronicle - one-shot site generation (PLAN v0.2.4.0 C.1).
REM Needs the tracker RUNNING (REST is the only data source, D2);
REM a down server aborts friendly BEFORE any write (RV10/RV13).

cd /d "%~dp0"

python generate.py
if errorlevel 1 exit /b 1
