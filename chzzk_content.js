
const BTN_TEXT_IDLE = "Find VOD";
const BTN_TEXT_FINDING_STREAMER_ID = "스트리머 ID를 찾는 중...";
const BTN_TEXT_FINDING_VOD = "다시보기를 찾는 중...";
if (window == top) {

    let tsManager = null;
    function log(...data){
        logToExtension('[chzzk_content.js:outframe]', ...data);
    }
    // URL 파라미터 처리
    const urlParams = new URLSearchParams(window.location.search);
    const changeSecond = urlParams.get('change_second');
    const url_request_vod_ts = urlParams.get("request_vod_ts");
    const url_request_real_ts = urlParams.get("request_real_ts");
    
    // URL 파라미터 처리를 위한 함수
    async function handleUrlParameters() {
        if (changeSecond) {
            log('change_second 파라미터 감지:', changeSecond);
            
            // tsManager가 초기화되고 비디오 정보를 가져온 후에 시간 변경 실행
            const checkAndJump = () => {
                if (tsManager && tsManager.videoInfo && tsManager.videoTag) {
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
                } else if (tsManager) {
                    // 아직 초기화되지 않았으면 잠시 후 다시 시도
                    setTimeout(checkAndJump, 1000);
                }
            };
            
            // 초기 체크 시작
            setTimeout(checkAndJump, 1000);
        }
        if (url_request_vod_ts){
            const request_vod_ts = parseInt(url_request_vod_ts);
            if (url_request_real_ts){ // 페이지 로딩 시간을 추가해야하는 경우.
                const request_real_ts = parseInt(url_request_real_ts);
                if (tsManager) {
                    tsManager.RequestGlobalTSAsync(request_vod_ts, request_real_ts);
                }
            }
            else{
                if (tsManager) {
                    tsManager.RequestGlobalTSAsync(request_vod_ts);
                }
            }
            
            // url 지우기
            const url = new URL(window.location.href);
            url.searchParams.delete('request_vod_ts');
            url.searchParams.delete('request_real_ts');
            window.history.replaceState({}, '', url.toString());
        }
    }

    let vodLinker = null;
    let lastIsVodPage = null;
    let soopPanel = null;
    let rpPanel = null;
    
    // 메인 페이지에서 검색하고 버튼을 누르면 스트리머id를 api로 찾고 그 스트리머 채널을 iframe으로 열게 함. 그 iframe에서 vod link를 받아서 새 탭에서 열음
    class VODLinker{
        constructor(){
            this.iframeTag = null;
            this.curProcessBtn = null;
            this.init();
        }

        init(){
            this.iframeTag = document.createElement('iframe');
            this.iframeTag.style.display = 'none';
            document.body.appendChild(this.iframeTag);
            setInterval(this.addChzzkSyncButtons, 200);
            // 메시지 리스너 추가
            window.addEventListener('message', (event) => {
                if (event.data.response === "CHZZK_VOD") {
                    vodLinker.curProcessBtn.innerText = BTN_TEXT_IDLE;
                    vodLinker.curProcessBtn = null;
                    log("CHZZK VOD link 받음:", event.data.vod_link);
                    vodLinker.handleChzzkVodLink(event.data.vod_link);
                }
                else if (event.data.response === "CHZZK_VOD_NOT_FOUND"){
                    vodLinker.curProcessBtn.innerText = BTN_TEXT_IDLE;
                    vodLinker.curProcessBtn = null;
                    log("CHZZK VOD를 찾지 못했다고 응답받음. 사유:",event.data.reason);
                    alert("동기화 가능한 VOD를 찾지 못했습니다.");
                }
                else if (event.data.response === 'CHZZK_VOD_FINDER_STATUS'){
                    vodLinker.curProcessBtn.innerText = `${event.data.pageNum}페이지에서 ${BTN_TEXT_FINDING_VOD}[${event.data.retryCount}]`;
                }
            });
        }
        
        // 치지직 검색 결과에 동기화 버튼 추가 (SOOP 방식과 동일)
        addChzzkSyncButtons() {
            if (!lastIsVodPage) return;

            const searchHeader = document.querySelector('div[class^="search_header_"]');
            if (searchHeader) return; // 검색 결과 없음 → 버튼 생성 X

            const searchResults = document.querySelectorAll('div[class^="search_container__"] > div > ul > li > a');
            if (!searchResults.length) return;

            searchResults.forEach(element => {
                if (element.querySelector('.chzzk-sync-btn')) return; // 이미 버튼 있음

                const button = document.createElement('button');
                button.className = 'chzzk-sync-btn';
                button.innerText = BTN_TEXT_IDLE;
                button.style.background = '#00d564';
                button.style.color = 'black';
                button.style.fontSize = '12px';
                button.style.marginLeft = '12px';
                button.style.padding = '4px 8px';
                button.style.border = 'none';
                button.style.borderRadius = '4px';
                button.style.cursor = 'pointer';

                button.addEventListener('click', (e)=>{
                    e.preventDefault();
                    e.stopPropagation();
                    if (vodLinker.curProcessBtn){
                        alert('이미 처리중인 작업이 있습니다');
                        return;
                    }
                    vodLinker.curProcessBtn = button;
                    const searchWordSpan = button.parentElement.querySelector('[class^="search_keyword__"]');
                    
                    if (!searchWordSpan){
                        return;
                    }
        
                    // 스트리머 ID 검색
                    button.innerText = BTN_TEXT_FINDING_STREAMER_ID;
                    const keyword = searchWordSpan.innerText;
                    log(`검색어: ${keyword}`);
                    const channelSearchAPI = new URL(`https://api.chzzk.naver.com/service/v1/search/channels`);
                    const encodedKeyword = encodeURI(keyword);
                    channelSearchAPI.searchParams.set('keyword', encodedKeyword);
                    channelSearchAPI.searchParams.set('offset', 0);
                    channelSearchAPI.searchParams.set('size', 50);
                    fetch(channelSearchAPI.toString())
                    .then(response=>response.json())
                    .then(result=>{
                        if (result.code !== 200) return;
        
                        const data = result.content.data;
                        if (data.length > 0){
                            const channelObj = data[0].channel;
                            const channel_id = channelObj.channelId;
                            const channel_name = channelObj.channelName;
                            
                            // 스트리머 ID로 iframe VOD 페이지에서 찾도록 함
                            const vodListUrl = new URL(`https://chzzk.naver.com/${channel_id}/videos`);
                            vodListUrl.searchParams.set('videoType', 'REPLAY');
                            vodListUrl.searchParams.set('sortType', 'LATEST');
                            vodListUrl.searchParams.set('page', 1);
                            vodListUrl.searchParams.set('p_request', 'GET_VOD');
                            vodListUrl.searchParams.set('request_vod_ts', tsManager.getCurDateTime().getTime());
                            vodLinker.curProcessBtn.innerText = BTN_TEXT_FINDING_VOD;
                            vodLinker.iframeTag.src = vodListUrl.toString();
                        }
                        else{
                            button.innerText = BTN_TEXT_IDLE;
                            alert(`${keyword}의 스트리머 ID를 찾지 못했습니다.`);
                        }
                    })
                    .catch(error => {
                        console.error('에러 발생:', error);
                    })
                });
                element.appendChild(button);
            });
        }
        handleChzzkVodLink(vod_link){
            const curTS = tsManager.getCurDateTime().getTime();
            const url = new URL(vod_link);
            url.searchParams.set('request_vod_ts', curTS);
            if (tsManager.isPlaying())
                url.searchParams.set('request_real_ts', Date.now());
            log(`vod 열기 ${url.toString()}`);
            window.open(url, "_blank");
        }
    }
    
    // 설정에 따라 기능 초기화
    async function initializeFeatures() {
        // 설정 로딩이 완료될 때까지 기다림
        await vodSyncSettings.waitForLoad();
        
        await updateFeatures();
        
        // 설정 변경 감지
        vodSyncSettings.onSettingsChanged(async (newSettings) => {
            logToExtension('[chzzk_content] 설정 변경 감지, 기능 업데이트 중...');
            await updateFeatures();
        });
    }

    // 기능 업데이트 함수
    async function updateFeatures() {
        const enableSoopPanel = await vodSyncSettings.isFeatureEnabled('enableChzzkSoopPanel');
        const enableRpPanel = await vodSyncSettings.isFeatureEnabled('enableRpPanel');
        const enableTimestamp = await vodSyncSettings.isFeatureEnabled('enableTimestamp');

                    logToExtension('[chzzk_content] 기능 업데이트:', {
                enableSoopPanel,
                enableRpPanel,
                enableTimestamp
            });

        // SOOP 패널 토글
        if (enableSoopPanel && !soopPanel) {
            logToExtension('[chzzk_content] SOOP 패널 활성화');
            soopPanel = new SoopSyncPanel();
        } else if (!enableSoopPanel && soopPanel) {
            logToExtension('[chzzk_content] SOOP 패널 비활성화');
            soopPanel.hideCompletely();
            soopPanel = null;
        }

        // RP 패널 토글
        if (enableRpPanel && !rpPanel) {
            logToExtension('[chzzk_content] RP 패널 활성화');
            rpPanel = new RPNicknamePanel();
        } else if (!enableRpPanel && rpPanel) {
            logToExtension('[chzzk_content] RP 패널 비활성화');
            rpPanel.hideCompletely();
            rpPanel = null;
        }

        // VOD Linker 초기화 (항상 활성화)
        if (!vodLinker) {
            vodLinker = new VODLinker();
        }

        // 타임스탬프 매니저 초기화
        if (enableTimestamp && !tsManager) {
            logToExtension('[chzzk_content] 타임스탬프 매니저 활성화');
            tsManager = new ChzzkTimestampManager();
            window.tsManager = tsManager; // window 멤버로 공유
            // URL 파라미터 처리
            handleUrlParameters();
        } else if (enableTimestamp && tsManager) {
            // 이미 활성화된 경우 enable 호출
            tsManager.enable();
        } else if (!enableTimestamp && tsManager) {
            logToExtension('[chzzk_content] 타임스탬프 매니저 비활성화');
            tsManager.disable();
        }
    }

    // 기능 초기화 실행
    initializeFeatures();

    // VOD 플레이어 페이지 여부를 지속적으로 갱신
    async function checkVodPageAndTogglePanel() {
        const isVodPage = window.location.pathname.includes('/video/');
        if (isVodPage !== lastIsVodPage) {
            lastIsVodPage = isVodPage;
            // 상태가 바뀔때 패널을 숨기거나 표시함.
            if (isVodPage) {
                if (soopPanel) soopPanel.closePanel();
                if (rpPanel) rpPanel.closePanel();
            } else {
                if (soopPanel) soopPanel.hideCompletely();
                if (rpPanel) rpPanel.hideCompletely();
            }
        }
    }
    setInterval(checkVodPageAndTogglePanel, 500);
}
else{ // iframe 내부
    let vodFinder = null;
    let chzzkSearchHandler = null; // CHZZK 검색 핸들러 추가
    function log(...data){
        logToExtension('[chzzk_content.js:inframe]', ...data);
    }

    // ===================== CHZZK 검색 핸들러 (SOOP 요청 처리) =====================
    class ChzzkSearchHandler {
        constructor(request_vod_ts) {
            this.request_vod_ts = request_vod_ts;
            this.request_vod_date = new Date(request_vod_ts);
            this.init();
        }

        init() {
            log('CHZZK 검색 핸들러 초기화, 타임스탬프:', new Date(this.request_vod_ts).toLocaleString());
            this.setupSearchInterface();
        }

        setupSearchInterface() {
            // 검색 인터페이스 생성
            const searchContainer = document.createElement('div');
            searchContainer.style.position = 'fixed';
            searchContainer.style.top = '20px';
            searchContainer.style.left = '20px';
            searchContainer.style.background = 'white';
            searchContainer.style.padding = '20px';
            searchContainer.style.border = '2px solid #00d564';
            searchContainer.style.borderRadius = '10px';
            searchContainer.style.zIndex = '10000';
            searchContainer.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';

            const title = document.createElement('h3');
            title.innerText = 'CHZZK 스트리머 검색';
            title.style.margin = '0 0 15px 0';
            title.style.color = '#00d564';
            searchContainer.appendChild(title);

            const description = document.createElement('p');
            description.innerText = `타임스탬프: ${new Date(this.request_vod_ts).toLocaleString()}`;
            description.style.margin = '0 0 15px 0';
            description.style.fontSize = '14px';
            searchContainer.appendChild(description);

            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = '스트리머 이름을 입력하세요';
            searchInput.style.width = '200px';
            searchInput.style.padding = '8px';
            searchInput.style.border = '1px solid #ccc';
            searchInput.style.borderRadius = '4px';
            searchInput.style.marginRight = '10px';
            searchContainer.appendChild(searchInput);

            const searchBtn = document.createElement('button');
            searchBtn.innerText = '검색';
            searchBtn.style.padding = '8px 16px';
            searchBtn.style.background = '#00d564';
            searchBtn.style.color = 'black';
            searchBtn.style.border = 'none';
            searchBtn.style.borderRadius = '4px';
            searchBtn.style.cursor = 'pointer';
            searchBtn.addEventListener('click', () => {
                this.searchStreamer(searchInput.value);
            });
            searchContainer.appendChild(searchBtn);

            const closeBtn = document.createElement('button');
            closeBtn.innerText = '닫기';
            closeBtn.style.padding = '8px 16px';
            closeBtn.style.background = '#ccc';
            closeBtn.style.color = 'black';
            closeBtn.style.border = 'none';
            closeBtn.style.borderRadius = '4px';
            closeBtn.style.cursor = 'pointer';
            closeBtn.style.marginLeft = '10px';
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(searchContainer);
            });
            searchContainer.appendChild(closeBtn);

            document.body.appendChild(searchContainer);
        }

        async searchStreamer(keyword) {
            if (!keyword.trim()) {
                alert('스트리머 이름을 입력해주세요.');
                return;
            }

            log(`스트리머 검색: ${keyword}`);
            
            try {
                const channelSearchAPI = new URL(`https://api.chzzk.naver.com/service/v1/search/channels`);
                const encodedKeyword = encodeURI(keyword);
                channelSearchAPI.searchParams.set('keyword', encodedKeyword);
                channelSearchAPI.searchParams.set('offset', 0);
                channelSearchAPI.searchParams.set('size', 50);
                
                const response = await fetch(channelSearchAPI.toString());
                const result = await response.json();
                
                if (result.code !== 200) {
                    alert('스트리머 검색에 실패했습니다.');
                    return;
                }

                const data = result.content.data;
                if (data.length > 0) {
                    const channelObj = data[0].channel;
                    const channel_id = channelObj.channelId;
                    const channel_name = channelObj.channelName;
                    
                    log(`스트리머 찾음: ${channel_name} (${channel_id})`);
                    
                    // VOD 페이지에서 동기화 가능한 VOD 찾기
                    const vodListUrl = new URL(`https://chzzk.naver.com/${channel_id}/videos`);
                    vodListUrl.searchParams.set('videoType', 'REPLAY');
                    vodListUrl.searchParams.set('sortType', 'LATEST');
                    vodListUrl.searchParams.set('page', 1);
                    vodListUrl.searchParams.set('p_request', 'GET_VOD');
                    vodListUrl.searchParams.set('request_vod_ts', this.request_vod_ts);
                    
                    // iframe으로 VOD 페이지 로드
                    const iframe = document.createElement('iframe');
                    iframe.style.display = 'none';
                    iframe.src = vodListUrl.toString();
                    document.body.appendChild(iframe);
                    
                    // VODFinder가 처리하도록 함
                    vodFinder = new VODFinder(this.request_vod_ts, 1);
                    
                } else {
                    alert(`${keyword} 스트리머를 찾을 수 없습니다.`);
                }
            } catch (error) {
                console.error('스트리머 검색 에러:', error);
                alert('스트리머 검색 중 오류가 발생했습니다.');
            }
        }
    }

    class VODFinder{
        constructor(request_vod_ts, pageNum){
            this.request_vod_date = new Date(request_vod_ts);
            this.pageNum = pageNum;
            this.retryCount = 0;
            this.init();
        }
        init(){
            log(`CHZZK VOD 검색시작: ${window.location}`);
            this.tryCheck();
        }
        async tryCheck(){
            this.retryCount += 1;
            window.parent.postMessage({
                response: 'CHZZK_VOD_FINDER_STATUS',
                pageNum: this.pageNum,
                retryCount: this.retryCount
            })

            const p = document.querySelector('#videos-PANEL > div > p');
            if (p !== null && p.innerText === '영상이 하나도 없네요...\n'){
                window.parent.postMessage(
                    {
                        response: "CHZZK_VOD_NOT_FOUND",
                        reason: "no vod"
                    },
                    "https://chzzk.naver.com"
                );
                return;
            }
            const videoListTag = document.querySelector('#videos-PANEL > ul');
            if (videoListTag){
                const aTags = videoListTag.querySelectorAll('li > div > a');
                if (aTags.length > 0){
                    let found = false;
                    //현재 페이지의 마지막 다시보기기의 업로드 시점을 읽어옴
                    const l_vod_idx = aTags.length-1;
                    const l_vod_link = aTags[l_vod_idx].href;
                    const l_video_id = parseInt(l_vod_link.match(/\/video\/(\d+)/)[1]);
                    const l_video_info = await this.getVodInfo(l_video_id);
                    const l_liveOpenDateStr = l_video_info.content.liveOpenDate;
                    const l_durationMSec = l_video_info.content.duration*1000;
                    const l_liveOpenDate = new Date(l_liveOpenDateStr.replace(' ', 'T'));
                    const l_liveCloseDate = new Date(l_liveOpenDate.getTime() + l_durationMSec);

                    if (this.request_vod_date < l_liveOpenDate){
                        // 현재 페이지의 마지막 다시보기의 라이브 시작 시점이 요청시간보다 이전이라면 다음 페이지에서 다시 검색해야함
                        const url = new URL(window.location.href);
                        url.searchParams.set('page', this.pageNum+1);
                        url.searchParams.set('p_request', 'GET_VOD');
                        url.searchParams.set('request_vod_ts', this.request_vod_date.getTime());
                        const urlStr = url.toString();
                        log(`다음 페이지로 이동 (${this.pageNum} --> ${this.pageNum+1}): ${urlStr}`);
                        window.location.replace(urlStr);
                    }
                    else if (l_liveCloseDate < this.request_vod_date){
                        //현재 페이지의 마지막 다시보기의 라이브 종료 시점이 요청시간보다 이후라면 이 페이지에서 마저 검색해야함
                        // 이분 탐색으로 VOD를 찾는다 (tryCheck가 async이므로 바로 await 사용)
                        let left = 0;
                        let right = l_vod_idx > 0 ? l_vod_idx-1 : 0;
                        while (left <= right) {
                            const mid = Math.floor((left + right) / 2);
                            const vod_link = aTags[mid].href;
                            const match = vod_link.match(/\/video\/(\d+)/);
                            const videoId = parseInt(match[1]);
                            log(`이분탐색: ${left}~[${mid}]~${right} CHZZK VOD 정보 검색중 (videoId:${videoId})`);
                            const videoInfo = await this.getVodInfo(videoId);
                
                            // 다시보기가 잘릴 경우 잘린 다시보기의 라이브 시작날짜와 동일하기 때문에 다음 다시보기의 라이브 시작날짜를 확인해야함
                            const nextVodId = videoInfo.content.nextVideo.videoNo;
                            const nextVodInfo = await this.getVodInfo(nextVodId);
                            const liveOpenDate = new Date(videoInfo.content.liveOpenDate.replace(' ', 'T'));
                            
                            // 잘린 다시보기인 경우 다음 다시보기의 시간만큼 liveOpenDate 변수에 더해줌
                            if (nextVodInfo.content.liveOpenDate === videoInfo.content.liveOpenDate)
                                liveOpenDate.setTime(liveOpenDate.getTime() + nextVodInfo.content.duration*1000);

                            const liveCloseDate = new Date(liveOpenDate.getTime() + videoInfo.content.duration*1000);

                            if (liveOpenDate <= this.request_vod_date && this.request_vod_date <= liveCloseDate) {
                                window.parent.postMessage(
                                    {
                                        response: "CHZZK_VOD",
                                        vod_link: vod_link
                                    },
                                    "https://chzzk.naver.com"
                                );
                                return;
                            } else if (this.request_vod_date < liveOpenDate) {
                                left = mid + 1;
                            } else {
                                right = mid - 1;
                            }
                        }
                        // 다 검사했는데 없으면 아예 동기화할 다시보기가 없다는 뜻.
                        window.parent.postMessage(
                            {
                                response: "CHZZK_VOD_NOT_FOUND",
                                reason: `no vod.`
                            },
                            "https://chzzk.naver.com"
                        );
                        return;
                    }
                    else {
                        // 현재 페이지의 마지막 다시보기의 라이브 구간안에 요청시간이 포함되어있음.
                        found = true;
                        window.parent.postMessage(
                            {
                                response: "CHZZK_VOD",
                                vod_link: l_vod_link
                            },
                            "https://chzzk.naver.com"
                        );
                        return;
                    }
                }
            }
            log('페이지 로딩중. 재시도');
            setTimeout(this.tryCheck.bind(this), 100);
        }
        async getVodInfo(videoId){
            const url = `https://api.chzzk.naver.com/service/v2/videos/${videoId}`;
            const response = await fetch(url);
            const videoInfo = await response.json();
            if (videoInfo.code !== 200) {
                window.parent.postMessage(
                    {
                        response: "CHZZK_VOD_NOT_FOUND",
                        reason: `${videoId} video api response ${videoInfo.code}.`
                    },
                    "https://chzzk.naver.com"
                );
                return;
            }
            return videoInfo;
        }
    }
    // URL 파라미터 처리
    const urlParams = new URLSearchParams(window.location.search);
    const p_request = urlParams.get('p_request');
    const request_vod_ts_str = urlParams.get('request_vod_ts');
    if (p_request === "GET_VOD"){
        const request_vod_ts = parseInt(request_vod_ts_str);
        const pageNumStr = urlParams.get('page');
        if (pageNumStr){
            const pageNum = parseInt(pageNumStr);
            vodFinder = new VODFinder(request_vod_ts, pageNum);
        }
    }
    else if (p_request === "GET_CHZZK_VOD_FROM_SOOP") {
        // SOOP에서 CHZZK 동기화 요청
        const request_vod_ts = parseInt(request_vod_ts_str);
        chzzkSearchHandler = new ChzzkSearchHandler(request_vod_ts);
    }
}