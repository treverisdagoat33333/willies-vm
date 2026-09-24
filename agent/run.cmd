@echo off
REM One-click launcher for the willies-vm remote agent.
REM First run installs the one dependency (ws), then connects.
setlocal
cd /d "%~dp0"

if not exist node_modules\ws (
  echo Installing dependency...
  call npm install --no-audit --no-fund
)

if "%REMOTE_KEY%"=="" (
  set /p REMOTE_KEY=Enter your REMOTE_KEY (must match the server):
)
if "%WVM_URL%"=="" set WVM_URL=wss://willies-vm.onrender.com
if "%WVM_NAME%"=="" set WVM_NAME=%COMPUTERNAME%

echo.
echo Connecting to %WVM_URL% as "%WVM_NAME%"
echo Press Ctrl+C to stop sharing this PC.
echo.
node willies-agent.mjs --url "%WVM_URL%" --key "%REMOTE_KEY%" --name "%WVM_NAME%"
endlocal
