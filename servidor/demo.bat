@echo off
cd /d "%~dp0"
title Portal escolar (DEMONSTRACAO)
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo O Node.js nao esta instalado neste computador.
  echo Baixe a versao LTS em https://nodejs.org , instale e abra este arquivo de novo.
  echo.
  pause
  exit /b 1
)
echo Demonstracao: dados ficticios e catraca SIMULADA no IP 127.0.0.1:8790.
echo Nada vai para uma catraca de verdade. Usuarios de teste: admin.demo / demo1234
start "Catraca simulada" cmd /k node simulador.js
start "" /min cmd /c "ping -n 4 127.0.0.1 >nul & start "" http://localhost:8787/"
set CONFIG=config.demo.json
node server.js
pause
