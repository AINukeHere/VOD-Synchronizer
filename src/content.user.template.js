// ==UserScript==
// @name         VOD Synchronizer (SOOP-SOOP 동기화)
// @namespace    http://tampermonkey.net/
// @version      0.4.3
// @description  SOOP 다시보기 타임스탬프 표시 및 다른 스트리머의 다시보기와 동기화
// @author       AINukeHere
// @match        https://vod.sooplive.co.kr/*
// @match        https://www.sooplive.co.kr/*
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // 간소화된 로깅 함수
    function logToExtension(...data) {
        console.debug(`[${new Date().toLocaleString()}]`, ...data);
    }
    function warnToExtension(...data) {
        logToExtension(...data);
    }
    function errorToExtension(...data) {
        logToExtension(...data);
    }
    function debugToExtension(...data) {
        logToExtension(...data);
    }
    if (window.top !== window.self) return;

    // 메인 페이지에서 실행되는 경우 (vod.sooplive.co.kr)
    if (window.location.hostname === 'vod.sooplive.co.kr') {
        {{IVodSync}}
        {{SoopAPI}}
        const isChromeExtension = false;
        {{TimestampManagerBase}}
        const MAX_DURATION_DIFF = 30*1000;
        {{SoopTimestampManager}}
        {{VODLinkerBase}}
        {{SoopVODLinker}}

        new SoopAPI();
        const tsManager = new SoopTimestampManager();
        new SoopVODLinker();
        
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
    }
})(); 