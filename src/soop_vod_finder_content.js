if (window !== top){
    function log(...data){
        logToExtension('[soop_vod_finder_content.js]', ...data);
    }
    
    // 메인 실행 로직
    log('in iframe');
    const params = new URLSearchParams(window.location.search);
    const p_request = params.get("p_request");
    const pageNum = parseInt(params.get("page") || "1");
    
    if (p_request === "GET_VOD_LIST") {
        const request_vod_ts = params.get("request_vod_ts");
        const request_vod_datetime = new Date(parseInt(request_vod_ts));
        
        // 클래스 로더를 통해 필요한 클래스들 로드
        window.VODSync.classLoader.loadClasses({
            'PageOneVodManager': 'src/module/soop_vod_finder.js',
            'ChildPageVodManager': 'src/module/soop_vod_finder.js'
        }).then(classes => {
            if (pageNum === 1) {
                // 페이지 1: 메인 매니저 실행
                const pageOneManager = new classes.PageOneVodManager(request_vod_datetime);
                pageOneManager.start();
            } else {
                // 페이지 2 이상: 자식 페이지 매니저 실행
                const childManager = new classes.ChildPageVodManager(request_vod_datetime);
                childManager.start();
            }
        }).catch(error => {
            log('클래스 로드 실패:', error);
        });
    }
}
