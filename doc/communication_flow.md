# VOD Synchronizer 통신 흐름

## 1. SOOP 다시보기 → SOOP 스트리머 동기화 흐름

```mermaid
sequenceDiagram
    participant User as 사용자
    participant VODLinker as SoopVODLinker<br/>"https://www.vod.sooplive.co.kr"
    participant StreamerManager as SoopStreamerIDManager<br/>"https://www.sooplive.co.kr"
    participant VODFinder as SoopVODFinder<br/>"https://www.sooplive.co.kr"
    participant TimestampManager as SoopTimestampManager<br/>"https://www.vod.sooplive.co.kr"

    User->>VODLinker: 스트리머 이름 입력
    VODLinker->>VODLinker: FindVOD 버튼 생성
    User->>VODLinker: FindVOD 버튼 클릭
    VODLinker->>VODLinker: 스트리머 닉네임 추출
    VODLinker->>StreamerManager: iframe 생성 (스트리머 ID 검색)
    
    StreamerManager->>StreamerManager: 스트리머 ID 검색
    StreamerManager->>VODLinker: STREAMER_ID_FOUND 메시지
    StreamerManager->>VODFinder: VOD 검색 iframe 생성
    
    VODFinder->>VODFinder: VOD 리스트 읽기
    VODFinder->>VODFinder: 요청된 타임스탬프가 포함될 수 있는 VOD 후보들 선별
    VODFinder->>VODLinker: SOOP_VOD_LIST 메시지 (선별된 VOD 링크들)
    
    VODLinker->>TimestampManager: 새 탭에서 VOD 열기
    TimestampManager->>TimestampManager: 타임스탬프 동기화 시도
    Note over TimestampManager: 스트리밍 시간 미포함시 탭 자동 닫힘
```

## 2. CHZZK 다시보기 → CHZZK 스트리머 동기화 흐름

```mermaid
sequenceDiagram
    participant User as 사용자
    participant VODLinker as ChzzkVODLinker<br/>"https://chzzk.naver.com"
    participant ChzzkAPI as CHZZK API<br/>"https://api.chzzk.naver.com"
    participant VodFinder as ChzzkVODFinder<br/>"https://chzzk.naver.com"
    participant TimestampManager as ChzzkTimestampManager<br/>"https://chzzk.naver.com"

    VODLinker->>VODLinker: FindVOD 버튼 생성
    User->>VODLinker: FindVOD 버튼 클릭
    VODLinker->>VODLinker: 스트리머 닉네임 추출
    VODLinker->>ChzzkAPI: 스트리머 검색 API 호출
    ChzzkAPI-->>VODLinker: 스트리머 ID 반환
    VODLinker->>VodFinder: iframe 생성 (VOD 검색)
    
    VodFinder->>ChzzkAPI: 현재 페이지 마지막 VOD 정보 API 호출
    ChzzkAPI-->>VodFinder: VOD 상세 정보 반환
    VodFinder->>VodFinder: 현재 페이지의 마지막 VOD 라이브 시작 시점과 요청 timestamp 비교
    
    alt 현재 페이지 마지막 라이브 시작 시점이 요청 시간보다 과거인 경우
        VodFinder->>ChzzkAPI: 중간지점 VOD 정보 API 호출
        ChzzkAPI-->>VodFinder: VOD 상세 정보 반환
        VodFinder->>VodFinder: VOD 정보로 이분탐색
    else 현재 페이지 마지막 라이브 시작 시점이 요청 시간보다 최근인 경우
        VodFinder->>VodFinder: 다음 페이지 URL로 이동 (재귀적 VOD 검색)
    end
    
    alt VOD를 찾은 경우
        VodFinder->>VODLinker: CHZZK_VOD 메시지
    else VOD를 찾지 못한 경우
        VodFinder->>VodFinder: CHZZK_VOD_NOT_FOUND 메시지
    end
    
    VODLinker->>TimestampManager: 새 탭에서 VOD 열기
    TimestampManager->>TimestampManager: 타임스탬프 동기화 시도
```

## 3. CHZZK 다시보기 → SOOP 스트리머 동기화 흐름

```mermaid
sequenceDiagram
    participant User as 사용자
    participant SoopPanel as SoopSyncPanel<br/>"https://chzzk.naver.com"
    participant StreamerManager as SoopStreamerIDManager<br/>"https://www.sooplive.co.kr"
    participant ChildStreamerManager as Child SoopStreamerIDManager<br/>"https://www.sooplive.co.kr"
    participant VodFinder as SoopVodFinder<br/>"https://www.sooplive.co.kr"
    participant TimestampManager as SoopTimestampManager<br/>"https://www.sooplive.co.kr"

    User->>SoopPanel: SOOP 검색 버튼 클릭
    SoopPanel->>SoopPanel: 현재 CHZZK VOD 타임스탬프 추출
    SoopPanel->>StreamerManager: iframe 생성 (SOOP 스트리머 검색)
    
    User->>StreamerManager: 스트리머 닉네임 입력
    StreamerManager->>StreamerManager: FindVOD 버튼 생성
    User->>StreamerManager: FindVOD 버튼 클릭
    StreamerManager->>ChildStreamerManager: 스트리머 ID 검색 iframe 생성
    
    ChildStreamerManager->>ChildStreamerManager: 스트리머 ID 검색 수행
    ChildStreamerManager->>StreamerManager: 스트리머 ID 전달
    StreamerManager->>VodFinder: VOD 검색 iframe 생성
    
    VodFinder->>VodFinder: VOD 리스트 읽기
    VodFinder->>VodFinder: 요청된 타임스탬프가 포함될 수 있는 VOD 후보들 선별
    VodFinder->>StreamerManager: SOOP_VOD_LIST 메시지 (선별된 VOD 링크들)
    StreamerManager->>SoopPanel: SOOP_VOD_LIST 메시지
    
    SoopPanel->>TimestampManager: 새 탭에서 SOOP VOD 열기
    TimestampManager->>TimestampManager: 타임스탬프 동기화 시도
    Note over TimestampManager: 스트리밍 시간에 포함되지 않으면 탭 자동 닫힘
```

## 4. SOOP 다시보기 → CHZZK 스트리머 동기화 흐름

> **⚠️ 미구현 상태** - 개발 예정인 기능입니다.

 