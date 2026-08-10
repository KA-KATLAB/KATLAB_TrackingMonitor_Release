@echo off
REM KATLAB Chronicle - build once + open OFFLINE (PLAN v0.2.4.0 C.1).
REM No server, no port: T1 (use_directory_urls false) makes file://
REM links resolve and T2 (UMD mermaid, vendored by install.bat) keeps
REM diagrams rendering offline. Build is --strict (D8): warnings fail.

cd /d "%~dp0"
set "CFG=%~dp0..\..\Chronicle\runtime\mkdocs.yml"

python -m mkdocs --version >nul 2>&1
if errorlevel 1 (
    echo [ABORT] MkDocs is not installed - run install.bat first.
    exit /b 1
)
if not exist "%CFG%" (
    echo [ABORT] no generated site yet - run generate.bat first.
    exit /b 1
)

echo Building (--strict)...
python -m mkdocs build --strict -f "%CFG%"
if errorlevel 1 (
    echo.
    echo BUILD FAILED - not opening.
    exit /b 1
)

start "" "%~dp0..\..\Chronicle\runtime\site\index.html"
