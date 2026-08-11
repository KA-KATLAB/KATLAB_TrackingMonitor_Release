@echo off
REM KATLAB Scribe - manual drain (PLAN v0.2.5.0 C.1): writes ALL
REM pending story pages within the horizon (daily diaries, weekly
REM retro, release drafts) via claude -p headless. Respects EVERY
REM quota law incl. the daily cap. Needs: the tracker RUNNING
REM (REST is the only data source) + the claude CLI logged in.

cd /d "%~dp0"

python --version >nul 2>&1
if errorlevel 1 (
    echo [ABORT] python not found on PATH.
    pause
    exit /b 1
)

where claude >nul 2>&1
if errorlevel 1 (
    echo [ABORT] claude CLI not found on PATH - install Claude Code first.
    pause
    exit /b 1
)

python scribe.py
pause
