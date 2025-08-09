// ===================== SOOP 동기화 패널 클래스 =====================
import { BaseSyncPanel } from './base_panel.js';

export class SoopSyncPanel extends BaseSyncPanel {
    constructor() {
        super({
            id: 'soop-sync-panel',
            title: 'SOOP 스트리머와 동기화',
            color: '#007bff', // 파랑
            toggleBtnText: 'SOOP과 동기화',
            toggleBtnWidth: '180px',
            toggleBtnTop: '290px'
        });
        
        this.soopSyncBtn = null;
        
        // 메시지 리스너 추가
        window.addEventListener('message', (event) => {
            if (event.data.response === "SOOP_VOD_LIST") {
                logToExtension('[soop_sync_panel] SOOP VOD 리스트 받음:', event.data.resultVODLinks);
                this.handleSoopVodList(event.data.resultVODLinks);
            }
        });
    }

    createButtonArea() {
        super.createButtonArea();
        
        // SOOP 검색 버튼
        this.soopSyncBtn = document.createElement('button');
        this.soopSyncBtn.innerText = 'SOOP 검색';
        this.soopSyncBtn.style.background = this.config.color;
        this.soopSyncBtn.style.color = 'white';
        this.soopSyncBtn.style.border = 'none';
        this.soopSyncBtn.style.borderRadius = '5px';
        this.soopSyncBtn.style.padding = '10px 0';
        this.soopSyncBtn.style.fontSize = '15px';
        this.soopSyncBtn.style.fontWeight = 'bold';
        this.soopSyncBtn.style.cursor = 'pointer';
        this.soopSyncBtn.addEventListener('click', () => this.startSearchWithIframe());
        this.buttonArea.appendChild(this.soopSyncBtn);
    }

    startSearchWithIframe() {
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
        const url = new URL(`https://www.sooplive.co.kr/search`);
        url.searchParams.set('only_search', '1');
        url.searchParams.set("p_request", "GET_SOOP_VOD_FROM_CHZZK");
        url.searchParams.set("request_vod_ts", `${targetTimestamp}`);
        this.iframe.src = url.toString();
        logToExtension('[soop_sync_panel] SOOP 검색창 열기, 타임스탬프:', new Date(targetTimestamp).toLocaleString());
    }

    async handleSoopVodList(vodLinks) {
        if (vodLinks.length == 0){
            alert('동기화 가능한 VOD가 없습니다.');
            return;
        }
        // VODSync 네임스페이스를 통해 tsManager 접근
        const tsManager = window.VODSync?.tsManager;
        
        const curDateTime = tsManager.getCurDateTime();
        if (curDateTime){
            const request_vod_ts = curDateTime.getTime();
            const request_real_ts = Date.now();
            const isPlaying = tsManager.isPlaying();
            for (let i = 0; i < vodLinks.length; i++) {
                const link = vodLinks[i];
                const url = new URL(link);
                url.searchParams.delete('change_second');
                url.searchParams.set('request_vod_ts', request_vod_ts);
                if (isPlaying){
                    url.searchParams.set('request_real_ts', request_real_ts);
                }
                window.open(url, "_blank");
                logToExtension('[soop_sync_panel] SOOP VOD 열기:', url.toString());
            }
        }
    }
} 