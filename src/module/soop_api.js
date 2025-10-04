export class SoopAPI{
    constructor(){
        window.VODSync = window.VODSync || {};
        if (window.VODSync.soopAPI) {
            warnToExtension('[VODSync] SoopAPI가 이미 존재합니다. 기존 인스턴스를 덮어씁니다.');
        }
        this.log('loaded');
        window.VODSync.soopAPI = this;
    }
    log(...data){
        logToExtension('[soop_api.js]', ...data);
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