import { IVodSync } from './base_class.js';

const BTN_TEXT_IDLE = "Sync VOD";
const SYNC_BUTTON_CLASSNAME = 'vodSync-sync-btn';
export class ChzzkVODLinker extends IVodSync{
    constructor(isInIframe = false){
        super();
        if (isInIframe){
            const searchParams = new URLSearchParams(window.location.search);
            if (searchParams.get('only_search') === '1'){
                this.setupSearchAreaOnlyMode();
            }
            window.addEventListener('message', this.handleWindowMessage.bind(this));
            this.getRequestVodDate = () => {return new Date(this.request_vod_ts);}
            this.processRequestRealTS = (url) => {
                if (this.request_real_ts){
                    url.searchParams.set('request_real_ts', this.request_real_ts);
                }
            }
        }
        else{
            this.getRequestVodDate = () => {return window.VODSync?.tsManager?.getCurDateTime();}
            this.processRequestRealTS = (url) => {
                if (window.VODSync?.tsManager?.isPlaying()){ // 재생 중인경우 페이지 로딩 시간을 보간하기위해 탭 연 시점을 전달
                    const request_real_ts = Date.now();
                    url.searchParams.set('request_real_ts', request_real_ts);
                }
            }
        }
        this.startSyncButtonManagement();
    }
    // 주기적으로 동기화 버튼 생성 및 업데이트
    startSyncButtonManagement() {
        setInterval(() => {
            const targets = this.getTargetsForCreateSyncButton();
            if (!targets) return;

            targets.forEach(element => {
                if (element.querySelector(`.${SYNC_BUTTON_CLASSNAME}`)) return; // 이미 동기화 버튼이 있음
                const button = this.createSyncButton();
                button.addEventListener('click', (e) => this.handleFindVODButtonClick(e, button));
                element.appendChild(button);
            });
        }, 500);
    }
    // 동기화 버튼 onclick 핸들러
    async handleFindVODButtonClick(e, button){
        e.preventDefault();       // a 태그의 기본 이동 동작 막기
        e.stopPropagation();      // 이벤트 버블링 차단
        
        // 스트리머 ID 검색
        const streamerName = this.getStreamerName(button);
        if (!streamerName) {
            alert("검색어를 찾을 수 없습니다.");
            button.innerText = BTN_TEXT_IDLE;
            return;
        }
        button.innerText = `${streamerName}로 스트리머 ID 검색 중...`;
        const streamerId = await this.getStreamerId(streamerName);
        if (!streamerId) {
            alert(`${streamerName}의 스트리머 ID를 찾지 못했습니다.`);
            button.innerText = BTN_TEXT_IDLE;
            return;
        }
        this.log(`스트리머 ID: ${streamerId}`);

        const requestDate = this.getRequestVodDate();
        if (!requestDate){
            this.warn("타임스탬프 정보를 받지 못했습니다.");
            button.innerText = BTN_TEXT_IDLE;
            return;
        }
        if (typeof requestDate === 'string'){
            this.warn(requestDate);
            button.innerText = BTN_TEXT_IDLE;
            alert(requestDate);
            return;
        }

        button.innerText = `${streamerName}의 VOD 검색 중...`;
        const vodInfo = await this.findVodByDatetime(button, streamerId, streamerName, requestDate);
        if (!vodInfo){
            alert("동기화할 다시보기를 찾지 못했습니다.");
            button.innerText = BTN_TEXT_IDLE;
            return;
        }
        this.log(`다시보기 정보: ${vodInfo.vodLink}, ${vodInfo.startDate}, ${vodInfo.endDate}`);
        const url = new URL(vodInfo.vodLink);
        const change_second = Math.round((requestDate.getTime() - vodInfo.startDate.getTime()) / 1000);
        url.searchParams.set('change_second', change_second);
        url.searchParams.set('request_vod_ts', requestDate.getTime());
        this.processRequestRealTS(url);
        window.open(url, "_blank");
        this.log(`VOD 링크: ${url.toString()}`);
        button.innerText = BTN_TEXT_IDLE;
    }
    // 상위 페이지에서 타임스탬프 정보를 받음 (other sync panel에서 iframe으로 열릴 때 사용)
    handleWindowMessage(e){
        if (e.data.response === "SET_REQUEST_VOD_TS"){
            this.request_vod_ts = e.data.request_vod_ts;
            this.request_real_ts = e.data.request_real_ts;
            // this.log("REQUEST_VOD_TS 받음:", e.data.request_vod_ts, e.data.request_real_ts);
        }
    }
    // 검색 결과 페이지에서 검색 결과 영역만 남기고 나머지는 숨기게 함. (other sync panel에서 iframe으로 열릴 때 사용)
    setupSearchAreaOnlyMode() {
        (function waitForElementsToHide() {
            const searchContainer = document.querySelector('[class^="search_container__"]');
            const sideMenu = document.querySelector('[class^="aside_container__"]');
            const layoutBody = document.querySelector('#layout-body');
            const navigationBarMenuLogo = document.querySelector('[class^="navigation_bar_menu_logo__"]');
            const topicTab = document.querySelector('[class^="topic_tab_container__"]');
            const toolbar = document.querySelector('[class^="toolbar_section__"]');
            let allDone = true;
            if (searchContainer){
                searchContainer.style.maxWidth = '500px';
                searchContainer.style.minWidth = '500px';
            }
            else{
                allDone = false;
            }
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
    getTargetsForCreateSyncButton(){
        // if (!window.location.pathname.includes('/video/')) return; // 다시보기 페이지가 아니면 버튼 생성 X

        const searchHeader = document.querySelector('div[class^="search_header_"]');
        if (searchHeader) return; // 검색 결과 없음 → 버튼 생성 X

        const targets = document.querySelectorAll('div[class^="search_container__"] > div > ul > li > a');
        return targets;
    }
    createSyncButton(){
        const button = document.createElement('button');
        button.className = SYNC_BUTTON_CLASSNAME;
        button.innerText = BTN_TEXT_IDLE;
        button.style.background = '#00d564';
        button.style.color = 'black';
        button.style.fontSize = '12px';
        button.style.marginLeft = '12px';
        button.style.padding = '4px 8px';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';
        return button;
    }
    getStreamerName(button){
        const searchWordSpan = button.parentElement.querySelector('[class^="search_keyword__"]');
        if (!searchWordSpan) return null;
        return searchWordSpan.innerText;
    }
    async getStreamerId(searchWord){
        const apiResponse = await window.VODSync.chzzkAPI.SearchChannels(searchWord, 1);
        const channels = apiResponse?.content?.data;
        const firstChannel = channels?.[0]?.channel;
        return firstChannel?.channelId;
    }
    /**
     * @description Get CHZZK VOD by datetime
     * @param {Element} button 
     * @param {string|number} channelId 
     * @param {string} channelName 
     * @param {Date} requestDate 
     * @returns {Object} {vodLink: string, startDate: Date, endDate: Date} or null
     */
    async findVodByDatetime(button, channelId, channelName, requestDate) {
        
        // 첫 번째 페이지부터 차례대로 조회
        for (let page = 0; true; page++) {
            this.log(`페이지 ${page} 검색 중...`);
            
            // VOD 목록 조회 (API 1회 호출)
            const searchResult = await window.VODSync.chzzkAPI.GetChzzkVOD_List(channelId, 16, page);
            button.innerText = `${channelName}의 다시보기를 찾는 중... (${page+1}/${searchResult.content.totalPages})`;
            if (!searchResult || !searchResult.content || searchResult.content.data.length === 0) {
                this.log(`페이지 ${page}: VOD 목록이 비어있음`);
                return null;
            }
            
            const vodList = searchResult.content.data;
            this.log(`페이지 ${page}: ${vodList.length}개 VOD 발견`);
            
            // 현재 페이지에서 VOD 찾기
            // 현재페이지의 첫 vod보다 48시간 이상 미래이거나 마지막 vod보다 48시간 이상 과거인 경우 동기화할 다시보기가 없다고 판단
            const lastVodPublishDate = new Date(vodList[vodList.length-1].publishDateAt);
            const timeDiffWithLast = lastVodPublishDate.getTime() - requestDate.getTime();
            const maxDiff = 48 * 60 * 60 * 1000;
            if (timeDiffWithLast > maxDiff) {
                this.log(`현재 페이지의 마지막 vod가 요청 시점보다 48시간 이상 최근이므로 현재 페이지에는 요청 시점이 없다고 판단`);
                continue;
            }
            const firstVodPublishDate = new Date(vodList[0].publishDateAt);
            const timeDiffWithFirst = requestDate.getTime() - firstVodPublishDate.getTime();
            if (timeDiffWithFirst > maxDiff) {
                this.log(`현재 페이지의 첫 vod가 요청 시점보다 48시간 이상 최근이므로 더이상 다음 페이지(과거)에서 찾을 필요가 없다고 판단`);
                return null;
            }

            const result = await this.findVodInPage(vodList, requestDate);
            if (result) {
                return result;
            }

            if (searchResult.content.totalPages <= page+1){ // page는 0부터 시작하므로 1 더해서 비교
                this.log('끝 페이지에 도달함. 검색 종료');
                break;
            }
        }
        return null;
    }
    /**
     * @description 특정 페이지에서 VOD 찾기
     * @param {Array} vodList 
     * @param {Date} requestDateTime 
     * @returns {Object|null}
     */
    async findVodInPage(vodList, requestDateTime) {
        for( let i = vodList.length - 1; i >= 0; i--) { // 역순으로 순회 (과거것부터(추정) 검사)
            const vod = vodList[i];
            const vodPublishDate = new Date(vod.publishDateAt);

            // 요청 시점이 publishDate보다 미래라면 넘어가기 (publishDate는 반드시 해당vod의 끝 시점보다도 미래이므로 항상 요청시점은 해당 vod가 끝난 이후이다.)
            if (requestDateTime > vodPublishDate) {
                this.log(`VOD ${vod.videoNo}: publishDate가 요청 시점보다 과거이므로 스킵`);
                continue;
            }
            
            // 요청 시점이 포함된 다시보기일 수 있으므로 VOD 디테일 조회
            this.log(`VOD ${vod.videoNo}: 요청 시점이 포함될 수 있으므로 상세 정보 조회`);
            
            const vodDetail = await window.VODSync.chzzkAPI.getVodDetailWithCache(vod.videoNo);
            if (!vodDetail) {
                this.log(`VOD ${vod.videoNo}: 상세 정보를 가져올 수 없음`);
                continue;
            }
            
            // VOD의 시작 시점과 끝 시점 계산
            const startTime = await window.VODSync.chzzkAPI.calculateVodStartTime(vodDetail);
            const endTime = new Date(startTime.getTime() + vodDetail.duration * 1000);
            
            this.log(`VOD ${vod.videoNo}: ${startTime.toISOString()} ~ ${endTime.toISOString()}`);
            
            // 요청 시점이 VOD의 시간 범위에 포함되는지 확인
            if (startTime <= requestDateTime && requestDateTime <= endTime) {
                const vodLink = `https://chzzk.naver.com/video/${vod.videoNo}`;
                this.log(`찾은 VOD: ${vodLink}, 시간: ${startTime.toISOString()} ~ ${endTime.toISOString()}`);
                
                return {
                    vodLink: vodLink,
                    startDate: startTime,
                    endDate: endTime
                };
            }
        }
        
        return null;
    }
}