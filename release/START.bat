@echo off
set RIFTCROWD_TOKEN=change-me
cd /d "%~dp0"
node launcher/dist/index.js --mode mock --log-dir ./logs
pause
