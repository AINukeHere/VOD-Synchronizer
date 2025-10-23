import { IVodSync } from './base_class.js';
const BTN_TEXT_IDLE = "Find VOD";
const BTN_TEXT_FINDING_STREAMER_ID = "스트리머 ID를 찾는 중...";
const BTN_TEXT_FINDING_VOD = "다시보기를 찾는 중...";
// 메인 페이지에서 검색하고 버튼을 누르면 스트리머id를 api로 찾고 그 스트리머 채널을 iframe으로 열게 함. 그 iframe에서 vod link를 받아서 새 탭에서 열음
export class ChzzkVODLinker extends IVodSync{
    constructor(){
        super();
        

        if (window !== top){
            const searchParams = new URLSearchParams(window.location.search);
            if (searchParams.get('only_search') === '1'){
                this.setupSearchAreaOnlyMode();
            }
            window.addEventListener('message', this.handleWindowMessage.bind(this));
            // this.getRequestVodDate = () => {return new Date(this.request_vod_ts);}
            // this.processRequestRealTS = (url) => {
            //     if (this.request_real_ts){
            //         url.searchParams.set('request_real_ts', this.request_real_ts);
            //     }
            // }
        }
        else{
        }
        // VODSync 네임스페이스에 자동 등록
        window.VODSync = window.VODSync || {};
        if (window.VODSync.chzzkVODLinker) {
            this.warn('[VODSync] ChzzkVODLinker가 이미 존재합니다. 기존 인스턴스를 덮어씁니다.');
        }
        window.VODSync.chzzkVODLinker = this;
        this.iframeTag = null;
        this.curProcessBtn = null;
        this.init();
    }
    init(){
        this.iframeTag = document.createElement('iframe');
        this.iframeTag.style.display = 'none';
        document.body.appendChild(this.iframeTag);
        this.ChzzkSyncButtonManagement();
        // 메시지 리스너 추가
        window.addEventListener('message', (event) => {
            if (event.data.response === "CHZZK_VOD") {
                this.curProcessBtn.innerText = BTN_TEXT_IDLE;
                this.curProcessBtn = null;
                this.log("CHZZK VOD link 받음:", event.data.vod_link);
                this.handleChzzkVodLink(event.data.vod_link);
            }
            else if (event.data.response === "CHZZK_VOD_NOT_FOUND"){
                this.curProcessBtn.innerText = BTN_TEXT_IDLE;
                this.curProcessBtn = null;
                this.log("CHZZK VOD를 찾지 못했다고 응답받음. 사유:",event.data.reason);
                alert("동기화 가능한 VOD를 찾지 못했습니다.");
            }
            else if (event.data.response === 'CHZZK_VOD_FINDER_STATUS'){
                this.curProcessBtn.innerText = `${event.data.pageNum}페이지에서 ${BTN_TEXT_FINDING_VOD}[${event.data.retryCount}]`;
            }
        });
    }
    
    // 동기화 버튼 onclick 핸들러
    handleFindVODButtonClick(e, button){
        e.preventDefault();
        e.stopPropagation();
        if (this.curProcessBtn){
            alert('이미 처리중인 작업이 있습니다');
            return;
        }
        this.curProcessBtn = button;
        const searchWordSpan = button.parentElement.querySelector('[class^="search_keyword__"]');
        
        if (!searchWordSpan){
            return;
        }

        // 스트리머 ID 검색
        button.innerText = BTN_TEXT_FINDING_STREAMER_ID;
        const keyword = searchWordSpan.innerText;
        this.log(`검색어: ${keyword}`);
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
                const tsManager = window.VODSync?.tsManager;
                vodListUrl.searchParams.set('request_vod_ts', tsManager.getCurDateTime().getTime());
                this.curProcessBtn.innerText = BTN_TEXT_FINDING_VOD;
                this.iframeTag.src = vodListUrl.toString();
            }
            else{
                this.curProcessBtn.innerText = BTN_TEXT_IDLE;
                alert(`${keyword}의 스트리머 ID를 찾지 못했습니다.`);
            }
        })
        .catch(error => {
            console.error('에러 발생:', error);
        })
    }
    // 치지직 검색 결과에 동기화 버튼 추가
    ChzzkSyncButtonManagement() {
        setInterval(() => {
            if (!window.location.pathname.includes('/video/')) return; // 다시보기 페이지가 아니면 버튼 생성 X

            const searchHeader = document.querySelector('div[class^="search_header_"]');
            if (searchHeader) return; // 검색 결과 없음 → 버튼 생성 X

            const searchResults = document.querySelectorAll('div[class^="search_container__"] > div > ul > li > a');
            if (!searchResults) return;

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

                button.addEventListener('click', (e) => this.handleFindVODButtonClick(e, button));
                element.appendChild(button);
            });
        }, 200);
    }
    // 치지직 다시보기 링크를 받아서 새 탭에서 열음
    handleChzzkVodLink(vod_link){
        const tsManager = window.VODSync?.tsManager;
        const curTS = tsManager.getCurDateTime().getTime();
        const url = new URL(vod_link);
        url.searchParams.set('request_vod_ts', curTS);
        if (tsManager.isPlaying())
            url.searchParams.set('request_real_ts', Date.now());
        this.log(`vod 열기 ${url.toString()}`);
        window.open(url, "_blank");
    }

    
    // 검색 결과 페이지에서 검색 결과 영역만 남기고 나머지는 숨기게 함. (CHZZK sync panel에서 iframe으로 열릴 때 사용)
    setupSearchAreaOnlyMode() {
        (function waitForElementsToHide() {
            const sideMenu = document.querySelector('[class^="aside_container__"]');
            const layoutBody = document.querySelector('#layout-body');
            const navigationBarMenuLogo = document.querySelector('[class^="navigation_bar_menu_logo__"]');
            const topicTab = document.querySelector('[class^="topic_tab_container__"]');
            const toolbar = document.querySelector('[class^="toolbar_section__"]');
            let allDone = true;
            if (sideMenu) {
                sideMenu.style.display = 'none';
            } else {
                allDone = false;
            }
            if (layoutBody) {
                layoutBody.style.display = "none";
            } else {
                allDone = false;
            }
            if (navigationBarMenuLogo) {
                navigationBarMenuLogo.style.display = "none";
            } else {
                allDone = false;
            }
            if (topicTab) {
                topicTab.style.display = "none";
            } else {
                allDone = false;
            }
            if (toolbar) {
                toolbar.style.display = "none";
            } else {
                allDone = false;
            }
            document.body.style.background = 'white';
            if (!allDone) setTimeout(waitForElementsToHide, 200);
        })();
    }
    // 상위 페이지에서 타임스탬프 정보를 받음
    handleWindowMessage(e){
        if (e.data.response === "SET_REQUEST_VOD_TS"){
            this.request_vod_ts = e.data.request_vod_ts;
            this.request_real_ts = e.data.request_real_ts;
            // this.log("REQUEST_VOD_TS 받음:", e.data.request_vod_ts, e.data.request_real_ts);
        }
    }
}