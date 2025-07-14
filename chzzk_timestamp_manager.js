class ChzzkTimestampManager extends BaseTimestampManager {
    constructor() {
        super();
        this.playTimeTag = null;
        this.videoId = null;
        this.videoInfo = null;
    }

    async fetchVideoInfo(videoId) {
        try {
            const response = await fetch(`https://api.chzzk.naver.com/service/v2/videos/${videoId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data;
        } catch (error) {
            console.log('[chzzk_timestamp_manager.js] Error fetching video info:', error);
            return null;
        }
    }

    calculateTimestamp(videoInfo, currentTime) {
        if (!videoInfo || !videoInfo.content || !videoInfo.content.liveOpenDate) {
            this.tooltip.innerText = "VOD 정보를 가져올 수 없습니다.";
            return null;
        }

        const startTime = new Date(videoInfo.content.liveOpenDate);

        if (isNaN(startTime.getTime())) {
            console.log('[chzzk_timestamp_manager.js] 유효하지 않은 방송 시작 시간입니다.');
            return null;
        }

        if (isNaN(currentTime) || currentTime < 0) {
            console.log('[chzzk_timestamp_manager.js] 유효하지 않은 재생 시간입니다.');
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
            
            if (newVideoTag !== this.playTimeTag || newVideoId !== this.videoId) {
                console.log('[chzzk_timestamp_manager.js] VOD 변경 감지됨! 요소 업데이트 중...');
                this.playTimeTag = newVideoTag;
                this.videoId = newVideoId;
                
                // 새로운 VOD 정보 가져오기
                this.videoInfo = await this.fetchVideoInfo(this.videoId);
                if (this.videoInfo) {
                    console.log('[chzzk_timestamp_manager.js] VOD 정보 가져오기 성공:', this.videoInfo);
                }
            }
        });

        this.observer.observe(targetNode, config);
    }

    getStreamPeriod(){
        if (!this.videoInfo || !this.videoInfo.content) {
            return null;
        }
        
        const startTime = new Date(this.videoInfo.content.liveOpenDate);
        const duration = this.videoInfo.content.duration || 0;
        const endTime = new Date(startTime.getTime() + duration * 1000);
        
        return [startTime, endTime];
    }

    getCurDateTime(){
        if (!this.playTimeTag || !this.videoInfo) {
            return null;
        }
        
        const currentTime = this.playTimeTag.currentTime;
        const timestamp = this.calculateTimestamp(this.videoInfo, currentTime);
        return timestamp;
    }

    // chzzk용 applyPlaybackTime 메서드 구현
    applyPlaybackTime(playbackTime, doAlert = true) {
        // chzzk에서는 URL 파라미터로 시간 변경을 지원하지 않으므로 비디오 태그를 직접 제어
        if (this.playTimeTag && this.playTimeTag.tagName === 'VIDEO') {
            this.playTimeTag.currentTime = playbackTime;
            console.log('[chzzk_timestamp_manager.js] 비디오 시간을', playbackTime, '초로 변경했습니다.');
            return true;
        } else {
            if (doAlert) {
                alert("비디오 플레이어를 찾을 수 없습니다.");
            }
            return false;
        }
    }
} 