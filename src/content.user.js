// ==UserScript==
// @name         VOD Master (SOOP)
// @namespace    http://tampermonkey.net/
// @version      1.6.0.0
// @description  SOOP 다시보기 타임스탬프 표시 및 다른 스트리머의 다시보기와 동기화
// @author       AINukeHere
// @match        https://vod.sooplive.com/*
// @match        https://www.sooplive.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
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
    const GITHUB_RAW_URL = "https://raw.githubusercontent.com/AINukeHere/VOD-Master/main";

    // 메인 페이지에서 실행되는 경우 (vod.sooplive.com)
    if (window.location.hostname === 'vod.sooplive.com') {
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

const DEFAULT_SOOP_URLS = {
    VOD_ORIGIN: 'https://vod.sooplive.com',
    WWW_ORIGIN: 'https://www.sooplive.com',
    STBBS_ORIGIN: 'https://stbbs.sooplive.com',
    AFEVENT2_ORIGIN: 'https://afevent2.sooplive.com',
    LIVE_ORIGIN: 'https://live.sooplive.com',
    API_M_ORIGIN: 'https://api.m.sooplive.com',
    API_CHANNEL_ORIGIN: 'https://api-channel.sooplive.co.kr',
    SCH_ORIGIN: 'https://sch.sooplive.com',
    CHAPI_ORIGIN: 'https://chapi.sooplive.com',
    ST_ORIGIN: 'https://st.sooplive.com',
    RES_ORIGIN: 'https://res.sooplive.com',
    OGQ_STICKER_CDN_ORIGIN: 'https://ogq-sticker-global-cdn-z01.sooplive.com',
    OGQ_MARKET_ORIGIN: 'https://ogqmarket.sooplive.com',
};

class SoopAPI extends IVodSync{
    constructor(){
        super();
        this.SoopUrls = { ...DEFAULT_SOOP_URLS, ...(window.VODSync?.SoopUrls || {}) };
        /** @type {Map<string, { data: any, expiresAt: number }>} */
        this._requestCache = new Map();
        window.VODSync = window.VODSync || {};
        window.VODSync.SoopUrls = this.SoopUrls;
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
     * 로그인 사용자 정보 조회(탬퍼몽키 환경에서 loginId 획득용).
     * @returns {Promise<object|null>}
     */
    async GetPrivateInfo() {
        const url = `${this.SoopUrls.AFEVENT2_ORIGIN}/api/get_private_info.php?_=${Date.now()}`;
        const cacheKey = 'GetPrivateInfo';
        const cached = this._getCached(cacheKey);
        if (cached !== null) return cached;
        const res = await fetch(url, {
            headers: {
                accept: 'application/json, text/plain, */*',
            },
            method: 'GET',
            mode: 'cors',
            credentials: 'include',
        });
        if (res.status !== 200) return null;
        const b = await res.json();
        this._setCache(cacheKey, b);
        return b;
    }

    /**
     * 채널 게시판 메뉴 조회.
     * @param {string} loginId
     * @returns {Promise<object|null>}
     */
    async GetStationMenu(loginId) {
        if (!loginId) return null;
        const lid = String(loginId);
        const cacheKey = `GetStationMenu:${lid}`;
        const cached = this._getCached(cacheKey);
        if (cached !== null) return cached;
        const url = `${this.SoopUrls.API_CHANNEL_ORIGIN}/v1.1/channel/${encodeURIComponent(lid)}/menu`;
        const res = await fetch(url, {
            headers: {
                accept: 'application/json, text/plain, */*',
            },
            method: 'GET',
            mode: 'cors',
            credentials: 'include',
        });
        if (res.status !== 200) return null;
        const b = await res.json();
        this._setCache(cacheKey, b);
        return b;
    }

    _parseVodEditorCategoryScript(scriptText) {
        if (typeof scriptText !== 'string' || scriptText.length === 0) return null;
        const m = scriptText.match(/var\s+szVodCategory\s*=\s*(\{[\s\S]*\});?/);
        if (!m?.[1]) return null;
        try {
            return JSON.parse(m[1]);
        } catch (_e) {
            return null;
        }
    }

    /**
     * VOD 게시 카테고리 트리 조회(`vod_editor_category.js` 파싱).
     * @returns {Promise<object|null>}
     */
    async GetVodEditorCategory() {
        const cacheKey = 'GetVodEditorCategory:ko_KR';
        const cached = this._getCached(cacheKey);
        if (cached !== null) return cached;
        const res = await fetch(`${this.SoopUrls.LIVE_ORIGIN}/script/locale/ko_KR/vod_editor_category.js`, {
            headers: {
                accept: '*/*',
            },
            method: 'GET',
            mode: 'cors',
            credentials: 'include',
        });
        if (res.status !== 200) return null;
        const txt = await res.text();
        const parsed = this._parseVodEditorCategoryScript(txt);
        if (!parsed) return null;
        this._setCache(cacheKey, parsed);
        return parsed;
    }

    /**
     * @description Get Soop VOD Period
     * @param {number | string} videoId
     * @param {{ referer?: string }} [opts] — `referer` 생략 시 `https://vod.sooplive.com/player/{videoId}`
     * @returns {Promise<object|null>}
     */
    async GetSoopVodInfo(videoId, opts = {}) {
        const referer =
            typeof opts.referer === 'string' && opts.referer.length > 0
                ? opts.referer
                : `${this.SoopUrls.VOD_ORIGIN}/player/${videoId}`;
        const cacheKey = `GetSoopVodInfo:${videoId}`;
        const cached = this._getCached(cacheKey);
        if (cached !== null) return cached;

        const a = await fetch(`${this.SoopUrls.API_M_ORIGIN}/station/video/a/view`, {
            "headers": {
                "accept": "application/json, text/plain, */*",
                "content-type": "application/x-www-form-urlencoded",
                "Referer": referer
            },
            "body": `nTitleNo=${videoId}&nApiLevel=11&nPlaylistIdx=0`,
            "method": "POST",
            "credentials": "include"
        });
        if (a.status !== 200){
            return null;
        }
        const b = await a.json();
        this._setCache(cacheKey, b);
        return b;
    }

    /**
     * stbbs `vodInfo.php?mode=web` VOD 메타 (다중 파일·총 길이 등). 타임라인 UI용.
     * @param {number | string} titleNo — 플레이어 `/player/{titleNo}` 과 동일
     * @param {{ referer?: string }} [opts] — 생략 시 `https://vod.sooplive.com/player/{titleNo}` (공식 veditor Referer가 필요하면 명시)
     * @returns {Promise<{ result: number, message?: string, response?: object }|null>}
     */
    async GetSoopVeditorWebVodInfo(titleNo, opts = {}) {
        const tn = String(titleNo);
        const referer =
            typeof opts.referer === 'string' && opts.referer.length > 0
                ? opts.referer
                : `${this.SoopUrls.VOD_ORIGIN}/player/${tn}`;
        const cacheKey = `GetSoopVeditorWebVodInfo:${tn}`;
        const cached = this._getCached(cacheKey);
        if (cached !== null) return cached;

        const url = new URL(`${this.SoopUrls.STBBS_ORIGIN}/vodeditor/api/vodInfo.php`);
        url.searchParams.set('titleNo', tn);
        url.searchParams.set('mode', 'web');

        const res = await fetch(url.toString(), {
            headers: {
                accept: 'application/json, text/plain, */*',
                Referer: referer,
            },
            method: 'GET',
            credentials: 'include',
            mode: 'cors',
        });
        if (res.status !== 200) {
            return null;
        }
        const b = await res.json();
        this._setCache(cacheKey, b);
        return b;
    }

    async GetStreamerID(nickname){
        const encodedNickname = encodeURI(nickname);
        const url = new URL(`${this.SoopUrls.SCH_ORIGIN}/api.php`);
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
        const url = new URL(`${this.SoopUrls.CHAPI_ORIGIN}/api/${streamerId}/vods/review`);
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
        const cacheKey = `GetEmoticon:${this.SoopUrls.ST_ORIGIN}/api/emoticons.php`;
        const cached = this._getCached(cacheKey);
        if (cached !== null) return cached;

        const res = await fetch(`${this.SoopUrls.ST_ORIGIN}/api/emoticons.php`);
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

        const res = await fetch(`${this.SoopUrls.LIVE_ORIGIN}/api/signature_emoticon_api.php`, {
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

    /**
     * 다시보기 편집 VOD 생성 (setWebEditorJob).
     * @param {object} [opts]
     * @param {string} [opts.titleNo]
     * @param {string} [opts.broadNo]
     * @param {string} [opts.bbsNo]
     * @param {string} [opts.category]
     * @param {string} [opts.vodCategory]
     * @param {string} [opts.title]
     * @param {string} [opts.contents]
     * @param {string} [opts.hotissue]
     * @param {string} [opts.strmLangType]
     * @param {string|number} [opts.editType]
     * @param {Array} [opts.editJobInfo] edit_job_info 배열
     * @param {string} [opts.referer] HTTP Referer (생략 시 VOD 플레이어 페이지)
     * @returns {Promise<object|null>}
     */
    async SetWebEditorJob(opts = {}) {
        const {
            titleNo,
            broadNo,
            bbsNo,
            referer: refererOpt,
            category = '00210000',
            vodCategory = '00820000',
            title = '',
            contents = '',
            hotissue = 'N',
            strmLangType = 'ko_KR',
            editType = '1',
            editJobInfo = [],
        } = opts;
        const referer =
            typeof refererOpt === 'string' && refererOpt.length > 0
                ? refererOpt
                : `${this.SoopUrls.VOD_ORIGIN}/player/${String(titleNo)}`;
        if (!titleNo || !broadNo || !bbsNo) {
            this.error('SetWebEditorJob: titleNo, broadNo, bbsNo 필수');
            return null;
        }

        const form = new FormData();
        form.append('edit_job_info', JSON.stringify(editJobInfo));
        form.append('edit_type', String(editType));
        form.append('title_no', String(titleNo));
        form.append('broad_no', String(broadNo));
        form.append('bbsNo', String(bbsNo));
        form.append('category', category);
        form.append('vod_category', vodCategory);
        form.append('title', title);
        form.append('contents', contents);
        form.append('hotissue', hotissue);
        form.append('strmLangType', strmLangType);

        const debugFormEntries = [];
        for (const [k, v] of form.entries()) {
            debugFormEntries.push([k, typeof v === 'string' ? v : '[binary]']);
        }
        const debugPayload = {
            url: `${this.SoopUrls.STBBS_ORIGIN}/vodeditor/api/setWebEditorJob.php`,
            method: 'POST',
            credentials: 'include',
            headers: {
                Accept: 'application/json, text/plain, */*',
                Referer: referer,
            },
            formData: debugFormEntries,
        };
        console.debug('[VODSync][SetWebEditorJob] request preview', debugPayload);
        if (false) {
            this.warn('SetWebEditorJob: debug-only 모드로 실제 전송하지 않았습니다.');
            return {
                debugOnly: true,
                ...debugPayload,
            };
        }

        const res = await fetch(`${this.SoopUrls.STBBS_ORIGIN}/vodeditor/api/setWebEditorJob.php`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                Accept: 'application/json, text/plain, */*',
                Referer: referer,
            },
            body: form,
        });
        if (res.status !== 200) {
            this.error('SetWebEditorJob HTTP', res.status);
            return null;
        }
        return res.json();
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
        if (!this.tooltipContainer) {
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
                iconImage.src = "https://raw.githubusercontent.com/AINukeHere/VOD-Master/main/res/img/broadcastSync.png";
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
        if (!this.tooltipContainer){
            this.log('timestamp 컨테이너가 없어 재생성합니다');
            this.createTooltip();
        }
        this.updateTooltip();
        this.checkMouseState();
        if (this.tooltipContainer.parentElement === document.body || !this.tooltipContainer.isConnected){
            this.log('timestamp 컨테이너가 분리되어 재배치합니다');
            if (this.moveTooltipToCtrlBox())
                this.log('timestamp 컨테이너 재배치 성공');
            else
                this.log('timestamp 컨테이너 재배치 실패');
        }
        
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
            this.channel = new BroadcastChannel('vod-master');
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
                console.warn('[VOD Master] 전역 동기화 요청 실패. 확장프로그램이 리로드되었거나 비활성화된 것 같습니다. 페이지를 새로고침하십시오.', error);
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
        throw new Error("playbackTimeToGlobalTS must be implemented by subclass");
    }
    // 현재 재생 중인지 여부를 반환하는 추상 메서드
    isPlaying() {
        throw new Error("isPlaying must be implemented by subclass");
    }
    /**
     * 전역 타임스탬프(ms) → 재생 시각(초) 변환이 가능한지 여부.
     * 타임라인 동기화 미리보기 등에서 변환 준비가 됐을 때만 사용. 서브클래스에서 오버라이드.
     * @returns {boolean}
     */
    canConvertGlobalTSToPlaybackTime() {
        throw new Error("canConvertGlobalTSToPlaybackTime must be implemented by subclass");
    }
    /**
     * @description 영상 시간을 설정
     * @param {number} playbackTime 
     * @param {boolean} doAlert 
     */
    moveToPlaybackTime(playbackTime, doAlert = true) {
        throw new Error("moveToPlaybackTime must be implemented by subclass");
    }
    moveTooltipToCtrlBox(){
        throw new Error("moveTooltipToCtrlBox must be implemented by subclass");
    }
}
        // 탬퍼몽키: vodCore 페이지 브리지 없음. SoopTimestampManager._getVodCoreGhost() 가 IS_TAMPER_MONKEY_SCRIPT 일 때 ghost 를 쓰지 않음.
        const MAX_DURATION_DIFF = 30*1000;
        class SoopTimestampManager extends TimestampManagerBase {
    constructor() {
        super();
        this.vodInfo = null;
        this.playTimeTag = null;
        this.isEditedVod = false; // 다시보기의 일부분이 편집된 상태인가
        
        this.timeLink = null;
        /** @type {ReturnType<typeof setInterval>|null} ghost 없을 때 time_link 폴백용 */
        this._timeLinkJumpIntervalId = null;
        this.debug('loaded');

        this.reloadingAll = false; // 현재 VOD 정보와 태그를 업데이트 중인가
        this.loop_playing = false;
    }

    /**
     * vodCore 페이지 브리지 ghost (`#__vs_vodcore_ghost`). 브리지 미주입 시 null.
     * @returns {HTMLElement|null}
     */
    _getVodCoreGhost() {
        return window.VODSync?.vodCoreBridge?.getGhost?.() ?? null;
    }

    update(){
        super.update();
        this.simpleLoopSettingUpdate();

        // VOD 변경 감지
        const url = new URL(window.location.href);
        const match = url.pathname.match(/\/player\/(\d+)/);
        const curVideoId = match[1];
        if (this.vodInfo === null || curVideoId !== this.vodInfo.id){
            this.log('VOD 변경 감지됨! 요소 업데이트 중...');
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
            return true;
        }
        return false;
    }

    simpleLoopSettingUpdate(){
        const LABEL_TEXT = '반복 재생';
        const EM_TEXT_IDLE = '(added by VOD Master)';

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
        this.vodInfo = {
            id: videoId,
            type: vodInfo.data.file_type,
            files: vodInfo.data.files,
            total_file_duration: vodInfo.data.total_file_duration,
            originVodInfo: null, // 원본 다시보기의 정보
        }
        if (vodInfo.data.write_tm){
            const splitres = vodInfo.data.write_tm.split(' ~ ');
            this.vodInfo.startDate = new Date(splitres[0]);
            this.vodInfo.endDate = splitres[1] ? new Date(splitres[1]) : null;
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
                                this.warn(`${this.videoId}를 제보해주시기 바랍니다.\n[VOD Master 설정] > [문의하기]`);
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
        else if (this.vodInfo.type === 'EDITOR'){
            this.vodInfo.startDate = null;
            this.vodInfo.endDate = null;
            this.log('편집된 VOD입니다.');
            return;
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
        try {
            const time = this.vodInfo == null ? 0 : 1000;
            await new Promise(r => setTimeout(r, time));
            await this.loadVodInfo(videoId);
            this.reloadVideoTag();
            this.moveTooltipToCtrlBox();
        } finally {
            this.reloadingAll = false;
        }
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
            this.warn(`${this.videoId}를 제보해주시기 바랍니다.\n[VOD Master 설정] > [문의하기]`);
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
            this.warn(`${this.videoId}를 제보해주시기 바랍니다.\n[VOD Master 설정] > [문의하기]`);
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
        if (this.vodInfo == null) return null;
        const totalPlaybackSec = this.getCurPlaybackTime();
        if (totalPlaybackSec === null) return null;

        if (this.vodInfo.type === 'NORMAL')
            return '업로드 VOD는 지원하지 않습니다.';
        else if (this.vodInfo.type === "EDITOR")
            return '편집된 VOD는 지원하지 않습니다.';
        if (this.vodInfo.startDate === null && 
            this.vodInfo.endDate === null && 
            this.vodInfo.originVodInfo === null) {
                return '원본 다시보기와 연결되어 있지 않은 VOD입니다.';
        }

        const globalTS = this.playbackTimeToGlobalTS(totalPlaybackSec);
        return globalTS;
    }
    /**
     * @description 현재 재생 시간을 초 단위로 반환 (전역 타임라인). vodCore → `#__vs_vodcore_ghost` `playingTime` 우선.
     * @returns {number} 현재 재생 시간(초)
     * @returns {null} 재생 시간을 계산할 수 없음. 의도치않은 상황 발생
     */
    getCurPlaybackTime(){
        const ghost = this._getVodCoreGhost();
        if (ghost && ghost.dataset.playingTime !== '') {
            const pt = parseFloat(ghost.dataset.playingTime);
            if (Number.isFinite(pt)) return Math.max(0, pt);
        }
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
            this.warn(`${this.videoId}를 제보해주시기 바랍니다.\n[VOD Master 설정] > [문의하기]`);
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
        if (this._timeLinkJumpIntervalId != null) {
            clearInterval(this._timeLinkJumpIntervalId);
            this._timeLinkJumpIntervalId = null;
        }

        const url = new URL(window.location.href);
        const secNum = Math.max(0, Number(playbackTime));
        const changeSec = Number.isFinite(secNum) ? Math.floor(secNum * 100) / 100 : 0;
        url.searchParams.set('change_second', String(changeSec));
        window.history.replaceState({}, '', url.toString());

        // vodCore bridge에 seek요청
        const ghost = this._getVodCoreGhost();
        if (ghost) {
            const sec = Math.max(0, Number(playbackTime));
            ghost.setAttribute('data-vs-seek', String(Number.isFinite(sec) ? sec : 0));
            this.debug('vodCore seek via ghost', sec);
            return true;
        }

        /// soop 댓글 타임라인 기능 (ghost·vodCore 없을 때 폴백)
        const targetSec = playbackTime;
        this._timeLinkJumpIntervalId = setInterval(() => {
            if (Math.abs(this.getCurPlaybackTime() - targetSec) <= 1) {
                if (this._timeLinkJumpIntervalId != null) {
                    clearInterval(this._timeLinkJumpIntervalId);
                    this._timeLinkJumpIntervalId = null;
                }
                return;
            }
            if (this.timeLink === null) {
                this.timeLink = document.createElement('a');
                document.body.appendChild(this.timeLink);
            }
            this.timeLink.className = 'time_link';
            this.timeLink.setAttribute('data-time', targetSec.toString());
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
    // 주기적으로 동기화 버튼 생성 및 업데이트
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
        // 타임라인 댓글 동기화 요청 처리
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
                const vodOrigin = window.VODSync?.SoopUrls?.VOD_ORIGIN || 'https://vod.sooplive.com';
                return{
                    vodLink: `${vodOrigin}/player/${vod.title_no}`,
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
    static CHECKBOX_WRAP_CLASS = 'vodSync-timeline-sync-wrap';
    /** 더보기 레이어(_moreDot_layer) 안에 넣는 편집 버튼 식별용 */
    static EDIT_IN_MORE_CLASS = 'vodSync-timeline-edit-in-more';
    static BTN_INSERT_CURRENT_TIME_CLASS = 'vodSync-timeline-insert-current-time';
    static BTN_INSERT_CURRENT_TIME_LABEL = '현재 시간 삽입';

    // ---- 문자열 리소스 (UI 노출용) ----
    static LABEL_SYNC_TOOLTIP = '다른 스트리머의 다시보기가 동기화될 때 이 타임라인 댓글이 동기화된 다시보기에 맞춰 변환됩니다';
    static LABEL_SYNC_CHECKBOX = '동기화할 때 이 타임라인을 변환';
    static BTN_EDIT_IN_MORE = '타임라인 편집';
    static BTN_EDIT_IN_MORE_TOOLTIP = '이 타임라인 댓글을 편집기에서 편집·복사합니다';
    static PANEL_HEADER = '타임라인 편집기';
    static BTN_COLLAPSE = '접기';
    static BTN_EXPAND = '펴기';
    static BTN_COPY = '전체 복사';
    static BTN_COPIED = '복사됨';
    static BTN_COPY_FAILED = '복사 실패';
    static BTN_CLOSE = '닫기';
    static TIME_PLACEHOLDER = '--:--';
    static BTN_TIME_MINUS = '-';
    static BTN_TIME_PLUS = '+';

    /**
     * 자식 클래스에서 설정할 selector 변수들.
     * - containerSelector: string — 컨테이너를 찾을 CSS 선택자
     * - containerCondition: () => boolean — 컨테이너 탐색 전 조건(예: pathname). 기본은 항상 true
     * - commentRowSelector: string — 컨테이너 안 댓글 한 줄(행) 요소 선택자
     * - commentTextSelector: string — 댓글 한 줄에서 텍스트를 꺼낼 하위 요소 선택자
     * - checkboxSlotSelector: string — 댓글 한 줄에서 체크박스를 넣을 슬롯 요소 선택자(없으면 해당 행 사용)
     * - commentInputSelector: string — 댓글 작성란 입력 요소 선택자(동기화된 타임라인 자동 기입 시 사용, 자식에서 설정)
     * - commentInputCurrentTimeButtonSlotSelector: string — 댓글 작성란 입력 요소 안에 현재 시간 삽입 버튼을 넣을 슬롯 요소 선택자
     * - commentInputTextareaSelector: string — 댓글 작성란 입력 요소 안에 텍스트 입력 요소 선택자
     */
    constructor() {
        super();
        this._started = false;
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
        const GITHUB_RAW_URL = "https://raw.githubusercontent.com/AINukeHere/VOD-Master/main";
        /** 현재 시간 삽입 버튼 스타일. backgroundImage는 런타임 URL 사용 */
        this.insertCurrentTimeButtonStyle = {
            backgroundImage: window.VODSync?.IS_TAMPER_MONKEY_SCRIPT !== true ? `url(${chrome.runtime.getURL('res/img/AddCurrentTime.png')})` : `${GITHUB_RAW_URL}/res/img/AddCurrentTime.png`,
            backgroundSize: '100% 100%',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            width: '32px',
            height: '32px',
            verticalAlign: 'middle',
            borderRadius: '8px'
        };
        this.insertCurrentTimeButtonHoverStyle = { backgroundColor: 'rgb(232,232,232)' };
        window.VODSync = window.VODSync || {};
        window.VODSync.timelineCommentProcessor = this;

        this.startWatching();
    }

    /**
     * 타임라인 댓글 감시 시작. 주기적으로 컨테이너를 찾고, 있으면 해당 컨테이너에서 댓글을 찾아 체크박스를 붙인다.
     * 수신 페이로드가 있으면 미리보기 목록 영역에 내용 채움.
     */
    startWatching() {
        if (this._started) return;
        this._started = true;
        setInterval(() => {
            // 댓글 컨테이너 찾기
            let container = this._cachedCommentContainer;
            if (!container || !container.isConnected) {
                container = this._getContainer();
                this._cachedCommentContainer = container;
            }

            // 타임라인 댓글에 동기화시 변환 버튼 추가하기
            this.scanAndAttachCheckboxes(container);
            // 타임라인 댓글의 더보기를 눌렀을 때 편집 버튼 추가하기
            this._injectEditButtonIntoMoreLayers(container);
            // 댓글 작성 입력창에 타임라인 입력 버튼 추가하기
            this._injectTinelineInsertButton(container);

            // 수신 페이로드가 있으면 미리보기 목록 영역에 내용 채움
            if (this._incomingTimelineSyncPayload)
                this.fillTimelinePreviewContent(this._incomingTimelineSyncPayload);
        }, 500);
    }

    // 댓글 컨테이너에서 댓글들을 찾아, 타임라인 댓글이면 변환 체크박스를 추가한다.
    scanAndAttachCheckboxes(container) {
        if (!container) return;
        const comments = this._getComments(container);
        for (const comment of comments) {
            if (comment.querySelector(`.${this.constructor.CHECKBOX_CLASS}`)) continue;
            const text = this._extractTextContent(comment);
            const sec = this.parsePlaybackSecondsFromText(text);
            if (sec == null) continue;
            this.appendSyncCheckboxToRow(comment);
        }
    }

    /** selector로 컨테이너 안 댓글 행 목록 반환 */
    _getComments(container) {
        if (!container) return [];
        const sel = this.commentRowSelector;
        if (!sel) return [];
        return Array.from(container.querySelectorAll(sel));
    }

    /** selector로 댓글 한 줄에서 표시용 텍스트 추출 */
    _extractTextContent(rowEl) {
        const sel = this.commentTextSelector;
        if (!sel) return rowEl?.textContent || '';
        const el = rowEl.querySelector(sel);
        return (el ? el.textContent : rowEl.textContent) || '';
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

    // 특정 댓글 한 줄 요소에 변환 체크박스를 추가. 체크/해제 시 _selectedCommentRows에 반영·배경색 시각화.
    // '타임라인 댓글 편집하기' 버튼은 댓글 더보기 레이어(_moreDot_layer) 안에 주기적으로 주입됨.
    appendSyncCheckboxToRow(rowEl) {
        const slot = this._getCheckboxInsertSlot(rowEl);
        if (!slot) return false;
        const toggleWrap = document.createElement('span');
        toggleWrap.className = this.constructor.CHECKBOX_WRAP_CLASS;
        this._applyStyle(toggleWrap, this.checkboxWrapStyle);
        const label = document.createElement('label');
        label.title = this.constructor.LABEL_SYNC_TOOLTIP;
        this._applyStyle(label, this.checkboxLabelStyle);
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = this.constructor.CHECKBOX_CLASS;
        this._applyStyle(cb, this.checkboxInputStyle);
        const updateWrapStyle = () => {
            this._applyStyle(toggleWrap, cb.checked ? this.checkboxWrapCheckedStyle : this.checkboxWrapUncheckedStyle);
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
        label.appendChild(document.createTextNode(this.constructor.LABEL_SYNC_CHECKBOX));
        toggleWrap.appendChild(label);

        const pos = window.getComputedStyle(slot).position;
        if (!pos || pos === 'static') slot.style.position = 'relative';
        slot.appendChild(toggleWrap);
        return true;
    }

    // 댓글 더보기 레이어(._moreDot_layer)가 보일 때, 타임라인 댓글인 경우에만 편집 버튼을 넣음. SOOP 전용 등은 `_injectClipImportButtonIntoMoreLayer` 오버라이드.
    _injectEditButtonIntoMoreLayers(container) {
        if (!container?.isConnected) return;
        const layers = container.querySelectorAll('._moreDot_layer');
        for (const layer of layers) {
            const rowEl = layer.closest(this.commentRowSelector);
            if (!rowEl || !rowEl.querySelector(`.${this.constructor.CHECKBOX_CLASS}`)) continue;
            const closeMore = () => {
                if (layer.parentNode?.parentNode?.childNodes[0]) layer.parentNode.parentNode.childNodes[0].click();
            };
            if (!layer.querySelector(`.${this.constructor.EDIT_IN_MORE_CLASS}`)) {
                const editBtn = document.createElement('button');
                editBtn.type = 'button';
                editBtn.className = this.constructor.EDIT_IN_MORE_CLASS;
                editBtn.textContent = this.constructor.BTN_EDIT_IN_MORE;
                editBtn.title = this.constructor.BTN_EDIT_IN_MORE_TOOLTIP;
                editBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.openPreviewWithCurrentPageTimelineComments(rowEl);
                    closeMore();
                });
                layer.appendChild(editBtn);
            }
            this._injectClipImportButtonIntoMoreLayer(layer, rowEl, closeMore);
        }
    }

    /** 플랫폼별: 더보기 레이어에 편집 구간 가져오기 등 추가 버튼 (기본 없음). */
    _injectClipImportButtonIntoMoreLayer(layer, rowEl, closeMore) {}

    /** selector로 체크박스를 넣을 슬롯 반환 (없으면 rowEl) */
    _getCheckboxInsertSlot(rowEl) {
        const sel = this.checkboxSlotSelector;
        if (!sel) return rowEl;
        return rowEl.querySelector(sel) || rowEl;
    }

    /** VOD linker가 호출. 변환 체크된 댓글 요소들을 모아 가공한 페이로드 반환. (storage/동기화와 동일한 형식: (string|number)[]) */
    getTimelineSyncPayload() {
        // _selectedCommentRows에서 연결된(실제 DOM에 남아있는) row만 추림
        this._selectedCommentRows = this._selectedCommentRows.filter(row => row.isConnected);
        return this._buildPayloadFromComments(this._selectedCommentRows);
    }

    /**
     * 댓글 행 목록으로부터 storage/동기화와 동일한 페이로드 형식 생성.
     * 미리보기(편집하기)와 변환 결과 모두 이 형식으로 fillTimelinePreviewContent에 넘긴다.
     * @param {HTMLElement[]} rowEls 체크박스가 붙은 댓글 행 요소 배열
     * @returns {(string|number)[]}
     */
    _buildPayloadFromComments(rowEls) {
        if (!Array.isArray(rowEls)) return [];
        const segs = this.buildSegmentsFromComments(rowEls);
        if (!Array.isArray(segs)) return [];
        return segs;
    }

    /**
     * 한 개 이상의 댓글에서 미리보기용 세그먼트 생성. 파생 클래스에서 오버라이드.
     * @param {HTMLElement[]} commentEls 댓글 요소 배열
     * @returns {(string|number)[]}
     */
    buildSegmentsFromComments(commentEls) {
        throw this.error('buildSegmentsFromComments is not implemented');
    }

    /**
     * 미리보기 창을 열고 행 데이터로 채움. 변환 결과·현재 페이지 수집 모두 이 진입점 사용.
     * @param {Array<Array<{type:'string',value:string}|{type:'timeline',playbackSec:number|null}>>} rows
     */
    openTimelinePreview(rows) {
        if (!Array.isArray(rows) || rows.length === 0) return;
        if (!this._timelinePreviewWrap?.isConnected) {
            this._createTimelinePreviewSkeleton();
        }
        this._incomingTimelineSyncPayload = null;
        this._timelinePreviewRows = rows;
        this._renderPreviewRows(rows);
    }

    /**
     * 타임라인 편집하기 버튼이 클릭되면 이 함수가 호출됨.
     * 해당 댓글 내용을 미리보기에 채우고 미리보기 창을 엽니다.
     * @param {HTMLElement} commentEl 편집하기 버튼이 속한 댓글 요소
     */
    openPreviewWithCurrentPageTimelineComments(commentEl) {
        if (!commentEl?.isConnected) return;
        const payload = this._buildPayloadFromComments([commentEl]);
        if (payload.length === 0) return;
        this.fillTimelinePreviewContent(payload);
    }

    /**
     * 타임라인 동기화 페이로드를 전달받음. 뼈대가 없으면 미리보기 창 뼈대만 생성하고, 내용 채움은 인터벌에서 주기적으로 시도.
     * @param {(string|number)[]} payload
     */
    receiveTimelineSyncPayload(payload) {
        if (!Array.isArray(payload) || payload.length === 0) return;
        this._incomingTimelineSyncPayload = payload;
        if (!this._timelinePreviewWrap?.isConnected) {
            this._createTimelinePreviewSkeleton();
        }
    }
    
    // 미리보기 창 뼈대만 생성 (헤더·빈 목록 영역·푸터). 내용은 fillTimelinePreviewContent()에서 채움.
    _createTimelinePreviewSkeleton() {
        const wrap = document.createElement('div');
        wrap.className = 'vodSync-timeline-preview-wrap';
        wrap.style.cssText = 'position:fixed;right:16px;bottom:16px;width:420px;max-width:90vw;max-height:80vh;z-index:99999;display:flex;flex-direction:column;box-shadow:0 4px 20px rgba(0,0,0,0.2);border-radius:8px;overflow:hidden;background:#fff;';
        const panel = document.createElement('div');
        panel.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;';

        const header = document.createElement('div');
        header.style.cssText = 'padding:10px 12px;border-bottom:1px solid #eee;font-weight:bold;font-size:14px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px;';
        header.textContent = this.constructor.PANEL_HEADER;
        const collapseBtn = document.createElement('button');
        collapseBtn.type = 'button';
        collapseBtn.textContent = this.constructor.BTN_COLLAPSE;
        collapseBtn.style.cssText = 'padding:4px 10px;font-size:12px;cursor:pointer;';
        const bodyArea = document.createElement('div');
        bodyArea.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;';
        const listWrap = document.createElement('div');
        listWrap.style.cssText = 'overflow:auto;flex:1;min-height:120px;padding:8px;';
        const footer = document.createElement('div');
        footer.style.cssText = 'padding:10px 12px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;';

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.textContent = this.constructor.BTN_COPY;
        copyBtn.style.cssText = 'padding:6px 12px;cursor:pointer;background:#1a73e8;color:#fff;border:none;border-radius:4px;font-size:12px;';
        copyBtn.addEventListener('click', () => {
            const rows = this._timelinePreviewRows;
            if (!rows || rows.length === 0) return;
            const text = rows.map(rowFrags =>
                rowFrags.map(f => f.type === 'string' ? f.value : (f.playbackSec != null ? this.formatPlaybackTimeAsComment(f.playbackSec).trim() : this.constructor.TIME_PLACEHOLDER + ' ')).join('')
            ).join('\n');
            if (text) navigator.clipboard.writeText(text).then(() => { copyBtn.textContent = this.constructor.BTN_COPIED; setTimeout(() => { copyBtn.textContent = this.constructor.BTN_COPY; }, 1500); }).catch(() => { copyBtn.textContent = this.constructor.BTN_COPY_FAILED; });
        });
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = this.constructor.BTN_CLOSE;
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
            collapseBtn.textContent = collapsed ? this.constructor.BTN_COLLAPSE : this.constructor.BTN_EXPAND;
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

    // 수신한 페이로드로부터 변환된 타임라인 댓글 미리보기 목록 영역에 내용 채움. 내부에서 openTimelinePreview(rows) 호출.
    fillTimelinePreviewContent(payload) {
        if (!Array.isArray(payload) || payload.length === 0) return;
        const tsManager = window.VODSync?.tsManager;
        if (!tsManager?.canConvertGlobalTSToPlaybackTime()) return;
        const globalTSToPlaybackTime = tsManager.globalTSToPlaybackTime;
        if (!globalTSToPlaybackTime) return;

        // 페이로드 → 순서 유지 fragments (string | timeline), \n 기준으로 행 분리
        const fragments = [];
        for (const item of payload) {
            const asGlobalMs = typeof item === 'number' && !isNaN(item)
                ? item
                : (typeof item === 'string' && /^\d{10,15}$/.test(String(item).trim())
                    ? parseInt(item, 10)
                    : NaN);
            if (!isNaN(asGlobalMs)) {
                const sec = globalTSToPlaybackTime.call(tsManager, asGlobalMs);
                if (sec != null) {
                    fragments.push({ type: 'timeline', playbackSec: Math.max(0, Math.floor(sec)) });
                } else {
                    fragments.push({ type: 'timeline', playbackSec: null });
                }
            } else if (typeof item === 'string') {
                fragments.push({ type: 'string', value: item });
            }
        }

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

        this.openTimelinePreview(rows);
    }

    /** 미리보기 목록 영역에 행 데이터를 DOM으로 채움. openTimelinePreview → fillTimelinePreviewContent / openPreviewWithCurrentPageTimelineComments 에서 사용. */
    _renderPreviewRows(rows) {
        if (!this._timelinePreviewListWrap?.isConnected || !Array.isArray(rows) || rows.length === 0) return;
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
                        placeholder.textContent = this.constructor.TIME_PLACEHOLDER;
                        placeholder.style.cssText = 'font-family:monospace;color:#999;';
                        // TODO: 치지직에서도 간단하게 element 구성만으로 이동이 가능하다면 굳이 이걸 타임라인부분에 이벤트리스너를 추가할 필요가 없음.
                        // timeEl.addEventListener('click', (e) => { e.stopPropagation(); if (moveToPlaybackTime) moveToPlaybackTime(frag.playbackSec, false); });
                        row.appendChild(placeholder);
                    } else {
                        const timeEl = this.createTimelineDisplayElement(frag.playbackSec);
                        const timeBtnStyle = 'min-width:24px;padding:4px 8px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;color:#333;line-height:1;';
                        const btnMinus = document.createElement('button');
                        btnMinus.type = 'button';
                        btnMinus.textContent = this.constructor.BTN_TIME_MINUS;
                        btnMinus.style.cssText = timeBtnStyle;
                        btnMinus.title = '쉬프트를 누른 상태로 클릭하면 10초씩 감소';
                        const btnPlus = document.createElement('button');
                        btnPlus.type = 'button';
                        btnPlus.textContent = this.constructor.BTN_TIME_PLUS;
                        btnPlus.style.cssText = timeBtnStyle;
                        btnPlus.title = '쉬프트를 누른 상태로 클릭하면 10초씩 증가';
                        const setTimeBtnHover = (btn, hover) => {
                            btn.style.background = hover ? '#e0e0e0' : '#f5f5f5';
                            btn.style.borderColor = hover ? '#999' : '#ccc';
                        };
                        btnMinus.addEventListener('mouseenter', () => setTimeBtnHover(btnMinus, true));
                        btnMinus.addEventListener('mouseleave', () => setTimeBtnHover(btnMinus, false));
                        btnPlus.addEventListener('mouseenter', () => setTimeBtnHover(btnPlus, true));
                        btnPlus.addEventListener('mouseleave', () => setTimeBtnHover(btnPlus, false));
                        btnMinus.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const delta = e.shiftKey ? 10 : 1;
                            frag.playbackSec = Math.max(0, frag.playbackSec - delta);
                            if (timeEl._vodSyncUpdateTime) timeEl._vodSyncUpdateTime(frag.playbackSec);
                            else timeEl.textContent = this.getTimelineDisplayText(frag.playbackSec);
                        });
                        btnPlus.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const delta = e.shiftKey ? 10 : 1;
                            frag.playbackSec += delta;
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

    // 재생 시각(초)을 댓글용 시간 문자열로 포맷. 자식 클래스에서 오버라이드 가능.
    formatPlaybackTimeAsComment(playbackSec) {
        if (typeof playbackSec !== 'number' || playbackSec < 0 || !isFinite(playbackSec)) return '';
        const h = Math.floor(playbackSec / 3600);
        const m = Math.floor((playbackSec % 3600) / 60);
        const s = Math.floor(playbackSec % 60);
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} `;
        return `${m}:${String(s).padStart(2, '0')} `;
    }

    /**
     * 미리보기 패널에서 타임라인 한 칸에 표시할 문자열 (H:MM:SS 또는 M:SS). 자식에서 오버라이드 가능.
     * @param {number} playbackSec
     * @returns {string}
     */
    getTimelineDisplayText(playbackSec) {
        if (typeof playbackSec !== 'number' || playbackSec < 0 || !isFinite(playbackSec)) return this.constructor.TIME_PLACEHOLDER;
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

    _injectTinelineInsertButton() {
        const inputList = document.querySelectorAll(this.commentInputSelector);
        if (!inputList || inputList.length === 0) return;
        for (const input of inputList) {
            const existingButton = input.querySelector(`.${this.constructor.BTN_INSERT_CURRENT_TIME_CLASS}`);
            if (existingButton) continue;
            const buttonParent = input.querySelector(this.commentInputCurrentTimeButtonSlotSelector);
            if (!buttonParent) continue;
            const textarea = input.querySelector(this.commentInputTextareaSelector);
            if (!textarea)  continue;
            
            const button = document.createElement('button');
            button.type = 'button';
            button.className = this.constructor.BTN_INSERT_CURRENT_TIME_CLASS;
            this._applyStyle(button, this.insertCurrentTimeButtonStyle);
            button.addEventListener('mouseenter', () => this._applyStyle(button, this.insertCurrentTimeButtonHoverStyle));
            button.addEventListener('mouseleave', () => { button.style.backgroundColor = ''; });
            button.title = this.constructor.BTN_INSERT_CURRENT_TIME_LABEL;
            const span = document.createElement('span');
            span.textContent = this.constructor.BTN_INSERT_CURRENT_TIME_LABEL;
            span.style.font = '0/0 a';
            button.appendChild(span);
            const doInsert = () => {
                const tsManager = window.VODSync?.tsManager;
                if (!tsManager?.getCurPlaybackTime()) return;
                const currentTime = tsManager.getCurPlaybackTime();
                const currentTimeText = this.formatPlaybackTimeAsComment(currentTime);
                const selection = window.getSelection();
                const range = selection.rangeCount ? selection.getRangeAt(0) : null;
                if (range && textarea.contains(range.startContainer))
                    this.insertTimeTextAtRange(textarea, range, currentTimeText);
                else
                    this.insertTimeTextAtEnd(textarea, currentTimeText);
            };
            button.addEventListener('click', doInsert);
            input.addEventListener('keydown', (e) => {
                if (!e.altKey || e.key !== 't') return;
                if (textarea !== document.activeElement && !textarea.contains(document.activeElement)) return;
                e.preventDefault();
                doInsert();
            });
            buttonParent.appendChild(button);
        }
    }

    /** Range 위치에 현재 시간 텍스트를 삽입하고, 캐럿을 삽입된 텍스트 끝으로 둔다 */
    insertTimeTextAtRange(textarea, range, currentTimeText) {
        if (!textarea.contains(range.startContainer) || !textarea.contains(range.endContainer))
            return;

        range.deleteContents();
        const newTextNode = document.createTextNode(currentTimeText);
        range.insertNode(newTextNode);
        this._setCaretAfterNodeAndFocus(textarea, newTextNode);
    }

    /** textarea 끝에 현재 시간 텍스트를 붙이고, 캐럿을 삽입된 텍스트 끝으로 둔다 */
    insertTimeTextAtEnd(textarea, currentTimeText) {
        const newTextNode = document.createTextNode(currentTimeText);
        textarea.appendChild(newTextNode);
        this._setCaretAfterNodeAndFocus(textarea, newTextNode);
    }

    /** 텍스트 노드 끝에 캐럿을 두고 textarea에 포커스한다. */
    _setCaretAfterNodeAndFocus(textarea, node) {
        const range = document.createRange();
        range.setStart(node, node.length);
        range.setEnd(node, node.length);
        const sel = window.getSelection();
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
        }
        setTimeout(() => textarea.focus(), 0);
    }
}
        class SoopTimelineCommentProcessor extends TimelineCommentProcessorBase {
    /** 더보기 레이어 안 편집 구간 가져오기 버튼(SOOP 전용) */
    static CLIP_IMPORT_IN_MORE_CLASS = 'vodSync-timeline-clip-import-in-more';
    static BTN_CLIP_IMPORT_IN_MORE = '편집 구간으로 가져오기';
    static BTN_CLIP_IMPORT_IN_MORE_TOOLTIP = '본문에서 시간 ~ 시간 구간을 찾아 VOD 편집 구간으로 추가합니다';

    constructor() {
        super();
        // Selector override
        this.containerSelector = '#commentHighlight';
        this.commentRowSelector = 'li';
        this.commentTextSelector = '.cmmt-txt';
        this.checkboxSlotSelector = '.cmmt-header';
        this.commentInputSelector = 'section.cmmt_inp'; // 댓글 작성란 입력 요소
        this.commentInputCurrentTimeButtonSlotSelector = 'div.grid-start'; // 댓글 작성란 입력 요소 내부의 현재 시간 삽입 버튼 추가 슬롯
        this.commentInputTextareaSelector = 'div.write-inp'; // 댓글 작성란 입력 요소 내부의 텍스트 입력 요소

        // Style override
        this.checkboxWrapStyle.right = '30px';
    }

    /**
     * 한 개 이상의 댓글에서 미리보기용 세그먼트 생성.
     * @param {HTMLElement[]} rowEls 댓글 행 요소 배열
     * @returns {(string|number)[]}
     */
    buildSegmentsFromComments(commentEls) {
        const tsManager = window.VODSync?.tsManager;
        const result = [];
        for (const commentEl of commentEls) {
            const cmmtTxt = commentEl?.querySelector('.cmmt-txt');
            if (!cmmtTxt) continue;
            const root = cmmtTxt.querySelector('p') || cmmtTxt;
            const nodes = root.childNodes;
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if (node.nodeType === Node.TEXT_NODE) {
                    const t = node.textContent;
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
                    continue;
                }
                const t = node.textContent?.trim();
                if (t) result.push(t);
            }
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
        strong.style.color = '#0182ff';
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

    /** 단일 시각 토큰(예: 1:49:49)을 초로 변환. 편집 구간 가져오기 줄 파싱용. */
    parseHmsTokenToSeconds(token) {
        if (token == null || typeof token !== 'string') return null;
        return this.parsePlaybackSecondsFromText(token.trim());
    }

    /**
     * 한 줄에서 `앞글자 [ 01:02:03 ] ~ [ 4:05 ] 뒤글자` 또는 `1:02:03 ~ 4:05` 패턴을 찾는다(SOOP time_link 텍스트).
     * 앞·뒤 trim 후 공백으로 이은 문자열이 편집 구간 이름(둘 다 비면 이름 생략).
     * @returns {{ begin: number, end: number, name?: string }|null}
     */
    parseCommentLineForClipRange(line) {
        if (!line || typeof line !== 'string') return null;
        const hms = String.raw`\d{1,2}:\d{2}(?::\d{2})?`;
        const timeTok = String.raw`(?:\[\s*)?(${hms})(?:\s*\])?`;
        const m = line.match(new RegExp(String.raw`^([\s\S]*?)${timeTok}\s*~\s*${timeTok}\s*([\s\S]*)$`));
        if (!m) return null;
        const begin = this.parseHmsTokenToSeconds(m[2]);
        const end = this.parseHmsTokenToSeconds(m[3]);
        if (begin == null || end == null) return null;
        const left = m[1].trim();
        const right = m[4].trim();
        const name = [left, right].filter(Boolean).join(' ');
        return name ? { begin, end, name } : { begin, end };
    }

    /** 더보기 메뉴: 댓글에서 구간을 파싱해 편집 VOD 편집 구간으로 넘긴다. */
    importClipsFromCommentRow(rowEl) {
        const lines = this.getCommentLinesForClipImport(rowEl);
        const items = [];
        for (const line of lines) {
            const one = this.parseCommentLineForClipRange(line);
            if (one) items.push(one);
        }
        if (items.length === 0) {
            window.alert(
                '가져올 구간이 없습니다. "128강 1:49:49 ~ 1:54:48" 형식이 있는지 확인하세요.'
            );
            return;
        }
        const veditor = window.VODSync?.soopVeditorReplacement;
        if (!veditor || typeof veditor.importClipsFromParsedRanges !== 'function') {
            window.alert('VOD 편집 패널을 아직 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.');
            return;
        }
        veditor.importClipsFromParsedRanges(items);
    }

    _injectClipImportButtonIntoMoreLayer(layer, rowEl, closeMore) {
        if (!layer.querySelector(`.${this.constructor.CLIP_IMPORT_IN_MORE_CLASS}`)) {
            const clipBtn = document.createElement('button');
            clipBtn.type = 'button';
            clipBtn.className = this.constructor.CLIP_IMPORT_IN_MORE_CLASS;
            clipBtn.textContent = this.constructor.BTN_CLIP_IMPORT_IN_MORE;
            clipBtn.title = this.constructor.BTN_CLIP_IMPORT_IN_MORE_TOOLTIP;
            clipBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.importClipsFromCommentRow(rowEl);
                closeMore();
            });
            layer.appendChild(clipBtn);
        }
    }

    /** BR·블록 경계마다 줄을 나눠 `시간 ~ 시간` 줄 파싱에 쓴다. */
    getCommentLinesForClipImport(rowEl) {
        const cmmtTxt = rowEl?.querySelector('.cmmt-txt');
        if (!cmmtTxt) {
            const raw = this._extractTextContent(rowEl);
            return raw
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
        }
        const root = cmmtTxt.querySelector('p') || cmmtTxt;
        const lines = [];
        let buf = '';
        const flush = () => {
            const t = buf.trim();
            if (t) lines.push(t);
            buf = '';
        };
        for (let i = 0; i < root.childNodes.length; i++) {
            const node = root.childNodes[i];
            if (node.nodeType === Node.TEXT_NODE) {
                const t = node.textContent;
                if (t) buf += t;
                continue;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            if (node.classList?.contains('best')) continue;
            if (node.tagName === 'BR') {
                flush();
                continue;
            }
            const t = node.textContent;
            if (t) buf += t;
        }
        flush();
        return lines;
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
        this._tooltipHideTimeout = null; // 툴팁 mouseleave 시 지연 숨김용
        this._soopUrls = window.VODSync?.SoopUrls || {};
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
        // 툴팁 클릭 시 해당 시점으로 이동 (툴팁만 클릭 가능하도록 여기서만 처리)
        this.sharedTooltip.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const sec = this.sharedTooltip.dataset.playbackTimeSeconds;
            if (sec === undefined || sec === '') return;
            const playbackTimeSeconds = parseInt(sec, 10);
            const tsManager = window.VODSync?.tsManager;
            if (tsManager && typeof tsManager.moveToPlaybackTime === 'function') {
                tsManager.moveToPlaybackTime(playbackTimeSeconds, true);
            }
            this.sharedTooltip.style.opacity = '0';
            this.sharedTooltip.style.pointerEvents = 'none';
        });
        this.sharedTooltip.addEventListener('mouseenter', () => {
            if (this._tooltipHideTimeout) {
                clearTimeout(this._tooltipHideTimeout);
                this._tooltipHideTimeout = null;
            }
        });
        this.sharedTooltip.addEventListener('mouseleave', () => {
            this._tooltipHideTimeout = setTimeout(() => {
                this._tooltipHideTimeout = null;
                if (this.sharedTooltip) {
                    this.sharedTooltip.style.opacity = '0';
                    this.sharedTooltip.style.pointerEvents = 'none';
                }
            }, 100);
        });
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
            this.warn('SoopTimestampManager를 찾을 수 없습니다.');
            return;
        }

        const currentPlaybackTime = tsManager.getCurPlaybackTime();
        if (currentPlaybackTime === null) {
            this.warn('재생 시간을 가져올 수 없습니다.');
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
        this.updateButtonText();

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
            const nextStart = Math.max(0, startTime - this.restoreInterval);
            const nextEnd = startTime;
            const suffix = excludedCount > 0
                ? ` - ${restoredCount}개, ${excludedCount} 제외`
                : ` - ${restoredCount}개`;
            this._restoreTimeRange = { startTime: nextStart, endTime: nextEnd };
            this.isRestoring = false;
            this.updateButtonText(suffix);

        } catch (error) {
            this.isRestoring = false;
            this.error('채팅 복원 오류:', error);
            if (this.restoreButton) {
                this.updateButtonText(' - 복원 실패, 다시 시도');
            }
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
                    const ogqCdn = this._soopUrls.OGQ_STICKER_CDN_ORIGIN || 'https://ogq-sticker-global-cdn-z01.sooplive.com';
                    ogqImageUrl = `${ogqCdn}/sticker/${ogqGid}/${ogqSid}_80.${fileExtension}?ver=${ogqVersion || '1'}`;
                }

                const ogqPurchaseUrl = isOgq && ogqGid 
                    ? `${this._soopUrls.OGQ_MARKET_ORIGIN || 'https://ogqmarket.sooplive.com'}?m=detail&productId=${ogqGid}`
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
                img.src = personalconUrl || `${this._soopUrls.RES_ORIGIN || 'https://res.sooplive.com'}/images/chatting/signature-default.svg`;
            } else {
                img.setAttribute('user_nick', userNick || '');
                img.setAttribute('grade', gradeValue.toString());
                img.src = `${this._soopUrls.RES_ORIGIN || 'https://res.sooplive.com'}/images/chatting/signature-default.svg`;
            }
            img.onerror = function() {
                this.src = `${window.VODSync?.SoopUrls?.RES_ORIGIN || 'https://res.sooplive.com'}/images/chatting/signature-default.svg`;
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
                this.src = `${window.VODSync?.SoopUrls?.RES_ORIGIN || 'https://res.sooplive.com'}/images/chat/ogq_default.png`;
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
        
        // playbackTime 커스텀 툴팁 및 클릭 시 해당 시점으로 이동
        const playbackTimeSeconds = timestamp ? Math.floor(timestamp / 1000) : 0;
        if (timestamp && this.initialRestoreEndTime !== null && this.sharedTooltip) {
            const secondsAgo = Math.floor(this.initialRestoreEndTime - playbackTimeSeconds);

            let tooltipText;
            if (secondsAgo < 0) {
                tooltipText = this.formatTime(playbackTimeSeconds);
            } else if (secondsAgo === 0) {
                tooltipText = '방금 전';
            } else {
                const hours = Math.floor(secondsAgo / 3600);
                const minutes = Math.floor((secondsAgo % 3600) / 60);
                const seconds = secondsAgo % 60;
                const parts = [];
                if (hours > 0) parts.push(`${hours}시간`);
                if (minutes > 0) parts.push(`${minutes}분`);
                if (seconds > 0 || parts.length === 0) parts.push(`${seconds}초`);
                tooltipText = `${parts.join(' ')} 전`;
            }
            messageTextDiv.addEventListener('mouseenter', (e) => {
                if (!this.sharedTooltip) return;
                if (this._tooltipHideTimeout) {
                    clearTimeout(this._tooltipHideTimeout);
                    this._tooltipHideTimeout = null;
                }
                const rect = messageTextDiv.getBoundingClientRect();
                this.sharedTooltip.dataset.playbackTimeSeconds = String(playbackTimeSeconds);
                this.sharedTooltip.textContent = tooltipText;
                this.sharedTooltip.style.right = `${window.innerWidth - rect.right}px`;
                this.sharedTooltip.style.top = `${rect.top - 5}px`;
                this.sharedTooltip.style.opacity = '1';
                this.sharedTooltip.style.pointerEvents = 'auto';
                this.sharedTooltip.style.cursor = 'pointer';
            });
            messageTextDiv.addEventListener('mouseleave', (e) => {
                if (!this.sharedTooltip) return;
                if (e.relatedTarget === this.sharedTooltip) return;
                this._tooltipHideTimeout = setTimeout(() => {
                    this._tooltipHideTimeout = null;
                    if (this.sharedTooltip) {
                        this.sharedTooltip.style.opacity = '0';
                        this.sharedTooltip.style.pointerEvents = 'none';
                    }
                }, 100);
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

    // 기본 버튼 문구 (nextRestorePlan + suffix 기준, 복원 중이면 복원 중 문구)
    generateRestoreButtonText(suffix = '') {
        if (this.isRestoring) return `이전 채팅 복원 (${this.restoreInterval}초) - 복원 중...`;
        if (!this.nextRestorePlan) return '이전 채팅 복원 준비 중';
        const { startTime, endTime } = this.nextRestorePlan;
        if (startTime === 0 && endTime === 0) return '영상의 시작 지점에 도달함';
        return `이전 채팅 복원 (${this.restoreInterval}초)${suffix}`;
    }

    // 버튼 텍스트 및 상태 업데이트 (nextRestorePlan / isRestoring 기준, suffix는 매개변수로 받음)
    updateButtonText(suffix = '') {
        if (!this.restoreButton) return;

        const atStart = this.nextRestorePlan && this.nextRestorePlan.startTime === 0 && this.nextRestorePlan.endTime === 0;
        const disabled = this.isRestoring || atStart;

        this.restoreButton.disabled = disabled;
        if (disabled) {
            this.restoreButton.style.backgroundColor = '#cccccc';
            this.restoreButton.style.color = '#333333';
            this.restoreButton.style.cursor = 'not-allowed';
            this.restoreButton.style.opacity = '0.6';
        } else {
            this.restoreButton.style.backgroundColor = '#4CAF50';
            this.restoreButton.style.color = 'white';
            this.restoreButton.style.cursor = 'pointer';
            this.restoreButton.style.opacity = '1';
        }

        this.restoreButton.innerText = this.generateRestoreButtonText(suffix);

        if (!this.nextRestorePlan) {
            this.restoreButton.title = '';
            return;
        }
        const { startTime, endTime } = this.nextRestorePlan;
        if (startTime !== undefined && endTime !== undefined) {
            if (startTime === 0 && endTime === 0) {
                this.restoreButton.title = '영상의 시작 지점에 도달함';
            } else {
                this.restoreButton.title = `다음 복원 구간: ${this.formatTime(startTime)} ~ ${this.formatTime(endTime)}`;
            }
        } else {
            this.restoreButton.title = '';
        }
    }

    // 초를 HH:MM:SS 형식으로 변환
    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
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
                const nextStart = Math.max(0, endTime - this.restoreInterval);
                this.nextRestorePlan = { startTime: nextStart, endTime: endTime };
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
        /**
 * SOOP VOD 편집 UI — `button.video_edit` 직접 처리, 패널 재사용(숨김/표시).
 * 확장(브리지 있음): `soop_content` 가 주입한 `VodCorePageBridge` 가 `#__vs_vodcore_ghost`에 playingTime·총 길이를 쓰고
 * `data-vs-seek`로 시크해 `window.vodCore`와 맞춘다.
 * 재생·시크는 `tsManager` 우선; ghost dataset·`window.vodCore` 직접 참조는 타임라인 메타 등 브리지 전용 데이터에만 둔다.
 * @typedef {{ name: string, begin: number, end: number, visibleOnTimeline?: boolean }} VeditorClip
 * @typedef {{ startTime: number, endTime: number, duration: number, idx: number, sectionIdx: number }} VeditorApiClip
 *
 * 역할 맵 (편집기 뼈대 — 메서드·필드는 이 경계를 기준으로 묶인다).
 *
 * 1) 오버레이 수명주기 — `video_edit` 감지, 패널 표시/숨김, DOM 1회 마운트.
 *    진입점: `_scanVideoEditButtons`, `_showPanel`, `_hidePanel`, `_mountOverlayDom`
 *
 * 2) 편집 구간 모델 — 구간 배열, 선택 인덱스, undo, 검증.
 *    진입점: `_getClips`, `_clipAdd(begin,end,name?)`, `_recordClipUndo`, `_clipValidate`, `importClipsFromParsedRanges`
 *
 * 3) 타임라인 뷰 — px/s, 눈금·트랙·편집 구간 그래프, 휠/스크롤바, 도구 모드.
 *    진입점: `_syncUiFromState`, `_renderRuler`, `_renderClipsOnTrack`, `_bindTimelineWheel`
 *
 * 4) 재생·시크 — tsManager·ghost(보간)·`<video>` 플레이헤드, 연속/구간 재생 RAF.
 *    진입점: `_refreshCachedGlobalPlaybackTime`, `_plSeekGlobal`, `_playAllClips`, `SoopVeditorReplacement.ClipBoundaryPlayback`
 *
 * 5) 게시 — 모달·카테고리·API 제출. 모달 차단: 총 길이 15초 미만 또는 30분 이상. 3초 미만 구간이 있으면 경고 alert만(모달·게시 시도는 가능). 페이로드는 유효 구간을 공식 API에 전달.
 *    진입점: `_onPublishButtonClick`, `_submitPublishModal`
 *
 * 데이터 변경 후 UI 일괄 갱신: `_syncUiFromState()` (조율자).
 */

class SoopVeditorReplacement extends IVodSync {
    static VEDITOR_API_SLOT_COUNT = 5;
    static VEDITOR_HOUR_SEC = 3600;
    /** px/초 — 뷰포트·총 길이를 알 수 없을 때만 사용 (전체 타임라인 맞춤 시에는 더 작게 허용). */
    static MIN_PPS_ABS_FLOOR = 0.02;
    static MAX_PPS = 800;
    /** 휠 deltaY 를 픽셀 단위로 맞춘 뒤 `pps *= exp(-dy * 이 값)` — 작을수록 줌이 완만함. */
    static ZOOM_WHEEL_EXP_PER_PX = 0.001125;
    static RULER_HEIGHT_PX = 17;
    static MAX_RULER_TICKS = 200;
    static TIMELINE_SCROLL_THUMB_MIN_PX = 28;
    static MAX_MINOR_TICKS = 600;
    static CLIP_MIN_DURATION = 0.05;
    /** 편집 패널 배속 드롭다운 값 (표시는 n×). */
    static PLAYBACK_SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    /** 타임라인 복사 `<select>` 안내 항목 — 복사 후 이 값으로 되돌려 같은 형식을 연속 선택할 수 있게 함. */
    static TIMELINE_COPY_PROMPT_VALUE = '_vs_timeline_copy_prompt';
    /** 시크 후 stale 시각이 end 뒤로 남아 있을 때 종료·다음 편집 구간 오판 방지 — 이 여유 안으로 들어와야 ‘현재 편집 구간 재생 중’으로 본다. */
    static PLAYBACK_CLIP_ENTRY_BEGIN_EPS = 0.15;
    static PLAYBACK_CLIP_ENTRY_END_SLACK = 0.4;
    /** 편집 오버레이 인라인 CSS — 탬퍼몽키는 본 클래스만 추출하므로 여기에 둔다. */
    static OverlayInlineStyles = class {
        static cssText() {
            return `            .vs-veditor-overlay { position: fixed; left: 0; right: 0; top: 0; bottom: 0; z-index: 2147483000;
              display: none; flex-direction: column; align-items: stretch; justify-content: flex-end; padding: 0; margin: 0;
              box-sizing: border-box; pointer-events: none; }
            /* 공통 떠 있는 패널 스킨 — 타임라인·편집 구간 목록은 각각 별도 엘리먼트로 shell에 나란히 붙음 */
            .vs-veditor-overlay-panel {
              pointer-events: auto; box-sizing: border-box; border-radius: 0;
              box-shadow: 0 -6px 36px rgba(0,0,0,0.5); border: 1px solid var(--vs-border, #2a2e33); border-bottom: none; margin: 0;
              max-height: min(78vh, 920px); overflow-x: hidden; overflow-y: auto;
              padding: 12px 12px 14px; background: var(--vs-bg); }
            .vs-veditor-dock-row {
              display: flex; flex-direction: row; flex-wrap: nowrap; align-items: flex-end; align-content: flex-start;
              justify-content: flex-start; gap: 0; width: 100%; pointer-events: none; }
            .vs-veditor-dock-row > .vs-veditor-overlay-panel { pointer-events: auto; }
            .vs-veditor-timeline-panel {
              flex: 0 0 auto;
              width: 75%; max-width: 75%;
              min-width: 0;
              padding-bottom: 4px; }
            .vs-veditor-clip-panel {
              flex: 0 0 auto;
              width: 25%; max-width: 25%;
              min-width: 0;
              /* 뷰포트 높이의 약 절반 — 고정 박스, 내부만 스크롤 */
              height: 50vh;
              max-height: 50vh;
              min-height: 0;
              display: flex;
              flex-direction: column;
              overflow: hidden;
              align-self: flex-end; }
            .vs-veditor-clip-panel.vs-collapsed {
              height: auto; max-height: none; overflow: visible; }
            .vs-veditor-clip-panel.vs-collapsed > .vs-veditor-clip-col {
              flex: none; overflow: visible; min-height: auto; }
            .vs-veditor-clip-panel.vs-collapsed .vs-veditor-clip-scroll {
              display: none; }
            .vs-veditor-clip-panel-head {
              font-weight: 600; font-size: 13px; margin: 0 0 8px; color: #e8eaed; letter-spacing: 0.02em;
              flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
            .vs-veditor-clip-panel-head-actions {
              display: flex; align-items: center; gap: 6px; flex-shrink: 1; min-width: 0; justify-content: flex-end; }
            .vs-veditor-clip-panel-head .vs-veditor-playback-speed.vs-veditor-timeline-copy-action {
              flex: 1 1 auto; width: auto; min-width: 9em; max-width: 15em; max-height: 26px; box-sizing: border-box; }
            .vs-veditor-clip-panel-toggle {
              padding: 2px 8px; min-height: 22px; border-radius: 4px; font-size: 12px; flex: 0 0 auto; }
            .vs-veditor-clip-panel > .vs-veditor-json-toolbar { flex-shrink: 0; }
            .vs-veditor-root {
              --vs-bg: #0c0d10;
              --vs-panel: #12141a;
              --vs-border: #2a2e33;
              --vs-muted: #8b95a5;
              --vs-accent: #00d4e8;
              --vs-accent-dim: #0099aa;
              --vs-playhead-glow: rgba(0, 212, 232, 0.35);
              --vs-clip-fill: rgba(0, 140, 130, 0.42);
              --vs-clip-fill-sel: rgba(0, 180, 170, 0.52);
              --vs-clip-border: #00a896;
              --vs-clip-border-sel: #40d4c8;
              box-sizing: border-box; font-family: inherit; color: #e8eaed; background: var(--vs-bg);
              border: none; border-radius: 0; padding: 0; margin: 0; width: 100%; max-width: 100%;
              position: relative; z-index: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0;
              background: transparent; }
            .vs-veditor-clip-panel .vs-veditor-json-panel {
              display: none; margin-top: 8px; flex-shrink: 1; min-height: 0; max-height: 28vh; overflow: auto; }
            .vs-veditor-clip-panel .vs-veditor-json-panel.vs-open { display: block; }
            .vs-veditor-clip-panel .vs-veditor-json-toolbar { margin-top: 6px; }
            .vs-veditor-root * { box-sizing: border-box; }
            .vs-veditor-title-head { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
            .vs-veditor-title { font-weight: 600; margin-bottom: 0; font-size: 14px; flex: 0 1 auto; min-width: 0; }
            .vs-veditor-title-row { display: flex; align-items: center; justify-content: space-between; gap: 10px;
              margin-bottom: 6px; flex-wrap: wrap; position: relative; }
            .vs-veditor-title-actions { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; }
            .vs-veditor-seq-col {
              width: 100%; min-width: 0;
              display: flex; flex-direction: column; gap: 6px;
              height: max-content; max-height: max-content; overflow: hidden;
              contain: layout; }
            .vs-veditor-clip-col {
              width: 100%; min-width: 0; min-height: 0;
              flex: 1 1 0;
              display: flex; flex-direction: column; gap: 6px;
              overflow: hidden; }
            .vs-veditor-seq-header {
              flex: 0 0 34px; width: 34px; min-width: 34px;
              display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start; gap: 6px;
              padding: 4px; background: var(--vs-panel); border: 1px solid var(--vs-border); border-radius: 4px;
              font-size: 12px; color: var(--vs-muted); }
            .vs-veditor-timecode { font-family: ui-monospace, monospace; color: var(--vs-accent); font-size: 12px; }
            .vs-veditor-seq-head-right { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
            .vs-veditor-clip-toolbar {
              display: flex; flex-direction: column; gap: 6px; padding: 6px; background: var(--vs-panel);
              border: 1px solid var(--vs-border); border-radius: 4px; flex-shrink: 0; }
            .vs-veditor-clip-toolbar-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
            .vs-veditor-title-inline-actions {
              justify-content: center; padding: 0; margin: 0;
              position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
              background: transparent; border: none; }
            .vs-veditor-clip-total { font-size: 14px; color: var(--vs-muted); margin-left: auto; }
            .vs-veditor-clip-play-status {
              font-size: 12px; color: #ffd8d8; margin-left: 8px; white-space: nowrap; }
            .vs-veditor-clip-scroll {
              flex: 1 1 0;
              min-height: 0;
              overflow: auto;
              border: 1px solid var(--vs-border); border-radius: 4px; background: #0a0b0e; padding: 4px; }
            .vs-veditor-clip-list-empty { padding: 12px; font-size: 12px; color: var(--vs-muted); text-align: center; }
            .vs-veditor-clip-row {
              border: 1px solid var(--vs-border); border-radius: 4px; margin-bottom: 6px; padding: 6px;
              background: #15171c; cursor: pointer; }
            .vs-veditor-clip-row.vs-veditor-clip-add-row {
              cursor: default; display: flex; align-items: center; justify-content: center;
              margin-bottom: 0; min-height: 0; }
            .vs-veditor-clip-add-btn {
              width: 30px; height: 30px; min-width: 30px; min-height: 30px;
              border-radius: 50%; padding: 0; margin: 0;
              display: flex; align-items: center; justify-content: center;
              font-size: 18px; font-weight: 300; line-height: 1; font-family: system-ui, sans-serif;
              color: var(--vs-accent);
              background: rgba(0, 212, 232, 0.12);
              border: 2px dashed var(--vs-accent-dim);
              cursor: pointer;
              box-sizing: border-box;
              transition: background 0.12s, border-color 0.12s, transform 0.12s; }
            .vs-veditor-clip-add-btn:hover {
              background: rgba(0, 212, 232, 0.22);
              border-style: solid;
              border-color: var(--vs-accent);
              transform: scale(1.04); }
            .vs-veditor-clip-add-btn:active { transform: scale(0.98); }
            .vs-veditor-clip-row--selected {
              border-color: var(--vs-clip-border-sel); box-shadow: 0 0 0 1px rgba(0, 180, 170, 0.25); }
            .vs-veditor-clip-row-line {
              display: grid;
              grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
              align-items: center;
              gap: 8px;
              min-width: 0; }
            .vs-veditor-clip-row-left {
              display: flex; align-items: center; gap: 6px; min-width: 0; }
            .vs-veditor-clip-row-center {
              display: flex; align-items: center; justify-content: center; gap: 4px;
              flex-wrap: nowrap; }
            .vs-veditor-clip-row-right {
              display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: 0; }
            .vs-veditor-clip-name { flex: 1 1 auto; min-width: 0; font-size: 12px; padding: 3px 5px;
              background: #1a1d24; border: 1px solid #3d4450; color: #e8eaed; border-radius: 3px; }
            .vs-veditor-clip-dur {
              flex: 0 0 auto; font-size: 12px; color: var(--vs-muted);
              font-family: ui-monospace, "Cascadia Mono", "Consolas", monospace; }
            .vs-veditor-clip-drag-handle {
              flex: 0 0 auto;
              width: 22px; min-width: 22px; height: 22px;
              display: inline-flex; align-items: center; justify-content: center;
              border: none; border-radius: 4px; background: transparent; color: #9aa4b5;
              cursor: grab; user-select: none; padding: 0; font-size: 12px; line-height: 1; }
            .vs-veditor-clip-drag-handle:active { cursor: grabbing; }
            .vs-veditor-clip-drag-handle:disabled { opacity: 0.45; cursor: default; }
            .vs-veditor-clip-time-tilde {
              flex: 0 0 auto; color: var(--vs-muted); font-size: 13px; line-height: 1;
              font-family: ui-monospace, "Cascadia Mono", "Consolas", monospace;
              user-select: none; padding: 0 1px; }
            .vs-veditor-clip-time-inp {
              flex: 0 0 auto; min-width: 11.5ch; width: 12ch; max-width: 100%;
              font-family: ui-monospace, "Cascadia Mono", "Consolas", monospace;
              font-size: 13px; line-height: 1.3;
              text-align: center;
              padding: 5px 6px;
              background: #0d1117; border: 1px solid #4a5568; color: #e8eaed; border-radius: 4px;
              outline: none; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
              transition: border-color 0.12s, box-shadow 0.12s; }
            .vs-veditor-clip-time-inp:hover { border-color: #6b7585; }
            .vs-veditor-clip-time-inp:focus {
              border-color: var(--vs-accent);
              box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 2px rgba(0, 212, 232, 0.22); }
            .vs-veditor-clip-time-inp::-webkit-outer-spin-button,
            .vs-veditor-clip-time-inp::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
            .vs-veditor-clip-time-inp[type="number"] { -moz-appearance: textfield; appearance: textfield; }
            .vs-veditor-btn-icon { padding: 2px 8px; min-width: 2em; }
            .vs-veditor-clip-eye-btn {
              display: inline-flex; align-items: center; justify-content: center;
              padding: 2px 4px; min-width: 28px; min-height: 26px; box-sizing: border-box; }
            .vs-veditor-clip-eye-btn svg { display: block; width: 16px; height: 16px; flex-shrink: 0; }
            .vs-veditor-clip-eye-btn svg,
            .vs-veditor-clip-eye-btn svg * { pointer-events: none; }
            .vs-veditor-clip-eye-btn--off { color: #8b95a8; }
            .vs-veditor-timeline-dock {
              width: 100%; min-width: 0; flex: 0 0 auto; flex-grow: 0; flex-shrink: 0;
              display: flex; flex-direction: row; align-items: stretch; gap: 6px;
              height: max-content; max-height: max-content; overflow: visible; }
            .vs-veditor-timeline-graph-col {
              flex: 1 1 auto; min-width: 0;
              display: flex; flex-direction: column; gap: 6px; }
            .vs-veditor-timeline-viewport { display: block; width: 100%; max-width: none; overflow-x: hidden; overflow-y: hidden;
              height: 66px; max-height: 66px; min-height: 66px; background: #0a0b0e; border: 1px solid var(--vs-border);
              border-radius: 4px; position: relative; flex-grow: 0; flex-shrink: 0; }
            .vs-veditor-timeline-scroll-wrap { width: 100%; margin-top: 0; flex-shrink: 0; user-select: none; }
            .vs-veditor-timeline-scroll-track { position: relative; height: 14px; border-radius: 7px; background: #1e2228;
              border: 1px solid #3d4450; cursor: pointer; box-sizing: border-box; }
            .vs-veditor-timeline-scroll-thumb { position: absolute; top: 1px; height: calc(100% - 2px); left: 0;
              min-width: 28px; border-radius: 6px; background: linear-gradient(180deg, #4a7a82 0%, #3a5c62 100%);
              border: 1px solid #5a9098; box-sizing: border-box; cursor: grab; touch-action: none; }
            .vs-veditor-timeline-scroll-thumb:active { cursor: grabbing; }
            .vs-veditor-timeline-scroll-wrap.vs-disabled .vs-veditor-timeline-scroll-thumb { cursor: default; opacity: 0.85; }
            .vs-veditor-timeline-inner { position: relative; height: 66px; min-height: 66px; max-height: 66px;
              overflow: hidden;
              box-sizing: border-box; }
            .vs-veditor-ruler { position: absolute; left: 0; top: 0; right: 0; height: 17px; z-index: 6;
              pointer-events: auto; }
            .vs-veditor-tick-major { position: absolute; top: 0; bottom: 0; border-left: 1px solid #4a5568; padding-left: 2px; }
            .vs-veditor-tick-minor { position: absolute; top: 10px; bottom: 0; left: 0; width: 0; border-left: 1px solid #2f3540;
              padding: 0; pointer-events: none; }
            .vs-veditor-track { position: absolute; left: 0; right: 0; top: 19px; bottom: 3px; background: #14181d;
              pointer-events: auto; }
            .vs-veditor-playhead { position: absolute; top: 0; bottom: 0; width: 13px; margin-left: -6px; z-index: 12;
              pointer-events: auto; cursor: ew-resize; touch-action: none; }
            .vs-veditor-playhead-line { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; margin-left: -1px;
              background: var(--vs-accent); box-shadow: 0 0 6px var(--vs-playhead-glow); pointer-events: none; }
            .vs-veditor-playhead-head { position: absolute; left: 50%; top: 0; width: 11px; height: 15px; margin-left: -5px;
              background: linear-gradient(180deg, #33e4f5 0%, var(--vs-accent) 100%); border-radius: 2px 2px 1px 1px;
              border: 1px solid var(--vs-accent-dim); pointer-events: none; box-shadow: 0 1px 4px rgba(0,0,0,0.45); }
            .vs-veditor-clip { position: absolute; top: 4px; bottom: 4px; background: var(--vs-clip-fill);
              border: 1px solid var(--vs-clip-border); border-radius: 2px; pointer-events: auto; z-index: 1; }
            .vs-veditor-clip.vs-selected { background: var(--vs-clip-fill-sel); border-color: var(--vs-clip-border-sel); z-index: 2; }
            .vs-veditor-clip-order {
              position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
              max-width: calc(100% - 18px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
              font-size: 12px; font-weight: 700; color: #e8f8f6; text-shadow: 0 1px 2px rgba(0,0,0,0.85);
              pointer-events: none; z-index: 3; }
            .vs-veditor-clip-handle { position: absolute; top: 0; bottom: 0; width: 8px; max-width: 35%;
              cursor: ew-resize; z-index: 2; background: rgba(255,255,255,0.1); }
            .vs-veditor-clip-handle:hover { background: rgba(255,255,255,0.22); }
            .vs-veditor-clip-handle.vs-left { left: 0; border-radius: 2px 0 0 2px; }
            .vs-veditor-clip-handle.vs-right { right: 0; border-radius: 0 2px 2px 0; }
            .vs-veditor-clip-body { position: absolute; left: 8px; right: 8px; top: 0; bottom: 0; cursor: grab; z-index: 1; }
            .vs-veditor-clip-body:active { cursor: grabbing; }
            .vs-veditor-btn { padding: 4px 10px; border-radius: 4px; border: 1px solid #3d4450; background: #1e2228; color: #e8eaed; cursor: pointer; font-size: 12px; }
            .vs-veditor-btn:hover:not(:disabled) { background: #2a3038; border-color: #4a5568; }
            .vs-veditor-btn:disabled { opacity: 0.42; cursor: not-allowed; pointer-events: none; }
            .vs-veditor-btn.vs-veditor-btn-danger {
              background: #8a2020; border-color: #b13a3a; color: #fff2f2; font-weight: 600; }
            .vs-veditor-btn.vs-veditor-btn-danger:hover:not(:disabled) {
              background: #a12828; border-color: #c54b4b; }
            .vs-veditor-btn.vs-veditor-btn-primary {
              background: #007bff; border-color: #4ea4ff; color: white; font-weight: 600; }
            .vs-veditor-btn.vs-veditor-btn-primary:hover:not(:disabled) {
              background: #3395ff; border-color: #7ab8ff; color: white; }
            .vs-veditor-publish-modal {
              position: fixed; inset: 0; z-index: 2147483646; display: none; align-items: center; justify-content: center;
              background: rgba(2, 4, 8, 0.56); pointer-events: auto; }
            .vs-veditor-publish-modal.vs-open { display: flex; }
            .vs-veditor-publish-card {
              width: min(520px, calc(100vw - 20px)); max-height: calc(100vh - 30px); overflow: auto;
              background: #2a2e34; border: 1px solid #424952; border-radius: 4px; padding: 14px; }
            .vs-veditor-publish-head {
              display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; font-size: 14px; font-weight: 600; }
            .vs-veditor-publish-close {
              border: none; background: transparent; color: #f3f5f8; cursor: pointer; font-size: 18px; padding: 0 4px; line-height: 1; }
            .vs-veditor-publish-grid { display: flex; flex-direction: column; gap: 10px; }
            .vs-veditor-publish-label { font-size: 12px; color: #dce2ea; margin-bottom: 4px; display: inline-block; }
            .vs-veditor-publish-required { color: #ff5f5f; margin-left: 2px; }
            .vs-veditor-publish-input,
            .vs-veditor-publish-select,
            .vs-veditor-publish-textarea {
              width: 100%; background: #51565e; color: #f2f4f7; border: 1px solid #7a828f; border-radius: 2px; font-size: 12px; }
            .vs-veditor-publish-input,
            .vs-veditor-publish-select { height: 34px; padding: 0 10px; }
            .vs-veditor-publish-textarea { min-height: 86px; resize: vertical; padding: 8px 10px; }
            /* 제목 입력은 내용 입력과 동일한 시각 톤으로 고정 */
            .vs-veditor-publish-input.vs-veditor-publish-title {
              background: #51565e; border: 1px solid #7a828f; color: #f2f4f7; padding: 8px 10px; }
            .vs-veditor-publish-input::placeholder,
            .vs-veditor-publish-textarea::placeholder { color: #b7bec9; }
            .vs-veditor-publish-input:focus,
            .vs-veditor-publish-select:focus,
            .vs-veditor-publish-textarea:focus {
              outline: none; border-color: #9db4d5; box-shadow: 0 0 0 2px rgba(157,180,213,0.18); }
            .vs-veditor-publish-category-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
            .vs-veditor-publish-desc {
              margin-top: 8px; font-size: 12px; line-height: 1.5; color: #ff4f4f; white-space: pre-line; }
            .vs-veditor-publish-err {
              margin-top: 6px; font-size: 12px; color: #ff9a9a; min-height: 1.3em; }
            .vs-veditor-publish-actions { margin-top: 8px; display: flex; justify-content: center; gap: 8px; }
            .vs-veditor-publish-cancel { min-width: 68px; background: #1f2328; }
            .vs-veditor-publish-submit { min-width: 68px; background: #2b8cff; border-color: #4ea4ff; color: #f7fbff; }
            .vs-veditor-timeline-tools { display: flex; flex-direction: column; align-items: stretch; gap: 4px; margin-right: 0; }
            .vs-veditor-timeline-label-mode,
            .vs-veditor-playback-speed {
              width: 100%; min-width: 0; max-width: none; height: 24px; padding: 0 5px;
              border-radius: 4px; border: 1px solid #3d4450; background: #12161d; color: #d9deea; font-size: 12px; }
            .vs-veditor-clip-toolbar-row .vs-veditor-playback-speed {
              width: auto; min-width: 5em; max-width: 7.5em; flex: 0 0 auto; }
            .vs-veditor-btn.vs-veditor-tool-btn {
              width: 24px; min-width: 24px; max-width: 24px;
              padding: 2px; min-height: 24px; display: inline-flex; align-items: center; justify-content: center; gap: 0;
              font-size: 12px; color: #b9c3d2; }
            .vs-veditor-tool-btn svg { width: 14px; height: 14px; display: block; }
            .vs-veditor-tool-btn.vs-active {
              color: var(--vs-accent); border-color: var(--vs-accent-dim);
              box-shadow: inset 0 0 0 1px rgba(0, 212, 232, 0.14); }
            .vs-veditor-track.vs-tool-cut .vs-veditor-clip,
            .vs-veditor-track.vs-tool-cut .vs-veditor-clip-body,
            .vs-veditor-track.vs-tool-cut .vs-veditor-clip-handle {
              cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M11 3h7l3 3v12l-3 3h-7l-3-3V6z' fill='%2315191f' stroke='%23cfd7e4' stroke-width='1.35'/%3E%3Cpath d='M12.7 8h5M12.7 12h4M12.7 16h5' stroke='%23cfd7e4' stroke-width='1.35' stroke-linecap='round'/%3E%3Cpath d='M4 1.5v21' stroke='%2300d4e8' stroke-width='1.8'/%3E%3C/svg%3E") 4 12, crosshair; }
            .vs-veditor-json { width: 100%; min-height: 72px; font-size: 12px; font-family: monospace; background: #0a0b0e; color: #a8b0bc;
              border: 1px solid var(--vs-border); border-radius: 4px; padding: 6px; }
            .vs-veditor-ruler-hover-tip { position: fixed; z-index: 2147483640; display: none; pointer-events: none;
              padding: 2px 6px; border-radius: 4px; background: #1e2228; border: 1px solid #4a5568; font-size: 12px; color: #e8eaed; }
        `;
        }
    };

    static ClipBoundaryPlayback = class {
        /**
         * @param {SoopVeditorReplacement} editor
         * @param {number} t
         * @param {number} begin
         * @param {number} end
         * @returns {'continue'|'segment_end'}
         */
        static advance(editor, t, begin, end) {
            const eps = SoopVeditorReplacement.PLAYBACK_CLIP_ENTRY_BEGIN_EPS;
            const slack = SoopVeditorReplacement.PLAYBACK_CLIP_ENTRY_END_SLACK;
            if (!editor._playbackClipEntered) {
                if (t >= begin - eps && t <= end + slack) {
                    editor._playbackClipEntered = true;
                }
                return 'continue';
            }
            if (t >= end - 0.05) return 'segment_end';
            return 'continue';
        }
    };

    static EDITOR_RULER_STEPS_SEC = [
        0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600,
    ];
    /** 타임라인 표시 토글 아이콘 — 고정 문자열 재사용(행마다 새 문자열 조립 안 함). */
    static CLIP_TIMELINE_VISIBILITY_SVG_ON =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M1.75 8C3.4 5.15 5.55 3.5 8 3.5 10.45 3.5 12.6 5.15 14.25 8 12.6 10.85 10.45 12.5 8 12.5 5.55 12.5 3.4 10.85 1.75 8z"/>' +
        '<circle cx="8" cy="8" r="2"/></svg>';
    static CLIP_TIMELINE_VISIBILITY_SVG_OFF =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M1.75 8.1Q8 5.55 14.25 8.1"/></svg>';
    static TIMELINE_TOOL_SVG_SELECT =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M3 2.5L11.5 8.1 7.8 8.9 9.9 13.5 8.1 14.2 6 9.6 3 12V2.5z"/></svg>';
    static TIMELINE_TOOL_SVG_CUT =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M5.2 2.2H11.9L13.7 4V11.8L11.9 13.6H5.2L3.4 11.8V4z"/><path d="M6.4 5.4h4.4M6.4 8h3.5M6.4 10.6h4.4"/><path d="M1.2 1.2v13.6"/></svg>';

    // 필드 초기화, 핸들러 bind, MutationObserver로 video_edit 버튼 스캔을 시작한다 (확장 로드 직후).
    constructor() {
        super();
        /** @type {string|null} */
        this.titleNo = null;
        this._panelVisible = false;

        /** @type {VeditorClip[]} */
        this._clips = [];
        this._selectedClipIndex = 0;
        /** @type {{ clips: VeditorClip[], selectedClipIndex: number }[]} */
        this._clipUndoStack = [];
        this._clipUndoMaxDepth = 100;
        /** @type {'select'|'cut'} */
        this._timelineToolMode = 'select';
        /** @type {'index'|'name'} */
        this._timelineClipLabelMode = 'index';
        /** @type {{ clip: VeditorClip, mode: string, startX: number, origBegin: number, origEnd: number, total: number, undoSnapshot: { clips: VeditorClip[], selectedClipIndex: number }|null, dragEl: HTMLElement|null, moveRaf: number, pendingClientX: number }|null} */
        this._clipDrag = null;

        this.rootEl = null;
        this._overlayShell = null;
        /** @type {HTMLDivElement|null} */
        this._clipListScrollEl = null;
        /** @type {HTMLElement|null} */
        this._clipPanelEl = null;
        /** @type {HTMLButtonElement|null} */
        this._clipPanelToggleBtn = null;
        this._clipPanelCollapsed = false;
        /** @type {HTMLElement|null} */
        this._sequenceHeaderEl = null;
        /** @type {HTMLElement|null} */
        this._timecodeEl = null;
        /** @type {HTMLElement|null} */
        this._clipTotalEl = null;
        /** @type {HTMLElement|null} */
        this._clipPlayStatusEl = null;
        /** @type {HTMLSelectElement|null} */
        this._timelineCopyActionSel = null;
        /** @type {HTMLButtonElement|null} */
        this._clipToolbarFitBtn = null;
        /** @type {HTMLButtonElement|null} */
        this._clipToolbarDupBtn = null;
        /** @type {HTMLButtonElement|null} */
        this._clipToolbarDelBtn = null;
        /** @type {HTMLButtonElement|null} */
        this._clipToolbarStartBtn = null;
        /** @type {HTMLButtonElement|null} */
        this._clipToolbarEndBtn = null;
        /** @type {HTMLButtonElement|null} */
        this._clipToolbarAddBtn = null;
        /** @type {HTMLButtonElement|null} */
        this._clipToolbarPlaySelBtn = null;
        /** @type {HTMLButtonElement|null} */
        this._clipToolbarTestBtn = null;
        /** @type {HTMLButtonElement|null} */
        this._clipToolbarPublishBtn = null;
        /** @type {HTMLButtonElement|null} */
        this._officialVeditorBtn = null;
        /** @type {HTMLDivElement|null} */
        this._publishModalEl = null;
        /** @type {HTMLSelectElement|null} */
        this._publishBoardSel = null;
        /** @type {HTMLSelectElement|null} */
        this._publishVodCategorySel = null;
        /** @type {HTMLSelectElement|null} */
        this._publishVodCategorySubSel = null;
        /** @type {HTMLSelectElement|null} */
        this._publishLangSel = null;
        /** @type {HTMLInputElement|null} */
        this._publishTitleInp = null;
        /** @type {HTMLTextAreaElement|null} */
        this._publishContentsInp = null;
        /** @type {HTMLElement|null} */
        this._publishErrEl = null;
        /** @type {HTMLButtonElement|null} */
        this._publishSubmitBtn = null;
        this._publishSubmitting = false;
        this._publishVodCategoryTree = [];
        /** @type {HTMLButtonElement|null} */
        this._timelineToolSelectBtn = null;
        /** @type {HTMLButtonElement|null} */
        this._timelineToolCutBtn = null;
        /** @type {HTMLSelectElement|null} */
        this._timelineLabelModeSelect = null;
        /** @type {HTMLSelectElement|null} */
        this._playbackSpeedSelect = null;
        this._playAllMode = false;
        /** 선택한 편집 구간만 재생 중일 때 true — RAF·grace는 `_playAllRaf` 등 재사용. */
        this._playSingleClipMode = false;
        this._playSingleClipBeginSec = 0;
        this._playSingleClipEndSec = 0;
        /** 시크 직후 `t >= end` 오판 방지: 현재 편집 구간 begin 근처~end+slack 안으로 들어온 뒤에만 true */
        this._playbackClipEntered = false;
        /** @type {number|null} */
        this._playAllRaf = null;
        this._playAllSeekGraceUntil = 0;
        /** @type {number} */
        this._playAllIndex = 0;
        this._listDnDIndex = null;
        /** DnD 로 순서만 바뀐 뒤 전체 재빌드(행 DOM 순서·dataset 일치). */
        this._clipListReorderPending = false;
        /** `.vs-veditor-clip-scroll` 에 편집 구간 목록 위임 리스너 1회만 부착. */
        this._clipListDelegationBound = false;
        this._timelineViewport = null;
        this._timelineInner = null;
        this._rulerEl = null;
        this._trackEl = null;
        this._playheadEl = null;
        this._rulerHoverTipEl = null;
        this._pixelsPerSecond = 80;
        /** 첫 레이아웃에서 타임라인 줌을 뷰포트에 맞는 최대 축소로 맞출 때까지 true */
        this._veditorInitialTimelineZoomPending = true;
        this._playheadSec = 0;
        this._playheadDragging = false;
        this._playheadRafId = null;
        this._playheadVideoBound = null;
        this._wheelPaintRaf = 0;
        /** 스크롤·썸 드래그로 눈금+커스텀 스크롤바 갱신을 한 프레임으로 묶음 */
        this._viewportScrollVisualRaf = null;
        /** 눈금 호버 툴팁: mousemove 를 rAF 로 합쳐 getBoundingClientRect 폭주 방지 */
        this._rulerTipRaf = null;
        /** @type {MouseEvent|null} */
        this._rulerTipPendingEv = null;
        this._viewportResizeObs = null;
        this._timelineScrollBarEl = null;
        this._timelineScrollTrackEl = null;
        this._timelineScrollThumbEl = null;
        /** @type {{ pointerId: number, startX: number, startScroll: number, maxScroll: number, maxThumbLeft: number }|null} */
        this._scrollThumbDrag = null;
        /** `_refreshCachedGlobalPlaybackTime` 결과 — 재생 헤드 갱신·시크 직후 등에서만 refresh 후, 나머지는 이 값만 읽는다. */
        this._cachedGlobalPlaybackSec = 0;
        /** 동일 동기 스택에서 `_refreshCachedGlobalPlaybackTime` 재진입 시 1회만 읽기. */
        this._gpGlobalPlaybackReadCoalesced = false;
        /** ghost playingTime 이 잠깐 멈출 때 재생 헤드 표시만 시계로 보간 (편집 시각은 `_cachedGlobalPlaybackSec`). */
        this._phGhostExRaw = null;
        this._phGhostExAnchorSec = 0;
        this._phGhostExWallMs = 0;

        this._onVideoPauseSeekForPlayhead = this._onVideoPauseSeekForPlayhead.bind(this);
        this._onPlayheadPointerMove = this._onPlayheadPointerMove.bind(this);
        this._onPlayheadPointerUp = this._onPlayheadPointerUp.bind(this);
        this._onPlayheadKeydown = this._onPlayheadKeydown.bind(this);
        this._onClipResizeMove = this._onClipResizeMove.bind(this);
        this._onClipResizeEnd = this._onClipResizeEnd.bind(this);
        this._tickPlayheadPanelSync = this._tickPlayheadPanelSync.bind(this);
        this._onVideoEditClick = this._onVideoEditClick.bind(this);
        this._onTimelineScrollThumbUp = this._onTimelineScrollThumbUp.bind(this);
        this._onClipListChange = this._onClipListChange.bind(this);
        this._onClipListHostClick = this._onClipListHostClick.bind(this);
        this._onClipListHostDragStart = this._onClipListHostDragStart.bind(this);
        this._onClipListHostDragOver = this._onClipListHostDragOver.bind(this);
        this._onClipListHostDrop = this._onClipListHostDrop.bind(this);
        this._onClipListHostDragEnd = this._onClipListHostDragEnd.bind(this);

        this._editButtonObserver = new MutationObserver(() => this._scanVideoEditButtons());
        this._editButtonObserver.observe(document.documentElement, { childList: true, subtree: true });
        this._scanVideoEditButtons();
        window.VODSync = window.VODSync || {};
        window.VODSync.soopVeditorReplacement = this;
        this.debug('SoopVeditorReplacement: ready');
    }

    /**
     * 타임라인 댓글 등에서 파싱한 구간을 편집 구간 목록에 한 번에 추가한다. 패널이 없으면 연다.
     * @param {{ begin: number, end: number, name?: string }[]} items
     */
    importClipsFromParsedRanges(items) {
        if (!Array.isArray(items) || items.length === 0) return;
        if (!/\/player\/\d+/.test(window.location.pathname)) return;

        const titleNo = window.location.pathname.match(/\/player\/(\d+)/)?.[1];
        if (!titleNo) return;
        this.titleNo = titleNo;

        if (this._isClipListBusy()) {
            window.alert('구간 테스트·연속 재생 중에는 가져올 수 없습니다. 먼저 재생을 멈춰 주세요.');
            return;
        }

        if (!this._overlayShell) {
            this._mountOverlayDom();
            this._panelVisible = true;
            this._veditorInitialTimelineZoomPending = true;
            this._hydratePlaylistFromVodCore();
            if (this._overlayShell) this._overlayShell.style.display = 'flex';
        } else if (!this._panelVisible || this._overlayShell.style.display === 'none') {
            this._showPanel();
        }

        this._recordClipUndo();
        for (const it of items) {
            const nm = it?.name != null && String(it.name).trim() !== '' ? String(it.name).trim() : undefined;
            this._clipAdd(it.begin, it.end, nm);
        }
        const clips = this._getClips();
        this._selectedClipIndex = Math.max(0, clips.length - 1);
        this._syncUiFromState();
    }

    // --- 오버레이·진입 (역할 맵: video_edit, 패널, ghost) ---
    /** ghost dataset(총 길이·titleNo 등) — 브리지 없으면 null. 재생 시각·시크는 `tsManager` 사용. */
    _getVodCoreGhost() {
        return window.VODSync?.vodCoreBridge?.getGhost?.() ?? null;
    }

    // DOM에 있는 video_edit 버튼을 모두 찾아 아직 미바인딩인 것만 연결한다 (Observer 콜백·초기 스캔).
    _scanVideoEditButtons() {
        document.querySelectorAll('button.video_edit').forEach((btn) => this._bindVideoEditButton(btn));
    }

    // video_edit 버튼에 캡처 단계 클릭 리스너를 한 번만 붙인다 (중복 방지용 data 속성 사용).
    _bindVideoEditButton(btn) {
        if (!(btn instanceof HTMLButtonElement)) return;
        if (btn.dataset.vsVodEditBound === '1') return;
        btn.dataset.vsVodEditBound = '1';
        btn.addEventListener('click', this._onVideoEditClick, true);
    }

    // 플레이어 페이지에서 편집 버튼 클릭 시 기본 동작을 막고 오버레이를 최초 생성하거나 토글한다.
    _onVideoEditClick(e) {
        if (!/\/player\/\d+/.test(window.location.pathname)) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const titleNo = window.location.pathname.match(/\/player\/(\d+)/)?.[1];
        if (!titleNo) return;
        this.titleNo = titleNo;

        if (!this._overlayShell) {
            this._mountOverlayDom();
            // `_hydratePlaylistFromVodCore` 안의 `_startPlayheadRaf` 가 `_panelVisible` 을 본다. 먼저 true 로 두어야 최초 오픈 시에도 rAF 가 돈다.
            this._panelVisible = true;
            this._veditorInitialTimelineZoomPending = true;
            this._hydratePlaylistFromVodCore();
            if (this._overlayShell) this._overlayShell.style.display = 'flex';
            return;
        }
        if (this._panelVisible) {
            this._hidePanel();
        } else {
            this._showPanel();
        }
    }

    // ghost(페이지 브리지가 채움)와 URL 기준 titleNo를 맞춘 뒤 UI를 갱신한다 (패널 최초 오픈·표시 시).
    _hydratePlaylistFromVodCore() {
        const ghost = this._getVodCoreGhost();
        const tnGhost = ghost?.dataset?.titleNo;
        if (tnGhost != null && String(tnGhost).length > 0) this.titleNo = String(tnGhost);
        const hasGhostData =
            ghost &&
            (ghost.dataset.playingTime !== '' ||
                ghost.dataset.configFilesDurationSum !== '' ||
                ghost.dataset.fileItemsDurationSum !== '' ||
                ghost.dataset.totalFileDuration !== '');
        if (!ghost) {
            this.debug('vodCore ghost 없음 — 타임라인·시크는 tsManager·<video> 폴백');
        } else if (!hasGhostData) {
            this.debug('vodCore 브리지 대기 중 — 재생 길이는 video 메타에 의존할 수 있음');
        } else {
            this.debug('playlist via vodCore page bridge');
        }
        this._syncOfficialVeditorButtonState();
        this._syncPlaybackSpeedSelectFromPlayer();
        this._syncUiFromState();
        this._startPlayheadRaf();
    }

    /** 공식 편집기 버튼: titleNo 가 있을 때만 활성화 (ghost·URL 동기화 후 상태 맞춤). */
    _syncOfficialVeditorButtonState() {
        const btn = this._officialVeditorBtn;
        if (!btn) return;
        const ok = String(this.titleNo || '').trim().length > 0;
        btn.disabled = !ok;
        btn.title = ok ? 'SOOP 공식 웹 편집기(새 탭)' : 'titleNo를 알 수 없어 공식 편집기를 열 수 없습니다.';
    }

    // 편집 패널을 숨기고 재생 헤드 RAF·드래그 상태를 정리한다 (닫기·토글 시).
    _hidePanel() {
        this._panelVisible = false;
        this._stopPlayAll();
        this._closePublishModal();
        this._onPlayheadPointerUp();
        this._onTimelineScrollThumbUp();
        this._stopPlayheadRaf();
        if (this._viewportScrollVisualRaf != null) {
            cancelAnimationFrame(this._viewportScrollVisualRaf);
            this._viewportScrollVisualRaf = null;
        }
        if (this._rulerTipRaf != null) {
            cancelAnimationFrame(this._rulerTipRaf);
            this._rulerTipRaf = null;
        }
        this._rulerTipPendingEv = null;
        this._resetPlayheadGhostExtrap();
        if (this._overlayShell) this._overlayShell.style.display = 'none';
    }

    _showPanel() {
        this._panelVisible = true;
        this._veditorInitialTimelineZoomPending = true;
        if (this._overlayShell) {
            this._overlayShell.style.display = 'flex';
            this._hydratePlaylistFromVodCore();
        }
    }

    // --- 편집 구간 모델 (배열, undo, 검증) ---
    // 편집 중인 편집 구간 배열 참조를 반환한다 (테이블·트랙 렌더링에서 공통 접근).
    _getClips() {
        return this._clips;
    }

    _isClipListBusy() {
        return this._playAllMode || this._playSingleClipMode;
    }

    _cloneClipForUndo(clip) {
        return {
            name: String(clip?.name ?? ''),
            begin: this._roundClipSec(Number(clip?.begin ?? 0)),
            end: this._roundClipSec(Number(clip?.end ?? 0)),
            visibleOnTimeline: clip?.visibleOnTimeline !== false,
        };
    }

    _snapshotClipStateForUndo() {
        return {
            clips: this._clips.map((c) => this._cloneClipForUndo(c)),
            selectedClipIndex: this._selectedClipIndex,
        };
    }

    _recordClipUndo() {
        const snapshot = this._snapshotClipStateForUndo();
        this._clipUndoStack.push(snapshot);
        if (this._clipUndoStack.length > this._clipUndoMaxDepth) {
            this._clipUndoStack.splice(0, this._clipUndoStack.length - this._clipUndoMaxDepth);
        }
    }

    /**
     * 레거시 `{ startTime, endTime }` 또는 불완전 필드를 `{ name, begin, end, visibleOnTimeline }` 형태로 맞춘다.
     */
    _migrateClipShape() {
        for (let i = 0; i < this._clips.length; i++) {
            const c = this._clips[i];
            if (c.begin === undefined && c.startTime !== undefined) {
                c.begin = Number(c.startTime);
                c.end = Number(c.endTime);
            }
            if (c.name === undefined || String(c.name).trim() === '') c.name = `편집 구간 ${i + 1}`;
            if (c.visibleOnTimeline === undefined) c.visibleOnTimeline = true;
            if (Number.isFinite(Number(c.begin))) c.begin = this._roundClipSec(Number(c.begin));
            if (Number.isFinite(Number(c.end))) c.end = this._roundClipSec(Number(c.end));
        }
    }

    // 새 편집 구간을 추가한다 (배열 끝 = 리스트 순서; 시간순 자동 정렬 없음). name 생략·빈 문자열이면 `편집 구간 n`.
    _clipAdd(begin, end, name = undefined) {
        let b = Math.min(Number(begin), Number(end));
        let e = Math.max(Number(begin), Number(end));
        if (!Number.isFinite(b)) b = 0;
        if (!Number.isFinite(e)) e = b;
        b = this._roundClipSec(b);
        e = this._roundClipSec(e);
        const n = this._clips.length + 1;
        const label = name != null && String(name).trim() !== '' ? String(name).trim() : `편집 구간 ${n}`;
        this._clips.push({ name: label, begin: b, end: e, visibleOnTimeline: true });
    }

    // 지정 인덱스 편집 구간 필드를 갱신한다 (표·타임라인 조작 후).
    _clipUpdate(clipIdx, patch) {
        const c = this._clips[clipIdx];
        if (!c) return;
        if (patch.begin !== undefined) {
            const v = Number(patch.begin);
            if (Number.isFinite(v)) c.begin = this._roundClipSec(v);
        }
        if (patch.end !== undefined) {
            const v = Number(patch.end);
            if (Number.isFinite(v)) c.end = this._roundClipSec(v);
        }
        if (patch.name !== undefined) c.name = String(patch.name);
        if (patch.visibleOnTimeline !== undefined) c.visibleOnTimeline = !!patch.visibleOnTimeline;
    }

    // 한 편집 구간을 배열에서 제거한다 (표의 삭제 버튼).
    _clipRemove(clipIdx) {
        if (this._isClipListBusy()) return;
        if (clipIdx < 0 || clipIdx >= this._clips.length) return;
        this._clips.splice(clipIdx, 1);
    }

    // 모든 편집 구간을 비운다 (전체 비우기 버튼).
    _clipClearAll() {
        if (this._isClipListBusy()) return;
        if (this._clips.length > 0) this._recordClipUndo();
        this._clips = [];
    }

    // 편집 구간들의 (끝−시작) 합을 초 단위로 구한다 (미리보기 라벨·검증 보조).
    _clipTotalDurationSec() {
        let sum = 0;
        for (const c of this._clips) {
            sum += Math.max(0, c.end - c.begin);
        }
        return sum;
    }

    // 합계 초를 패널 라벨용으로 붙인다 — 60초 미만은 초만, 이상은 분·초(소수 둘째).
    _formatClipTotalSumLabel(sumSec) {
        if (!Number.isFinite(sumSec) || sumSec < 0) return '총 길이 0.00초';
        const m = Math.floor(sumSec / 60);
        const sRem = Math.max(0, sumSec - m * 60);
        if (m === 0) return `총 길이 ${sRem.toFixed(2)}초`;
        return `총 길이 ${m}분 ${sRem.toFixed(2)}초`;
    }

    /** 게시 API와 동일 규칙(시각 소수 둘째 자리)으로 한 편집 구간의 길이(초). 비정상이면 null. */
    _clipPublishDurationSec(c) {
        const startTime = this._roundClipSec(c.begin);
        const endTime = this._roundClipSec(c.end);
        if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return null;
        const duration = this._roundClipSec(endTime - startTime);
        if (!Number.isFinite(duration)) return null;
        return Math.max(0, duration);
    }

    // 편집 구간이 유효한지 검사한다 (게시 저장 직전·필요 시 호출).
    _clipValidate() {
        for (let i = 0; i < this._clips.length; i++) {
            const c = this._clips[i];
            if (!(c.end >= c.begin)) {
                return { ok: false, message: `편집 구간 ${i + 1}: 끝 시각이 시작보다 작을 수 없습니다.` };
            }
            if (c.begin < 0) {
                return { ok: false, message: `편집 구간 ${i + 1}: 시작 시각이 음수입니다.` };
            }
        }
        return { ok: true };
    }

    /**
     * ghost에 싱크된 VOD 총 길이(초). config 파일 합·fileItems 합·totalFileDuration 이
     * 서로 다르면, 끝 이후 빈 슬라이드를 줄이기 위해 보통 더 짧은 값을 쓴다.
     * 한 값만 비정상적으로 작으면(부분 배열) 긴 쪽을 택한다.
     */
    _getMetaTotalDurationSec() {
        const ghost = this._getVodCoreGhost();
        if (!ghost) return 0;
        const pick = (key) => {
            const x = parseFloat(ghost.dataset[key] || '');
            return Number.isFinite(x) && x > 0 ? x : 0;
        };
        const cfs = pick('configFilesDurationSum');
        const sm = pick('fileItemsDurationSum');
        const tf = pick('totalFileDuration');
        const vals = [cfs, sm, tf].filter((v) => v > 0);
        if (vals.length === 0) return 0;
        if (vals.length === 1) return vals[0];
        const lo = Math.min(...vals);
        const hi = Math.max(...vals);
        if (hi > lo + 0.5 && lo < hi * 0.5) return hi;
        return lo;
    }

    /**
     * 타임라인·시크 클램프에 쓰는 총 길이. vodCore(ghost) 메타 우선; 브리지 없을 때만 `<video>.duration`.
     */
    _getTotalDurationSec() {
        const meta = this._getMetaTotalDurationSec();
        if (meta > 0) return meta;
        const v = this._getVideo();
        const vd =
            v && Number.isFinite(v.duration) && v.duration > 0 && v.duration !== Number.POSITIVE_INFINITY
                ? v.duration
                : 0;
        if (vd > 0) return vd;
        return 3600;
    }

    /**
     * `tsManager.getCurPlaybackTime()` → 실패 시 `<video>.currentTime`.
     * 동일 동기 스택에서 여러 번 호출돼도 실제 DOM 읽기는 한 번만 한다.
     */
    _refreshCachedGlobalPlaybackTime() {
        if (this._gpGlobalPlaybackReadCoalesced) return;
        this._gpGlobalPlaybackReadCoalesced = true;
        try {
            const ts = window.VODSync?.tsManager;
            if (ts && typeof ts.getCurPlaybackTime === 'function') {
                const pt = ts.getCurPlaybackTime();
                if (pt !== null && Number.isFinite(pt)) {
                    this._cachedGlobalPlaybackSec = Math.max(0, pt);
                    return;
                }
            }
            const v = this._getVideo();
            this._cachedGlobalPlaybackSec = v && Number.isFinite(v.currentTime) ? Math.max(0, v.currentTime) : 0;
        } finally {
            queueMicrotask(() => {
                this._gpGlobalPlaybackReadCoalesced = false;
            });
        }
    }

    _peekGhostPlayingTime() {
        const ghost = this._getVodCoreGhost();
        if (!ghost || ghost.dataset.playingTime === '') return null;
        const pt = parseFloat(ghost.dataset.playingTime);
        return Number.isFinite(pt) ? Math.max(0, pt) : null;
    }

    _resetPlayheadGhostExtrap() {
        this._phGhostExRaw = null;
        this._phGhostExAnchorSec = 0;
        this._phGhostExWallMs = 0;
    }

    /**
     * ghost 값이 연속 프레임에서 같을 때(플레이어가 playingTime 을 거칠게만 갱신할 때) 시계·playbackRate 로 표시만 보간한다.
     * @param {number} ghostPt
     * @param {number} total
     * @param {HTMLVideoElement} v
     */
    _playheadSecFromGhostExtrap(ghostPt, total, v) {
        const now = performance.now();
        const eps = 1e-4;
        if (this._phGhostExRaw == null || Math.abs(ghostPt - this._phGhostExRaw) >= eps) {
            this._phGhostExRaw = ghostPt;
            this._phGhostExAnchorSec = ghostPt;
            this._phGhostExWallMs = now;
            return Math.max(0, Math.min(total, ghostPt));
        }
        const elapsedSec = (now - this._phGhostExWallMs) / 1000;
        if (elapsedSec > 0.35) {
            this._phGhostExAnchorSec = ghostPt;
            this._phGhostExWallMs = now;
            return Math.max(0, Math.min(total, ghostPt));
        }
        const rate = v.playbackRate || 1;
        return Math.max(0, Math.min(total, this._phGhostExAnchorSec + elapsedSec * rate));
    }

    /**
     * 노란 헤드 **표시**용 시각 (rAF). 브리지 `playingTime` 있으면 보간, 없으면 `tsManager.getCurPlaybackTime`·`<video>`.
     */
    _computePlayheadDisplaySec(total) {
        const ghostPt = this._peekGhostPlayingTime();
        const v = this._getVideo();
        const haveCur =
            typeof HTMLMediaElement !== 'undefined'
                ? HTMLMediaElement.HAVE_CURRENT_DATA
                : /* @__PURE__ */ 2;
        const playing = Boolean(v && !v.paused && !v.ended && v.readyState >= haveCur);

        if (ghostPt != null) {
            if (!playing) {
                this._resetPlayheadGhostExtrap();
                return Math.min(total, ghostPt);
            }
            return Math.min(total, this._playheadSecFromGhostExtrap(ghostPt, total, v));
        }

        this._resetPlayheadGhostExtrap();
        const ts = window.VODSync?.tsManager;
        if (ts && typeof ts.getCurPlaybackTime === 'function') {
            const pt = ts.getCurPlaybackTime();
            if (pt !== null && Number.isFinite(pt)) {
                return Math.min(total, Math.max(0, pt));
            }
        }
        const ct = v && Number.isFinite(v.currentTime) ? Math.max(0, v.currentTime) : null;
        if (ct != null) return Math.min(total, ct);
        return 0;
    }

    // `tsManager.moveToPlaybackTime`(URL·ghost·time_link) → ts 없을 때만 ghost·`<video>`.
    _plSeekGlobal(globalSec) {
        const s = Number(globalSec);
        const sec = Number.isFinite(s) ? Math.max(0, s) : 0;
        const ts = window.VODSync?.tsManager;
        if (ts && typeof ts.moveToPlaybackTime === 'function') {
            ts.moveToPlaybackTime(sec, false);
            return;
        }
        const ghost = this._getVodCoreGhost();
        if (ghost) {
            ghost.setAttribute('data-vs-seek', String(sec));
            return;
        }
        const v = this._getVideo();
        if (v) {
            try {
                v.currentTime = sec;
            } catch (e) {
                /* ignore */
            }
        }
    }

    // 문서의 첫 `<video>` 요소 (ghost 미가동·보조 시 길이·재생 시각).
    _getVideo() {
        const v = document.querySelector('video');
        return v instanceof HTMLVideoElement ? v : null;
    }

    // 브리지 ghost가 있으면 `data-vs-playback-rate`로 MAIN에서 `vodCore.speed` 적용; 없으면 `<video>.playbackRate`.
    _setPlaybackSpeedFromUi(rate) {
        const r = Number(rate);
        if (!Number.isFinite(r) || r <= 0) return;
        const ghost = this._getVodCoreGhost();
        if (ghost) {
            ghost.setAttribute('data-vs-playback-rate', String(r));
            return;
        }
        const v = this._getVideo();
        if (v) {
            try {
                v.playbackRate = r;
            } catch (e) {
                /* ignore */
            }
        }
    }

    // 플레이어 `<video>.playbackRate` 를 기준으로 배속 드롭다운 표시를 가장 가까운 옵션에 맞춘다 (패널 표시 시).
    _syncPlaybackSpeedSelectFromPlayer() {
        const sel = this._playbackSpeedSelect;
        if (!sel) return;
        const opts = SoopVeditorReplacement.PLAYBACK_SPEED_OPTIONS;
        let cur = 1;
        const v = this._getVideo();
        if (v && Number.isFinite(v.playbackRate) && v.playbackRate > 0) cur = v.playbackRate;
        let best = opts[3];
        let bestDiff = Math.abs(best - cur);
        for (let i = 0; i < opts.length; i++) {
            const d = Math.abs(opts[i] - cur);
            if (d < bestDiff) {
                bestDiff = d;
                best = opts[i];
            }
        }
        sel.value = String(best);
    }

    // 뷰포트 너비에 맞춰 전체 타임라인이 한 화면에 들어가게 하는 최소 px/초를 구한다 (줌 하한).
    _minPpsToFitViewport(totalSec) {
        const vp = this._timelineViewport;
        const total = totalSec !== undefined ? totalSec : this._getTotalDurationSec();
        if (!vp || total <= 0) return SoopVeditorReplacement.MIN_PPS_ABS_FLOOR;
        const w = Math.max(vp.clientWidth, 1);
        return Math.max(SoopVeditorReplacement.MIN_PPS_ABS_FLOOR, w / total);
    }

    /**
     * 타임라인 inner 너비(px). `total*pps`가 뷰포트보다 작으면 inner가 viewport보다 좁아져 옆에 빈 틈이 보이므로
     * 항상 최소 `clientWidth` 이상으로 맞춘다 (눈금·편집 구간 좌표는 여전히 `t*pps` 기준).
     */
    _getTimelineInnerWidthPx(total, pps) {
        const vp = this._timelineViewport;
        const raw = total > 0 ? total * pps : 0;
        if (!vp) return Math.max(1, raw);
        const cw = Math.max(vp.clientWidth, 1);
        return Math.max(raw, cw);
    }

    // 픽셀/초 줌 값을 허용 범위와 뷰포트 맞춤 하한 사이로 잘라낸다 (휠 줌·동기화 시).
    _clampPps(pps, totalSec) {
        const minPps = this._minPpsToFitViewport(totalSec);
        const lo = Math.max(SoopVeditorReplacement.MIN_PPS_ABS_FLOOR, minPps);
        return Math.max(lo, Math.min(SoopVeditorReplacement.MAX_PPS, pps));
    }

    // 타임라인 내부 너비가 바뀐 뒤 가로 스크롤이 범위를 벗어나지 않게 맞춘다 (줌·리사이즈 후).
    _clampViewportScroll(innerW) {
        const vp = this._timelineViewport;
        if (!vp) return;
        const maxScroll = Math.max(0, innerW - vp.clientWidth);
        if (maxScroll <= 0) {
            vp.scrollLeft = 0;
        } else {
            vp.scrollLeft = Math.max(0, Math.min(vp.scrollLeft, maxScroll));
        }
        this._updateTimelineScrollBarUI();
    }

    // 오버레이용 기본 스타일 버튼을 만들고 클릭 후 포커스를 뺀다 (접근성·키보드 트랩 완화).
    _btn(label, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'vs-veditor-btn';
        b.textContent = label;
        b.addEventListener('click', onClick);
        b.addEventListener('click', () => {
            queueMicrotask(() => b.blur());
        });
        return b;
    }

    _getSoopApi() {
        return window.VODSync?.soopAPI ?? null;
    }

    _setPublishError(msg) {
        if (!this._publishErrEl) return;
        this._publishErrEl.textContent = msg || '';
    }

    _setPublishSubmitting(on) {
        this._publishSubmitting = !!on;
        if (this._publishSubmitBtn) this._publishSubmitBtn.disabled = !!on;
        if (this._publishBoardSel) this._publishBoardSel.disabled = !!on;
        if (this._publishVodCategorySel) this._publishVodCategorySel.disabled = !!on;
        if (this._publishVodCategorySubSel) this._publishVodCategorySubSel.disabled = !!on;
        if (this._publishLangSel) this._publishLangSel.disabled = !!on;
        if (this._publishTitleInp) this._publishTitleInp.disabled = !!on;
        if (this._publishContentsInp) this._publishContentsInp.disabled = !!on;
    }

    _toggleClipPanelCollapsed() {
        this._clipPanelCollapsed = !this._clipPanelCollapsed;
        this._updateClipPanelCollapseUi();
    }

    _updateClipPanelCollapseUi() {
        if (this._clipPanelEl) this._clipPanelEl.classList.toggle('vs-collapsed', this._clipPanelCollapsed);
        if (this._clipPanelToggleBtn) {
            this._clipPanelToggleBtn.textContent = this._clipPanelCollapsed ? '펼치기' : '접기';
            this._clipPanelToggleBtn.setAttribute('aria-label', this._clipPanelCollapsed ? '편집 구간 목록 펼치기' : '편집 구간 목록 접기');
            this._clipPanelToggleBtn.title = this._clipPanelCollapsed ? '편집 구간 목록 펼치기' : '편집 구간 목록 접기';
        }
    }

    _setSelectOptions(selectEl, list, placeholder, valueKey, labelKey) {
        if (!selectEl) return;
        selectEl.innerHTML = '';
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = placeholder;
        selectEl.appendChild(ph);
        for (const it of list) {
            const op = document.createElement('option');
            op.value = String(it[valueKey] ?? '');
            op.textContent = String(it[labelKey] ?? it[valueKey] ?? '');
            if (it.category !== undefined) op.dataset.category = String(it.category);
            selectEl.appendChild(op);
        }
    }

    _collectVodCategoryTree(catRoot) {
        const out = [];
        const roots = catRoot?.CHANNEL?.VOD_CATEGORY;
        if (!Array.isArray(roots)) return out;
        for (const major of roots) {
            const majorName = major?.cate_name;
            const majorVodCategory = major?.cate_no || major?.vod_category;
            if (!majorName || !majorVodCategory) continue;
            const majorCategory = String(major?.ucc_cate || '00210000');
            const node = {
                name: String(majorName),
                vodCategory: String(majorVodCategory),
                category: majorCategory,
                children: [],
            };
            const children = Array.isArray(major?.child) ? major.child : [];
            for (const child of children) {
                const childName = child?.cate_name;
                const childVodCategory = child?.cate_no || child?.vod_category;
                if (!childName || !childVodCategory) continue;
                node.children.push({
                    name: String(childName),
                    vodCategory: String(childVodCategory),
                    category: String(child?.ucc_cate || majorCategory),
                });
            }
            out.push(node);
        }
        return out;
    }

    _fillVodCategorySubOptionsByMain(mainVodCategory) {
        const sel = this._publishVodCategorySubSel;
        if (!sel) return;
        const main = this._publishVodCategoryTree.find((x) => x.vodCategory === String(mainVodCategory));
        const children = main?.children || [];
        if (children.length === 0) {
            this._setSelectOptions(sel, [], '세부 카테고리 없음', 'vodCategory', 'name');
            sel.disabled = true;
            return;
        }
        this._setSelectOptions(sel, children, '카테고리 선택', 'vodCategory', 'name');
        sel.disabled = false;
    }

    _getPublishVodCategorySelection() {
        const mainValue = this._publishVodCategorySel?.value || '';
        if (!mainValue) return null;
        const main = this._publishVodCategoryTree.find((x) => x.vodCategory === String(mainValue));
        if (!main) return null;
        const subValue = this._publishVodCategorySubSel?.value || '';
        if (subValue && Array.isArray(main.children) && main.children.length > 0) {
            const sub = main.children.find((x) => x.vodCategory === String(subValue));
            if (sub) return sub;
        }
        return main;
    }

    _buildPublishEditJobInfo() {
        const block = [];
        for (let i = 0; i < this._clips.length; i++) {
            const c = this._clips[i];
            const startTime = this._roundClipSec(c.begin);
            const endTime = this._roundClipSec(c.end);
            const duration = this._roundClipSec(endTime - startTime);
            if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || !Number.isFinite(duration) || duration <= 0) {
                return null;
            }
            block.push({
                startTime,
                endTime,
                duration,
                idx: i,
                sectionIdx: 0,
            });
        }
        return [block];
    }

    async _resolvePublishLoginId() {
        const ghost = this._getVodCoreGhost();
        const fromGhost = ghost?.dataset?.loginId;
        if (fromGhost) return String(fromGhost);
        const api = this._getSoopApi();
        if (!api || typeof api.GetPrivateInfo !== 'function') return null;
        const priv = await api.GetPrivateInfo();
        return priv?.CHANNEL?.LOGIN_ID ?? null;
    }

    // --- 게시 (모달, API) ---
    async _onPublishButtonClick() {
        if (this._isClipListBusy() || this._publishSubmitting) return;
        const failOpen = (msg) => {
            this._setPublishError(msg);
            alert(msg);
        };
        if (this._clips.length === 0) {
            alert('게시할 편집 구간이 없습니다.');
            return;
        }
        const clipVal = this._clipValidate();
        if (!clipVal.ok) {
            alert(clipVal.message);
            return;
        }
        let anySegmentLt3 = false;
        for (const c of this._clips) {
            const d = this._clipPublishDurationSec(c);
            if (d === null) {
                alert('편집 구간 시각을 확인할 수 없습니다.');
                return;
            }
            if (d < 3) anySegmentLt3 = true;
        }
        const totalClipSec = this._clipTotalDurationSec();
        if (totalClipSec < 15) {
            alert('편집 구간 길이 총합이 15초 이상이어야 합니다.');
            return;
        }
        if (totalClipSec > 1800) {
            alert('편집 구간 길이 총합이 30분(1800초) 이하여야 합니다.');
            return;
        }
        if (anySegmentLt3) {
            alert('3초 미만인 편집 구간이 있습니다. 이는 최종 결과물에 포함되지 않을 것입니다.');
        }
        const api = this._getSoopApi();
        if (!api) {
            alert('soopAPI를 찾을 수 없습니다.');
            return;
        }
        this._setPublishError('');
        this._setPublishSubmitting(true);
        try {
            const titleNo = String(this.titleNo || '');
            if (!titleNo) {
                failOpen('titleNo를 확인할 수 없습니다.');
                return;
            }
            const [webInfo, catTree, loginId] = await Promise.all([
                api.GetSoopVeditorWebVodInfo?.(titleNo),
                api.GetVodEditorCategory?.(),
                this._resolvePublishLoginId(),
            ]);
            if (!loginId) {
                failOpen('로그인 ID를 확인할 수 없습니다.');
                return;
            }
            const menu = await api.GetStationMenu?.(loginId);
            const boards = Array.isArray(menu?.board) ? menu.board.filter((b) => Number(b?.displayType) === 104) : [];
            const langsObj = webInfo?.response?.info?.langs || {};
            const langs = Object.keys(langsObj).map((k) => ({ code: k, name: langsObj[k] }));
            const cats = this._collectVodCategoryTree(catTree);
            if (boards.length === 0 || langs.length === 0 || cats.length === 0) {
                failOpen('게시판/카테고리/언어 목록 조회에 실패했습니다.');
                return;
            }
            this._setSelectOptions(this._publishBoardSel, boards, '게시판 선택', 'bbsNo', 'name');
            this._publishVodCategoryTree = cats;
            this._setSelectOptions(this._publishVodCategorySel, cats, '대분류 선택', 'vodCategory', 'name');
            this._fillVodCategorySubOptionsByMain('');
            this._setSelectOptions(this._publishLangSel, langs, '언어 선택', 'code', 'name');
            if (this._publishLangSel) this._publishLangSel.value = 'ko_KR';
            if (this._publishTitleInp) this._publishTitleInp.value = '';
            if (this._publishContentsInp) {
                const vodOrigin = window.VODSync?.SoopUrls?.VOD_ORIGIN || 'https://vod.sooplive.com';
                const reviewUrl = new URL(`${vodOrigin}/player/${titleNo}`);
                const firstClip = this._clips[0];
                if (firstClip) {
                    const sec = this._roundClipSec(Number(firstClip.begin));
                    if (Number.isFinite(sec) && sec >= 0) {
                        reviewUrl.searchParams.set('change_second', String(Math.round(sec)));
                    }
                }
                const head = `원본 다시보기: ${reviewUrl.toString()}`;
                const clipBlock = this._clips
                    .map((c, i) => {
                        const b = this._formatClipTimeInput(c.begin);
                        const e = this._formatClipTimeInput(c.end);
                        const nm = String(c.name || '').trim() || `편집 구간 ${i + 1}`;
                        return `${i + 1}. ${nm}: ${b} ~ ${e}`;
                    })
                    .join('\n');
                this._publishContentsInp.value = `${head}\n${clipBlock}`;
            }
            if (this._publishModalEl) this._publishModalEl.classList.add('vs-open');
        } catch (e) {
            this.error('게시 모달 데이터 로딩 실패', e);
            failOpen('게시 모달을 준비하지 못했습니다.');
        } finally {
            this._setPublishSubmitting(false);
        }
    }

    _closePublishModal() {
        if (this._publishModalEl) this._publishModalEl.classList.remove('vs-open');
        this._setPublishError('');
    }

    async _submitPublishModal() {
        if (this._publishSubmitting) return;
        const board = this._publishBoardSel?.value || '';
        const selectedCategory = this._getPublishVodCategorySelection();
        const lang = (this._publishLangSel?.value || '').trim();
        const title = (this._publishTitleInp?.value || '').trim();
        const contents = (this._publishContentsInp?.value || '').trim();
        if (!board || !selectedCategory?.vodCategory || !lang || !title) {
            this._setPublishError('게시판, VOD 카테고리, 언어, 제목은 필수입니다.');
            return;
        }
        const clipVal = this._clipValidate();
        if (!clipVal.ok) {
            this._setPublishError(clipVal.message);
            return;
        }
        const editJobInfo = this._buildPublishEditJobInfo();
        if (!editJobInfo) {
            this._setPublishError('편집 구간 정보 변환에 실패했습니다.');
            return;
        }
        const api = this._getSoopApi();
        if (!api || typeof api.SetWebEditorJob !== 'function') {
            this._setPublishError('게시 API를 찾을 수 없습니다.');
            return;
        }
        const titleNo = String(this.titleNo || '');
        if (!titleNo) {
            this._setPublishError('titleNo를 확인할 수 없습니다.');
            return;
        }
        this._setPublishSubmitting(true);
        this._setPublishError('');
        try {
            const webInfo = await api.GetSoopVeditorWebVodInfo?.(titleNo);
            const broadNo = webInfo?.response?.info?.broad_no;
            if (!broadNo) {
                this._setPublishError('broadNo를 확인할 수 없습니다.');
                return;
            }
            const res = await api.SetWebEditorJob({
                titleNo,
                broadNo: String(broadNo),
                bbsNo: String(board),
                category: String(selectedCategory.category || '00210000'),
                vodCategory: String(selectedCategory.vodCategory),
                title,
                contents,
                strmLangType: String(lang),
                editType: '1',
                editJobInfo,
            });
            if (!res) {
                this._setPublishError('게시 요청에 실패했습니다.');
                return;
            }
            this._closePublishModal();
            alert(res.MSG || '게시 요청을 전송했습니다.');
        } catch (e) {
            this.error('게시 API 요청 실패', e);
            this._setPublishError('게시 요청 중 오류가 발생했습니다.');
        } finally {
            this._setPublishSubmitting(false);
        }
    }

    // 편집 패널 DOM·CSS·타임라인·편집 구간 표를 생성해 body에 붙이고 이벤트를 연결한다 (최초 오픈 시 한 번).
    _mountOverlayDom() {
        const shell = document.createElement('div');
        shell.id = 'vod-sync-veditor-overlay';
        shell.className = 'vs-veditor-overlay';

        const wrap = document.createElement('div');
        wrap.id = 'vod-sync-veditor-root';
        wrap.className = 'vs-veditor-root vs-veditor-root--overlay';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-label', '편집 VOD 만들기');

        const style = document.createElement('style');
        style.textContent = SoopVeditorReplacement.OverlayInlineStyles.cssText();
        wrap.appendChild(style);

        this._veditorMountOverlayPanelElements(wrap);

        shell.appendChild(wrap);
        document.body.appendChild(shell);
        this._overlayShell = shell;
        this.rootEl = wrap;

        this._veditorBindOverlayControls();
    }

    /**
     * 오버레이 패널 DOM 트리(타임라인·편집 구간 목록·게시 모달)만 조립한다. 스타일은 `SoopVeditorReplacement.OverlayInlineStyles`.
     * @param {HTMLDivElement} wrap
     */
    _veditorMountOverlayPanelElements(wrap) {
        const titleRow = document.createElement('div');
        titleRow.className = 'vs-veditor-title-row';
        const titleHead = document.createElement('div');
        titleHead.className = 'vs-veditor-title-head';
        const title = document.createElement('div');
        title.className = 'vs-veditor-title';
        title.textContent = 'VOD 편집하기';
        const closeBtn = this._btn('닫기', () => this._hidePanel());
        this._officialVeditorBtn = this._btn('공식 편집기 열기', () => {
            const id = String(this.titleNo || '').trim();
            if (!id) return;
            const url = `https://veditor.sooplive.com/web/${encodeURIComponent(id)}`;
            window.open(url, '_blank', 'noopener,noreferrer');
        });
        this._officialVeditorBtn.title = 'SOOP 공식 웹 편집기(새 탭)';
        this._officialVeditorBtn.setAttribute('aria-label', 'SOOP 공식 웹 편집기 새 탭');
        titleHead.appendChild(title);
        titleHead.appendChild(this._officialVeditorBtn);
        titleRow.appendChild(titleHead);

        this._timelineViewport = document.createElement('div');
        this._timelineViewport.className = 'vs-veditor-timeline-viewport';
        this._timelineInner = document.createElement('div');
        this._timelineInner.className = 'vs-veditor-timeline-inner';
        this._rulerEl = document.createElement('div');
        this._rulerEl.className = 'vs-veditor-ruler';
        this._trackEl = document.createElement('div');
        this._trackEl.className = 'vs-veditor-track';
        this._timelineInner.appendChild(this._rulerEl);
        this._timelineInner.appendChild(this._trackEl);
        this._playheadEl = document.createElement('div');
        this._playheadEl.className = 'vs-veditor-playhead';
        this._playheadEl.setAttribute('role', 'slider');
        this._playheadEl.setAttribute('aria-label', '재생 헤드');
        const phLine = document.createElement('div');
        phLine.className = 'vs-veditor-playhead-line';
        const phHead = document.createElement('div');
        phHead.className = 'vs-veditor-playhead-head';
        this._playheadEl.appendChild(phLine);
        this._playheadEl.appendChild(phHead);
        this._timelineInner.appendChild(this._playheadEl);
        this._timelineViewport.appendChild(this._timelineInner);

        this._timelineScrollBarEl = document.createElement('div');
        this._timelineScrollBarEl.className = 'vs-veditor-timeline-scroll-wrap';
        this._timelineScrollTrackEl = document.createElement('div');
        this._timelineScrollTrackEl.className = 'vs-veditor-timeline-scroll-track';
        this._timelineScrollThumbEl = document.createElement('div');
        this._timelineScrollThumbEl.className = 'vs-veditor-timeline-scroll-thumb';
        this._timelineScrollThumbEl.setAttribute('role', 'slider');
        this._timelineScrollThumbEl.setAttribute('aria-label', '타임라인 가로 스크롤');
        this._timelineScrollTrackEl.appendChild(this._timelineScrollThumbEl);
        this._timelineScrollBarEl.appendChild(this._timelineScrollTrackEl);

        const timelineDock = document.createElement('div');
        timelineDock.className = 'vs-veditor-timeline-dock';
        const seqHeader = document.createElement('div');
        seqHeader.className = 'vs-veditor-seq-header';
        this._timecodeEl = document.createElement('span');
        this._timecodeEl.className = 'vs-veditor-timecode';
        this._timecodeEl.textContent = '00:00:00.000';
        const toolModes = document.createElement('div');
        toolModes.className = 'vs-veditor-timeline-tools';
        this._timelineToolSelectBtn = this._btn('', () => this._setTimelineToolMode('select'));
        this._timelineToolSelectBtn.classList.add('vs-veditor-tool-btn');
        this._timelineToolSelectBtn.innerHTML = SoopVeditorReplacement.TIMELINE_TOOL_SVG_SELECT;
        this._timelineToolSelectBtn.title = '선택 모드 (V)';
        this._timelineToolSelectBtn.setAttribute('aria-label', '선택 모드');
        this._timelineToolCutBtn = this._btn('', () => this._setTimelineToolMode('cut'));
        this._timelineToolCutBtn.classList.add('vs-veditor-tool-btn');
        this._timelineToolCutBtn.innerHTML = SoopVeditorReplacement.TIMELINE_TOOL_SVG_CUT;
        this._timelineToolCutBtn.title = '자르기 모드 (C)';
        this._timelineToolCutBtn.setAttribute('aria-label', '자르기 모드');
        this._timelineLabelModeSelect = document.createElement('select');
        this._timelineLabelModeSelect.className = 'vs-veditor-timeline-label-mode';
        this._timelineLabelModeSelect.title = '타임라인 라벨 표시';
        this._timelineLabelModeSelect.setAttribute('aria-label', '타임라인 라벨 표시');
        this._timelineLabelModeSelect.innerHTML =
            '<option value="index">편집 구간 표시: 순서</option><option value="name">편집 구간 표시: 이름</option>';
        this._timelineLabelModeSelect.value = this._timelineClipLabelMode;
        this._timelineLabelModeSelect.addEventListener('change', () => {
            this._timelineClipLabelMode =
                this._timelineLabelModeSelect && this._timelineLabelModeSelect.value === 'name' ? 'name' : 'index';
            this._renderClipsOnTrack(this._getTotalDurationSec(), this._pixelsPerSecond);
        });
        toolModes.appendChild(this._timelineToolSelectBtn);
        toolModes.appendChild(this._timelineToolCutBtn);
        const seqHeadRight = document.createElement('div');
        seqHeadRight.className = 'vs-veditor-seq-head-right';
        seqHeadRight.appendChild(toolModes);
        const titleActions = document.createElement('div');
        titleActions.className = 'vs-veditor-title-actions';
        titleActions.appendChild(this._timecodeEl);
        titleActions.appendChild(this._timelineLabelModeSelect);
        titleActions.appendChild(closeBtn);
        titleRow.appendChild(titleActions);
        const timelineGraphCol = document.createElement('div');
        timelineGraphCol.className = 'vs-veditor-timeline-graph-col';
        timelineGraphCol.appendChild(this._timelineViewport);
        timelineGraphCol.appendChild(this._timelineScrollBarEl);
        seqHeader.appendChild(seqHeadRight);
        this._sequenceHeaderEl = seqHeader;
        timelineDock.appendChild(seqHeader);
        timelineDock.appendChild(timelineGraphCol);

        const clipCol = document.createElement('div');
        clipCol.className = 'vs-veditor-clip-col';
        const clipToolbar = document.createElement('div');
        clipToolbar.className = 'vs-veditor-clip-toolbar';
        const tbr1 = document.createElement('div');
        tbr1.className = 'vs-veditor-clip-toolbar-row vs-veditor-title-inline-actions';
        this._clipToolbarAddBtn = this._btn('+', () => this._addDefaultClip());
        this._clipToolbarAddBtn.classList.add('vs-veditor-btn-icon');
        this._clipToolbarAddBtn.title = '편집 구간 추가';
        this._clipToolbarAddBtn.setAttribute('aria-label', '편집 구간 추가');
        this._clipToolbarStartBtn = this._btn('[', () => this._applyCurrentAsStart());
        this._clipToolbarStartBtn.classList.add('vs-veditor-btn-icon');
        this._clipToolbarStartBtn.title = '선택한 편집 구간의 시작을 현재 재생 위치로 맞춤 (단축키: [)';
        this._clipToolbarStartBtn.setAttribute('aria-label', '선택한 편집 구간의 시작을 현재 재생 위치로 맞춤');
        this._clipToolbarEndBtn = this._btn(']', () => this._applyCurrentAsEnd());
        this._clipToolbarEndBtn.classList.add('vs-veditor-btn-icon');
        this._clipToolbarEndBtn.title = '선택한 편집 구간의 끝을 현재 재생 위치로 맞춤 (단축키: ])';
        this._clipToolbarEndBtn.setAttribute('aria-label', '선택한 편집 구간의 끝을 현재 재생 위치로 맞춤');
        tbr1.appendChild(this._clipToolbarAddBtn);
        tbr1.appendChild(this._clipToolbarStartBtn);
        tbr1.appendChild(this._clipToolbarEndBtn);
        this._clipToolbarFitBtn = this._btn('[<>]', () => {
            const clips = this._getClips();
            const i = this._selectedClipIndex;
            if (!clips[i]) return;
            this._fitTimelineToClipIndex(i);
        });
        this._clipToolbarFitBtn.classList.add('vs-veditor-btn-icon');
        this._clipToolbarFitBtn.title = '선택한 편집 구간에 타임라인 맞춤';
        this._clipToolbarFitBtn.setAttribute('aria-label', '선택한 편집 구간에 타임라인 맞춤');
        this._clipToolbarPlaySelBtn = this._btn('편집 구간 재생', () => {
            if (this._playAllMode) return;
            const clips = this._getClips();
            const i = this._selectedClipIndex;
            const c = clips[i];
            if (!c) return;
            if (this._playSingleClipMode) {
                this._stopPlayAll(true);
                return;
            }
            this._stopPlayAll(false);
            this._playSingleClipMode = true;
            this._playbackClipEntered = false;
            this._playSingleClipBeginSec = c.begin;
            this._playSingleClipEndSec = c.end;
            this._playAllSeekGraceUntil = performance.now() + 200;
            this._plSeekGlobal(c.begin);
            const v = this._getVideo();
            if (v) v.play().catch(() => {});
            this._syncUiFromState();
            this._updateClipToolbarSelectionActions();
            const tick = () => {
                if (!this._playSingleClipMode || !this._panelVisible) return;
                if (this._playAllSeekGraceUntil && performance.now() < this._playAllSeekGraceUntil) {
                    this._playAllRaf = requestAnimationFrame(tick);
                    return;
                }
                this._playAllSeekGraceUntil = 0;
                this._refreshCachedGlobalPlaybackTime();
                const t = this._cachedGlobalPlaybackSec;
                const begin = this._playSingleClipBeginSec;
                const end = this._playSingleClipEndSec;
                if (SoopVeditorReplacement.ClipBoundaryPlayback.advance(this, t, begin, end) === 'segment_end') {
                    this._stopPlayAll(true);
                    return;
                }
                this._playAllRaf = requestAnimationFrame(tick);
            };
            this._playAllRaf = requestAnimationFrame(tick);
        });
        this._clipToolbarDupBtn = this._btn('복제', () => {
            if (!this._getClips()[this._selectedClipIndex]) return;
            this._duplicateSelectedClip();
        });
        this._clipToolbarDupBtn.title = '선택한 편집 구간 복제';
        this._clipToolbarDupBtn.setAttribute('aria-label', '선택한 편집 구간 복제');
        this._clipToolbarDelBtn = this._btn('삭제', () => {
            const clips = this._getClips();
            const i = this._selectedClipIndex;
            if (!clips[i]) return;
            this._recordClipUndo();
            this._clipRemove(i);
            this._ensureSelectedClipIndex();
            this._syncUiFromState();
        });
        this._clipToolbarDelBtn.title = '선택한 편집 구간 삭제';
        this._clipToolbarDelBtn.setAttribute('aria-label', '선택한 편집 구간 삭제');
        tbr1.appendChild(this._clipToolbarFitBtn);
        tbr1.appendChild(this._clipToolbarPlaySelBtn);
        tbr1.appendChild(this._clipToolbarDupBtn);
        tbr1.appendChild(this._clipToolbarDelBtn);
        this._playbackSpeedSelect = document.createElement('select');
        this._playbackSpeedSelect.className = 'vs-veditor-playback-speed';
        this._playbackSpeedSelect.title = '재생 배속';
        this._playbackSpeedSelect.setAttribute('aria-label', '재생 배속');
        for (const sp of SoopVeditorReplacement.PLAYBACK_SPEED_OPTIONS) {
            const op = document.createElement('option');
            op.value = String(sp);
            op.textContent = `${sp}x`;
            this._playbackSpeedSelect.appendChild(op);
        }
        this._playbackSpeedSelect.value = '1';
        this._playbackSpeedSelect.addEventListener('change', () => {
            const r = parseFloat(this._playbackSpeedSelect?.value || '1');
            this._setPlaybackSpeedFromUi(r);
            this._playbackSpeedSelect?.blur();
        });
        tbr1.appendChild(this._playbackSpeedSelect);
        titleRow.insertBefore(tbr1, titleActions);
        const tbr2 = document.createElement('div');
        tbr2.className = 'vs-veditor-clip-toolbar-row';
        this._clipToolbarTestBtn = this._btn('테스트 시작', () => {
            if (this._playAllMode) {
                this._stopPlayAll();
            } else {
                this._playAllClips();
            }
        });
        this._clipToolbarTestBtn.classList.add('vs-veditor-btn-danger');
        tbr2.appendChild(this._clipToolbarTestBtn);
        this._clipToolbarPublishBtn = this._btn('게시하기', () => this._onPublishButtonClick());
        this._clipToolbarPublishBtn.classList.add('vs-veditor-btn-primary');
        this._clipPlayStatusEl = document.createElement('span');
        this._clipPlayStatusEl.className = 'vs-veditor-clip-play-status';
        this._clipPlayStatusEl.textContent = '';
        this._clipPlayStatusEl.style.display = 'none';
        tbr2.appendChild(this._clipPlayStatusEl);
        this._clipTotalEl = document.createElement('span');
        this._clipTotalEl.className = 'vs-veditor-clip-total';
        this._clipTotalEl.textContent = this._formatClipTotalSumLabel(0);
        tbr2.appendChild(this._clipTotalEl);
        tbr2.appendChild(this._clipToolbarPublishBtn);
        clipToolbar.appendChild(tbr2);

        const clipScroll = document.createElement('div');
        clipScroll.className = 'vs-veditor-clip-scroll';
        this._clipListScrollEl = clipScroll;
        this._bindClipListScrollDelegationOnce();
        clipCol.appendChild(clipToolbar);
        clipCol.appendChild(clipScroll);

        const seqCol = document.createElement('div');
        seqCol.className = 'vs-veditor-seq-col';
        seqCol.appendChild(timelineDock);

        const timelinePanel = document.createElement('div');
        timelinePanel.className = 'vs-veditor-overlay-panel vs-veditor-timeline-panel';
        timelinePanel.setAttribute('role', 'region');
        timelinePanel.setAttribute('aria-label', '타임라인');
        timelinePanel.appendChild(titleRow);
        timelinePanel.appendChild(seqCol);

        const clipPanelHead = document.createElement('div');
        clipPanelHead.className = 'vs-veditor-clip-panel-head';
        const clipPanelTitle = document.createElement('span');
        clipPanelTitle.textContent = '편집 구간 리스트';
        const clipPanelHeadActions = document.createElement('div');
        clipPanelHeadActions.className = 'vs-veditor-clip-panel-head-actions';
        this._timelineCopyActionSel = document.createElement('select');
        this._timelineCopyActionSel.className = 'vs-veditor-playback-speed vs-veditor-timeline-copy-action';
        this._timelineCopyActionSel.title = '모든 편집 구간을 댓글 타임라인 형식으로 복사 (옵션을 선택하면 즉시 복사됩니다.)';
        this._timelineCopyActionSel.setAttribute('aria-label', '모든 편집 구간을 댓글 타임라인 형식으로 복사 (옵션을 선택하면 즉시 복사됩니다.)');
        const promptVal = SoopVeditorReplacement.TIMELINE_COPY_PROMPT_VALUE;
        this._timelineCopyActionSel.innerHTML =
            `<option value="${promptVal}">타임라인 복사(선택하세요)</option>` +
            '<option value="none">이름을 제외하여 복사</option>' +
            '<option value="prefix">이름을 앞에 붙여 복사</option>' +
            '<option value="suffix">이름을 뒤에 붙여 복사</option>';
        this._timelineCopyActionSel.value = promptVal;
        this._timelineCopyActionSel.addEventListener('change', async () => {
            const sel = this._timelineCopyActionSel;
            if (!sel) return;
            if (sel.value === SoopVeditorReplacement.TIMELINE_COPY_PROMPT_VALUE) {
                sel.blur();
                return;
            }
            try {
                await this._copyClipsAsTimelineComment();
            } finally {
                sel.value = SoopVeditorReplacement.TIMELINE_COPY_PROMPT_VALUE;
                sel.blur();
            }
        });
        clipPanelHeadActions.appendChild(this._timelineCopyActionSel);
        this._clipPanelToggleBtn = this._btn('접기', () => this._toggleClipPanelCollapsed());
        this._clipPanelToggleBtn.classList.add('vs-veditor-clip-panel-toggle');
        clipPanelHeadActions.appendChild(this._clipPanelToggleBtn);
        clipPanelHead.appendChild(clipPanelTitle);
        clipPanelHead.appendChild(clipPanelHeadActions);

        const clipPanel = document.createElement('div');
        clipPanel.className = 'vs-veditor-overlay-panel vs-veditor-clip-panel';
        clipPanel.setAttribute('role', 'region');
        clipPanel.setAttribute('aria-label', '편집 구간 목록');
        clipPanel.appendChild(clipPanelHead);
        clipPanel.appendChild(clipCol);
        this._clipPanelEl = clipPanel;

        const dockRow = document.createElement('div');
        dockRow.className = 'vs-veditor-dock-row';
        dockRow.appendChild(timelinePanel);
        dockRow.appendChild(clipPanel);
        wrap.appendChild(dockRow);

        this._rulerHoverTipEl = document.createElement('div');
        this._rulerHoverTipEl.className = 'vs-veditor-ruler-hover-tip';
        this._rulerHoverTipEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(this._rulerHoverTipEl);

        wrap.addEventListener('change', this._onClipListChange);
        wrap.addEventListener(
            'keydown',
            (e) => {
                if (e.key !== 'Enter') return;
                const t = e.target;
                if (!(t instanceof HTMLElement)) return;
                if (t.closest('input, textarea, select, [contenteditable="true"]') == null) return;
                if (!(t instanceof HTMLInputElement)) return;
                if (!t.classList.contains('vs-veditor-clip-name') && !t.classList.contains('vs-veditor-clip-time-inp'))
                    return;
                if (this._isClipListBusy()) return;
                e.preventDefault();
                e.stopPropagation();
                t.blur();
            },
            true
        );

        const publishModal = document.createElement('div');
        publishModal.className = 'vs-veditor-publish-modal';
        const publishCard = document.createElement('div');
        publishCard.className = 'vs-veditor-publish-card';
        const publishHead = document.createElement('div');
        publishHead.className = 'vs-veditor-publish-head';
        const publishTitle = document.createElement('div');
        publishTitle.textContent = '게시하기';
        const publishClose = document.createElement('button');
        publishClose.type = 'button';
        publishClose.className = 'vs-veditor-publish-close';
        publishClose.textContent = '×';
        publishClose.addEventListener('click', () => this._closePublishModal());
        publishHead.appendChild(publishTitle);
        publishHead.appendChild(publishClose);
        publishCard.appendChild(publishHead);
        const grid = document.createElement('div');
        grid.className = 'vs-veditor-publish-grid';
        const row = (label, required, inputEl) => {
            const box = document.createElement('div');
            const lab = document.createElement('label');
            lab.className = 'vs-veditor-publish-label';
            lab.textContent = label;
            if (required) {
                const req = document.createElement('span');
                req.className = 'vs-veditor-publish-required';
                req.textContent = '*';
                lab.appendChild(req);
            }
            box.appendChild(lab);
            box.appendChild(inputEl);
            return box;
        };
        this._publishBoardSel = document.createElement('select');
        this._publishBoardSel.className = 'vs-veditor-publish-select';
        this._publishVodCategorySel = document.createElement('select');
        this._publishVodCategorySel.className = 'vs-veditor-publish-select';
        this._publishVodCategorySubSel = document.createElement('select');
        this._publishVodCategorySubSel.className = 'vs-veditor-publish-select';
        this._publishVodCategorySel.addEventListener('change', () => {
            this._fillVodCategorySubOptionsByMain(this._publishVodCategorySel?.value || '');
        });
        this._publishLangSel = document.createElement('select');
        this._publishLangSel.className = 'vs-veditor-publish-select';
        this._publishTitleInp = document.createElement('input');
        this._publishTitleInp.type = 'text';
        this._publishTitleInp.className = 'vs-veditor-publish-input vs-veditor-publish-title';
        this._publishTitleInp.placeholder = '제목을 입력해주세요.';
        this._publishContentsInp = document.createElement('textarea');
        this._publishContentsInp.className = 'vs-veditor-publish-textarea';
        this._publishContentsInp.placeholder = '내용을 입력해주세요.';
        grid.appendChild(row('게시판 선택', true, this._publishBoardSel));
        const catWrap = document.createElement('div');
        catWrap.className = 'vs-veditor-publish-category-row';
        catWrap.appendChild(this._publishVodCategorySel);
        catWrap.appendChild(this._publishVodCategorySubSel);
        grid.appendChild(row('VOD 카테고리 선택', true, catWrap));
        grid.appendChild(row('언어 선택', true, this._publishLangSel));
        grid.appendChild(row('제목', true, this._publishTitleInp));
        grid.appendChild(row('내용', false, this._publishContentsInp));
        publishCard.appendChild(grid);
        const desc = document.createElement('div');
        desc.className = 'vs-veditor-publish-desc';
        desc.textContent =
            '* 표시는 필수 입력입니다.\n* 본 영상에서 발생하는 별풍선 및 애드벌룬 수익은 방송한 스트리머에게 전달됩니다.';
        publishCard.appendChild(desc);
        this._publishErrEl = document.createElement('div');
        this._publishErrEl.className = 'vs-veditor-publish-err';
        publishCard.appendChild(this._publishErrEl);
        const actions = document.createElement('div');
        actions.className = 'vs-veditor-publish-actions';
        const cancelBtn = this._btn('취소', () => this._closePublishModal());
        cancelBtn.classList.add('vs-veditor-publish-cancel');
        this._publishSubmitBtn = this._btn('저장', () => this._submitPublishModal());
        this._publishSubmitBtn.classList.add('vs-veditor-publish-submit');
        actions.appendChild(cancelBtn);
        actions.appendChild(this._publishSubmitBtn);
        publishCard.appendChild(actions);
        publishModal.appendChild(publishCard);
        publishModal.addEventListener('click', (e) => {
            if (e.target === publishModal) this._closePublishModal();
        });
        wrap.appendChild(publishModal);
        this._publishModalEl = publishModal;
    }

    /**
     * 오버레이 마운트 직후 플레이헤드·타임라인 입력·리사이즈 등 컨트롤을 연결한다.
     */
    _veditorBindOverlayControls() {
        this._initPlayheadFromVideo();
        this._bindPlayheadAndKeyboard();
        this._bindTimelineWheel();
        this._bindTimelineViewportScrollClamp();
        this._bindTimelineCustomScrollbar();
        this._bindViewportResize();
        this._bindRulerHoverTimeTip();
        this._ensureVideoPlayheadListeners();
        this._updateClipPanelCollapseUi();
        this._syncOfficialVeditorButtonState();
    }

    /** WheelEvent.deltaY 를 대략 픽셀 단위로 통일 (마우스/트랙패드·deltaMode 차이 완화). */
    _wheelDeltaYPixels(ev, viewportEl) {
        let dy = ev.deltaY;
        if (ev.deltaMode === WheelEvent.DOM_DELTA_LINE) dy *= 16;
        else if (ev.deltaMode === WheelEvent.DOM_DELTA_PAGE) dy *= Math.max(viewportEl.clientHeight, 1);
        return dy;
    }

    // 타임라인 뷰포트에 휠 가로 스크롤(Alt 시 줌)을 붙이고 끝에 페인트를 요청한다.
    _bindTimelineWheel() {
        const vp = this._timelineViewport;
        if (!vp) return;
        vp.addEventListener(
            'wheel',
            (ev) => {
                const total = this._getTotalDurationSec();
                const rect = vp.getBoundingClientRect();
                const relX = ev.clientX - rect.left;

                ev.preventDefault();
                if (!ev.altKey) {
                    vp.scrollLeft += this._wheelDeltaYPixels(ev, vp);
                    this._clampViewportScroll(
                        this._getTimelineInnerWidthPx(total, this._pixelsPerSecond)
                    );
                    this._requestTimelinePaint();
                    return;
                }
                const minPps = this._minPpsToFitViewport(total);
                const pps = this._pixelsPerSecond;
                const timeUnder = (vp.scrollLeft + relX) / pps;
                const dy = this._wheelDeltaYPixels(ev, vp);
                const zoomIn = dy < 0;
                const k = SoopVeditorReplacement.ZOOM_WHEEL_EXP_PER_PX;
                const factor = Math.exp(-dy * k);
                let newPps = pps * factor;
                newPps = this._clampPps(newPps, total);
                if (zoomIn && newPps <= minPps * 1.000001) {
                    newPps = this._clampPps(minPps * 1.002, total);
                }
                this._pixelsPerSecond = newPps;
                const innerW = this._getTimelineInnerWidthPx(total, newPps);
                if (this._timelineInner) this._timelineInner.style.width = `${innerW}px`;
                const maxScroll = Math.max(0, innerW - vp.clientWidth);
                let nextScroll = timeUnder * newPps - relX;
                if (!zoomIn && newPps <= minPps * 1.0001) {
                    nextScroll = 0;
                }
                vp.scrollLeft = maxScroll <= 0 ? 0 : Math.max(0, Math.min(nextScroll, maxScroll));
                // scrollLeft 가 0→0 으로 같으면 scroll 이벤트가 안 나와 `_scheduleViewportScrollVisualSync` 가 안 돈다. 썸 너비는 innerW/pps 에 따라 바로 맞춘다.
                this._updateTimelineScrollBarUI();
                this._requestTimelinePaint();
            },
            { passive: false }
        );
    }

    // 자식(재생 헤드·눈금 텍스트)이 밖으로 삐져나가면 scrollWidth 가 커져 슬라이더가 과하게 길어진다.
    // overflow:hidden 으로 막되, 일부 브라우저/상황에서 scrollLeft 가 논리 범위를 넘으면 여기서 클램프한다.
    _bindTimelineViewportScrollClamp() {
        const vp = this._timelineViewport;
        if (!vp) return;
        vp.addEventListener('scroll', () => {
            if (!this._timelineInner) return;
            this._scheduleViewportScrollVisualSync();
        });
    }

    /** 스크롤/썸 조작 시 눈금·스크롤바를 rAF 1회로만 갱신 (연속 scroll 이벤트 합침). */
    _scheduleViewportScrollVisualSync() {
        if (this._viewportScrollVisualRaf != null) return;
        this._viewportScrollVisualRaf = requestAnimationFrame(() => {
            this._viewportScrollVisualRaf = null;
            if (!this._timelineInner || !this._panelVisible) return;
            const total = this._getTotalDurationSec();
            const innerW = this._getTimelineInnerWidthPx(total, this._pixelsPerSecond);
            const vport = this._timelineViewport;
            if (vport) {
                const maxScroll = Math.max(0, innerW - vport.clientWidth);
                if (maxScroll <= 0) vport.scrollLeft = 0;
                else vport.scrollLeft = Math.max(0, Math.min(vport.scrollLeft, maxScroll));
            }
            this._updateTimelineScrollBarUI();
            const pps = this._pixelsPerSecond;
            this._renderRuler(total, pps);
        });
    }

    /** `innerW`·`scrollLeft`에 맞춰 커스텀 가로 스크롤 썸 위치·너비를 맞춘다. */
    _updateTimelineScrollBarUI() {
        const vp = this._timelineViewport;
        const track = this._timelineScrollTrackEl;
        const thumb = this._timelineScrollThumbEl;
        const wrap = this._timelineScrollBarEl;
        if (!vp || !track || !thumb || !wrap) return;
        const total = this._getTotalDurationSec();
        const innerW = this._getTimelineInnerWidthPx(total, this._pixelsPerSecond);
        const cw = Math.max(vp.clientWidth, 1);
        const maxScroll = Math.max(0, innerW - cw);
        const trackW = track.clientWidth;
        if (trackW <= 1) return;

        const minT = SoopVeditorReplacement.TIMELINE_SCROLL_THUMB_MIN_PX;

        if (maxScroll <= 0) {
            wrap.classList.add('vs-disabled');
            const w = Math.max(0, trackW - 4);
            thumb.style.width = `${w}px`;
            thumb.style.left = '2px';
            thumb.setAttribute('aria-valuemin', '0');
            thumb.setAttribute('aria-valuemax', '0');
            thumb.setAttribute('aria-valuenow', '0');
            return;
        }
        wrap.classList.remove('vs-disabled');
        const thumbW = Math.max(minT, (cw / innerW) * trackW);
        const maxThumbLeft = Math.max(0, trackW - thumbW);
        const ratio = maxScroll > 0 ? vp.scrollLeft / maxScroll : 0;
        thumb.style.width = `${thumbW}px`;
        thumb.style.left = `${ratio * maxThumbLeft}px`;
        thumb.setAttribute('aria-valuemin', '0');
        thumb.setAttribute('aria-valuemax', String(Math.round(maxScroll)));
        thumb.setAttribute('aria-valuenow', String(Math.round(vp.scrollLeft)));
    }

    // 네이티브 스크롤바 대신 트랙 클릭·썸 드래그로 `scrollLeft`를 맞춘다.
    _bindTimelineCustomScrollbar() {
        const track = this._timelineScrollTrackEl;
        const thumb = this._timelineScrollThumbEl;
        if (!track || !thumb) return;

        thumb.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            const vport = this._timelineViewport;
            if (!vport) return;
            const total = this._getTotalDurationSec();
            const innerW = this._getTimelineInnerWidthPx(total, this._pixelsPerSecond);
            const cw = Math.max(vport.clientWidth, 1);
            const maxScroll = Math.max(0, innerW - cw);
            if (maxScroll <= 0) return;
            const trackW = track.clientWidth;
            const thumbW = thumb.clientWidth || SoopVeditorReplacement.TIMELINE_SCROLL_THUMB_MIN_PX;
            const maxThumbLeft = Math.max(0, trackW - thumbW);
            this._scrollThumbDrag = {
                pointerId: e.pointerId,
                startX: e.clientX,
                startScroll: vport.scrollLeft,
                maxScroll,
                maxThumbLeft,
            };
            try {
                thumb.setPointerCapture(e.pointerId);
            } catch (_) {
                /* ignore */
            }
        });

        thumb.addEventListener('pointermove', (e) => {
            if (!this._scrollThumbDrag || e.pointerId !== this._scrollThumbDrag.pointerId) return;
            e.preventDefault();
            this._applyTimelineScrollThumbDrag(e.clientX);
        });

        thumb.addEventListener('pointerup', (e) => {
            this._onTimelineScrollThumbUp(e);
        });
        thumb.addEventListener('pointercancel', (e) => {
            this._onTimelineScrollThumbUp(e);
        });

        track.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            const t = e.target;
            if (t instanceof Node && thumb.contains(t)) return;
            e.preventDefault();
            const vport = this._timelineViewport;
            if (!vport) return;
            const total = this._getTotalDurationSec();
            const innerW = this._getTimelineInnerWidthPx(total, this._pixelsPerSecond);
            const cw = Math.max(vport.clientWidth, 1);
            const maxScroll = Math.max(0, innerW - cw);
            if (maxScroll <= 0) return;
            const rect = track.getBoundingClientRect();
            const trackW = track.clientWidth || rect.width;
            const thumbW = thumb.clientWidth || SoopVeditorReplacement.TIMELINE_SCROLL_THUMB_MIN_PX;
            const maxThumbLeft = Math.max(0, trackW - thumbW);
            const clickX = e.clientX - rect.left;
            let newLeft = clickX - thumbW / 2;
            newLeft = Math.max(0, Math.min(newLeft, maxThumbLeft));
            const r = maxThumbLeft > 0 ? newLeft / maxThumbLeft : 0;
            vport.scrollLeft = r * maxScroll;
            this._clampViewportScroll(innerW);
            this._scheduleViewportScrollVisualSync();
        });
    }

    _applyTimelineScrollThumbDrag(clientX) {
        if (!this._scrollThumbDrag || !this._timelineViewport) return;
        const { startX, startScroll, maxScroll, maxThumbLeft } = this._scrollThumbDrag;
        if (maxThumbLeft <= 0 || maxScroll <= 0) return;
        const dx = clientX - startX;
        const scrollPerPx = maxScroll / maxThumbLeft;
        let sl = startScroll + dx * scrollPerPx;
        sl = Math.max(0, Math.min(sl, maxScroll));
        this._timelineViewport.scrollLeft = sl;
        this._scheduleViewportScrollVisualSync();
    }

    /** @param {PointerEvent} [e] */
    _onTimelineScrollThumbUp(e) {
        const thumb = this._timelineScrollThumbEl;
        const d = this._scrollThumbDrag;
        if (d && thumb) {
            const releaseId = e && e.pointerId === d.pointerId ? e.pointerId : d.pointerId;
            try {
                if (typeof thumb.hasPointerCapture === 'function' && thumb.hasPointerCapture(releaseId)) {
                    thumb.releasePointerCapture(releaseId);
                }
            } catch (_) {
                /* ignore */
            }
        }
        this._scrollThumbDrag = null;
    }

    // 타임라인 너비 변경 시 `_syncUiFromState`로 눈금·줌 하한을 다시 맞춘다.
    _bindViewportResize() {
        const vp = this._timelineViewport;
        if (!vp || typeof ResizeObserver === 'undefined') return;
        this._viewportResizeObs = new ResizeObserver(() => {
            this._syncUiFromState();
        });
        this._viewportResizeObs.observe(vp);
    }

    // 눈금 영역 호버 시 화면 좌표에 맞는 시각 툴팁을 띄운다 (미세 편집 가이드).
    _bindRulerHoverTimeTip() {
        const vp = this._timelineViewport;
        const tip = this._rulerHoverTipEl;
        if (!vp || !tip) return;

        const hide = () => {
            tip.style.display = 'none';
        };

        const flushRulerTip = () => {
            this._rulerTipRaf = null;
            const e = this._rulerTipPendingEv;
            this._rulerTipPendingEv = null;
            if (!e) return;
            const r = vp.getBoundingClientRect();
            const ly = e.clientY - r.top;
            const lx = e.clientX - r.left;
            if (ly < 0 || ly > SoopVeditorReplacement.RULER_HEIGHT_PX || lx < 0 || lx > r.width) {
                hide();
                return;
            }
            const total = this._getTotalDurationSec();
            const sec = this._clientXToTimelineSec(e.clientX, total);
            tip.textContent = this._formatHoverTimelineSec(sec);
            tip.style.display = 'block';
            const tw = tip.offsetWidth || 100;
            const th = tip.offsetHeight || 22;
            let left = e.clientX + 12;
            let top = e.clientY - th - 8;
            if (left + tw > window.innerWidth - 4) left = window.innerWidth - tw - 4;
            if (left < 4) left = 4;
            if (top < 4) top = e.clientY + 16;
            if (top + th > window.innerHeight - 4) top = window.innerHeight - th - 4;
            tip.style.left = `${left}px`;
            tip.style.top = `${top}px`;
        };

        vp.addEventListener('mousemove', (e) => {
            this._rulerTipPendingEv = e;
            if (this._rulerTipRaf != null) return;
            this._rulerTipRaf = requestAnimationFrame(flushRulerTip);
        });

        vp.addEventListener('mouseleave', () => {
            this._rulerTipPendingEv = null;
            if (this._rulerTipRaf != null) {
                cancelAnimationFrame(this._rulerTipRaf);
                this._rulerTipRaf = null;
            }
            hide();
        });
    }

    // 호버 툴팁에 쓸 초 값을 사람이 읽기 쉬운 문자열로 만든다 (분·초·소수).
    _formatHoverTimelineSec(sec) {
        if (!Number.isFinite(sec)) return '';
        const s = Math.max(0, sec);
        if (s < 60) return `${s.toFixed(3)} s`;
        if (s < 3600) {
            const m = Math.floor(s / 60);
            const rem = s - m * 60;
            return `${m}:${String(Math.floor(rem)).padStart(2, '0')}.${(rem % 1).toFixed(3).slice(2)}`;
        }
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const rem = s - h * 3600 - m * 60;
        return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(rem)).padStart(2, '0')}.${(rem % 1).toFixed(3).slice(2)}`;
    }

    // `<video>`가 바뀌면 메타데이터·재생 이벤트로 헤드 RAF와 UI 동기화를 건다 (동적 플레이어 대응).
    _ensureVideoPlayheadListeners() {
        const v = this._getVideo();
        if (!v || this._playheadVideoBound === v) return;
        this._playheadVideoBound = v;
        v.addEventListener('loadedmetadata', () => {
            this._initPlayheadFromVideo();
            this._syncUiFromState();
        });
        v.addEventListener('playing', () => this._startPlayheadRaf());
        v.addEventListener('pause', this._onVideoPauseSeekForPlayhead);
        v.addEventListener('seeked', this._onVideoPauseSeekForPlayhead);
        v.addEventListener('ended', this._onVideoPauseSeekForPlayhead);
    }

    // 패널이 열려 있을 때 매 프레임(rAF) ghost·video 재생 시각을 따라 노란 헤드를 갱신한다 (일시정지·시크 포함).
    _startPlayheadRaf() {
        if (!this._panelVisible || !this._playheadEl || this._playheadDragging) return;
        if (this._playheadRafId != null) return;
        this._playheadRafId = requestAnimationFrame(this._tickPlayheadPanelSync);
    }

    // 재생 헤드 RAF를 취소해 루프를 멈춘다 (패널 닫기·드래그 시작).
    _stopPlayheadRaf() {
        if (this._playheadRafId != null) {
            cancelAnimationFrame(this._playheadRafId);
            this._playheadRafId = null;
        }
    }

    _tickPlayheadPanelSync() {
        this._playheadRafId = null;
        if (!this._panelVisible || !this._playheadEl || this._playheadDragging) return;
        this._refreshCachedGlobalPlaybackTime();
        const total = this._getTotalDurationSec();
        this._playheadSec = Math.max(0, Math.min(total, this._computePlayheadDisplaySec(total)));
        this._updatePlayheadVisual(total);
        this._updateSequenceHeaderUi(total);
        if (this._panelVisible && !this._playheadDragging) {
            this._playheadRafId = requestAnimationFrame(this._tickPlayheadPanelSync);
        }
    }

    // 총 길이와 현재 재생 위치로 재생 헤드 초기 위치를 맞춘다 (메타데이터 로드·패널 마운트 직후).
    _initPlayheadFromVideo() {
        this._resetPlayheadGhostExtrap();
        const total = this._getTotalDurationSec();
        this._refreshCachedGlobalPlaybackTime();
        this._playheadSec = Math.max(0, Math.min(total, this._cachedGlobalPlaybackSec));
        this._updatePlayheadVisual(total);
    }

    // 비디오 이벤트 시 한 프레임 더 빨리 헤드를 맞춤 (rAF 와 병행; 패널 닫힘이면 무시).
    _onVideoPauseSeekForPlayhead() {
        if (this._playheadDragging || !this._panelVisible || !this._playheadEl) return;
        this._resetPlayheadGhostExtrap();
        const total = this._getTotalDurationSec();
        this._refreshCachedGlobalPlaybackTime();
        this._playheadSec = Math.max(0, Math.min(total, this._cachedGlobalPlaybackSec));
        this._updatePlayheadVisual(total);
    }

    // `_playheadSec`을 총 길이 안으로 클램프하고 헤드 위치·ARIA 값을 갱신한다 (거의 모든 타임라인 갱신 경로).
    _updatePlayheadVisual(totalSec) {
        if (!this._playheadEl) return;
        const total = totalSec !== undefined ? totalSec : this._getTotalDurationSec();
        const pps = this._pixelsPerSecond;
        const t = Math.max(0, Math.min(total, this._playheadSec));
        this._playheadSec = t;
        this._playheadEl.style.left = `${t * pps}px`;
        const max = Math.max(0, total);
        this._playheadEl.setAttribute('aria-valuemin', '0');
        this._playheadEl.setAttribute('aria-valuemax', String(max));
        this._playheadEl.setAttribute('aria-valuenow', String(Math.round(t * 1000) / 1000));
    }

    // 현재 헤드 시각으로 실제 VOD 재생을 옮기고 헤드 표시를 맞춘다 (눈금 클릭·헤드 드래그 종료 시).
    _seekVideoToPlayhead(totalSec) {
        const total = totalSec !== undefined ? totalSec : this._getTotalDurationSec();
        const t = Math.max(0, Math.min(total, this._playheadSec));
        this._plSeekGlobal(t);
        this._updatePlayheadVisual(total);
    }

    // 화면 X좌표를 타임라인 상의 초 단위 시각으로 변환한다 (눈금 클릭·드래그·툴팁).
    _clientXToTimelineSec(clientX, totalSec) {
        const vp = this._timelineViewport;
        if (!vp) return this._playheadSec;
        const rect = vp.getBoundingClientRect();
        const x = clientX - rect.left + vp.scrollLeft;
        const total = totalSec !== undefined ? totalSec : this._getTotalDurationSec();
        const pps = this._pixelsPerSecond;
        return Math.max(0, Math.min(total, x / pps));
    }

    // 눈금 클릭으로 시크·헤드 드래그(끝에서만 시크)·키보드 단축키(V/C 등)를 연결한다.
    _bindPlayheadAndKeyboard() {
        const vp = this._timelineViewport;
        const ph = this._playheadEl;
        if (!vp || !ph) return;

        vp.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('.vs-veditor-playhead')) return;
            if (!e.target.closest('.vs-veditor-ruler')) return;
            e.preventDefault();
            const total = this._getTotalDurationSec();
            this._playheadSec = this._clientXToTimelineSec(e.clientX, total);
            this._seekVideoToPlayhead(total);
        });

        ph.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            this._playheadDragging = true;
            this._stopPlayheadRaf();
            const total = this._getTotalDurationSec();
            this._playheadSec = this._clientXToTimelineSec(e.clientX, total);
            this._updatePlayheadVisual(total);
            document.addEventListener('mousemove', this._onPlayheadPointerMove);
            document.addEventListener('mouseup', this._onPlayheadPointerUp);
        });

        window.addEventListener('keydown', this._onPlayheadKeydown, true);
    }

    // 헤드 드래그 중에는 시각만 갱신하고, seek 는 pointerup 에서 한 번만 보낸다.
    _onPlayheadPointerMove(e) {
        if (!this._playheadDragging) return;
        const total = this._getTotalDurationSec();
        this._playheadSec = this._clientXToTimelineSec(e.clientX, total);
        this._updatePlayheadVisual(total);
    }

    // 헤드 드래그 종료 시 seek 1회 후 리스너 제거.
    _onPlayheadPointerUp() {
        if (!this._playheadDragging) return;
        document.removeEventListener('mousemove', this._onPlayheadPointerMove);
        document.removeEventListener('mouseup', this._onPlayheadPointerUp);
        this._playheadDragging = false;
        const total = this._getTotalDurationSec();
        this._seekVideoToPlayhead(total);
        this._resetPlayheadGhostExtrap();
        this._startPlayheadRaf();
    }

    // 패널이 열린 상태에서 V/C(도구), [/](편집 구간 경계←현재), {/}(재생→편집 구간 경계), Ctrl+D·Ctrl+Z·Delete 단축키를 처리한다.
    _onPlayheadKeydown(e) {
        if (!this._panelVisible) return;
        const t = e.target;
        if (!(t instanceof HTMLElement)) return;
        if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === '[' || e.key === ']' || e.key === '{' || e.key === '}')) {
            if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
            if (this._isClipListBusy()) return;
            e.preventDefault();
            e.stopPropagation();
            if (e.key === '[') {
                this._applyCurrentAsStart();
                return;
            }
            if (e.key === ']') {
                this._applyCurrentAsEnd();
                return;
            }
            if (e.key === '{') {
                this._seekPlaybackToSelectedClipBoundary(false);
                return;
            }
            this._seekPlaybackToSelectedClipBoundary(true);
            return;
        }
        if (!e.ctrlKey && !e.metaKey && (e.key === 'v' || e.key === 'V')) {
            if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
            e.preventDefault();
            e.stopPropagation();
            this._setTimelineToolMode('select');
            return;
        }
        if (!e.ctrlKey && !e.metaKey && (e.key === 'c' || e.key === 'C')) {
            if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
            e.preventDefault();
            e.stopPropagation();
            this._setTimelineToolMode('cut');
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
            if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
            if (this._isClipListBusy()) return;
            e.preventDefault();
            e.stopPropagation();
            this._duplicateSelectedClip();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
            if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
            if (this._isClipListBusy()) return;
            e.preventDefault();
            e.stopPropagation();
            const snapshot = this._clipUndoStack.pop();
            if (snapshot) {
                this._clips = snapshot.clips.map((c) => this._cloneClipForUndo(c));
                this._selectedClipIndex = Number.isFinite(snapshot.selectedClipIndex) ? snapshot.selectedClipIndex : 0;
                this._ensureSelectedClipIndex();
                this._syncUiFromState();
            }
            return;
        }
        if (e.key === 'Delete' || e.code === 'Delete') {
            if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
            if (this._isClipListBusy()) return;
            const clips = this._getClips();
            const i = this._selectedClipIndex;
            if (!clips[i]) return;
            e.preventDefault();
            e.stopPropagation();
            this._recordClipUndo();
            this._clipRemove(i);
            this._ensureSelectedClipIndex();
            this._syncUiFromState();
            return;
        }
    }

    // 현재 재생 시각 기준 0분 ~ +20초 기본 편집 구간을 추가한다 (리스트 하단 + 버튼).
    _addDefaultClip() {
        if (this._isClipListBusy()) return;
        const cur = this._cachedGlobalPlaybackSec;
        const total = this._getTotalDurationSec();
        const begin = Math.max(0, cur);
        const end = Math.min(total, cur + 20);
        this._recordClipUndo();
        this._clipAdd(begin, end);
        const clips = this._getClips();
        this._selectedClipIndex = Math.max(0, clips.length - 1);
        this._syncUiFromState();
    }

    // 선택한 편집 구간의 시작을 현재 재생 시각으로 맞추거나, 편집 구간이 없으면 짧은 구간을 새로 만든다.
    _applyCurrentAsStart() {
        if (this._isClipListBusy()) return;
        if (!this._getVideo()) {
            this.warn('video 요소 없음');
            return;
        }
        const clips = this._getClips();
        const cur = this._cachedGlobalPlaybackSec;
        if (clips.length === 0) {
            if (cur < 0) {
                window.alert('시작 시각이 음수가 되어 편집 구간을 만들 수 없습니다.');
                return;
            }
            this._recordClipUndo();
            this._clipAdd(cur, Math.min(cur + 10, this._getTotalDurationSec()));
            this._selectedClipIndex = 0;
        } else {
            const idx = Math.min(this._selectedClipIndex, clips.length - 1);
            const clipRef = clips[idx];
            if (cur > clipRef.end) {
                window.alert('현재 시각이 종점보다 뒤라 시점으로 설정할 수 없습니다.');
                return;
            }
            this._recordClipUndo();
            this._clipUpdate(idx, { begin: cur });
            this._syncSelectionToClip(clipRef);
        }
        this._syncUiFromState();
    }

    /** 선택한 편집 구간의 시작(false)·끝(true) 시각으로 재생·타임라인 헤드를 옮긴다 ({ / } 단축키). */
    _seekPlaybackToSelectedClipBoundary(toEnd) {
        if (this._isClipListBusy()) return;
        const clips = this._getClips();
        if (clips.length === 0) return;
        const idx = Math.min(Math.max(0, this._selectedClipIndex), clips.length - 1);
        const clip = clips[idx];
        if (!clip) return;
        const total = this._getTotalDurationSec();
        const raw = toEnd ? clip.end : clip.begin;
        const t = Math.max(0, Math.min(total, Number(raw)));
        if (!Number.isFinite(t)) return;
        this._playheadSec = t;
        this._resetPlayheadGhostExtrap();
        this._plSeekGlobal(t);
        this._updatePlayheadVisual(total);
        this._updateSequenceHeaderUi(total);
        this._refreshCachedGlobalPlaybackTime();
        this._startPlayheadRaf();
    }

    // 선택한 편집 구간의 끝을 현재 재생 시각으로 맞추거나, 편집 구간이 없으면 짧은 구간을 새로 만든다.
    _applyCurrentAsEnd() {
        if (this._isClipListBusy()) return;
        if (!this._getVideo()) {
            this.warn('video 요소 없음');
            return;
        }
        const clips = this._getClips();
        const cur = this._cachedGlobalPlaybackSec;
        if (clips.length === 0) {
            const begin = cur - 10;
            if (begin < 0) {
                window.alert('시작 시각이 음수가 되어 편집 구간을 만들 수 없습니다.');
                return;
            }
            this._recordClipUndo();
            this._clipAdd(begin, cur);
            this._selectedClipIndex = 0;
        } else {
            const idx = Math.min(this._selectedClipIndex, clips.length - 1);
            const clipRef = clips[idx];
            if (cur < clipRef.begin) {
                window.alert('현재 시각이 시점보다 앞이라 종점으로 설정할 수 없습니다.');
                return;
            }
            this._recordClipUndo();
            this._clipUpdate(idx, { end: cur });
            this._syncSelectionToClip(clipRef);
        }
        this._syncUiFromState();
    }

    // `_selectedClipIndex`가 편집 구간 개수 범위 안에 있게 보정한다 (삭제·정렬 후).
    _ensureSelectedClipIndex() {
        const n = this._getClips().length;
        if (n === 0) {
            this._selectedClipIndex = 0;
            return;
        }
        if (this._selectedClipIndex >= n) this._selectedClipIndex = n - 1;
        if (this._selectedClipIndex < 0) this._selectedClipIndex = 0;
    }

    /** 편집 구간이 없으면 맞춤·복제·삭제 툴바 버튼을 비활성화한다. */
    _updateClipToolbarSelectionActions() {
        const clips = this._getClips();
        const n = clips.length;
        const ok = n > 0 && this._selectedClipIndex >= 0 && this._selectedClipIndex < n;
        const busy = this._isClipListBusy();
        const dis = !ok || busy;
        if (this._clipToolbarFitBtn) this._clipToolbarFitBtn.disabled = !ok;
        for (const b of [this._clipToolbarDupBtn, this._clipToolbarDelBtn]) {
            if (b) b.disabled = dis;
        }
        if (this._clipToolbarAddBtn) this._clipToolbarAddBtn.disabled = busy;
        for (const b of [this._clipToolbarStartBtn, this._clipToolbarEndBtn]) {
            if (b) b.disabled = dis;
        }
        if (this._clipToolbarPlaySelBtn) {
            this._clipToolbarPlaySelBtn.disabled = !ok || this._playAllMode;
            const segLabel = this._playSingleClipMode ? '[■]' : '[▶]';
            this._clipToolbarPlaySelBtn.textContent = segLabel
            this._clipToolbarPlaySelBtn.title = this._playSingleClipMode ? '선택된 편집 구간 정지' : '선택된 편집 구간 재생';
            this._clipToolbarPlaySelBtn.setAttribute('aria-label', segLabel);
        }
        if (this._clipToolbarTestBtn) {
            this._clipToolbarTestBtn.textContent = this._playAllMode ? '테스트 중지' : '테스트 시작';
            this._clipToolbarTestBtn.title = this._playAllMode ? '테스트 중지' : '테스트 시작';
        }
        if (this._timelineCopyActionSel) this._timelineCopyActionSel.disabled = n === 0 || busy;
        if (this._clipToolbarPublishBtn) this._clipToolbarPublishBtn.disabled = busy;
    }

    // 객체 참조로 선택 행을 맞춘 뒤 인덱스 범위를 다시 검증한다 (표 변경·드래그 후).
    _syncSelectionToClip(clipRef) {
        if (clipRef) {
            const i = this._getClips().indexOf(clipRef);
            if (i >= 0) this._selectedClipIndex = i;
        }
        this._ensureSelectedClipIndex();
    }

    /**
     * 다음 프레임에 타임라인을 다시 그린다 (디바운스).
     * @param {boolean} [rulerOnly] true 이면 가로 스크롤 등으로 보이는 눈금 구간만 갱신 (편집 구간·헤드는 생략).
     */
    _requestTimelinePaint(rulerOnly) {
        if (this._wheelPaintRaf) cancelAnimationFrame(this._wheelPaintRaf);
        this._wheelPaintRaf = requestAnimationFrame(() => {
            this._wheelPaintRaf = 0;
            const total = this._getTotalDurationSec();
            const pps = this._pixelsPerSecond;
            this._renderRuler(total, pps);
            if (!rulerOnly) {
                this._renderClipsOnTrack(total, pps);
                this._updatePlayheadVisual(total);
            }
            this._updateTimelineScrollBarUI();
        });
    }

    // --- 타임라인·편집 구간 패널 뷰 동기화 (조율자 `_syncUiFromState`) ---
    // 내부 상태를 기준으로 타임라인 너비·눈금·트랙·표·미리보기·헤드를 전부 동기화한다 (데이터 변경의 단일 진입점).
    _syncUiFromState() {
        this._migrateClipShape();
        this._ensureVideoPlayheadListeners();
        const total = this._getTotalDurationSec();
        this._ensureSelectedClipIndex();
        const vp = this._timelineViewport;
        let initialWindowStartSec = null;
        if (
            this._veditorInitialTimelineZoomPending &&
            this._timelineInner &&
            total > 0 &&
            vp &&
            vp.clientWidth > 0
        ) {
            this._veditorInitialTimelineZoomPending = false;
            this._refreshCachedGlobalPlaybackTime();
            const cur = Math.max(0, Math.min(total, this._cachedGlobalPlaybackSec));
            const start = Math.max(0, cur - 300);
            const end = Math.min(total, cur + 300);
            const span = Math.max(1e-6, end - start);
            this._pixelsPerSecond = this._clampPps(vp.clientWidth / span, total);
            initialWindowStartSec = start;
        }
        this._pixelsPerSecond = this._clampPps(this._pixelsPerSecond, total);
        const pps = this._pixelsPerSecond;
        const innerW = this._getTimelineInnerWidthPx(total, pps);
        if (this._timelineInner) this._timelineInner.style.width = `${innerW}px`;
        if (vp && initialWindowStartSec !== null) {
            vp.scrollLeft = Math.max(0, initialWindowStartSec * pps);
        }
        this._clampViewportScroll(innerW);

        this._renderRuler(total, pps);
        this._renderClipsOnTrack(total, pps);
        this._syncClipList();
        this._updateTimelineToolModeUi();
        this._updateClipToolbarSelectionActions();
        this._updateSequenceHeaderUi(total);
        this._updatePlayheadVisual(total);
        queueMicrotask(() => this._updateTimelineScrollBarUI());
    }

    // 현재 스크롤·줌 기준 보이는 시간 구간 [t0,t1](초)을 여유 패딩 포함해 구한다 (눈금만 그릴 때).
    _getVisibleTimelineRangeSec(total, pps) {
        const vp = this._timelineViewport;
        const sl = vp ? vp.scrollLeft : 0;
        const vw = vp ? Math.max(vp.clientWidth, 1) : 1;
        const padSec = 40 / pps;
        let t0 = Math.max(0, sl / pps - padSec);
        let t1 = Math.min(total, (sl + vw) / pps + padSec);
        if (t1 <= t0) {
            t0 = 0;
            t1 = total;
        }
        return { t0, t1 };
    }

    // 주 눈금 간격에서 보조 눈금 간격(초)을 고른다 (픽셀 간격이 너무 촘촘해지지 않게).
    _minorStepFromMajor(majorStep, pps) {
        if (!Number.isFinite(majorStep) || majorStep <= 0) return 0;
        const MIN_PX = 5;
        for (const n of [10, 5, 4, 2]) {
            const m = majorStep / n;
            if (m * pps >= MIN_PX && m < majorStep - 1e-12) return m;
        }
        return 0;
    }

    // 시각 t가 주 눈금 격자에 거의 걸리는지 본다 (보조 눈금과 겹침 방지).
    _isNearlyOnMajorTick(t, majorStep) {
        if (!Number.isFinite(majorStep) || majorStep <= 0) return false;
        const q = t / majorStep;
        return Math.abs(q - Math.round(q)) < 1e-4;
    }

    // 보이는 구간과 줌에 맞는 주/보조 눈금 간격을 결정한다 (`_renderRuler` 직전).
    _getRulerTickLayout(total, pps) {
        const { t0, t1 } = this._getVisibleTimelineRangeSec(total, pps);
        const span = Math.max(t1 - t0, 1e-6);
        const minStepFromPx = 52 / pps;
        const targetTicks = 10;
        const idealStep = span / targetTicks;
        const rough = Math.max(minStepFromPx, idealStep);
        const majorStep = this._pickEditorRulerStepSec(rough);
        const minorStep = this._minorStepFromMajor(majorStep, pps);
        return { t0, t1, majorStep, minorStep };
    }

    /**
     * @param {number} total
     * @param {number} pps
     */
    _renderRuler(total, pps) {
        if (!this._rulerEl) return;
        const { t0, t1, majorStep, minorStep } = this._getRulerTickLayout(total, pps);

        this._rulerEl.innerHTML = '';

        if (minorStep > 0) {
            let nMin = 0;
            const tMinor0 = Math.floor(t0 / minorStep) * minorStep;
            for (let t = tMinor0; t <= t1 + minorStep * 0.001 && nMin < SoopVeditorReplacement.MAX_MINOR_TICKS; t += minorStep) {
                if (t < -0.001 || t > total + 0.001) continue;
                if (this._isNearlyOnMajorTick(t, majorStep)) continue;
                const m = document.createElement('div');
                m.className = 'vs-veditor-tick-minor';
                m.style.left = `${t * pps}px`;
                this._rulerEl.appendChild(m);
                nMin++;
            }
        }

        const tStart = Math.floor(t0 / majorStep) * majorStep;
        let nMaj = 0;
        for (let t = tStart; t <= t1 + majorStep * 0.001 && nMaj < SoopVeditorReplacement.MAX_RULER_TICKS; t += majorStep) {
            if (t < -0.001 || t > total + 0.001) continue;
            const tick = document.createElement('div');
            tick.className = 'vs-veditor-tick-major';
            tick.style.left = `${t * pps}px`;
            tick.textContent = this._formatTimeLabel(t, majorStep);
            this._rulerEl.appendChild(tick);
            nMaj++;
        }
    }

    // 대략적인 목표 간격(초)에 맞는 표준 눈금 스텝을 고르거나 배수로 확장한다.
    _pickEditorRulerStepSec(roughSec) {
        if (!Number.isFinite(roughSec) || roughSec <= 0) return 1;
        for (const s of SoopVeditorReplacement.EDITOR_RULER_STEPS_SEC) {
            if (s >= roughSec - 1e-12) return s;
        }
        let s =
            SoopVeditorReplacement.EDITOR_RULER_STEPS_SEC[
                SoopVeditorReplacement.EDITOR_RULER_STEPS_SEC.length - 1
            ];
        while (s < roughSec) s *= 2;
        return s;
    }

    // 눈금에 찍을 시각 레이블 문자열을 만든다 (스텝이 작으면 소수 초 표기).
    _formatTimeLabel(sec, stepSec) {
        if (!Number.isFinite(sec)) return '';
        const st = stepSec !== undefined && stepSec > 0 ? stepSec : 1;
        const subSecTicks = st < 1;
        const dec = st >= 0.1 ? 1 : 2;
        const quant = 10 ** dec;
        const sDisp = subSecTicks ? Math.round(sec * quant) / quant : Math.round(sec);

        if (!subSecTicks) {
            if (sDisp < 60) return `${sDisp}s`;
            if (sDisp < 3600) {
                const m = Math.floor(sDisp / 60);
                const s = Math.floor(sDisp % 60);
                return `${m}:${String(s).padStart(2, '0')}`;
            }
            const h = Math.floor(sDisp / 3600);
            const m = Math.floor((sDisp % 3600) / 60);
            const s = Math.floor(sDisp % 60);
            return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }

        if (sDisp < 60) return `${sDisp.toFixed(dec)}s`;
        if (sDisp < 3600) {
            const mi = Math.floor(sDisp / 60);
            const ss = sDisp - mi * 60;
            const ssStr = ss.toFixed(dec);
            const [intP, fracP] = ssStr.split('.');
            return `${mi}:${intP.padStart(2, '0')}.${fracP}`;
        }
        const h = Math.floor(sDisp / 3600);
        const rem = sDisp - h * 3600;
        const mi = Math.floor(rem / 60);
        const ss = rem - mi * 60;
        const ssStr = ss.toFixed(dec);
        const [intP, fracP] = ssStr.split('.');
        return `${h}:${String(mi).padStart(2, '0')}:${intP.padStart(2, '0')}.${fracP}`;
    }

    /**
     * @param {number} total
     * @param {number} pps
     */
    _renderClipsOnTrack(total, pps) {
        if (!this._trackEl) return;
        this._trackEl.innerHTML = '';
        this._trackEl.classList.toggle('vs-tool-cut', this._timelineToolMode === 'cut');
        const clips = this._getClips();
        clips.forEach((c, idx) => {
            if (c.visibleOnTimeline === false) return;
            const el = document.createElement('div');
            el.className = 'vs-veditor-clip';
            el.dataset.clipIndex = String(idx);
            if (idx === this._selectedClipIndex) el.classList.add('vs-selected');
            el.style.left = `${c.begin * pps}px`;
            el.style.width = `${Math.max(2, (c.end - c.begin) * pps)}px`;

            const leftH = document.createElement('div');
            leftH.className = 'vs-veditor-clip-handle vs-left';
            leftH.title = '시작 지점';
            const body = document.createElement('div');
            body.className = 'vs-veditor-clip-body';
            body.title = '드래그하여 편집 구간 이동';
            const rightH = document.createElement('div');
            rightH.className = 'vs-veditor-clip-handle vs-right';
            rightH.title = '끝 지점';
            const label = document.createElement('div');
            label.className = 'vs-veditor-clip-order';
            label.textContent = this._timelineClipLabelMode === 'name' ? c.name : String(idx + 1);
            label.title = this._timelineClipLabelMode === 'name' ? c.name : `편집 구간 순서 ${idx + 1}`;
            el.appendChild(leftH);
            el.appendChild(body);
            el.appendChild(label);
            el.appendChild(rightH);

            leftH.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this._timelineToolMode === 'cut') {
                    this._splitClipAtClientX(idx, e.clientX, total);
                    return;
                }
                const root = el;
                this._beginClipDrag(c, 'resize-start', e.clientX, total, root);
            });
            body.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._selectedClipIndex = idx;
                if (this._timelineToolMode === 'cut') {
                    this._splitClipAtClientX(idx, e.clientX, total);
                    return;
                }
                const root = el;
                this._beginClipDrag(c, 'move', e.clientX, total, root);
            });
            rightH.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this._timelineToolMode === 'cut') {
                    this._splitClipAtClientX(idx, e.clientX, total);
                    return;
                }
                const root = el;
                this._beginClipDrag(c, 'resize-end', e.clientX, total, root);
            });

            this._trackEl.appendChild(el);
        });
    }

    _setTimelineToolMode(mode) {
        if (mode !== 'select' && mode !== 'cut') return;
        if (this._timelineToolMode === mode) return;
        this._timelineToolMode = mode;
        this._updateTimelineToolModeUi();
        this._renderClipsOnTrack(this._getTotalDurationSec(), this._pixelsPerSecond);
    }

    _updateTimelineToolModeUi() {
        const isSelect = this._timelineToolMode === 'select';
        const isCut = this._timelineToolMode === 'cut';
        if (this._timelineToolSelectBtn) {
            this._timelineToolSelectBtn.classList.toggle('vs-active', isSelect);
            this._timelineToolSelectBtn.setAttribute('aria-pressed', isSelect ? 'true' : 'false');
        }
        if (this._timelineToolCutBtn) {
            this._timelineToolCutBtn.classList.toggle('vs-active', isCut);
            this._timelineToolCutBtn.setAttribute('aria-pressed', isCut ? 'true' : 'false');
        }
        if (this._trackEl) this._trackEl.classList.toggle('vs-tool-cut', isCut);
    }

    /**
     * 자르기로 생기는 오른쪽 구간 이름. 이미 `... (n)` 꼴이면 stem을 괄호 앞까지로 보고 `(n+1)`… 로 채번(예: `ABC (2)` → `ABC (3)`).
     * 그 외에는 전체 이름 뒤에 `(2)`, `(3)`… 를 붙인다. 이름이 비면 `편집 구간 (행번호)` 기준.
     */
    _allocateNameForClipSplit(sourceClip, sourceIdx) {
        const trimmed = String(sourceClip?.name ?? '').trim();
        const fallbackBase = trimmed !== '' ? trimmed : `편집 구간 ${sourceIdx + 1}`;
        const used = new Set(
            this._clips.map((c) => String(c.name ?? '').trim()).filter((s) => s !== '')
        );
        const parenSuffix = fallbackBase.match(/^(.+)\s\((\d+)\)$/);
        if (parenSuffix) {
            const stem = parenSuffix[1];
            const n0 = parseInt(parenSuffix[2], 10);
            if (Number.isFinite(n0)) {
                for (let k = n0 + 1; k < 10000; k++) {
                    const candidate = `${stem} (${k})`;
                    if (!used.has(candidate)) return candidate;
                }
                return `${stem} (${Date.now()})`;
            }
        }
        for (let n = 2; n < 10000; n++) {
            const candidate = `${fallbackBase} (${n})`;
            if (!used.has(candidate)) return candidate;
        }
        return `${fallbackBase} (${Date.now()})`;
    }

    _splitClipAtClientX(clipIdx, clientX, totalSec) {
        if (this._isClipListBusy()) return;
        const clip = this._clips[clipIdx];
        if (!clip) return;
        const total = totalSec !== undefined ? totalSec : this._getTotalDurationSec();
        const minD = SoopVeditorReplacement.CLIP_MIN_DURATION;
        let cut = this._roundClipSec(this._clientXToTimelineSec(clientX, total));
        if (!Number.isFinite(cut)) return;
        cut = Math.max(clip.begin + minD, Math.min(clip.end - minD, cut));
        if (!(cut > clip.begin + 1e-9 && cut < clip.end - 1e-9)) return;
        this._recordClipUndo();
        const oldEnd = clip.end;
        clip.end = cut;
        this._clips.splice(clipIdx + 1, 0, {
            name: this._allocateNameForClipSplit(clip, clipIdx),
            begin: cut,
            end: oldEnd,
            visibleOnTimeline: clip.visibleOnTimeline !== false,
        });
        this._selectedClipIndex = clipIdx + 1;
        this._syncUiFromState();
    }

    // 편집 구간 리사이즈 또는 이동 드래그를 시작하고 document에 move/up 리스너를 단다.
    /**
     * @param {VeditorClip} clip
     * @param {string} mode
     * @param {number} clientX
     * @param {number} total
     * @param {HTMLElement|null} [dragRootEl] `.vs-veditor-clip` 루트 — 있으면 드래그 중 전체 트랙 재빌드 대신 위치만 갱신
     */
    _beginClipDrag(clip, mode, clientX, total, dragRootEl) {
        if (this._isClipListBusy()) return;
        this._clipDrag = {
            clip,
            mode,
            startX: clientX,
            origBegin: clip.begin,
            origEnd: clip.end,
            total,
            undoSnapshot: this._snapshotClipStateForUndo(),
            dragEl: dragRootEl instanceof HTMLElement ? dragRootEl : null,
            moveRaf: 0,
            pendingClientX: clientX,
        };
        document.addEventListener('mousemove', this._onClipResizeMove);
        document.addEventListener('mouseup', this._onClipResizeEnd);
    }

    /**
     * 드래그 중 모델·(가능하면) 해당 편집 구간 DOM만 갱신. mousemove 는 rAF 로 합쳐 프레임당 1회.
     * @param {number} clientX
     */
    _applyClipDragAtClientX(clientX) {
        const d = this._clipDrag;
        if (!d) return;
        const { clip, mode, startX, origBegin, origEnd, total } = d;
        const pps = this._pixelsPerSecond;
        const dt = (clientX - startX) / pps;
        const minD = SoopVeditorReplacement.CLIP_MIN_DURATION;
        if (mode === 'resize-start') {
            let begin = origBegin + dt;
            begin = Math.max(0, Math.min(begin, origEnd - minD));
            clip.begin = begin;
        } else if (mode === 'resize-end') {
            let end = origEnd + dt;
            end = Math.min(total, Math.max(end, origBegin + minD));
            clip.end = end;
        } else if (mode === 'move') {
            let begin = origBegin + dt;
            let end = origEnd + dt;
            if (begin < 0) {
                end -= begin;
                begin = 0;
            }
            if (end > total) {
                const over = end - total;
                begin -= over;
                end = total;
                if (begin < 0) begin = 0;
            }
            clip.begin = begin;
            clip.end = end;
        }
        const el = d.dragEl;
        if (el && el.isConnected) {
            el.style.left = `${clip.begin * pps}px`;
            el.style.width = `${Math.max(2, (clip.end - clip.begin) * pps)}px`;
        } else {
            this._renderClipsOnTrack(total, pps);
        }
    }

    _onClipResizeMove(e) {
        const d = this._clipDrag;
        if (!d) return;
        d.pendingClientX = e.clientX;
        if (d.moveRaf) return;
        d.moveRaf = requestAnimationFrame(() => {
            if (!this._clipDrag) return;
            this._clipDrag.moveRaf = 0;
            this._applyClipDragAtClientX(this._clipDrag.pendingClientX);
        });
    }

    // 편집 구간 드래그를 끝내고 선택·전체 UI 동기화로 마무리한다 (시간순 자동 정렬 없음).
    _onClipResizeEnd() {
        const d = this._clipDrag;
        if (!d) return;
        document.removeEventListener('mousemove', this._onClipResizeMove);
        document.removeEventListener('mouseup', this._onClipResizeEnd);
        if (d.moveRaf) {
            cancelAnimationFrame(d.moveRaf);
            d.moveRaf = 0;
        }
        this._applyClipDragAtClientX(d.pendingClientX);
        const clipRef = d.clip;
        const total = d.total;
        const minD = SoopVeditorReplacement.CLIP_MIN_DURATION;
        clipRef.begin = this._roundClipSec(clipRef.begin);
        clipRef.end = this._roundClipSec(clipRef.end);
        if (Number.isFinite(clipRef.begin) && Number.isFinite(clipRef.end)) {
            if (clipRef.end < clipRef.begin + minD) clipRef.end = clipRef.begin + minD;
            if (Number.isFinite(total) && clipRef.end > total) clipRef.end = total;
        }
        const changed = Math.abs(clipRef.begin - d.origBegin) > 1e-9 || Math.abs(clipRef.end - d.origEnd) > 1e-9;
        if (changed && d.undoSnapshot) {
            this._clipUndoStack.push(d.undoSnapshot);
            if (this._clipUndoStack.length > this._clipUndoMaxDepth) {
                this._clipUndoStack.splice(0, this._clipUndoStack.length - this._clipUndoMaxDepth);
            }
        }
        this._clipDrag = null;
        this._syncSelectionToClip(clipRef);
        this._syncUiFromState();
    }

    _updateSequenceHeaderUi(totalSec) {
        const total = totalSec !== undefined ? totalSec : this._getTotalDurationSec();
        if (this._timecodeEl) {
            this._timecodeEl.textContent = this._formatSequenceTimecode(this._playheadSec);
        }
        if (this._clipPlayStatusEl) {
            const c = this._clips[this._playAllIndex];
            const show = this._playAllMode && !!c;
            this._clipPlayStatusEl.style.display = show ? 'inline' : 'none';
            this._clipPlayStatusEl.textContent = show ? `(${this._playAllIndex + 1}/${this._clips.length})` : '';
        }
        if (this._clipTotalEl) {
            const sum = this._clipTotalDurationSec();
            this._clipTotalEl.textContent = this._formatClipTotalSumLabel(sum);
        }
    }

    /** 편집 구간 시각(초)을 UI·저장용으로 소수 둘째 자리까지 맞춘다. */
    _roundClipSec(sec) {
        const n = Number(sec);
        if (!Number.isFinite(n)) return n;
        return Math.round(n * 100) / 100;
    }

    _formatClipTimeInput(sec) {
        const r = this._roundClipSec(sec);
        if (!Number.isFinite(r)) return '';
        const s = Math.max(0, r);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const secWhole = Math.floor(s % 60);
        const centi = Math.round((s - Math.floor(s)) * 100);
        const carry = centi >= 100 ? 1 : 0;
        const secNorm = secWhole + carry;
        const secDisp = secNorm % 60;
        const minNorm = m + Math.floor(secNorm / 60);
        const minDisp = minNorm % 60;
        const hourDisp = h + Math.floor(minNorm / 60);
        const centiDisp = carry ? 0 : centi;
        return `${String(hourDisp).padStart(2, '0')}:${String(minDisp).padStart(2, '0')}:${String(secDisp).padStart(2, '0')}.${String(centiDisp).padStart(2, '0')}`;
    }

    /**
     * 편집 구간 시각 입력 파서.
     * - `HH:MM:SS` 또는 `MM:SS` 허용
     * - 레거시 호환: 콜론 없는 초 실수(`123.45`)만 허용, 음수는 NaN
     * @param {string} raw
     * @returns {number}
     */
    _parseClipTimeInput(raw) {
        const v = String(raw || '').trim();
        if (!v) return Number.NaN;
        if (!v.includes(':')) {
            const x = parseFloat(v);
            if (!Number.isFinite(x) || x < 0) return Number.NaN;
            return x;
        }
        const parts = v.split(':').map((x) => x.trim());
        if (parts.length < 2 || parts.length > 3) return Number.NaN;
        const nums = parts.map((x) => parseFloat(x));
        if (nums.some((n) => !Number.isFinite(n))) return Number.NaN;
        const [a, b, c] = parts.length === 2 ? [0, nums[0], nums[1]] : nums;
        if (a < 0 || b < 0 || c < 0) return Number.NaN;
        return a * 3600 + b * 60 + c;
    }

    _formatSequenceTimecode(sec) {
        if (!Number.isFinite(sec)) return '—';
        const s = Math.max(0, sec);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const r = s - h * 3600 - m * 60;
        const frac = (r % 1).toFixed(3).slice(2);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(Math.floor(r)).padStart(2, '0')}.${frac}`;
    }

    /** 댓글 타임라인용 HH:MM:SS (소수점 버림). */
    _formatTimelineCommentTimeSec(sec) {
        const s = Math.max(0, Math.floor(Number(sec) || 0));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const r = s % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
    }

    _buildTimelineCommentCopyText() {
        const clips = this._getClips();
        const mode = this._timelineCopyActionSel?.value === 'suffix'
            ? 'suffix'
            : this._timelineCopyActionSel?.value === 'none'
                ? 'none'
                : 'prefix';
        return clips
            .map((c) => {
                const b = this._formatTimelineCommentTimeSec(c.begin);
                const e = this._formatTimelineCommentTimeSec(c.end);
                const base = `${b} ~ ${e}`;
                const name = String(c.name || '').trim();
                if (!name || mode === 'none') return base;
                return mode === 'suffix' ? `${base} ${name}` : `${name} ${base}`;
            })
            .join('\n');
    }

    async _copyClipsAsTimelineComment() {
        const text = this._buildTimelineCommentCopyText();
        if (!text) {
            window.alert('복사할 편집 구간이 없습니다.');
            return;
        }
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.setAttribute('readonly', 'true');
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
            }
            this.log('타임라인 댓글 복사 완료');
        } catch (e) {
            this.error('타임라인 댓글 복사 실패', e);
            window.alert('편집 구간 타임라인 복사에 실패했습니다.');
        }
    }

    _duplicateSelectedClip() {
        if (this._isClipListBusy()) return;
        const i = this._selectedClipIndex;
        const c = this._clips[i];
        if (!c) return;
        this._recordClipUndo();
        const nextName = `편집 구간 ${this._clips.length + 1}`;
        const copy = {
            name: nextName,
            begin: c.begin,
            end: c.end,
            visibleOnTimeline: c.visibleOnTimeline !== false,
        };
        this._clips.splice(i + 1, 0, copy);
        this._selectedClipIndex = i + 1;
        this._syncUiFromState();
    }

    _onClipListChange(e) {
        if (this._isClipListBusy()) return;
        const t = e.target;
        if (!(t instanceof HTMLInputElement) || t.dataset.clip === undefined) return;
        const clipIdx = parseInt(t.dataset.clip, 10);
        const field = t.dataset.field;
        const clips = this._getClips();
        const clipRef = clips[clipIdx];
        if (!clipRef) return;
        let changed = false;
        if (field === 'name') {
            changed = String(clipRef.name) !== t.value;
            if (!changed) return;
            this._recordClipUndo();
            this._clipUpdate(clipIdx, { name: t.value });
        } else if (field === 'begin') {
            const val = this._roundClipSec(this._parseClipTimeInput(t.value));
            if (Number.isNaN(val)) {
                window.alert('시간 형식을 인식할 수 없습니다.');
                this._syncUiFromState();
                return;
            }
            if (val > clipRef.end) {
                window.alert('시작 시각은 종점보다 뒤일 수 없습니다.');
                this._syncUiFromState();
                return;
            }
            changed = Math.abs(Number(clipRef.begin) - val) > 1e-9;
            if (!changed) return;
            this._recordClipUndo();
            this._clipUpdate(clipIdx, { begin: val });
        } else if (field === 'end') {
            const val = this._roundClipSec(this._parseClipTimeInput(t.value));
            if (Number.isNaN(val)) {
                window.alert('시간 형식을 인식할 수 없습니다.');
                this._syncUiFromState();
                return;
            }
            if (val < clipRef.begin) {
                window.alert('종점 시각은 시점보다 앞일 수 없습니다.');
                this._syncUiFromState();
                return;
            }
            changed = Math.abs(Number(clipRef.end) - val) > 1e-9;
            if (!changed) return;
            this._recordClipUndo();
            this._clipUpdate(clipIdx, { end: val });
        } else {
            return;
        }
        this._syncSelectionToClip(clipRef);
        this._syncUiFromState();
    }

    _bindClipListScrollDelegationOnce() {
        if (this._clipListDelegationBound || !this._clipListScrollEl) return;
        this._clipListDelegationBound = true;
        const el = this._clipListScrollEl;
        el.addEventListener('click', this._onClipListHostClick);
        el.addEventListener('dragstart', this._onClipListHostDragStart);
        el.addEventListener('dragover', this._onClipListHostDragOver);
        el.addEventListener('drop', this._onClipListHostDrop);
        el.addEventListener('dragend', this._onClipListHostDragEnd);
    }

    _onClipListHostClick(e) {
        const host = this._clipListScrollEl;
        if (!host) return;
        const t = e.target;
        if (!(t instanceof HTMLElement)) return;

        if (t.closest('.vs-veditor-clip-add-row .vs-veditor-clip-add-btn')) {
            if (this._isClipListBusy()) return;
            e.preventDefault();
            this._addDefaultClip();
            return;
        }

        const eye = t.closest('.vs-veditor-clip-eye-btn');
        if (eye && host.contains(eye)) {
            if (this._isClipListBusy()) return;
            e.stopPropagation();
            const row = eye.closest('.vs-veditor-clip-row');
            if (!(row instanceof HTMLElement)) return;
            const i = parseInt(row.dataset.clipRow, 10);
            const clip = this._clips[i];
            if (!clip) return;
            this._recordClipUndo();
            clip.visibleOnTimeline = clip.visibleOnTimeline === false;
            this._syncUiFromState();
            return;
        }

        const row = t.closest('.vs-veditor-clip-row:not(.vs-veditor-clip-add-row)');
        if (!(row instanceof HTMLElement) || !host.contains(row)) return;
        if (t.closest('input, button, textarea')) return;
        const i = parseInt(row.dataset.clipRow, 10);
        if (Number.isNaN(i)) return;
        this._selectedClipIndex = i;
        this._syncUiFromState();
    }

    _onClipListHostDragStart(e) {
        if (this._isClipListBusy()) return;
        const host = this._clipListScrollEl;
        if (!host) return;
        const handle = e.target.closest?.('.vs-veditor-clip-drag-handle');
        if (!(handle instanceof HTMLButtonElement) || !host.contains(handle) || handle.disabled) return;
        const row = handle.closest('.vs-veditor-clip-row:not(.vs-veditor-clip-add-row)');
        if (!(row instanceof HTMLElement) || !host.contains(row)) return;
        const i = parseInt(row.dataset.clipRow, 10);
        if (Number.isNaN(i)) return;
        this._listDnDIndex = i;
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(i));
        }
    }

    _onClipListHostDragOver(e) {
        if (this._isClipListBusy()) return;
        const host = this._clipListScrollEl;
        if (!host) return;
        const targetEl = e.target instanceof Element ? e.target : null;
        if (!targetEl) return;
        const row = targetEl.closest('.vs-veditor-clip-row');
        if (!(row instanceof HTMLElement) || !host.contains(row)) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    }

    _onClipListHostDrop(e) {
        if (this._isClipListBusy()) return;
        const host = this._clipListScrollEl;
        if (!host) return;
        const targetEl = e.target instanceof Element ? e.target : null;
        if (!targetEl) return;
        const row = targetEl.closest('.vs-veditor-clip-row');
        if (!(row instanceof HTMLElement) || !host.contains(row)) return;
        e.preventDefault();
        const fromStr = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
        const from = parseInt(fromStr, 10);
        let to = -1;
        if (row.classList.contains('vs-veditor-clip-add-row')) {
            to = this._clips.length;
        } else {
            to = parseInt(row.dataset.clipRow, 10);
        }
        if (Number.isNaN(from) || Number.isNaN(to)) return;
        if (to === this._clips.length && from === this._clips.length - 1) return;
        if (from === to) return;
        this._recordClipUndo();
        const originalLen = this._clips.length;
        const item = this._clips.splice(from, 1)[0];
        let insertTo;
        if (to === originalLen) {
            insertTo = this._clips.length; // +행(drop end): 항상 맨 뒤
        } else {
            insertTo = to;
            if (from < to) insertTo -= 1;
            if (insertTo < 0) insertTo = 0;
            if (insertTo > this._clips.length) insertTo = this._clips.length;
        }
        this._clipListReorderPending = true;
        this._clips.splice(insertTo, 0, item);
        this._selectedClipIndex = insertTo;
        this._listDnDIndex = null;
        this._syncUiFromState();
    }

    _onClipListHostDragEnd() {
        this._listDnDIndex = null;
    }

    /**
     * 편집 구간 개수·빈 상태·DnD 순서 변경 시에만 전체 재빌드하고, 그 외에는 기존 행 DOM을 유지한 채 값·선택만 갱신한다.
     */
    _syncClipList() {
        const host = this._clipListScrollEl;
        if (!host) return;
        const clips = this._getClips();
        const n = clips.length;
        const clipRows = Array.from(host.querySelectorAll('.vs-veditor-clip-row:not(.vs-veditor-clip-add-row)'));
        const addRow = host.querySelector('.vs-veditor-clip-add-row');
        const emptyEl = host.querySelector('.vs-veditor-clip-list-empty');

        const needFull =
            this._clipListReorderPending ||
            !addRow ||
            n !== clipRows.length ||
            (n === 0 && !emptyEl) ||
            (n > 0 && !!emptyEl);

        if (needFull) {
            this._renderClipListFull();
            this._clipListReorderPending = false;
            return;
        }
        if (n === 0) return;
        const sel = this._selectedClipIndex;
        for (let i = 0; i < n; i++) {
            this._patchClipRow(clipRows[i], clips[i], i, i === sel);
        }
    }

    /**
     * @param {HTMLElement} row
     * @param {VeditorClip} clip
     * @param {number} index
     * @param {boolean} selected
     */
    _patchClipRow(row, clip, index, selected) {
        row.dataset.clipRow = String(index);
        row.classList.toggle('vs-veditor-clip-row--selected', selected);
        row.draggable = false;
        const nameInp = row.querySelector('.vs-veditor-clip-name');
        if (nameInp instanceof HTMLInputElement) {
            nameInp.value = clip.name;
            nameInp.dataset.clip = String(index);
            nameInp.disabled = this._isClipListBusy();
        }
        const beginInp = row.querySelector('input[data-field="begin"]');
        if (beginInp instanceof HTMLInputElement) {
            beginInp.value = this._formatClipTimeInput(clip.begin);
            beginInp.dataset.clip = String(index);
            beginInp.disabled = this._isClipListBusy();
        }
        const endInp = row.querySelector('input[data-field="end"]');
        if (endInp instanceof HTMLInputElement) {
            endInp.value = this._formatClipTimeInput(clip.end);
            endInp.dataset.clip = String(index);
            endInp.disabled = this._isClipListBusy();
        }
        const dur = row.querySelector('.vs-veditor-clip-dur');
        if (dur) dur.textContent = `${(clip.end - clip.begin).toFixed(2)}s`;
        const dragHandle = row.querySelector('.vs-veditor-clip-drag-handle');
        if (dragHandle instanceof HTMLButtonElement) {
            dragHandle.draggable = !this._isClipListBusy();
            dragHandle.disabled = this._isClipListBusy();
        }
        const eye = row.querySelector('.vs-veditor-clip-eye-btn');
        if (eye) {
            const vis = clip.visibleOnTimeline !== false;
            eye.className = 'vs-veditor-btn vs-veditor-btn-icon vs-veditor-clip-eye-btn' + (vis ? '' : ' vs-veditor-clip-eye-btn--off');
            eye.setAttribute('aria-label', vis ? '타임라인에 표시' : '타임라인에서 숨김');
            eye.setAttribute('aria-pressed', vis ? 'true' : 'false');
            eye.disabled = this._isClipListBusy();
            eye.innerHTML = vis ? SoopVeditorReplacement.CLIP_TIMELINE_VISIBILITY_SVG_ON
                : SoopVeditorReplacement.CLIP_TIMELINE_VISIBILITY_SVG_OFF;
        }
    }

    _fitTimelineToClipIndex(idx) {
        const c = this._clips[idx];
        if (!c || !this._timelineViewport) return;
        const total = this._getTotalDurationSec();
        const span = Math.max(c.end - c.begin, 0.1);
        const vp = this._timelineViewport;
        const w = Math.max(vp.clientWidth, 1);
        this._pixelsPerSecond = this._clampPps(
            Math.min(SoopVeditorReplacement.MAX_PPS, (w * 0.88) / span),
            total
        );
        const innerW = this._getTimelineInnerWidthPx(total, this._pixelsPerSecond);
        if (this._timelineInner) this._timelineInner.style.width = `${innerW}px`;
        const mid = (c.begin + c.end) / 2;
        const innerW2 = innerW;
        const sl = mid * this._pixelsPerSecond - w / 2;
        vp.scrollLeft = Math.max(0, Math.min(sl, Math.max(0, innerW2 - w)));
        this._syncUiFromState();
    }

    /**
     * @param {boolean} [pauseVideo] true 이면 마지막 편집 구간까지 재생 완료 시 `<video>` 일시정지.
     */
    _stopPlayAll(pauseVideo = false) {
        const wasPlaying = this._playAllMode || this._playSingleClipMode;
        this._playAllMode = false;
        this._playSingleClipMode = false;
        this._playbackClipEntered = false;
        this._playAllSeekGraceUntil = 0;
        if (this._playAllRaf != null) {
            cancelAnimationFrame(this._playAllRaf);
            this._playAllRaf = null;
        }
        if (pauseVideo) {
            const v = this._getVideo();
            if (v && !v.paused) v.pause();
        }
        if (wasPlaying) this._syncUiFromState();
    }

    _playAllClips() {
        if (this._playAllMode) return;
        if (this._playSingleClipMode) this._stopPlayAll(false);
        const clips = this._clips;
        if (clips.length === 0) return;
        this._playAllMode = true;
        this._playAllIndex = 0;
        this._selectedClipIndex = 0;
        this._playbackClipEntered = false;
        this._playAllSeekGraceUntil = performance.now() + 200;
        this._plSeekGlobal(clips[0].begin);
        const v = this._getVideo();
        if (v) v.play().catch(() => {});
        this._syncUiFromState();

        const tick = () => {
            if (!this._playAllMode || !this._panelVisible) return;
            if (this._playAllSeekGraceUntil && performance.now() < this._playAllSeekGraceUntil) {
                this._playAllRaf = requestAnimationFrame(tick);
                return;
            }
            this._playAllSeekGraceUntil = 0;
            this._refreshCachedGlobalPlaybackTime();
            const list = this._clips;
            let i = this._playAllIndex;
            if (i >= list.length) {
                this._stopPlayAll();
                return;
            }
            const c = list[i];
            const t = this._cachedGlobalPlaybackSec;
            if (SoopVeditorReplacement.ClipBoundaryPlayback.advance(this, t, c.begin, c.end) === 'segment_end') {
                i += 1;
                this._playAllIndex = i;
                if (i >= list.length) {
                    this._stopPlayAll(true);
                    return;
                }
                this._playbackClipEntered = false;
                this._selectedClipIndex = i;
                this._ensureSelectedClipIndex();
                const totalSel = this._getTotalDurationSec();
                const ppsSel = this._pixelsPerSecond;
                this._syncClipList();
                this._renderClipsOnTrack(totalSel, ppsSel);
                this._updatePlayheadVisual(totalSel);
                queueMicrotask(() => this._updateTimelineScrollBarUI());
                this._updateClipToolbarSelectionActions();
                this._plSeekGlobal(list[i].begin);
                this._playAllSeekGraceUntil = performance.now() + 180;
            }
            this._playAllRaf = requestAnimationFrame(tick);
        };
        this._playAllRaf = requestAnimationFrame(tick);
    }

    // 우측 편집 구간 목록을 처음부터 다시 만든다 (개수·빈 상태·DnD 순서 변경 시에만 호출).
    _renderClipListFull() {
        const host = this._clipListScrollEl;
        if (!host) return;
        host.innerHTML = '';
        const clips = this._getClips();
        if (clips.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'vs-veditor-clip-list-empty';
            empty.textContent = '편집 구간 없음 — 아래 + 버튼으로 구간을 추가합니다.';
            host.appendChild(empty);
        } else {
            clips.forEach((c, i) => {
                const row = document.createElement('div');
                row.className = 'vs-veditor-clip-row';
                if (i === this._selectedClipIndex) row.classList.add('vs-veditor-clip-row--selected');
                row.draggable = false;
                row.dataset.clipRow = String(i);

                const nameInp = document.createElement('input');
                nameInp.type = 'text';
                nameInp.className = 'vs-veditor-clip-name';
                nameInp.value = c.name;
                nameInp.disabled = this._isClipListBusy();
                nameInp.dataset.clip = String(i);
                nameInp.dataset.field = 'name';
                nameInp.title = '편집 구간 이름';

                const beginInp = document.createElement('input');
                beginInp.type = 'text';
                beginInp.inputMode = 'text';
                beginInp.autocomplete = 'off';
                beginInp.className = 'vs-veditor-clip-time-inp';
                beginInp.value = this._formatClipTimeInput(c.begin);
                beginInp.disabled = this._isClipListBusy();
                beginInp.dataset.clip = String(i);
                beginInp.dataset.field = 'begin';
                beginInp.title = '시작 시각(HH:MM:SS 또는 초)';

                const tilde = document.createElement('span');
                tilde.className = 'vs-veditor-clip-time-tilde';
                tilde.textContent = '~';
                tilde.setAttribute('aria-hidden', 'true');

                const endInp = document.createElement('input');
                endInp.type = 'text';
                endInp.inputMode = 'text';
                endInp.autocomplete = 'off';
                endInp.className = 'vs-veditor-clip-time-inp';
                endInp.value = this._formatClipTimeInput(c.end);
                endInp.disabled = this._isClipListBusy();
                endInp.dataset.clip = String(i);
                endInp.dataset.field = 'end';
                endInp.title = '끝 시각(HH:MM:SS 또는 초)';

                const dur = document.createElement('span');
                dur.className = 'vs-veditor-clip-dur';
                dur.textContent = `${(c.end - c.begin).toFixed(2)}s`;
                dur.title = '구간 길이(초)';
                const dragHandle = document.createElement('button');
                dragHandle.type = 'button';
                dragHandle.className = 'vs-veditor-clip-drag-handle';
                dragHandle.textContent = '⋮⋮';
                dragHandle.title = '드래그해서 순서 변경';
                dragHandle.setAttribute('aria-label', '드래그해서 순서 변경');
                dragHandle.draggable = !this._isClipListBusy();
                dragHandle.disabled = this._isClipListBusy();

                const eye = document.createElement('button');
                eye.type = 'button';
                const vis = c.visibleOnTimeline !== false;
                eye.className = 'vs-veditor-btn vs-veditor-btn-icon vs-veditor-clip-eye-btn' + (vis ? '' : ' vs-veditor-clip-eye-btn--off');
                eye.title = '타임라인에 표시 (끄면 그래프만 숨김 · 재생·합계에는 포함)';
                eye.setAttribute('aria-label', vis ? '타임라인에 표시' : '타임라인에서 숨김');
                eye.setAttribute('aria-pressed', vis ? 'true' : 'false');
                eye.disabled = this._isClipListBusy();
                eye.innerHTML = vis ? SoopVeditorReplacement.CLIP_TIMELINE_VISIBILITY_SVG_ON
                    : SoopVeditorReplacement.CLIP_TIMELINE_VISIBILITY_SVG_OFF;

                const left = document.createElement('div');
                left.className = 'vs-veditor-clip-row-left';
                left.appendChild(eye);
                left.appendChild(nameInp);

                const center = document.createElement('div');
                center.className = 'vs-veditor-clip-row-center';
                center.appendChild(beginInp);
                center.appendChild(tilde);
                center.appendChild(endInp);

                const right = document.createElement('div');
                right.className = 'vs-veditor-clip-row-right';
                right.appendChild(dur);
                right.appendChild(dragHandle);

                const line = document.createElement('div');
                line.className = 'vs-veditor-clip-row-line';
                line.appendChild(left);
                line.appendChild(center);
                line.appendChild(right);

                row.appendChild(line);
                host.appendChild(row);
            });
        }
        const addRow = document.createElement('div');
        addRow.className = 'vs-veditor-clip-row vs-veditor-clip-add-row';
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'vs-veditor-clip-add-btn';
        addBtn.textContent = '+';
        addBtn.setAttribute('aria-label', '편집 구간 추가');
        addBtn.title = '편집 구간 추가';
        addBtn.disabled = this._isClipListBusy();
        addRow.appendChild(addBtn);
        host.appendChild(addRow);
    }
}

        new SoopAPI();
        const tsManager = new SoopTimestampManager();
        new SoopVODLinker();
        if (/\/player\/\d+/.test(window.location.pathname)) {
            new SoopTimelineCommentProcessor();
            new SoopVeditorReplacement();
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

    // ===================== 탬퍼몽키 업데이트 알림 =====================
    (function initUpdateNotificationTM() {
        if (typeof GM_info === 'undefined' || !GM_info.script || typeof GM_getValue !== 'function' || typeof GM_setValue !== 'function') return;

        function compareVersions(version1, version2) {
            const v1parts = version1.split('.').map(Number);
            const v2parts = version2.split('.').map(Number);
            for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
                const v1part = v1parts[i] || 0;
                const v2part = v2parts[i] || 0;
                if (v1part > v2part) return 1;
                if (v1part < v2part) return -1;
            }
            return 0;
        }
        // 네 번째 자릿수만 바뀐 경우 false. 메이저·마이너·패치가 바뀌면 true.
        function shouldShowUpdateNotification(oldVersion, newVersion) {
            const oldParts = (oldVersion || '').split('.').map(Number);
            const newParts = (newVersion || '').split('.').map(Number);
            const oldMajor = oldParts[0] || 0, oldMinor = oldParts[1] || 0, oldPatch = oldParts[2] || 0;
            const newMajor = newParts[0] || 0, newMinor = newParts[1] || 0, newPatch = newParts[2] || 0;
            return oldMajor !== newMajor || oldMinor !== newMinor || oldPatch !== newPatch;
        }

        const MODAL_HTML_TEMPLATE = `
    <div id="vodSyncUpdateModal" style="
        position: fixed;
        z-index: 999999;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        ">
        <div id="modalContent" style="
            background-color: #fefefe;
            margin: auto;
            padding: 0;
            border-radius: 10px;
            width: auto;
            min-width: 300px;
            max-width: 90vw;
            height: auto;
            min-height: 200px;
            max-height: 90vh;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            animation: vodSyncModalSlideIn 0.3s ease-out;
            position: relative;
            ">
            <div style="
                background: linear-gradient(135deg, #007bff, #0056b3);
                color: white;
                padding: 15px 20px;
                border-radius: 10px 10px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                ">
                <h2 style="margin: 0; font-size: 18px; font-weight: 600;"> VOD Master 업데이트 알림</h2>
                <span class="vod-sync-close" style="
                color: white;
                font-size: 28px;
                font-weight: bold;
                cursor: pointer;
                line-height: 1;
                ">&times;</span>
            </div>
            <iframe id="updateIframe" style="
            width: 500px;
            height: 300px;
            border: none;
            border-radius: 0 0 10px 10px;
            transition: width 0.3s ease, height 0.3s ease;
            "></iframe>
        </div>
    </div>
    <style>
        @keyframes vodSyncModalSlideIn {
            from { opacity: 0; transform: translateY(-50px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .vod-sync-close:hover { opacity: 0.7; }
    </style>
`;

        function createAndShowUpdateModal(version) {
            const existingModal = document.getElementById('vodSyncUpdateModal');
            if (existingModal) existingModal.remove();
            document.body.insertAdjacentHTML('beforeend', MODAL_HTML_TEMPLATE);
            const modal = document.getElementById('vodSyncUpdateModal');
            const iframe = document.getElementById('updateIframe');
            if (modal && iframe) {
                modal.style.display = 'flex';
                iframe.src = 'https://ainukehere.github.io/VOD-Master/doc/update_notification_v' + version + '.html';
                const closeModal = () => modal.remove();
                modal.querySelector('.vod-sync-close').onclick = closeModal;
                modal.onclick = function(e) { if (e.target === modal) closeModal(); };
                const handleEscKey = function(e) {
                    if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', handleEscKey); }
                };
                document.addEventListener('keydown', handleEscKey);
            }
        }

        function resizeIframe(iframe, contentWidth, contentHeight) {
            try {
                const minWidth = 300, maxWidth = 600, minHeight = 200, maxHeight = 960, headerHeight = 60;
                const maxModalHeight = Math.floor(window.innerHeight * 0.9);
                const maxIframeHeight = Math.max(minHeight, maxModalHeight - headerHeight);
                const newWidth = Math.max(minWidth, Math.min(maxWidth, contentWidth));
                const newHeight = Math.max(minHeight, Math.min(maxHeight, maxIframeHeight, contentHeight));
                iframe.style.width = newWidth + 'px';
                iframe.style.height = newHeight + 'px';
                const modalContent = document.getElementById('modalContent');
                if (modalContent) {
                    modalContent.style.width = newWidth + 'px';
                    modalContent.style.height = Math.min(newHeight + headerHeight, maxModalHeight) + 'px';
                }
            } catch (e) {
                const iframe = document.getElementById('updateIframe');
                const modalContent = document.getElementById('modalContent');
                if (iframe) { iframe.style.width = '500px'; iframe.style.height = '300px'; }
                if (modalContent) { modalContent.style.width = '500px'; modalContent.style.height = '360px'; }
            }
        }

        window.addEventListener('message', function(event) {
            if (event.data && event.data.type === 'vodSync-iframe-resize') {
                const iframe = document.getElementById('updateIframe');
                if (iframe) resizeIframe(iframe, event.data.width, event.data.height);
            }
        });

        async function checkForUpdatesTM() {
            try {
                const currentVersion = (GM_info.script && GM_info.script.version) ? GM_info.script.version : '';
                if (!currentVersion) return;
                let lastCheckedVersion = GM_getValue('vodSync_lastCheckedVersion', null);
                lastCheckedVersion = await Promise.resolve(lastCheckedVersion);
                if (typeof lastCheckedVersion !== 'string') lastCheckedVersion = null;
                const versionUpgraded = !lastCheckedVersion || compareVersions(currentVersion, lastCheckedVersion) > 0;
                if (versionUpgraded) {
                    const showNotification = !lastCheckedVersion || shouldShowUpdateNotification(lastCheckedVersion, currentVersion);
                    if (showNotification) createAndShowUpdateModal(currentVersion);
                    const setResult = GM_setValue('vodSync_lastCheckedVersion', currentVersion);
                    await Promise.resolve(setResult);
                }
            } catch (err) {
                logToExtension('업데이트 확인 중 오류:', err);
            }
        }

        setTimeout(checkForUpdatesTM, 2000);
    })();
})(); 