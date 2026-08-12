@echo off
REM KATLAB Chronicle - build once + open OFFLINE (PLAN v0.2.4.0 C.1).
REM No server, no port: T1 (use_directory_urls false) makes file://
REM links resolve and T2 (UMD mermaid, vendored by install.bat) keeps
REM diagrams rendering offline. Build is --strict (D8): warnings fail.
REM v0.2.6.0 CFT-4: build into site.view, NEVER the default site\ -
REM since the one-port merge site\ is the dir the tracker SERVES at
REM /chronicle/, and an in-place --clean build would gut it mid-serve
REM (and race the loop's atomic swap). site.view keeps this script
REM truly zero-server-involvement.

cd /d "%~dp0"
set "CFG=%~dp0..\..\Chronicle\runtime\mkdocs.yml"
set "OUT=%~dp0..\..\Chronicle\runtime\site.view"

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
python -m mkdocs build --strict -f "%CFG%" -d "%OUT%"
if errorlevel 1 (
    echo.
    echo BUILD FAILED - not opening.
    exit /b 1
)

start "" "%OUT%\index.html"
