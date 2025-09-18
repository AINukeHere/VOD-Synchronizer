if (window !== top){
    function log(...data){
        logToExtension('[soop_vod_finder_content.js]', ...data);
    }
    
    // 메인 실행 로직
    log('in iframe');
}
