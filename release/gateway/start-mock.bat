@echo off
set RIFTCROWD_TOKEN=change-me
set LOCAL_SESSION_TOKEN=change-me
set LIVE_PROVIDER=mock
set HOST=127.0.0.1
set GATEWAY_PORT=8787
cd /d "%~dp0"
node server.js
pause
