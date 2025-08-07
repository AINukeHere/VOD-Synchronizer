export class ChzzkVODFinder{
    constructor(request_vod_ts, pageNum){
        this.request_vod_date = new Date(request_vod_ts);
        this.pageNum = pageNum;
        this.retryCount = 0;
        this.init();
    }
    log(...data){
        logToExtension('[chzzkVODFinder]', ...data);
    }
    init(){
        this.log(`CHZZK VOD 검색시작: ${window.location}`);
        this.tryCheck();
    }
    async tryCheck(){
        this.retryCount += 1;
        window.parent.postMessage({
            response: 'CHZZK_VOD_FINDER_STATUS',
            pageNum: this.pageNum,
            retryCount: this.retryCount
        })

        const p = document.querySelector('#videos-PANEL > div > p');
        if (p !== null && p.innerText === '영상이 하나도 없네요...\n'){
            window.parent.postMessage(
                {
                    response: "CHZZK_VOD_NOT_FOUND",
                    reason: "no vod"
                },
                "https://chzzk.naver.com"
            );
            return;
        }
        const videoListTag = document.querySelector('#videos-PANEL > ul');
        if (videoListTag){
            const aTags = videoListTag.querySelectorAll('li > div > a');
            if (aTags.length > 0){
                let found = false;
                //현재 페이지의 마지막 다시보기기의 업로드 시점을 읽어옴
                const l_vod_idx = aTags.length-1;
                const l_vod_link = aTags[l_vod_idx].href;
                const l_video_id = parseInt(l_vod_link.match(/\/video\/(\d+)/)[1]);
                const l_video_info = await this.getVodInfo(l_video_id);
                const l_liveOpenDateStr = l_video_info.content.liveOpenDate;
                const l_durationMSec = l_video_info.content.duration*1000;
                const l_liveOpenDate = new Date(l_liveOpenDateStr.replace(' ', 'T'));
                const l_liveCloseDate = new Date(l_liveOpenDate.getTime() + l_durationMSec);

                if (this.request_vod_date < l_liveOpenDate){
                    // 현재 페이지의 마지막 다시보기의 라이브 시작 시점이 요청시간보다 이전이라면 다음 페이지에서 다시 검색해야함
                    const url = new URL(window.location.href);
                    url.searchParams.set('page', this.pageNum+1);
                    url.searchParams.set('p_request', 'GET_VOD');
                    url.searchParams.set('request_vod_ts', this.request_vod_date.getTime());
                    const urlStr = url.toString();
                    this.log(`다음 페이지로 이동 (${this.pageNum} --> ${this.pageNum+1}): ${urlStr}`);
                    window.location.replace(urlStr);
                }
                else if (l_liveCloseDate < this.request_vod_date){
                    //현재 페이지의 마지막 다시보기의 라이브 종료 시점이 요청시간보다 이후라면 이 페이지에서 마저 검색해야함
                    // 이분 탐색으로 VOD를 찾는다 (tryCheck가 async이므로 바로 await 사용)
                    let left = 0;
                    let right = l_vod_idx > 0 ? l_vod_idx-1 : 0;
                    while (left <= right) {
                        const mid = Math.floor((left + right) / 2);
                        const vod_link = aTags[mid].href;
                        const match = vod_link.match(/\/video\/(\d+)/);
                        const videoId = parseInt(match[1]);
                        this.log(`이분탐색: ${left}~[${mid}]~${right} CHZZK VOD 정보 검색중 (videoId:${videoId})`);
                        const videoInfo = await this.getVodInfo(videoId);
            
                        // 다시보기가 잘릴 경우 잘린 다시보기의 라이브 시작날짜와 동일하기 때문에 다음 다시보기의 라이브 시작날짜를 확인해야함
                        const nextVodId = videoInfo.content.nextVideo.videoNo;
                        const nextVodInfo = await this.getVodInfo(nextVodId);
                        const liveOpenDate = new Date(videoInfo.content.liveOpenDate.replace(' ', 'T'));
                        
                        // 잘린 다시보기인 경우 다음 다시보기의 시간만큼 liveOpenDate 변수에 더해줌
                        if (nextVodInfo.content.liveOpenDate === videoInfo.content.liveOpenDate)
                            liveOpenDate.setTime(liveOpenDate.getTime() + nextVodInfo.content.duration*1000);

                        const liveCloseDate = new Date(liveOpenDate.getTime() + videoInfo.content.duration*1000);

                        if (liveOpenDate <= this.request_vod_date && this.request_vod_date <= liveCloseDate) {
                            window.parent.postMessage(
                                {
                                    response: "CHZZK_VOD",
                                    vod_link: vod_link
                                },
                                "https://chzzk.naver.com"
                            );
                            return;
                        } else if (this.request_vod_date < liveOpenDate) {
                            left = mid + 1;
                        } else {
                            right = mid - 1;
                        }
                    }
                    // 다 검사했는데 없으면 아예 동기화할 다시보기가 없다는 뜻.
                    window.parent.postMessage(
                        {
                            response: "CHZZK_VOD_NOT_FOUND",
                            reason: `no vod.`
                        },
                        "https://chzzk.naver.com"
                    );
                    return;
                }
                else {
                    // 현재 페이지의 마지막 다시보기의 라이브 구간안에 요청시간이 포함되어있음.
                    found = true;
                    window.parent.postMessage(
                        {
                            response: "CHZZK_VOD",
                            vod_link: l_vod_link
                        },
                        "https://chzzk.naver.com"
                    );
                    return;
                }
            }
        }
        this.log('페이지 로딩중. 재시도');
        setTimeout(this.tryCheck.bind(this), 100);
    }
    async getVodInfo(videoId){
        const url = `https://api.chzzk.naver.com/service/v2/videos/${videoId}`;
        const response = await fetch(url);
        const videoInfo = await response.json();
        if (videoInfo.code !== 200) {
            window.parent.postMessage(
                {
                    response: "CHZZK_VOD_NOT_FOUND",
                    reason: `${videoId} video api response ${videoInfo.code}.`
                },
                "https://chzzk.naver.com"
            );
            return;
        }
        return videoInfo;
    }
}