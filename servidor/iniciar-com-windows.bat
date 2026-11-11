@echo off
cd /d "%~dp0"
set "ATALHO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Portal escolar.bat"
> "%ATALHO%" echo @echo off
>> "%ATALHO%" echo start "Portal escolar" /min cmd /c ""%~dp0rodar-sempre.bat""
echo.
echo Pronto. O servidor do portal vai abrir sozinho (minimizado) sempre que este usuario entrar no Windows,
echo e volta sozinho se fechar por algum erro.
echo.
echo Para desligar o inicio automatico, use parar-inicio-automatico.bat.
echo Dica: deixe o Windows entrar sozinho neste usuario e desligue a suspensao do computador.
echo.
set /p ABRIR=Abrir o servidor agora? (S/N)
if /i "%ABRIR%"=="S" start "Portal escolar" /min cmd /c ""%~dp0rodar-sempre.bat""
pause
