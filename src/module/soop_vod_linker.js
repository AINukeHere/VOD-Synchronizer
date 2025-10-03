
const BTN_TEXT_IDLE = "Sync VOD";

// SOOP 검색창에 동기화 버튼 추가. 버튼 누르면 동기화 시작
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
        
        this.SoopSyncButtonManagement(); 
    }

    log(...data){
        logToExtension('[SoopVODLinker]', ...data);
    }
    // 동기화 버튼 onclick 핸들러
    async handleFindVODButtonClick(e, button, element){
        e.preventDefault();       // a 태그의 기본 이동 동작 막기
        e.stopPropagation();      // 이벤트 버블링 차단
        const nicknameSpan = element.querySelector('span');
        const streamerNickname = nicknameSpan.innerText;
        button.innerText = `${streamerNickname}의 ID 검색 중...`;
        const streamerId = await this.GetStreamerID(nicknameSpan.innerText);
        if (!streamerId){
            alert("스트리머 ID를 찾을 수 없습니다.");
            button.innerText = BTN_TEXT_IDLE;
            return;
        }
        this.log(`스트리머 ID: ${streamerId}`);
        const tsManager = window.VODSync?.tsManager;
        if (!tsManager){
            alert("타임스탬프 기능을 감지하지 못했습니다.");
            button.innerText = BTN_TEXT_IDLE;
            return;
        }
        const video_ts = tsManager.getCurDateTime();
        const search_range_hours = 24;
        const start_date = new Date(video_ts.getTime() - search_range_hours * 60 * 60 * 1000);
        const end_date = new Date(video_ts.getTime() + search_range_hours * 60 * 60 * 1000);
        this.log(`start_date: ${start_date}, end_date: ${end_date}`);
        button.innerText = `${streamerId}의 VOD 검색 중...`;
        const vodList = await this.GetSoopVOD_List(streamerId, start_date, end_date);
        if (vodList.data.length === 0){
            alert("동기화할 다시보기가 없습니다.");
            button.innerText = BTN_TEXT_IDLE;
            return;
        }
        for(const vod of vodList.data){
            const period = await this.GetSoopVOD_period(vod.title_no);
            if (period === null){
                continue;
            }
            const splitres = period.split(' ~ ');
            const start_date = new Date(splitres[0]);
            const end_date = new Date(splitres[1]);
            if (start_date <= video_ts && video_ts <= end_date){
                const url = new URL(`https://vod.sooplive.co.kr/player/${vod.title_no}`);
                const request_vod_ts = video_ts.getTime();
                url.searchParams.set('request_vod_ts', request_vod_ts);
                if (tsManager.isPlaying()){ // 재생 중인경우 페이지 로딩 시간을 보간하기위해 탭 연 시점을 전달
                    const request_real_ts = Date.now();
                    url.searchParams.set('request_real_ts', request_real_ts);
                }
                window.open(url, "_blank");
                this.log(`VOD 링크: ${url.toString()}`);
                button.innerText = BTN_TEXT_IDLE;
                return;
            }
        }
        button.innerText = BTN_TEXT_IDLE;
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
    /**
     * @description Get Soop VOD Period
     * @param {Number} videoId 
     * @returns {string} period or null
     */
    async GetSoopVOD_period(videoId) {
        const a = await fetch("https://api.m.sooplive.co.kr/station/video/a/view", {
            "headers": {
                "accept": "application/json, text/plain, */*",
                "content-type": "application/x-www-form-urlencoded",
                "Referer": `https://vod.sooplive.co.kr/player/${videoId}`
            },
            "body": `nTitleNo=${videoId}&nApiLevel=11&nPlaylistIdx=0`,
            "method": "POST"
        });
        if (a.status !== 200){
            return null;
        }
        const b = await a.json();
        return b.data.write_tm;
    }
    async GetStreamerID(nickname){
        const encodedNickname = encodeURI(nickname);
        const url = new URL('https://sch.sooplive.co.kr/api.php');
        url.searchParams.set("m", "searchHistory");
        url.searchParams.set("d", encodedNickname);
        this.log(`GetStreamerID: ${url.toString()}`);
        const res = await fetch(url.toString());
        if (res.status !== 200){
            return null;
        }
        const b = await res.json();
        return b.suggest_bj[0].user_id;
    }
    /**
     * @description Get Soop VOD List
     * @param {string} streamerId 
     * @param {Date} start_date
     * @param {Date} end_date
     * @returns 
     */
    async GetSoopVOD_List(streamerId, start_date, end_date){
        const start_date_str = start_date.toISOString().slice(0, 10).replace(/-/g, '');
        const end_date_str = end_date.toISOString().slice(0, 10).replace(/-/g, '');
        const url = new URL(`https://chapi.sooplive.co.kr/api/${streamerId}/vods/review`);
        url.searchParams.set("keyword", "");
        url.searchParams.set("orderby", "reg_date");
        url.searchParams.set("page", "1");
        url.searchParams.set("field", "title,contents,user_nick,user_id");
        url.searchParams.set("per_page", "60");
        url.searchParams.set("start_date", start_date_str);
        url.searchParams.set("end_date", end_date_str);
        this.log(`GetSoopVOD_List: ${url.toString()}`);
        const res = await fetch(url.toString());
        const b = await res.json();
        return b;
    }
}