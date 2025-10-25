import { IVodSync } from './base_class.js';

export class ChzzkAPI extends IVodSync {
    constructor() {
        super();
        window.VODSync = window.VODSync || {};
        if (window.VODSync.chzzkAPI) {
            this.warn('[VODSync] ChzzkAPI가 이미 존재합니다. 기존 인스턴스를 덮어씁니다.');
        }
        this.log('loaded');

        this.vodDetailCache = new Map();
        window.VODSync.chzzkAPI = this;
    }

    /**
     * @description Get CHZZK VOD Info
     * @param {string, number} videoId 
     * @returns {Object} VOD info or null
     */
    async GetChzzkVodInfo(videoId) {
        try {
            const response = await fetch(`https://api.chzzk.naver.com/service/v2/videos/${videoId}`);
            
            if (response.status !== 200) {
                this.log(`GetChzzkVodInfo failed with status: ${response.status}`);
                return null;
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            this.log('GetChzzkVodInfo error:', error);
            return null;
        }
    }
    /**
     * @description Get CHZZK VOD List
     * @param {string, number} channelId 
     * @param {number} size
     * @param {number} page
     * @returns {Object} VOD list or null
     */
    async GetChzzkVOD_List(channelId, size, page) {
        try {
            // CHZZK API는 날짜 범위 검색을 지원하지 않으므로 최근 VOD들을 가져와서 필터링
            // https://api.chzzk.naver.com/service/v1/channels/1b0561f3051c10a24b9d8ec9a6cb3374/videos?sortType=LATEST&pagingType=PAGE&page=0&size=50&publishDateAt=&videoType=REPLAY
            const url = new URL(`https://api.chzzk.naver.com/service/v1/channels/${channelId}/videos`);
            url.searchParams.set('sortType', 'LATEST');
            url.searchParams.set('pagingType', 'PAGE');
            url.searchParams.set('page', page);
            url.searchParams.set('size', size);
            url.searchParams.set('publishDateAt', '');
            url.searchParams.set('videoType', 'REPLAY');
            
            this.log(`GetChzzkVOD_List: ${url.toString()}`);
            
            const response = await fetch(url.toString());
            
            const data = await response.json();
            return data;            
        } catch (error) {
            this.log('GetChzzkVOD_List error:', error);
            return null;
        }
    }
    /**
     * @description Search CHZZK channels by keyword
     * @param {string} keyword 
     * @param {number} limit 
     * @returns {Array} channel list
     */
    async SearchChannels(keyword, limit = 20) {
        try {
            const encodedKeyword = encodeURI(keyword);
            // https://api.chzzk.naver.com/service/v1/search/channels?keyword=사모장&offset=0&limit=20
            const url = new URL('https://api.chzzk.naver.com/service/v1/search/channels');
            url.searchParams.set('keyword', encodedKeyword);
            url.searchParams.set('offset', '0');
            url.searchParams.set('limit', limit.toString());
            
            this.log(`SearchChannels: ${url.toString()}`);
            
            const response = await fetch(url.toString());
            
            if (response.status !== 200) {
                this.log(`SearchChannels failed with status: ${response.status}`);
                return null;
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            this.log('SearchChannels error:', error);
            return [];
        }
    }


    /**
     * @description VOD 상세 정보를 캐시와 함께 가져오기
     * @param {string|number} videoNo 
     * @returns {Object|null}
     */
    async getVodDetailWithCache(videoNo) {
        // 캐시에서 먼저 확인
        if (this.vodDetailCache.has(videoNo)) {
            this.log(`VOD ${videoNo}: 캐시에서 상세 정보 반환`);
            return this.vodDetailCache.get(videoNo);
        }
        
        // 캐시에 없으면 API 호출
        this.log(`VOD ${videoNo}: API 호출하여 상세 정보 조회`);
        const vodDetail = await window.VODSync.chzzkAPI.GetChzzkVodInfo(videoNo);
        
        if (vodDetail && vodDetail.content) {
            // 캐시에 저장
            this.vodDetailCache.set(videoNo, vodDetail.content);
            return vodDetail.content;
        }
        
        return null;
    }

    /**
     * @description VOD의 실제 시작 시점 계산 (잘린 다시보기 고려)
     * @param {Object} vodDetail 
     * @returns {Date}
     */
    calculateVodStartTime(vodDetail) {
        const liveOpenDate = new Date(vodDetail.liveOpenDate.replace(' ', 'T'));
        
        const curLivePv = vodDetail.livePv;
        const prevLivePv = vodDetail.prevVideo?.livePv;
        const nextLivePv = vodDetail.nextVideo?.livePv;
        const prevDuration = vodDetail.prevVideo?.duration;
        const nextDuration = vodDetail.nextVideo?.duration;
        // duration이 17시간(61200초)과 1초 이하 차이나는지 확인
        const prevIsNear17Hours = Math.abs(prevDuration - 61200) <= 1;
        const nextIsNear17Hours = Math.abs(nextDuration - 61200) <= 1;
        
        const isPrevLivePvSame = prevLivePv && curLivePv === prevLivePv;
        const isNextLivePvSame = nextLivePv && curLivePv === nextLivePv;
        
        if (isPrevLivePvSame && isNextLivePvSame){ // 세 영상의 livePv가 모두 같음.
            startDate = liveOpenDate;
            // 그 어떤 경우에도 17시간에 근접한 영상의 duration을 liveOpenDate에 더한 날짜를 반환
            // curDuration이 17시간이라도 다른 영상의 duration이 17시간이면 그 영상들의 순서를 알 수 없기때문
            if (prevIsNear17Hours)
                startDate = new Date(startDate.getTime() + prevDuration * 1000);
            if (nextIsNear17Hours)
                startDate = new Date(startDate.getTime() + nextDuration * 1000);
            return startDate;
        }
        else if (isPrevLivePvSame){ // 이전 영상과 현재 영상이 동일한 라이브 스트리밍의 일부분들임
            if (prevIsNear17Hours){ // 이전 영상이 더 앞부분의 영상임
                return new Date(liveOpenDate.getTime() + prevDuration * 1000);
            }
            else{ // 현재 영상이 더 앞부분의 영상이거나 우연의 일치로 서로다른 라이브였지만 livePv값이 동일한 경우
                return liveOpenDate;
            }
        }
        else if (isNextLivePvSame){ // 다음 영상과 현재 영상이 동일한 라이브 스트리밍의 일부분들임
            if (nextIsNear17Hours){ // 다음 영상이 더 앞부분의 영상임
                return new Date(liveOpenDate.getTime() + nextDuration * 1000);
            }
            else{ // 현재 영상이 더 앞부분의 영상이거나 우연의 일치로 서로다른 라이브였지만 livePv값이 동일한 경우
                return liveOpenDate;
            }
        }
        else{
            return liveOpenDate;
        }
    }
}
