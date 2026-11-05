@echo off
cd /d "%~dp0"
title Ponte da catraca
echo Ponte da catraca: deixe esta janela aberta.
echo Configure a catraca no portal: http://localhost:8787/#catraca-config
start "" /min cmd /c "timeout /t 2 /nobreak >/dev/null & start http://localhost:8787/#catraca-config"
node server.js
pause
