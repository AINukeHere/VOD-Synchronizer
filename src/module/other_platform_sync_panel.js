import { IVodSync } from './interface4log.js';

// ===================== Other Platform 동기화 패널 클래스 =====================
export class OtherPlatformSyncPanel extends IVodSync {
    constructor(currentPlatform) {
        super();
        
        // 현재 플랫폼에 따라 설정 결정
        this.currentPlatform = currentPlatform; // 'chzzk' 또는 'soop'
        
        // 지원하는 모든 플랫폼 정의
        // 새로운 플랫폼 추가 시 여기에만 추가하면 됨 (예: 'youtube', 'twitch' 등)
        this.supportedPlatforms = ['chzzk', 'soop'];
        
        // 플랫폼별 정보 딕셔너리
        this.platformInfo = {
            chzzk: {
                name: 'CHZZK 검색',
                color: '#00d564',
                textColor: 'black',
                searchUrl: 'https://chzzk.naver.com/search'
            },
            soop: {
                name: 'SOOP 검색',
                color: '#007bff',
                textColor: 'white',
                searchUrl: 'https://www.sooplive.co.kr/search'
            }
        };
        
        // 현재 플랫폼을 제외한 대상 플랫폼들 계산
        this.targetPlatforms = this.supportedPlatforms.filter(platform => platform !== this.currentPlatform);
        
        // 현재 플랫폼 색상 가져오기
        const currentPlatformColor = this.platformInfo[this.currentPlatform].color;
        const currentPlatformTextColor = this.platformInfo[this.currentPlatform].textColor;
        
        this.config = {
            id: 'other-platform-sync-panel',
            title: '타 플랫폼과 동기화',
            color: currentPlatformColor, // 현재 플랫폼 색상
            textColor: currentPlatformTextColor, // 현재 플랫폼 텍스트 색상
            width: '340px',
            height: '520px',
            top: '80px',
            toggleBtnText: '타 플랫폼과 동기화',
            toggleBtnWidth: '180px',
            toggleBtnTop: '290px'
        };
        
        this.panel = null;
        this.toggleBtn = null;
        this.iframe = null;
        this.isPanelOpen = false;
        this.isPanelVisible = true;
        this.lastMouseMoveTime = Date.now();
        this.mouseCheckInterval = null;
        this.updateInterval = null;
        
        // 플랫폼별 버튼들
        this.platformButtons = {};
        
        // VODSync 네임스페이스에 자동 등록
        window.VODSync = window.VODSync || {};
        window.VODSync.panels = window.VODSync.panels || {};
        if (window.VODSync.panels[this.config.id]) {
            this.warn(`[VODSync] Panel '${this.config.id}'가 이미 존재합니다. 기존 인스턴스를 덮어씁니다.`);
        }
        window.VODSync.panels[this.config.id] = this;
        
        this.init();
    }
    
    init() {
        this.createPanel();
        this.createToggleBtn();
        this.setupMouseTracking();
        this.closePanel(); // 기본값: 접힘
    }
    
    createPanel() {
        this.panel = document.createElement('div');
        this.panel.id = this.config.id;
        this.panel.style.position = 'fixed';
        this.panel.style.top = this.config.top;
        this.panel.style.right = '0';
        this.panel.style.width = this.config.width;
        this.panel.style.height = this.config.height;
        this.panel.style.background = 'rgba(255,255,255,0.98)';
        this.panel.style.border = `2px solid ${this.config.color}`;
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
        header.style.background = this.config.color;
        header.style.color = this.config.textColor;
        header.style.fontWeight = 'bold';
        header.style.fontSize = '16px';
        header.style.padding = '10px 16px';
        header.style.borderRadius = '8px 0 0 0';
        header.innerText = this.config.title;
        this.panel.appendChild(header);

        // 버튼 영역
        this.createButtonArea();
        this.panel.appendChild(this.buttonArea);

        // iframe
        this.iframe = document.createElement('iframe');
        this.iframe.id = `${this.config.id}-iframe`;
        this.iframe.style.flex = '1 1 0%';
        this.iframe.style.minHeight = '0';
        this.iframe.style.width = '100%';
        this.iframe.style.border = 'none';
        this.iframe.style.borderRadius = '0 0 10px 10px';
        this.iframe.style.backgroundColor = 'white';
        this.iframe.style.display = 'none';
        this.iframe.style.margin = '0';
        this.panel.appendChild(this.iframe);

        document.body.appendChild(this.panel);
    }

    createButtonArea() {
        this.buttonArea = document.createElement('div');
        this.buttonArea.style.display = 'flex';
        this.buttonArea.style.flexDirection = 'column';
        this.buttonArea.style.gap = '10px';
        this.buttonArea.style.padding = '16px';
        this.buttonArea.style.background = 'none';
        this.buttonArea.style.flex = '0 0 auto';
        this.buttonArea.style.height = 'auto';
        this.buttonArea.style.minHeight = '55px';

        // 현재 플랫폼을 제외한 모든 지원 플랫폼들의 검색 버튼 생성
        this.createPlatformButtons();
    }

    createPlatformButtons() {
        this.targetPlatforms.forEach(platform => {
            const platformInfo = this.platformInfo[platform];
            this.createPlatformButton(platform, platformInfo.name, platformInfo.color, platformInfo.textColor);
        });
    }

    createPlatformButton(platform, text, color, textColor) {
        const button = document.createElement('button');
        button.innerText = text;
        button.style.background = color;
        button.style.color = textColor;
        button.style.border = 'none';
        button.style.borderRadius = '5px';
        button.style.padding = '10px 0';
        button.style.fontSize = '15px';
        button.style.fontWeight = 'bold';
        button.style.cursor = 'pointer';
        button.addEventListener('click', () => this.startSearchWithIframe(platform));
        
        this.platformButtons[platform] = button;
        this.buttonArea.appendChild(button);
    }

