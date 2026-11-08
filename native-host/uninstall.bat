@echo off
chcp 65001 >nul
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY set "PY=python"
%PY% "%~dp0install.py" --uninstall
pause
