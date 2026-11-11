@echo off
cd /d "%~dp0"
title Portal escolar (servidor)
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo O Node.js nao esta instalado neste computador.
  echo Baixe a versao LTS em https://nodejs.org , instale e abra este arquivo de novo.
  echo.
  pause
  exit /b 1
)
echo Servidor do portal escolar: deixe esta janela aberta.
start "" /min cmd /c "ping -n 3 127.0.0.1 >nul & start "" http://localhost:8787/"
node server.js
pause
