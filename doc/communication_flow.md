# VOD Synchronizer 통신 흐름

## 1. SOOP 다시보기 → SOOP 스트리머 동기화 흐름

```mermaid
sequenceDiagram
    participant User as 사용자
    participant VODLinker as SoopVODLinker<br/>"https://vod.sooplive.co.kr"<br/>"https://www.sooplive.co.kr"
    participant SoopAPI
    participant TimestampManager as SoopTimestampManager<br/>"https://www.vod.sooplive.co.kr"

    User->>VODLinker: 스트리머 이름 입력
    VODLinker->>VODLinker: SyncVOD 버튼 생성
    User->>VODLinker: SyncVOD 버튼 클릭
    VODLinker->>VODLinker: 스트리머 닉네임 추출
    VODLinker->>SoopAPI: 스트리머 검색 API 호출
    SoopAPI->>VODLinker: 스트리머 검색 결과 응답
    VODLinker->>VODLinker: 응답에서 스트리머 ID 확인
    VODLinker->>TimestampManager: 현재 VOD 재생 시점의 라이브 당시 시간 요청
    TimestampManager->>VODLinker: 라이브 당시 시간 응답
    VODLinker->>SoopAPI: 스트리머의 다시보기 검색 API 호출 (±3일 범위)
    SoopAPI->>VODLinker: 다시보기 검색 결과 응답
    loop 각 VOD 검사
        VODLinker->>SoopAPI: VOD 상세 정보 API 호출
        SoopAPI->>VODLinker: VOD 상세 정보 응답 (시작/종료 시간 포함)
        alt 라이브 스트리밍 시간 범위에 요청 타임스탬프가 포함되는 경우
            VODLinker-->>TimestampManager: 새 탭에서 VOD 열기 (타임스탬프 반영)
        end
    end
    TimestampManager->>TimestampManager: 타임스탬프 동기화 시도
    
```

## 2. CHZZK 다시보기 → CHZZK 스트리머 동기화 흐름

```mermaid
sequenceDiagram
    participant User as 사용자
    participant VODLinker as ChzzkVODLinker<br/>"https://chzzk.naver.com"
    participant ChzzkAPI as CHZZK API<br/>"https://api.chzzk.naver.com"
    participant TimestampManager as ChzzkTimestampManager<br/>"https://chzzk.naver.com"

    VODLinker->>VODLinker: SyncVOD 버튼 생성
    User->>VODLinker: SyncVOD 버튼 클릭
    VODLinker->>VODLinker: 스트리머 닉네임 추출
    VODLinker->>ChzzkAPI: 스트리머 검색 API 호출
    ChzzkAPI->>VODLinker: 스트리머 검색 결과 응답
    VODLinker->>VODLinker: 검색된 첫번째 스트리머의 ID 확인
    VODLinker->>TimestampManager: 현재 VOD 재생 시점의 라이브 당시 시간 요청
    TimestampManager->>VODLinker: 라이브 당시 시간 응답
    
    loop 다시보기 첫번째 페이지부터 VOD 검색
        VODLinker->>ChzzkAPI: 스트리머의 다시보기 페이지 API 호출
        ChzzkAPI->>VODLinker: 다시보기 목록 응답
        loop 다시보기 목록 역순 순회
            VODLinker->>ChzzkAPI: VOD 상세 정보 API 호출 (캐시 확인)
            ChzzkAPI->>VODLinker: VOD 상세 정보 응답
            VODLinker->>VODLinker: VOD 시작/종료 시점 계산 (잘린 다시보기 고려)
            alt 요청 시점이 VOD 시간 범위에 포함되는 경우
                VODLinker-->>TimestampManager: 새 탭에서 VOD 열기 (타임스탬프 반영)
            end
        end
    end
    TimestampManager->>TimestampManager: 타임스탬프 동기화 시도
```

## 3. CHZZK 다시보기 → SOOP 스트리머 동기화 흐름

