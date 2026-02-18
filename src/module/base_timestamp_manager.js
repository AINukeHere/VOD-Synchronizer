import { IVodSync } from './interface4log.js';
export class TimestampManagerBase extends IVodSync {
    constructor() {
        super();
        this.videoTag = null;
        this.timeStampDiv = null;
        this.isEditing = false;
        this.request_vod_ts = null;
        this.request_real_ts = null;
        this.isControllableState = false;
        this.lastMouseMoveTime = Date.now();
        this.isVisible = true;
        this.isHideCompletly = false; // 툴팁 숨기기 상태
        
        // VODSync 네임스페이스에 자동 등록
        window.VODSync = window.VODSync || {};
        if (window.VODSync.tsManager) {
            this.warn('[VODSync] TimestampManager가 이미 존재합니다. 기존 인스턴스를 덮어씁니다.');
        }
        window.VODSync.tsManager = this;
        
        this.createTooltip();
        this.observeDOMChanges();
        this.setupMouseTracking();
        this.listenBroadcastSyncEvent();
        setInterval(() => {
            this.update();
        }, 200);
    }
    createTooltip() {
        if (!this.timeStampDiv) {
            // 툴팁을 담는 컨테이너 생성
            this.tooltipContainer = document.createElement("div");
            this.tooltipContainer.style.position = "fixed";
            this.tooltipContainer.style.bottom = "20px";
            this.tooltipContainer.style.right = "20px";
            this.tooltipContainer.style.display = "flex";
            this.tooltipContainer.style.alignItems = "center";
            this.tooltipContainer.style.gap = "5px";
            this.tooltipContainer.style.zIndex = "1000";
            
            // Sync 버튼 생성
            this.syncButton = document.createElement("button");
            this.syncButton.title = "열려있는 다른 vod를 이 시간대로 동기화";
            this.syncButton.style.background = "none";
            this.syncButton.style.border = "none";
            this.syncButton.style.cursor = "pointer";
            this.syncButton.style.width = "32px";
            this.syncButton.style.height = "32px";
            this.syncButton.style.padding = "0";
            this.syncButton.style.opacity = "1";
            this.syncButton.style.borderRadius = "8px";
            this.syncButton.style.overflow = "hidden";
            
            // 아이콘 이미지 추가
            const iconImage = document.createElement("img");
            if (window.VODSync?.IS_TAMPER_MONKEY_SCRIPT !== true){
                iconImage.src = chrome.runtime.getURL("res/img/broadcastSync.png");
            }
            else{
                iconImage.src = "https://raw.githubusercontent.com/AINukeHere/VOD-Synchronizer/main/res/img/broadcastSync.png";
            }
            iconImage.style.width = "100%";
            iconImage.style.height = "100%";
            iconImage.style.objectFit = "fill";
            iconImage.style.borderRadius = "8px";
            this.syncButton.appendChild(iconImage);            
            this.syncButton.addEventListener('click', this.handleBroadcastSyncButtonClick.bind(this));
            
            // 툴팁 div 생성
            this.timeStampDiv = document.createElement("div");
            this.timeStampDiv.style.background = "black";
            this.timeStampDiv.style.color = "white";
            this.timeStampDiv.style.padding = "8px 12px";
            this.timeStampDiv.style.borderRadius = "5px";
            this.timeStampDiv.style.fontSize = "14px";
            this.timeStampDiv.style.whiteSpace = "nowrap";
            this.timeStampDiv.style.display = "block";
            this.timeStampDiv.style.opacity = "1";
            this.timeStampDiv.contentEditable = "false";
            this.timeStampDiv.title = "더블클릭하여 수정, 수정 후 Enter 키 누르면 적용";
            
            // 컨테이너에 버튼과 툴팁 추가
            this.tooltipContainer.appendChild(this.syncButton);
            this.tooltipContainer.appendChild(this.timeStampDiv);
            document.body.appendChild(this.tooltipContainer);

            this.timeStampDiv.addEventListener("dblclick", () => {
                this.timeStampDiv.contentEditable = "true";
                this.timeStampDiv.focus();
                this.isEditing = true;
                this.timeStampDiv.style.outline = "2px solid red"; 
                this.timeStampDiv.style.boxShadow = "0 0 10px red";
                // 편집 중일 때는 투명화 방지
                this.showTooltip();
            });
            this.timeStampDiv.addEventListener("mouseup", (event) => {
                event.stopPropagation(); // 치지직의 경우 다른 요소의 이 이벤트가 blur를 호출하게하므로 차단
            });

            this.timeStampDiv.addEventListener("blur", () => {
                this.timeStampDiv.contentEditable = "false";
                this.isEditing = false;
                this.timeStampDiv.style.outline = "none";
                this.timeStampDiv.style.boxShadow = "none";
            });

            this.timeStampDiv.addEventListener("keydown", (event) => {
                // 편집 모드일 때만 이벤트 차단
                if (this.isEditing) {
                    // 숫자 키 (0-9) - 영상 점프 기능만 차단하고 텍스트 입력은 허용
                    if (/^[0-9]$/.test(event.key)) {
                        // 영상 플레이어의 키보드 이벤트만 차단
                        event.stopPropagation();
                        return;
                    }

                    // 방향키 - 영상 앞으로/뒤로 이동 기능 차단
                    if (event.key === "ArrowUp" || event.key === "ArrowDown" || 
                        event.key === "ArrowLeft" || event.key === "ArrowRight") {
                        event.stopPropagation();
                        return;
                    }
                }

                // Enter 키 처리
                if (event.key === "Enter") {
                    event.preventDefault();
                    this.processTimestampInput(this.timeStampDiv.innerText.trim());
                    this.timeStampDiv.contentEditable = "false";
                    this.timeStampDiv.blur();
                    this.isEditing = false;
                    return;
                }
            });

            // 복사 이벤트 처리 - 텍스트만 복사되도록
            this.timeStampDiv.addEventListener("copy", (event) => {
                const selectedText = window.getSelection().toString();
                if (selectedText) {
                    event.clipboardData.setData("text/plain", selectedText);
                    event.preventDefault();
                }
            });
        }
    }
    update(){
        this.updateTooltip();
        this.checkMouseState();
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

    listenBroadcastSyncEvent() {
        if (window.VODSync?.IS_TAMPER_MONKEY_SCRIPT !== true){
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.action === 'broadCastSync') {
                    this.moveToGlobalTS(message.request_vod_ts, false);
                    sendResponse({ success: true });
                }
                return true;
            });
        }
        else{
            this.channel = new BroadcastChannel('vod-synchronizer');
            this.channel.onmessage = (event) => {
                if (event.data.action === 'broadCastSync') {
                    this.moveToGlobalTS(event.data.request_vod_ts, false);
                }
            }
        }
    }

    setupMouseTracking() {
        // 마우스 움직임 감지 - 시간만 업데이트
        document.addEventListener('mousemove', () => {
            if (this.isHideCompletly) return;
            this.lastMouseMoveTime = Date.now();
            this.showTooltip();
        });

        // 마우스가 페이지 밖으로 나갈 때 툴팁 숨기기
        document.addEventListener('mouseleave', () => {
            this.hideTooltip();
        });
    }

    showTooltip() {
        if (this.timeStampDiv) {
            this.timeStampDiv.style.transition = 'opacity 0.3s ease-in-out';
            this.timeStampDiv.style.opacity = '1';
            this.isVisible = true;
        }
        if (this.syncButton) {
            this.syncButton.style.transition = 'opacity 0.3s ease-in-out';
            this.syncButton.style.opacity = '1';
        }
    }

    hideTooltip() {
        if (this.timeStampDiv && !this.isEditing) {
            this.timeStampDiv.style.transition = 'opacity 0.5s ease-in-out';
            this.timeStampDiv.style.opacity = '0';
            this.isVisible = false;
        }
        if (this.syncButton) {
            this.syncButton.style.transition = 'opacity 0.5s ease-in-out';
            this.syncButton.style.opacity = '0';
        }
    }


    handleBroadcastSyncButtonClick(e) {
        const request_vod_ts = this.getCurDateTime();
        if (!request_vod_ts) {
            this.warn("현재 재생 중인 VOD의 라이브 당시 시간을 가져올 수 없습니다. 전역 동기화 실패.");
            return;
        }
        e.stopPropagation();

        if (window.VODSync?.IS_TAMPER_MONKEY_SCRIPT !== true){
            try{
                chrome.runtime.sendMessage({action: 'broadCastSync', request_vod_ts: request_vod_ts.getTime()});
            } catch (error) {
                console.warn('[VOD Synchronizer] 전역 동기화 요청 실패. 확장프로그램이 리로드되었거나 비활성화된 것 같습니다. 페이지를 새로고침하십시오.', error);
            }
        }
        else{
            this.channel.postMessage({action: 'broadCastSync', request_vod_ts: request_vod_ts.getTime()});
        }
    }
    updateTooltip() {
        if (!this.timeStampDiv || this.isEditing) return;
        
        const dateTime = this.getCurDateTime();
        
        if (dateTime) {
            this.isControllableState = true;
            this.timeStampDiv.innerText = dateTime.toLocaleString("ko-KR");
        }
        if (this.isPlaying() === true)
        { 
            // 전역 시간 동기화 요청 체크
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
                        const currentSystemTime = Date.now();
                        const timeDifference = currentSystemTime - this.request_real_ts;
                        this.log("시차 적용하여 동기화 시도. 시차: " + timeDifference);
                        const adjustedGlobalTS = this.request_vod_ts + timeDifference; 
                        if (!this.moveToGlobalTS(adjustedGlobalTS, false)){
                            window.close();
                        }
                    }
                    this.request_vod_ts = null;
                    this.request_real_ts = null;
                }
            }
            // 로컬 시간 동기화 요청 체크
            if (this.request_local_ts != null){
                this.log("playback time으로 동기화 시도");
                if (!this.moveToPlaybackTime(this.request_local_ts, false)){
                    this.log('동기화 실패. 창을 닫습니다.');
                    window.close();
                }
                this.request_local_ts = null;
            }
        }
    }

    checkMouseState(){
        if (this.isHideCompletly) return;
        const currentTime = Date.now();
        const timeSinceLastMove = currentTime - this.lastMouseMoveTime;
        
        // 2초 이상 마우스가 움직이지 않았고, 편집 중이 아니면 툴팁 숨기기
        if (timeSinceLastMove >= 2000 && !this.isEditing && this.isVisible) {
            this.hideTooltip();
        }
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

    /**
     * @description 재생 시점(초)을 전역 시각(global time)으로 변환. 파생 클래스에서 구현.
     * @param {number} totalPlaybackSec VOD 재생 시점(초)
     * @returns {Date|null} 전역 시각 또는 변환 불가 시 null
     */
    playbackTimeToGlobalTS(totalPlaybackSec) {
        return null;
    }

    // 현재 재생 중인지 여부를 반환하는 추상 메서드
    isPlaying() {
        throw new Error("isPlaying must be implemented by subclass");
    }

    // 활성화/비활성화 메서드
    enable() {
        this.isHideCompletly = false;
        if (this.tooltipContainer) {
            this.tooltipContainer.style.display = 'flex';
        }
        this.log('툴팁 나타남');
    }

    disable() {
        this.isHideCompletly = true;
        if (this.tooltipContainer) {
            this.tooltipContainer.style.display = 'none';
        }
        this.log('툴팁 숨김');
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

    /**
     * @description 전역 시간으로 영상 시간 맞춤
     * @param {number} globalTS
     * @param {boolean} doAlert 
     * @returns 
     */
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

    /**
     * 전역 타임스탬프(ms) → 재생 시각(초) 변환이 가능한지 여부.
     * 타임라인 동기화 미리보기 등에서 변환 준비가 됐을 때만 사용. 서브클래스에서 오버라이드.
     * @returns {boolean}
     */
    canConvertGlobalTSToPlaybackTime() {
        return false;
    }

    /**
     * @description 영상 시간을 설정
     * @param {number} playbackTime 
     * @param {boolean} doAlert 
     */
    moveToPlaybackTime(playbackTime, doAlert = true) {
        throw new Error("applyPlaybackTime must be implemented by subclass");
    }
} 