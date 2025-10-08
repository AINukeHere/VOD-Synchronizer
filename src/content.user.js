// ==UserScript==
// @name         VOD Synchronizer (SOOP-SOOP 동기화)
// @namespace    http://tampermonkey.net/
// @version      0.3.2
// @description  SOOP 다시보기 타임스탬프 표시 및 다른 스트리머의 다시보기와 동기화
// @author       AINukeHere
// @match        https://vod.sooplive.co.kr/*
// @match        https://www.sooplive.co.kr/*
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // 간소화된 로깅 함수
    function logToExtension(...data) {
        console.debug(`[${new Date().toLocaleString()}]`, ...data);
    }
    function warnToExtension(...data) {
        logToExtension(...data);
    }
    function errorToExtension(...data) {
        logToExtension(...data);
    }
    // 메인 페이지에서 실행되는 경우 (vod.sooplive.co.kr)
    if (window.location.hostname === 'vod.sooplive.co.kr') {
        class IVodSync {
            constructor(){
                this.vodSyncClassName = this.constructor.name;
            }
            log(...data){
                logToExtension(`[${this.vodSyncClassName}]`, ...data);
            }
            warn(...data){
                warnToExtension(`[${this.vodSyncClassName}]`, ...data);
            }
            error(...data){
                errorToExtension(`[${this.vodSyncClassName}]`, ...data);
            }
        }
        class SoopAPI extends IVodSync{
            constructor(){
                super();
                window.VODSync = window.VODSync || {};
                if (window.VODSync.soopAPI) {
                    this.warn('[VODSync] SoopAPI가 이미 존재합니다. 기존 인스턴스를 덮어씁니다.');
                }
                this.log('loaded');
                window.VODSync.soopAPI = this;
            }
        
            /**
             * @description Get Soop VOD Period
             * @param {number | string} videoId 
             * @returns {string} period or null
             */
            async GetSoopVodInfo(videoId) {
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
                return b;
            }
            async GetStreamerID(nickname){
                const encodedNickname = encodeURI(nickname);
                const url = new URL('https://sch.sooplive.co.kr/api.php');
                url.searchParams.set('m', 'bjSearch');
                url.searchParams.set('v', '3.0');
                url.searchParams.set('szOrder', 'score');
                url.searchParams.set('szKeyword', encodedNickname);
                this.log(`GetStreamerID: ${url.toString()}`);
                const res = await fetch(url.toString());
                if (res.status !== 200){
                    return null;
                }
                const b = await res.json();
                return b.DATA[0].user_id;
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
                this.log(`start_date: ${start_date_str}, end_date: ${end_date_str}`);
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
        class BaseTimestampManager extends IVodSync {
            constructor() {
                super();
                this.videoTag = null;
                this.tooltip = null;
                this.isEditing = false;
                this.request_vod_ts = null;
                this.request_real_ts = null;
                this.isControllableState = false;
                this.lastMouseMoveTime = Date.now();
                this.isTooltipVisible = true;
                this.mouseCheckInterval = null;
                this.isHideCompletly = false; // 툴팁 숨기기 상태
                
                // VODSync 네임스페이스에 자동 등록
                window.VODSync = window.VODSync || {};
                if (window.VODSync.tsManager) {
                    this.warn('[VODSync] TimestampManager가 이미 존재합니다. 기존 인스턴스를 덮어씁니다.');
                }
                window.VODSync.tsManager = this;
                
                this.startMonitoring();
            }
            // request_real_ts 가 null이면 request_vod_ts로 동기화하고 null이 아니면 동기화시도하는 시점과 request_real_ts와의 차이를 request_vod_ts와 더하여 동기화합니다.
            // 즉, 페이지가 로딩되는 동안의 시차를 적용할지 안할지 결정합니다.
            RequestGlobalTSAsync(request_vod_ts, request_real_ts = null){
                this.request_vod_ts = request_vod_ts;
                this.request_real_ts = request_real_ts;
            }
        
            RequestLocalTSAsync(request_local_ts){
                this.request_local_ts = request_local_ts;
            }
        
            startMonitoring() {
                this.observeDOMChanges();
                this.createTooltip();
                this.setupMouseTracking();
            }
        
            setupMouseTracking() {
                // 마우스 움직임 감지 - 시간만 업데이트
                document.addEventListener('mousemove', () => {
                    if (this.isHideCompletly) return;
                    this.lastMouseMoveTime = Date.now();
                    this.showTooltip();
                });
        
                // 마우스가 페이지 밖으로 나갈 때 툴팁 숨기기
                document.addEventListener('mouseleave', () => {
                    this.hideTooltip();
                });
        
                // 0.2초마다 마우스 상태 체크
                this.mouseCheckInterval = setInterval(() => {
                    if (this.isHideCompletly) return;
                    const currentTime = Date.now();
                    const timeSinceLastMove = currentTime - this.lastMouseMoveTime;
                    
                    // 2초 이상 마우스가 움직이지 않았고, 편집 중이 아니면 툴팁 숨기기
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
                        // 편집 중일 때는 투명화 방지
                        this.showTooltip();
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
                    if (!this.tooltip || this.isEditing) return;
                    
                    const dateTime = this.getCurDateTime();
                    
                    if (dateTime) {
                        this.isControllableState = true;
                        this.tooltip.innerText = dateTime.toLocaleString("ko-KR");
                    }
                    if (this.isPlaying() === true)
                    { 
                        // 전역 시간 동기화 요청 체크
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
                                    const currentSystemTime = Date.now();
                                    const timeDifference = currentSystemTime - this.request_real_ts;
                                    this.log("시차 적용하여 동기화 시도. 시차: " + timeDifference);
                                    const adjustedGlobalTS = this.request_vod_ts + timeDifference; 
                                    if (!this.moveToGlobalTS(adjustedGlobalTS, false)){
                                        window.close();
                                    }
                                }
                                this.request_vod_ts = null;
                                this.request_real_ts = null;
                            }
                        }
                        // 로컬 시간 동기화 요청 체크
                        if (this.request_local_ts != null){
                            this.log("playback time으로 동기화 시도");
                            if (!this.moveToPlaybackTime(this.request_local_ts, false)){
                                window.close();
                            }
                            this.request_local_ts = null;
                        }
                    }
                }, 200);
            }
        
            // 플랫폼별로 구현해야 하는 추상 메서드들
            observeDOMChanges() {
                throw new Error("observeDOMChanges must be implemented by subclass");
            }
        
            getCurDateTime() {
                throw new Error("getCurDateTime must be implemented by subclass");
            }
        
            getStreamPeriod() {
                throw new Error("getStreamPeriod must be implemented by subclass");
            }
        
            // 현재 재생 중인지 여부를 반환하는 추상 메서드
            isPlaying() {
                throw new Error("isPlaying must be implemented by subclass");
            }
        
            // 활성화/비활성화 메서드
            enable() {
                this.isHideCompletly = false;
                if (this.tooltip) {
                    this.tooltip.style.display = 'block';
                }
                this.log('툴팁 나타남');
            }
        
            disable() {
                this.isHideCompletly = true;
                if (this.tooltip) {
                    this.tooltip.style.display = 'none';
                }
                this.log('툴팁 숨김');
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
        
            /**
             * @description 전역 시간으로 영상 시간 맞춤
             * @param {number} globalTS
             * @param {boolean} doAlert 
             * @returns 
             */
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
        
            /**
             * @description 영상 시간을 설정
             * @param {number} playbackTime 
             * @param {boolean} doAlert 
             */
            moveToPlaybackTime(playbackTime, doAlert = true) {
                throw new Error("applyPlaybackTime must be implemented by subclass");
            }
        } 
        const MAX_DURATION_DIFF = 30*1000;
        class SoopTimestampManager extends BaseTimestampManager {
            constructor() {
                super();
                this.observer = null;
                this.playTimeTag = null;
                this.curVodInfo = null;
                this.timeLink = null;
                this.isEditedVod = false; // 다시보기의 일부분이 편집된 상태인가
                this.log('loaded');
        
                this.vodInfoLoaded = false; // 현재 vod의 정보를 로드했는가
                this.tagLoaded = false; // 현재 VOD 플레이어의 요소를 로드했는가 (video, playTimeTag)
                this.updating = false; // 현재 업데이트 중인가
                const checkerInterval = setInterval(async () => {
                    if (this.updating) return;
                    if (!this.vodInfoLoaded || !this.tagLoaded)
                        this.reloadAll();
                }, 100);
            }
        
            async loadVodInfo(){
                const url = new URL(window.location.href);
                const match = url.pathname.match(/\/player\/(\d+)/);
                this.videoId = match[1];
                const vodInfo = await window.VODSync.soopAPI.GetSoopVodInfo(this.videoId);
                if (!vodInfo || !vodInfo.data) return;
                const splitres = vodInfo.data.write_tm.split(' ~ ');
                this.curVodInfo = {
                    type: vodInfo.data.file_type,
                    startDate: new Date(splitres[0]),
                    endDate: splitres[1] ? new Date(splitres[1]) : null,
                    files: vodInfo.data.files,
                    total_file_duration: vodInfo.data.total_file_duration,
                    originVodInfo: null, // 원본 다시보기의 정보
                }
                // 클립은 라이브나 다시보기에서 생성될 수 있고 캐치는 클립에서도 생성될 수 있음.
                // 현재 페이지가 클립이거나 캐치인 경우 원본 VOD의 정보를 읽음
                if (this.curVodInfo.type === 'NORMAL'){
                    return;
                }
                else if (this.curVodInfo.type === 'CLIP' || this.curVodInfo.type === 'CATCH'){
                    if (vodInfo.data.original_clip_scheme){
                        const searchParamsStr = vodInfo.data.original_clip_scheme.split('?')[1];
                        const params = new URLSearchParams(searchParamsStr);
                        const originVodType = params.get('type');
                        const originVodId = params.get('title_no');
                        const originVodChangeSecond = parseInt(params.get('changeSecond'));
                        const originVodInfo = await window.VODSync.soopAPI.GetSoopVodInfo(originVodId);
                        if (originVodInfo && originVodInfo.data){
                            const splitres = originVodInfo.data.write_tm.split(' ~ ');
                            // 원본 VOD가 다시보기인 경우 원본 VOD의 정보를 읽음
                            if (originVodType === 'REVIEW'){
                                this.curVodInfo.originVodInfo = {
                                    type: originVodInfo.data.file_type,
                                    startDate: new Date(splitres[0]),
                                    endDate: new Date(splitres[1]),
                                    files: originVodInfo.data.files,
                                    total_file_duration: originVodInfo.data.total_file_duration,
                                    originVodChangeSecond: originVodChangeSecond, // 원본 다시보기에서 현재 vod의 시작 시점의 시작 시간
                                }
                                this.curVodInfo.startDate = new Date(this.curVodInfo.originVodInfo.startDate.getTime() + originVodChangeSecond * 1000);
                                this.curVodInfo.endDate = new Date(this.curVodInfo.startDate.getTime() + this.curVodInfo.total_file_duration);
                            }
                            // 원본 VOD가 클립인 경우 클립의 원본 VOD(다시보기) 정보를 읽음
                            else if (originVodType === 'CLIP'){
                                if (originVodInfo.data.original_clip_scheme){
                                    const searchParamsStr = originVodInfo.data.original_clip_scheme.split('?')[1];
                                    const params = new URLSearchParams(searchParamsStr);
                                    const originOriginVodType = params.get('type');
                                    if (originOriginVodType === 'REVIEW'){
                                        const originOriginVodId = params.get('title_no');
                                        const originOriginVodChangeSecond = parseInt(params.get('changeSecond'));
                                        const originOriginVodInfo = await window.VODSync.soopAPI.GetSoopVodInfo(originOriginVodId);
                                        if (originOriginVodInfo && originOriginVodInfo.data){
                                            const splitres = originOriginVodInfo.data.write_tm.split(' ~ ');
                                            this.curVodInfo.originVodInfo = {
                                                type: originOriginVodInfo.data.file_type,
                                                startDate: new Date(splitres[0]),
                                                endDate: new Date(splitres[1]),
                                                files: originOriginVodInfo.data.files,
                                                total_file_duration: originOriginVodInfo.data.total_file_duration,
                                                originVodChangeSecond: originVodChangeSecond + originOriginVodChangeSecond, // 원본 다시보기에서 현재 vod의 시작 시점의 시작 시간
                                            };
                                            this.curVodInfo.startDate = new Date(this.curVodInfo.originVodInfo.startDate.getTime() + (originVodChangeSecond+originOriginVodChangeSecond) * 1000);
                                            this.curVodInfo.endDate = new Date(this.curVodInfo.startDate.getTime() + this.curVodInfo.total_file_duration);
                                        }
                                    }
                                    else{
                                        this.warn(`${this.videoId}를 제보해주시기 바랍니다.\n[VOD Synchronizer 설정] > [문의하기]`);
                                    }
                                }
                            }
                        }
                    }
                    else{
                        this.curVodInfo.startDate = null;
                        this.curVodInfo.endDate = null;
                        this.log('원본 다시보기와 연결되어 있지 않은 VOD입니다.');
                        return;
                    }
                }
                const calcedTotalDuration = this.curVodInfo.endDate.getTime() - this.curVodInfo.startDate.getTime();
                const durationDiff = Math.abs(calcedTotalDuration - this.curVodInfo.total_file_duration);
                this.log('오차: ', durationDiff);
                if (durationDiff < MAX_DURATION_DIFF){
                    this.isEditedVod = false;
                }
                else{
                    this.isEditedVod = true;
                    this.log('영상 전체 재생 시간과 계산된 재생 시간이 다릅니다.');
                }
                this.vodInfoLoaded = true;
                this.log('영상 정보 로드 완료');
            }
        
            async reloadAll(){
                if (this.updating) return;
                const newPlayTimeTag = document.querySelector('span.time-current');
                let newVideoTag = document.querySelector('#video');
                if (newVideoTag === null)
                    newVideoTag = document.querySelector('#video_p');
                
                if (!newPlayTimeTag || !newVideoTag) return;
                if (newPlayTimeTag !== this.playTimeTag || newVideoTag !== this.videoTag) {
                    this.updating = true;
                    this.vodInfoLoaded = false;
                    this.tagLoaded = false;
                    this.log('VOD 변경 감지됨! 요소 업데이트 중...');
                    this.loadVodInfo().then(() => {
                        this.log('vodInfo 갱신됨', this.curVodInfo);
        
                        this.playTimeTag = document.querySelector('span.time-current');
                        this.log('playTimeTag 갱신됨', this.playTimeTag);
        
                        this.videoTag = document.querySelector('#video');
                        if (this.videoTag === null)
                            this.videoTag = document.querySelector('#video_p');
                        this.log('videoTag 갱신됨', this.videoTag);
                        this.updating = false;
                        if (this.playTimeTag !== null && this.videoTag !== null)
                            this.tagLoaded = true;
                        else
                            this.tagLoaded = false;
                    });
                }
            }
        
            observeDOMChanges() {
                const targetNode = document.body;
                const config = { childList: true, subtree: true };
        
                this.observer = new MutationObserver(() => {
                    this.reloadAll();
                });
        
                this.observer.observe(targetNode, config);
            }
        
            getStreamPeriod(){
                if (!this.curVodInfo || this.curVodInfo.type === 'NORMAL') return null;
                const startDate = this.curVodInfo.originVodInfo === null ? this.curVodInfo.startDate : this.curVodInfo.originVodInfo.startDate;
                const endDate = this.curVodInfo.originVodInfo === null ? this.curVodInfo.endDate : this.curVodInfo.originVodInfo.endDate;
                return [startDate, endDate];
            }
        
            playbackTimeToGlobalTS(totalPlaybackSec){
                if (!this.vodInfoLoaded) return null;
                const reviewStartDate = this.curVodInfo.originVodInfo === null ? this.curVodInfo.startDate : this.curVodInfo.originVodInfo.startDate;
                const reviewDataFiles = this.curVodInfo.originVodInfo === null ? this.curVodInfo.files : this.curVodInfo.originVodInfo.files;
                const deltaTimeSec = this.curVodInfo.originVodInfo === null ? 0 : this.curVodInfo.originVodInfo.originVodChangeSecond;
                
                // 시간오차가 임계값 이하이거나 다시보기 구성 파일이 1개인 경우
                if (!this.isEditedVod || reviewDataFiles.length === 1){
                    return new Date(reviewStartDate.getTime() + (totalPlaybackSec + deltaTimeSec)*1000);
                }
        
                if (this.isEditedVod && reviewDataFiles.length > 1 && this.curVodInfo.type !== 'REVIEW'){
                    this.warn(`${this.videoId}를 제보해주시기 바랍니다.\n[VOD Synchronizer 설정] > [문의하기]`);
                    return null;
                }
                
                let cumulativeTime = 0;
                for (let i = 0; i < reviewDataFiles.length; ++i){
                    const file = reviewDataFiles[i];
                    const localPlaybackTime = totalPlaybackSec*1000 - cumulativeTime;
                    const hour = Math.floor(localPlaybackTime / 3600000);
                    const minute = Math.floor((localPlaybackTime % 3600000) / 60000);
                    const second = Math.floor((localPlaybackTime % 60000) / 1000);
                    // this.log(`localPlaybackTime: ${hour}:${minute}:${second}`);    
                    if (localPlaybackTime > file.duration){
                        cumulativeTime += file.duration;
                        continue;
                    }
                    const startTime = new Date(file.file_start);
                    return new Date(startTime.getTime() + localPlaybackTime);
                }
                return null;
            }
            globalTSToPlaybackTime(globalTS){
                if (!this.vodInfoLoaded || !this.tagLoaded) return null;
                const reviewStartDate = this.curVodInfo.originVodInfo === null ? this.curVodInfo.startDate : this.curVodInfo.originVodInfo.startDate;
                const reviewDataFiles = this.curVodInfo.originVodInfo === null ? this.curVodInfo.files : this.curVodInfo.originVodInfo.files;
                const deltaTimeSec = this.curVodInfo.originVodInfo === null ? 0 : this.curVodInfo.originVodInfo.originVodChangeSecond;
                
                // 시간오차가 임계값 이하이거나 다시보기 구성 파일이 1개인 경우
                if (!this.isEditedVod || reviewDataFiles.length === 1){
                    const temp = reviewStartDate.getTime();
                    const temp2 = (globalTS - temp) / 1000;
                    return Math.floor(temp2) - deltaTimeSec;
                }
                if (this.isEditedVod && reviewDataFiles.length > 1 && this.curVodInfo.type !== 'REVIEW'){
                    this.warn(`${this.videoId}를 제보해주시기 바랍니다.\n[VOD Synchronizer 설정] > [문의하기]`);
                    return null;
                }
        
                let cumulativeTime = 0;
                for (let i = 0; i < reviewDataFiles.length; ++i){
                    const file = reviewDataFiles[i];
                    const fileStartDate = new Date(file.file_start);
                    const fileEndDate = new Date(fileStartDate.getTime() + file.duration);
                    if (fileStartDate.getTime() <= globalTS && globalTS <= fileEndDate.getTime()){
                        return Math.floor((globalTS - fileStartDate.getTime() + cumulativeTime) / 1000);
                    }
                    cumulativeTime += file.duration;
                }
                return null;
            }
        
            /**
             * @override
             * @description 현재 영상이 스트리밍된 당시 시간을 반환
             * @returns {Date} 현재 영상이 스트리밍된 당시 시간
             * @returns {null} 영상 정보를 가져올 수 없음. 의도치않은 상황 발생
             * @returns {string} 당시 시간을 계산하지 못한 오류 메시지.
             */
            getCurDateTime(){
                const totalPlaybackSec = this.getCurPlaybackTime();
                if (totalPlaybackSec === null) return null;
        
                if (this.curVodInfo.type === 'NORMAL') return '업로드 VOD는 지원하지 않습니다.';
                if (this.curVodInfo.startDate === null && 
                    this.curVodInfo.endDate === null && 
                    this.curVodInfo.originVodInfo === null) {
                        return '원본 다시보기와 연결되어 있지 않은 VOD입니다.';
                }
        
                const globalTS = this.playbackTimeToGlobalTS(totalPlaybackSec);
                return globalTS;
            }
        
            /**
             * @description 현재 재생 시간을 초 단위로 반환
             * @returns {number} 현재 재생 시간(초)
             * @returns {null} 재생 시간을 계산할 수 없음. 의도치않은 상황 발생
             */
            getCurPlaybackTime(){
                if (!this.playTimeTag) return null;
                const totalPlaybackTimeStr = this.playTimeTag.innerText.trim();
                const splitres = totalPlaybackTimeStr.split(':');
                let totalPlaybackSec = 0;
                if (splitres.length === 3){
                    totalPlaybackSec = (parseInt(splitres[0]) * 3600 + parseInt(splitres[1]) * 60 + parseInt(splitres[2]));
                }
                else if (splitres.length === 2){
                    totalPlaybackSec = (parseInt(splitres[0]) * 60 + parseInt(splitres[1]));
                }
                else{
                    errorToExtension(`${this.videoId}를 제보해주시기 바랍니다.\n[VOD Synchronizer 설정] > [문의하기]`);
                    return null;
                }
                return totalPlaybackSec;
            }
        
            /**
             * @override
             * @description 영상 시간을 설정
             * @param {number} globalTS (milliseconds)
             * @param {boolean} doAlert 
             * @returns {boolean} 성공 여부
             */
            async moveToGlobalTS(globalTS, doAlert = true) {
                const playbackTime = await this.globalTSToPlaybackTime(globalTS);
                if (playbackTime === null) return false;
                this.moveToPlaybackTime(playbackTime, doAlert);
                return true;
            }
        
            /**
             * @override
             * @description 영상 시간을 설정
             * @param {number} playbackTime (seconds)
             * @param {boolean} doAlert 
             * @returns {boolean} 성공 여부
             */
            moveToPlaybackTime(playbackTime, doAlert = true) {
                const url = new URL(window.location.href);
                url.searchParams.set('change_second', playbackTime);
                /// 페이지를 새로고침 하는 방식
                // window.location.replace(url.toString());
                // return true;
        
                /// soop 댓글 타임라인 기능을 사용하는 방식
                // URL에 change_second 파라미터 추가
                window.history.replaceState({}, '', url.toString());
                const jumpInterval = setInterval(()=>{
                    if (this.getCurPlaybackTime() === playbackTime){
                        clearInterval(jumpInterval);
                        return;
                    }
                    if (this.timeLink === null) {
                        this.timeLink = document.createElement('a');
                        document.body.appendChild(this.timeLink);
                    }
                    this.timeLink.className = 'time_link';
                    this.timeLink.setAttribute('data-time', playbackTime.toString());
                    this.timeLink.click();
                    this.log('timeLink 클릭됨');
                }, 100);
                return true;
            }
        
            // 현재 재생 중인지 여부 반환
            isPlaying() {
                if (this.videoTag) {
                    return !this.videoTag.paused;
                }
                return false;
            }
        } 
        const BTN_TEXT_IDLE = "Sync VOD";
        // SOOP 검색창에 동기화 버튼 추가. 버튼 누르면 동기화 시작
        class SoopVODLinker extends IVodSync{
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
                if (typeof reqVodDate === 'string'){
                    this.warn(reqVodDate);
                    button.innerText = BTN_TEXT_IDLE;
                    alert(reqVodDate);
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

        new SoopAPI();
        const tsManager = new SoopTimestampManager();
        new SoopVODLinker();
        
        // 동기화 요청이 있는 경우 타임스탬프 매니저에게 요청
        const params = new URLSearchParams(window.location.search);
        const url_request_vod_ts = params.get("request_vod_ts");
        const url_request_real_ts = params.get("request_real_ts");
        if (url_request_vod_ts && tsManager){
            const request_vod_ts = parseInt(url_request_vod_ts);
            if (url_request_real_ts){ // 페이지 로딩 시간을 추가해야하는 경우.
                const request_real_ts = parseInt(url_request_real_ts);
                tsManager.RequestGlobalTSAsync(request_vod_ts, request_real_ts);
            }
            else{
                tsManager.RequestGlobalTSAsync(request_vod_ts);
            }
            
            // url 지우기
            const url = new URL(window.location.href);
            url.searchParams.delete('request_vod_ts');
            url.searchParams.delete('request_real_ts');
            window.history.replaceState({}, '', url.toString());
        }
    }
})(); 