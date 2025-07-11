// ==UserScript==
// @name         VOD Synchronizer
// @namespace    http://tampermonkey.net/
// @version      0.0.8
// @description  SOOP 다시보기 VOD를 시청하면 우측 하단에 당시의 타임스탬프를 표시합니다. 타임스탬프를 클릭하여 수정하고 엔터를 누르면 알맞는 재생시간으로 새로고침합니다. 상단 기본 Soop 검색창에 다른 스트리머를 검색하여 Find VOD 버튼을 누르면 그 스트리머의 VOD에서 동일시점을 찾고 새 탭에서 열립니다.
// @author       AINukeHere
// @match        https://vod.sooplive.co.kr/*
// @match        https://ch.sooplive.co.kr/*
// @match        https://www.sooplive.co.kr/*
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // iframe 내부에서 실행되는 경우 (vod_get.js, streamerID_get.js 기능)
    if (window !== top) {
        // vod_get.js 기능
        if (window.location.hostname === 'ch.sooplive.co.kr') {
            function log(...data){
                console.log('[vod_get.js]', ...data);
            }
            
            function GetVodList(datetime){
                const dateSpanElements = document.querySelectorAll('#contents > div > div > section > section.vod-list > ul > li > div.vod-info > div > span.date');
                const vodLinkList = document.querySelectorAll('#contents > div > div > section > section.vod-list > ul > li > div.vod-info > p > a');
                if (dateSpanElements.length == 0) return null;
                if (vodLinkList.length == 0) return null;
                log("date length", dateSpanElements.length);
                log("link length", vodLinkList.length);
                const request_year = datetime.getFullYear();
                const request_month = datetime.getMonth()+1;
                const request_day = datetime.getDate();
                let resultVODLinks = [];
                let prevMonth = 0;
                let prevDay = 0;
                for (var i = dateSpanElements.length - 1; i >= 0 ; --i){
                    const innerText = dateSpanElements[i].innerText;
                    let year, month, day;
                    
                    // HH시간전 형식인지 체크
                    const timeAgoMatch = innerText.match(/(\d+)시간 전/);
                    if (timeAgoMatch) {
                        const hoursAgo = parseInt(timeAgoMatch[1]);
                        const uploadDate = new Date();
                        uploadDate.setHours(uploadDate.getHours() - hoursAgo);
                        year = uploadDate.getFullYear();
                        month = uploadDate.getMonth() + 1;
                        day = uploadDate.getDate();
                        log(`시간전 형식 파싱: ${hoursAgo}시간전 -> ${year}-${month}-${day}`);
                    } else {
                        // YYYY-MM-DD 형식 처리
                        const [_year, _month, _day] = innerText.split("-");
                        year = parseInt(_year);
                        month = parseInt(_month);
                        day = parseInt(_day);
                    }
                    
                    if (i < dateSpanElements.length - 1){
                        if (prevMonth > request_month || prevDay > request_day){
                            break;
                        }
                    }
                    if (year >= request_year && month >= request_month && day >= request_day){
                        resultVODLinks.push(vodLinkList[i].href);
                        prevMonth = month;
                        prevDay = day;
                        log(`vod added: ${month}-${day} ${vodLinkList[i].href}`);
                    }
                }
                // TODO: 최대치까지 표시됐다면 다음 페이지 검색필요
                // if (vodLinkList.length == 60)

                return resultVODLinks;
            }
            
            function TryGetVodList(request_datetime){
                const intervalID = setInterval(() => {
                    const resultVODLinks = GetVodList(request_datetime);
                    log("TryGetVodList");
                    if (resultVODLinks == null) return;
                    // 부모 페이지로 VOD List 를 보냄
                    window.parent.postMessage(
                        {
                            response: "VOD_LIST",
                            request_datetime: request_datetime,
                            resultVODLinks: resultVODLinks
                        }, 
                    "https://vod.sooplive.co.kr");
                    clearInterval(intervalID);
                }, 100);
            }
            
            log('[vod_get.js] in iframe');
            const params = new URLSearchParams(window.location.search);
            const p_request = params.get("p_request");
            if (p_request === "GET_VOD_LIST"){
                const global_ts = params.get("req_global_ts");
                const request_datetime = new Date(parseInt(global_ts));
                TryGetVodList(request_datetime)
            }
            else{
                window.addEventListener("message", (event) => {
                    if(event.data.request === "GET_VOD_LIST"){
                        const resultVODLinks = GetVodList(event.data.datetime);
                        // 부모 페이지로 VOD List 를 보냄
                        event.source.postMessage(
                            {
                                response: "VOD_LIST",
                                request_datetime: event.data.datetime,
                                resultVODLinks: resultVODLinks
                            }, 
                        event.origin);
                    }
                })
            }
        }
        
        // streamerID_get.js 기능
        if (window.location.hostname === 'www.sooplive.co.kr') {
            function log(...data){
                console.log('[streamerID_get.js]', ...data);
            }
            
            log('in iframe');
            function GetStreamerID(nickname){
                const searchResults = document.querySelectorAll('#container > div.search_strm_area > ul > .strm_list');
                let streamer_id = null;
                if (searchResults){
                    searchResults.forEach(element => {
                        const nicknameBtn = element.querySelector('.nick > button');
                        const idSpan = element.querySelector('.id');
                        if (nickname === nicknameBtn.innerText){
                            streamer_id = idSpan.innerText.slice(1,-1);
                        }
                    });
                }
                return streamer_id;
            }
            
            function TryGetStreamerID(nickname){
                const intervalID = setInterval(() => {
                    log("TryGetStreamerID");
                    const streamer_id = GetStreamerID(nickname);
                    if (streamer_id == null) return;
                    // 부모 페이지로 VOD List 를 보냄
                    window.parent.postMessage(
                        {
                            response: "STREAMER_ID",
                            streamer_nickname: nickname,
                            streamer_id: streamer_id
                        }, 
                    "https://vod.sooplive.co.kr");
                    clearInterval(intervalID);
                }, 100);
            }
            
            const params = new URLSearchParams(window.location.search);
            const p_request = params.get("p_request");
            if (p_request === "GET_STREAMER_ID"){
                const request_nickname = params.get("szKeyword");
                const decoded_nickname = decodeURI(request_nickname)
                TryGetStreamerID(decoded_nickname)
            }
            else{
                window.addEventListener("message", (event) =>{
                    if (event.data.request === "GET_STREAMER_ID"){
                        const streamer_nickname = event.data.nickname;
                        const streamer_id = GetStreamerID(streamer_nickname);
                        if (streamer_id != null){
                            event.source.postMessage(
                                {
                                    response: "STREAMER_ID",
                                    streamer_nickname: streamer_nickname,
                                    streamer_id: streamer_id
                                }, 
                            event.origin);
                            log('streamer_id: ', streamer_id);
                        }
                    }
                });
            }
        }
        
        return; // iframe에서는 여기서 종료
    }

    // 메인 페이지에서 실행되는 경우 (content.js 기능)
    const BTN_TEXT_IDLE = "Find VOD";
    const BTN_TEXT_FINDING_STREAMER_ID = "스트리머 ID를 찾는 중...";
    const BTN_TEXT_FINDING_VOD = "다시보기를 찾는 중...";
    let tsManager = null;
    let vodLinker = null;
    
    function log(...data){
        console.log('[VOD Synchronizer]', ...data);
    }

    class TimestampTooltipManager {
        constructor() {
            this.playTimeTag = null;
            this.streamPeriodTag = null;
            this.tooltip = null;
            this.observer = null;
            this.isEditing = false;
            this.requestGlobalTS = null;
            this.requestSystemTime = null;
            this.isControllableState = false;
            this.startMonitoring();
        }
        
        RequestGlobalTSAsync(global_ts, system_time){
            this.requestGlobalTS = global_ts;
            this.requestSystemTime = system_time;
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
                    // 숫자 키 (0-9) - 영상 점프 기능만 차단하고 텍스트 입력은 허용
                    if (/^[0-9]$/.test(event.key)) {
                        // 영상 플레이어의 키보드 이벤트만 차단
                        event.stopPropagation();
                        return;
                    }

                    // Enter 키 처리
                    if (event.key === "Enter") {
                        event.preventDefault();
                        this.processTimestampInput(this.tooltip.innerText.trim());
                        this.tooltip.contentEditable = "false";
                        this.tooltip.blur();
                        this.isEditing = false;
                        return;
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
                    this.isControllableState = true;
                    this.tooltip.innerText = timestamp.toLocaleString("ko-KR");
                }
                if (this.requestGlobalTS != null){
                    const currentSystemTime = Date.now();
                    const timeDifference = currentSystemTime - this.requestSystemTime;
                    const adjustedGlobalTS = this.requestGlobalTS + timeDifference; 
                    if (!tsManager.moveToGlobalTS(adjustedGlobalTS, false))
                        window.close();
                    this.requestGlobalTS = null;
                    this.requestSystemTime = null;
                }
            }, 1000);
        }
        
        calculateTimestamp(broadcastInfo, playbackTimeStr) {
            const match = broadcastInfo.match(/방송시간\s*:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);

            if (!match) {
                this.tooltip.innerText = "다시보기만 지원하는 기능입니다.";
                return null;
            }

            const startTime = new Date(match[1]);

            if (isNaN(startTime.getTime())) {
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
            url.searchParams.delete('request_system_time');
            url.searchParams.set('change_second', playbackTime);
            window.location.replace(url.toString());
            return true;
        }
    }

    class VODLinker {
        constructor(){
            this.lastRequest = null;
            this.lastRequestFailedMessage = null;
            this.buttons=[];
            this.curProcessingBtn = null;
            this.iframe=null;
            this.requestSystemTime = null; // VOD List 요청한 시스템 시간 저장
            this.init();            
        }
        
        init(){
            this.createTemp();
            this.updateFindVODButtons();
        }
        
        findVODList(streamer_id){
            vodLinker.curProcessingBtn.innerText = BTN_TEXT_FINDING_VOD;
            // VOD List 요청한 시스템 시간 저장
            this.requestSystemTime = Date.now();
            log('this.requestSystemTime: ', this.requestSystemTime);
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
                if (!tsManager.isControllableState) return;
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

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function checkOneByOne(vodLinks, request_global_ts){
        if (vodLinks.length > 0){
            for (let i = 0; i < vodLinks.length; i++) {
                const link = vodLinks[i];

                const url = new URL(link);
                url.searchParams.delete('change_second');
                url.searchParams.set('change_global_ts', request_global_ts);
                url.searchParams.set('request_system_time', vodLinker.requestSystemTime);
                window.open(url, "_blank");
            }
        }
    }

    // 초기화
    if (window.location.hostname === 'vod.sooplive.co.kr') {
        tsManager = new TimestampTooltipManager();
        vodLinker = new VODLinker();
        
        const params = new URLSearchParams(window.location.search);
        const global_ts = parseInt(params.get("change_global_ts"));
        const system_time = parseInt(params.get("request_system_time"));
        if (global_ts){
            tsManager.RequestGlobalTSAsync(global_ts, system_time);
        }
        
        window.addEventListener('message', (event) => {
            if (event.data.response === "VOD_LIST"){
                const vodLinks = event.data.resultVODLinks;
                const request_datetime = event.data.request_datetime;
                log("VOD_LIST 받음:", vodLinks);
                vodLinker.clearLastRequest();
                
                checkOneByOne(vodLinks, request_datetime.getTime());
                vodLinker.curProcessingBtn.innerText = "Find VOD";
                vodLinker.curProcessingBtn = null;
            }
            else if (event.data.response === "STREAMER_ID"){
                log("STREAMER_ID 받음:", event.data.streamer_id);
                vodLinker.clearLastRequest();
                vodLinker.findVODList(event.data.streamer_id);
            }
        });
    }
})(); 