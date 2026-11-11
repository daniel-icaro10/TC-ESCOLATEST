@echo off
cd /d "%~dp0"
title Portal escolar (servidor)
where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao esta instalado neste computador. Baixe a versao LTS em https://nodejs.org
  pause
  exit /b 1
)
if not exist dados mkdir dados
echo Servidor do portal escolar rodando. Deixe esta janela aberta (pode minimizar).
echo Se o servidor parar, ele volta sozinho em 5 segundos.
echo Registro do que acontece: %~dp0dados\servidor.log
:inicio
echo %date% %time% iniciando o servidor>> dados\servidor.log
node server.js >> dados\servidor.log 2>&1
echo %date% %time% o servidor parou, reiniciando em 5 segundos>> dados\servidor.log
echo %time% o servidor parou, reiniciando em 5 segundos...
ping -n 6 127.0.0.1 >nul
goto inicio