```mermaid
sequenceDiagram
    participant User as 사용자
    participant ChzzkTSM as ChzzkTimeStampManager<br/>"https://chzzk.naver.com"
    participant SoopPanel as OtherPlatformSyncPanel<br/>"https://chzzk.naver.com"
    participant VodLinker as SoopVodLinker<br/>(iframe 내부)<br/>"https://www.sooplive.co.kr"
    participant SoopAPI
    participant SoopTSM as SoopTimestampManager<br/>"https://www.vod.sooplive.co.kr"

    User->>SoopPanel: SOOP 검색 버튼 클릭
    SoopPanel->>SoopPanel: iframe에 SOOP 검색 페이지 로딩 (only_search=1)
    loop 타임스탬프 전달 (500ms 간격)
        ChzzkTSM->>SoopPanel: 현재 VOD 재생 시점의 라이브 당시 시간 전달
        SoopPanel->>VodLinker: postMessage로 타임스탬프 전달
    end
    User->>VodLinker: 스트리머 닉네임 입력
    VodLinker->>VodLinker: SyncVOD 버튼 생성
    User->>VodLinker: SyncVOD 버튼 클릭
    VodLinker->>SoopAPI: 스트리머 검색 API 호출
    SoopAPI->>VodLinker: 스트리머 검색 결과 응답
    VodLinker->>SoopAPI: 스트리머의 다시보기 검색 API 호출 (±3일 범위)
    SoopAPI->>VodLinker: 다시보기 검색 결과 응답
    loop 각 VOD 검사
        VodLinker->>SoopAPI: VOD 상세 정보 API 호출
        SoopAPI->>VodLinker: VOD 상세 정보 응답 (시작/종료 시간 포함)
        alt 라이브 스트리밍 시간 범위에 요청 타임스탬프가 포함되는 경우
            VodLinker-->>SoopTSM: 새 탭에서 VOD 열기 (타임스탬프 반영)
        end
    end
    SoopTSM->>SoopTSM: 타임스탬프 동기화 시도
```

## 4. SOOP 다시보기 → CHZZK 스트리머 동기화 흐름

```mermaid
sequenceDiagram
    participant User as 사용자
    participant SoopTSM as SoopTimestampManager<br/>"https://www.vod.sooplive.co.kr"
    participant ChzzkPanel as OtherPlatformSyncPanel<br/>"https://www.vod.sooplive.co.kr"
    participant VodLinker as ChzzkVodLinker<br/>(iframe 내부)<br/>"https://chzzk.naver.com"
    participant ChzzkAPI as CHZZK API<br/>"https://api.chzzk.naver.com"
    participant ChzzkTSM as ChzzkTimestampManager<br/>"https://chzzk.naver.com"

    User->>ChzzkPanel: CHZZK 검색 버튼 클릭
    ChzzkPanel->>ChzzkPanel: iframe에 CHZZK 검색 페이지 로딩 (only_search=1)
    loop 타임스탬프 전달 (500ms 간격)
        SoopTSM->>ChzzkPanel: 현재 VOD 재생 시점의 라이브 당시 시간 전달
        ChzzkPanel->>VodLinker: postMessage로 타임스탬프 전달
    end
    User->>VodLinker: 스트리머 닉네임 입력 및 SyncVOD 버튼 클릭
    VodLinker->>ChzzkAPI: 스트리머 검색 API 호출
    ChzzkAPI->>VodLinker: 스트리머 검색 결과 응답
    loop 다시보기 첫번째 페이지부터 VOD 검색
        VodLinker->>ChzzkAPI: 스트리머의 다시보기 페이지 API 호출
        ChzzkAPI->>VodLinker: 다시보기 목록 응답
        loop 다시보기 목록 역순 순회
            VodLinker->>ChzzkAPI: VOD 상세 정보 API 호출 (캐시 확인)
            ChzzkAPI->>VodLinker: VOD 상세 정보 응답
            VodLinker->>VodLinker: VOD 시작/종료 시점 계산 (잘린 다시보기 고려)
            alt 요청 시점이 VOD 시간 범위에 포함되는 경우
                VodLinker-->>ChzzkTSM: 새 탭에서 VOD 열기 (타임스탬프 반영)
            end
        end
    end
    ChzzkTSM->>ChzzkTSM: 타임스탬프 동기화 시도
```