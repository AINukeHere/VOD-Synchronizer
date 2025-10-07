import { IVodSync } from './base_class.js';

const BTN_TEXT_IDLE = "Sync VOD";
// SOOP 검색창에 동기화 버튼 추가. 버튼 누르면 동기화 시작
export class SoopVODLinker extends IVodSync{
    constructor(){
        super();
        if (window !== top){
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
    startSyncButtonManagement(){
        setInterval(() => {            
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
    // 동기화 버튼 onclick 핸들러
    async handleFindVODButtonClick(e, button, element){
        e.preventDefault();       // a 태그의 기본 이동 동작 막기
        e.stopPropagation();      // 이벤트 버블링 차단
        const nicknameSpan = element.querySelector('span');
        const streamerNickname = nicknameSpan.innerText;
        button.innerText = `${streamerNickname}의 ID 검색 중...`;
        const streamerId = await window.VODSync.soopAPI.GetStreamerID(streamerNickname);
        if (!streamerId){
            alert("스트리머 ID를 찾을 수 없습니다.");
            button.innerText = BTN_TEXT_IDLE;
            return;
        }
        this.log(`스트리머 ID: ${streamerId}`);

        let reqVodDate = this.getRequestVodDate();
        if (!reqVodDate){
            this.warn("타임스탬프 정보를 받지 못했습니다.");
            button.innerText = BTN_TEXT_IDLE;
            return;
        }

        const search_range_hours = 24*3;
        const start_date = new Date(reqVodDate.getTime() - search_range_hours * 60 * 60 * 1000);
        const end_date = new Date(reqVodDate.getTime() + search_range_hours * 60 * 60 * 1000);
        button.innerText = `${streamerId}의 VOD 검색 중...`;
        const vodList = await window.VODSync.soopAPI.GetSoopVOD_List(streamerId, start_date, end_date);
        for(const vod of vodList.data){
            const vodInfo = await window.VODSync.soopAPI.GetSoopVodInfo(vod.title_no);
            if (vodInfo === null){
                continue;
            }
            const period = vodInfo.data.write_tm;
            const splitres = period.split(' ~ ');
            const start_date = new Date(splitres[0]);
            const end_date = new Date(splitres[1]);
            if (start_date <= reqVodDate && reqVodDate <= end_date){
                const url = new URL(`https://vod.sooplive.co.kr/player/${vod.title_no}`);
                const change_second = Math.round((reqVodDate.getTime() - start_date.getTime()) / 1000);
                url.searchParams.set('change_second', change_second);
                const request_vod_ts = reqVodDate.getTime();
                url.searchParams.set('request_vod_ts', request_vod_ts);
                this.processRequestRealTS(url);
                window.open(url, "_blank");
                this.log(`VOD 링크: ${url.toString()}`);
                button.innerText = BTN_TEXT_IDLE;
                return;
            }
        }
        alert("동기화할 다시보기가 없습니다.");
        button.innerText = BTN_TEXT_IDLE;
    }
    // 검색 결과 페이지에서 검색 결과 영역만 남기고 나머지는 숨기게 함. (SOOP sync panel에서 iframe으로 열릴 때 사용)
    setupSearchAreaOnlyMode() {
        (function waitForGnbAndSearchArea() {
            const gnb = document.querySelector('#soop-gnb');
            const searchArea = document.querySelector('.sc-hvigdm.khASjK.topSearchArea');
            const backBtn = document.querySelector('#topSearchArea > div > div > button');
            let allDone = true;
            if (gnb) {
                Array.from(gnb.parentNode.children).forEach(sibling => {
                    if (sibling !== gnb) sibling.style.display = 'none';
                });
            } else {
                allDone = false;
            }
            if (searchArea) {
                searchArea.style.display = "flow";
                Array.from(searchArea.parentNode.children).forEach(sibling => {
                    if (sibling !== searchArea) sibling.remove();
                });
            } else {
                allDone = false;
            }
            if (backBtn) {
                backBtn.style.display = "none";
            } else {
                allDone = false;
            }
            document.body.style.background = 'white';
            if (!allDone) setTimeout(waitForGnbAndSearchArea, 200);
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