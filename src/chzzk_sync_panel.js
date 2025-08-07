// ===================== CHZZK 동기화 패널 클래스 =====================
import { BaseSyncPanel } from './base_panel.js';

export class ChzzkSyncPanel extends BaseSyncPanel {
    constructor() {
        super({
            id: 'chzzk-sync-panel',
            title: 'CHZZK 스트리머와 동기화',
            color: '#00d564', // 치지직 초록
            toggleBtnText: 'CHZZK 동기화',
            toggleBtnWidth: '160px',
            toggleBtnTop: '340px'
        });
        
        this.chzzkSyncBtn = null;
        
        // 메시지 리스너 추가
        window.addEventListener('message', (event) => {
            if (event.data.response === "CHZZK_VOD") {
                if (window.logManager) {
                    window.logManager.log('[chzzk_sync_panel] CHZZK VOD 받음:', event.data.vod_link);
                } else {
                    console.log('[chzzk_sync_panel] CHZZK VOD 받음:', event.data.vod_link);
                }
                this.handleChzzkVodLink(event.data.vod_link);
            }
            else if (event.data.response === "CHZZK_VOD_NOT_FOUND"){
                if (window.logManager) {
                    window.logManager.log('[chzzk_sync_panel] CHZZK VOD를 찾지 못했다고 응답받음. 사유:',event.data.reason);
                } else {
                    console.log('[chzzk_sync_panel] CHZZK VOD를 찾지 못했다고 응답받음. 사유:',event.data.reason);
                }
                alert("동기화 가능한 VOD를 찾지 못했습니다.");
            }
            else if (event.data.response === 'CHZZK_VOD_FINDER_STATUS'){
                this.chzzkSyncBtn.innerText = `${event.data.pageNum}페이지에서 ${BTN_TEXT_FINDING_VOD}[${event.data.retryCount}]`;
            }
        });
    }

    createButtonArea() {
        super.createButtonArea();
        
        // CHZZK 검색 버튼
        this.chzzkSyncBtn = document.createElement('button');
        this.chzzkSyncBtn.innerText = 'CHZZK 검색';
        this.chzzkSyncBtn.style.background = this.config.color;
        this.chzzkSyncBtn.style.color = 'black';
        this.chzzkSyncBtn.style.border = 'none';
        this.chzzkSyncBtn.style.borderRadius = '5px';
        this.chzzkSyncBtn.style.padding = '10px 0';
        this.chzzkSyncBtn.style.fontSize = '15px';
        this.chzzkSyncBtn.style.fontWeight = 'bold';
        this.chzzkSyncBtn.style.cursor = 'pointer';
        this.chzzkSyncBtn.addEventListener('click', async () => {
            await this.startSearchWithIframe();
        });
        this.buttonArea.appendChild(this.chzzkSyncBtn);
    }

    async startSearchWithIframe() {
        // VODSync 네임스페이스를 통해 tsManager 접근
        const tsManager = window.VODSync?.tsManager;
        
        if (!tsManager || !tsManager.isControllableState) {
            alert("현재 VOD 정보를 가져올 수 없습니다. 타임스탬프 표시 기능이 켜져있는지 확인하세요.");
            return;
        }
        const currentDateTime = tsManager.getCurDateTime();
        if (!currentDateTime) {
            alert("현재 VOD의 라이브 당시 시간을 가져올 수 없습니다.");
            return;
        }
        this.iframe.style.display = 'block';
        // iframe에 타임스탬프 정보 전달
        const targetTimestamp = currentDateTime.getTime();
        const url = new URL(`https://chzzk.naver.com/search`);
        url.searchParams.set('keyword', '');
        url.searchParams.set('p_request', 'GET_CHZZK_VOD_FROM_SOOP');
        url.searchParams.set('request_vod_ts', `${targetTimestamp}`);
        this.iframe.src = url.toString();
        if (window.logManager) {
            window.logManager.log('[chzzk_sync_panel] CHZZK 검색창 열기, 타임스탬프:', new Date(targetTimestamp).toLocaleString());
        } else {
            console.log('[chzzk_sync_panel] CHZZK 검색창 열기, 타임스탬프:', new Date(targetTimestamp).toLocaleString());
        }
    }

    async handleChzzkVodLink(vod_link) {
        // VODSync 네임스페이스를 통해 tsManager 접근
        const tsManager = window.VODSync?.tsManager;
        
        const curTS = tsManager.getCurDateTime().getTime();
        const url = new URL(vod_link);
        url.searchParams.set('request_vod_ts', curTS);
        if (tsManager.isPlaying())
            url.searchParams.set('request_real_ts', Date.now());
        if (window.logManager) {
            window.logManager.log(`[chzzk_sync_panel] CHZZK VOD 열기: ${url.toString()}`);
        } else {
            console.log(`[chzzk_sync_panel] CHZZK VOD 열기: ${url.toString()}`);
        }
        window.open(url, "_blank");
    }
} 