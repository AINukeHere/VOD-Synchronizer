# VOD Synchronizer

VOD Synchronizer는 SOOP VOD(다시보기) 시청 시 생방송 보듯이 다른 스트리머의 시점이나 채팅이 궁금할때 다른 스트리머의 VOD를 찾아서 볼 수 있게 해주는 크롬 확장 프로그램입니다. 

## 주요 기능

### SOOP Full 영상 다시보기 페이지에서 동작합니다.
- 우측 하단에 영상재생시점기준 당시의 시간을 보여줍니다. 
- 이 시간을 바꿔 입력하면 그 시간에 맞게 VOD의 재생시점을 바꿔서 **새로고침**합니다.
- SOOP 검색창에 스트리머를 검색하면 검색결과에 Find VOD 버튼이 생기고 버튼을 누르면 해당 스트리머의 VOD에서 현재 재생 시점과 동일한 시점의 VOD를 찾아 새 탭에서 열어줍니다. (최초 실행 시 팝업 허용이 필요할 수 있습니다.)

### CHZZK VOD 페이지에서도 동작합니다.
- 우측 하단에 영상재생시점기준 당시의 시간을 보여줍니다.
- 이 시간을 바꿔 입력하면 그 시간에 맞게 VOD의 재생시점을 바꿔서 **새로고침**합니다.
- 우측 파란색 버튼을 클릭하면 SOOP 스트리머를 검색하여 동기화할 수 있습니다.

#### 더 자세한 내용은 [아래 사용 예시](#사용-예시)을 참고하세요.

## 설치 방법

