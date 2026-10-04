@echo off
setlocal
rem Pinned importer/OCCT sources must first be unpacked as .vizdiff/step-src (with OCCT under its occt directory).
rem SDK setup: official emsdk install 3.1.69. No global environment changes are needed.
set "STEP_TASK_ROOT=%~dp0.."
set "STEP_TASK_SOURCE=%STEP_TASK_ROOT%\.vizdiff\step-src"
set "STEP_TASK_BUILD=%STEP_TASK_ROOT%\.vizdiff\csp-step-build\short-output"
call "%STEP_TASK_ROOT%\.vizdiff\emsdk\emsdk.bat" activate 3.1.69
if errorlevel 1 exit /b 1
call "%STEP_TASK_ROOT%\.vizdiff\emsdk\emsdk_env.bat" >nul 2>&1
if errorlevel 1 exit /b 1
call emcmake cmake -S "%STEP_TASK_SOURCE%" -B "%STEP_TASK_BUILD%" -G Ninja -DCMAKE_MAKE_PROGRAM="%STEP_TASK_ROOT%\.vizdiff\step-buildtools\bin\ninja.exe" -DEMSCRIPTEN=1 -DCMAKE_BUILD_TYPE=Release -DCMAKE_NINJA_FORCE_RESPONSE_FILE=ON "-DCMAKE_EXE_LINKER_FLAGS=-sDYNAMIC_EXECUTION=0"
if errorlevel 1 exit /b 1
cmake --build "%STEP_TASK_BUILD%" --parallel 4
exit /b %errorlevel%
