import { IVodSync } from './interface4log.js';

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

export class SoopAPI extends IVodSync{
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