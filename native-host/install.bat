@echo off
chcp 65001 >nul
setlocal
rem Cai bo tai video (yt-dlp + ffmpeg) cho Cinema Tools. Bam dup chuot de chay.
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo Chua co Python. Cai Python 3 tai https://www.python.org/downloads/ ^(tick "Add python.exe to PATH"^)
  echo hoac chay: winget install Python.Python.3.12
  pause
  exit /b 1
)
%PY% "%~dp0install.py" %*
echo.
pause
