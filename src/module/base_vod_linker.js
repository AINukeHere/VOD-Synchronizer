import { IVodSync } from './interface4log.js';

export class VODLinkerBase extends IVodSync{
    constructor(isInIframe = false){
        super();
        this.BTN_TEXT_IDLE = "Sync VOD";
        this.SYNC_BUTTON_CLASSNAME = 'vodSync-sync-btn';
        if (isInIframe){
            const searchParams = new URLSearchParams(window.location.search);
            if (searchParams.get('only_search') === '1'){
                this.setupSearchAreaOnlyMode();
            }
            window.addEventListener('message', this.handleWindowMessage.bind(this));
            this.getRequestVodDate = () => {return new Date(this.request_vod_ts);}
            this.getRequestRealTS = () => {
                if (this.request_real_ts){
                    return this.request_real_ts;
                }
                return null;
            }
        }
        else{
            this.getRequestVodDate = () => {return window.VODSync?.tsManager?.getCurDateTime();}
            this.getRequestRealTS = () => {
                if (window.VODSync?.tsManager?.isPlaying()){ // 재생 중인경우 페이지 로딩 시간을 보간하기위해 탭 연 시점을 전달
                    return Date.now();
                }
                return null;
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
                if (element.querySelector(`.${this.SYNC_BUTTON_CLASSNAME}`)) return; // 이미 동기화 버튼이 있음
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
            button.innerText = this.BTN_TEXT_IDLE;
            return;
        }
        button.innerText = `${streamerName}로 ID 검색 중`;
        const streamerId = await this.getStreamerId(streamerName);
        if (!streamerId) {
            alert(`${streamerName}의 스트리머 ID를 찾지 못했습니다.`);
            button.innerText = this.BTN_TEXT_IDLE;
            return;
        }
        this.debug(`스트리머 ID: ${streamerId}`);

        const requestDate = this.getRequestVodDate();
        const request_real_ts = this.getRequestRealTS();
        
        if (!requestDate){
            this.warn("타임스탬프 정보를 받지 못했습니다.");
            button.innerText = this.BTN_TEXT_IDLE;
            return;
        }
        if (typeof requestDate === 'string'){
            this.warn(requestDate);
            button.innerText = this.BTN_TEXT_IDLE;
            alert(requestDate);
            return;
        }

        button.innerText = `${streamerName}의 VOD 검색 중...`;
        const vodInfo = await this.findVodByDatetime(button, streamerId, streamerName, requestDate);
        if (!vodInfo){
            alert("동기화할 다시보기를 찾지 못했습니다.");
            button.innerText = this.BTN_TEXT_IDLE;
            return;
        }
        this.log(`다시보기 정보: ${vodInfo.vodLink}, ${vodInfo.startDate}, ${vodInfo.endDate}`);
        const url = new URL(vodInfo.vodLink);
        const change_second = Math.round((requestDate.getTime() - vodInfo.startDate.getTime()) / 1000);
        url.searchParams.set('change_second', change_second);
        url.searchParams.set('request_vod_ts', requestDate.getTime());
        if (request_real_ts){
            url.searchParams.set('request_real_ts', request_real_ts);
        }
        window.open(url, "_blank");
        this.log(`VOD 링크: ${url.toString()}`);
        button.innerText = this.BTN_TEXT_IDLE;
    }
    // 상위 페이지에서 타임스탬프 정보를 받음 (other sync panel에서 iframe으로 열릴 때 사용)
    handleWindowMessage(e){
        if (e.data.response === "SET_REQUEST_VOD_TS"){
            this.request_vod_ts = e.data.request_vod_ts;
            this.request_real_ts = e.data.request_real_ts;
            // this.log("REQUEST_VOD_TS 받음:", e.data.request_vod_ts, e.data.request_real_ts);
        }
    }
    /**
     * @description 검색 결과 페이지에서 검색 영역만 남기게 함. (other sync panel에서 iframe으로 열릴 때 사용)
     */
    setupSearchAreaOnlyMode() {
        document.documentElement.style.overflow = "hidden";
        // 파생 클래스들이 오버라이드하여 구현하되 super.setupSearchAreaOnlyMode()를 호출해야함
        
    }
    /**
     * @description 동기화 버튼을 생성할 요소를 반환
     * @returns {NodeList} 동기화 버튼을 생성할 요소들
     */
    getTargetsForCreateSyncButton(){
        // 파생 클래스들이 오버라이드하여 구현해야함
        throw new Error("Not implemented");
    }
    /**
     * @description 동기화 버튼을 생성
     * @returns {HTMLButtonElement} 동기화 버튼
     */
    createSyncButton(){
        // 파생 클래스들이 오버라이드하여 구현해야함
        throw new Error("Not implemented");
    }
    /**
     * @description 스트리머 이름을 반환
     * @param {HTMLButtonElement} button 동기화 버튼
     * @returns {string} 스트리머 이름
     */
    getStreamerName(button){
        // 파생 클래스들이 오버라이드하여 구현해야함
        throw new Error("Not implemented");
    }
    /**
     * @description 스트리머 ID를 반환
     * @param {string} searchWord 검색어
     * @returns {string} 스트리머 ID
     */
    async getStreamerId(searchWord){
        // 파생 클래스들이 오버라이드하여 구현해야함
        throw new Error("Not implemented");
    }
    /**
     * @description 다시보기를 찾음
     * @param {HTMLButtonElement} button 동기화 버튼
     * @param {string} streamerId 스트리머 ID
     * @param {string} streamerName 스트리머 이름
     * @param {Date} requestDate 요청 시간
     * @returns {Object} {vodLink: string, startDate: Date, endDate: Date} or null
     */
    async findVodByDatetime(button, streamerId, streamerName, requestDate) {
        // 파생 클래스들이 오버라이드하여 구현해야함
        throw new Error("Not implemented");
    }
}