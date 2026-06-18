@echo off
echo OBS AV Helper Installer Starting...

set TEMPJS=%TEMP%\install.js

powershell -Command ^
"Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/yapweiliang/OBS-AV-helper/main/install.js' -OutFile '%TEMPJS%'"

node "%TEMPJS%"

del "%TEMPJS%"

pause