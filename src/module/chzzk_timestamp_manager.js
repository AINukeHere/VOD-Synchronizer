import { TimestampManagerBase } from './base_timestamp_manager.js';

export class ChzzkTimestampManager extends TimestampManagerBase {
    constructor() {
        super();
        this.observer = null;
        this.videoId = null;
        this.videoInfo = null;
    }

    log(...data){
        logToExtension('[chzzk_timestamp_manager.js]', ...data);
    }

    calculateTimestamp(videoInfo, currentTime) {
        if (!videoInfo || !videoInfo.realStartTime) {
            this.tooltip.innerText = "VOD 정보를 가져올 수 없습니다.";
            return null;
        }

        const startTime = videoInfo.realStartTime;

        if (isNaN(startTime.getTime())) {
            this.log('유효하지 않은 방송 시작 시간입니다.');
            return null;
        }

        if (isNaN(currentTime) || currentTime < 0) {
            this.log('유효하지 않은 재생 시간입니다.');
            return null;
        }

        return new Date(startTime.getTime() + currentTime * 1000);
    }

    observeDOMChanges() {
        const targetNode = document.body;
        const config = { childList: true, subtree: true };

        this.observer = new MutationObserver(async () => {
            // chzzk 플레이어의 비디오 태그 찾기
            const newVideoTag = document.querySelector('video.webplayer-internal-video');
            
            // URL에서 videoId 추출
            const urlMatch = window.location.pathname.match(/\/video\/([^\/\?]+)/);
            const newVideoId = urlMatch ? urlMatch[1] : null;

            if (!newVideoTag || !newVideoId) return;
            
            if (newVideoTag !== this.videoTag || newVideoId !== this.videoId) {
                this.log('VOD 변경 감지됨! 요소 업데이트 중...');
                this.videoTag = newVideoTag;
                this.videoId = newVideoId;
                
                // 새로운 VOD 정보 가져오기
                this.videoInfo = await window.VODSync.chzzkAPI.getVodDetailWithCache(this.videoId);
                if (!this.videoInfo) {
                    this.log('VOD 정보 가져오기 실패');
                    return;
                }
                this.videoInfo.realStartTime = window.VODSync.chzzkAPI.calculateVodStartTime(this.videoInfo);
                this.log('VOD 정보 가져오기 성공');
            }
        });

        this.observer.observe(targetNode, config);
    }

    getStreamPeriod(){
        if (!this.videoInfo || !this.videoInfo.content) {
            return null;
        }
        
        const startTime = this.videoInfo.realStartTime;
        const endTime = this.videoInfo.endDate;
        return [startTime, endTime];
    }

    getCurDateTime(){
        if (!this.videoTag || !this.videoInfo) {
            return null;
        }
        
        const currentTime = this.videoTag.currentTime;
        return new Date(this.videoInfo.realStartTime.getTime() + currentTime * 1000);
    }

    // chzzk용 moveToPlaybackTime 메서드 구현
    moveToPlaybackTime(playbackTime, doAlert = true) {
        // chzzk에서는 URL 파라미터로 시간 변경을 지원하지 않으므로 비디오 태그를 직접 제어
        if (this.videoTag && this.videoTag.tagName === 'VIDEO') {
            this.videoTag.currentTime = playbackTime;
            this.log('비디오 시간을', playbackTime, '초로 변경했습니다.');
            return true;
        } else {
            if (doAlert) {
                alert("비디오 플레이어를 찾을 수 없습니다.");
            }
            return false;
        }
    }

    // 현재 재생 중인지 여부 반환
    isPlaying() {
        if (this.videoTag && this.videoTag.currentTime > 0 && !this.videoTag.paused && !this.videoTag.ended && this.videoTag.readyState > 2)
            return true;
        return false;
    }
} 