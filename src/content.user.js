// ==UserScript==
// @name         VOD Synchronizer (SOOP-SOOP 동기화)
// @namespace    http://tampermonkey.net/
// @version      1.4.0
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
    function debugToExtension(...data) {
        logToExtension(...data);
    }
    if (window.top !== window.self) return;

    // 환경 구분용 전역 변수 (탬퍼몽키 환경)
    window.VODSync = window.VODSync || {};
    window.VODSync.IS_TAMPER_MONKEY_SCRIPT = true;

    // 메인 페이지에서 실행되는 경우 (vod.sooplive.co.kr)
    if (window.location.hostname === 'vod.sooplive.co.kr') {
        class IVodSync {
    constructor(){
        this.vodSyncClassName = this.constructor.name;
        this.debug('constructor() called');
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
    debug(...data){
        debugToExtension(`[${this.vodSyncClassName}]`, ...data);
    }
}
        /** 요청 캐시 TTL (밀리초). 동일 요청은 이 시간 동안 캐시된 결과 반환 */
const REQUEST_CACHE_TTL_MS = 60 * 1000;

class SoopAPI extends IVodSync{
    constructor(){
        super();
        /** @type {Map<string, { data: any, expiresAt: number }>} */
        this._requestCache = new Map();
        window.VODSync = window.VODSync || {};
        if (window.VODSync.soopAPI) {
            this.warn('[VODSync] SoopAPI가 이미 존재합니다. 기존 인스턴스를 덮어씁니다.');
        }
        this.log('loaded');
        window.VODSync.soopAPI = this;
    }

    /**
     * @param {string} key 캐시 키
     * @returns {any|null} 캐시된 데이터 또는 null
     */
    _getCached(key) {
        const entry = this._requestCache.get(key);
        if (!entry || Date.now() > entry.expiresAt) return null;
        return entry.data;
    }

    /**
     * @param {string} key 캐시 키
     * @param {any} data 저장할 데이터
     */
    _setCache(key, data) {
        this._requestCache.set(key, { data, expiresAt: Date.now() + REQUEST_CACHE_TTL_MS });
    }

    /**
     * @description Get Soop VOD Period
     * @param {number | string} videoId 
     * @returns {string} period or null
     */
    async GetSoopVodInfo(videoId) {
        const cacheKey = `GetSoopVodInfo:${videoId}`;
        const cached = this._getCached(cacheKey);
        if (cached !== null) return cached;

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
        this._setCache(cacheKey, b);
        return b;
    }
    async GetStreamerID(nickname){
        const encodedNickname = encodeURI(nickname);
        const url = new URL('https://sch.sooplive.co.kr/api.php');
        url.searchParams.set('m', 'bjSearch');
        url.searchParams.set('v', '3.0');
        url.searchParams.set('szOrder', 'score');
        url.searchParams.set('szKeyword', encodedNickname);
        const cacheKey = `GetStreamerID:${url.toString()}`;
        const cached = this._getCached(cacheKey);
        if (cached !== null) return cached;

        this.log(`GetStreamerID: ${url.toString()}`);
        const res = await fetch(url.toString());
        if (res.status !== 200){
            return null;
        }
        const b = await res.json();
        const userId = b.DATA[0]?.user_id ?? null;
        if (userId !== null) this._setCache(cacheKey, userId);
        return userId;
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
        const cacheKey = `GetSoopVOD_List:${url.toString()}`;
        const cached = this._getCached(cacheKey);
        if (cached !== null) return cached;

        this.log(`GetSoopVOD_List: ${url.toString()}`);
        const res = await fetch(url.toString());
        const b = await res.json();
        this._setCache(cacheKey, b);
        return b;
    }
    /**
     * @description Get Chat Log for specific time range (playbackTime 기준)
     * @param {number | string} vodId 
     * @param {number} startTime - 시작 시간 (초 단위, playbackTime)
     * @param {number} endTime - 끝 시간 (초 단위, playbackTime)
     * @returns {Promise<string|null>} XML 문자열 또는 null
     */
    async GetChatLog(vodId, startTime, endTime){
        const vodInfo = await this.GetSoopVodInfo(vodId);
        if (vodInfo === null){
            this.warn(`GetChatLog: GetSoopVodInfo failed: ${vodId}`);
            return null;
        }
        return this._GetChatLog(vodInfo, startTime, endTime);
    }   
    
    /**
     * @description VOD 정보에서 startTime과 endTime이 속한 file을 찾아 chat 로그 가져오기
     * @param {Object} vodInfo - VOD 정보
     * @param {number} startTime - 시작 시간 (초 단위, playbackTime)
     * @param {number} endTime - 끝 시간 (초 단위, playbackTime)
     * @returns {Promise<string|null>} XML 문자열 또는 null
     */
    async _GetChatLog(vodInfo, startTime, endTime){
        if (!vodInfo?.data?.files || vodInfo.data.files.length === 0) {
            this.warn("GetChatLog: files 정보가 없습니다.");
            return null;
        }

        // 각 file의 시작 시간과 끝 시간 계산
        const fileRanges = [];
        let cumulativeTime = 0;

        for (const file of vodInfo.data.files) {
            const fileDuration = file.duration ? Math.floor(file.duration / 1000) : 0; // 밀리초를 초로 변환
            const fileStart = cumulativeTime;
            const fileEnd = cumulativeTime + fileDuration;
            
            fileRanges.push({
                file: file,
                start: fileStart,
                end: fileEnd,
                duration: fileDuration
            });
            
            cumulativeTime += fileDuration;
        }

        // startTime과 endTime이 속한 file 찾기
        const startFileIndex = fileRanges.findIndex(range => startTime >= range.start && startTime < range.end);
        let endFileIndex = fileRanges.findIndex(range => endTime >= range.start && endTime < range.end);
        
        // endTime이 마지막 파일의 끝을 넘어가는 경우, 마지막 파일로 설정
        if (endFileIndex === -1 && fileRanges.length > 0) {
            const lastRange = fileRanges[fileRanges.length - 1];
            if (endTime >= lastRange.end) {
                endFileIndex = fileRanges.length - 1;
            }
        }

        if (startFileIndex === -1) {
            this.warn(`GetChatLog: startTime ${startTime}초에 해당하는 file을 찾을 수 없습니다.`);
            return null;
        }
        
        if (endFileIndex === -1) {
            this.warn(`GetChatLog: endTime ${endTime}초에 해당하는 file을 찾을 수 없습니다.`);
            return null;
        }

        // 같은 파일 내에 있는 경우
        if (startFileIndex === endFileIndex) {
            const fileRange = fileRanges[startFileIndex];
            const relativeStartTime = startTime - fileRange.start;
            if (!fileRange.file.chat) {
                this.warn("GetChatLog: file에 chat URL이 없습니다.");
                return null;
            }

            const xml = await this._fetchChatLogFromFile(fileRange.file.chat, relativeStartTime);
            if (!xml) return null;
            
            // playbackTime 기준으로 변환 및 필터링
            return this._convertAndFilterChatLogByTimeRange(xml, startTime, endTime, fileRange.start);
        }

        // 여러 파일에 걸쳐 있는 경우
        const startFileRange = fileRanges[startFileIndex];
        const endFileRange = fileRanges[endFileIndex];

        if (!startFileRange.file.chat || !endFileRange.file.chat) {
            this.warn("GetChatLog: file에 chat URL이 없습니다.");
            return null;
        }

        // 앞 파일: 상대적 시작시간부터 파일 끝까지
        const startFileRelativeStart = startTime - startFileRange.start;

        // 뒷 파일: 파일 시작부터 상대적 끝시간까지
        const endFileRelativeStart = 0;

        // 두 파일에서 각각 가져오기
        const [startFileXml, endFileXml] = await Promise.all([
            this._fetchChatLogFromFile(startFileRange.file.chat, startFileRelativeStart),
            this._fetchChatLogFromFile(endFileRange.file.chat, endFileRelativeStart)
        ]);

        // XML 합치기
        let mergedXml = null;
        if (!startFileXml && !endFileXml) {
            return null;
        } else if (!startFileXml) {
            mergedXml = endFileXml;
        } else if (!endFileXml) {
            mergedXml = startFileXml;
        } else {
            mergedXml = this._mergeChatLogXml(startFileXml, endFileXml);
        }

        if (!mergedXml) return null;

        // 여러 파일에 걸쳐 있으므로 각 파일의 시작 시간을 고려하여 변환 및 필터링
        // 앞 파일의 채팅만 변환 및 필터링
        let filteredStartXml = null;
        if (startFileXml) {
            filteredStartXml = this._convertAndFilterChatLogByTimeRange(startFileXml, startTime, endTime, startFileRange.start);
        }

        // 뒷 파일의 채팅만 변환 및 필터링
        let filteredEndXml = null;
        if (endFileXml) {
            filteredEndXml = this._convertAndFilterChatLogByTimeRange(endFileXml, startTime, endTime, endFileRange.start);
        }

        // 필터링된 XML 합치기
        if (!filteredStartXml && !filteredEndXml) {
            return null;
        } else if (!filteredStartXml) {
            return filteredEndXml;
        } else if (!filteredEndXml) {
            return filteredStartXml;
        } else {
            return this._mergeChatLogXml(filteredStartXml, filteredEndXml);
        }
    }

    /**
     * @description 특정 파일의 chat URL에서 chat 로그 가져오기
     * @param {string} chatUrl - chat URL
     * @param {number} relativeStartTime - 파일 내 상대적 시작 시간 (초)
     * @returns {Promise<string|null>} XML 문자열 또는 null
     */
    async _fetchChatLogFromFile(chatUrl, relativeStartTime) {
        try {
            const baseUrl = new URL(chatUrl);
            baseUrl.searchParams.set("startTime", relativeStartTime);
            const url = baseUrl.toString();
            const cacheKey = `_fetchChatLogFromFile:${url}`;
            const cached = this._getCached(cacheKey);
            if (cached !== null) return cached;

            const res = await fetch(url);
            if (res.status !== 200) {
                this.warn(`GetChatLog: HTTP ${res.status} - ${url}`);
                return null;
            }
            
            const xmlText = await res.text();
            this._setCache(cacheKey, xmlText);
            return xmlText;
        } catch (error) {
            this.error("GetChatLog: fetch 오류:", error);
            return null;
        }
    }

    /**
     * @description XML에서 file 기준 timestamp를 전역 playbackTime으로 변환하고 특정 시간 범위의 채팅만 필터링
     * @param {string} xml - XML 문자열
     * @param {number} startTime - 시작 시간 (playbackTime, 초)
     * @param {number} endTime - 끝 시간 (playbackTime, 초)
     * @param {number} fileStartTime - 파일의 시작 시간 (playbackTime, 초)
     * @returns {string} 변환 및 필터링된 XML 문자열
     */
    _convertAndFilterChatLogByTimeRange(xml, startTime, endTime, fileStartTime) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xml, 'text/xml');

            // 파싱 오류 확인
            const parseError = doc.querySelector('parsererror');
            if (parseError) {
                this.error("GetChatLog: XML 파싱 오류", parseError.textContent);
                return xml; // 원본 반환
            }

            const root = doc.documentElement;
            const chats = root.querySelectorAll('chat, ogq');
            
            // 변환 및 필터링: 각 채팅의 타임스탬프를 playbackTime으로 변환하여 저장하고 범위 확인
            chats.forEach(chat => {
                const tTag = chat.querySelector('t');
                if (!tTag) {
                    // 타임스탬프가 없으면 제거
                    chat.remove();
                    return;
                }

                const relativeTimestamp = parseFloat(tTag.textContent);
                if (isNaN(relativeTimestamp)) {
                    // 타임스탬프가 유효하지 않으면 제거
                    chat.remove();
                    return;
                }

                // 파일 내 상대적 시간을 playbackTime으로 변환
                const playbackTime = fileStartTime + relativeTimestamp;

                // startTime과 endTime 사이에 있지 않으면 제거
                if (playbackTime < startTime || playbackTime > endTime) {
                    chat.remove();
                    return;
                }

                // <t> 태그의 값을 playbackTime으로 업데이트
                tTag.textContent = playbackTime.toString();
            });

            // XML 문자열로 변환
            const serializer = new XMLSerializer();
            return serializer.serializeToString(doc);
        } catch (error) {
            this.error("GetChatLog: XML 변환 및 필터링 오류:", error);
            // 변환 및 필터링 실패 시 원본 반환
            return xml;
        }
    }

    /**
     * @description 두 XML 문자열을 합치기
     * @param {string} xml1 - 첫 번째 XML
     * @param {string} xml2 - 두 번째 XML
     * @returns {string} 합쳐진 XML
     */
    _mergeChatLogXml(xml1, xml2) {
        try {
            const parser = new DOMParser();
            const doc1 = parser.parseFromString(xml1, 'text/xml');
            const doc2 = parser.parseFromString(xml2, 'text/xml');

            // 파싱 오류 확인
            const parseError1 = doc1.querySelector('parsererror');
            const parseError2 = doc2.querySelector('parsererror');
            if (parseError1 || parseError2) {
                this.error("GetChatLog: XML 파싱 오류", parseError1?.textContent || parseError2?.textContent);
                return xml1; // 첫 번째 XML 반환
            }

            const root1 = doc1.documentElement;
            const root2 = doc2.documentElement;

            // 두 번째 XML의 chat/ogq 태그들을 첫 번째 XML에 추가
            const chats2 = root2.querySelectorAll('chat, ogq');

            chats2.forEach(chat => {
                const importedChat = doc1.importNode(chat, true);
                root1.appendChild(importedChat);
            });

            // XML 문자열로 변환
            const serializer = new XMLSerializer();
            return serializer.serializeToString(doc1);
        } catch (error) {
            this.error("GetChatLog: XML 병합 오류:", error);
            // 병합 실패 시 첫 번째 XML 반환
            return xml1;
        }
    }

    async GetEmoticon(){
        const cacheKey = 'GetEmoticon:https://st.sooplive.co.kr/api/emoticons.php';
        const cached = this._getCached(cacheKey);
        if (cached !== null) return cached;

        const res = await fetch("https://st.sooplive.co.kr/api/emoticons.php");
        if (res.status !== 200){
            return null;
        }
        const b = await res.json();
        this._setCache(cacheKey, b);
        return b;
    }
    async GetSignitureEmoticon(streamerId){
        const cacheKey = `GetSignitureEmoticon:${streamerId}`;
        const cached = this._getCached(cacheKey);
        if (cached !== null) return cached;

        const res = await fetch("https://live.sooplive.co.kr/api/signature_emoticon_api.php", {
            "headers": {
                "accept": "*/*",
                "content-type": "application/x-www-form-urlencoded"
            },
            "body": `work=list&szBjId=${streamerId}&nState=2&v=tier`,
            "method": "POST"
        });
        if (res.status !== 200){
            return null;
        }
        const b = await res.json();
        this._setCache(cacheKey, b);
        return b;
    }
}
        class TimestampManagerBase extends IVodSync {
    constructor() {
        super();
        this.videoTag = null;
        this.timeStampDiv = null;
        this.isEditing = false;
        this.request_vod_ts = null;
        this.request_real_ts = null;
        this.isControllableState = false;
        this.lastMouseMoveTime = Date.now();
        this.isVisible = true;
        this.isHideCompletly = false; // 툴팁 숨기기 상태
        
        // VODSync 네임스페이스에 자동 등록
        window.VODSync = window.VODSync || {};
        if (window.VODSync.tsManager) {
            this.warn('[VODSync] TimestampManager가 이미 존재합니다. 기존 인스턴스를 덮어씁니다.');
        }
        window.VODSync.tsManager = this;
        
        this.createTooltip();
        this.observeDOMChanges();
        this.setupMouseTracking();
        this.listenBroadcastSyncEvent();
        setInterval(() => {
            this.update();
        }, 200);
    }
    createTooltip() {
        if (!this.timeStampDiv) {
            // 툴팁을 담는 컨테이너 생성
            this.tooltipContainer = document.createElement("div");
            this.tooltipContainer.style.position = "fixed";
            this.tooltipContainer.style.bottom = "20px";
            this.tooltipContainer.style.right = "20px";
            this.tooltipContainer.style.display = "flex";
            this.tooltipContainer.style.alignItems = "center";
            this.tooltipContainer.style.gap = "5px";
            this.tooltipContainer.style.zIndex = "1000";
            
            // Sync 버튼 생성
            this.syncButton = document.createElement("button");
            this.syncButton.title = "열려있는 다른 vod를 이 시간대로 동기화";
            this.syncButton.style.background = "none";
            this.syncButton.style.border = "none";
            this.syncButton.style.cursor = "pointer";
            this.syncButton.style.width = "32px";
            this.syncButton.style.height = "32px";
            this.syncButton.style.padding = "0";
            this.syncButton.style.opacity = "1";
            this.syncButton.style.borderRadius = "8px";
            this.syncButton.style.overflow = "hidden";
            
            // 아이콘 이미지 추가
            const iconImage = document.createElement("img");
            if (window.VODSync?.IS_TAMPER_MONKEY_SCRIPT !== true){
                iconImage.src = chrome.runtime.getURL("res/img/broadcastSync.png");
            }
            else{
                iconImage.src = "https://raw.githubusercontent.com/AINukeHere/VOD-Synchronizer/main/res/img/broadcastSync.png";
            }
            iconImage.style.width = "100%";
            iconImage.style.height = "100%";
            iconImage.style.objectFit = "fill";
            iconImage.style.borderRadius = "8px";
            this.syncButton.appendChild(iconImage);            
            this.syncButton.addEventListener('click', this.handleBroadcastSyncButtonClick.bind(this));
            
            // 툴팁 div 생성
            this.timeStampDiv = document.createElement("div");
            this.timeStampDiv.style.background = "black";
            this.timeStampDiv.style.color = "white";
            this.timeStampDiv.style.padding = "8px 12px";
            this.timeStampDiv.style.borderRadius = "5px";
            this.timeStampDiv.style.fontSize = "14px";
            this.timeStampDiv.style.whiteSpace = "nowrap";
            this.timeStampDiv.style.display = "block";
            this.timeStampDiv.style.opacity = "1";
            this.timeStampDiv.contentEditable = "false";
            this.timeStampDiv.title = "더블클릭하여 수정, 수정 후 Enter 키 누르면 적용";
            
            // 컨테이너에 버튼과 툴팁 추가
            this.tooltipContainer.appendChild(this.syncButton);
            this.tooltipContainer.appendChild(this.timeStampDiv);
            document.body.appendChild(this.tooltipContainer);

            this.timeStampDiv.addEventListener("dblclick", () => {
                this.timeStampDiv.contentEditable = "true";
                this.timeStampDiv.focus();
                this.isEditing = true;
                this.timeStampDiv.style.outline = "2px solid red"; 
                this.timeStampDiv.style.boxShadow = "0 0 10px red";
                // 편집 중일 때는 투명화 방지
                this.showTooltip();
            });
            this.timeStampDiv.addEventListener("mouseup", (event) => {
                event.stopPropagation(); // 치지직의 경우 다른 요소의 이 이벤트가 blur를 호출하게하므로 차단
            });

            this.timeStampDiv.addEventListener("blur", () => {
                this.timeStampDiv.contentEditable = "false";
                this.isEditing = false;
                this.timeStampDiv.style.outline = "none";
                this.timeStampDiv.style.boxShadow = "none";
            });

            this.timeStampDiv.addEventListener("keydown", (event) => {
                // 편집 모드일 때만 이벤트 차단
                if (this.isEditing) {
                    // 숫자 키 (0-9) - 영상 점프 기능만 차단하고 텍스트 입력은 허용
                    if (/^[0-9]$/.test(event.key)) {
                        // 영상 플레이어의 키보드 이벤트만 차단
                        event.stopPropagation();
                        return;
                    }

                    // 방향키 - 영상 앞으로/뒤로 이동 기능 차단
                    if (event.key === "ArrowUp" || event.key === "ArrowDown" || 
                        event.key === "ArrowLeft" || event.key === "ArrowRight") {
                        event.stopPropagation();
                        return;
                    }
                }

                // Enter 키 처리
                if (event.key === "Enter") {
                    event.preventDefault();
                    this.processTimestampInput(this.timeStampDiv.innerText.trim());
                    this.timeStampDiv.contentEditable = "false";
                    this.timeStampDiv.blur();
                    this.isEditing = false;
                    return;
                }
            });

            // 복사 이벤트 처리 - 텍스트만 복사되도록
            this.timeStampDiv.addEventListener("copy", (event) => {
                const selectedText = window.getSelection().toString();
                if (selectedText) {
                    event.clipboardData.setData("text/plain", selectedText);
                    event.preventDefault();
                }
            });
        }
    }
    update(){
        this.updateTooltip();
        this.checkMouseState();
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

    listenBroadcastSyncEvent() {
        if (window.VODSync?.IS_TAMPER_MONKEY_SCRIPT !== true){
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.action === 'broadCastSync') {
                    this.moveToGlobalTS(message.request_vod_ts, false);
                    sendResponse({ success: true });
                }
                return true;
            });
        }
        else{
            this.channel = new BroadcastChannel('vod-synchronizer');
            this.channel.onmessage = (event) => {
                if (event.data.action === 'broadCastSync') {
                    this.moveToGlobalTS(event.data.request_vod_ts, false);
                }
            }
        }
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
    }

    showTooltip() {
        if (this.timeStampDiv) {
            this.timeStampDiv.style.transition = 'opacity 0.3s ease-in-out';
            this.timeStampDiv.style.opacity = '1';
            this.isVisible = true;
        }
        if (this.syncButton) {
            this.syncButton.style.transition = 'opacity 0.3s ease-in-out';
            this.syncButton.style.opacity = '1';
        }
    }

    hideTooltip() {
        if (this.timeStampDiv && !this.isEditing) {
            this.timeStampDiv.style.transition = 'opacity 0.5s ease-in-out';
            this.timeStampDiv.style.opacity = '0';
            this.isVisible = false;
        }
        if (this.syncButton) {
            this.syncButton.style.transition = 'opacity 0.5s ease-in-out';
            this.syncButton.style.opacity = '0';
        }
    }

    handleBroadcastSyncButtonClick(e) {
        const request_vod_ts = this.getCurDateTime();
        if (!request_vod_ts) {
            this.warn("현재 재생 중인 VOD의 라이브 당시 시간을 가져올 수 없습니다. 전역 동기화 실패.");
            return;
        }
        e.stopPropagation();

        if (window.VODSync?.IS_TAMPER_MONKEY_SCRIPT !== true){
            try{
                chrome.runtime.sendMessage({action: 'broadCastSync', request_vod_ts: request_vod_ts.getTime()});
            } catch (error) {
                console.warn('[VOD Synchronizer] 전역 동기화 요청 실패. 확장프로그램이 리로드되었거나 비활성화된 것 같습니다. 페이지를 새로고침하십시오.', error);
            }
        }
        else{
            this.channel.postMessage({action: 'broadCastSync', request_vod_ts: request_vod_ts.getTime()});
        }
    }
    updateTooltip() {
        if (!this.timeStampDiv || this.isEditing) return;
        
        const dateTime = this.getCurDateTime();
        
        if (dateTime) {
            this.isControllableState = true;
            this.timeStampDiv.innerText = dateTime.toLocaleString("ko-KR");
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
                    this.log('동기화 실패. 창을 닫습니다.');
                    window.close();
                }
                this.request_local_ts = null;
            }
        }
    }

    checkMouseState(){
        if (this.isHideCompletly) return;
        const currentTime = Date.now();
        const timeSinceLastMove = currentTime - this.lastMouseMoveTime;
        
        // 2초 이상 마우스가 움직이지 않았고, 편집 중이 아니면 툴팁 숨기기
        if (timeSinceLastMove >= 2000 && !this.isEditing && this.isVisible) {
            this.hideTooltip();
        }
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

    /**
     * @description 재생 시점(초)을 전역 시각(global time)으로 변환. 파생 클래스에서 구현.
     * @param {number} totalPlaybackSec VOD 재생 시점(초)
     * @returns {Date|null} 전역 시각 또는 변환 불가 시 null
     */
    playbackTimeToGlobalTS(totalPlaybackSec) {
        return null;
    }

    // 현재 재생 중인지 여부를 반환하는 추상 메서드
    isPlaying() {
        throw new Error("isPlaying must be implemented by subclass");
    }

    // 활성화/비활성화 메서드
    enable() {
        this.isHideCompletly = false;
        if (this.tooltipContainer) {
            this.tooltipContainer.style.display = 'flex';
        }
        this.log('툴팁 나타남');
    }

    disable() {
        this.isHideCompletly = true;
        if (this.tooltipContainer) {
            this.tooltipContainer.style.display = 'none';
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
     * 전역 타임스탬프(ms) → 재생 시각(초) 변환이 가능한지 여부.
     * 타임라인 동기화 미리보기 등에서 변환 준비가 됐을 때만 사용. 서브클래스에서 오버라이드.
     * @returns {boolean}
     */
    canConvertGlobalTSToPlaybackTime() {
        return false;
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
        class SoopTimestampManager extends TimestampManagerBase {
    constructor() {
        super();
        this.vodInfo = null;
        this.playTimeTag = null;
        this.isEditedVod = false; // 다시보기의 일부분이 편집된 상태인가
        
        this.timeLink = null;
        this.debug('loaded');

        this.reloadingAll = false; // 현재 VOD 정보와 태그를 업데이트 중인가
        this.loop_playing = false;
        this.moveTooltipToCtrlBox();
    }

    update(){
        super.update();
        this.simpleLoopSettingUpdate();

        // VOD 변경 감지
        const url = new URL(window.location.href);
        const match = url.pathname.match(/\/player\/(\d+)/);
        const curVideoId = match[1];
        if (this.vodInfo === null || curVideoId !== this.vodInfo.id){
            this.reloadAll(curVideoId);
        }
    }

    moveTooltipToCtrlBox(){
        const ctrlBox = document.querySelector('.ctrlBox');
        const rightCtrl = document.querySelector('.right_ctrl');
        if (ctrlBox && rightCtrl && this.tooltipContainer) { 
            ctrlBox.insertBefore(this.tooltipContainer, rightCtrl);
            this.tooltipContainer.style.position = '';
            this.tooltipContainer.style.bottom = '';
            this.tooltipContainer.style.right = '';
        }
        else{
            setTimeout(() => {
                this.moveTooltipToCtrlBox();
            }, 200);
        }
    }

    simpleLoopSettingUpdate(){
        const LABEL_TEXT = '반복 재생';
        const EM_TEXT_IDLE = '(added by VODSync)';

        // 반복재생 설정이 켜져있고 비디오 태그를 찾은 경우
        if (this.videoTag !== null && this.loop_playing){
            // 현재 재생 시간이 영상 전체 재생 시간과 같은 경우 처음으로 이동
            if (this.getCurPlaybackTime() === Math.floor(this.vodInfo.total_file_duration / 1000)){
                this.moveToPlaybackTime(0);
                // 비디오 태그가 일시정지 상태인 경우 재생
                if (this.videoTag.paused){
                    this.videoTag.play();
                }
            }
        }

        //반복 재생 설정 메뉴 추가 로직
        const settingList = document.querySelector('.setting_list');
        if (!settingList) return; // 설정 창을 열지 않음.
        if (settingList.classList.contains('subLayer_on')) return; // 서브 레이어가 열려있으면 추가하지 않음.
        const ul = settingList.childNodes[0];
        const _exists = ul.querySelector('#VODSync');
        if (_exists) return; // 이미 추가되어 있음.
        
        const li = document.createElement('li');
        li.className = 'switchBtn_wrap loop_playing';
        li.id = 'VODSync';
        const label = document.createElement('label');
        label.for = 'loop_playing';
        label.innerText = LABEL_TEXT;
        const em = document.createElement('em');
        em.innerText = EM_TEXT_IDLE;
        em.style.color = '#c7cad1';
        // em.style.fontSize = '12px';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = 'loop_playing';
        input.checked = this.loop_playing;
        input.addEventListener('change',()=> {
            const a = document.querySelector('#VODSync input');
            this.loop_playing = a.checked;
            if (this.loop_playing){
                const autoPlayInput = document.querySelector('#autoplayChk');
                if (autoPlayInput && autoPlayInput.checked){
                    autoPlayInput.click();
                }
            }
            this.debug('loop_playing: ', this.loop_playing);
        });
        const span = document.createElement('span');
        label.appendChild(em);
        label.appendChild(input);
        label.appendChild(span);
        li.appendChild(label);
        ul.appendChild(li);
        
    }

    async loadVodInfo(videoId){
        const vodInfo = await window.VODSync.soopAPI.GetSoopVodInfo(videoId);
        if (!vodInfo || !vodInfo.data) return;
        const splitres = vodInfo.data.write_tm.split(' ~ ');
        this.vodInfo = {
            id: videoId,
            type: vodInfo.data.file_type,
            startDate: new Date(splitres[0]),
            endDate: splitres[1] ? new Date(splitres[1]) : null,
            files: vodInfo.data.files,
            total_file_duration: vodInfo.data.total_file_duration,
            originVodInfo: null, // 원본 다시보기의 정보
        }
        // 클립은 라이브나 다시보기에서 생성될 수 있고 캐치는 클립에서도 생성될 수 있음.
        // 현재 페이지가 클립이거나 캐치인 경우 원본 VOD의 정보를 읽음
        if (this.vodInfo.type === 'NORMAL'){
            return;
        }
        else if (this.vodInfo.type === 'CLIP' || this.vodInfo.type === 'CATCH'){
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
                        this.vodInfo.originVodInfo = {
                            type: originVodInfo.data.file_type,
                            startDate: new Date(splitres[0]),
                            endDate: new Date(splitres[1]),
                            files: originVodInfo.data.files,
                            total_file_duration: originVodInfo.data.total_file_duration,
                            originVodChangeSecond: originVodChangeSecond, // 원본 다시보기에서 현재 vod의 시작 시점의 시작 시간
                        }
                        this.vodInfo.startDate = new Date(this.vodInfo.originVodInfo.startDate.getTime() + originVodChangeSecond * 1000);
                        this.vodInfo.endDate = new Date(this.vodInfo.startDate.getTime() + this.vodInfo.total_file_duration);
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
                                    this.vodInfo.originVodInfo = {
                                        type: originOriginVodInfo.data.file_type,
                                        startDate: new Date(splitres[0]),
                                        endDate: new Date(splitres[1]),
                                        files: originOriginVodInfo.data.files,
                                        total_file_duration: originOriginVodInfo.data.total_file_duration,
                                        originVodChangeSecond: originVodChangeSecond + originOriginVodChangeSecond, // 원본 다시보기에서 현재 vod의 시작 시점의 시작 시간
                                    };
                                    this.vodInfo.startDate = new Date(this.vodInfo.originVodInfo.startDate.getTime() + (originVodChangeSecond+originOriginVodChangeSecond) * 1000);
                                    this.vodInfo.endDate = new Date(this.vodInfo.startDate.getTime() + this.vodInfo.total_file_duration);
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
                this.vodInfo.startDate = null;
                this.vodInfo.endDate = null;
                this.log('원본 다시보기와 연결되어 있지 않은 VOD입니다.');
                return;
            }
        }
        const calcedTotalDuration = this.vodInfo.endDate.getTime() - this.vodInfo.startDate.getTime();
        const durationDiff = Math.abs(calcedTotalDuration - this.vodInfo.total_file_duration);
        this.debug('오차: ', durationDiff);
        if (durationDiff < MAX_DURATION_DIFF){
            this.isEditedVod = false;
        }
        else{
            this.isEditedVod = true;
            this.log('영상 전체 재생 시간과 계산된 재생 시간이 다릅니다.');
        }
        this.log('영상 정보 로드 완료');
    }

    async reloadAll(videoId){
        if (this.reloadingAll) return;
        this.reloadingAll = true;
        const time = this.vodInfo == null ? 0 : 1000;
        setTimeout(()=>{
            this.loadVodInfo(videoId).then(()=>{
                this.reloadVideoTag();
                this.reloadingAll = false;
                this.moveTooltipToCtrlBox();
            });
        }, time);
    }
    reloadVideoTag(){
        this.playTimeTag = document.querySelector('span.time-current');
        this.videoTag = document.querySelector('#video');
        if (this.videoTag === null)
            this.videoTag = document.querySelector('#video_p');
        
        if (this.playTimeTag === null)
            setTimeout(()=>{this.reloadVideoTag()}, 500);
        else if (this.videoTag === null){
            this.log('playTimeTag 갱신됨', this.playTimeTag);
            setTimeout(()=>{this.reloadVideoTag()}, 500);
        }
        else{
            this.log('videoTag 갱신됨', this.videoTag);
        }
    }
    /* override methods */
    observeDOMChanges() {
        // const targetNode = document.body;
        // const config = { childList: true, subtree: true };

        // this.observer = new MutationObserver(() => {
        //     this.reloadAll();
        // });

        // this.observer.observe(targetNode, config);
    }
    getStreamPeriod(){
        if (!this.vodInfo || this.vodInfo.type === 'NORMAL') return null;
        const startDate = this.vodInfo.originVodInfo === null ? this.vodInfo.startDate : this.vodInfo.originVodInfo.startDate;
        const endDate = this.vodInfo.originVodInfo === null ? this.vodInfo.endDate : this.vodInfo.originVodInfo.endDate;
        return [startDate, endDate];
    }
    playbackTimeToGlobalTS(totalPlaybackSec){
        if (!this.vodInfo) return null;
        const reviewStartDate = this.vodInfo.originVodInfo === null ? this.vodInfo.startDate : this.vodInfo.originVodInfo.startDate;
        const reviewDataFiles = this.vodInfo.originVodInfo === null ? this.vodInfo.files : this.vodInfo.originVodInfo.files;
        const deltaTimeSec = this.vodInfo.originVodInfo === null ? 0 : this.vodInfo.originVodInfo.originVodChangeSecond;
        
        // 시간오차가 임계값 이하이거나 다시보기 구성 파일이 1개인 경우
        if (!this.isEditedVod || reviewDataFiles.length === 1){
            return new Date(reviewStartDate.getTime() + (totalPlaybackSec + deltaTimeSec)*1000);
        }

        if (this.isEditedVod && reviewDataFiles.length > 1 && this.vodInfo.type !== 'REVIEW'){
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
        if (!this.vodInfo || !this.videoTag) return null;
        const reviewStartDate = this.vodInfo.originVodInfo === null ? this.vodInfo.startDate : this.vodInfo.originVodInfo.startDate;
        const reviewDataFiles = this.vodInfo.originVodInfo === null ? this.vodInfo.files : this.vodInfo.originVodInfo.files;
        const deltaTimeSec = this.vodInfo.originVodInfo === null ? 0 : this.vodInfo.originVodInfo.originVodChangeSecond;
        
        // 시간오차가 임계값 이하이거나 다시보기 구성 파일이 1개인 경우
        if (!this.isEditedVod || reviewDataFiles.length === 1){
            const temp = reviewStartDate.getTime();
            const temp2 = (globalTS - temp) / 1000;
            return Math.floor(temp2) - deltaTimeSec;
        }
        if (this.isEditedVod && reviewDataFiles.length > 1 && this.vodInfo.type !== 'REVIEW'){
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

    /** @override 전역 타임스탬프 → 재생 시각 변환 가능 여부 (vodInfo, videoTag 준비 시 true) */
    canConvertGlobalTSToPlaybackTime() {
        return this.vodInfo != null;
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

        if (this.vodInfo.type === 'NORMAL' || this.vodInfo.type === "EDITOR") return '업로드 VOD는 지원하지 않습니다.';
        if (this.vodInfo.startDate === null && 
            this.vodInfo.endDate === null && 
            this.vodInfo.originVodInfo === null) {
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
            this.warn(`${this.videoId}를 제보해주시기 바랍니다.\n[VOD Synchronizer 설정] > [문의하기]`);
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
        const maxPlaybackTime = Math.floor(this.vodInfo.total_file_duration / 1000);
        if (playbackTime < 0 || playbackTime > maxPlaybackTime){
            const errorMessage = `재생 시간 범위를 벗어납니다. (${playbackTime < 0 ? playbackTime : playbackTime - maxPlaybackTime}초 초과됨)`;
            if (doAlert) 
                alert(errorMessage);
            this.warn(errorMessage);
            return false;
        }
        return this.moveToPlaybackTime(playbackTime, doAlert);
    }
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
            this.debug('timeLink 클릭됨');
        }, 500);
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
        class VODLinkerBase extends IVodSync{
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
        this.setupSearchInputKeyboardHandler();
    }
    // 주기적으로 동기화 버튼 생성 및 업데이트 (검색 결과·VOD 페이지 모두)
    startSyncButtonManagement() {
        setInterval(() => {
            const requestDate = this.getRequestVodDate();
            // 타임스탬프 매니저가 vod 정보를 불러오지 못한 경우 동기화 버튼 생성 안함
            if (!this.isValidDate(requestDate)) return;

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
        
        if (!this.isValidDate(requestDate)){
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
        const timelinePayload = (window.VODSync?.timelineCommentProcessor?.getTimelineSyncPayload?.() ?? []);
        if (timelinePayload.length > 0) {
            url.searchParams.set('timeline_sync', '1');
            try {
                localStorage.setItem('vodSync_timeline', JSON.stringify(timelinePayload));
            } catch (_) { /* quota or disabled */ }
        }
        window.open(url, "_blank");
        this.log(`VOD 링크: ${url.toString()}`);
        button.innerText = this.BTN_TEXT_IDLE;
        this.getSearchInputElement().blur();
        this.closeSearchArea();
    }
    isValidDate(date){
        return date instanceof Date && !isNaN(date.getTime());
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
    /**
     * @description 색어를 제거하고 검색결과미리보기 영역을 닫음
     */
    closeSearchArea(){
        // 파생 클래스들이 오버라이드하여 구현해야함
        throw new Error("Not implemented");
    }
    /**
     * @description 검색창 요소를 반환
     * @returns {HTMLInputElement|null} 검색창 input 요소
     */
    getSearchInputElement(){
        // 파생 클래스들이 오버라이드하여 구현해야함
        return null;
    }
    /**
     * @description 검색창에 키보드 이벤트 핸들러 설정 (Ctrl+Shift+Enter로 SyncVOD 버튼 클릭)
     */
    setupSearchInputKeyboardHandler() {
        // 검색창이 동적으로 생성될 수 있으므로 주기적으로 확인
        setInterval(() => {
            const searchInput = this.getSearchInputElement();
            if (!searchInput) return;
            
            // 이미 이벤트 리스너가 추가되어 있는지 확인
            if (searchInput.dataset.vodSyncHandlerAdded === 'true') return;
            
            searchInput.addEventListener('keydown', (e) => {
                // Ctrl+Shift+Enter 감지
                if (e.key === 'Enter' && e.ctrlKey && e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    const syncButton = document.querySelector(`.${this.SYNC_BUTTON_CLASSNAME}`);
                    if (syncButton) {
                        syncButton.click();
                    }
                }
            });
            
            // 이벤트 리스너가 추가되었음을 표시
            searchInput.dataset.vodSyncHandlerAdded = 'true';
        }, 500);
    }
}
        class SoopVODLinker extends VODLinkerBase{
    /**
     * @description 검색 결과 페이지에서 검색 결과 영역만 남기고 나머지는 숨기게 함. (other sync panel에서 iframe으로 열릴 때 사용)
     * @override
     */
    setupSearchAreaOnlyMode() {
        super.setupSearchAreaOnlyMode();
        this.waitForGnbAndSearchArea();
    }
    
    async waitForGnbAndSearchArea() {
        let allDone = true;
        const gnb = document.querySelector('#soop-gnb');
        const searchArea = document.querySelector('.topSearchArea');
        const backBtn = document.querySelector('#topSearchArea > div > div > button');
        const searchButton = document.querySelector('.btn-search');
        if (gnb && searchArea && backBtn && searchButton)
        {
            // await new Promise(resolve => setTimeout(resolve, 1000));
            Array.from(gnb.parentNode.children).forEach(sibling => {
                if (sibling !== gnb) sibling.style.display = 'none';
            });
            searchArea.style.display = "flow";
            Array.from(searchArea.parentNode.children).forEach(sibling => {
                if (sibling !== searchArea) sibling.remove();
            });
            backBtn.style.display = "none";
            document.body.style.background = 'white';
            searchButton.click();
        }
        else
            allDone = false;

        if (!allDone) setTimeout(() => this.waitForGnbAndSearchArea(), 200);
    }
    getTargetsForCreateSyncButton(){
        const targets = document.querySelectorAll('#areaSuggest > ul > li > a');
        const filteredTargets = [];
        for(const target of targets){
            if (target.querySelector('em')) continue;
            filteredTargets.push(target);
        }
        return filteredTargets;
    }
    createSyncButton(){
        const button = document.createElement("button");
        button.className = this.SYNC_BUTTON_CLASSNAME;
        button.innerText = this.BTN_TEXT_IDLE;
        button.style.background = "gray";
        button.style.fontSize = "12px";
        button.style.color = "white";
        button.style.marginLeft = "20px";
        button.style.padding = "5px";
        button.style.verticalAlign = 'middle';
        return button;
    }
    getStreamerName(button){
        const nicknameSpan = button.parentElement.querySelector('span');
        if (!nicknameSpan) return null;
        return nicknameSpan.innerText;
    }
    // 검색어를 제거하고 검색결과미리보기 영역을 닫음
    closeSearchArea(){
        const searchPreviewCloseButton = document.querySelector('.srh_back'); // SOOP 검색 결과 영역 닫기 버튼
        if (searchPreviewCloseButton) {
            searchPreviewCloseButton.click();
        }
        const delSearcButton = document.querySelector('.del_text');
        if (delSearcButton){
            delSearcButton.click();
        }
    }
    async getStreamerId(searchWord){
        const streamerId = await window.VODSync.soopAPI.GetStreamerID(searchWord);
        return streamerId;
    }
    /**
     * @description 다시보기를 찾음
     * @param {HTMLButtonElement} button 동기화 버튼
     * @param {string} streamerId 스트리머 ID
     * @param {string} streamerName 스트리머 이름
     * @param {Date} requestDate 
     * @returns {Object} {vodLink: string, startDate: Date, endDate: Date} or null
     * @override
     */
    async findVodByDatetime(button, streamerId, streamerName, requestDate) {
        const search_range_hours = 24*3;// +- 3일 동안 검색
        const search_start_date = new Date(requestDate.getTime() - search_range_hours * 60 * 60 * 1000);
        const search_end_date = new Date(requestDate.getTime() + search_range_hours * 60 * 60 * 1000);
        const vodList = await window.VODSync.soopAPI.GetSoopVOD_List(streamerId, search_start_date, search_end_date);
        const totalVodCount = vodList.data.length;
        for(let i = 0; i < totalVodCount; ++i){
            const vod = vodList.data[i];
            button.innerText = `${streamerName}의 VOD 검색 중 (${i+1}/${totalVodCount})`;
            const vodInfo = await window.VODSync.soopAPI.GetSoopVodInfo(vod.title_no);
            if (vodInfo === null){
                continue;
            }
            const period = vodInfo.data.write_tm;
            const splitres = period.split(' ~ ');
            const startDate = new Date(splitres[0]);
            const endDate = new Date(splitres[1]);
            if (startDate <= requestDate && requestDate <= endDate){
                return{
                    vodLink: `https://vod.sooplive.co.kr/player/${vod.title_no}`,
                    startDate: startDate,
                    endDate: endDate
                };
            }
        }
    }
    /**
     * @description 검색창 요소를 반환
     * @returns {HTMLInputElement|null} 검색창 input 요소
     * @override
     */
    getSearchInputElement(){
        // SOOP 검색창 선택자 (검색 결과 페이지의 검색창)
        const searchInput = document.querySelector('#search-inp');
        return searchInput || null;
    }
}
        /**
 * 다시보기 페이지의 타임라인 댓글을 인식하고, VOD linker가 동기화 시 참조할 수 있는 형태로 가공해 두는 클래스의 베이스.
 * 댓글 컨테이너를 찾은 뒤 주기적으로 댓글 요소를 찾아 타임라인 댓글이면 변환 체크박스를 붙이고,
 * 체크/해제 시 멤버 배열에 댓글 요소를 저장/제거해 두었다가 VOD linker 요청 시 가공해 전달한다.
 */

class TimelineCommentProcessorBase extends IVodSync {
    static CHECKBOX_CLASS = 'vodSync-timeline-sync-cb';

    /**
     * 자식 클래스에서 설정할 selector 변수들.
     * - containerSelector: string — 컨테이너를 찾을 CSS 선택자
     * - containerCondition: () => boolean — 컨테이너 탐색 전 조건(예: pathname). 기본은 항상 true
     * - commentRowSelector: string — 컨테이너 안 댓글 한 줄(행) 요소 선택자
     * - commentTextSelector: string — 댓글 한 줄에서 텍스트를 꺼낼 하위 요소 선택자
     * - checkboxSlotSelector: string — 댓글 한 줄에서 체크박스를 넣을 슬롯 요소 선택자(없으면 해당 행 사용)
     * - commentInputSelector: string — 댓글 작성란 입력 요소 선택자(동기화된 타임라인 자동 기입 시 사용, 자식에서 설정)
     */
    constructor() {
        super();
        this._started = false;
        /** 미리보기 내용을 채웠으면 true (인터벌에서 한 번만 채움) */
        this._timelinePayloadApplied = false;
        /** 전달받은 타임라인 동기화 페이로드 (receive 시 저장) */
        this._incomingTimelineSyncPayload = null;
        /** 미리보기 창 뼈대 (receive 시 생성). listWrap은 뼈대의 내용 영역 참조용. */
        this._timelinePreviewWrap = null;
        this._timelinePreviewListWrap = null;
        /** 채워넣은 행 데이터 (복사 버튼에서 사용) */
        this._timelinePreviewRows = null;
        /** 찾아둔 댓글 컨테이너. document에 연결되어 있으면 재탐색 생략 */
        this._cachedCommentContainer = null;
        /** 변환 체크가 된 댓글 한 줄 요소들. 체크 시 추가·해제 시 제거. */
        this._selectedCommentRows = [];
        /** 체크박스 스타일 객체. 자식 클래스에서 키 추가·값 수정 가능. (예: this.checkboxWrapStyle.right = '30px') */
        this.checkboxWrapStyle = { position: 'absolute', top: '2px', right: '2px', zIndex: 1, fontSize: '13px', padding: '2px 6px', borderRadius: '4px', transition: 'background-color .15s ease' };
        this.checkboxLabelStyle = { cursor: 'pointer', position: 'relative', display: 'inline-block' };
        this.checkboxInputStyle = { position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'pointer' };
        this.checkboxWrapCheckedStyle = { backgroundColor: '#a8d8ea', color: '#1a1a1a' };
        this.checkboxWrapUncheckedStyle = { backgroundColor: 'rgba(0,0,0,0.06)', color: '#888' };
        window.VODSync = window.VODSync || {};
        window.VODSync.timelineCommentProcessor = this;
    }

    /** style 객체를 요소에 적용. camelCase 키를 element.style에 그대로 대입. */
    _applyStyle(el, styleObj) {
        if (!styleObj) return;
        for (const [k, v] of Object.entries(styleObj)) {
            if (v != null && v !== '') el.style[k] = v;
        }
    }

    /** selector로 댓글 컨테이너 반환 (containerCondition 적용 후 containerSelector로 querySelector) */
    _getContainer() {
        if (this.containerCondition && !this.containerCondition()) return null;
        const sel = this.containerSelector;
        return sel ? document.querySelector(sel) || null : null;
    }

    /** selector로 컨테이너 안 댓글 행 목록 반환 */
    _getCommentRows(container) {
        if (!container) return [];
        const sel = this.commentRowSelector;
        if (!sel) return [];
        return Array.from(container.querySelectorAll(sel));
    }

    /** selector로 댓글 한 줄에서 표시용 텍스트 추출 */
    getTimelineCommentText(rowEl) {
        const sel = this.commentTextSelector;
        if (!sel) return rowEl?.textContent || '';
        const el = rowEl.querySelector(sel);
        return (el ? el.textContent : rowEl.textContent) || '';
    }

    /** HH:MM:SS / MM:SS 패턴으로 재생 시각(초) 파싱. 서브클래스에서 오버라이드 가능. */
    parsePlaybackSecondsFromText(text) {
        if (!text || typeof text !== 'string') return null;
        const t = text.trim();
        const withSec = t.match(/(?:^|[\s\[(])(\d{1,2}):(\d{2}):(\d{2})(?:\s|]|\)|$)/);
        if (withSec) return parseInt(withSec[1], 10) * 3600 + parseInt(withSec[2], 10) * 60 + parseInt(withSec[3], 10);
        const minSec = t.match(/(?:^|[\s\[(])(\d{1,2}):(\d{2})(?:\s|]|\)|$)(?!\d)/);
        if (minSec) return parseInt(minSec[1], 10) * 60 + parseInt(minSec[2], 10);
        return null;
    }

    /** selector로 체크박스를 넣을 슬롯 반환 (없으면 rowEl) */
    _getCheckboxInsertSlot(rowEl) {
        const sel = this.checkboxSlotSelector;
        if (!sel) return rowEl;
        return rowEl.querySelector(sel) || rowEl;
    }

    /** 재생 시각(초)을 댓글용 시간 문자열로 포맷. 자식 클래스에서 오버라이드 가능. */
    formatPlaybackTimeAsComment(playbackSec) {
        if (typeof playbackSec !== 'number' || playbackSec < 0 || !isFinite(playbackSec)) return '';
        const h = Math.floor(playbackSec / 3600);
        const m = Math.floor((playbackSec % 3600) / 60);
        const s = Math.floor(playbackSec % 60);
        if (h > 0) return `[${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}] `;
        return `[${m}:${String(s).padStart(2, '0')}] `;
    }

    /**
     * 미리보기 패널에서 타임라인 한 칸에 표시할 문자열 (H:MM:SS 또는 M:SS). 자식에서 오버라이드 가능.
     * @param {number} playbackSec
     * @returns {string}
     */
    getTimelineDisplayText(playbackSec) {
        if (typeof playbackSec !== 'number' || playbackSec < 0 || !isFinite(playbackSec)) return '--:--';
        const h = Math.floor(playbackSec / 3600);
        const m = Math.floor((playbackSec % 3600) / 60);
        const s = Math.floor(playbackSec % 60);
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    /**
     * 미리보기/댓글에 넣을 타임라인 한 칸 DOM 요소 생성. 플랫폼별로 오버라이드.
     * @param {number} playbackSec 재생 시각(초)
     * @returns {HTMLElement}
     */
    createTimelineDisplayElement(playbackSec) {
        const span = document.createElement('span');
        span.className = 'vodSync-timeline-preview-time';
        span.textContent = this.getTimelineDisplayText(playbackSec);
        span.style.cssText = 'font-family:monospace;font-size:13px;cursor:pointer;text-decoration:underline;';
        span._vodSyncUpdateTime = (sec) => { span.textContent = this.getTimelineDisplayText(sec); };
        return span;
    }

    /**
     * 타임라인 동기화 페이로드를 전달받음. 뼈대가 없으면 미리보기 창 뼈대만 생성하고, 내용 채움은 인터벌에서 주기적으로 시도.
     * @param {(string|number)[]} payload
     */
    receiveTimelineSyncPayload(payload) {
        if (!Array.isArray(payload) || payload.length === 0) return;
        this._incomingTimelineSyncPayload = payload;
        this._timelinePayloadApplied = false;
        if (!this._timelinePreviewWrap?.isConnected) {
            this._createTimelinePreviewSkeleton();
        }
    }

    /**
     * 미리보기 창 뼈대만 생성 (헤더·빈 목록 영역·푸터). 내용은 fillTimelinePreviewContent()에서 채움.
     */
    _createTimelinePreviewSkeleton() {
        const wrap = document.createElement('div');
        wrap.className = 'vodSync-timeline-preview-wrap';
        wrap.style.cssText = 'position:fixed;right:16px;bottom:16px;width:420px;max-width:90vw;max-height:80vh;z-index:99999;display:flex;flex-direction:column;box-shadow:0 4px 20px rgba(0,0,0,0.2);border-radius:8px;overflow:hidden;background:#fff;';
        const panel = document.createElement('div');
        panel.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;';

        const header = document.createElement('div');
        header.style.cssText = 'padding:10px 12px;border-bottom:1px solid #eee;font-weight:bold;font-size:14px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px;';
        header.textContent = '타임라인 동기화 미리보기';
        const collapseBtn = document.createElement('button');
        collapseBtn.type = 'button';
        collapseBtn.textContent = '접기';
        collapseBtn.style.cssText = 'padding:4px 10px;font-size:12px;cursor:pointer;';
        const bodyArea = document.createElement('div');
        bodyArea.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;';
        const listWrap = document.createElement('div');
        listWrap.style.cssText = 'overflow:auto;flex:1;min-height:120px;padding:8px;';
        const footer = document.createElement('div');
        footer.style.cssText = 'padding:10px 12px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;';

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.textContent = '변환된 타임라인 복사';
        copyBtn.style.cssText = 'padding:6px 12px;cursor:pointer;background:#1a73e8;color:#fff;border:none;border-radius:4px;font-size:12px;';
        copyBtn.addEventListener('click', () => {
            const rows = this._timelinePreviewRows;
            if (!rows || rows.length === 0) return;
            const text = rows.map(rowFrags =>
                rowFrags.map(f => f.type === 'string' ? f.value : (f.playbackSec != null ? this.formatPlaybackTimeAsComment(f.playbackSec).trim() : '--:-- ')).join('')
            ).join('\n');
            if (text) navigator.clipboard.writeText(text).then(() => { copyBtn.textContent = '복사됨'; setTimeout(() => { copyBtn.textContent = '변환된 타임라인 복사'; }, 1500); }).catch(() => { copyBtn.textContent = '복사 실패'; });
        });
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '닫기';
        closeBtn.style.cssText = 'padding:6px 12px;cursor:pointer;background:#666;color:#fff;border:none;border-radius:4px;font-size:12px;';
        closeBtn.addEventListener('click', () => {
            wrap.remove();
            this._timelinePreviewWrap = null;
            this._timelinePreviewListWrap = null;
            this._timelinePreviewRows = null;
        });

        collapseBtn.addEventListener('click', () => {
            const collapsed = bodyArea.style.display === 'none';
            bodyArea.style.display = collapsed ? 'flex' : 'none';
            collapseBtn.textContent = collapsed ? '접기' : '펴기';
        });

        header.appendChild(collapseBtn);
        footer.appendChild(copyBtn);
        footer.appendChild(closeBtn);
        bodyArea.appendChild(listWrap);
        bodyArea.appendChild(footer);
        panel.appendChild(header);
        panel.appendChild(bodyArea);
        wrap.appendChild(panel);
        document.body.appendChild(wrap);

        this._timelinePreviewWrap = wrap;
        this._timelinePreviewListWrap = listWrap;
    }

    /**
     * 수신 페이로드가 있고 tsManager가 변환 가능할 때만 미리보기 목록 영역에 내용 채움. 인터벌에서 주기 호출.
     */
    fillTimelinePreviewContent() {
        if (this._timelinePayloadApplied) return;
        const payload = this._incomingTimelineSyncPayload;
        if (!Array.isArray(payload) || payload.length === 0) return;
        if (!this._timelinePreviewListWrap?.isConnected) return;
        const tsManager = window.VODSync?.tsManager;
        if (!tsManager?.canConvertGlobalTSToPlaybackTime()) return;
        const globalTSToPlaybackTime = tsManager.globalTSToPlaybackTime;
        if (!globalTSToPlaybackTime) return;

        // 페이로드 → 순서 유지 fragments (string | timeline), \n 기준으로 행 분리
        const fragments = [];
        let globalTsCount = 0;
        let convertedCount = 0;
        for (const item of payload) {
            const asGlobalMs = typeof item === 'number' && !isNaN(item)
                ? item
                : (typeof item === 'string' && /^\d{10,15}$/.test(String(item).trim())
                    ? parseInt(item, 10)
                    : NaN);
            if (!isNaN(asGlobalMs)) {
                globalTsCount++;
                const sec = globalTSToPlaybackTime.call(tsManager, asGlobalMs);
                if (sec != null) {
                    convertedCount++;
                    fragments.push({ type: 'timeline', playbackSec: Math.max(0, Math.floor(sec)) });
                } else {
                    fragments.push({ type: 'timeline', playbackSec: null });
                }
            } else if (typeof item === 'string') {
                fragments.push({ type: 'string', value: item });
            }
        }
        if (globalTsCount > 0 && convertedCount === 0) return;

        const rows = [];
        let currentRow = [];
        for (const frag of fragments) {
            if (frag.type === 'string') {
                const parts = frag.value.split('\n');
                for (let i = 0; i < parts.length; i++) {
                    if (i > 0) {
                        rows.push(currentRow);
                        currentRow = [];
                    }
                    if (parts[i].length > 0) currentRow.push({ type: 'string', value: parts[i] });
                }
            } else {
                currentRow.push(frag);
            }
        }
        if (currentRow.length > 0) rows.push(currentRow);
        if (rows.length === 0) return;

        this._timelinePayloadApplied = true;
        this._incomingTimelineSyncPayload = null;
        this._timelinePreviewRows = rows;

        // TODO: 치지직에서도 간단하게 element 구성만으로 이동이 가능하다면 굳이 이걸 타임라인부분에 이벤트리스너를 추가할 필요가 없음.
        // const moveToPlaybackTime = tsManager?.moveToPlaybackTime?.bind(tsManager);
        const listWrap = this._timelinePreviewListWrap;
        listWrap.textContent = '';

        rows.forEach((rowFragments) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:6px 8px;border-radius:4px;margin-bottom:4px;border:1px solid #eee;font-size:13px;';
            for (const frag of rowFragments) {
                if (frag.type === 'string') {
                    const textSpan = document.createElement('span');
                    textSpan.style.whiteSpace = 'pre-wrap';
                    textSpan.textContent = frag.value;
                    row.appendChild(textSpan);
                } else {
                    if (frag.playbackSec == null) {
                        const placeholder = document.createElement('span');
                        placeholder.textContent = '--:--';
                        placeholder.style.cssText = 'font-family:monospace;color:#999;';
                        row.appendChild(placeholder);
                    } else {
                        const timeEl = this.createTimelineDisplayElement(frag.playbackSec);
                        // TODO: 치지직에서도 간단하게 element 구성만으로 이동이 가능하다면 굳이 이걸 타임라인부분에 이벤트리스너를 추가할 필요가 없음.
                        // timeEl.addEventListener('click', (e) => { e.stopPropagation(); if (moveToPlaybackTime) moveToPlaybackTime(frag.playbackSec, false); });
                        const btnMinus = document.createElement('button');
                        btnMinus.type = 'button';
                        btnMinus.textContent = '-1';
                        btnMinus.style.cssText = 'padding:2px 6px;font-size:11px;cursor:pointer;';
                        const btnPlus = document.createElement('button');
                        btnPlus.type = 'button';
                        btnPlus.textContent = '+1';
                        btnPlus.style.cssText = 'padding:2px 6px;font-size:11px;cursor:pointer;';
                        btnMinus.addEventListener('click', (e) => {
                            e.stopPropagation();
                            frag.playbackSec = Math.max(0, frag.playbackSec - 1);
                            if (timeEl._vodSyncUpdateTime) timeEl._vodSyncUpdateTime(frag.playbackSec);
                            else timeEl.textContent = this.getTimelineDisplayText(frag.playbackSec);
                        });
                        btnPlus.addEventListener('click', (e) => {
                            e.stopPropagation();
                            frag.playbackSec += 1;
                            if (timeEl._vodSyncUpdateTime) timeEl._vodSyncUpdateTime(frag.playbackSec);
                            else timeEl.textContent = this.getTimelineDisplayText(frag.playbackSec);
                        });
                        row.appendChild(timeEl);
                        row.appendChild(btnMinus);
                        row.appendChild(btnPlus);
                    }
                }
            }
            listWrap.appendChild(row);
        });
    }

    /** 체크박스(또는 그 자식)가 속한 댓글 한 줄 요소 반환 */
    getTimelineCommentRowContaining(descendantEl) {
        let container = this._cachedCommentContainer?.isConnected ? this._cachedCommentContainer : null;
        if (!container) {
            container = this._getContainer();
            this._cachedCommentContainer = container;
        }
        if (!container) return null;
        const rows = this._getCommentRows(container);
        return rows.find(row => row.contains(descendantEl)) || null;
    }

    /**
     * 댓글 컨테이너에서 댓글들을 찾아, 타임라인 댓글이면 변환 체크박스를 추가한다.
     * (이미 체크박스가 있는 행은 스킵. 수정·접기 등으로 DOM이 바뀌어도 주기 호출로 다시 붙일 수 있음)
     */
    scanAndAttachCheckboxes(container) {
        if (!container) return;
        const rows = this._getCommentRows(container);
        for (const rowEl of rows) {
            if (rowEl.querySelector(`.${this.constructor.CHECKBOX_CLASS}`)) continue;
            const text = this.getTimelineCommentText(rowEl);
            const sec = this.parsePlaybackSecondsFromText(text);
            if (sec == null) continue;
            this.appendSyncCheckboxToRow(rowEl, sec);
        }
    }

    /**
     * 특정 댓글 한 줄 요소에 변환 체크박스를 추가. 체크/해제 시 _selectedCommentRows에 반영·배경색 시각화.
     */
    appendSyncCheckboxToRow(rowEl, playbackTimeSec) {
        const slot = this._getCheckboxInsertSlot(rowEl);
        if (!slot) return false;
        const wrap = document.createElement('span');
        wrap.className = 'vodSync-timeline-sync-wrap';
        this._applyStyle(wrap, this.checkboxWrapStyle);
        const label = document.createElement('label');
        label.title = '다른 스트리머의 다시보기가 동기화될 때 이 타임라인 댓글이 동기화된 다시보기에 맞춰 변환됩니다';
        this._applyStyle(label, this.checkboxLabelStyle);
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = this.constructor.CHECKBOX_CLASS;
        cb.dataset.playbackSec = String(playbackTimeSec);
        this._applyStyle(cb, this.checkboxInputStyle);
        const updateWrapStyle = () => {
            this._applyStyle(wrap, cb.checked ? this.checkboxWrapCheckedStyle : this.checkboxWrapUncheckedStyle);
        };
        cb.addEventListener('change', () => {
            updateWrapStyle();
            if (cb.checked) {
                if (!this._selectedCommentRows.includes(rowEl)) this._selectedCommentRows.push(rowEl);
            } else {
                this._selectedCommentRows = this._selectedCommentRows.filter(r => r !== rowEl);
            }
        });
        updateWrapStyle();
        label.appendChild(cb);
        label.appendChild(document.createTextNode('동기화할 때 이 타임라인을 변환'));
        wrap.appendChild(label);
        const pos = window.getComputedStyle(slot).position;
        if (!pos || pos === 'static') slot.style.position = 'relative';
        slot.appendChild(wrap);
        return true;
    }

    /** VOD linker가 호출. 변환 체크된 댓글 요소들을 모아 가공한 페이로드 반환. */
    getTimelineSyncPayload() {
        const connected = this._selectedCommentRows.filter(r => r.isConnected);
        this._selectedCommentRows = connected;
        return this.buildPayloadFromCommentRows(connected);
    }

    /**
     * 1개 이상의 댓글 요소를 받아 동기화 전달용 데이터로 가공. 각 행의 체크박스로 세그먼트를 만든 뒤 이어 붙임.
     * @param {Element[]} rowElements
     * @returns {(string|number)[]}
     */
    buildPayloadFromCommentRows(rowElements) {
        const result = [];
        let first = true;
        for (const rowEl of rowElements) {
            const cb = rowEl.querySelector(`.${this.constructor.CHECKBOX_CLASS}`);
            if (!cb) continue;
            if (!first) result.push('\n');
            first = false;
            const segs = this.buildSyncSegmentsFromCheckbox(cb);
            if (Array.isArray(segs)) {
                for (const x of segs) {
                    if (typeof x === 'string' || (typeof x === 'number' && !isNaN(x))) result.push(x);
                }
            }
        }
        return result;
    }

    /**
     * 체크박스가 속한 댓글 한 줄에서 동기화용 세그먼트 생성. 파생 클래스에서 오버라이드 가능.
     * @param {HTMLInputElement} checkboxEl
     * @returns {(string|number)[]}
     */
    buildSyncSegmentsFromCheckbox(checkboxEl) {
        const rowEl = this.getTimelineCommentRowContaining(checkboxEl);
        const text = rowEl ? this.getTimelineCommentText(rowEl) : '';
        const sec = parseInt(checkboxEl.dataset.playbackSec, 10);
        if (isNaN(sec)) return text ? [text] : [];
        const tsManager = window.VODSync?.tsManager;
        const globalDate = tsManager?.playbackTimeToGlobalTS?.(sec);
        const globalMs = globalDate instanceof Date && !isNaN(globalDate.getTime()) ? globalDate.getTime() : null;
        if (globalMs != null) return [globalMs, text];
        return text ? [text] : [];
    }

    /**
     * 타임라인 댓글 감시 시작. 주기적으로 컨테이너를 찾고, 있으면 해당 컨테이너에서 댓글을 찾아 체크박스를 붙인다.
     */
    startWatching() {
        if (this._started) return;
        this._started = true;
        setInterval(() => {
            let container = this._cachedCommentContainer;
            if (!container || !container.isConnected) {
                container = this._getContainer();
                this._cachedCommentContainer = container;
            }
            this.scanAndAttachCheckboxes(container);
            this.fillTimelinePreviewContent();
        }, 500);
    }
}
        class SoopTimelineCommentProcessor extends TimelineCommentProcessorBase {
    constructor() {
        super();
        this.containerSelector = '#commentHighlight';
        this.commentRowSelector = 'li';
        this.commentTextSelector = '.cmmt-txt';
        this.checkboxSlotSelector = '.cmmt-header';
        this.checkboxWrapStyle.right = '30px';
        /** 댓글 작성란 입력 요소 (동기화된 타임라인 자동 기입 시 사용) */
        this.commentInputSelector = '#commentWrite, .comment_write textarea, [class*="commentWrite"] textarea, [class*="comment_write"]';
    }

    buildSyncSegmentsFromCheckbox(checkboxEl) {
        const rowEl = this.getTimelineCommentRowContaining(checkboxEl);
        const cmmtTxt = rowEl?.querySelector('.cmmt-txt');
        if (!cmmtTxt) return [];
        const tsManager = window.VODSync?.tsManager;
        const root = cmmtTxt.querySelector('p') || cmmtTxt;
        const result = [];
        const nodes = root.childNodes;
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (node.nodeType === Node.TEXT_NODE) {
                const t = node.textContent?.trim();
                if (t) result.push(t);
                continue;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            if (node.classList?.contains('best')) continue;
            if (node.tagName === 'BR') { result.push('\n'); continue; }
            if (node.classList?.contains('time_link') && node.hasAttribute('data-time')) {
                const sec = parseInt(node.getAttribute('data-time'), 10);
                if (!isNaN(sec) && tsManager?.playbackTimeToGlobalTS) {
                    const globalDate = tsManager.playbackTimeToGlobalTS(sec);
                    if (globalDate instanceof Date && !isNaN(globalDate.getTime())) {
                        result.push(globalDate.getTime());
                    }
                }
                let text = '';
                for (i++; i < nodes.length; i++) {
                    const n = nodes[i];
                    if (n.nodeType === Node.TEXT_NODE) text += n.textContent;
                    else if (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'BR') break;
                    else if (n.nodeType === Node.ELEMENT_NODE && !n.classList?.contains('best')) text += n.textContent || '';
                }
                const trimmed = text.trim();
                if (trimmed) result.push(trimmed);
                i--;
                continue;
            }
            const t = node.textContent?.trim();
            if (t) result.push(t);
        }
        return result;
    }

    /** Soop 댓글 타임라인 스타일: <a class="time_link">[ <strong class="time_link">HH:MM:SS</strong> ]</a> */
    createTimelineDisplayElement(playbackSec) {
        const sec = Math.floor(playbackSec);
        const a = document.createElement('a');
        a.setAttribute('data-time', String(sec));
        a.className = 'time_link';
        a.style.cursor = 'pointer';
        a.appendChild(document.createTextNode('[ '));
        const strong = document.createElement('strong');
        strong.className = 'time_link';
        strong.setAttribute('data-time', String(sec));
        strong.textContent = this.getTimelineDisplayText(playbackSec);
        a.appendChild(strong);
        a.appendChild(document.createTextNode(' ]'));
        const self = this;
        a._vodSyncUpdateTime = (s) => {
            const n = Math.floor(s);
            a.setAttribute('data-time', String(n));
            strong.setAttribute('data-time', String(n));
            strong.textContent = self.getTimelineDisplayText(s);
        };
        return a;
    }
}
        class SoopPrevChatViewer extends IVodSync {
    constructor() {
        super();
        this.restoreButton = null;
        this.settingsButton = null;
        this.buttonContainer = null;
        this.chatMemo = null; // chatMemo 참조 저장 (복구된 채팅 추가용)
        this.boxVstart = null; // boxVstart 참조 저장 (채팅 초기화 감지용)
        this.settingsPopup = null;
        this.isRestoring = false;
        this.checkInterval = null;
        // 복원 구간: startTime/endTime (playbackTime 기준)
        this._restoreTimeRange = null;
        this.vodInfo = null; // VOD 정보 캐시
        this.signatureEmoticon = null; // 시그니처 이모티콘 데이터 캐시
        this.defaultEmoticon = null; // 기본 이모티콘 데이터 캐시
        this.emoticonReplaceMap = new Map(); // 이모티콘 ID -> 이미지 HTML 매핑
        this.cachedChatData = []; // 캐시된 채팅 데이터 [{startTime, endTime, messages}, ...]
        this.restoreInterval = 30; // 복원 구간 단위 (초)
        this.excludeEmoticonOnlyChat = false; // 이모티콘만으로 이루어진 채팅 복원 제외 여부
        this.initialRestoreEndTime = null; // statVBox 재생성 시점의 복구 끝지점 (playbackTime, 초 단위)
        this.sharedTooltip = null; // 재사용할 공통 툴팁 요소
        this.log('loaded');
        this.loadRestoreInterval();
        this.init();
    }

    // restoreTimeRange getter/setter (setter에서 자동으로 버튼 텍스트 업데이트)
    get nextRestorePlan() {return this._restoreTimeRange;}

    set nextRestorePlan(value) { 
        this._restoreTimeRange = value; 
        this.updateButtonText();    
    }

    // 설정에서 복원 구간 불러오기
    async loadRestoreInterval() {
        // 크롬 확장 프로그램 환경에서만 설정 로드 (탬퍼몽키가 아닌 경우)
        if (window.VODSync?.IS_TAMPER_MONKEY_SCRIPT === true) {
            return;
        }
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getAllSettings' });
            if (response && response.success && response.settings) {
                const interval = response.settings.soopRestoreInterval;
                if (interval !== undefined) {
                    this.restoreInterval = interval;
                    this.log(`복원 구간 설정 로드: ${interval}초`);
                }
                if (response.settings.soopExcludeEmoticonOnlyChat !== undefined) {
                    this.excludeEmoticonOnlyChat = response.settings.soopExcludeEmoticonOnlyChat;
                    this.log('이모티콘만 복원 제외 설정 로드:', this.excludeEmoticonOnlyChat);
                }
            }
        } catch (error) {
            this.log('복원 구간 설정 로드 실패:', error);
        }
    }

    // 복원 구간 설정 저장
    async saveRestoreInterval() {
        // 크롬 확장 프로그램 환경에서만 설정 저장 (탬퍼몽키가 아닌 경우)
        if (window.VODSync?.IS_TAMPER_MONKEY_SCRIPT === true) {
            return;
        }
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'saveSettings',
                settings: {
                    soopRestoreInterval: this.restoreInterval,
                    soopExcludeEmoticonOnlyChat: this.excludeEmoticonOnlyChat
                }
            });
            if (response && response.success) {
                this.log(`복원 구간 설정 저장: ${this.restoreInterval}초, 이모티콘만 제외: ${this.excludeEmoticonOnlyChat}`);
            }
        } catch (error) {
            this.log('복원 구간 설정 저장 실패:', error);
        }
    }

    init() {
        // 공통 툴팁 요소 생성
        this.sharedTooltip = document.createElement('div');
        this.sharedTooltip.className = 'vodsync-chat-tooltip';
        this.sharedTooltip.style.cssText = `
            position: fixed;
            padding: 4px 8px;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.1s;
            z-index: 10000;
        `;
        document.body.appendChild(this.sharedTooltip);
        
        setTimeout(() => {
            this.checkInterval = setInterval(() => this.monitoringChatBoxVstartChange(), 500);
        }, 1000);
    }

    // boxVstart 변화 감지 및 채팅 초기화 처리
    monitoringChatBoxVstartChange() {
        if (this.boxVstart && this.boxVstart.isConnected) return;
        if (this.buttonContainer){
            this.buttonContainer.remove();
            this.buttonContainer = null;
            this.restoreButton = null; 
            this.settingsButton = null;
            this.chatMemo = null;
            this.boxVstart = null;
            this.initialRestoreEndTime = null; // statVBox 재생성 시 초기화
        }

        // ~ 이후에 저장된 채팅입니다. 메시지 찾기
        const boxVstart = document.getElementById('boxVstart');
        if (!boxVstart) return;

        const chatMemo = boxVstart.parentElement;
        if (!chatMemo) return;

        const chatArea = document.getElementById('chatArea');
        if (!chatArea) return;

        const video = document.querySelector('#video');
        if (!video || !video.src || video.readyState < 2) return;

        const tsManager = window.VODSync?.tsManager;
        if (!tsManager) {
            this.error('SoopTimestampManager를 찾을 수 없습니다.');
            return;
        }

        const currentPlaybackTime = tsManager.getCurPlaybackTime();
        if (currentPlaybackTime === null) {
            this.error('재생 시간을 가져올 수 없습니다.');
            return;
        }

        const endTime = currentPlaybackTime;
        const startTime = Math.max(0, currentPlaybackTime - this.restoreInterval);
        
        // statVBox 재생성 시점의 복구 끝지점 저장 (처음 세팅되는 시점)
        if (this.initialRestoreEndTime === null) {
            this.initialRestoreEndTime = endTime;
        }
        
        this.nextRestorePlan = { 
            startTime, 
            endTime
        };
        
        this.addRestoreButton(chatArea, chatMemo);
        this.log(`채팅 초기화 감지 및 복원 구간 설정: ${this.formatTime(startTime)} ~ ${this.formatTime(endTime)}`);
    }

    // 복원 버튼 추가
    addRestoreButton(chatArea, chatMemo) {
        // 버튼 컨테이너 생성
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; align-items: center; gap: 5px; margin: 10px; height:35px;';
        buttonContainer.setAttribute('data-vodsync-restore-container', 'true');

        const button = document.createElement('button');
        button.setAttribute('data-vodsync-restore', 'true');
        button.style.cssText = `
            padding: 8px 16px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            width: 100%;
            height: 35px;
        `;
        button.addEventListener('click', () => this.restorePreviousChats());
        button.addEventListener('mouseenter', () => {
            if (!button.disabled) {
                button.style.backgroundColor = '#45a049';
            }
        });
        button.addEventListener('mouseleave', () => {
            if (!button.disabled) {
                button.style.backgroundColor = '#4CAF50';
            }
        });

        // 설정 버튼 생성
        const settingsBtn = document.createElement('button');
        settingsBtn.setAttribute('data-vodsync-settings', 'true');
        settingsBtn.innerHTML = '⚙️';
        settingsBtn.style.cssText = `
            padding: 8px 12px;
            background-color: #666;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            max-height: 35px;
        `;
        settingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showSettingsPopup();
        });
        settingsBtn.addEventListener('mouseenter', () => settingsBtn.style.backgroundColor = '#555');
        settingsBtn.addEventListener('mouseleave', () => settingsBtn.style.backgroundColor = '#666');

        buttonContainer.appendChild(button);
        buttonContainer.appendChild(settingsBtn);

        // chatArea의 첫 번째 요소 앞에 버튼 컨테이너 추가
        chatArea.insertBefore(buttonContainer, chatArea.firstChild);
        this.buttonContainer = buttonContainer;
        this.restoreButton = button;
        this.settingsButton = settingsBtn;
        this.chatMemo = chatMemo;
        this.boxVstart = boxVstart;
        this.updateButtonText();
    }

    // 채팅 복원 실행
    async restorePreviousChats() {
        if (this.isRestoring || !this.restoreButton || !this.nextRestorePlan) return;

        this.isRestoring = true;
        this.updateButtonText(' - 복원 중...', true);

        try {
            const { startTime, endTime } = this.nextRestorePlan;
            const videoId = this.getVideoId();
            if (!videoId) throw new Error('VOD ID를 가져올 수 없습니다.');

            const soopAPI = window.VODSync?.soopAPI;
            if (!soopAPI) throw new Error('SoopAPI를 찾을 수 없습니다.');

            // vodInfo 먼저 요청해서 chat_duration 확인
            if (!this.vodInfo) {
                this.vodInfo = await soopAPI.GetSoopVodInfo(videoId);
                this.signatureEmoticon = await soopAPI.GetSignitureEmoticon(this.vodInfo?.data?.bj_id);
                this.defaultEmoticon = await soopAPI.GetEmoticon();
                this.buildEmoticonReplaceMap();
                this.log(`시그니처 이모티콘 로드 완료: ${this.signatureEmoticon}`);
                this.log(`기본 이모티콘 로드 완료: ${this.defaultEmoticon}`);
            }

            const chatDuration = this.vodInfo?.data?.chat_duration || 300; // 기본값 300초

            // 캐시에서 해당 구간 찾기
            let messages = this.getCachedChatData(startTime, endTime);
            
            // 캐시에 없으면 요청해서 캐시에 저장
            if (messages === null) {
                const fetchStartTime = Math.max(0, endTime - chatDuration);
                messages = await this.fetchAndCacheChatData(videoId, fetchStartTime, endTime, chatDuration);
            }

            // 실제 복원 구간만 필터링
            let filteredMessages = messages.filter(msg =>
                msg.timestamp >= startTime * 1000 && msg.timestamp <= endTime * 1000
            );

            let excludedCount = 0;
            if (this.excludeEmoticonOnlyChat) {
                const included = [];
                for (const msg of filteredMessages) {
                    if (this.isEmoticonOnlyMessage(msg)) {
                        excludedCount++;
                    } else {
                        included.push(msg);
                    }
                }
                filteredMessages = included;
            }

            let restoredCount = 0;
            if (filteredMessages.length > 0) {
                const chatElements = filteredMessages.map(msg => this.createChatElement(msg)).filter(el => el !== null);
                restoredCount = chatElements.length;
                this.insertChatsBelowButton(chatElements);
                this.log(`${restoredCount}개 채팅 복원 완료` + (excludedCount > 0 ? ` (${excludedCount}개 제외)` : ''));
            } else {
                this.log('복원할 채팅이 없습니다.');
            }

            // 다음 복원 구간 계산 (더 이전 restoreInterval만큼)
            this.nextRestorePlan = {
                startTime: Math.max(0, startTime - this.restoreInterval),
                endTime: startTime
            };

            // 복원 완료 후 버튼 텍스트 업데이트
            if (this.restoreButton) {
                const suffix = excludedCount > 0
                    ? ` - ${restoredCount}개, ${excludedCount} 제외`
                    : ` - ${restoredCount}개`;
                this.updateButtonText(suffix, false);
            }

        } catch (error) {
            this.error('채팅 복원 오류:', error);
            if (this.restoreButton) {
                this.updateButtonText(' - 복원 실패, 다시 시도', false);
            }
        } finally {
            this.isRestoring = false;
        }
    }

    // 캐시에서 해당 구간의 채팅 데이터 찾기
    getCachedChatData(startTime, endTime) {
        const startTimeMs = startTime * 1000;
        const endTimeMs = endTime * 1000;

        for (const cache of this.cachedChatData) {
            const cacheStartMs = cache.startTime * 1000;
            const cacheEndMs = cache.endTime * 1000;
            
            // 요청 구간이 캐시 구간에 완전히 포함되는지 확인
            if (startTimeMs >= cacheStartMs && endTimeMs <= cacheEndMs) {
                return cache.messages;
            }
        }
        
        return null; // 캐시에 없음
    }

    // 채팅 데이터를 가져와서 캐시에 저장
    async fetchAndCacheChatData(videoId, fetchStartTime, endTime, chatDuration) {
        const soopAPI = window.VODSync?.soopAPI;
        if (!soopAPI) throw new Error('SoopAPI를 찾을 수 없습니다.');
        
        this.log(`채팅 로그 요청: ${fetchStartTime}초 ~ ${endTime}초 (chat_duration: ${chatDuration}초)`);
        
        const chatLogXml = await soopAPI.GetChatLog(videoId, fetchStartTime, endTime);
        if (!chatLogXml) {
            this.warn('채팅 로그를 가져올 수 없습니다.');
            return [];
        }

        // 필터링 없이 모든 메시지 파싱 (캐시용)
        const messages = this.parseChatLogXmlRaw(chatLogXml);
        
        // 캐시에 저장
        this.cachedChatData.push({
            startTime: fetchStartTime,
            endTime: endTime,
            messages: messages
        });

        this.log(`캐시 저장: ${fetchStartTime}초 ~ ${endTime}초 (${messages.length}개 메시지)`);
        
        return messages;
    }

    // XML 파싱하여 메시지 데이터 반환 (필터링 없이 모든 메시지)
    parseChatLogXmlRaw(xmlText) {
        const messages = [];

        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "application/xml");

            const parserError = xmlDoc.querySelector("parsererror");
            if (parserError) {
                this.error("XML 파싱 오류:", parserError.textContent || parserError.innerText || '');
                return [];
            }

            Array.from(xmlDoc.querySelectorAll("root > chat, root > ogq")).forEach((chat) => {
                const msg = (chat.querySelector('m')?.textContent || '').trim();
                const timestampStr = (chat.querySelector('t')?.textContent || '').trim();
                const isOgq = chat.tagName.toLowerCase() === 'ogq';
                
                let pValue, p2Value;
                if (isOgq) {
                    const sfValue = (chat.querySelector('sf')?.textContent || '').trim();
                    [pValue, p2Value] = sfValue.split('|').map(v => v.trim());
                } else {
                    pValue = (chat.querySelector('p')?.textContent || '').trim();
                    p2Value = (chat.querySelector('p2')?.textContent || '').trim();
                }
                const nicknameColor = (chat.querySelector('nf')?.textContent || '').trim();
                const subscriptionMonths = (chat.querySelector('acfw')?.textContent || '').trim();
                
                const ogqGid = isOgq ? (chat.querySelector('gid')?.textContent || '').trim() : null;
                const ogqSid = isOgq ? (chat.querySelector('sid')?.textContent || '').trim() : null;
                const ogqVersion = isOgq ? (chat.querySelector('v')?.textContent || '').trim() : null;
                const ogqAnm = isOgq ? (chat.querySelector('anm')?.textContent || '').trim() : null;
                
                const userId = isOgq ? (chat.querySelector('s')?.textContent || '').trim() : (chat.querySelector('u')?.textContent || '').trim();
                const userNick = isOgq ? (chat.querySelector('sn')?.textContent || '').trim() : (chat.querySelector('n')?.textContent || '').trim();
                
                if (!timestampStr) return;

                const timestamp = parseFloat(timestampStr);
                if (isNaN(timestamp) || timestamp === 0) return;

                const timestampMs = Math.floor(timestamp * 1000);

                const p2Num = parseInt(p2Value || '0', 10);
                const subscriptionTier = ((p2Num & 0x80000) !== 0) ? 2 : 1;
                const badgeType = this.getBadgeType(pValue);
                const gradeValue = this.getGradeValue(pValue, subscriptionMonths);

                let ogqImageUrl = null;
                if (isOgq && ogqGid && ogqSid) {
                    const fileExtension = (ogqAnm === '1') ? 'webp' : 'png';
                    ogqImageUrl = `https://ogq-sticker-global-cdn-z01.sooplive.co.kr/sticker/${ogqGid}/${ogqSid}_80.${fileExtension}?ver=${ogqVersion || '1'}`;
                }

                const ogqPurchaseUrl = isOgq && ogqGid 
                    ? `https://ogqmarket.sooplive.co.kr?m=detail&productId=${ogqGid}`
                    : null;

                messages.push({
                    userId, userNick, msg, timestamp: timestampMs, nicknameColor,
                    subscriptionMonths, subscriptionTier, badgeType, gradeValue,
                    isOgq, ogqImageUrl, ogqPurchaseUrl
                });
            });

            messages.sort((a, b) => a.timestamp - b.timestamp);
            return messages;
        } catch (error) {
            this.error('XML 파싱 오류:', error);
            return [];
        }
    }

    // 채팅 DOM 요소 생성
    createChatElement(chatData) {
        const { 
            userId, 
            userNick, 
            msg, 
            timestamp,
            nicknameColor, 
            subscriptionMonths, 
            subscriptionTier, 
            badgeType, 
            gradeValue,
            isOgq, 
            ogqImageUrl, 
            ogqPurchaseUrl 
        } = chatData;

        if (!userNick && !userId) {
            this.warn('채팅 데이터에 userNick과 userId가 없습니다:', chatData);
            return null;
        }

        const chatItem = document.createElement('div');
        chatItem.className = 'chatting-list-item';
        if (badgeType) {
            chatItem.setAttribute('user-type', badgeType);
        }

        const messageContainer = document.createElement('div');
        messageContainer.className = 'message-container';
        const usernameDiv = document.createElement('div');
        usernameDiv.className = 'username';
        const button = document.createElement('button');
        
        // 퍼스나콘 (구독 개월수 -1이면 표시 안함)
        const subscriptionMonthsNum = parseInt(subscriptionMonths || '-1', 10);
        if (subscriptionMonthsNum !== -1) {
            const thumb = document.createElement('span');
            thumb.className = 'thumb';
            const img = document.createElement('img');
            img.id = 'author';
            if (userId) {
                img.setAttribute('user_id', userId);
                img.setAttribute('user_nick', userNick || '');
                img.setAttribute('grade', gradeValue.toString());
                const personalconUrl = this.getPersonalconUrl(subscriptionMonths, subscriptionTier || 1);
                img.src = personalconUrl || 'https://res.sooplive.co.kr/images/chatting/signature-default.svg';
            } else {
                img.setAttribute('user_nick', userNick || '');
                img.setAttribute('grade', gradeValue.toString());
                img.src = 'https://res.sooplive.co.kr/images/chatting/signature-default.svg';
            }
            img.onerror = function() {
                this.src = 'https://res.sooplive.co.kr/images/chatting/signature-default.svg';
            };
            thumb.appendChild(img);
            button.appendChild(thumb);
        }
        
        // 배지
        if (badgeType) {
            const badge = document.createElement('span');
            if (badgeType === 'support') {
                badge.className = 'grade-badge-support';
                badge.setAttribute('tip', '서포터');
                badge.innerText = 'S';
            } else if (badgeType === 'vip') {
                badge.className = 'grade-badge-vip';
                badge.setAttribute('tip', '열혈팬');
                badge.innerText = '열';
            } else if (badgeType === 'subscribe') {
                badge.className = 'grade-badge-fan';
                badge.setAttribute('tip', '팬클럽');
                badge.innerText = 'F';
            } else if (badgeType === 'manager') {
                badge.className = 'grade-badge-manager';
                badge.setAttribute('tip', '매니저');
                badge.innerText = 'M';
            }
            badge.id = 'author';
            if (userId) badge.setAttribute('user_id', userId);
            badge.setAttribute('user_nick', userNick || '');
            badge.setAttribute('grade', gradeValue.toString());
            button.appendChild(badge);
        }
        
        // 사용자명
        const author = document.createElement('span');
        author.className = 'author random-color4';
        author.id = 'author';
        author.setAttribute('href', 'javascript:;');
        if (userId) author.setAttribute('user_id', userId);
        author.setAttribute('user_nick', userNick || '');
        author.setAttribute('grade', gradeValue.toString());
        author.innerText = userNick || '알 수 없음';
        if (nicknameColor) {
            author.style.color = `#${nicknameColor}`;
        }
        button.appendChild(author);
        usernameDiv.appendChild(button);

        // 메시지 텍스트
        const messageTextDiv = document.createElement('div');
        messageTextDiv.className = 'message-text';
        
        // OGQ 이모티콘
        if (isOgq && ogqImageUrl && ogqPurchaseUrl) {
            const emoticonBox = document.createElement('div');
            emoticonBox.className = 'emoticon-box';
            const imgBox = document.createElement('a');
            imgBox.className = 'img-box';
            imgBox.setAttribute('tip', '구매하기');
            imgBox.href = ogqPurchaseUrl;
            imgBox.target = '_blank';
            const ogqImg = document.createElement('img');
            ogqImg.className = 'ogqEmoticon';
            ogqImg.setAttribute('data-original-ext', ogqImageUrl.includes('.webp') ? 'webp' : 'png');
            ogqImg.style.cursor = 'pointer';
            ogqImg.src = ogqImageUrl;
            ogqImg.onerror = function() {
                this.src = 'https://res.sooplive.co.kr/images/chat/ogq_default.png';
            };
            imgBox.appendChild(ogqImg);
            emoticonBox.appendChild(imgBox);
            messageTextDiv.appendChild(emoticonBox);
        }
        
        const p = document.createElement('p');
        p.className = 'msg';
        p.style.color = '0';
        
        // 시그니처 이모티콘 처리
        if (msg && this.signatureEmoticon) {
            this.processSignatureEmoticons(p, msg);
        } else {
            p.innerText = msg || '';
        }
        
        // playbackTime 커스텀 툴팁 설정
        if (timestamp && this.initialRestoreEndTime !== null && this.sharedTooltip) {
            const playbackTimeSeconds = Math.floor(timestamp / 1000);
            const secondsAgo = Math.floor(this.initialRestoreEndTime - playbackTimeSeconds);
            
            let tooltipText;
            if (secondsAgo < 0) {
                // 미래 시간인 경우 (이론적으로는 발생하지 않아야 함)
                tooltipText = this.formatTime(playbackTimeSeconds);
            } else if (secondsAgo === 0) {
                tooltipText = '방금 전';
            } else {
                const hours = Math.floor(secondsAgo / 3600);
                const minutes = Math.floor((secondsAgo % 3600) / 60);
                const seconds = secondsAgo % 60;
                
                const parts = [];
                if (hours > 0) {
                    parts.push(`${hours}시간`);
                }
                if (minutes > 0) {
                    parts.push(`${minutes}분`);
                }
                if (seconds > 0 || parts.length === 0) {
                    parts.push(`${seconds}초`);
                }
                
                tooltipText = `${parts.join(' ')} 전`;
            }

            // 마우스 이벤트로 공통 툴팁 표시/숨김
            messageTextDiv.addEventListener('mouseenter', (e) => {
                if (!this.sharedTooltip) return;
                
                const rect = messageTextDiv.getBoundingClientRect();
                this.sharedTooltip.textContent = tooltipText;
                this.sharedTooltip.style.right = `${window.innerWidth - rect.right}px`;
                this.sharedTooltip.style.top = `${rect.top - 5}px`;
                this.sharedTooltip.style.opacity = '1';
            });
            messageTextDiv.addEventListener('mouseleave', () => {
                if (this.sharedTooltip) {
                    this.sharedTooltip.style.opacity = '0';
                }
            });
        }
        
        messageTextDiv.appendChild(p);

        messageContainer.appendChild(usernameDiv);
        messageContainer.appendChild(messageTextDiv);
        chatItem.appendChild(messageContainer);

        return chatItem;
    }

    // 채팅을 버튼 컨테이너와 다음 요소 사이에 삽입
    insertChatsBelowButton(chatElements) {
        if (!this.chatMemo || chatElements.length === 0) return;

        const fragment = document.createDocumentFragment();
        chatElements.forEach(el => fragment.appendChild(el));

        // chatMemo의 첫 번째 요소 앞에 삽입
        if (this.chatMemo.firstChild) {
            this.chatMemo.insertBefore(fragment, this.chatMemo.firstChild);
        } else {
            this.chatMemo.appendChild(fragment);
        }
    }

    // 버튼 텍스트 및 상태 업데이트
    updateButtonText(suffix = '', disabled = undefined) {
        if (!this.restoreButton) return;
        
        if (disabled !== undefined) {
            this.restoreButton.disabled = disabled;
            // 비활성화 상태에 따른 스타일 업데이트
            if (disabled) {
                this.restoreButton.style.backgroundColor = '#cccccc';
                this.restoreButton.style.cursor = 'not-allowed';
                this.restoreButton.style.opacity = '0.6';
            } else {
                this.restoreButton.style.backgroundColor = '#4CAF50';
                this.restoreButton.style.cursor = 'pointer';
                this.restoreButton.style.opacity = '1';
            }
        }
        
        if (!this.nextRestorePlan) {
            // nextRestorePlan이 없을 때는 suffix가 있으면 사용, 없으면 "준비 중" 표시
            const text = suffix ? `이전 채팅 복원${suffix}` : '이전 채팅 복원 준비 중';
            this.restoreButton.innerText = text;
            this.restoreButton.title = '';
            return;
        }

        const { startTime, endTime } = this.nextRestorePlan;
        
        // 툴팁에 복원 구간 표시
        if (startTime !== undefined && endTime !== undefined) {
            this.restoreButton.title = `다음 복원 구간: ${this.formatTime(startTime)} ~ ${this.formatTime(endTime)}`;
        } else {
            this.restoreButton.title = '';
        }

        // 버튼 텍스트에는 복원 구간 길이(초)만 표시
        this.restoreButton.innerText = `이전 채팅 복원 (${this.restoreInterval}초)${suffix}`;
    }

    // 초를 HH:MM:SS 형식으로 변환
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // 시그니처 이모티콘 및 기본 이모티콘 매핑 데이터 생성
    buildEmoticonReplaceMap() {
        this.emoticonReplaceMap.clear();
        
        // 시그니처 이모티콘 처리
        if (this.signatureEmoticon?.data && this.signatureEmoticon?.img_path) {
            const imgPath = this.signatureEmoticon.img_path;
            const tier1 = this.signatureEmoticon.data.tier1 || [];
            const tier2 = this.signatureEmoticon.data.tier2 || [];
            const allEmoticons = [...tier1, ...tier2];

            allEmoticons.forEach(emoticon => {
                // move_img가 'Y'이면 pc_alternate_img 사용, 아니면 pc_img 사용
                const imgFileName = emoticon.move_img === 'Y' && emoticon.pc_alternate_img 
                    ? emoticon.pc_alternate_img 
                    : emoticon.pc_img;
                const imgUrl = imgPath + imgFileName;
                const imgHtml = `<img class="emoticon" src="${imgUrl}">`;
                
                // `/이모티콘ID/` -> `<img>` HTML 매핑
                this.emoticonReplaceMap.set(`/${emoticon.title}/`, imgHtml);
            });
        }

        // 기본 이모티콘 처리
        if (this.defaultEmoticon?.data) {
            // default 그룹 처리
            if (this.defaultEmoticon.data.default?.groups) {
                const defaultGroups = this.defaultEmoticon.data.default.groups;
                const defaultUrl = this.defaultEmoticon.data.default.small_url || this.defaultEmoticon.data.default.big_url;
                
                defaultGroups.forEach(group => {
                    if (group.emoticons) {
                        group.emoticons.forEach(emoticon => {
                            if (!emoticon.isDeprecated && emoticon.keyword && emoticon.fileName) {
                                const imgUrl = defaultUrl + emoticon.fileName;
                                const imgHtml = `<img class="emoticon" src="${imgUrl}">`;
                                this.emoticonReplaceMap.set(emoticon.keyword, imgHtml);
                            }
                        });
                    }
                });
            }

            // subscribe 그룹 처리
            if (this.defaultEmoticon.data.subscribe?.groups) {
                const subscribeGroups = this.defaultEmoticon.data.subscribe.groups;
                const subscribeUrl = this.defaultEmoticon.data.subscribe.small_url || this.defaultEmoticon.data.subscribe.big_url;
                
                subscribeGroups.forEach(group => {
                    if (group.emoticons) {
                        group.emoticons.forEach(emoticon => {
                            if (!emoticon.isDeprecated && emoticon.keyword && emoticon.fileName) {
                                // staticFileName이 있으면 사용, 없으면 fileName 사용
                                const imgFileName = emoticon.staticFileName || emoticon.fileName;
                                const imgUrl = subscribeUrl + imgFileName;
                                const imgHtml = `<img class="emoticon" src="${imgUrl}">`;
                                this.emoticonReplaceMap.set(emoticon.keyword, imgHtml);
                            }
                        });
                    }
                });
            }
        }
    }

    // 이모티콘만으로 이루어진 메시지 여부 (복원 제외 대상 판별용)
    isEmoticonOnlyMessage(chatData) {
        const { msg, isOgq } = chatData;
        // OGQ만 있고 텍스트가 없으면 이모티콘만
        if (isOgq && (!msg || !String(msg).trim())) {
            return true;
        }
        const text = (msg || '').trim();
        if (!text) return false;
        let rest = text;
        this.emoticonReplaceMap.forEach((_, pattern) => {
            rest = rest.split(pattern).join('');
        });
        return rest.trim() === '';
    }

    // 메시지 텍스트에서 시그니처 이모티콘 처리
    processSignatureEmoticons(pElement, msgText) {
        if (this.emoticonReplaceMap.size === 0) {
            pElement.innerText = msgText;
            return;
        }

        let processedText = msgText;
        
        // 매핑 데이터를 사용하여 모든 이모티콘 교체
        this.emoticonReplaceMap.forEach((imgHtml, emoticonPattern) => {
            processedText = processedText.replaceAll(emoticonPattern, imgHtml);
        });

        // HTML로 설정
        pElement.innerHTML = processedText;
    }

    // VOD ID 가져오기
    getVideoId() {
        const match = window.location.pathname.match(/\/player\/(\d+)/);
        return match ? match[1] : null;
    }

    // 구독 개월수에 맞는 퍼스나콘 이미지 URL 가져오기
    getPersonalconUrl(subscriptionMonths, subscriptionTier = 1) {
        if (!this.vodInfo?.data?.subscription_personalcon) {
            return null;
        }

        const monthsNum = parseInt(subscriptionMonths || '0', 10);
        if (isNaN(monthsNum) || monthsNum < 0) return null;

        const tier = subscriptionTier === 2 
            ? this.vodInfo.data.subscription_personalcon.tier2 
            : this.vodInfo.data.subscription_personalcon.tier1;
        
        if (!tier || tier.length === 0) return null;

        // monthsNum 이하인 것 중 가장 큰 값
        let bestMatch = null;
        for (const item of tier) {
            if (item.month <= monthsNum) {
                if (!bestMatch || item.month > bestMatch.month) {
                    bestMatch = item;
                }
            }
        }

        return bestMatch?.file_name || tier[0]?.file_name || null;
    }

    // p 태그 값에 따른 배지 타입 결정
    getBadgeType(pValue) {
        const pNum = parseInt(pValue || '0', 10);
        
        if ((pNum & 0x40) !== 0) return 'manager';
        if ((pNum & 0x8000) !== 0) return 'vip';
        if ((pNum & 0x20) !== 0) return 'subscribe';
        if ((pNum & 0x100000) !== 0) return 'support';
        return null;
    }

    // grade 속성 값 계산 (3: 팬클럽 이상, 6: 구독자, 5: 둘 다 아님)
    getGradeValue(pValue, subscriptionMonths) {
        const pNum = parseInt(pValue || '0', 10);
        const monthsNum = parseInt(subscriptionMonths || '-1', 10);
        
        const isFanClubOrVip = (pNum & 0x20) !== 0;
        const isSubscriber = monthsNum !== -1;
        
        if (isSubscriber) return 6;
        if (isFanClubOrVip) return 3;
        return 5;
    }

    // 설정 팝업 표시
    showSettingsPopup() {
        // 기존 팝업이 있으면 제거
        if (this.settingsPopup && this.settingsPopup.parentElement) {
            this.settingsPopup.remove();
        }

        if (!this.settingsButton) return;

        const maxDuration = this.vodInfo?.data?.chat_duration;

        // 설정 버튼의 위치 정보 가져오기
        const buttonRect = this.settingsButton.getBoundingClientRect();
        const popupWidth = 300; // min-width와 동일

        const popup = document.createElement('div');
        popup.style.cssText = `
            position: fixed;
            top: ${buttonRect.bottom}px;
            right: ${window.innerWidth - buttonRect.right}px;
            background: white;
            border: 2px solid #4CAF50;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            z-index: 10000;
            min-width: ${popupWidth}px;
        `;

        const title = document.createElement('div');
        title.innerText = '복원 구간 설정';
        title.style.cssText = 'font-size: 18px; font-weight: bold; margin-bottom: 15px;';

        const label = document.createElement('div');
        label.innerText = `복원 구간: ${this.restoreInterval}초`;
        label.id = 'vodsync-interval-label';
        label.style.cssText = 'margin-bottom: 10px; font-size: 14px;';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '10';
        slider.max = String(maxDuration || 300);
        slider.step = '10';
        slider.value = String(this.restoreInterval);
        slider.style.cssText = 'width: 100%; margin-bottom: 15px;';

        slider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value, 10);
            label.innerText = `복원 구간: ${value}초`;
        });

        const excludeEmoticonOnlyLabel = document.createElement('label');
        excludeEmoticonOnlyLabel.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 15px; font-size: 14px; cursor: pointer;';
        const excludeEmoticonOnlyCheck = document.createElement('input');
        excludeEmoticonOnlyCheck.type = 'checkbox';
        excludeEmoticonOnlyCheck.checked = this.excludeEmoticonOnlyChat;
        excludeEmoticonOnlyLabel.appendChild(excludeEmoticonOnlyCheck);
        excludeEmoticonOnlyLabel.appendChild(document.createTextNode('이모티콘만으로 이루어진 채팅 복원 제외'));

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end;';

        const cancelBtn = document.createElement('button');
        cancelBtn.innerText = '취소';
        cancelBtn.style.cssText = `
            padding: 8px 16px;
            background-color: #ccc;
            color: black;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        `;
        cancelBtn.addEventListener('click', () => {
            popup.remove();
        });

        const saveBtn = document.createElement('button');
        saveBtn.innerText = '저장';
        saveBtn.style.cssText = `
            padding: 8px 16px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
        `;
        saveBtn.addEventListener('click', async () => {
            const newInterval = parseInt(slider.value, 10);
            this.restoreInterval = newInterval;
            this.excludeEmoticonOnlyChat = excludeEmoticonOnlyCheck.checked;
            this.log(`복원 구간 단위 변경: ${newInterval}초, 이모티콘만 제외: ${this.excludeEmoticonOnlyChat}`);

            // 설정 저장
            await this.saveRestoreInterval();
            
            // 현재 restoreTimeRange가 있으면 새로운 interval로 재계산
            if (this.nextRestorePlan) {
                const { endTime } = this.nextRestorePlan;
                this.nextRestorePlan = {
                    startTime: Math.max(0, endTime - this.restoreInterval),
                    endTime: endTime
                };
            }
            
            popup.remove();
        });

        buttonContainer.appendChild(cancelBtn);
        buttonContainer.appendChild(saveBtn);

        popup.appendChild(title);
        popup.appendChild(label);
        popup.appendChild(slider);
        popup.appendChild(excludeEmoticonOnlyLabel);
        popup.appendChild(buttonContainer);

        document.body.appendChild(popup);
        this.settingsPopup = popup;
    }
}

        new SoopAPI();
        const tsManager = new SoopTimestampManager();
        new SoopVODLinker();
        if (/\/player\/\d+/.test(window.location.pathname)) {
            const timelineProcessor = new SoopTimelineCommentProcessor();
            timelineProcessor.startWatching();
        }
        new SoopPrevChatViewer();
        
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

        // timeline_sync=1 이면 localStorage에서 페이로드 로드 후 URL에서 제거
        const timelineSyncVal = params.get('timeline_sync');
        if (timelineSyncVal) {
            let payload = null;
            try {
                const storageKey = 'vodSync_timeline';
                const raw = localStorage.getItem(storageKey);
                if (raw) {
                    payload = JSON.parse(raw);
                    localStorage.removeItem(storageKey);
                }
            } catch (_) { /* ignore */ }
            if (Array.isArray(payload)) {
                window.VODSync.timelineCommentProcessor?.receiveTimelineSyncPayload?.(payload);
            }
            const url = new URL(window.location.href);
            url.searchParams.delete('timeline_sync');
            window.history.replaceState({}, '', url.toString());
        }
    }
})(); 