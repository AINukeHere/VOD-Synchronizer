#!/usr/bin/env python3
"""
VOD Master Chrome Extension Build Script
배포용 ZIP 파일과 테스트용 폴더를 생성하는 통합 스크립트입니다.
"""

import os
import zipfile
import shutil
import json
import sys
import re
from datetime import datetime
from pathlib import Path

def extract_class_definition(file_path, class_name):
    """
    모듈 파일에서 클래스 정의를 추출합니다.
    export와 import 문을 제거하고 클래스 정의만 반환합니다.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # import 문 제거
        content = re.sub(r'^import\s+.*?from\s+["\'].*?["\'];?\s*$', '', content, flags=re.MULTILINE)
        
        # export 키워드 제거
        content = re.sub(r'export\s+', '', content)
        
        # base_timestamp_manager.js의 const isChromeExtension = true; 제거 (템플릿에서 false로 설정됨)
        if 'base_timestamp_manager.js' in file_path:
            content = re.sub(r'const\s+isChromeExtension\s*=\s*true;?\s*', '', content)
        
        # SoopTimestampManager의 const MAX_DURATION_DIFF 제거 (템플릿에서 별도 정의됨)
        if 'soop_timestamp_manager.js' in file_path:
            content = re.sub(r'const\s+MAX_DURATION_DIFF\s*=\s*30\*1000;?\s*', '', content)
        
        # 빈 줄 정리
        content = re.sub(r'\n\s*\n\s*\n', '\n\n', content)
        content = content.strip()
        
        return content
    except Exception as e:
        print(f"❌ 클래스 정의 추출 실패 ({file_path}): {e}")
        return None

def sync_content_user_template_version_from_manifest(
    template_path='src/content.user.template.js',
    manifest_path='manifest.json',
):
    """
    content.user.template.js UserScript 헤더의 @version을 manifest.json의 version과 맞춥니다.
    값이 다를 때만 템플릿 파일을 덮어씁니다.
    """
    if not os.path.exists(manifest_path):
        print(f"❌ manifest.json을 찾을 수 없습니다: {manifest_path}")
        return False
    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
        version = manifest.get('version')
        if not version or not str(version).strip():
            print("❌ manifest.json에 유효한 version이 없습니다.")
            return False
        version = str(version).strip()
    except Exception as e:
        print(f"❌ manifest.json 읽기 실패: {e}")
        return False

    if not os.path.exists(template_path):
        print(f"⚠️  템플릿 파일을 찾을 수 없습니다: {template_path}")
        return False

    try:
        with open(template_path, 'r', encoding='utf-8') as f:
            content = f.read()
        new_content, n_subs = re.subn(
            r'^// @version\s+\S+.*$',
            f'// @version      {version}',
            content,
            count=1,
            flags=re.MULTILINE,
        )
        if n_subs == 0:
            print(f"❌ {template_path}에서 // @version 줄을 찾을 수 없습니다.")
            return False
        if new_content != content:
            with open(template_path, 'w', encoding='utf-8', newline='\n') as f:
                f.write(new_content)
            abs_tpl = os.path.abspath(template_path)
            print(f"✅ 템플릿 @version을 manifest와 동기화: {version}")
            print(f"   (저장됨: {abs_tpl})")
        return True
    except Exception as e:
        print(f"❌ 템플릿 버전 동기화 실패: {e}")
        return False

def build_tampermonkey_script():
    """
    manifest 버전으로 content.user.template.js의 @version을 맞춘 뒤,
    클래스 정의를 삽입하여 content.user.js를 생성합니다.
    """
    template_path = 'src/content.user.template.js'
    output_path = 'src/content.user.js'
    
    if not os.path.exists(template_path):
        print(f"⚠️  템플릿 파일을 찾을 수 없습니다: {template_path}")
        return False
    
    try:
        if not sync_content_user_template_version_from_manifest(template_path):
            return False

        with open(template_path, 'r', encoding='utf-8') as f:
            template = f.read()
        
        # 클래스 정의 매핑
        class_mappings = {
            '{{IVodSync}}': ('src/module/interface4log.js', 'IVodSync'),
            '{{SoopAPI}}': ('src/module/soop_api.js', 'SoopAPI'),
            '{{TimestampManagerBase}}': ('src/module/base_timestamp_manager.js', 'TimestampManagerBase'),
            '{{SoopTimestampManager}}': ('src/module/soop_timestamp_manager.js', 'SoopTimestampManager'),
            '{{VODLinkerBase}}': ('src/module/base_vod_linker.js', 'VODLinkerBase'),
            '{{SoopVODLinker}}': ('src/module/soop_vod_linker.js', 'SoopVODLinker'),
            '{{TimelineCommentProcessorBase}}': ('src/module/base_timeline_comment_processor.js', 'TimelineCommentProcessorBase'),
            '{{SoopTimelineCommentProcessor}}': ('src/module/soop_timeline_comment_processor.js', 'SoopTimelineCommentProcessor'),
            '{{ChzzkTimelineCommentProcessor}}': ('src/module/chzzk_timeline_comment_processor.js', 'ChzzkTimelineCommentProcessor'),
            '{{SoopPrevChatViewer}}': ('src/module/soop_prev_chat_viewer.js', 'SoopPrevChatViewer'),
            # '{{SoopVeditorReplacement}}': ('src/module/soop_veditor_replacement.js', 'SoopVeditorReplacement'),
        }
        
        # 각 플레이스홀더를 실제 클래스 정의로 교체
        for placeholder, (file_path, class_name) in class_mappings.items():
            if placeholder in template:
                class_def = extract_class_definition(file_path, class_name)
                if class_def:
                    template = template.replace(placeholder, class_def)
                    print(f"✅ 클래스 삽입: {class_name}")
                else:
                    print(f"⚠️  클래스 정의를 찾을 수 없습니다: {class_name}")
                    return False
        
        # 결과 파일 저장
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(template)
        
        print(f"✅ TamperMonkey 스크립트 생성 완료: {output_path}")
        return True
        
    except Exception as e:
        print(f"❌ TamperMonkey 스크립트 생성 실패: {e}")
        return False

def create_test_extension():
    """로컬 테스트용 확장 프로그램 폴더 생성"""
    
    # 테스트용 폴더명
    test_folder = "VOD-Master-Test"
    
    # 배포에 포함할 파일들
    include_files = [
        # 필수 파일들
        'manifest.json',
        'LICENSE',
        
        # 아이콘들
        'icons/icon_16.png',
        'icons/icon_32.png', 
        'icons/icon_48.png',
        'icons/icon_128.png',
        
        # 소스 코드
        'src/background/settings_manager.js',
        'src/background/background.js',
        'src/chzzk_content.js',
        'src/soop_content.js',
        'src/settings.html',
        'src/settings.js',
        
        # 공통 모듈
        'src/common/class_loader.js',
        'src/common/log_manager.js',
        
        # 모듈들
        'src/module/interface4log.js',
        'src/module/base_vod_linker.js',
        'src/module/base_timestamp_manager.js',
        'src/module/soop_api.js',
        'src/module/chzzk_api.js',
        'src/module/soop_timestamp_manager.js',
        'src/module/chzzk_timestamp_manager.js',
        'src/module/soop_vod_linker.js',
        'src/module/chzzk_vod_linker.js',
        'src/module/other_platform_sync_panel.js',
        'src/module/rp_nickname_panel.js',
        'src/module/soop_prev_chat_viewer.js',
        'src/module/base_timeline_comment_processor.js',
        'src/module/soop_timeline_comment_processor.js',
        'src/module/chzzk_timeline_comment_processor.js',
        # 'src/module/soop_veditor_replacement.js',
        # 'src/module/soop_vodcore_page_bridge.js',
        
        # 리소스 파일
        'res/data/rp_nicknames.json',
        'res/img/broadcastSync.png',
        'res/img/AddCurrentTime.png',
    ]
    
    # manifest.json에서 버전 정보 읽기
    try:
        with open('manifest.json', 'r', encoding='utf-8') as f:
            manifest = json.load(f)
            version = manifest.get('version', '1.0.0')
            name = manifest.get('name', 'VOD-Master')
    except Exception as e:
        print(f"❌ manifest.json 읽기 실패: {e}")
        return False
    
    print(f"🧪 VOD Master 로컬 테스트용 폴더 생성 시작...")
    print(f"📁 폴더명: {test_folder}")
    print(f"📋 버전: {version}")
    print()
    
    # TamperMonkey 스크립트 생성
    print("📝 TamperMonkey 스크립트 생성 중...")
    if not build_tampermonkey_script():
        print("⚠️  TamperMonkey 스크립트 생성 실패, 계속 진행합니다...")
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
    
    return True

def create_build_zip():
    """테스트 폴더를 기반으로 배포용 ZIP 파일을 생성하는 스크립트"""
    
    test_folder = "VOD-Master-Test"
    
    if not os.path.exists(test_folder):
        print(f"❌ 테스트 폴더를 찾을 수 없습니다: {test_folder}")
        print("   먼저 테스트 폴더를 생성해주세요.")
        return False
    
    # manifest.json에서 버전 정보 읽기
    try:
        with open(os.path.join(test_folder, 'manifest.json'), 'r', encoding='utf-8') as f:
            manifest = json.load(f)
            version = manifest.get('version', '1.0.0')
            name = manifest.get('name', 'VOD-Master')
    except Exception as e:
        print(f"❌ manifest.json 읽기 실패: {e}")
        return False
    
    # 출력 파일명 생성
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_filename = f"{name.replace(' ', '-')}_v{version}_{timestamp}.zip"
    
    print(f"🚀 VOD Master 배포용 ZIP 생성 시작...")
    print(f"📦 파일명: {zip_filename}")
    print(f"📋 버전: {version}")
    print(f"📁 소스 폴더: {test_folder}")
    print()
    
    # ZIP 파일 생성
    try:
        with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
            added_files = 0
            
            # 테스트 폴더의 모든 파일을 ZIP에 추가 (최상위 폴더 제외)
            for root, dirs, files in os.walk(test_folder):
                for file in files:
                    file_path = os.path.join(root, file)
                    # ZIP에 추가 (테스트용 디렉토리 경로 제거)
                    zip_path = file_path.replace(f'{test_folder}/', '')
                    zipf.write(file_path, zip_path)
                    added_files += 1
                    print(f"✅ 추가: {zip_path}")
            
            print()
            print(f"📊 총 {added_files}개 파일이 배포용 ZIP에 포함되었습니다.")
            
    except Exception as e:
        print(f"❌ 배포용 ZIP 파일 생성 실패: {e}")
        return False
    
    # 파일 크기 확인
    zip_size = os.path.getsize(zip_filename)
    zip_size_mb = zip_size / (1024 * 1024)
    
    print(f"📏 배포용 ZIP 파일 크기: {zip_size_mb:.2f} MB")
    print(f"✅ 배포용 ZIP 파일이 생성되었습니다: {zip_filename}")
    
    return True

def create_test_zip():
    """테스트용 폴더를 ZIP으로 압축"""
    
    test_folder = "VOD-Master-Test"
    
    if not os.path.exists(test_folder):
        print(f"❌ 테스트 폴더를 찾을 수 없습니다: {test_folder}")
        print("   먼저 테스트 폴더를 생성해주세요.")
        return False
    
    # manifest.json에서 버전 정보 읽기
    try:
        with open(os.path.join(test_folder, 'manifest.json'), 'r', encoding='utf-8') as f:
            manifest = json.load(f)
            version = manifest.get('version', '1.0.0')
            name = manifest.get('name', 'VOD-Master-Test')
    except Exception as e:
        print(f"❌ 테스트용 manifest.json 읽기 실패: {e}")
        return False
    
    # 출력 파일명 생성
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_filename = f"{name.replace(' ', '-')}_v{version}_{timestamp}.zip"
    
    print(f"🧪 VOD Master 테스트용 ZIP 생성 시작...")
    print(f"📦 파일명: {zip_filename}")
    print(f"📋 버전: {version}")
    print(f"📁 소스 폴더: {test_folder}")
    print()
    
    # ZIP 파일 생성
    try:
        with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
            added_files = 0
            
            # 테스트 폴더의 모든 파일을 ZIP에 추가
            for root, dirs, files in os.walk(test_folder):
                for file in files:
                    file_path = os.path.join(root, file)
                    # ZIP에 추가 (테스트용 디렉토리 경로 제거)
                    zip_path = file_path.replace(f'{test_folder}\\', '')
                    zipf.write(file_path, zip_path)
                    added_files += 1
                    print(f"✅ 추가: {zip_path}")
            
            print()
            print(f"📊 총 {added_files}개 파일이 테스트용 ZIP에 포함되었습니다.")
            
    except Exception as e:
        print(f"❌ 테스트용 ZIP 파일 생성 실패: {e}")
        return False
    
    # 파일 크기 확인
    zip_size = os.path.getsize(zip_filename)
    zip_size_mb = zip_size / (1024 * 1024)
    
    print(f"📏 테스트용 ZIP 파일 크기: {zip_size_mb:.2f} MB")
    print(f"✅ 테스트용 ZIP 파일이 생성되었습니다: {zip_filename}")
    
    return True

def show_help():
    """도움말 표시"""
    print("=" * 60)
    print("VOD Master Chrome Extension Build Script")
    print("=" * 60)
    print()
    print("사용법:")
    print("  python build_extension.py [옵션]")
    print()
    print("옵션:")
    print("  test         - 테스트용 폴더만 생성")
    print("  zip          - 배포용 ZIP 파일만 생성")
    print("  testzip      - 테스트용 폴더를 ZIP으로 압축")
    print("  tampermonkey - TamperMonkey용 content.user.js 파일만 생성")
    print("  all          - 테스트용 폴더 + 배포용 ZIP + 테스트용 ZIP 모두 생성 (기본값)")
    print("  help         - 이 도움말 표시")
    print()
    print("예시:")
    print("  python build_extension.py test         # 테스트용 폴더만 생성")
    print("  python build_extension.py zip          # 배포용 ZIP만 생성")
    print("  python build_extension.py testzip      # 테스트용 ZIP만 생성")
    print("  python build_extension.py tampermonkey # TamperMonkey 스크립트만 생성")
    print("  python build_extension.py all          # 모든 파일 생성")
    print("  python build_extension.py              # 모든 파일 생성 (기본값)")

def main():
    """메인 함수"""
    
    # 현재 디렉토리 확인
    if not os.path.exists('manifest.json'):
        print("❌ manifest.json 파일을 찾을 수 없습니다.")
        print("   이 스크립트를 프로젝트 루트 디렉토리에서 실행해주세요.")
        return
    
    # 명령행 인수 처리
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()
    else:
        command = "all"
    
    if command == "help":
        show_help()
        return
    
    print("=" * 60)
    print("VOD Master Chrome Extension Build Script")
    print("=" * 60)
    print(f"실행 모드: {command.upper()}")
    print()
    
    success = True
    
    if command == "tampermonkey":
        print("📝 TamperMonkey 스크립트 생성 중...")
        if not build_tampermonkey_script():
            success = False
        print()
    elif command in ["test", "all"]:
        print("1️⃣ 테스트용 폴더 생성 중...")
        if not create_test_extension():
            success = False
        print()
    
    if command in ["zip", "all"]:
        print("2️⃣ 배포용 ZIP 파일 생성 중...")
        if not create_build_zip():
            success = False
        print()
    
    if command in ["testzip", "all"]:
        print("3️⃣ 테스트용 ZIP 파일 생성 중...")
        if not create_test_zip():
            success = False
        print()
    
    if success:
        print("🎉 빌드가 성공적으로 완료되었습니다!")
        
        if command in ["test", "all"]:
            print()
            print("🔧 Chrome 확장 프로그램 로드 방법:")
            print("1. Chrome 브라우저에서 chrome://extensions/ 접속")
            print("2. 우측 상단의 '개발자 모드' 활성화")
            print("3. '압축해제된 확장 프로그램을 로드합니다' 클릭")
            print("4. 'VOD-Master-Test' 폴더 선택")
            print("5. 확장 프로그램이 로드되면 테스트 시작!")
        
        if command in ["zip", "all"]:
            print()
            print("🌐 Chrome Web Store 업로드 안내:")
            print("1. https://chrome.google.com/webstore/devconsole/ 접속")
            print("2. '새 항목' 또는 기존 항목 선택")
            print("3. ZIP 파일 업로드")
            print("4. 스토어 정보 입력 후 제출")
        
        if command in ["testzip", "all"]:
            print()
            print("🧪 테스트용 확장 프로그램 설치 안내:")
            print("1. Chrome 브라우저에서 chrome://extensions/ 접속")
            print("2. '개발자 모드' 활성화")
            print("3. '압축해제된 확장 프로그램을 로드합니다' 클릭")
            print("4. 생성된 ZIP 파일을 압축 해제한 폴더 선택")
            print("5. 또는 ZIP 파일을 직접 드래그 앤 드롭")
            print("6. ⚠️  주의: 테스트용 확장 프로그램은 개발/테스트 목적으로만 사용하세요.")
    else:
        print("💥 빌드 중 오류가 발생했습니다.")

if __name__ == "__main__":
    main()