class SoopTimestampManager extends BaseTimestampManager {
    constructor() {
        super();
        this.playTimeTag = null;
        this.streamPeriodTag = null;
    }

    calculateTimestamp(broadcastInfo, playbackTimeStr) {
        const match = broadcastInfo.match(/방송시간\s*:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);

        if (!match) {
            this.tooltip.innerText = "다시보기만 지원하는 기능입니다.";
            return null;
        }

        const startTime = new Date(match[1]);

        if (isNaN(startTime.getTime())) {
            console.log('[soop_timestamp_manager.js] 유효하지 않은 방송 시작 시간입니다.');
            return null;
        }

        const playbackMatch = playbackTimeStr.match(/(\d{2}):(\d{2}):(\d{2})/);
        if (!playbackMatch) {
            console.log('[soop_timestamp_manager.js] 올바른 재생 시간 형식이 아닙니다.');
            return null;
        }

        const playbackSeconds =
            parseInt(playbackMatch[1]) * 3600 +
            parseInt(playbackMatch[2]) * 60 +
            parseInt(playbackMatch[3]);

        return new Date(startTime.getTime() + playbackSeconds * 1000);
    }

    observeDOMChanges() {
        const targetNode = document.body;
        const config = { childList: true, subtree: true };

        this.observer = new MutationObserver(() => {
            const newPlayTimeTag = document.querySelector('#player > div.player_ctrlBox > div.ctrlBox > div.ctrl > div.time_display > span.time-current');
            const newStreamPeriodTag = document.querySelector("#player_area > div.wrapping.player_bottom > div.broadcast_information > div:nth-child(2) > div.cnt_info > ul > li:nth-child(2) > span");

            if (!newPlayTimeTag || !newStreamPeriodTag) return;
            if (newPlayTimeTag !== this.playTimeTag || newStreamPeriodTag !== this.streamPeriodTag) {
                console.log('[soop_timestamp_manager.js] VOD 변경 감지됨! 요소 업데이트 중...');
                this.playTimeTag = newPlayTimeTag;
                this.streamPeriodTag = newStreamPeriodTag;
            }
        });

        this.observer.observe(targetNode, config);
    }

    getStreamPeriod(){
        if (!this.streamPeriodTag) return null;
            const broadcastInfo = this.streamPeriodTag.attributes['tip'].value;
            const match = broadcastInfo.match(/방송시간\s*:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) ~ (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
            
            if (!match) {
                return null;
            }
            const startTime = new Date(match[1]);
        const endTime = new Date(match[2]);
        return [startTime, endTime];
    }

    getCurDateTime(){
        if (!this.playTimeTag) return null;
        const playbackTimeStr = this.playTimeTag.innerText.trim();
        const broadcastInfo = this.streamPeriodTag.attributes['tip'].value;
        const timestamp = this.calculateTimestamp(broadcastInfo, playbackTimeStr);
        return timestamp;
    }

    // soop용 applyPlaybackTime 메서드 구현
    applyPlaybackTime(playbackTime, doAlert = true) {
        const url = new URL(window.location.href);
        url.searchParams.delete('change_global_ts');
        url.searchParams.delete('request_system_time');
        url.searchParams.set('change_second', playbackTime);
        window.location.replace(url.toString());
        return true;
    }
} 