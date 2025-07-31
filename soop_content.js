if (window == top) {
    const BTN_TEXT_IDLE = "Find VOD";
    const BTN_TEXT_FINDING_STREAMER_ID = "스트리머 ID를 찾는 중...";
    const BTN_TEXT_FINDING_VOD = "다시보기를 찾는 중...";
    let tsManager = null;
    let vodLinker = null;
    let rpPanel = null;
    let chzzkPanel = null; // CHZZK 패널 추가
    function log(...data){
        logToExtension('[soop_content.js]', ...data);
    }
    log('loaded');

    // tsManager는 설정에 따라 초기화됨
    class VODLinker{
        constructor(){
            this.lastRequest = null;
            this.lastRequestFailedMessage = null;
            this.buttons=[];
            this.curProcessingBtn = null;
            this.iframe=null;
            this.requestSystemTime = null; // VOD List 요청한 시스템 시간 저장
            this.init();            
        }
        init(){
            this.createTemp();
            this.updateFindVODButtons();
        }
        findStreamerID(nickname){
            if (!tsManager) {
                alert('타임스탬프 기능이 비활성화되어 있습니다.');
                return;
            }
            vodLinker.curProcessingBtn.innerText = BTN_TEXT_FINDING_STREAMER_ID;
            const encodedNickname = encodeURI(nickname);
            const url = new URL(`https://www.sooplive.co.kr/search`);
            url.searchParams.set("szLocation", "total_search");
            url.searchParams.set("szSearchType", "streamer");
            url.searchParams.set("szKeyword", encodedNickname);
            url.searchParams.set("szStype", "di");
            url.searchParams.set("szActype", "input_field");
            const reqUrl = new URL(url.toString());
            reqUrl.searchParams.set("p_request", "GET_SOOP_VOD_FROM_SOOP");
            reqUrl.searchParams.set("request_vod_ts", tsManager.getCurDateTime().getTime());
            // `https://www.sooplive.co.kr/search?szLocation=total_search&szSearchType=streamer&szKeyword=${encodedNickname}&szStype=di&szActype=input_field`;
            log(`find with ${reqUrl.toString()}`);
            this.lastRequest = "GET_SOOP_VOD_FROM_SOOP";
            this.lastRequestFailedMessage = `스트리머 ID를 찾을 수 없습니다. 검색페이지: ${url.toString()}`;
            this.lastRequestTimeout = setTimeout(() => {
                alert(this.lastRequestFailedMessage);
                this.iframe.src = "";
                this.curProcessingBtn.innerText = BTN_TEXT_IDLE;
                this.curProcessingBtn = null;
            }, 3000);
            this.iframe.src = reqUrl.toString();
        }
        updateFindVODButtons(){
            setInterval(() => {
                if (!tsManager || !tsManager.isControllableState) return;
                const searchResults = document.querySelectorAll('#areaSuggest > ul > li > a');
                if (searchResults){
                    searchResults.forEach(element => {
                        if (element.querySelector('em')) return;
                        
                        const existsBtn = element.querySelector('.find-vod');
                        if (!existsBtn){
                            const button = document.createElement("button");
                            button.className = "find-vod";
                            button.innerText = BTN_TEXT_IDLE;
                            button.style.background = "gray";
                            button.style.fontSize = "12px";
                            button.style.color = "white";
                            button.style.marginLeft = "20px";
                            button.style.padding = "5px";
                            element.appendChild(button);
                            button.addEventListener('click', function (e){
                                e.preventDefault();       // a 태그의 기본 이동 동작 막기
                                e.stopPropagation();      // 이벤트 버블링 차단
                                if (vodLinker.curProcessingBtn != null){
                                    alert("이미 다른 스트리머를 찾고 있습니다. 잠시 후 다시 시도해주세요.");
                                    return;
                                }
                                vodLinker.curProcessingBtn = button;
                                const nicknameSpan = element.querySelector('span');
                                vodLinker.findStreamerID(nicknameSpan.innerText);
                            });
                        }
                    });

                }
            }, 1000);
        }
        createTemp(){
            this.iframe = document.createElement('iframe');
            this.iframe.style.display = "none"; // initially hidden
            document.body.appendChild(this.iframe);

            /// test button
            // const requestButton = document.createElement('button');
            // requestButton.style.background = "gray";
            // requestButton.style.position = "fixed";
            // requestButton.style.bottom = "100px";
            // requestButton.style.right = "200px";
            // requestButton.innerText = "test button";
            // document.body.appendChild(requestButton);
            // requestButton.addEventListener("click", () => {
            // });
        }
        clearLastRequest(){
            if (this.lastRequestTimeout != null){
                clearTimeout(this.lastRequestTimeout);
                this.lastRequestTimeout = null;
                this.lastRequest = null;
                this.lastRequestFailedMessage = null;
            }
        }
    }

    // 설정에 따라 기능 초기화
    async function initializeFeatures() {
        // 설정 로딩이 완료될 때까지 기다림
        await vodSyncSettings.waitForLoad();
        
        await updateFeatures();
        
        // 설정 변경 감지
        vodSyncSettings.onSettingsChanged(async (newSettings) => {
            log('설정 변경 감지, 기능 업데이트 중...');
            await updateFeatures();
        });

        const params = new URLSearchParams(window.location.search);
        const url_request_vod_ts = params.get("request_vod_ts");
        const url_request_real_ts = params.get("request_real_ts");
        if (url_request_vod_ts && tsManager){
            const request_vod_ts = parseInt(url_request_vod_ts);
            if (url_request_real_ts){ // 페이지 로딩 시간을 추가해야하는 경우.
                const request_real_ts = parseInt(url_request_real_ts);
                tsManager.RequestGlobalTSAsync(request_vod_ts, request_real_ts);
            }
            else{
                tsManager.RequestGlobalTSAsync(request_vod_ts);
            }
            
            // url 지우기
            const url = new URL(window.location.href);
            url.searchParams.delete('request_vod_ts');
            url.searchParams.delete('request_real_ts');
            window.history.replaceState({}, '', url.toString());
        }
    }

    // 기능 업데이트 함수
    async function updateFeatures() {
        const enableChzzkPanel = await vodSyncSettings.isFeatureEnabled('enableSoopChzzkPanel');
        const enableRpPanel = await vodSyncSettings.isFeatureEnabled('enableRpPanel');
        const enableTimestamp = await vodSyncSettings.isFeatureEnabled('enableTimestamp');

        log('기능 업데이트:', {
            enableChzzkPanel,
            enableRpPanel,
            enableTimestamp
        });

        // VOD Linker 초기화 (항상 활성화)
        if (!vodLinker) {
            vodLinker = new VODLinker();
        }

        // 타임스탬프 매니저 초기화
        if (enableTimestamp && !tsManager) {
            log('타임스탬프 매니저 활성화');
            tsManager = new SoopTimestampManager();
            window.tsManager = tsManager; // window 멤버로 공유
        } else if (enableTimestamp && tsManager) {
            // 이미 활성화된 경우 enable 호출
            tsManager.enable();
        } else if (!enableTimestamp && tsManager) {
            log('타임스탬프 매니저 비활성화');
            tsManager.disable();
        }

        // CHZZK 패널 토글
        if (enableChzzkPanel && !chzzkPanel) {
            log('CHZZK 패널 활성화');
            chzzkPanel = new ChzzkSyncPanel();
        } else if (!enableChzzkPanel && chzzkPanel) {
            log('CHZZK 패널 비활성화');
            chzzkPanel.hideCompletely();
            chzzkPanel = null;
        }

        // RP 패널 토글
        if (enableRpPanel && !rpPanel) {
            log('RP 패널 활성화');
            rpPanel = new RPNicknamePanel();
        } else if (!enableRpPanel && rpPanel) {
            log('RP 패널 비활성화');
            rpPanel.hideCompletely();
            rpPanel = null;
        }
    }

    // 기능 초기화 실행
    initializeFeatures();

    function checkOneByOne(vodLinks){
        if (!tsManager) {
            log('타임스탬프 매니저가 없습니다.');
            return;
        }
        const curDateTime = tsManager.getCurDateTime();
        if (curDateTime){
            const request_vod_ts = curDateTime.getTime();
            const request_real_ts = Date.now();
            const isPlaying = tsManager.isPlaying();
            if (vodLinks.length > 0){
                for (let i = 0; i < vodLinks.length; i++) {
                    const link = vodLinks[i];
                    const url = new URL(link);
                    url.searchParams.delete('change_second');
                    url.searchParams.set('request_vod_ts', request_vod_ts);
                    if (isPlaying)
                        url.searchParams.set('request_real_ts', request_real_ts);
                    window.open(url, "_blank");
                }
            }
        }
        else{
            log(`getCurDateTime() returned ${curDateTime}`);
        }
    }
    window.addEventListener('message', (event) => {
        if (event.data.response === "SOOP_VOD_LIST"){
            const vodLinks = event.data.resultVODLinks;
            log("SOOP_VOD_LIST 받음:", vodLinks);
            vodLinker.clearLastRequest();
            vodLinker.curProcessingBtn.innerText = BTN_TEXT_IDLE;
            vodLinker.curProcessingBtn = null;
            checkOneByOne(vodLinks);
            
        }
        else if (event.data.response === "STATUS_STREAM_ID_CHECKED"){
            log("STREAMER_ID 받음:", event.data.streamer_id);
            vodLinker.clearLastRequest();
            vodLinker.curProcessingBtn.innerText = BTN_TEXT_FINDING_VOD;
            //vodLinker.curProcessingBtn = null; // 작업이 아직 끝나지 않았으므로 null로 초기화하면 안됨
        }
    })
}
