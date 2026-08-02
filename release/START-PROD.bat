@echo off
set RIFTCROWD_TOKEN=change-me
set LIVE_PROVIDER=tikfinity
cd /d "%~dp0"
node launcher/dist/index.js --mode prod --log-dir ./logs
pause
