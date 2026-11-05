@echo off
cd /d "%~dp0"
title Ponte da catraca (DEMONSTRACAO)
echo Demonstracao: catraca SIMULADA, nada vai para uma catraca de verdade.
start "Catraca simulada" cmd /k node simulador.js
start "" /min cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:8787/#catraca-cadastro"
set PONTE_CONFIG=config.demo.json
node server.js
pause
