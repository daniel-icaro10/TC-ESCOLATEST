@echo off
set "ATALHO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Portal escolar.bat"
if exist "%ATALHO%" (
  del "%ATALHO%"
  echo O servidor nao vai mais abrir sozinho com o Windows.
) else (
  echo O inicio automatico ja estava desligado.
)
echo Se o servidor estiver aberto agora, feche a janela "Portal escolar" para parar.
pause
