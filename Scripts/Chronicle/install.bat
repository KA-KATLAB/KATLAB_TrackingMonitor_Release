@echo off
REM KATLAB Chronicle - one-time install (PLAN v0.2.4.0 C.1).
REM PLAIN pip, no venv (the Live_arch precedent, user-agreed 2026-08-04).
REM RV24 semantics: a pip failure ABORTS (F54); a vendor-fetch failure
REM only WARNS - mkdocs.yml falls back to the CDN URLs (served mode
REM still works online; offline view.bat needs a later re-run).

cd /d "%~dp0"

echo [1/2] Installing Chronicle requirements (plain pip)...
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo [ABORT] pip install failed - is Python on PATH?
    exit /b 1
)

echo [2/2] Fetching vendor assets (offline view support)...
if not exist "assets\vendor" mkdir "assets\vendor"
REM CFT-4: a mid-transfer failure can leave a PARTIAL file - delete it
REM so the generator's vendor-or-CDN fallback never wires a broken asset.
curl -fsSL -o "assets\vendor\bootswatch-darkly.css" https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/darkly/bootstrap.min.css
if errorlevel 1 (
    if exist "assets\vendor\bootswatch-darkly.css" del "assets\vendor\bootswatch-darkly.css"
    echo [WARN] Bootswatch fetch failed - the site will use the CDN stylesheet ^(online only^).
)
curl -fsSL -o "assets\vendor\mermaid.min.js" https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js
if errorlevel 1 (
    if exist "assets\vendor\mermaid.min.js" del "assets\vendor\mermaid.min.js"
    echo [WARN] mermaid UMD fetch failed - diagrams will use the CDN script ^(online only^).
)

echo Done. Next: generate.bat (one-shot build) / view.bat (offline) - the running tracker serves the living site at /chronicle/
