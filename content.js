if (window == top) {
    const BTN_TEXT_IDLE = "Find VOD";
    const BTN_TEXT_FINDING_STREAMER_ID = "스트리머 ID를 찾는 중...";
    const BTN_TEXT_FINDING_VOD = "다시보기를 찾는 중...";
    let tsManager = null;
    let vodLinker = null;
    function log(...data){
        console.log('[content.js]', data);
    }

    class TimestampTooltipManager {
        constructor() {
            this.playTimeTag = null;
            this.streamPeriodTag = null;
            this.tooltip = null;
            this.observer = null;
            this.isEditing = false;
            this.requestGlobalTS = null;
            this.startMonitoring();
        }
        startMonitoring() {
            this.observeDOMChanges();
            this.createTooltip();
        }
        createTooltip() {
            if (!this.tooltip) {
                this.tooltip = document.createElement("div");
                this.tooltip.style.position = "fixed";
                this.tooltip.style.bottom = "20px";
                this.tooltip.style.right = "20px";
                this.tooltip.style.background = "black";
                this.tooltip.style.color = "white";
                this.tooltip.style.padding = "8px 12px";
                this.tooltip.style.borderRadius = "5px";
                this.tooltip.style.fontSize = "14px";
                this.tooltip.style.whiteSpace = "nowrap";
                this.tooltip.style.display = "block";
                this.tooltip.style.zIndex = "1000";
                this.tooltip.contentEditable = "false";
                document.body.appendChild(this.tooltip);

                this.tooltip.addEventListener("dblclick", () => {
                    this.tooltip.contentEditable = "true";
                    this.tooltip.focus();
                    this.isEditing = true;
                    this.tooltip.style.outline = "2px solid red"; 
                    this.tooltip.style.boxShadow = "0 0 10px red";
                });

                this.tooltip.addEventListener("blur", () => {
                    this.tooltip.contentEditable = "false";
                    this.isEditing = false;
                    this.tooltip.style.outline = "none";
                    this.tooltip.style.boxShadow = "none";
                });

                this.tooltip.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        this.processTimestampInput(this.tooltip.innerText.trim());
                        this.tooltip.contentEditable = "false";
                        this.tooltip.blur();
                        this.isEditing = false;
                    }
                });
            }
            this.updateTooltip();
        }
        updateTooltip() {
            setInterval(() => {
                if (!this.tooltip || !this.playTimeTag || !this.streamPeriodTag || this.isEditing) return;
                
                const timestamp = this.getCurDateTime();

                if (timestamp) {
                    this.tooltip.innerText = timestamp.toLocaleString("ko-KR");
                }
                if (this.requestGlobalTS != null){
                    if (!tsManager.moveToGlobalTS(this.requestGlobalTS, false))
                        window.close();
                    this.requestGlobalTS = null;
                }
            }, 1000);
        }
        calculateTimestamp(broadcastInfo, playbackTimeStr) {
            const match = broadcastInfo.match(/방송시간\s*:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);

            if (!match) {
                this.tooltip.innerText = "다시보기만 지원하는 기능입니다.";
                // log("방송 시작 시간을 찾을 수 없습니다.");
                return null;
            }

            const startTime = new Date(match[1]);

            if (isNaN(startTime.getTime())) {
                // log("유효하지 않은 방송 시작 시간입니다.");
                return null;
            }

            const playbackMatch = playbackTimeStr.match(/(\d{2}):(\d{2}):(\d{2})/);
            if (!playbackMatch) {
                log("올바른 재생 시간 형식이 아닙니다.");
                return null;
            }

            const playbackSeconds =
                parseInt(playbackMatch[1]) * 3600 +
                parseInt(playbackMatch[2]) * 60 +
                parseInt(playbackMatch[3]);

            return new Date(startTime.getTime() + playbackSeconds * 1000);
        }
        observeDOMChanges() {
            const targetNode = document.body;
            const config = { childList: true, subtree: true };

            this.observer = new MutationObserver(() => {
                const newPlayTimeTag = document.querySelector('#player > div.player_ctrlBox > div.ctrlBox > div.ctrl > div.time_display > span.time-current');
                const newStreamPeriodTag = document.querySelector("#player_area > div.wrapping.player_bottom > div.broadcast_information > div:nth-child(2) > div.cnt_info > ul > li:nth-child(2) > span");

                if (!newPlayTimeTag || !newStreamPeriodTag) return;
                if (newPlayTimeTag !== this.playTimeTag || newStreamPeriodTag !== this.streamPeriodTag) {
                    log("VOD 변경 감지됨! 요소 업데이트 중...");
                    this.playTimeTag = newPlayTimeTag;
                    this.streamPeriodTag = newStreamPeriodTag;
                }
            });

            this.observer.observe(targetNode, config);
        }
        getStreamPeriod(){
            const broadcastInfo = this.streamPeriodTag.attributes['tip'].value;
            const match = broadcastInfo.match(/방송시간\s*:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) ~ (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);

            if (!match) {
                return null;
            }
            const startTime = new Date(match[1]);
            const endTime = new Date(match[2]);
            return [startTime, endTime];
        }
        getCurDateTime(){
            const playbackTimeStr = this.playTimeTag.innerText.trim();
            const broadcastInfo = this.streamPeriodTag.attributes['tip'].value;
            const timestamp = this.calculateTimestamp(broadcastInfo, playbackTimeStr);
            return timestamp;
        }
        processTimestampInput(input) {
            const match = input.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2}):(\d{2})/);
            
            if (!match) {
                alert("유효한 타임스탬프 형식을 입력하세요. (예: 2024. 10. 22. 오전 5:52:55)");
                return;
            }
        
            let [_, year, month, day, period, hour, minute, second] = match;
            year = parseInt(year);
            month = parseInt(month) - 1; // JavaScript의 Date는 0부터 시작하는 월을 사용
            day = parseInt(day);
            hour = parseInt(hour);
            minute = parseInt(minute);
            second = parseInt(second);
        
            // 오전/오후 변환
            if (period === "오후" && hour !== 12) {
                hour += 12;
            } else if (period === "오전" && hour === 12) {
                hour = 0;
            }
        
            const globalDateTime = new Date(year, month, day, hour, minute, second);
            
            if (isNaN(globalDateTime.getTime())) {
                alert("유효한 날짜로 변환할 수 없습니다.");
                return;
            }
        
            this.moveToGlobalTS(globalDateTime.getTime());
        }
        moveToGlobalTS(globalTS, doAlert = true) {
            const [streamStartDateTime, streamEndDateTime] = this.getStreamPeriod();
            const globalDateTime = new Date(parseInt(globalTS));

            if (streamStartDateTime > globalDateTime || globalDateTime > streamEndDateTime) {
                if (doAlert) {
                    alert("입력한 타임스탬프가 방송 기간 밖입니다.");
                }
                return false;
            }
            const playbackTime = Math.floor((globalDateTime.getTime() - streamStartDateTime.getTime()) / 1000);
            const url = new URL(window.location.href);
            url.searchParams.delete('change_global_ts');
            url.searchParams.set('change_second', playbackTime);
            // alert('goto change_global_ts');
            window.location.replace(url.toString());
            return true;
        }
    }
    class VODLinker{
        constructor(){
            this.lastRequest = null;
            this.lastRequestFailedMessage = null;
            this.buttons=[];
            this.curProcessingBtn = null;
            this.iframe=null;
            this.init();            
        }
        init(){
            this.createTemp();
            this.updateFindVODButtons();
        }
        findVODList(streamer_id){
            vodLinker.curProcessingBtn.innerText = BTN_TEXT_FINDING_VOD;
            const datetime = tsManager.getCurDateTime();
            const year = datetime.getFullYear();
            const month = datetime.getMonth()+1;
            const monthsParam = `${year}${String(month).padStart(2,"0")}`;

            const url = new URL(`https://ch.sooplive.co.kr/${streamer_id}/vods/review`);
            url.searchParams.set("page",1);
            url.searchParams.set("months",`${monthsParam}${monthsParam}`);
            url.searchParams.set("perPage", 60);
            const reqUrl = new URL(url.toString());
            reqUrl.searchParams.set("p_request", "GET_VOD_LIST");
            reqUrl.searchParams.set("req_global_ts", datetime.getTime());
            // `https://ch.sooplive.co.kr/${streamer_id}/vods/review?page=1&months=${monthsParam}${monthsParam}&perPage=60`
            log('VOD List 요청: ', reqUrl.toString());
            this.lastRequest = "GET_VOD_LIST";
            this.lastRequestFailedMessage = `VOD를 찾을 수 없습니다. 시도한 검색페이지: ${url.toString()}`;
            this.lastRequestTimeout = setTimeout(() => {
                alert(this.lastRequestFailedMessage);
                this.iframe.src = "";
                this.curProcessingBtn.innerText = BTN_TEXT_IDLE;
                this.curProcessingBtn = null;
            }, 3000);
            this.iframe.src = reqUrl.toString();
        }
        findStreamerID(nickname){
            vodLinker.curProcessingBtn.innerText = BTN_TEXT_FINDING_STREAMER_ID;
            const encodedNickname = encodeURI(nickname);
            const url = new URL(`https://www.sooplive.co.kr/search`);
            url.searchParams.set("szLocation", "total_search");
            url.searchParams.set("szSearchType", "streamer");
            url.searchParams.set("szKeyword", encodedNickname);
            url.searchParams.set("szStype", "di");
            url.searchParams.set("szActype", "input_field");
            const reqUrl = new URL(url.toString());
            reqUrl.searchParams.set("p_request", "GET_STREAMER_ID");
            // `https://www.sooplive.co.kr/search?szLocation=total_search&szSearchType=streamer&szKeyword=${encodedNickname}&szStype=di&szActype=input_field`;
            log(`find with ${reqUrl.toString()}`);
            this.lastRequest = "GET_STREAMER_ID";
            this.lastRequestFailedMessage = `스트리머 ID를 찾을 수 없습니다. 검색페이지: ${url.toString()}`;
            this.lastRequestTimeout = setTimeout(() => {
                alert(this.lastRequestFailedMessage);
                this.iframe.src = "";
                this.curProcessingBtn.innerText = "Find VOD";
                this.curProcessingBtn = null;
            }, 3000);
            this.iframe.src = reqUrl.toString();
        }
        updateFindVODButtons(){
            setInterval(() => {
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

    tsManager = new TimestampTooltipManager();
    vodLinker = new VODLinker();
    const params = new URLSearchParams(window.location.search);
    const global_ts = params.get("change_global_ts");
    log('global_ts: ', global_ts);
    if (global_ts){
        tsManager.requestGlobalTS = global_ts;
    }
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async function checkOneByOne(vodLinks, request_datetime){
        if (vodLinks.length > 0){
            for (let i = 0; i < vodLinks.length; i++) {
                const link = vodLinks[i];

                const url = new URL(link);
                url.searchParams.delete('change_second');
                url.searchParams.set('change_global_ts', tsManager.getCurDateTime().getTime());
                window.open(url, "_blank");
            }
        }
    }
    window.addEventListener('message', (event) => {
        if (event.data.response === "VOD_LIST"){
            const vodLinks = event.data.resultVODLinks;
            const request_datetime = event.data.request_datetime;
            log("VOD_LIST 받음:", vodLinks);
            vodLinker.clearLastRequest();
            checkOneByOne(vodLinks, request_datetime);
            vodLinker.curProcessingBtn.innerText = "Find VOD";
            vodLinker.curProcessingBtn = null;
        }
        else if (event.data.response === "STREAMER_ID"){
            log("STREAMER_ID 받음:", event.data.streamer_id);
            vodLinker.clearLastRequest();
            vodLinker.findVODList(event.data.streamer_id);
        }
    })
}
