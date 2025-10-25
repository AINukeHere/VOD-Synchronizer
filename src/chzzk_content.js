// CHZZK 플랫폼에서 실행되는 경우
if (window == top) {
    let tsManager = null;
    let chzzkVodLinker = null;
    let lastIsVodPage = null;
    let syncPanel = null;
    let rpPanel = null;

    function log(...data){
        logToExtension('[chzzk_content.js:outframe]', ...data);
    }

    // URL 파라미터 처리
    const urlParams = new URLSearchParams(window.location.search);
    const changeSecond = urlParams.get('change_second');
    const url_request_vod_ts = urlParams.get("request_vod_ts");
    const url_request_real_ts = urlParams.get("request_real_ts");
    
    // URL 파라미터 처리를 위한 함수
    function handleUrlParameters() {
        if (changeSecond) {
            log('change_second 파라미터 감지:', changeSecond);            
            tsManager.RequestLocalTSAsync(parseInt(changeSecond));
                        
            // URL에서 change_second 파라미터 제거
            const url = new URL(window.location.href);
            url.searchParams.delete('change_second');
            window.history.replaceState({}, '', url.toString());
        }
        if (url_request_vod_ts){
            const request_vod_ts = parseInt(url_request_vod_ts);
            if (url_request_real_ts){ // 페이지 로딩 시간을 추가해야하는 경우.
                const request_real_ts = parseInt(url_request_real_ts);
                tsManager?.RequestGlobalTSAsync(request_vod_ts, request_real_ts);
            }
            else{
                tsManager?.RequestGlobalTSAsync(request_vod_ts);
            }
            
            // url 지우기
            const url = new URL(window.location.href);
            url.searchParams.delete('request_vod_ts');
            url.searchParams.delete('request_real_ts');
            window.history.replaceState({}, '', url.toString());
        }
    }    
    
    // 설정에 따라 기능 초기화
    async function initializeFeatures() {
        // CHZZK 플랫폼에서 필요한 클래스들 구성
        const classConfig = {
            'ChzzkAPI': 'src/module/chzzk_api.js',
            'ChzzkTimestampManager': 'src/module/chzzk_timestamp_manager.js',
            'ChzzkVODLinker': 'src/module/chzzk_vod_linker.js',
            'OtherPlatformSyncPanel': 'src/module/other_platform_sync_panel.js',
            'RPNicknamePanel': 'src/module/rp_nickname_panel.js',
        };
        
        // 클래스 로더를 통해 필요한 클래스들 로드
        const classes = await window.VODSync.classLoader.loadClasses(classConfig);
        
        // 필요한 클래스들 생성
        new classes.ChzzkAPI();
        tsManager = new classes.ChzzkTimestampManager();
        chzzkVodLinker = new classes.ChzzkVODLinker();
        syncPanel = new classes.OtherPlatformSyncPanel('chzzk');
        rpPanel = new classes.RPNicknamePanel();
    
        // URL 파라미터 처리
        handleUrlParameters();

        // 설정 로딩이 완료될 때까지 기다림
        await window.VODSync.SettingsManager.waitForLoad();
        
        await updateFeaturesState();
        
        // 설정 변경 감지
        window.VODSync.SettingsManager.onSettingsChanged(async (newSettings) => {
            log('설정 변경 감지, 기능 업데이트 중...');
            await updateFeaturesState();
        });
    }

    
    // 기능 업데이트 함수
    async function updateFeaturesState() {
        const enableSyncPanel = await window.VODSync.SettingsManager.isFeatureEnabled('enableSyncPanel');
        const enableRpPanel = await window.VODSync.SettingsManager.isFeatureEnabled('enableRpPanel');
        const enableTimestamp = await window.VODSync.SettingsManager.isFeatureEnabled('enableTimestamp');

        log('기능 업데이트:', {
                enableSyncPanel,
                enableRpPanel,
                enableTimestamp
            });

        // 타 플랫폼 동기화 패널 토글
        if (enableSyncPanel) {
            log('타 플랫폼 동기화 패널 활성화');
            syncPanel.closePanel();
        } else {
            log('타 플랫폼 동기화 패널 비활성화');
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

    // VOD 플레이어 페이지 여부를 지속적으로 갱신
    function checkVodPageAndTogglePanel() {
        const isVodPage = window.location.pathname.includes('/video/');
        if (isVodPage !== lastIsVodPage) {
            lastIsVodPage = isVodPage;
            // 상태가 바뀔때 패널을 숨기거나 표시함.
            if (isVodPage) {
                if (syncPanel) syncPanel.closePanel();
                if (rpPanel) rpPanel.closePanel();
            } else {
                if (syncPanel) syncPanel.hideCompletely();
                if (rpPanel) rpPanel.hideCompletely();
            }
        }
    }
    setInterval(checkVodPageAndTogglePanel, 500);
}
// 타 플랫폼에서 실행되는 경우(iframe)
else{
    function log(...data){
        logToExtension('[chzzk_content.js:iframe]', ...data);
    }
    log('loaded');

    // 필요한 클래스들 구성
    const classConfig = {
        'ChzzkAPI': 'src/module/chzzk_api.js',
        'ChzzkVODLinker': 'src/module/chzzk_vod_linker.js',
    };
    window.VODSync.classLoader.loadClasses(classConfig).then(classes => {
        new classes.ChzzkAPI();
        new classes.ChzzkVODLinker(true);
    });
}