    createToggleBtn() {
        this.toggleBtn = document.createElement('button');
        this.toggleBtn.id = `${this.config.id}-toggle-btn`;
        this.toggleBtn.innerHTML = `▲${this.config.toggleBtnText}`;
        this.toggleBtn.style.position = 'fixed';
        this.toggleBtn.style.top = this.config.toggleBtnTop;
        this.toggleBtn.style.transform = 'translateY(-50%) rotate(-90deg)';
        this.toggleBtn.style.transformOrigin = 'center center';
        this.toggleBtn.style.width = this.config.toggleBtnWidth;
        this.toggleBtn.style.height = '48px';
        this.toggleBtn.style.fontSize = '15px';
        this.toggleBtn.style.textAlign = 'center';
        this.toggleBtn.style.lineHeight = '1.2';
        this.toggleBtn.style.background = this.config.color;
        this.toggleBtn.style.color = this.config.textColor;
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

    startSearchWithIframe(platform) {
        // VODSync 네임스페이스를 통해 tsManager 접근
        const tsManager = window.VODSync?.tsManager;
        
        if (!tsManager || !tsManager.isControllableState) {
            alert("현재 VOD 정보를 가져올 수 없습니다.");
            return;
        }
        
        this.iframe.style.display = 'block';
        
        this.openPlatformSearchWindow(platform);
    }

    openPlatformSearchWindow(platform) {
        const platformInfo = this.platformInfo[platform];
        
        const url = new URL(platformInfo.searchUrl);
        url.searchParams.set('only_search', '1');
        this.iframe.src = url.toString();
        
        this.setupTimestampUpdate();

    }

    setupTimestampUpdate() {
        this.updateInterval = setInterval(() => {
            const currentDateTime = window.VODSync?.tsManager?.getCurDateTime();
            if (!currentDateTime) {
                this.log('타임스탬프 전달 실패');
                return;
            }
            const targetTimestamp = currentDateTime.getTime();
            this.iframe.contentWindow.postMessage({
                response: "SET_REQUEST_VOD_TS",
                request_vod_ts: targetTimestamp,
                request_real_ts: Date.now()
            }, "*");
        }, 500);
    }

    async handleChzzkVodLink(vod_link) {
        // VODSync 네임스페이스를 통해 tsManager 접근
        const tsManager = window.VODSync?.tsManager;
        
        const curTS = tsManager.getCurDateTime().getTime();
        const url = new URL(vod_link);
        url.searchParams.set('request_vod_ts', curTS);
        if (tsManager.isPlaying())
            url.searchParams.set('request_real_ts', Date.now());
        this.log(`[other_platform_sync_panel] CHZZK VOD 열기: ${url.toString()}`);
        window.open(url, "_blank");
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
        this.toggleBtn.innerHTML = `▼ ${this.config.toggleBtnText}`;
        this.toggleBtn.style.right = '272px';
        this.isPanelOpen = true;
    }
    
    closePanel() {
        this.panel.style.right = `-${this.config.width}`;
        this.toggleBtn.innerHTML = `▲ ${this.config.toggleBtnText}`;
        this.toggleBtn.style.right = '-66px';
        this.isPanelOpen = false;
    }

    setupMouseTracking() {
        let isMouseOnPanel = false;
        this.lastMouseMoveTime = Date.now();

        this.panel.addEventListener('mouseenter', () => {
            isMouseOnPanel = true;
            this.showPanelWithOpacity();
        });

        this.panel.addEventListener('mouseleave', () => {
            isMouseOnPanel = false;
        });

        document.addEventListener('mousemove', () => {
            this.lastMouseMoveTime = Date.now();
            this.showPanelWithOpacity();
        });

        document.addEventListener('keydown', () => {
            this.lastMouseMoveTime = Date.now();
            this.showPanelWithOpacity();
        });

        document.addEventListener('mouseleave', () => {
            this.hidePanelWithOpacity();
        });

        this.mouseCheckInterval = setInterval(() => {
            const currentTime = Date.now();
            const timeSinceLastInput = currentTime - this.lastMouseMoveTime;
            if (timeSinceLastInput >= 2000 && this.isPanelVisible && !isMouseOnPanel) {
                this.hidePanelWithOpacity();
            }
        }, 200);
    }

    showPanelWithOpacity() {
        this.panel.style.display = 'flex';
        this.panel.style.transition = 'opacity 0.3s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
        this.panel.style.opacity = '1';
        if (this.toggleBtn) {
            this.toggleBtn.style.display = 'block';
            this.toggleBtn.style.transition = 'opacity 0.3s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
            this.toggleBtn.style.opacity = '1';
        }
        this.isPanelVisible = true;
    }

    hidePanelWithOpacity() {
        this.panel.style.display = 'flex';
        this.panel.style.transition = 'opacity 0.5s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
        this.panel.style.opacity = '0.1';
        if (this.toggleBtn) {
            this.toggleBtn.style.display = 'block';
            this.toggleBtn.style.transition = 'opacity 0.5s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
            this.toggleBtn.style.opacity = '0.1';
        }
        this.isPanelVisible = false;
    }

    hideCompletely() {
        this.panel.style.right = `-${this.config.width}`;
        this.toggleBtn.style.right = `-${this.config.toggleBtnWidth}`;
    }

    // 정리 메서드
    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        if (this.mouseCheckInterval) {
            clearInterval(this.mouseCheckInterval);
        }
        if (this.panel && this.panel.parentNode) {
            this.panel.parentNode.removeChild(this.panel);
        }
        if (this.toggleBtn && this.toggleBtn.parentNode) {
            this.toggleBtn.parentNode.removeChild(this.toggleBtn);
        }
    }
}
