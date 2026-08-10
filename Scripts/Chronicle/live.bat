@echo off
REM KATLAB Chronicle - THE LIVING SITE (PLAN v0.2.4.0 C.1): a regen
REM loop + the live-reload server. Data changes -> changed pages
REM rewritten -> dirty rebuild -> browser refreshes itself.
REM RV26 lifecycle: the loop runs in its OWN titled window (visible,
REM closeable), is single-instance (heartbeat lockfile), and
REM SELF-EXITS after ~10 loop ticks once the serve port goes dark -
REM closing this window never leaves an orphan process for long.
REM CFT-5: NO --dirty (full builds ~0.7s regenerate the NAV live -
REM a brand-new page, new UTC day or new plan, appears in the served
REM nav on the next rebuild; the old restart caveat is retired).

cd /d "%~dp0"
set "CFG=%~dp0..\..\Chronicle\runtime\mkdocs.yml"

python -m mkdocs --version >nul 2>&1
if errorlevel 1 (
    echo [ABORT] MkDocs is not installed - run install.bat first.
    exit /b 1
)

start "KATLAB Chronicle regen loop" cmd /c "python "%~dp0generate.py" --loop 60 & pause"

python generate.py
if errorlevel 1 (
    if exist "%CFG%" (
        echo [WARN] generate failed - serving the EXISTING site instead.
    ) else (
        echo [ABORT] no existing site to serve - start the tracker, then retry.
        exit /b 1
    )
)

REM CFT-6: serve's build dir must live OUTSIDE %%TEMP%% - Windows temp
REM cleanup deletes aged temp dirs on idle days (the all-404 class).
set "TMP=%~dp0..\..\Chronicle\runtime\.serve_tmp"
set "TEMP=%TMP%"
if exist "%TMP%" rd /s /q "%TMP%"
mkdir "%TMP%"

python -m mkdocs serve -f "%CFG%" -a 127.0.0.1:8200 --livereload
