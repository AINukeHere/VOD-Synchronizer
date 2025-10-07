import { IVodSync } from './base_class.js';
// ===================== BasePanel 부모 클래스 =====================
export class BaseSyncPanel extends IVodSync {
    constructor(config) {
        super();
        this.config = {
            id: config.id,
            title: config.title,
            color: config.color,
            width: config.width || '340px',
            height: config.height || '520px',
            top: config.top || '80px',
            toggleBtnText: config.toggleBtnText,
            toggleBtnWidth: config.toggleBtnWidth || '160px',
            toggleBtnTop: config.toggleBtnTop || '340px'
        };
        
        this.panel = null;
        this.toggleBtn = null;
        this.iframe = null;
        this.isPanelOpen = false;
        this.isPanelVisible = true;
        this.lastMouseMoveTime = Date.now();
        this.mouseCheckInterval = null;
        
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
        header.style.color = this.config.color === '#00d564' ? 'black' : 'white';
        header.style.fontWeight = 'bold';
        header.style.fontSize = '16px';
        header.style.padding = '10px 16px';
        header.style.borderRadius = '8px 0 0 0';
        header.innerText = this.config.title;
        this.panel.appendChild(header);

        // 버튼 영역 (자식 클래스에서 오버라이드)
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

    // 자식 클래스에서 오버라이드할 메서드
    createButtonArea() {
        this.buttonArea = document.createElement('div');
        this.buttonArea.style.display = 'flex';
        this.buttonArea.style.flexDirection = 'column';
        this.buttonArea.style.gap = '10px';
        this.buttonArea.style.padding = '16px';
        this.buttonArea.style.background = 'none';
        this.buttonArea.style.flex = '0 0 auto';
        this.buttonArea.style.height = '55px';
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
        this.toggleBtn.style.color = this.config.color === '#00d564' ? 'black' : 'white';
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

    // 자식 클래스에서 오버라이드할 메서드들
    startSearchWithIframe() {
        throw new Error('startSearchWithIframe must be implemented by subclass');
    }

    handleVodList(vodLinks) {
        throw new Error('handleVodList must be implemented by subclass');
    }
} 