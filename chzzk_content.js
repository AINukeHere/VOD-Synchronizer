if (window == top) {
    const BTN_TEXT_IDLE = "Find VOD";
    const BTN_TEXT_FINDING_STREAMER_ID = "스트리머 ID를 찾는 중...";
    const BTN_TEXT_FINDING_VOD = "다시보기를 찾는 중...";
    const tsManager = new ChzzkTimestampManager();
    let soopLinker = null;
    
    function log(...data){
        console.log('[chzzk_content.js]', ...data);
    }

    class SoopPanel {
        constructor() {
            this.panel = null;
            this.toggleBtn = null;
            this.iframe = null;
            this.soopSyncBtn = null;
            this.closeBtn = null;
            this.isPanelOpen = false; // 기본값: 접힘
            this.isPanelVisible = true;
            this.lastMouseMoveTime = Date.now();
            this.mouseCheckInterval = null;
            this.init();
        }
        init() {
            this.createPanel();
            this.createToggleBtn();
            this.setupMouseTracking();
            // 생성 직후 접힌 상태로 세팅
            this.closePanel();
        }
        createPanel() {
            this.panel = document.createElement('div');
            this.panel.id = 'soop-panel';
            this.panel.style.position = 'fixed';
            this.panel.style.top = '80px';
            this.panel.style.right = '0';
            this.panel.style.width = '340px';
            this.panel.style.height = '420px';
            this.panel.style.background = 'rgba(255,255,255,0.98)';
            this.panel.style.border = '2px solid #00d564';
            this.panel.style.borderRadius = '10px 0 0 10px';
            this.panel.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)';
            this.panel.style.zIndex = '10000';
            this.panel.style.transition = 'opacity 0.5s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
            this.panel.style.opacity = '1';
            this.panel.style.display = 'flex';
            this.panel.style.flexDirection = 'column';
            this.panel.style.alignItems = 'stretch';
            this.panel.style.padding = '0';
            this.panel.style.gap = '0';

            // 패널 헤더
            const header = document.createElement('div');
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.alignItems = 'center';
            header.style.background = '#00d564';
            header.style.color = 'white';
            header.style.fontWeight = 'bold';
            header.style.fontSize = '16px';
            header.style.padding = '10px 16px';
            header.style.borderRadius = '8px 0 0 0';
            header.innerText = 'SOOP 패널';
            this.panel.appendChild(header);

            // 버튼 영역
            const btnArea = document.createElement('div');
            btnArea.style.display = 'flex';
            btnArea.style.flexDirection = 'column';
            btnArea.style.gap = '10px';
            btnArea.style.padding = '16px';
            btnArea.style.background = 'none';
            btnArea.style.flex = '0 0 auto';
            btnArea.style.height = '55px'; // 고정 높이


            // SOOP 검색 버튼
            this.soopSyncBtn = document.createElement('button');
            this.soopSyncBtn.innerText = 'SOOP 검색';
            this.soopSyncBtn.style.background = '#00d564';
            this.soopSyncBtn.style.color = 'white';
            this.soopSyncBtn.style.border = 'none';
            this.soopSyncBtn.style.borderRadius = '5px';
            this.soopSyncBtn.style.padding = '10px 0';
            this.soopSyncBtn.style.fontSize = '15px';
            this.soopSyncBtn.style.fontWeight = 'bold';
            this.soopSyncBtn.style.cursor = 'pointer';
            this.soopSyncBtn.addEventListener('click', () => {
                this.showSearchIframe();
            });
            btnArea.appendChild(this.soopSyncBtn);

            this.panel.appendChild(btnArea);

            // iframe
            this.iframe = document.createElement('iframe');
            this.iframe.id = 'soop-search-iframe';
            this.iframe.style.flex = '1 1 0%';
            this.iframe.style.minHeight = '0';
            this.iframe.style.width = '100%';
            this.iframe.style.border = 'none';
            this.iframe.style.borderRadius = '0 0 10px 10px';
            this.iframe.style.backgroundColor = 'white';
            this.iframe.style.display = 'none';
            this.iframe.style.margin = '0';
            this.iframe.style.padding = '0';
            this.panel.appendChild(this.iframe);

            document.body.appendChild(this.panel);
        }
        createToggleBtn() {
            this.toggleBtn = document.createElement('button');
            this.toggleBtn.id = 'soop-panel-toggle-btn';
            this.toggleBtn.innerHTML = '▲VOD Sync';
            this.toggleBtn.style.position = 'fixed';
            this.toggleBtn.style.top = '290px'; // 패널 top(80px) + 패널 height/2(210px)
            this.toggleBtn.style.transform = 'translateY(-50%) rotate(-90deg)';
            this.toggleBtn.style.transformOrigin = 'center center';
            this.toggleBtn.style.width = '160px';
            this.toggleBtn.style.height = '48px';
            this.toggleBtn.style.fontSize = '15px';
            this.toggleBtn.style.textAlign = 'center';
            this.toggleBtn.style.lineHeight = '1.2';
            this.toggleBtn.style.background = '#00d564';
            this.toggleBtn.style.color = 'white';
            this.toggleBtn.style.border = 'none';
            this.toggleBtn.style.borderRadius = '8px 0 0 8px';
            this.toggleBtn.style.fontWeight = 'bold';
            this.toggleBtn.style.cursor = 'pointer';
            this.toggleBtn.style.zIndex = '10001';
            this.toggleBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
            this.toggleBtn.style.transition = 'right 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.3s';
            this.toggleBtn.addEventListener('click', () => {
                this.togglePanel();
            });
            document.body.appendChild(this.toggleBtn);
        }
        togglePanel() {
            if (this.isPanelOpen) {
                this.closePanel();
            } else {
                this.openPanel();
            }
        }
        openPanel() {
            this.panel.style.right = '0';
            this.panel.style.opacity = '1';
            this.toggleBtn.innerHTML = '▼ VOD Sync';
            this.toggleBtn.style.right = '282px'; // 패널 width - 버튼 height/2
            this.isPanelOpen = true;
        }
        closePanel() {
            this.panel.style.right = '-340px';
            this.panel.style.opacity = '0.1';
            this.toggleBtn.innerHTML = '▲ VOD Sync';
            this.toggleBtn.style.right = '-56px';
            this.isPanelOpen = false;
        }
        showSearchIframe() {
            if (!tsManager || !tsManager.isControllableState) {
                alert("VOD 정보를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.");
                return;
            }
            const currentDateTime = tsManager.getCurDateTime();
            if (!currentDateTime) {
                alert("현재 재생 시간을 가져올 수 없습니다.");
                return;
            }
            this.iframe.style.display = 'block';
            // iframe에 타임스탬프 정보 전달
            const targetTimestamp = currentDateTime.getTime();
            const url = new URL(`https://www.sooplive.co.kr/search`);
            url.searchParams.set('only_search', '1');
            url.searchParams.set("p_request", "GET_SOOP_VOD_FROM_CHZZK");
            url.searchParams.set("request_vod_ts", `${targetTimestamp}`);
            this.iframe.src = url.toString();
            log('SOOP 검색창 열기, 타임스탬프:', new Date(targetTimestamp).toLocaleString());
        }
        // 마우스 입력에 따라 투명화
        setupMouseTracking() {
            // 패널 위에 마우스가 올라가면 투명화 방지
            let isMouseOnPanel = false;
            this.panel.addEventListener('mouseenter', () => {
                isMouseOnPanel = true;
                this.showPanel();
            });
            this.panel.addEventListener('mouseleave', () => {
                isMouseOnPanel = false;
            });

            document.addEventListener('mousemove', () => {
                this.lastMouseMoveTime = Date.now();
                this.showPanel();
            });
            document.addEventListener('mouseleave', () => {
                this.hidePanel();
            });
            this.mouseCheckInterval = setInterval(() => {
                const currentTime = Date.now();
                const timeSinceLastMove = currentTime - this.lastMouseMoveTime;
                if (timeSinceLastMove >= 2000 && this.isPanelVisible && !isMouseOnPanel) {
                    this.hidePanel();
                }
            }, 200);
        }
        showPanel() {
            this.panel.style.transition = 'opacity 0.3s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
            this.panel.style.opacity = '1';
            if (this.toggleBtn) {
                this.toggleBtn.style.transition = 'opacity 0.3s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
                this.toggleBtn.style.opacity = '1';
            }
            this.isPanelVisible = true;
        }
        hidePanel() {
            this.panel.style.transition = 'opacity 0.5s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
            this.panel.style.opacity = '0.1';
            if (this.toggleBtn) {
                this.toggleBtn.style.transition = 'opacity 0.5s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
                this.toggleBtn.style.opacity = '0.1';
            }
            this.isPanelVisible = false;
            this.closePanel();
        }
        handleSoopVodList(vodLinks, request_vod_ts, request_real_ts) {
            for (let i = 0; i < vodLinks.length; i++) {
                const link = vodLinks[i];
                const url = new URL(link);
                url.searchParams.delete('change_second');
                url.searchParams.set('request_vod_ts', request_vod_ts);
                url.searchParams.set('request_real_ts', request_real_ts);
                window.open(url, "_blank");
                log('SOOP VOD 열기:', url.toString());
            }
        }
    }


    // URL 파라미터에서 change_second 읽기
    const urlParams = new URLSearchParams(window.location.search);
    const changeSecond = urlParams.get('change_second');
    
    if (changeSecond) {
        log('change_second 파라미터 감지:', changeSecond);
        
        // tsManager가 초기화되고 비디오 정보를 가져온 후에 시간 변경 실행
        const checkAndJump = () => {
            if (tsManager.videoInfo && tsManager.playTimeTag) {
                const streamPeriod = tsManager.getStreamPeriod();
                if (streamPeriod) {
                    const [streamStartDateTime] = streamPeriod;
                    const targetTime = streamStartDateTime.getTime() + parseInt(changeSecond) * 1000;
                    
                    log('타겟 시간으로 점프:', new Date(targetTime).toLocaleString());
                    tsManager.moveToGlobalTS(targetTime, false);
                    
                    // URL에서 change_second 파라미터 제거
                    const url = new URL(window.location.href);
                    url.searchParams.delete('change_second');
                    window.history.replaceState({}, '', url.toString());
                }
            } else {
                // 아직 초기화되지 않았으면 잠시 후 다시 시도
                setTimeout(checkAndJump, 1000);
            }
        };
        
        // 초기 체크 시작
        setTimeout(checkAndJump, 1000);
    }
    
    // SOOP 패널 및 Linker 초기화
    const soopPanel = new SoopPanel();
    
    // 메시지 리스너 추가
    window.addEventListener('message', (event) => {
        if (event.data.response === "VOD_LIST") {
            log("SOOP VOD 리스트 받음:", event.data.resultVODLinks);
            const curDateTime = tsManager.getCurDateTime();
            if (curDateTime){
                soopPanel.handleSoopVodList(event.data.resultVODLinks, curDateTime.getTime(), Date.now());
            }
        }
    });
    
    log("Chzzk VOD Timestamp Manager initialized");
}
