
const BTN_TEXT_IDLE = "Find VOD";
const BTN_TEXT_FINDING_STREAMER_ID = "스트리머 ID를 찾는 중...";
const BTN_TEXT_FINDING_VOD = "다시보기를 찾는 중...";
if (window == top) {

    const tsManager = new ChzzkTimestampManager();
    function log(...data){
        console.log('[chzzk_content.js:outframe]', ...data);
    }
    // URL 파라미터 처리
    const urlParams = new URLSearchParams(window.location.search);
    const changeSecond = urlParams.get('change_second');
    const url_request_vod_ts = urlParams.get("request_vod_ts");
    const url_request_real_ts = urlParams.get("request_real_ts");
    
    if (changeSecond) {
        log('change_second 파라미터 감지:', changeSecond);
        
        // tsManager가 초기화되고 비디오 정보를 가져온 후에 시간 변경 실행
        const checkAndJump = () => {
            if (tsManager.videoInfo && tsManager.videoTag) {
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
    if (url_request_vod_ts){
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

    let vodLinker = null;
    let lastIsVodPage = null;
    let soopPanel = null;
    

    class SoopPanel {
        constructor() {
            this.panel = null;
            this.toggleBtn = null;
            this.iframe = null;
            this.soopSyncBtn = null;
            this.isPanelOpen = false; // 기본값: 접힘
            this.isPanelVisible = true;
            this.lastMouseMoveTime = Date.now();
            this.mouseCheckInterval = null;
            this.init();
            // 메시지 리스너 추가
            window.addEventListener('message', (event) => {
                if (event.data.response === "SOOP_VOD_LIST") {
                    log("SOOP VOD 리스트 받음:", event.data.resultVODLinks);
                    soopPanel.handleSoopVodList(event.data.resultVODLinks);
                }
            });
        }
        init() {
            this.createPanel();
            this.createToggleBtn();
            this.setupMouseTracking();
            // 생성 직후 접힌 상태로 세팅
            this.closePanel();
        }
        createPanel() {
            this.panel = document.createElement('div');
            this.panel.id = 'soop-panel';
            this.panel.style.position = 'fixed';
            this.panel.style.top = '80px';
            this.panel.style.right = '0';
            this.panel.style.width = '340px';
            this.panel.style.height = '630px';
            this.panel.style.background = 'rgba(255,255,255,0.98)';
            this.panel.style.border = '2px solid #00d564';
            this.panel.style.borderRadius = '10px 0 0 10px';
            this.panel.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)';
            this.panel.style.zIndex = '10000';
            this.panel.style.transition = 'opacity 0.5s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
            this.panel.style.opacity = '1';
            this.panel.style.display = 'flex';
            this.panel.style.flexDirection = 'column';
            this.panel.style.alignItems = 'stretch';
            this.panel.style.padding = '0';
            this.panel.style.gap = '0';

            // 패널 헤더
            const header = document.createElement('div');
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.alignItems = 'center';
            header.style.background = '#00d564';
            header.style.color = 'white';
            header.style.fontWeight = 'bold';
            header.style.fontSize = '16px';
            header.style.padding = '10px 16px';
            header.style.borderRadius = '8px 0 0 0';
            header.innerText = 'SOOP 패널';
            this.panel.appendChild(header);

            // 버튼 영역
            const btnArea = document.createElement('div');
            btnArea.style.display = 'flex';
            btnArea.style.flexDirection = 'column';
            btnArea.style.gap = '10px';
            btnArea.style.padding = '16px';
            btnArea.style.background = 'none';
            btnArea.style.flex = '0 0 auto';
            btnArea.style.height = '55px'; // 고정 높이


            // SOOP 검색 버튼
            this.soopSyncBtn = document.createElement('button');
            this.soopSyncBtn.innerText = 'SOOP 검색';
            this.soopSyncBtn.style.background = '#00d564';
            this.soopSyncBtn.style.color = 'white';
            this.soopSyncBtn.style.border = 'none';
            this.soopSyncBtn.style.borderRadius = '5px';
            this.soopSyncBtn.style.padding = '10px 0';
            this.soopSyncBtn.style.fontSize = '15px';
            this.soopSyncBtn.style.fontWeight = 'bold';
            this.soopSyncBtn.style.cursor = 'pointer';
            this.soopSyncBtn.addEventListener('click', () => {
                this.startSearchWithIframe();
            });
            btnArea.appendChild(this.soopSyncBtn);

            this.panel.appendChild(btnArea);

            // iframe
            this.iframe = document.createElement('iframe');
            this.iframe.id = 'soop-search-iframe';
            this.iframe.style.flex = '1 1 0%';
            this.iframe.style.minHeight = '0';
            this.iframe.style.width = '100%';
            this.iframe.style.border = 'none';
            this.iframe.style.borderRadius = '0 0 10px 10px';
            this.iframe.style.backgroundColor = 'white';
            this.iframe.style.display = 'none';
            this.iframe.style.margin = '0';
            this.iframe.style.padding = '0';
            this.panel.appendChild(this.iframe);

            document.body.appendChild(this.panel);
        }
        createToggleBtn() {
            this.toggleBtn = document.createElement('button');
            this.toggleBtn.id = 'soop-panel-toggle-btn';
            this.toggleBtn.innerHTML = '▲VOD Sync';
            this.toggleBtn.style.position = 'fixed';
            this.toggleBtn.style.top = '290px'; // 패널 top(80px) + 패널 height/2(210px)
            this.toggleBtn.style.transform = 'translateY(-50%) rotate(-90deg)';
            this.toggleBtn.style.transformOrigin = 'center center';
            this.toggleBtn.style.width = '160px';
            this.toggleBtn.style.height = '48px';
            this.toggleBtn.style.fontSize = '15px';
            this.toggleBtn.style.textAlign = 'center';
            this.toggleBtn.style.lineHeight = '1.2';
            this.toggleBtn.style.background = '#00d564';
            this.toggleBtn.style.color = 'white';
            this.toggleBtn.style.border = 'none';
            this.toggleBtn.style.borderRadius = '8px 0 0 8px';
            this.toggleBtn.style.fontWeight = 'bold';
            this.toggleBtn.style.cursor = 'pointer';
            this.toggleBtn.style.zIndex = '10001';
            this.toggleBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
            this.toggleBtn.style.transition = 'right 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.3s';
            this.toggleBtn.addEventListener('click', () => {
                this.togglePanel();
            });
            document.body.appendChild(this.toggleBtn);
        }
        togglePanel() {
            if (this.isPanelOpen) {
                this.closePanel();
            } else {
                this.openPanel();
            }
        }
        openPanel() {
            this.panel.style.right = '0';
            this.toggleBtn.innerHTML = '▼ VOD Sync';
            this.toggleBtn.style.right = '282px'; // 패널 width - 버튼 height/2
            this.isPanelOpen = true;
        }
        closePanel() {
            this.panel.style.right = '-340px';
            this.toggleBtn.innerHTML = '▲ VOD Sync';
            this.toggleBtn.style.right = '-56px';
            this.isPanelOpen = false;
        }
        startSearchWithIframe() {
            if (!tsManager || !tsManager.isControllableState) {
                alert("현재 VOD 정보를 가져올 수 없습니다.");
                return;
            }
            const currentDateTime = tsManager.getCurDateTime();
            if (!currentDateTime) {
                alert("현재 VOD의 라이브 당시 시간을 가져올 수 없습니다.");
                return;
            }
            this.iframe.style.display = 'block';
            // iframe에 타임스탬프 정보 전달
            const targetTimestamp = currentDateTime.getTime();
            const url = new URL(`https://www.sooplive.co.kr/search`);
            url.searchParams.set('only_search', '1');
            url.searchParams.set("p_request", "GET_SOOP_VOD_FROM_CHZZK");
            url.searchParams.set("request_vod_ts", `${targetTimestamp}`);
            this.iframe.src = url.toString();
            log('SOOP 검색창 열기, 타임스탬프:', new Date(targetTimestamp).toLocaleString());
        }
        // 마우스 입력에 따라 투명화
        setupMouseTracking() {
            // 패널 위에 마우스가 올라가면 투명화 방지
            let isMouseOnPanel = false;
            this.panel.addEventListener('mouseenter', () => {
                isMouseOnPanel = true;
                this.showPanelWithOpacity();
            });
            this.panel.addEventListener('mouseleave', () => {
                isMouseOnPanel = false;
            });

            document.addEventListener('mousemove', () => {
                this.lastMouseMoveTime = Date.now();
                this.showPanelWithOpacity();
            });
            document.addEventListener('mouseleave', () => {
                this.hidePanelWithOpacity();
            });
            this.mouseCheckInterval = setInterval(() => {
                const currentTime = Date.now();
                const timeSinceLastMove = currentTime - this.lastMouseMoveTime;
                if (timeSinceLastMove >= 2000 && this.isPanelVisible && !isMouseOnPanel) {
                    this.hidePanelWithOpacity();
                }
            }, 200);
        }
        showPanelWithOpacity() {
            this.panel.style.transition = 'opacity 0.3s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
            this.panel.style.opacity = '1';
            if (this.toggleBtn) {
                this.toggleBtn.style.transition = 'opacity 0.3s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
                this.toggleBtn.style.opacity = '1';
            }
            this.isPanelVisible = true;
        }
        hidePanelWithOpacity() {
            this.panel.style.transition = 'opacity 0.5s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
            this.panel.style.opacity = '0.1';
            if (this.toggleBtn) {
                this.toggleBtn.style.transition = 'opacity 0.5s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
                this.toggleBtn.style.opacity = '0.1';
            }
            this.isPanelVisible = false;
            this.closePanel();
        }
        hideCompletely() {
            this.panel.style.right = '-340px';
            this.toggleBtn.style.right = '-112px';
        }
        handleSoopVodList(vodLinks) {
            const curDateTime = tsManager.getCurDateTime();
            if (curDateTime){
                const request_vod_ts = curDateTime.getTime();
                const request_real_ts = Date.now();
                const isPlaying = tsManager.isPlaying();
                for (let i = 0; i < vodLinks.length; i++) {
                    const link = vodLinks[i];
                    const url = new URL(link);
                    url.searchParams.delete('change_second');
                    url.searchParams.set('request_vod_ts', request_vod_ts);
                    if (isPlaying){
                        url.searchParams.set('request_real_ts', request_real_ts);
                    }
                    window.open(url, "_blank");
                    log('SOOP VOD 열기:', url.toString());
                }
            }
        }
    }

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
                    log("CHZZK VOD 리스트 받음:", event.data.vod_link);
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

            const searchHeader = document.querySelector(
                '#root > div > div.toolbar_container__k2trF > div.search_container__8jbrv.search_is_focus__QJ-2o > div > div.search_header__b5k9O'
            );
            if (searchHeader) return; // 검색 결과 없음 → 버튼 생성 X

            const searchResults = document.querySelectorAll(
                '#root > div > div.toolbar_container__k2trF > div.search_container__8jbrv.search_is_focus__QJ-2o > div > ul > li > a'
            );
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
                    const searchWordSpan = button.parentElement.querySelector('.search_keyword__mAhns');
                    
                    if (!searchWordSpan){
                        return;
                    }
        
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
    
    // SOOP 패널 및 Linker 초기화
    soopPanel = new SoopPanel();
    vodLinker = new VODLinker();

    // VOD 플레이어 페이지 여부를 지속적으로 갱신
    function checkVodPageAndTogglePanel() {
        const isVodPage = window.location.pathname.includes('/video/');
        if (isVodPage !== lastIsVodPage) {
            lastIsVodPage = isVodPage;
            // 상태가 바뀔때 패널을 숨기거나 표시함.
            if (isVodPage) {
                soopPanel.closePanel();
            } else {
                soopPanel.hideCompletely();
            }
        }
    }
    setInterval(checkVodPageAndTogglePanel, 500);
}
else{ // iframe 내부
    let vodFinder = null;
    function log(...data){
        console.log('[chzzk_content.js:inframe]', ...data);
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
                    const l_video_api_url = `https://api.chzzk.naver.com/service/v2/videos/${l_video_id}`;
                    const l_response = await fetch(l_video_api_url);
                    const l_video_info = await l_response.json();
                    if (l_video_info.code !== 200) {
                        window.parent.postMessage(
                            {
                                response: "CHZZK_VOD_NOT_FOUND",
                                reason: `${l_video_id} video api response ${l_video_info.code}.`
                            },
                            "https://chzzk.naver.com"
                        );
                        return;
                    }
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
                            const url = `https://api.chzzk.naver.com/service/v2/videos/${videoId}`;
                            log(`이분탐색: ${left}~[${mid}]~${right} CHZZK VOD 정보 검색중: ${url}`);
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
                            const liveOpenDateStr = videoInfo.content.liveOpenDate;
                            const durationMSec = videoInfo.content.duration*1000;
                            const liveOpenDate = new Date(liveOpenDateStr.replace(' ', 'T'));
                            const liveCloseDate = new Date(liveOpenDate.getTime() + durationMSec);
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
                                vod_link: vod_link
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
}