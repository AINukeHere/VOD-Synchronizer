
const BTN_TEXT_IDLE = "Find VOD";
const BTN_TEXT_FINDING_STREAMER_ID = "스트리머 ID를 찾는 중...";
const BTN_TEXT_FINDING_VOD = "다시보기를 찾는 중...";

// SOOP 검색창에 동기화 버튼 추가, 버튼 누르면 iframe에서 스트리머 ID 찾고 다시보기 링크 요청
export class SoopVODLinker{
    constructor(){
        this.lastRequest = null;
        this.lastRequestFailedMessage = null;
        this.buttons=[];
        this.curProcessingBtn = null;
        this.iframe=null;
        this.requestSystemTime = null; // VOD List 요청한 시스템 시간 저장
        
        // VODSync 네임스페이스에 자동 등록
        window.VODSync = window.VODSync || {};
        if (window.VODSync.soopVODLinker) {
            console.warn('[VODSync] SoopVODLinker가 이미 존재합니다. 기존 인스턴스를 덮어씁니다.');
        }
        window.VODSync.soopVODLinker = this;
        
        this.init();            
    }
    log(...data){
        logToExtension('[SoopVODLinker]', ...data);
    }
    init(){
        this.createIframe();
        this.SoopSyncButtonManagement();
        window.addEventListener('message', this.handleWindowMessage.bind(this));
    }
    // window message 핸들러
    handleWindowMessage(event){
        if (event.data.response === "SOOP_VOD_LIST"){
            const vodLinks = event.data.resultVODLinks;
            this.log("SOOP_VOD_LIST 받음:", vodLinks);
            this.clearLastRequest();
            this.curProcessingBtn.innerText = BTN_TEXT_IDLE;
            this.curProcessingBtn = null;
            if (vodLinks.length == 0){
                alert("다시보기가 없습니다.");
            }
            else{
                this.checkOneByOne(vodLinks);
            }
        }
        else if (event.data.response === "STATUS_STREAM_ID_CHECKED"){
            this.log("STREAMER_ID 받음:", event.data.streamer_id);
            this.clearLastRequest();
            this.curProcessingBtn.innerText = BTN_TEXT_FINDING_VOD;
        }
    }
    findStreamerID(nickname){
        const tsManager = window.VODSync?.tsManager;
        if (!tsManager) {
            alert('타임스탬프 기능이 비활성화되어 있습니다.');
            return;
        }
        this.curProcessingBtn.innerText = BTN_TEXT_FINDING_STREAMER_ID;
        const encodedNickname = encodeURI(nickname);
        const url = new URL(`https://www.sooplive.co.kr/search`);
        url.searchParams.set("szLocation", "total_search");
        url.searchParams.set("szSearchType", "streamer");
        url.searchParams.set("szKeyword", encodedNickname);
        url.searchParams.set("szStype", "di");
        url.searchParams.set("szActype", "input_field");
        const reqUrl = new URL(url.toString());
        reqUrl.searchParams.set("p_request", "GET_VOD_LIST");
        reqUrl.searchParams.set("request_from", "SOOP");
        reqUrl.searchParams.set("request_vod_ts", tsManager.getCurDateTime().getTime());
        // `https://www.sooplive.co.kr/search?szLocation=total_search&szSearchType=streamer&szKeyword=${encodedNickname}&szStype=di&szActype=input_field`;
        this.log(`find with ${reqUrl.toString()}`);
        this.lastRequest = "GET_VOD_LIST";
        this.lastRequestFailedMessage = `스트리머 ID를 찾을 수 없습니다. 검색페이지: ${url.toString()}`;
        this.lastRequestTimeout = setTimeout(() => {
            alert(this.lastRequestFailedMessage);
            this.iframe.src = "";
            this.curProcessingBtn.innerText = BTN_TEXT_IDLE;
            this.curProcessingBtn = null;
        }, 3000);
        this.iframe.src = reqUrl.toString();
    }
    // 동기화 버튼 onclick 핸들러
    handleFindVODButtonClick(e, button, element){
        e.preventDefault();       // a 태그의 기본 이동 동작 막기
        e.stopPropagation();      // 이벤트 버블링 차단
        if (this.curProcessingBtn != null){
            alert("이미 다른 스트리머를 찾고 있습니다. 잠시 후 다시 시도해주세요.");
            return;
        }
        this.curProcessingBtn = button;
        const nicknameSpan = element.querySelector('span');
        this.findStreamerID(nicknameSpan.innerText);
    }
    // 주기적으로 동기화 버튼 생성 및 업데이트
    SoopSyncButtonManagement(){
        setInterval(() => {
            const tsManager = window.VODSync?.tsManager;
            if (!tsManager || !tsManager.isControllableState) return;
            
            const searchResults = document.querySelectorAll('#areaSuggest > ul > li > a');
            if (!searchResults) return;

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
                    button.addEventListener('click', (e) => this.handleFindVODButtonClick(e, button, element));
                }
            });
        }, 500);
    }
    createIframe(){
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
    checkOneByOne(vodLinks){
        const tsManager = window.VODSync?.tsManager;
        if (!tsManager) {
            this.log('타임스탬프 매니저가 없습니다.');
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
}