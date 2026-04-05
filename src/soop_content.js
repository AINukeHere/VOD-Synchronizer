window.VODSync = window.VODSync || {};
window.VODSync.SoopUrls = {
    VOD_ORIGIN: 'https://vod.sooplive.com',
    WWW_ORIGIN: 'https://www.sooplive.com',
    ...(window.VODSync.SoopUrls || {}),
};

if (window == top && window.location.origin.includes(new URL(window.VODSync.SoopUrls.VOD_ORIGIN).host)) {
    let tsManager = null;
    let syncPanel = null;
    let rpPanel = null;
    let cachedSettings = {};
    
    function log(...data){
        logToExtension('[soop_content.js:top]', ...data);
    }
    log('loaded');

    /**
     * vodCore ghost: 페이지 MAIN 에 `soop_vodcore_page_bridge.js` 를 ES 모듈로 주입한다.
     * 해당 파일이 `export class VodCorePageBridge` + `mountVodCorePageBridge()` 로 스스로 기동한다.
     */
    function initVodCorePageBridgeHost() {
        window.VODSync = window.VODSync || {};
        window.VODSync.IS_TAMPER_MONKEY_SCRIPT = false;
        const GHOST_ID = '__vs_vodcore_ghost';
        const PAGE_SCRIPT_PATH = 'src/module/soop_vodcore_page_bridge.js';
        let scriptInjected = false;
        let injectUnavailable = false;
        function installPageScript() {
            if (scriptInjected || injectUnavailable) return;
            if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) {
                injectUnavailable = true;
                return;
            }
            scriptInjected = true;
            const url = chrome.runtime.getURL(PAGE_SCRIPT_PATH);
            const s = document.createElement('script');
            s.type = 'module';
            s.src = url;
            s.onload = () => s.remove();
            s.onerror = () => {
                scriptInjected = false;
                console.error(
                    '[VOD-Master] vodCore page bridge failed to load (check manifest web_accessible_resources):',
                    url
                );
            };
            (document.documentElement || document.head || document.body).appendChild(s);
        }
        window.VODSync.vodCoreBridge = {
            GHOST_ID,
            installPageScript,
            getGhost: () => document.getElementById(GHOST_ID),
        };
        // 격리 월드에서는 페이지 vodCore 를 직접 못 읽으므로, 페이지와 같은 접근 형태만 맞춘 퍼사드(실제는 ghost dataset·시크 속성).
        window.VODSync.pageVodCore = {
            playerController: {
                get playingTime() {
                    const g = document.getElementById(GHOST_ID);
                    if (!g || g.dataset.playingTime === '') return NaN;
                    const pt = parseFloat(g.dataset.playingTime);
                    return Number.isFinite(pt) ? Math.max(0, pt) : NaN;
                },
            },
            seek(sec) {
                const g = document.getElementById(GHOST_ID);
                if (!g) return false;
                const s = Math.max(0, Number(sec));
                g.setAttribute('data-vs-seek', String(Number.isFinite(s) ? s : 0));
                return true;
            },
        };
        installPageScript();
    }

    // 설정 관련 함수들
    async function getAllSettings() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getAllSettings' });
            if (response.success) {
                cachedSettings = response.settings;
            }
        } catch (error) {
            console.error('설정 조회 실패:', error);
        }
    }

    // 설정에 따라 기능 초기화
    async function initializeFeatures() {
        // SOOP 플랫폼에서 필요한 클래스들 구성
        const classConfig = {
            'SoopAPI': 'src/module/soop_api.js',
            'SoopTimestampManager': 'src/module/soop_timestamp_manager.js',
            'SoopVODLinker': 'src/module/soop_vod_linker.js',
            'SoopTimelineCommentProcessor': 'src/module/soop_timeline_comment_processor.js',
            'OtherPlatformSyncPanel': 'src/module/other_platform_sync_panel.js',
            'RPNicknamePanel': 'src/module/rp_nickname_panel.js',
            'SoopPrevChatViewer': 'src/module/soop_prev_chat_viewer.js',
            'SoopVeditorReplacement': 'src/module/soop_veditor_replacement.js',
        };
        
        // 클래스 로더를 통해 필요한 클래스들 로드
        const classes = await window.VODSync.classLoader.loadClasses(classConfig);

        // 필요한 클래스들 생성
        new classes.SoopAPI();
        tsManager = new classes.SoopTimestampManager();
        new classes.SoopVODLinker(false);
        if (/\/player\/\d+/.test(window.location.pathname)) {
            new classes.SoopTimelineCommentProcessor();
            new classes.SoopVeditorReplacement();
        }
        syncPanel = new classes.OtherPlatformSyncPanel('soop');
        rpPanel = new classes.RPNicknamePanel();
        new classes.SoopPrevChatViewer();

        initVodCorePageBridgeHost();

        // 동기화 요청이 있는 경우 타임스탬프 매니저에게 요청
        const params = new URLSearchParams(window.location.search);
        const url_request_vod_ts = params.get("request_vod_ts");
        const url_request_real_ts = params.get("request_real_ts");
        if (url_request_vod_ts && tsManager){
            const request_vod_ts = parseInt(url_request_vod_ts);
            if (url_request_real_ts){ // 페이지 로딩 시간을 추가해야하는 경우.
                const request_real_ts = parseInt(url_request_real_ts);
                tsManager.RequestGlobalTSAsync(request_vod_ts, request_real_ts);
            }
            else{
                tsManager.RequestGlobalTSAsync(request_vod_ts);
            }
            
            // url 지우기
            const url = new URL(window.location.href);
            url.searchParams.delete('request_vod_ts');
            url.searchParams.delete('request_real_ts');
            window.history.replaceState({}, '', url.toString());
        }

        // timeline_sync=1 이면 localStorage에서 페이로드 로드 후 URL에서 제거
        const timelineSyncVal = params.get('timeline_sync');
        if (timelineSyncVal) {
            let payload = null;
            try {
                const storageKey = 'vodSync_timeline';
                const raw = localStorage.getItem(storageKey);
                if (raw) {
                    payload = JSON.parse(raw);
                    localStorage.removeItem(storageKey);
                }
            } catch (_) { /* ignore */ }
            if (Array.isArray(payload)) {
                window.VODSync.timelineCommentProcessor?.receiveTimelineSyncPayload?.(payload);
            }
            const url = new URL(window.location.href);
            url.searchParams.delete('timeline_sync');
            window.history.replaceState({}, '', url.toString());
        }

        // 설정 로딩이 완료될 때까지 기다림
        await getAllSettings();
        
        updateFeaturesState();
        
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'notifyChangeCallbacks') {
                log('설정 변경 감지, 기능 업데이트 중...');
                // 캐싱된 설정 갱신
                cachedSettings = message.settings;
                updateFeaturesState();
            }
            sendResponse({ success: true });
            return true;
        });
    }
    // 기능 업데이트 함수
    function updateFeaturesState() {
        const enableSyncPanel = cachedSettings.enableSyncPanel || false;
        const enableRpPanel = cachedSettings.enableRpPanel || false;
        const enableTimestamp = cachedSettings.enableTimestamp || false;

        log('기능 업데이트:', {
            enableSyncPanel,
            enableRpPanel,
            enableTimestamp
        });

        // 동기화 패널 토글
        if (enableSyncPanel) {
            log('동기화 패널 활성화');
            syncPanel.closePanel();
        } else {
            log('동기화 패널 비활성화');
            syncPanel.hideCompletely();
        }

        // RP 패널 토글
        if (enableRpPanel) {
            log('RP 패널 활성화');
            rpPanel.closePanel();
        } else {
            log('RP 패널 비활성화');
            rpPanel.hideCompletely();
        }

        // 타임스탬프 매니저 초기화
        if (enableTimestamp) {
            log('타임스탬프 매니저 활성화');
            tsManager.enable();
        } else {
            log('타임스탬프 매니저 비활성화');
            tsManager.disable();
        }
    }

    // 기능 초기화 실행
    initializeFeatures().catch(error => {
        log('기능 초기화 중 오류 발생:', error);
    });

}
// 타 플랫폼에서 실행되는 경우(iframe)
else {
    function log(...data){
        logToExtension('[soop_content.js:iframe]', ...data);
    }
    log('loaded');

    // 필요한 클래스들 구성
    const classConfig = {
        'SoopAPI': 'src/module/soop_api.js',
        'SoopVODLinker': 'src/module/soop_vod_linker.js'
    };
    window.VODSync.classLoader.loadClasses(classConfig).then(classes => {
        new classes.SoopAPI();
        new classes.SoopVODLinker(true);
    });
}