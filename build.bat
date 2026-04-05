@echo off
echo ========================================
echo VOD Master Build Script
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

REM 인자 없음: 테스트 폴더 복사 + ZIP 1개 / 인자 test: 폴더만
if "%1"=="" (
    python build_extension.py
) else (
    python build_extension.py %1
)