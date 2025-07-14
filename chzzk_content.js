if (window == top) {
    const BTN_TEXT_IDLE = "Find VOD";
    const BTN_TEXT_FINDING_STREAMER_ID = "스트리머 ID를 찾는 중...";
    const BTN_TEXT_FINDING_VOD = "다시보기를 찾는 중...";
    const tsManager = new ChzzkTimestampManager();
    let soopLinker = null;
    
    function log(...data){
        console.log('[chzzk_content.js]', ...data);
    }

    class SoopLinker {
        constructor() {
            this.iframe = null;
            this.init();
        }

        init() {
            this.createSearchIframe();
            this.createSearchButton();
        }

        createSearchIframe() {
            this.iframe = document.createElement('iframe');
            this.iframe.id = 'soop-search-iframe';
            this.iframe.style.position = 'fixed';
            this.iframe.style.top = '50%';
            this.iframe.style.left = '50%';
            this.iframe.style.transform = 'translate(-50%, -50%)';
            this.iframe.style.width = '600px';
            this.iframe.style.height = '400px';
            this.iframe.style.border = '2px solid #00d564';
            this.iframe.style.borderRadius = '10px';
            this.iframe.style.backgroundColor = 'white';
            this.iframe.style.zIndex = '10000';
            this.iframe.style.display = 'none';
            this.iframe.src = 'https://www.sooplive.co.kr/search';
            
            document.body.appendChild(this.iframe);
        }

        createSearchButton() {
            const button = document.createElement("button");
            button.id = "soop-search-btn";
            button.innerText = "SOOP 검색";
            button.style.position = "fixed";
            button.style.top = "100px";
            button.style.right = "20px";
            button.style.background = "#00d564";
            button.style.color = "white";
            button.style.border = "none";
            button.style.borderRadius = "5px";
            button.style.padding = "10px 15px";
            button.style.fontSize = "14px";
            button.style.fontWeight = "bold";
            button.style.cursor = "pointer";
            button.style.zIndex = "10000";
            button.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";

            button.addEventListener('click', () => {
                this.showSearchIframe();
            });

            document.body.appendChild(button);
        }

        showSearchIframe() {
            if (!tsManager || !tsManager.isControllableState) {
                alert("VOD 정보를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.");
                return;
            }

            const currentDateTime = tsManager.getCurDateTime();
            if (!currentDateTime) {
                alert("현재 재생 시간을 가져올 수 없습니다.");
                return;
            }

            this.iframe.style.display = 'block';
            
            // iframe에 타임스탬프 정보 전달
            const targetTimestamp = currentDateTime.getTime();
            const url = new URL(`https://www.sooplive.co.kr/search`);
            url.searchParams.set("p_request", "GET_SOOP_VOD_FROM_CHZZK");
            url.searchParams.set("request_vod_ts", `${targetTimestamp}`);
            this.iframe.src = url.toString();
            
            log('SOOP 검색창 열기, 타임스탬프:', new Date(targetTimestamp).toLocaleString());
        }

        hideSearchIframe() {
            this.iframe.style.display = 'none';
        }

        handleSoopVodList(vodLinks, request_vod_ts, request_real_ts) {
            for (let i = 0; i < vodLinks.length; i++) {
                const link = vodLinks[i];

                const url = new URL(link);
                url.searchParams.delete('change_second');
                url.searchParams.set('request_vod_ts', request_vod_ts);
                url.searchParams.set('request_real_ts', request_real_ts);
                window.open(url, "_blank");
                log('SOOP VOD 열기:', url.toString());
                this.hideSearchIframe();
            }
        }
    }

    // 전역 변수로 tsManager 설정
    
    // URL 파라미터에서 change_second 읽기
    const urlParams = new URLSearchParams(window.location.search);
    const changeSecond = urlParams.get('change_second');
    
    if (changeSecond) {
        log('change_second 파라미터 감지:', changeSecond);
        
        // tsManager가 초기화되고 비디오 정보를 가져온 후에 시간 변경 실행
        const checkAndJump = () => {
            if (tsManager.videoInfo && tsManager.playTimeTag) {
                const streamPeriod = tsManager.getStreamPeriod();
                if (streamPeriod) {
                    const [streamStartDateTime] = streamPeriod;
                    const targetTime = streamStartDateTime.getTime() + parseInt(changeSecond) * 1000;
                    
                    log('타겟 시간으로 점프:', new Date(targetTime).toLocaleString());
                    tsManager.moveToGlobalTS(targetTime, false);
                    
                    // URL에서 change_second 파라미터 제거
                    const url = new URL(window.location.href);
                    url.searchParams.delete('change_second');
                    window.history.replaceState({}, '', url.toString());
                }
            } else {
                // 아직 초기화되지 않았으면 잠시 후 다시 시도
                setTimeout(checkAndJump, 1000);
            }
        };
        
        // 초기 체크 시작
        setTimeout(checkAndJump, 1000);
    }
    
    // SOOP Linker 초기화
    soopLinker = new SoopLinker();
    
    // 메시지 리스너 추가
    window.addEventListener('message', (event) => {
        if (event.data.response === "VOD_LIST") {
            log("SOOP VOD 리스트 받음:", event.data.resultVODLinks);
            const curDateTime = tsManager.getCurDateTime();
            if (curDateTime){
                soopLinker.handleSoopVodList(event.data.resultVODLinks, curDateTime.getTime(), Date.now());
            }
        }
    });
    
    log("Chzzk VOD Timestamp Manager initialized");
}
