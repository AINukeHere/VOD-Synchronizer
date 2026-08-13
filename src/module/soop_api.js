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
    API_CHANNEL_ORIGIN: 'https://api-channel.sooplive.com',
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

    /**
     * 스트리머 라이브 방송 정보 조회. 방송 중이 아니면 null.
     * @param {string} streamerId 스트리머 userId (예: chebi2)
     * @returns {Promise<object|null>} broadNo·broadTitle 등, 오프라인이면 null
     */
    async GetChannelBroad(streamerId) {
        if (!streamerId) return null;
        const sid = String(streamerId);
        const cacheKey = `GetChannelBroad:${sid}`;
        const cached = this._getCached(cacheKey);
        if (cached !== null) return cached;
        const url = `${this.SoopUrls.API_CHANNEL_ORIGIN}/v1.1/channel/${encodeURIComponent(sid)}/home/section/broad`;
        const res = await fetch(url, {
            headers: {
                accept: 'application/json, text/plain, */*',
            },
            method: 'GET',
            mode: 'cors',
            credentials: 'include',
        });
        if (res.status !== 200) return null;
        const text = await res.text();
        // 오프라인이면 빈 본문
        if (!text || !text.trim()) return null;
        let b;
        try {
            b = JSON.parse(text);
        } catch (_e) {
            return null;
        }
        if (!b || typeof b !== 'object' || b.broadNo == null) return null;
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
     * @description playbackTime 구간의 chat 로그 조회. VOD 전체 파일을 chat_duration 단위로 fetch 후 필터링.
     * @param {number | string} vodId
     * @param {number} startTimeSec - 시작 playbackTime (초)
     * @param {number} endTimeSec - 끝 playbackTime (초)
     * @returns {Promise<string|null>} XML 문자열 또는 null
     */
    async GetChatLog(vodId, startTimeSec, endTimeSec){
        const vodInfo = await this.GetSoopVodInfo(vodId);
        if (vodInfo === null){
            this.warn(`GetChatLog: GetSoopVodInfo failed: ${vodId}`);
            return null;
        }
        return this._GetChatLog(vodInfo, startTimeSec, endTimeSec);
    }   
    
    /**
     * @description VOD 전체 파일을 chat_duration 단위로 chat 로그 fetch 후 playbackTime(초) 기준 필터링.
     * GetSoopVodInfo 단위: `files[].duration`(ms), `chat_duration`(초). chat API `startTime`·XML `<t>`는 파일 내 초.
     * chat API chunk 시작점은 파일 내 0부터 chat_duration 간격(0, 300, 600, …)으로만 유효함.
     * @param {Object} vodInfo - VOD 정보
     * @param {number} startTimeSec - 시작 playbackTime (초)
     * @param {number} endTimeSec - 끝 playbackTime (초)
     * @returns {Promise<string|null>} XML 문자열 또는 null
     */
    async _GetChatLog(vodInfo, startTimeSec, endTimeSec){
        if (!vodInfo?.data?.files || vodInfo.data.files.length === 0) {
            this.warn("GetChatLog: files 정보가 없습니다.");
            return null;
        }

        const chatFetchDurationSec = vodInfo.data.chat_duration || 300;
        const chatFetchDurationMs = chatFetchDurationSec * 1000;
        const startTimeMs = startTimeSec * 1000;
        const endTimeMs = endTimeSec * 1000;
        const fetchTasks = [];
        let cumPlaybackMs = 0;

        for (const file of vodInfo.data.files) {
            const fileDurationMs = file.duration > 0 ? file.duration : 0;

            if (file.chat && fileDurationMs > 0 && cumPlaybackMs < endTimeMs) {
                const relativeStartInFileMs = Math.max(0, startTimeMs - cumPlaybackMs);
                const relativeFetchStartBaseMs = Math.floor(relativeStartInFileMs / chatFetchDurationMs) * chatFetchDurationMs;

                for (let relativeFetchStartMs = relativeFetchStartBaseMs; relativeFetchStartMs < fileDurationMs; relativeFetchStartMs += chatFetchDurationMs) {
                    if (cumPlaybackMs + relativeFetchStartMs < endTimeMs) {
                        fetchTasks.push({
                            chatUrl: file.chat,
                            relativeFetchStartSec: relativeFetchStartMs / 1000,
                            fileStartPlaybackSec: Math.floor(cumPlaybackMs / 1000),
                        });
                    }
                }
            }

            cumPlaybackMs += fileDurationMs;
            if (cumPlaybackMs >= endTimeMs) break;
        }

        if (fetchTasks.length === 0) {
            this.warn("GetChatLog: 요청 구간에 해당하는 chat fetch가 없습니다.");
            return null;
        }

        const xmlResults = await Promise.all(
            fetchTasks.map((task) => this._fetchChatLogFromFile(task.chatUrl, task.relativeFetchStartSec))
        );

        let mergedXml = null;
        for (let i = 0; i < fetchTasks.length; i++) {
            const xml = xmlResults[i];
            if (!xml) continue;

            const filtered = this._convertAndFilterChatLogByTimeRange(
                xml, startTimeSec, endTimeSec, fetchTasks[i].fileStartPlaybackSec
            );
            if (!filtered) continue;

            mergedXml = mergedXml ? this._mergeChatLogXml(mergedXml, filtered) : filtered;
        }

        return mergedXml;
    }

    /**
     * @description 특정 파일의 chat URL에서 chat 로그 가져오기
     * @param {string} chatUrl - chat URL
     * @param {number} relativeStartSec - 파일 내 상대 playbackTime (초, chat API startTime 파라미터)
     * @returns {Promise<string|null>} XML 문자열 또는 null
     */
    async _fetchChatLogFromFile(chatUrl, relativeStartSec) {
        try {
            const baseUrl = new URL(chatUrl);
            baseUrl.searchParams.set("startTime", relativeStartSec);
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
     * @description XML `<t>`(파일 내 초)를 playbackTime(초)으로 변환하고 구간 필터링
     * @param {string} xml - XML 문자열
     * @param {number} startTimeSec - 시작 playbackTime (초)
     * @param {number} endTimeSec - 끝 playbackTime (초)
     * @param {number} fileStartPlaybackSec - 해당 파일의 시작 playbackTime (초)
     * @returns {string} 변환 및 필터링된 XML 문자열
     */
    _convertAndFilterChatLogByTimeRange(xml, startTimeSec, endTimeSec, fileStartPlaybackSec) {
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

                const relativeTimestampSec = parseFloat(tTag.textContent);
                if (isNaN(relativeTimestampSec)) {
                    // 타임스탬프가 유효하지 않으면 제거
                    chat.remove();
                    return;
                }

                // 파일 내 상대 초 → playbackTime(초)
                const playbackTimeSec = fileStartPlaybackSec + relativeTimestampSec;

                if (playbackTimeSec < startTimeSec || playbackTimeSec > endTimeSec) {
                    chat.remove();
                    return;
                }

                tTag.textContent = playbackTimeSec.toString();
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
     * VOD UP 하기. 라이브 중 VOD 시청 알려주기에 사용.
     * @param {object} opts
     * @param {string|number} opts.stationNo
     * @param {string|number} opts.titleNo nPKno
     * @param {string|number} [opts.boardType=105]
     * @param {string} [opts.referer] 생략 시 플레이어 URL
     * @returns {Promise<object|null>}
     */
    async LikeVodTitle(opts = {}) {
        const {
            stationNo,
            titleNo,
            boardType = 105,
            referer: refererOpt,
        } = opts;
        if (stationNo == null || titleNo == null) {
            this.error('LikeVodTitle: stationNo, titleNo 필수');
            return null;
        }
        const tn = String(titleNo);
        const referer =
            typeof refererOpt === 'string' && refererOpt.length > 0
                ? refererOpt
                : `${this.SoopUrls.VOD_ORIGIN}/player/${tn}`;
        const url = new URL(`${this.SoopUrls.STBBS_ORIGIN}/api/like_action.php`);
        url.searchParams.set('szType', 'addTitle');
        url.searchParams.set('nStationNo', String(stationNo));
        url.searchParams.set('nPKno', tn);
        url.searchParams.set('nBoardType', String(boardType));

        const res = await fetch(url.toString(), {
            headers: {
                accept: 'application/json, text/plain, */*',
                Referer: referer,
            },
            method: 'GET',
            mode: 'cors',
            credentials: 'include',
        });
        if (res.status !== 200) {
            this.error('LikeVodTitle HTTP', res.status);
            return null;
        }
        let b;
        try {
            b = await res.json();
        } catch (_e) {
            this.warn('LikeVodTitle: JSON 파싱 실패');
            return null;
        }
        // result/RESULT === 1(또는 true)만 성공으로 본다.
        const likeOk = b && typeof b === 'object'
            && [b.result, b.RESULT, b.CHANNEL?.RESULT, b.CHANNEL?.result]
                .some((v) => v === 1 || v === true || String(v) === '1');
        if (!likeOk) {
            this.warn('LikeVodTitle 실패 응답:', b);
            return null;
        }
        return b;
    }

    /**
     * VOD 댓글 등록 (클립·캐치·편집·업로드 등). 라이브 중 VOD 시청 알려주기에 사용.
     * @param {object} opts
     * @param {string|number} opts.stationNo
     * @param {string|number} opts.bbsNo
     * @param {string|number} opts.titleNo
     * @param {string} opts.bjId
     * @param {string} opts.content 댓글 본문
     * @param {string} opts.fileType CLIP|CATCH|EDITOR|NORMAL|REVIEW 등
     * @param {string|number} [opts.boardType=105]
     * @param {string|number} [opts.parentCommentNo=0]
     * @param {string|number} [opts.commentPhotoType=1]
     * @param {string} [opts.commentPhoto='']
     * @param {string} [opts.referer] 생략 시 플레이어 URL
     * @returns {Promise<object|null>}
     */
    async WriteVodComment(opts = {}) {
        const {
            stationNo,
            bbsNo,
            titleNo,
            bjId,
            content,
            fileType,
            boardType = 105,
            parentCommentNo = 0,
            commentPhotoType = 1,
            commentPhoto = '',
            referer: refererOpt,
        } = opts;
        if (stationNo == null || bbsNo == null || titleNo == null || !bjId || !fileType) {
            this.error('WriteVodComment: stationNo, bbsNo, titleNo, bjId, fileType 필수');
            return null;
        }
        if (typeof content !== 'string' || !content.trim()) {
            this.error('WriteVodComment: content 필수');
            return null;
        }
        const tn = String(titleNo);
        const referer =
            typeof refererOpt === 'string' && refererOpt.length > 0
                ? refererOpt
                : `${this.SoopUrls.VOD_ORIGIN}/player/${tn}`;
        const body = new URLSearchParams({
            nStationNo: String(stationNo),
            nBbsNo: String(bbsNo),
            nTitleNo: tn,
            bj_id: String(bjId),
            nBoardType: String(boardType),
            szContent: content,
            szAction: 'write',
            nParentCommentNo: String(parentCommentNo),
            nCommentPhotoType: String(commentPhotoType),
            szCommentPhoto: String(commentPhoto ?? ''),
            szFileType: String(fileType),
        });
        const res = await fetch(`${this.SoopUrls.STBBS_ORIGIN}/api/bbs_memo_action.php`, {
            headers: {
                accept: 'application/json, text/plain, */*',
                'content-type': 'application/x-www-form-urlencoded',
                Referer: referer,
            },
            body: body.toString(),
            method: 'POST',
            mode: 'cors',
            credentials: 'include',
        });
        if (res.status !== 200) {
            this.error('WriteVodComment HTTP', res.status);
            return null;
        }
        let b;
        try {
            b = await res.json();
        } catch (_e) {
            this.warn('WriteVodComment: JSON 파싱 실패');
            return null;
        }
        // result/RESULT === 1(또는 true)만 성공으로 본다.
        const commentOk = b && typeof b === 'object'
            && [b.result, b.RESULT, b.CHANNEL?.RESULT, b.CHANNEL?.result]
                .some((v) => v === 1 || v === true || String(v) === '1');
        if (!commentOk) {
            this.warn('WriteVodComment 실패 응답:', b);
            return null;
        }
        return b;
    }

    /**
     * VOD 댓글 목록 조회 (bbs_memo_action szAction=get).
     * stationNo/bbsNo/bjId가 없으면 GetSoopVodInfo로 채운다.
     * @param {string|number} videoId titleNo
     * @param {string} [streamerId] bj_id (생략 시 VOD 정보의 bj_id 사용)
     * @param {object} [opts]
     * @param {string|number} [opts.stationNo]
     * @param {string|number} [opts.bbsNo]
     * @param {string|number} [opts.boardType]
     * @param {number} [opts.pageNo=1]
     * @param {number} [opts.orderNo=1] 1: 등록순 등으로 추정
     * @param {number} [opts.lastNo=0] 페이지네이션 커서
     * @param {string|number} [opts.changeSecond] Referer용 재생 시점
     * @returns {Promise<object|null>}
     */
    async GetSoopCommentInVod(videoId, streamerId, opts = {}) {
        const {
            stationNo,
            bbsNo,
            boardType,
            pageNo = 1,
            orderNo = 1,
            lastNo = 0,
            changeSecond,
        } = opts;

        let resolvedStationNo = stationNo;
        let resolvedBbsNo = bbsNo;
        let resolvedBjId = streamerId;
        let resolvedBoardType = boardType ?? 105;

        if (resolvedStationNo == null || resolvedBbsNo == null || !resolvedBjId) {
            const vodInfo = await this.GetSoopVodInfo(videoId);
            const data = vodInfo?.data;
            if (!data || vodInfo?.result !== 1) {
                this.error('GetSoopCommentInVod: VOD 정보 조회 실패', videoId, data?.message || vodInfo?.message);
                return null;
            }
            resolvedStationNo = resolvedStationNo ?? data.station_no;
            resolvedBbsNo = resolvedBbsNo ?? data.bbs_no;
            resolvedBjId = resolvedBjId || data.bj_id;
            if (boardType == null && data.board_type != null) {
                resolvedBoardType = data.board_type;
            }
        }

        if (resolvedStationNo == null || resolvedBbsNo == null || !resolvedBjId) {
            this.error('GetSoopCommentInVod: stationNo/bbsNo/bj_id 부족', {
                videoId,
                resolvedStationNo,
                resolvedBbsNo,
                resolvedBjId,
            });
            return null;
        }

        const tn = String(videoId);
        const referer = changeSecond != null && changeSecond !== ''
            ? `${this.SoopUrls.VOD_ORIGIN}/player/${tn}?change_second=${changeSecond}`
            : `${this.SoopUrls.VOD_ORIGIN}/player/${tn}`;
        const body = new URLSearchParams({
            nStationNo: String(resolvedStationNo),
            nBbsNo: String(resolvedBbsNo),
            nTitleNo: tn,
            bj_id: String(resolvedBjId),
            nPageNo: String(pageNo),
            nOrderNo: String(orderNo),
            nBoardType: String(resolvedBoardType),
            szAction: 'get',
            nVod: '1',
            nLastNo: String(lastNo),
        });

        const res = await fetch(`${this.SoopUrls.STBBS_ORIGIN}/api/bbs_memo_action.php`, {
            headers: {
                accept: 'application/json, text/plain, */*',
                'accept-language': 'ko',
                'content-type': 'application/x-www-form-urlencoded',
                Referer: referer,
            },
            body: body.toString(),
            method: 'POST',
            mode: 'cors',
            credentials: 'include',
        });
        if (res.status !== 200) {
            this.error('GetSoopCommentInVod HTTP', res.status);
            return null;
        }
        try {
            return await res.json();
        } catch (_e) {
            this.warn('GetSoopCommentInVod: JSON 파싱 실패');
            return null;
        }
    }

    /**
     * VOD 부모 댓글 전체를 페이지네이션으로 모아 반환. (대댓글 본문은 포함되지 않음)
     * @param {string|number} videoId titleNo
     * @returns {Promise<object[]|null>} list_data 항목 배열. 실패 시 null
     */
    async GetSoopParentCommentsInVod(videoId) {
        if (videoId == null || videoId === '') {
            this.error('GetSoopParentCommentsInVod: videoId 필수');
            return null;
        }

        const vodInfo = await this.GetSoopVodInfo(videoId);
        const data = vodInfo?.data;
        if (!data || vodInfo?.result !== 1) {
            this.error(
                'GetSoopParentCommentsInVod: VOD 정보 조회 실패',
                videoId,
                data?.message || vodInfo?.message
            );
            return null;
        }

        const stationNo = data.station_no;
        const bbsNo = data.bbs_no;
        const bjId = data.bj_id;
        const boardType = data.board_type ?? 105;
        if (stationNo == null || bbsNo == null || !bjId) {
            this.error('GetSoopParentCommentsInVod: stationNo/bbsNo/bj_id 부족', {
                videoId,
                stationNo,
                bbsNo,
                bjId,
            });
            return null;
        }

        const all = [];
        let pageNo = 1;
        let lastNo = 0;
        const maxPages = 100;

        for (let i = 0; i < maxPages; i++) {
            const page = await this.GetSoopCommentInVod(videoId, bjId, {
                stationNo,
                bbsNo,
                boardType,
                pageNo,
                lastNo,
            });
            const channel = page?.CHANNEL;
            const pageOk = channel
                && [channel.RESULT, channel.result]
                    .some((v) => v === 1 || v === true || String(v) === '1');
            if (!pageOk) {
                if (i === 0) {
                    this.error('GetSoopParentCommentsInVod: 댓글 조회 실패', videoId);
                    return null;
                }
                this.warn('GetSoopParentCommentsInVod: 중간 페이지 실패, 수집분 반환', videoId, pageNo);
                break;
            }

            const list = Array.isArray(channel.DATA?.list_data) ? channel.DATA.list_data : [];
            all.push(...list);

            if (channel.DATA?.has_more !== true || list.length === 0) {
                break;
            }

            const nextLast = Number(list[list.length - 1]?.p_comment_no);
            if (!Number.isFinite(nextLast) || nextLast === lastNo) {
                break;
            }
            lastNo = nextLast;
            pageNo += 1;
        }

        return all;
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