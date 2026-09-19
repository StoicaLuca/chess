@echo off
REM Lansator Windows pentru Puzzle Trainer.
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Nu gasesc Python in PATH.
  echo Instaleaza Python de pe python.org si bifeaza "Add python.exe to PATH".
  pause
  exit /b 1
)

if not exist "puzzles.db" (
  echo Nu exista inca baza de puzzle-uri.
  echo.
  echo Rulez setup-ul acum. Descarca ~300 MB, dureaza cateva minute.
  echo.
  python -m pip install --quiet zstandard
  python setup.py
  if errorlevel 1 (
    echo.
    echo Setup-ul a esuat. Vezi README.md pentru varianta manuala.
    pause
    exit /b 1
  )
)

python server.py
pause
