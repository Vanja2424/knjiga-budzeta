@echo off
cd /d "%~dp0"
start "" http://localhost:8000/budzet-tracker.html
python -m http.server 8000 2>nul || py -m http.server 8000
pause
