## 프로젝트 구조

```
VOD-Synchronizer/
├── src/
│   ├── common/           # 공통 유틸리티
│   │   ├── class_loader.js      # 동적 클래스 로딩 시스템
│   │   ├── log_manager.js       # 로그 관리
│   │   └── settings_manager.js  # 설정 관리
│   ├── module/           # 핵심 기능 모듈
│   │   ├── base_panel.js        # 패널 기본 클래스
│   │   ├── timestamp_manager.js # 타임스탬프 관리 기본 클래스
│   │   ├── soop_timestamp_manager.js    # SOOP 타임스탬프 관리
│   │   ├── soop_sync_panel.js          # SOOP 동기화 패널
│   │   ├── soop_streamer_id_manager.js # SOOP 스트리머 ID 관리
│   │   ├── soop_vod_finder.js          # SOOP VOD 검색
│   │   ├── soop_vod_linker.js          # SOOP VOD 링킹
│   │   ├── chzzk_timestamp_manager.js  # CHZZK 타임스탬프 관리
│   │   ├── chzzk_sync_panel.js         # CHZZK 동기화 패널
│   │   ├── chzzk_vod_finder.js         # CHZZK VOD 검색
│   │   ├── chzzk_vod_linker.js         # CHZZK VOD 링킹
│   │   └── rp_nickname_panel.js        # RP 닉네임 패널
│   ├── soop_content.js          # SOOP 페이지용 content script
│   ├── chzzk_content.js         # CHZZK 페이지용 content script
│   ├── soop_vod_finder_content.js      # SOOP VOD 검색용 iframe content script
│   ├── content.user.js          # TemperMonkey 사용자 스크립트
│   ├── settings.html            # 설정 페이지
│   ├── settings.js              # 설정 관리 스크립트
│   └── background.js            # 백그라운드 서비스 워커
├── data/                 # 데이터 파일
│   └── rp_nicknames.json        # RP 닉네임 데이터
├── doc/                  # 문서
│   └── communication_flow.md    # 통신 흐름 문서
├── manifest.json         # 확장 프로그램 매니페스트
└── LICENSE               # MIT 라이선스
```

### 핵심 아키텍처
- **모듈화된 설계**: 각 플랫폼별로 독립적인 구현체를 가짐
- **동적 클래스 로딩**: 필요한 클래스만 필요할 때 로드하여 메모리 효율성 향상
- **상속 기반 구조**: 공통 기능은 기본 클래스에서, 플랫폼별 특성은 파생 클래스에서 구현
- **iframe 통신 시스템**: 크로스 플랫폼 동기화를 위한 안전한 통신 프로토콜
- **설정 기반 기능 제어**: 사용자 설정에 따라 기능 활성화/비활성화

## 계획중인 추가 기능
- 추가 스트리밍 플랫폼 지원
- 고급 동기화 옵션

## 아키텍처 및 원리

### 기술적 구조
이 확장 프로그램은 모듈화된 클래스 기반 아키텍처를 사용합니다:

- **BaseTimestampManager**: 타임스탬프 관리의 기본 클래스
- **BaseSyncPanel**: 동기화 패널의 기본 클래스  
- **ClassLoader**: 동적 클래스 로딩 시스템
- **플랫폼별 구현**: SOOP과 CHZZK 각각에 대한 전용 매니저 클래스


# 로직 도식화
[communication_flow.md](./communication_flow.md)