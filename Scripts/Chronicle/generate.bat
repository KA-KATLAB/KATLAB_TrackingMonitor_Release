@echo off
setlocal
REM KATLAB Chronicle convenience launcher. The Python entrypoint validates the
REM exact CLI and rechecks this selected interpreter natively before any write.
if not "%~1"=="" (
    >&2 echo Usage: generate.bat
    exit /b 2
)
if defined KATLAB_TRACKER_CONFIG goto production_disabled
if "%KATLAB_TRACKER_DEMO%"=="1" goto production_disabled
if not defined KATLAB_CHRONICLE_PYTHON goto launch
set "_KCP=%KATLAB_CHRONICLE_PYTHON%"
if "%_KCP:~1,2%"==":\" goto launch
if "%_KCP:~1,2%"==":/" goto launch
if "%_KCP:~0,2%"=="\\" goto launch
>&2 echo [ABORT] KATLAB_CHRONICLE_PYTHON must be an absolute path.
exit /b 1

:production_disabled
>&2 echo [ABORT] Production Chronicle is disabled in demo or explicit config mode.
exit /b 1

:launch
if defined KATLAB_CHRONICLE_PYTHON (
    "%KATLAB_CHRONICLE_PYTHON%" -B "%~dp0generate.py" --build
) else (
    python -B "%~dp0generate.py" --build
)
if errorlevel 1 exit /b 1