### 방법 1: GitHub에서 다운로드 (권장)
1. [이 저장소](https://github.com/AINukeHere/VOD-Synchronizer)의 우측 상단에 있는 초록색 "Code" 버튼을 클릭합니다.
2. "Download ZIP"을 선택하여 파일을 다운로드합니다.
3. 다운로드한 ZIP 파일을 원하는 위치에 압축을 풉니다.
4. 크롬 브라우저에서 확장 프로그램 관리(chrome://extensions)로 이동합니다.
5. 우측 상단의 "개발자 모드"를 활성화합니다.
6. "압축해제된 확장 프로그램을 로드합니다" 버튼을 클릭하고, 압축을 푼 폴더를 선택합니다.

### 방법 2: TemperMonkey를 사용하는 경우
1. [https://greasyfork.org/ko/scripts/541829-vod-synchronizer](https://greasyfork.org/ko/scripts/541829-vod-synchronizer)에서 스크립트를 설치하세요.


## 사용 예시

### SOOP VOD
SOOP VOD 플레이어 페이지에 접속하면 확장 프로그램이 자동으로 활성화됩니다.
<br/> 예시 영상<br/> 
[![Video Label](https://img.youtube.com/vi/mipj1jn488M/0.jpg)](https://youtu.be/mipj1jn488M)

### CHZZK VOD
CHZZK VOD 플레이어 페이지에서도 동일하게 동작합니다. 우측 파란색 버튼을 클릭하여 SOOP 스트리머와 동기화할 수 있습니다.

## 지원 사이트
- **SOOP**: https://www.sooplive.co.kr, https://ch.sooplive.co.kr, https://vod.sooplive.co.kr
- **CHZZK**: https://chzzk.naver.com


## 지원 플랫폼

### SOOP (완전 지원)
- VOD 타임스탬프 표시 및 편집
- 다른 스트리머 VOD 동기화
- RP 닉네임 패널

### CHZZK (완전 지원)
- VOD 타임스탬프 표시 및 편집
- SOOP 스트리머 VOD 동기화
- RP 닉네임 패널

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
│   ├── rp_nicknames.json        # RP 닉네임 데이터
│   └── rp_nicknames_old.json   # 이전 RP 닉네임 데이터
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

### 동작 원리

#### 1. 타임스탬프 표시
- Full 영상 페이지에서 제공하는 스트리밍 시작시간과 영상 재생시간을 참고하여 타임스탬프를 계산하여 표시합니다. (날짜에 마우스 올리면 표시되는 그것)

#### 2. 타임스탬프를 수정하여 재생시점 업데이트
- 수정된 타임스탬프에 맞는 재생시점(Full 영상 기준 재생시간)을 계산하여 재생시간을 포함한 링크로 페이지를 새로 엽니다. (vod 공유 링크에 들어가는 change_second(재생시점) 파라미터)

#### 3. 다른 스트리머 VOD와의 동기화

**SOOP 동기화**:
- **한줄요약**: 스트리머를 검색하여 방송국에 들어가서 VOD리스트를 날짜로 검색해서 들어가본다음 스트리밍 시간을 확인함.
<br/><br/>
- **구체적인 방법**: 검색한 스트리머 닉네임을 가지고 페이지 내 보이지 않는 iframe에서 스트리머를 검색하여 스트리머의 ID를 찾은 뒤 해당 스트리머 채널의 다시보기 검색을 하여 업로드 일자를 확인하여 가능성 있는 VOD를 새 탭에서 엽니다. 각 탭은 FindVOD 버튼을 눌렀을 때의 재생 시점 타임스탬프가 각 스트리밍 기간안에 포함되는지를 체크하여 포함되지 않는 탭은 자동으로 닫힙니다.

**CHZZK 동기화**:
- CHZZK VOD에서 SOOP 스트리머를 검색하여 동기화 가능한 VOD를 찾습니다.
- 비공식 CHZZK API를 사용하여 스트리머 검색 및 VOD 목록을 가져옵니다.

## QnA
### 1. 이거 안전한거에요? 원리가 뭐에요
그냥 사람이 해야하는 일 자동화한겁니다.

### 2. 다시보기를 지우거나 해당 시간대의 VOD가 없으면 어떡해요?
당연히 못 보는거죠 뭐. 없는걸 만들거나 다시보기를 저장해두는 서버가 있는 게  아니라 그냥 사용자 계정으로 대신 검색해주는 기능일 뿐입니다.

## 알려진 문제
- 스트리밍에 문제가 있어 다시보기 영상 자체가 중간에 편집된 경우 동기화가 어긋날 수 있습니다.
- 한달 동안 다시보기가 60개가 넘는 경우 페이지가 넘어가서 못찾을 수도 있습니다.
- CHZZK 동기화 시 너무 빠른 요청을 하면 네이버에서 조치를 취할 수 있습니다.

## 업데이트 내역
### 0.0.9.3 (현재 버전)
- CHZZK 동기화 기능 개선 및 안정성 향상
- 타임스탬프 툴팁 투명화 기능 개선
- iframe 통신 프로토콜 최적화
- 에러 처리 및 로깅 시스템 개선

### 0.0.9
- CHZZK 동기화를 지원합니다. 다시보기를 시청할때 치지직 기본 검색창에 스트리머를 검색하면 Find VOD 버튼이 생성됩니다. 누르면 동기화가능한 VOD를 찾습니다.<br/>
**<code>주의사항: chzzk은 다시보기를 기간을 지정하여 검색하는 기능이 없으므로 실제시간과 동기화를 요청한 시간의 차이가 크면 시간이 조금 소요될 수 있습니다.<br/>또한 비공식 치지직 api를 사용하므로 치지직 스트리머와 동기화를 너무 빠르게 시도하는 경우 네이버에서 조치를 취할 수 있습니다.</code>**
- CHZZK VOD 플레이어페이지에서 SOOP 스트리머를 검색하여 동기화할 수 있습니다. 우측 파란 버튼을 눌러 사용할 수 있습니다.
- 키보드 마우스 입력이 2초이상 없거나 마우스가 페이지 밖을 벗어나면 타임스탬프 툴팁이 거의 투명화됩니다.
### 0.0.8
- 정식 배포됨

### TemperMonkey 스크립트
- **버전 0.1.1**: GreasyFork에서 제공되는 사용자 스크립트 버전
## 라이선스

이 프로젝트는 MIT 라이선스를 따릅니다. 자세한 내용은 `LICENSE` 파일을 참고하세요. 