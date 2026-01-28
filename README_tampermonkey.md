# VOD Synchronizer

VOD Synchronizer는 SOOP VOD(다시보기) 시청 시 생방송 보듯이 다른 스트리머의 시점이나 채팅이 궁금할때 다른 스트리머의 VOD를 찾아서 볼 수 있게 해주는 크롬 확장 프로그램입니다. **다른 스트리머의 시점을 빠르게 찾고싶으신 분들에게 제격입니다.**

## 주요 기능

### SOOP Full 영상 다시보기 페이지에서 동작합니다.
- 우측 하단에 영상재생시점기준 당시의 시간을 보여줍니다. 
- 이 시간을 바꿔 입력하면 그 시간에 맞게 VOD의 재생시점을 바꿔서 **새로고침**합니다.
- **SOOP 검색창에 스트리머를 검색하면 검색결과에 Sync VOD 버튼이 생기고 버튼을 누르면 해당 스트리머의 VOD에서 현재 재생 시점과 동일한 시점의 VOD를 찾아 새 탭에서 열어줍니다. (최초 실행 시 팝업 허용이 필요할 수 있습니다.)**

#### 더 자세한 내용은 [아래 데모 영상](#데모-영상)을 참고하세요.

## 설치 방법

### 방법 1: Chrome Web Store에서 설치 (개별 확장프로그램으로 설치)
1. [Chrome Web Store](https://chromewebstore.google.com/detail/vod-synchronizer/fcgefghffdkgllcmgbckhiebjgcdppme)에서 VOD Synchronizer를 설치하세요.
2. "Chrome에 추가" 버튼을 클릭하여 설치를 완료하세요.

### 방법 2: TamperMonkey를 사용하는 경우
1. Tampermonkey 설치
2. 확장 프로그램 관리에서 Tampermonkey 세부정보 --> 사용자 스크립트 허용을 활성화하세요.
3. [https://greasyfork.org/ko/scripts/541829-vod-synchronizer](https://greasyfork.org/ko/scripts/541829-vod-synchronizer)에서 스크립트를 설치하세요.


## 데모 영상
참고: SOOP VOD 플레이어 페이지에 접속하면 확장 프로그램이 자동으로 활성화됩니다.<br/>
[![데모 영상](https://img.youtube.com/vi/mipj1jn488M/0.jpg)](https://youtu.be/mipj1jn488M)


## QnA
### 1. 이거 안전한거에요? 원리가 뭐에요
ㅖ. 그냥 사람이 해야하는 일 자동화한겁니다.

### 2. 다시보기를 지우거나 해당 시간대의 VOD가 없으면 어떡해요?
당연히 못 보는거죠 뭐. 없는걸 만들거나 다시보기를 저장해두는 서버가 있는 게  아니라 그냥 사용자 계정으로 대신 검색해주는 기능일 뿐입니다.

### 3. Sync VOD 버튼을 눌렀는데 탭이 1개만 나오고 바로 닫혀요.
주소 표시줄에 팝업 차단 표시가 있나요? 팝업을 허용해주세요.

## 알려진 문제
- 아직은 없는 것 같군요.

## 업데이트 내역
### 1.4.0
- [SOOP 새 기능] 이전 채팅 내역 복원
  - VOD를 재생한 시점의 이전 채팅 내역을 불러올 수 있습니다.
  - 복원 구간을 설정할 수 있습니다. (기본 30초)
  - 복원 버튼에 커서를 올리면 다음 복원 구간이 표시됩니다.
  - 채팅 내 시그니처 이모티콘과 기본 이모티콘, ogq가 지원됩니다.
  - 최대한 데이터를 분석하여 구독 이모티콘, 팬클럽 열혈팬 서포터 매니저 뱃지가 알맞게 표시되도록 했지만 제 나름대로 분석한거라 사실과 다를 수 있습니다. 스트리머 채팅은 아직 분석하지 않아서 정상적으로 표시되지 않을 것입니다.(닉네임과 채팅은 올바르게 표시됩니다)<br/>

  ![](https://raw.githubusercontent.com/AINukeHere/VOD-Synchronizer/main/screenshots/prevChatViewer.png)  |  ![](https://raw.githubusercontent.com/AINukeHere/VOD-Synchronizer/main/screenshots/prevChatViewer-restored.png) | ![](https://raw.githubusercontent.com/AINukeHere/VOD-Synchronizer/main/screenshots/prevChatViewer-setting.png)
:-------------------------:|:-------------------------:|:-------------------------:
이전 채팅 복원 버튼            |  이전 채팅 복원 후 | 이전 채팅 복원 설정

- 타임스탬프와 전역 동기화 버튼의 위치가 우 하단 고정에서 vod 플레이어 재생 바 중간으로 변경되었으며 입력이 없을 때 완전히 투명해집니다.

SOOP에서의 타임스탬프 위치 | ![](https://raw.githubusercontent.com/AINukeHere/VOD-Synchronizer/main/screenshots/new_timestamp_position_soop.png)
:-------------------------:|:-------------------------:
CHZZK에서의 타임스탬프 위치 | ![](https://raw.githubusercontent.com/AINukeHere/VOD-Synchronizer/main/screenshots/new_timestamp_position_chzzk.png)

- 이제 동기화 성공 시 검색창을 깔끔하게 정리합니다.

- 버전 넘버링을 Chrome Web Store 버전과 일치시켰습니다.

### 0.4.3
- 편의성 개선: 검색창에 동기화 대상 스트리머를 입력하고 Ctrl+Shift+Enter를 누르면 첫 번째 SyncVOD 버튼을 자동으로 클릭합니다.
- 타임스탬프 부분에 커서를 올리면 도움말 툴팁을 띄웁니다.
- 이제 타임스탬프 수정 시 방향키를 눌러도 vod의 앞/뒤로 가기 기능이 동작하지 않습니다.
- 타임스탬프 텍스트를 복사할 때 텍스트데이터만 복사됩니다. (배경,글자 색상 X)

### 0.4.2
- 이제 SyncVOD 버튼을 누르고 동기화 가능한 다시보기가 발견되면 자동으로 검색영역이 닫힙니다.
- VOD가 없는 상태에서 동기화를 시도할 수 있었던 문제를 수정했습니다.

### 0.4.1
- 전역 동기화 버튼 이미지가 누락되는 문제를 수정했습니다.

### 0.4.0
- 전역 동기화 버튼이 추가되었습니다. 해당 VOD를 기준으로 나머지 열려있는 VOD들을 동기화합니다.

![전역 동기화 버튼](https://raw.githubusercontent.com/AINukeHere/VOD-Synchronizer/main/screenshots/broadcastSync.png)

- SOOP의 타임스탬프를 방송시간 외의 시간으로 설정할 수 있던 문제를 수정했습니다.

### 0.3.4
- 타임스탬프를 방송시간 외의 시간으로 설정할 수 있던 문제를 수정했습니다.

### 0.3.3
- 이제 다른 웹 사이트에 첨부된 vod에서는 동작하지 않습니다.

### 0.3.2
- SOOP의 파생된 VOD(클립, 캐치)에서 타임스탬프를 수정하여 특정시간대로 이동하는 기능이 제대로 동작하지 않던 문제를 수정했습니다.
- 간단한 반복 재생 설정 기능을 추가했습니다. VOD 플레이어의 설정을 누르면 반복 재생 메뉴가 추가됩니다.

![반복 재생 기능](https://raw.githubusercontent.com/AINukeHere/VOD-Synchronizer/main/screenshots/loop_playing.png)

### 0.3.1
- 동기화된 SOOP 다시보기가 열리고 재생되는 시간이 조?금 단축되었을 수도 있습니다.
- 편집된 다시보기를 동기화할때 제대로 계산하여 동기화하지 못하던 문제를 수정했습니다.
- 업로드된 VOD에서 동기화를 시도하는 경우 에러가 발생하는 문제를 수정했습니다.

### 0.3.0
- 스트리머와의 동기화 속도가 개선되고 더 이상 여러 탭이 열리지 않고 동기화 가능한 다시보기만 열립니다.
- 타임스탬프를 수정하면 더이상 페이지가 새로고침되지 않고 즉시 해당 시점으로 점프합니다.
- 이제 SOOP의 클립, 캐치도 연결된 원본 다시보기가 존재한다면 라이브 당시 시간을 표시합니다. 다만 SOOP 자체의 문제점으로 수초의 오차가 발생할 수 있습니다.
- 이제 같이보기 등으로 편집된 SOOP 다시보기도 라이브 당시 시간을 정상적으로 표시합니다. (잘 안되면 제보바람)
- 버튼 텍스트가 FindVOD에서 SyncVOD로 변경되었습니다.

### 0.2.2
- 더 이상 사용되지 않는 SOOP 방송국 도메인을 제거했습니다. (ch.sooplive.co.kr)
- 방송국 UI 마이너 업데이트로 인해 동기화가 동작하지 않던 문제를 해결했습니다.
- 이제 SOOP 동기화 시 검색결과에 따라 추가 검색을 시도합니다.

### 0.2.1
- 동기화할 SOOP 다시보기가 없는 경우 스크립트가 멈추는 현상을 수정했습니다.
- 동기화할 SOOP 다시보기가 3일 이내인 경우 오류가 발생하는 문제를 수정했습니다.

### 0.2.0
- 개편된 SOOP 방송국에 동작하도록 수정했습니다.

### 0.1.5
- 다른 스크립트와 충돌할 가능성이 있는 부분을 수정했습니다.

## 라이선스

이 프로젝트는 MIT 라이선스를 따릅니다. 자세한 내용은 `LICENSE` 파일을 참고하세요.