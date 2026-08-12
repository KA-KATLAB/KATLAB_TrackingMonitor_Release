@echo off
REM KATLAB Chronicle - one-shot site generation + build (v0.2.6.0:
REM --build refreshes the site the tracker serves at /chronicle/).
REM Needs the tracker RUNNING (REST is the only data source, D2);
REM a down server aborts friendly BEFORE any write (RV10/RV13).

cd /d "%~dp0"

python generate.py --build
if errorlevel 1 exit /b 1
