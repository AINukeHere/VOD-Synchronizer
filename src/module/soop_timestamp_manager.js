import { BaseTimestampManager } from './timestamp_manager.js';

const MAX_DURATION_DIFF = 30*1000;
export class SoopTimestampManager extends BaseTimestampManager {
    constructor() {
        super();
        this.observer = null;
        this.playTimeTag = null;
        this.curVodInfo = null;
        this.timeLink = null;
        this.isEditedVod = false; // 다시보기의 일부분이 편집된 상태인가
        this.log('loaded');
    }
        
    log(...data){
        logToExtension('[soop_timestamp_manager.js]', ...data);
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
        this.log('영상 정보 로드 완료');
    }

    reloadAll(){
        if (this.updating) return;
        const newPlayTimeTag = document.querySelector('span.time-current');
        let newVideoTag = document.querySelector('#video');
        if (newVideoTag === null)
            newVideoTag = document.querySelector('#video_p');
        
        if (!newPlayTimeTag || !newVideoTag) return;
        if (newPlayTimeTag !== this.playTimeTag || newVideoTag !== this.videoTag) {
            this.updating = true;
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

    /**
     * @override
     * @description 현재 영상이 스트리밍된 당시 시간을 반환
     * @returns {Date} 현재 영상이 스트리밍된 당시 시간
     * @returns {null} 영상 정보를 가져올 수 없음. 의도치않은 상황 발생
     * @returns {string} 당시 시간을 계산하지 못한 오류 메시지.
     */
    getCurDateTime(){
        if (this.firstLoad === undefined){
            this.reloadAll();
            if (this.playTimeTag !== null && this.videoTag !== null)
                this.firstLoad = true;
            return null;
        }
        if (this.playTimeTag === null || this.videoTag === null) return null;
        if (!this.curVodInfo) return null;
        if (this.curVodInfo.type === 'NORMAL') return '업로드 VOD는 지원하지 않습니다.';
        if (this.curVodInfo.startDate === null && 
            this.curVodInfo.endDate === null && 
            this.curVodInfo.originVodInfo === null) {
                return '원본 다시보기와 연결되어 있지 않은 VOD입니다.';
        }
        const reviewStartDate = this.curVodInfo.originVodInfo === null ? this.curVodInfo.startDate : this.curVodInfo.originVodInfo.startDate;
        const reviewDataFiles = this.curVodInfo.originVodInfo === null ? this.curVodInfo.files : this.curVodInfo.originVodInfo.files;
        const deltaTimeSec = this.curVodInfo.originVodInfo === null ? 0 : this.curVodInfo.originVodInfo.originVodChangeSecond;

        const totalPlaybackSec = this.getCurPlaybackTime();

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

    /**
     * @description 현재 재생 시간을 초 단위로 반환
     * @returns {number} 현재 재생 시간(초)
     * @returns {null} 재생 시간을 계산할 수 없음. 의도치않은 상황 발생
     */
    getCurPlaybackTime(){
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
     * @param {number} playbackTime (seconds)
     * @param {boolean} doAlert 
     * @returns {boolean} 성공 여부
     */
    moveToPlaybackTime(playbackTime, doAlert = true) {
        const url = new URL(window.location.href);
        url.searchParams.set('change_second', playbackTime);

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
        }, 500);
        return true;
        
        if (this.isPlaying()){
            if (this.timeLink === null) {
                this.timeLink = document.createElement('a');
                this.timeLink.classList.add('time_link');
                this.timeLink.setAttribute('data-time', playbackTime.toString());
                document.body.appendChild(this.timeLink);
            }
            this.timeLink.click();
            // URL에서 change_second 파라미터 추가
            window.history.replaceState({}, '', url.toString());
            return true;
        }
        else{
            window.location.replace(url.toString());
            return true;
        }
    }

    // 현재 재생 중인지 여부 반환
    isPlaying() {
        if (this.videoTag) {
            return !this.videoTag.paused;
        }
        return false;
    }
} 