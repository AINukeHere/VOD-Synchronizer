#!/usr/bin/env python3
"""
VOD Synchronizer Chrome Extension Local Test Script
로컬에서 확장 프로그램을 테스트하기 위한 스크립트입니다.
"""

import os
import zipfile
import shutil
import json
from pathlib import Path

def create_test_extension():
    """로컬 테스트용 확장 프로그램 폴더 생성"""
    
    # 테스트용 폴더명
    test_folder = "VOD-Synchronizer-Test"
    
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
    
    # manifest.json에서 버전 정보 읽기
    try:
        with open('manifest.json', 'r', encoding='utf-8') as f:
            manifest = json.load(f)
            version = manifest.get('version', '1.0.0')
            name = manifest.get('name', 'VOD-Synchronizer')
    except Exception as e:
        print(f"❌ manifest.json 읽기 실패: {e}")
        return False
    
    print(f"🧪 VOD Synchronizer 로컬 테스트용 폴더 생성 시작...")
    print(f"📁 폴더명: {test_folder}")
    print(f"📋 버전: {version}")
    print()
    
    # 기존 테스트 폴더가 있으면 삭제
    if os.path.exists(test_folder):
        shutil.rmtree(test_folder)
        print(f"🗑️  기존 테스트 폴더 삭제: {test_folder}")
    
    # 테스트 폴더 생성
    os.makedirs(test_folder, exist_ok=True)
    
    # 파일 복사
    copied_files = 0
    for file_path in include_files:
        if os.path.exists(file_path):
            # 대상 경로 생성
            dest_path = os.path.join(test_folder, file_path)
            dest_dir = os.path.dirname(dest_path)
            
            # 디렉토리 생성
            os.makedirs(dest_dir, exist_ok=True)
            
            # 파일 복사
            shutil.copy2(file_path, dest_path)
            copied_files += 1
            print(f"✅ 복사: {file_path}")
        else:
            print(f"⚠️  파일 없음: {file_path}")
    
    print()
    print(f"📊 총 {copied_files}개 파일이 테스트 폴더에 복사되었습니다.")
    print(f"✅ 테스트용 폴더가 생성되었습니다: {test_folder}")
    
    # Chrome 확장 프로그램 로드 안내
    print()
    print("🔧 Chrome 확장 프로그램 로드 방법:")
    print("1. Chrome 브라우저에서 chrome://extensions/ 접속")
    print("2. 우측 상단의 '개발자 모드' 활성화")
    print("3. '압축해제된 확장 프로그램을 로드합니다' 클릭")
    print(f"4. '{test_folder}' 폴더 선택")
    print("5. 확장 프로그램이 로드되면 테스트 시작!")
    
    # 테스트 시나리오 안내
    print()
    print("🧪 테스트 시나리오:")
    print("1. SOOP VOD 페이지에서 타임스탬프 표시 확인")
    print("2. 시간 수정 후 엔터로 이동 테스트")
    print("3. 스트리머 검색 후 Find VOD 버튼 테스트")
    print("4. 치지직 VOD에서 SOOP 동기화 테스트")
    print("5. RP 패널 기능 테스트")
    
    return True

def main():
    """메인 함수"""
    print("=" * 60)
    print("VOD Synchronizer Chrome Extension Local Test Script")
    print("=" * 60)
    
    # 현재 디렉토리 확인
    if not os.path.exists('manifest.json'):
        print("❌ manifest.json 파일을 찾을 수 없습니다.")
        print("   이 스크립트를 프로젝트 루트 디렉토리에서 실행해주세요.")
        return
    
    # 테스트 폴더 생성
    success = create_test_extension()
    
    if success:
        print()
        print("🎉 테스트 준비가 완료되었습니다!")
        print("   이제 Chrome에서 확장 프로그램을 로드하여 테스트하세요.")
    else:
        print()
        print("💥 테스트 준비 중 오류가 발생했습니다.")

if __name__ == "__main__":
    main()
