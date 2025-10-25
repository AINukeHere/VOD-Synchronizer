// SOOP 플랫폼에서 실행되는 경우
if (window == top) {
    let tsManager = null;
    let chzzkPanel = null;
    let rpPanel = null;
    let cachedSettings = {};
    
    function log(...data){
        logToExtension('[soop_content.js:top]', ...data);
    }
    log('loaded');


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
            'OtherPlatformSyncPanel': 'src/module/other_platform_sync_panel.js',
            'RPNicknamePanel': 'src/module/rp_nickname_panel.js'
        };
        
        // 클래스 로더를 통해 필요한 클래스들 로드
        const classes = await window.VODSync.classLoader.loadClasses(classConfig);

        // 필요한 클래스들 생성
        new classes.SoopAPI();
        tsManager = new classes.SoopTimestampManager();
        chzzkPanel = new classes.OtherPlatformSyncPanel('soop');
        rpPanel = new classes.RPNicknamePanel();


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
        
        // 설정 로딩이 완료될 때까지 기다림
        await getAllSettings();
        
        updateFeaturesState();
        
        // 설정 변경 감지
        const tabInfo = await chrome.runtime.sendMessage({ action: 'getTabId' });
        await chrome.runtime.sendMessage({ action: 'addChangeCallback', tabId: tabInfo.tabId});
        chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
            if (message.action === 'notifyChangeCallbacks') {
                log('설정 변경 감지, 기능 업데이트 중...');
                // 캐싱된 설정 갱신
                cachedSettings = message.settings;
                updateFeaturesState();
            }
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
            chzzkPanel.closePanel();
        } else {
            log('동기화 패널 비활성화');
            chzzkPanel.hideCompletely();
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