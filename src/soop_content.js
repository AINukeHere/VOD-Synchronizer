if (window == top) {
    let tsManager = null;
    let vodLinker = null;
    let chzzkPanel = null;
    let rpPanel = null;
    
    function log(...data){
        logToExtension('[soop_content.js:top]', ...data);
    }
    log('loaded');

    // 설정에 따라 기능 초기화
    async function initializeFeatures() {
        // SOOP 플랫폼에서 필요한 클래스들 구성
        const classConfig = {
            'SoopTimestampManager': 'src/module/soop_timestamp_manager.js',
            'SoopVODLinker': 'src/module/soop_vod_linker.js',
            'ChzzkSyncPanel': 'src/module/chzzk_sync_panel.js', // 아직 미구현
            'RPNicknamePanel': 'src/module/rp_nickname_panel.js'
        };
        
        // 클래스 로더를 통해 필요한 클래스들 로드
        const classes = await window.VODSync.classLoader.loadClasses(classConfig);

        // 필요한 클래스들 생성
        tsManager = new classes.SoopTimestampManager();
        vodLinker = new classes.SoopVODLinker();
        chzzkPanel = new classes.ChzzkSyncPanel();
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
        await window.VODSync.SettingsManager.waitForLoad();
        
        await updateFeaturesState(classes);
        
        // 설정 변경 감지
        window.VODSync.SettingsManager.onSettingsChanged(async (newSettings) => {
            log('설정 변경 감지, 기능 업데이트 중...');
            await updateFeaturesState(classes);
        });

    }
    // 기능 업데이트 함수
    async function updateFeaturesState(classes) {
        const enableChzzkPanel = false; // 미구현 TODO: 구현필요
        // const enableChzzkPanel = await window.VODSync.SettingsManager.isFeatureEnabled('enableSoopChzzkPanel');
        const enableRpPanel = await window.VODSync.SettingsManager.isFeatureEnabled('enableRpPanel');
        const enableTimestamp = await window.VODSync.SettingsManager.isFeatureEnabled('enableTimestamp');

        //origin에 따라 기능 모듈 로드
        const origin = window.location.origin;
        log('기능 업데이트:', {
            enableChzzkPanel,
            enableRpPanel,
            enableTimestamp
        });

        // CHZZK 패널 토글
        if (enableChzzkPanel) {
            log('CHZZK 패널 활성화');
            chzzkPanel.closePanel();
        } else {
            log('CHZZK 패널 비활성화');
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
else {    
    function log(...data){
        logToExtension('[soop_content.js:iframe]', ...data);
    }
    log('loaded');

    // SOOP 플랫폼에서 필요한 클래스들 구성
    const classConfig = {
        'SoopStreamerIDManager': 'src/module/soop_streamer_id_manager.js',
        'SoopVODFinder': 'src/module/soop_vod_finder.js'
    };
    window.VODSync.classLoader.loadClasses(classConfig).then(classes => {
        const soopVODFinder = new classes.SoopVODFinder();
        if (!soopVODFinder.isInitialized) {
            new classes.SoopStreamerIDManager();
        }
    });
}