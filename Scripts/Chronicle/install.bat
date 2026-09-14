@echo off
setlocal
REM Install into the selected Python; no host runtime upgrade or release attestation.
if not "%2"=="" goto usage
if "%~1"=="--mermaid-only" goto accepted
if not "%1"=="" goto usage

:accepted
REM Controlled/demo invocations must abort before interpreter discovery, helper
REM reads, pip, or asset transport.
if defined KATLAB_TRACKER_CONFIG goto controlled
if "%KATLAB_TRACKER_DEMO%"=="1" goto controlled

:resolve
if not defined KATLAB_CHRONICLE_PYTHON (
    for /f "delims=" %%P in ('where python 2^>nul') do if not defined KATLAB_CHRONICLE_PYTHON set "KATLAB_CHRONICLE_PYTHON=%%P"
)
if not defined KATLAB_CHRONICLE_PYTHON (
    echo [ABORT] Python is unavailable. 1>&2
    exit /b 1
)
set "KATLAB_CHRONICLE_PYTHON_ABSOLUTE="
if "%KATLAB_CHRONICLE_PYTHON:~1,2%"==":\" set "KATLAB_CHRONICLE_PYTHON_ABSOLUTE=1"
if "%KATLAB_CHRONICLE_PYTHON:~1,2%"==":/" set "KATLAB_CHRONICLE_PYTHON_ABSOLUTE=1"
if "%KATLAB_CHRONICLE_PYTHON:~0,2%"=="\\" set "KATLAB_CHRONICLE_PYTHON_ABSOLUTE=1"
if not defined KATLAB_CHRONICLE_PYTHON_ABSOLUTE (
    echo [ABORT] KATLAB_CHRONICLE_PYTHON must be an absolute Windows path. 1>&2
    exit /b 1
)
if "%~1"=="--mermaid-only" goto mermaid_only

echo [1/2] Installing Chronicle requirements (plain pip)...
REM Load the fixed stdlib-only authority under a real module identity, prove this
REM exact running interpreter natively, and only then enable site packages/pip.
"%KATLAB_CHRONICLE_PYTHON%" -I -S -B -c "import sys,types;from pathlib import Path;p=Path(sys.argv[1]);f=p.open('rb');b=f.read(16777217);f.close();assert len(b)<=16777216;m=types.ModuleType('_katlab_chronicle_safe_io_bootstrap');m.__file__=str(p);sys.modules[m.__name__]=m;exec(compile(b,str(p),'exec'),m.__dict__);m.require_expected_interpreter();import site,runpy;site.main();sys.argv=['pip','install','-r',sys.argv[2]];runpy.run_module('pip',run_name='__main__')" "%~dp0safe_io.py" "%~dp0requirements.txt"
if errorlevel 1 (
    echo [ABORT] pip install failed. 1>&2
    exit /b 1
)
echo [2/2] Fetching verified vendor assets...
call :asset fetch-bootswatch
if errorlevel 1 echo [WARN] Bootswatch fetch failed - CDN fallback is online only. 1>&2
call :asset fetch-mermaid
if errorlevel 1 echo [WARN] Mermaid fetch failed - CDN fallback is online only. 1>&2
echo Done. Chronicle dependencies and verified asset fetches were attempted.
exit /b 0

:mermaid_only
call :asset fetch-mermaid
exit /b %errorlevel%

:asset
REM Isolated startup precedes reading the fixed helper; asset validation,
REM atomic promotion and interpreter validation belong to safe_io.
"%KATLAB_CHRONICLE_PYTHON%" -I -S -B -c "import sys; from pathlib import Path; p=Path(sys.argv[1]); f=p.open('rb'); b=f.read(16777217); f.close(); assert len(b)<=16777216; sys.argv=[str(p),sys.argv[2]]; exec(compile(b,str(p),'exec'),{'__name__':'__main__','__file__':str(p)})" "%~dp0safe_io.py" "%~1"
exit /b %errorlevel%

:usage
echo Usage: install.bat [--mermaid-only] 1>&2
exit /b 2

:controlled
echo [ABORT] Chronicle install is unavailable in demo or explicit-config mode. 1>&2
exit /b 1
