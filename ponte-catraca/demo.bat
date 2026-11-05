@echo off
cd /d "%~dp0"
title Ponte da catraca (DEMONSTRACAO)
echo Demonstracao: catraca SIMULADA no IP 127.0.0.1:8790, nada vai para uma catraca de verdade.
start "Catraca simulada" cmd /k node simulador.js
start "" /min cmd /c "timeout /t 3 /nobreak >/dev/null & start http://localhost:8787/#catraca-cadastro"
set PONTE_CONFIG=config.demo.local.json
set PONTE_CONFIG_PADRAO=config.demo.json
node server.js
pause
