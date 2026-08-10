@echo off
REM KATLAB Chronicle - generate + live-reload serve (PLAN v0.2.4.0 C.1).
REM T3: --livereload EXPLICIT (click >= 8.2 silently disables it on
REM MkDocs 1.6.1 otherwise). CFT-5: NO --dirty - our full build is
REM ~0.7s (the Live_arch needed dirty for its 30-70s LikeC4 builds;
REM we never did); full rebuilds also regenerate the NAV live (the
REM old nav-staleness caveat is gone) and retire the long-run
REM dirty-state fragility. The generator's write-if-changed (T4)
REM still keeps rebuild triggers minimal. RV11: `python -m mkdocs` +
REM -f to the runtime config. RV13: a failed pre-serve generate falls
REM back to serving the EXISTING site (the Overview data-through
REM stamp shows its age). Port 8200 (D4). Ctrl+C stops the server.

cd /d "%~dp0"
set "CFG=%~dp0..\..\Chronicle\runtime\mkdocs.yml"

python -m mkdocs --version >nul 2>&1
if errorlevel 1 (
    echo [ABORT] MkDocs is not installed - run install.bat first.
    exit /b 1
)

python generate.py
if errorlevel 1 (
    if exist "%CFG%" (
        echo [WARN] generate failed - serving the EXISTING site instead.
    ) else (
        echo [ABORT] no existing site to serve - start the tracker, then retry.
        exit /b 1
    )
)

REM CFT-6: mkdocs serve builds into %%TEMP%%\mkdocs_* and serves from
REM there - Windows temp cleanup (Storage Sense etc.) deletes aged
REM temp dirs on idle days, leaving a listening server with NO site
REM (the recurring all-404 class, evidence: zero mkdocs_* in TEMP
REM while the port listened). Point the process TEMP at our own
REM gitignored runtime dir - out of any cleaner's territory.
set "TMP=%~dp0..\..\Chronicle\runtime\.serve_tmp"
set "TEMP=%TMP%"
if exist "%TMP%" rd /s /q "%TMP%"
mkdir "%TMP%"

python -m mkdocs serve -f "%CFG%" -a 127.0.0.1:8200 --livereload
