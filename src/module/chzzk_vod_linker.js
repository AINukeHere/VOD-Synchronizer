import { VODLinkerBase } from './base_vod_linker.js';

export class ChzzkVODLinker extends VODLinkerBase{
    /**
     * @description 검색 결과 페이지에서 검색 결과 영역만 남기고 나머지는 숨기게 함. (other sync panel에서 iframe으로 열릴 때 사용)
     * @override
     */
    setupSearchAreaOnlyMode() {
        super.setupSearchAreaOnlyMode();
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
    /**
     * @description 동기화 버튼을 생성할 요소를 반환
     * @returns {NodeList} 동기화 버튼을 생성할 요소들
     * @override
     */
    getTargetsForCreateSyncButton(){
        // if (!window.location.pathname.includes('/video/')) return; // 다시보기 페이지가 아니면 버튼 생성 X

        const searchHeader = document.querySelector('div[class^="search_header_"]');
        if (searchHeader) return; // 검색 결과 없음 → 버튼 생성 X

        const targets = document.querySelectorAll('div[class^="search_container__"] > div > ul > li > a');
        return targets;
    }
    /**
     * @description 동기화 버튼을 생성
     * @returns {HTMLButtonElement} 동기화 버튼
     * @override
     */
    createSyncButton(){
        const button = document.createElement('button');
        button.className = this.SYNC_BUTTON_CLASSNAME;
        button.innerText = this.BTN_TEXT_IDLE;
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
    /**
     * @description 스트리머 이름을 반환
     * @param {HTMLButtonElement} button 동기화 버튼
     * @returns {string} 스트리머 이름
     * @override
     */
    getStreamerName(button){
        const searchWordSpan = button.parentElement.querySelector('[class^="search_keyword__"]');
        if (!searchWordSpan) return null;
        return searchWordSpan.innerText;
    }
    /**
     * @description 스트리머 ID를 반환
     * @param {string} searchWord 검색어
     * @returns {string} 스트리머 ID
     * @override
     */
    async getStreamerId(searchWord){
        const apiResponse = await window.VODSync.chzzkAPI.SearchChannels(searchWord, 1);
        const channels = apiResponse?.content?.data;
        const firstChannel = channels?.[0]?.channel;
        return firstChannel?.channelId;
    }
    /**
     * @description 다시보기를 찾음
     * @param {HTMLButtonElement} button 동기화 버튼
     * @param {string} streamerId 스트리머 ID
     * @param {string} streamerName 스트리머 이름
     * @param {Date} requestDate 요청 시간
     * @returns {Object} {vodLink: string, startDate: Date, endDate: Date} or null
     * @override
     */
    async findVodByDatetime(button, streamerId, streamerName, requestDate) {
        
        // 첫 번째 페이지부터 차례대로 조회
        for (let page = 0; true; page++) {
            this.log(`페이지 ${page} 검색 중...`);
            
            // VOD 목록 조회 (API 1회 호출)
            const searchResult = await window.VODSync.chzzkAPI.GetChzzkVOD_List(streamerId, 16, page);
            button.innerText = `${streamerName}의 다시보기를 찾는 중... (${page+1}/${searchResult.content.totalPages})`;
            if (!searchResult || !searchResult.content || searchResult.content.data.length === 0) {
                this.log(`페이지 ${page}: VOD 목록이 비어있음`);
                return null;
            }
            
            const vodList = searchResult.content.data;
            this.log(`페이지 ${page}: ${vodList.length}개 VOD 발견`);
            
            // 현재 페이지에서 VOD 찾기
            // 현재 페이지의 마지막 vod가 요청 시점보다 48시간 이상 과거인 경우 다음 페이지 검색
            // 현재 페이지의 첫 vod가 요청 시점보다 48시간 이상 미래인 경우 동기화할 다시보기가 없다고 판단
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
    closeSearchArea(){
        const closeButton = document.querySelector('[class^="search_close_button__"]');
        if (closeButton){
            closeButton.click();
        }
    }
}