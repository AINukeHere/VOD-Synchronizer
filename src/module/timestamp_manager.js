export class BaseTimestampManager {
    constructor() {
        this.tooltip = null;
        this.observer = null;
        this.isEditing = false;
        this.request_vod_ts = null;
        this.request_real_ts = null;
        this.isControllableState = false;
        this.lastMouseMoveTime = Date.now();
        this.isTooltipVisible = true;
        this.mouseCheckInterval = null;
        this.videoTag = null;
        this.isEnabled = true; // 활성화 상태 추적
        
        // VODSync 네임스페이스에 자동 등록
        window.VODSync = window.VODSync || {};
        if (window.VODSync.tsManager) {
            console.warn('[VODSync] TimestampManager가 이미 존재합니다. 기존 인스턴스를 덮어씁니다.');
        }
        window.VODSync.tsManager = this;
        
        this.startMonitoring();
    }

    log(...data){
        logToExtension('[timestamp_manager.js]', ...data);
    }
    // request_real_ts 가 null이면 request_vod_ts로 동기화하고 null이 아니면 동기화시도하는 시점과 request_real_ts와의 차이를 request_vod_ts와 더하여 동기화합니다.
    // 즉, 페이지가 로딩되는 동안의 시차를 적용할지 안할지 결정합니다.
    RequestGlobalTSAsync(request_vod_ts, request_real_ts = null){
        this.request_vod_ts = request_vod_ts;
        this.request_real_ts = request_real_ts;
    }

    RequestLocalTSAsync(request_local_ts){
        this.request_local_ts = request_local_ts;
    }

    startMonitoring() {
        this.observeDOMChanges();
        this.createTooltip();
        this.setupMouseTracking();
    }

    setupMouseTracking() {
        // 마우스 움직임 감지 - 시간만 업데이트
        document.addEventListener('mousemove', () => {
            if (!this.isEnabled) return;
            this.lastMouseMoveTime = Date.now();
            this.showTooltip();
        });

        // 마우스가 페이지 밖으로 나갈 때 툴팁 숨기기
        document.addEventListener('mouseleave', () => {
            this.hideTooltip();
        });

        // 0.2초마다 마우스 상태 체크
        this.mouseCheckInterval = setInterval(() => {
            if (!this.isEnabled) return;
            const currentTime = Date.now();
            const timeSinceLastMove = currentTime - this.lastMouseMoveTime;
            
            // 2초 이상 마우스가 움직이지 않았고, 편집 중이 아니면 툴팁 숨기기
            if (timeSinceLastMove >= 2000 && !this.isEditing && this.isTooltipVisible) {
                this.hideTooltip();
            }
        }, 200);
    }

    showTooltip() {
        if (this.tooltip) {
            this.tooltip.style.transition = 'opacity 0.3s ease-in-out';
            this.tooltip.style.opacity = '1';
            this.isTooltipVisible = true;
        }
    }

    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style.transition = 'opacity 0.5s ease-in-out';
            this.tooltip.style.opacity = '0.1';
            this.isTooltipVisible = false;
        }
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
            this.tooltip.style.opacity = "1";
            this.tooltip.contentEditable = "false";
            document.body.appendChild(this.tooltip);

            this.tooltip.addEventListener("dblclick", () => {
                this.tooltip.contentEditable = "true";
                this.tooltip.focus();
                this.isEditing = true;
                this.tooltip.style.outline = "2px solid red"; 
                this.tooltip.style.boxShadow = "0 0 10px red";
                // 편집 중일 때는 투명화 방지
                this.showTooltip();
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
            if (!this.tooltip || this.isEditing || !this.isEnabled) return;
            
            const timestamp = this.getCurDateTime();
            
            if (timestamp) {
                this.isControllableState = true;
                this.tooltip.innerText = timestamp.toLocaleString("ko-KR");
            }
            if (this.isPlaying() === true)
            { 
                // 전역 시간 동기화
                if (this.request_vod_ts != null){
                    const streamPeriod = this.getStreamPeriod();
                    if (streamPeriod){
                        if (this.request_real_ts == null){
                            this.log("시차 적용하지않고 동기화 시도");
                            if (!this.moveToGlobalTS(this.request_vod_ts, false)){
                                window.close();
                            }
                        }
                        else{
                            this.log("시차 적용하여 동기화 시도");
                            const currentSystemTime = Date.now();
                            const timeDifference = currentSystemTime - this.request_real_ts;
                            const adjustedGlobalTS = this.request_vod_ts + timeDifference; 
                            if (!this.moveToGlobalTS(adjustedGlobalTS, false)){
                                window.close();
                            }
                        }
                        this.request_vod_ts = null;
                        this.request_real_ts = null;
                    }
                }
                // 로컬 시간 동기화
                if (this.request_local_ts != null){
                    this.log("playback time으로 동기화 시도");
                    if (!this.moveToPlaybackTime(this.request_local_ts, false)){
                        window.close();
                    }
                    this.request_local_ts = null;
                }
            }
        }, 200);
    }

    // 플랫폼별로 구현해야 하는 추상 메서드들
    observeDOMChanges() {
        throw new Error("observeDOMChanges must be implemented by subclass");
    }

    getCurDateTime() {
        throw new Error("getCurDateTime must be implemented by subclass");
    }

    getStreamPeriod() {
        throw new Error("getStreamPeriod must be implemented by subclass");
    }

    // 현재 재생 중인지 여부를 반환하는 추상 메서드
    isPlaying() {
        throw new Error("isPlaying must be implemented by subclass");
    }

    // 활성화/비활성화 메서드
    enable() {
        this.isEnabled = true;
        if (this.tooltip) {
            this.tooltip.style.display = 'block';
        }
        this.log('활성화됨');
    }

    disable() {
        this.isEnabled = false;
        if (this.tooltip) {
            this.tooltip.style.display = 'none';
        }
        this.log('비활성화됨');
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
        return this.moveToPlaybackTime(playbackTime, doAlert);
    }

    // 플랫폼별로 구현해야 하는 추상 메서드
    moveToPlaybackTime(playbackTime, doAlert = true) {
        throw new Error("applyPlaybackTime must be implemented by subclass");
    }
} 