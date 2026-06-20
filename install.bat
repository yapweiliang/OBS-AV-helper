@echo off
echo Download then run OBS AV Helper Installer (install.js) as administrator
pause
set TEMPJS=%TEMP%\install.js
powershell -Command "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/yapweiliang/OBS-AV-helper/main/install.js' -OutFile '%TEMPJS%'"
node "%TEMPJS%"
del "%TEMPJS%"
echo end.