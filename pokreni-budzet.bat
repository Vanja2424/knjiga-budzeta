@echo off
cd /d "%~dp0"
rem budzet-tracker.html se spaja iz src/ (ako je Node instaliran)
node app\scripts\build-web.js 2>nul
start "" http://localhost:8000/budzet-tracker.html
python -m http.server 8000 2>nul || py -m http.server 8000
pause
