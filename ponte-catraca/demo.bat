@echo off
cd /d "%~dp0"
title Ponte da catraca (DEMONSTRACAO)
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo O Node.js nao esta instalado neste computador.
  echo Baixe a versao LTS em https://nodejs.org , instale e abra este arquivo de novo.
  echo.
  pause
  exit /b 1
)
echo Demonstracao: catraca SIMULADA no IP 127.0.0.1:8790, nada vai para uma catraca de verdade.
start "Catraca simulada" cmd /k node simulador.js
start "" /min cmd /c "ping -n 4 127.0.0.1 >nul & start "" http://localhost:8787/#catraca-cadastro"
set PONTE_CONFIG=config.demo.local.json
set PONTE_CONFIG_PADRAO=config.demo.json
node server.js
pause
