# VOD Synchronizer 통신 흐름

## 1. SOOP 다시보기 → SOOP 스트리머 동기화 흐름

```mermaid
sequenceDiagram
    participant User as 사용자
    participant VODLinker as SoopVODLinker<br/>"https://www.vod.sooplive.co.kr"
    participant SoopAPI
    participant TimestampManager as SoopTimestampManager<br/>"https://www.vod.sooplive.co.kr"

    User->>VODLinker: 스트리머 이름 입력
    VODLinker->>VODLinker: SyncVOD 버튼 생성
    User->>VODLinker: SyncVOD 버튼 클릭
    VODLinker->>VODLinker: 스트리머 닉네임 추출
    VODLinker->>SoopAPI: 스트리머 검색 API 요청
    SoopAPI->>VODLinker: 스트리머 검색 결과 응답
    VODLinker->>VODLinker: 응답에서 스트리머 ID 확인
    VODLinker->>SoopAPI: 스트리머의 다시보기 검색 API 요청
    SoopAPI->>VODLinker: 다시보기 검색 결과 응답
    VODLinker->>VODLinker: 현재 계산된 타임스탬프가 포함되는 다시보기 선별
    
    VODLinker->>TimestampManager: 새 탭에서 VOD 열기
    TimestampManager->>TimestampManager: 타임스탬프 동기화 시도
```

## 2. CHZZK 다시보기 → CHZZK 스트리머 동기화 흐름

```mermaid
sequenceDiagram
    participant User as 사용자
    participant VODLinker as ChzzkVODLinker<br/>"https://chzzk.naver.com"
    participant ChzzkAPI as CHZZK API<br/>"https://api.chzzk.naver.com"
    participant VodFinder as ChzzkVODFinder<br/>"https://chzzk.naver.com"
    participant TimestampManager as ChzzkTimestampManager<br/>"https://chzzk.naver.com"

    VODLinker->>VODLinker: SyncVOD 버튼 생성
    User->>VODLinker: SyncVOD 버튼 클릭
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
    participant ChzzkTSM as ChzzkTimeStampManager<br/>"http://chzzk.naver.com"
    participant SoopPanel as SoopSyncPanel<br/>"https://chzzk.naver.com"
    participant VodLinker as SoopVodLinker<br/>"https://www.sooplive.co.kr"
    participant SoopAPI
    participant SoopTSM as SoopTimestampManager<br/>"https://www.sooplive.co.kr"

    User->>SoopPanel: SOOP 검색 버튼 클릭
    SoopPanel->>VodLinker: SOOP 페이지 로딩
    ChzzkTSM-->>VodLinker: 지속적으로 CHZZK의 타임스탬프 전달    
    User->>VodLinker: 스트리머 닉네임 입력
    VodLinker->>VodLinker: SyncVOD 버튼 생성
    User->>VodLinker: SyncVOD 버튼 클릭
    VodLinker->>VodLinker: 스트리머 닉네임 추출
    VodLinker->>SoopAPI: 스트리머 검색 API 요청
    SoopAPI->>VodLinker: 스트리머 검색 결과 응답
    VodLinker->>VodLinker: 응답에서 스트리머 ID 확인
    VodLinker->>SoopAPI: 스트리머의 다시보기 검색 API 요청
    SoopAPI->>VodLinker: 다시보기 검색 결과 응답
    VodLinker->>VodLinker: 현재 계산된 타임스탬프가 포함되는 다시보기 선별
    
    VodLinker->>SoopTSM: 새 탭에서 VOD 열기
    SoopTSM->>SoopTSM: 타임스탬프 동기화 시도
```

## 4. SOOP 다시보기 → CHZZK 스트리머 동기화 흐름

> **⚠️ 미구현 상태** - 개발 예정인 기능입니다.

 