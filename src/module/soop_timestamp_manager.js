import { TimestampManagerBase } from './base_timestamp_manager.js';

const MAX_DURATION_DIFF = 30*1000;
export class SoopTimestampManager extends TimestampManagerBase {
    constructor() {
        super();
        this.observer = null;
        this.playTimeTag = null;
        this.curVodInfo = null;
        this.timeLink = null;
        this.isEditedVod = false; // 다시보기의 일부분이 편집된 상태인가
        this.debug('loaded');

        this.vodInfoLoaded = false; // 현재 vod의 정보를 로드했는가
        this.tagLoaded = false; // 현재 VOD 플레이어의 요소를 로드했는가 (video, playTimeTag)
        this.updating = false; // 현재 VOD 정보와 태그를 업데이트 중인가
        const checkerInterval = setInterval(async () => {
            if (this.updating) return;
            if (!this.vodInfoLoaded || !this.tagLoaded)
                this.reloadAll();
        }, 100);

        this.simpleLoopSetting();
    }

    simpleLoopSetting(){
        const LABEL_TEXT = '반복 재생';
        const EM_TEXT_IDLE = '(added by VODSync)';
        this.loop_playing = false;
        setInterval(()=>{

            // 반복재생 설정이 켜져있고 비디오 태그를 찾은 경우
            if (this.tagLoaded && this.loop_playing){
                // 현재 재생 시간이 영상 전체 재생 시간과 같은 경우 처음으로 이동
                if (this.getCurPlaybackTime() === Math.floor(this.curVodInfo.total_file_duration / 1000)){
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
            
        },100);
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
        this.debug('오차: ', durationDiff);
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
                // this.log('vodInfo 갱신됨', this.curVodInfo);
                this.playTimeTag = document.querySelector('span.time-current');
                // this.log('playTimeTag 갱신됨', this.playTimeTag);
                this.videoTag = document.querySelector('#video');
                if (this.videoTag === null)
                    this.videoTag = document.querySelector('#video_p');
                // this.log('videoTag 갱신됨', this.videoTag);
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
        const maxPlaybackTime = Math.floor(this.curVodInfo.total_file_duration / 1000);
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