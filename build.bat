@echo off
echo ========================================
echo VOD Synchronizer Build Script
echo ========================================
echo.

REM Python이 설치되어 있는지 확인
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python이 설치되어 있지 않습니다.
    echo    Python을 설치한 후 다시 실행해주세요.
    pause
    exit /b 1
)

REM 빌드 스크립트 실행
python build_extension.py

echo.
echo 빌드 완료! 아무 키나 누르면 종료됩니다.
pause
