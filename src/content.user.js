// ==UserScript==
// @name         VOD Synchronizer (SOOP-SOOP 동기화)
// @namespace    http://tampermonkey.net/
// @version      0.1.3
// @description  SOOP 다시보기 타임스탬프 표시 및 다른 스트리머의 다시보기와 동기화
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

    // 간소화된 로깅 함수
    function log(...data) {
        console.log('[VOD Sync]', ...data);
    }

    // iframe 내부에서 실행되는 경우 (VOD 검색 및 스트리머 ID 검색)
    if (window !== top) {
        // ch.sooplive.co.kr에서 VOD 검색
        if (window.location.hostname === 'ch.sooplive.co.kr') {
            log('[VOD 검색] iframe에서 실행됨');
            
            // VOD 파서 (n시간 전 파싱 지원)
            function parseDateFromText(innerText) {
                // HH시간전 형식인지 체크
                const timeAgoMatch = innerText.match(/(\d+)시간 전/);
                if (timeAgoMatch) {
                    const hoursAgo = parseInt(timeAgoMatch[1]);
                    const uploadDate = new Date();
                    uploadDate.setHours(uploadDate.getHours() - hoursAgo);
                    const year = uploadDate.getFullYear();
                    const month = uploadDate.getMonth() + 1;
                    const day = uploadDate.getDate();
                    log(`시간전 형식 파싱: ${hoursAgo}시간전 -> ${year}-${month}-${day}`);
                    return { year, month, day };
                } else {
                    // YYYY-MM-DD 형식 처리
                    const [_year, _month, _day] = innerText.split("-");
                    const year = parseInt(_year);
                    const month = parseInt(_month);
                    const day = parseInt(_day);
                    return { year, month, day };
                }
            }

            function getVodInfoList() {
                const textToExplainEmpty = document.querySelector('#contents > div > div > section > section.vod-list > ul > li > p');
                if (textToExplainEmpty && textToExplainEmpty.innerText === '등록된 VOD가 없습니다.'){
                    return [];
                }
                const dateSpanElements = document.querySelectorAll('#contents > div > div > section > section.vod-list > ul > li > div.vod-info > div > span.date');
                const vodLinkList = document.querySelectorAll('#contents > div > div > section > section.vod-list > ul > li > div.vod-info > p > a');
                if (dateSpanElements.length == 0) return null;
                if (vodLinkList.length == 0) return null;
                log("date length", dateSpanElements.length);
                log("link length", vodLinkList.length);
                
                const vodInfoList = [];
                for (var i = 0; i < dateSpanElements.length; ++i){
                    const innerText = dateSpanElements[i].innerText;
                    const { year, month, day } = parseDateFromText(innerText);
                    const vodInfo = {
                        year: year,
                        month: month,
                        day: day,
                        link: vodLinkList[i].href
                    };
                    vodInfoList.push(vodInfo);
                }
                return vodInfoList;
            }

            // 페이지 1에서 동작하는 메인 매니저 클래스
            class PageOneVodManager {
                constructor(requestVodDatetime) {
                    this.requestVodDatetime = requestVodDatetime;
                    this.allVodInfoList = [];
                    this.childVodListInfoList = [];
                    this.expectedChildPages = 0;
                    this.receivedChildPages = 0;
                    this.childIframes = [];
                    
                    this.requestYear = requestVodDatetime.getFullYear();
                    this.requestMonth = requestVodDatetime.getMonth() + 1;
                    this.requestDay = requestVodDatetime.getDate();
                }
                
                log(...data){
                    log('[PageOneVodManager]', ...data);
                }
                
                start() {
                    this.log('시작' + window.location.toString());
                    this.tryGetCurrentPageVodInfo();
                }
                
                tryGetCurrentPageVodInfo() {
                    const intervalID = setInterval(() => {
                        const vodInfoList = getVodInfoList();
                        if (vodInfoList === null) return;
                        
                        this.log('현재 페이지 VOD 정보 수집 완료:', vodInfoList.length);
                        this.allVodInfoList.push(...vodInfoList);
                        this.checkAndCreateChildPages();
                        clearInterval(intervalID);
                    }, 100);
                }
                
                checkAndCreateChildPages() {
                    const pages = document.querySelectorAll('#contents > div > div > section > section.vod-srh_wrap > div > a');
                    this.expectedChildPages = pages.length - 2; // 첫 번째 페이지와 다음페이지 넘김버튼 제외
                        
                    this.log(`추가 페이지 수: ${this.expectedChildPages}`);
                    
                    if (this.expectedChildPages > 0) {
                        // 자식 페이지로부터 메시지 수신 대기
                        window.addEventListener('message', (event) => {
                            if (event.data.response === "SOOP_VOD_INFO_LIST") {
                                this.handleChildPageData(event.data.resultVODInfos);
                            }
                        });
                        for (var i = 1; i < pages.length - 1; ++i) {
                            const page = pages[i];
                            const iframe = document.createElement('iframe');
                            iframe.src = page.href;
                            iframe.style.display = 'none';
                            document.body.appendChild(iframe);
                            this.childIframes.push(iframe); 
                        }
                    } else {
                        // 추가 페이지가 없으면 바로 결과 전송
                        this.sendFinalResult();
                    }
                }
                
                handleChildPageData(childVodInfoList) {
                    this.receivedChildPages++;
                    this.log(`자식 페이지 데이터 수신 (${this.receivedChildPages}/${this.expectedChildPages})`);
                    
                    if (childVodInfoList && childVodInfoList.length > 0) {
                        this.childVodListInfoList.push(childVodInfoList);
                    }
                    
                    this.checkAllDataReceived();
                }
                
                checkAllDataReceived() {
                    if (this.receivedChildPages >= this.expectedChildPages) {
                        this.sendFinalResult();
                    }
                }
                
                sendFinalResult() {
                    const finalVodLinks = this.createFinalVodLinkList();
                    this.log(`최종 VOD 링크 수: ${finalVodLinks.length}`);
                    
                    const message = {
                        response: "VOD_LIST",
                        request_datetime: this.requestVodDatetime,
                        resultVODLinks: finalVodLinks
                    };
                    window.parent.postMessage(message, "https://vod.sooplive.co.kr");
                    window.close();
                }
                
                createFinalVodLinkList() {
                    // 날짜순으로 정렬 (오래된 순)
                    if (this.childVodListInfoList.length > 0) {
                        this.childVodListInfoList.sort((a, b) => {
                            if (a.year !== b.year) return a.year - b.year;
                            if (a.month !== b.month) return a.month - b.month;
                            return a.day - b.day;
                        });
                        for (var i = 0; i < this.childVodListInfoList.length; ++i) {
                            this.allVodInfoList.push(...this.childVodListInfoList[i]);
                        }
                    }
                    
                    let resultVODLinks = [];
                    
                    let firstIndex = -1;
                    let lastIndex = -1;
                    // allVodInfoList는 최근 순으로 정렬되어있음
                    for (var i = 0; i < this.allVodInfoList.length; ++i) {
                        const vodInfo = this.allVodInfoList[i];
                        // 요청날짜보다 더 최근 것 중 가장 오래된 것 찾기
                        if (vodInfo.year > this.requestYear || 
                           (vodInfo.year == this.requestYear && vodInfo.month > this.requestMonth) || 
                           (vodInfo.year == this.requestYear && vodInfo.month == this.requestMonth && vodInfo.day > this.requestDay)) {
                            firstIndex = i;
                        }
                        // 요청날짜보다 더 오래된 것 중 가장 최근 것 찾기
                        else{
                            lastIndex = i;
                            if (vodInfo.year < this.requestYear ||
                                (vodInfo.year == this.requestYear && vodInfo.month < this.requestMonth) ||
                                (vodInfo.year == this.requestYear && vodInfo.month == this.requestMonth && vodInfo.day < this.requestDay)) {
                                break;
                            }
                        }
                    }
                    if (firstIndex == -1) firstIndex = 0;
                    for (var i = firstIndex; i <= lastIndex; ++i) {
                        const vodInfo = this.allVodInfoList[i];
                        resultVODLinks.push(vodInfo.link);
                        this.log(`vod added: ${vodInfo.year}-${vodInfo.month}-${vodInfo.day} ${vodInfo.link}`);
                    }
                    return resultVODLinks;
                }
            }

            // 페이지 2 이상에서 동작하는 자식 페이지 매니저 클래스
            class ChildPageVodManager {
                constructor(requestVodDatetime) {
                    this.requestVodDatetime = requestVodDatetime;
                }
                
                log(...data){
                    log('[ChildPageVodManager]', ...data);
                }
                
                start() {
                    this.log('시작' + window.location.toString());
                    this.tryGetVodInfo();
                }
                
                tryGetVodInfo() {
                    const intervalID = setInterval(() => {
                        const vodInfoList = getVodInfoList();
                        if (vodInfoList === null) return;
                            
                        this.log('VOD 정보 수집 완료:', vodInfoList.length);
                        
                        // 부모 페이지(PageOneVodManager)로 데이터 전송
                        const message = {
                            response: "SOOP_VOD_INFO_LIST",
                            resultVODInfos: vodInfoList
                        };
                        window.parent.postMessage(message, window.origin);
                        window.close();
                        clearInterval(intervalID);
                    }, 100);
                }
            }

            // VOD 검색 요청 처리
            const params = new URLSearchParams(window.location.search);
            const p_request = params.get("p_request");
            const pageNum = parseInt(params.get("page") || "1");
            
            if (p_request === "GET_VOD_LIST") {
                const global_ts = params.get("req_global_ts");
                const request_datetime = new Date(parseInt(global_ts));
                
                if (pageNum === 1) {
                    // 페이지 1: 메인 매니저 실행
                    const pageOneManager = new PageOneVodManager(request_datetime);
                    pageOneManager.start();
                } else {
                    // 페이지 2 이상: 자식 페이지 매니저 실행
                    const childManager = new ChildPageVodManager(request_datetime);
                    childManager.start();
                }
            }
        }
        
        // www.sooplive.co.kr에서 스트리머 ID 검색
        if (window.location.hostname === 'www.sooplive.co.kr') {
            log('[스트리머 ID 검색] iframe에서 실행됨');
            
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

    // 메인 페이지에서 실행되는 경우 (vod.sooplive.co.kr)
    if (window.location.hostname === 'vod.sooplive.co.kr') {
        log('[메인 페이지] VOD 동기화 초기화');
        
        const BTN_TEXT_IDLE = "Find VOD";
        const BTN_TEXT_FINDING_STREAMER_ID = "스트리머 ID를 찾는 중...";
        const BTN_TEXT_FINDING_VOD = "다시보기를 찾는 중...";
        let tsManager = null;
        let vodLinker = null;

        // BaseTimestampManager 클래스 (기존 확장 프로그램과 동일)
        class BaseTimestampManager {
            constructor() {
                this.tooltip = null;
                this.observer = null;
                this.isEditing = false;
                this.request_vod_ts = null;
                this.request_real_ts = null;
                this.isControllableState = false;
                this.lastMouseMoveTime = Date.now();
                this.isTooltipVisible = true;
                this.mouseCheckInterval = null;
                this.videoTag = null;
                this.isHideCompletly = false;
                
                this.startMonitoring();
            }
            
            log(...data){
                log('[BaseTimestampManager]', ...data);
            }
            
            RequestGlobalTSAsync(request_vod_ts, request_real_ts = null){
                this.request_vod_ts = request_vod_ts;
                this.request_real_ts = request_real_ts;
            }
            
            startMonitoring() {
                this.observeDOMChanges();
                this.createTooltip();
                this.setupMouseTracking();
            }
            
            setupMouseTracking() {
                document.addEventListener('mousemove', () => {
                    if (this.isHideCompletly) return;
                    this.lastMouseMoveTime = Date.now();
                    this.showTooltip();
                });

                document.addEventListener('mouseleave', () => {
                    this.hideTooltip();
                });

                this.mouseCheckInterval = setInterval(() => {
                    if (this.isHideCompletly) return;
                    const currentTime = Date.now();
                    const timeSinceLastMove = currentTime - this.lastMouseMoveTime;
                    
                    if (timeSinceLastMove >= 2000 && !this.isEditing && this.isTooltipVisible) {
                        this.hideTooltip();
                    }
                }, 200);
            }
            
            showTooltip() {
                if (this.tooltip) {
                    this.tooltip.style.transition = 'opacity 0.3s ease-in-out';
                    this.tooltip.style.opacity = '1';
                    this.isTooltipVisible = true;
                }
            }
            
            hideTooltip() {
                if (this.tooltip) {
                    this.tooltip.style.transition = 'opacity 0.5s ease-in-out';
                    this.tooltip.style.opacity = '0.1';
                    this.isTooltipVisible = false;
                }
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
                    this.tooltip.style.opacity = "1";
                    this.tooltip.contentEditable = "false";
                    document.body.appendChild(this.tooltip);

                    this.tooltip.addEventListener("dblclick", () => {
                        this.tooltip.contentEditable = "true";
                        this.tooltip.focus();
                        this.isEditing = true;
                        this.tooltip.style.outline = "2px solid red"; 
                        this.tooltip.style.boxShadow = "0 0 10px red";
                        this.showTooltip();
                    });

                    this.tooltip.addEventListener("blur", () => {
                        this.tooltip.contentEditable = "false";
                        this.isEditing = false;
                        this.tooltip.style.outline = "none";
                        this.tooltip.style.boxShadow = "none";
                    });

                    this.tooltip.addEventListener("keydown", (event) => {                    
                        if (/^[0-9]$/.test(event.key)) {
                            event.stopPropagation();
                            return;
                        }

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
                    if (!this.tooltip || this.isEditing) return;
                    
                    const timestamp = this.getCurDateTime();
                    
                    if (timestamp) {
                        this.isControllableState = true;
                        this.tooltip.innerText = timestamp.toLocaleString("ko-KR");
                    }
                    
                    if (this.isPlaying() === true) { 
                        if (this.request_vod_ts != null){
                            const streamPeriod = this.getStreamPeriod();
                            if (streamPeriod){
                                if (this.request_real_ts == null){
                                    this.log("시차 적용하지않고 동기화 시도");
                                    if (!this.moveToGlobalTS(this.request_vod_ts, false)){
                                        window.close();
                                    }
                                }
                                else{
                                    this.log("시차 적용하여 동기화 시도");
                                    const currentSystemTime = Date.now();
                                    const timeDifference = currentSystemTime - this.request_real_ts;
                                    const adjustedGlobalTS = this.request_vod_ts + timeDifference; 
                                    if (!this.moveToGlobalTS(adjustedGlobalTS, false)){
                                        window.close();
                                    }
                                }
                                this.request_vod_ts = null;
                                this.request_real_ts = null;
                            }
                        }
                    }
                }, 200);
            }
            
            processTimestampInput(input) {
                const match = input.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2}):(\d{2})/);
                
                if (!match) {
                    alert("유효한 타임스탬프 형식을 입력하세요. (예: 2024. 10. 22. 오전 5:52:55)");
                    return;
                }
            
                let [_, year, month, day, period, hour, minute, second] = match;
                year = parseInt(year);
                month = parseInt(month) - 1;
                day = parseInt(day);
                hour = parseInt(hour);
                minute = parseInt(minute);
                second = parseInt(second);
            
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
                const streamPeriod = this.getStreamPeriod();
                if (!streamPeriod) {
                    if (doAlert) {
                        alert("VOD 정보를 가져올 수 없습니다.");
                    }
                    return false;
                }
                
                const [streamStartDateTime, streamEndDateTime] = streamPeriod;
                const globalDateTime = new Date(parseInt(globalTS));

                if (streamStartDateTime > globalDateTime || globalDateTime > streamEndDateTime) {
                    if (doAlert) {
                        alert("입력한 타임스탬프가 방송 기간 밖입니다.");
                    }
                    return false;
                }
                
                const playbackTime = Math.floor((globalDateTime.getTime() - streamStartDateTime.getTime()) / 1000);
                return this.moveToPlaybackTime(playbackTime, doAlert);
            }
            
            moveToPlaybackTime(playbackTime, doAlert = true) {
                throw new Error("moveToPlaybackTime must be implemented by subclass");
            }
            
            observeDOMChanges() {
                throw new Error("observeDOMChanges must be implemented by subclass");
            }

            getCurDateTime() {
                throw new Error("getCurDateTime must be implemented by subclass");
            }

            getStreamPeriod() {
                throw new Error("getStreamPeriod must be implemented by subclass");
            }
            
            isPlaying() {
                throw new Error("isPlaying must be implemented by subclass");
            }
        }

        // SoopTimestampManager 클래스 (기존 확장 프로그램과 동일)
        class SoopTimestampManager extends BaseTimestampManager {
            constructor() {
                super();
                this.playTimeTag = null;
                this.streamPeriodTag = null;
            }
            
            log(...data){
                log('[SoopTimestampManager]', ...data);
            }

            calculateTimestamp(broadcastInfo, playbackTimeStr) {
                const match = broadcastInfo.match(/방송시간\s*:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);

                if (!match) {
                    this.tooltip.innerText = "다시보기만 지원하는 기능입니다.";
                    return null;
                }

                const startTime = new Date(match[1]);
                if (isNaN(startTime.getTime())) {
                    this.log('유효하지 않은 방송 시작 시간입니다.');
                    return null;
                }

                const playbackMatch = playbackTimeStr.match(/(\d{2}):(\d{2}):(\d{2})/);
                if (!playbackMatch) {
                    this.log('올바른 재생 시간 형식이 아닙니다.');
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
                    const newVideoTag = document.querySelector('#video');

                    if (!newPlayTimeTag || !newStreamPeriodTag) return;
                    if (newPlayTimeTag !== this.playTimeTag || newStreamPeriodTag !== this.streamPeriodTag || newVideoTag !== this.videoTag) {
                        this.log('VOD 변경 감지됨! 요소 업데이트 중...');
                        this.playTimeTag = newPlayTimeTag;
                        this.streamPeriodTag = newStreamPeriodTag;
                        this.videoTag = newVideoTag;
                    }
                });

                this.observer.observe(targetNode, config);
            }
            
            getStreamPeriod(){
                if (!this.streamPeriodTag) return null;
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
                if (!this.playTimeTag) return null;
                const playbackTimeStr = this.playTimeTag.innerText.trim();
                const broadcastInfo = this.streamPeriodTag.attributes['tip'].value;
                const timestamp = this.calculateTimestamp(broadcastInfo, playbackTimeStr);
                return timestamp;
            }
            
            moveToPlaybackTime(playbackTime, doAlert = true) {
                const url = new URL(window.location.href);
                url.searchParams.delete('request_vod_ts');
                url.searchParams.delete('request_real_ts');
                url.searchParams.set('change_second', playbackTime);
                window.location.replace(url.toString());
                return true;
            }
            
            isPlaying() {
                if (this.videoTag) {
                    return !this.videoTag.paused;
                }
                return false;
            }
        }

        // 간소화된 VOD 링커
        class SimpleVODLinker {
            constructor(){
                this.curProcessingBtn = null;
                this.iframe = null;
                this.init();            
            }
            
            init(){
                this.createIframe();
                this.updateFindVODButtons();
            }
            
            findVODList(streamer_id){
                this.curProcessingBtn.innerText = BTN_TEXT_FINDING_VOD;
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
                this.iframe.src = reqUrl.toString();
            }
            
            findStreamerID(nickname){
                this.curProcessingBtn.innerText = BTN_TEXT_FINDING_STREAMER_ID;
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
                                button.addEventListener('click', (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
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
            
            createIframe(){
                this.iframe = document.createElement('iframe');
                this.iframe.style.display = "none";
                document.body.appendChild(this.iframe);
            }
        }

        // VOD 링크들을 새 탭에서 열기
        function checkOneByOne(vodLinks, request_global_ts){
            if (vodLinks.length > 0){
                const request_real_ts = Date.now();
                const isPlaying = tsManager.isPlaying();
                for (let i = 0; i < vodLinks.length; i++) {
                    const link = vodLinks[i];
                    const url = new URL(link);
                    url.searchParams.delete('change_second');
                    url.searchParams.set('request_vod_ts', request_global_ts);
                    if (isPlaying)
                        url.searchParams.set('request_real_ts', request_real_ts);
                    log('open', url.toString());
                    window.open(url, "_blank");
                }
            }
        }

        // 초기화
        tsManager = new SoopTimestampManager();
        vodLinker = new SimpleVODLinker();
        
        // URL 파라미터로부터 동기화 요청 처리
        const params = new URLSearchParams(window.location.search);
        const request_vod_ts = parseInt(params.get("request_vod_ts"));
        const request_real_ts = parseInt(params.get("request_real_ts"));
        if (request_vod_ts){
            if (request_real_ts){ // 페이지 로딩 시간을 추가해야하는 경우.
                tsManager.RequestGlobalTSAsync(request_vod_ts, request_real_ts);
            }
            else{
                tsManager.RequestGlobalTSAsync(request_vod_ts);
            }
        }
        
        // 메시지 리스너 설정
        window.addEventListener('message', (event) => {
            if (event.data.response === "VOD_LIST"){
                const vodLinks = event.data.resultVODLinks;
                const request_datetime = event.data.request_datetime;
                log("VOD_LIST 받음:", vodLinks);
                
                checkOneByOne(vodLinks, request_datetime.getTime());
                vodLinker.curProcessingBtn.innerText = "Find VOD";
                vodLinker.curProcessingBtn = null;
            }
            else if (event.data.response === "STREAMER_ID"){
                log("STREAMER_ID 받음:", event.data.streamer_id);
                vodLinker.findVODList(event.data.streamer_id);
            }
        });
    }
})(); 