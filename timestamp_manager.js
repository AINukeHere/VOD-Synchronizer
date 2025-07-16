class BaseTimestampManager {
    constructor() {
        this.tooltip = null;
        this.observer = null;
        this.isEditing = false;
        this.requestGlobalTS = null;
        this.requestSystemTime = null;
        this.isControllableState = false;
        this.lastMouseMoveTime = Date.now();
        this.isTooltipVisible = true;
        this.mouseCheckInterval = null;
        this.startMonitoring();
    }

    RequestGlobalTSAsync(global_ts, system_time){
        this.requestGlobalTS = global_ts;
        this.requestSystemTime = system_time;
    }

    startMonitoring() {
        this.observeDOMChanges();
        this.createTooltip();
        this.setupMouseTracking();
    }

    setupMouseTracking() {
        // 마우스 움직임 감지 - 시간만 업데이트
        document.addEventListener('mousemove', () => {
            this.lastMouseMoveTime = Date.now();
            this.showTooltip();
        });

        // 마우스가 페이지 밖으로 나갈 때 툴팁 숨기기
        document.addEventListener('mouseleave', () => {
            this.hideTooltip();
        });

        // 0.2초마다 마우스 상태 체크
        this.mouseCheckInterval = setInterval(() => {
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
            if (!this.tooltip || this.isEditing) return;
            
            const timestamp = this.getCurDateTime();

            if (timestamp) {
                this.isControllableState = true;
                this.tooltip.innerText = timestamp.toLocaleString("ko-KR");
            }
            if (this.requestGlobalTS != null){
                const currentSystemTime = Date.now();
                const timeDifference = currentSystemTime - this.requestSystemTime;
                const adjustedGlobalTS = this.requestGlobalTS + timeDifference; 
                if (!this.moveToGlobalTS(adjustedGlobalTS, false))
                    window.close();
                this.requestGlobalTS = null;
                this.requestSystemTime = null;
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
        return this.applyPlaybackTime(playbackTime, doAlert);
    }

    // 플랫폼별로 구현해야 하는 추상 메서드
    applyPlaybackTime(playbackTime, doAlert = true) {
        throw new Error("applyPlaybackTime must be implemented by subclass");
    }
} 