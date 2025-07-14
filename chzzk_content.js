if (window == top) {
    const BTN_TEXT_IDLE = "Find VOD";
    const BTN_TEXT_FINDING_STREAMER_ID = "스트리머 ID를 찾는 중...";
    const BTN_TEXT_FINDING_VOD = "다시보기를 찾는 중...";
    let tsManager = null;
    let vodLinker = null;
    
    function log(...data){
        console.log('[chzzk_content.js]', ...data);
    }

    class ChzzkTimestampTooltipManager {
        constructor() {
            this.playTimeTag = null;
            this.videoId = null;
            this.tooltip = null;
            this.observer = null;
            this.isEditing = false;
            this.requestGlobalTS = null;
            this.requestSystemTime = null;
            this.isControllableState = false;
            this.videoInfo = null;
            this.startMonitoring();
        }

        RequestGlobalTSAsync(global_ts, system_time){
            this.requestGlobalTS = global_ts;
            this.requestSystemTime = system_time;
        }

        startMonitoring() {
            this.observeDOMChanges();
            this.createTooltip();
        }

        createTooltip() {
            if (!this.tooltip) {
                this.tooltip = document.createElement("div");
                this.tooltip.style.position = "fixed";
                this.tooltip.style.bottom = "20px";
                this.tooltip.style.right = "20px";
                this.tooltip.style.background = "black";
                this.tooltip.style.color = "white";
                this.tooltip.style.padding = "8px 12px";
                this.tooltip.style.borderRadius = "5px";
                this.tooltip.style.fontSize = "14px";
                this.tooltip.style.whiteSpace = "nowrap";
                this.tooltip.style.display = "block";
                this.tooltip.style.zIndex = "1000";
                this.tooltip.contentEditable = "false";
                document.body.appendChild(this.tooltip);

                this.tooltip.addEventListener("dblclick", () => {
                    this.tooltip.contentEditable = "true";
                    this.tooltip.focus();
                    this.isEditing = true;
                    this.tooltip.style.outline = "2px solid red"; 
                    this.tooltip.style.boxShadow = "0 0 10px red";
                });

                this.tooltip.addEventListener("blur", () => {
                    this.tooltip.contentEditable = "false";
                    this.isEditing = false;
                    this.tooltip.style.outline = "none";
                    this.tooltip.style.boxShadow = "none";
                });

                this.tooltip.addEventListener("keydown", (event) => {                    
                    // 숫자 키 (0-9) - 영상 점프 기능만 차단하고 텍스트 입력은 허용
                    if (/^[0-9]$/.test(event.key)) {
                        // 영상 플레이어의 키보드 이벤트만 차단
                        event.stopPropagation();
                        return;
                    }

                    // Enter 키 처리
                    if (event.key === "Enter") {
                        event.preventDefault();
                        this.processTimestampInput(this.tooltip.innerText.trim());
                        this.tooltip.contentEditable = "false";
                        this.tooltip.blur();
                        this.isEditing = false;
                        return;
                    }
                });
            }
            this.updateTooltip();
        }

        updateTooltip() {
            setInterval(() => {
                if (!this.tooltip || !this.playTimeTag || !this.videoInfo || this.isEditing) return;
                
                const timestamp = this.getCurDateTime();

                if (timestamp) {
                    this.isControllableState = true;
                    this.tooltip.innerText = timestamp.toLocaleString("ko-KR");
                }
                if (this.requestGlobalTS != null){
                    const currentSystemTime = Date.now();
                    const timeDifference = currentSystemTime - this.requestSystemTime;
                    const adjustedGlobalTS = this.requestGlobalTS + timeDifference; 
                    if (!tsManager.moveToGlobalTS(adjustedGlobalTS, false))
                        window.close();
                    this.requestGlobalTS = null;
                    this.requestSystemTime = null;
                }
            }, 1000);
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
                log('Error fetching video info:', error);
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
                log("유효하지 않은 방송 시작 시간입니다.");
                return null;
            }

            if (isNaN(currentTime) || currentTime < 0) {
                log("유효하지 않은 재생 시간입니다.");
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
                    log("VOD 변경 감지됨! 요소 업데이트 중...");
                    this.playTimeTag = newVideoTag;
                    this.videoId = newVideoId;
                    
                    // 새로운 VOD 정보 가져오기
                    this.videoInfo = await this.fetchVideoInfo(this.videoId);
                    if (this.videoInfo) {
                        log("VOD 정보 가져오기 성공:", this.videoInfo);
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

        processTimestampInput(input) {
            const match = input.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2}):(\d{2})/);
            
            if (!match) {
                alert("유효한 타임스탬프 형식을 입력하세요. (예: 2024. 10. 22. 오전 5:52:55)");
                return;
            }
        
            let [_, year, month, day, period, hour, minute, second] = match;
            year = parseInt(year);
            month = parseInt(month) - 1; // JavaScript의 Date는 0부터 시작하는 월을 사용
            day = parseInt(day);
            hour = parseInt(hour);
            minute = parseInt(minute);
            second = parseInt(second);
        
            // 오전/오후 변환
            if (period === "오후" && hour !== 12) {
                hour += 12;
            } else if (period === "오전" && hour === 12) {
                hour = 0;
            }
        
            const globalDateTime = new Date(year, month, day, hour, minute, second);
            
            if (isNaN(globalDateTime.getTime())) {
                alert("유효한 날짜로 변환할 수 없습니다.");
                return;
            }
        
            this.moveToGlobalTS(globalDateTime.getTime());
        }

        moveToGlobalTS(globalTS, doAlert = true) {
            const streamPeriod = this.getStreamPeriod();
            if (!streamPeriod) {
                if (doAlert) {
                    alert("VOD 정보를 가져올 수 없습니다.");
                }
                return false;
            }
            
            const [streamStartDateTime, streamEndDateTime] = streamPeriod;
            const globalDateTime = new Date(parseInt(globalTS));

            if (streamStartDateTime > globalDateTime || globalDateTime > streamEndDateTime) {
                if (doAlert) {
                    alert("입력한 타임스탬프가 방송 기간 밖입니다.");
                }
                return false;
            }
            
            const playbackTime = Math.floor((globalDateTime.getTime() - streamStartDateTime.getTime()) / 1000);
            const url = new URL(window.location.href);
            url.searchParams.delete('change_global_ts');
            url.searchParams.delete('request_system_time');
            url.searchParams.set('change_second', playbackTime);
            window.location.replace(url.toString());
            return true;
        }
    }

    // 전역 변수로 tsManager 설정
    tsManager = new ChzzkTimestampTooltipManager();
    
    log("Chzzk VOD Timestamp Manager initialized");
}
