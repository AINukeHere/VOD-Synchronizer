#!/usr/bin/env python3
"""
VOD Synchronizer Chrome Extension Build Script
배포용 ZIP 파일을 생성하는 스크립트입니다.
"""

import os
import zipfile
import shutil
import json
from datetime import datetime
from pathlib import Path

def create_build_script():
    """배포용 ZIP 파일을 생성하는 스크립트"""
    
    # 배포에 포함할 파일들
    include_files = [
        # 필수 파일들
        'manifest.json',
        'privacy_policy.html',
        'LICENSE',
        
        # 아이콘들
        'icons/icon_16.png',
        'icons/icon_32.png', 
        'icons/icon_48.png',
        'icons/icon_128.png',
        
        # 소스 코드
        'src/background.js',
        'src/chzzk_content.js',
        'src/soop_content.js',
        'src/soop_vod_finder_content.js',
        'src/settings.html',
        'src/settings.js',
        
        # 공통 모듈
        'src/common/class_loader.js',
        'src/common/log_manager.js',
        'src/common/settings_manager.js',
        
        # 모듈들
        'src/module/base_panel.js',
        'src/module/chzzk_sync_panel.js',
        'src/module/chzzk_timestamp_manager.js',
        'src/module/chzzk_vod_finder.js',
        'src/module/chzzk_vod_linker.js',
        'src/module/rp_nickname_panel.js',
        'src/module/soop_streamer_id_manager.js',
        'src/module/soop_sync_panel.js',
        'src/module/soop_timestamp_manager.js',
        'src/module/soop_vod_finder.js',
        'src/module/soop_vod_linker.js',
        'src/module/timestamp_manager.js',
        
        # 데이터 파일
        'data/rp_nicknames.json',
    ]
    
    # 제외할 파일/폴더들
    exclude_patterns = [
        'data_processing/',
        'doc/',
        'icons/generate_sync_icons_v7.py',
        'screenshots/resize_',
        'README_tempermonkey.md',
        'build_extension.py',
        '.git/',
        '.gitignore',
        '*.py',
        '*.md',
        '*.txt',
        '*.log',
        '__pycache__/',
        '.DS_Store',
        'Thumbs.db'
    ]
    
    # manifest.json에서 버전 정보 읽기
    try:
        with open('manifest.json', 'r', encoding='utf-8') as f:
            manifest = json.load(f)
            version = manifest.get('version', '1.0.0')
            name = manifest.get('name', 'VOD-Synchronizer')
    except Exception as e:
        print(f"❌ manifest.json 읽기 실패: {e}")
        return False
    
    # 출력 파일명 생성
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_filename = f"{name.replace(' ', '-')}_v{version}_{timestamp}.zip"
    
    print(f"🚀 VOD Synchronizer 배포용 ZIP 생성 시작...")
    print(f"📦 파일명: {zip_filename}")
    print(f"📋 버전: {version}")
    print()
    
    # ZIP 파일 생성
    try:
        with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
            added_files = 0
            added_file_set = set()  # 중복 방지를 위한 set
            
            for file_path in include_files:
                if os.path.exists(file_path):
                    # ZIP에 추가
                    zipf.write(file_path, file_path)
                    added_files += 1
                    added_file_set.add(file_path)
                    print(f"✅ 추가: {file_path}")
                else:
                    print(f"⚠️  파일 없음: {file_path}")
            
            print()
            print(f"📊 총 {added_files}개 파일이 ZIP에 포함되었습니다.")
            
    except Exception as e:
        print(f"❌ ZIP 파일 생성 실패: {e}")
        return False
    
    # 파일 크기 확인
    zip_size = os.path.getsize(zip_filename)
    zip_size_mb = zip_size / (1024 * 1024)
    
    print(f"📏 ZIP 파일 크기: {zip_size_mb:.2f} MB")
    print(f"✅ 배포용 ZIP 파일이 생성되었습니다: {zip_filename}")
    
    # Chrome Web Store 업로드 안내
    print()
    print("🌐 Chrome Web Store 업로드 안내:")
    print("1. https://chrome.google.com/webstore/devconsole/ 접속")
    print("2. '새 항목' 또는 기존 항목 선택")
    print("3. ZIP 파일 업로드")
    print("4. 스토어 정보 입력 후 제출")
    
    return True

def main():
    """메인 함수"""
    print("=" * 60)
    print("VOD Synchronizer Chrome Extension Build Script")
    print("=" * 60)
    
    # 현재 디렉토리 확인
    if not os.path.exists('manifest.json'):
        print("❌ manifest.json 파일을 찾을 수 없습니다.")
        print("   이 스크립트를 프로젝트 루트 디렉토리에서 실행해주세요.")
        return
    
    # 빌드 실행
    success = create_build_script()
    
    if success:
        print()
        print("🎉 빌드가 성공적으로 완료되었습니다!")
    else:
        print()
        print("💥 빌드 중 오류가 발생했습니다.")

if __name__ == "__main__":
    main()
