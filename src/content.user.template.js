// ==UserScript==
// @name         VOD Master (SOOP)
// @namespace    http://tampermonkey.net/
// @version      1.5.7.1
// @description  SOOP 다시보기 타임스탬프 표시 및 다른 스트리머의 다시보기와 동기화
// @author       AINukeHere
// @match        https://vod.sooplive.com/*
// @match        https://www.sooplive.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_info
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

    // 환경 구분용 전역 변수 (탬퍼몽키 환경)
    window.VODSync = window.VODSync || {};
    window.VODSync.IS_TAMPER_MONKEY_SCRIPT = true;
    const GITHUB_RAW_URL = "https://raw.githubusercontent.com/AINukeHere/VOD-Master/main";

    // 메인 페이지에서 실행되는 경우 (vod.sooplive.com)
    if (window.location.hostname === 'vod.sooplive.com') {
        {{IVodSync}}
        {{SoopAPI}}
        {{TimestampManagerBase}}
        // 탬퍼몽키: vodCore 페이지 브리지 없음. SoopTimestampManager._getVodCoreGhost() 가 IS_TAMPER_MONKEY_SCRIPT 일 때 ghost 를 쓰지 않음.
        const MAX_DURATION_DIFF = 30*1000;
        {{SoopTimestampManager}}
        {{VODLinkerBase}}
        {{SoopVODLinker}}
        {{TimelineCommentProcessorBase}}
        {{SoopTimelineCommentProcessor}}
        {{SoopPrevChatViewer}}
        // {{SoopVeditorReplacement}}

        new SoopAPI();
        const tsManager = new SoopTimestampManager();
        new SoopVODLinker();
        if (/\/player\/\d+/.test(window.location.pathname)) {
            new SoopTimelineCommentProcessor();
            // new SoopVeditorReplacement();
        }
        new SoopPrevChatViewer();
        
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
    }

    // ===================== 탬퍼몽키 업데이트 알림 =====================
    (function initUpdateNotificationTM() {
        if (typeof GM_info === 'undefined' || !GM_info.script || typeof GM_getValue !== 'function' || typeof GM_setValue !== 'function') return;

        function compareVersions(version1, version2) {
            const v1parts = version1.split('.').map(Number);
            const v2parts = version2.split('.').map(Number);
            for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
                const v1part = v1parts[i] || 0;
                const v2part = v2parts[i] || 0;
                if (v1part > v2part) return 1;
                if (v1part < v2part) return -1;
            }
            return 0;
        }
        // 네 번째 자릿수만 바뀐 경우 false. 메이저·마이너·패치가 바뀌면 true.
        function shouldShowUpdateNotification(oldVersion, newVersion) {
            const oldParts = (oldVersion || '').split('.').map(Number);
            const newParts = (newVersion || '').split('.').map(Number);
            const oldMajor = oldParts[0] || 0, oldMinor = oldParts[1] || 0, oldPatch = oldParts[2] || 0;
            const newMajor = newParts[0] || 0, newMinor = newParts[1] || 0, newPatch = newParts[2] || 0;
            return oldMajor !== newMajor || oldMinor !== newMinor || oldPatch !== newPatch;
        }

        const MODAL_HTML_TEMPLATE = `
    <div id="vodSyncUpdateModal" style="
        position: fixed;
        z-index: 999999;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        ">
        <div id="modalContent" style="
            background-color: #fefefe;
            margin: auto;
            padding: 0;
            border-radius: 10px;
            width: auto;
            min-width: 300px;
            max-width: 90vw;
            height: auto;
            min-height: 200px;
            max-height: 90vh;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            animation: vodSyncModalSlideIn 0.3s ease-out;
            position: relative;
            ">
            <div style="
                background: linear-gradient(135deg, #007bff, #0056b3);
                color: white;
                padding: 15px 20px;
                border-radius: 10px 10px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                ">
                <h2 style="margin: 0; font-size: 18px; font-weight: 600;"> VOD Master 업데이트 알림</h2>
                <span class="vod-sync-close" style="
                color: white;
                font-size: 28px;
                font-weight: bold;
                cursor: pointer;
                line-height: 1;
                ">&times;</span>
            </div>
            <iframe id="updateIframe" style="
            width: 500px;
            height: 300px;
            border: none;
            border-radius: 0 0 10px 10px;
            transition: width 0.3s ease, height 0.3s ease;
            "></iframe>
        </div>
    </div>
    <style>
        @keyframes vodSyncModalSlideIn {
            from { opacity: 0; transform: translateY(-50px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .vod-sync-close:hover { opacity: 0.7; }
    </style>
`;

        function createAndShowUpdateModal(version) {
            const existingModal = document.getElementById('vodSyncUpdateModal');
            if (existingModal) existingModal.remove();
            document.body.insertAdjacentHTML('beforeend', MODAL_HTML_TEMPLATE);
            const modal = document.getElementById('vodSyncUpdateModal');
            const iframe = document.getElementById('updateIframe');
            if (modal && iframe) {
                modal.style.display = 'flex';
                iframe.src = 'https://ainukehere.github.io/VOD-Master/doc/update_notification_v' + version + '.html';
                const closeModal = () => modal.remove();
                modal.querySelector('.vod-sync-close').onclick = closeModal;
                modal.onclick = function(e) { if (e.target === modal) closeModal(); };
                const handleEscKey = function(e) {
                    if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', handleEscKey); }
                };
                document.addEventListener('keydown', handleEscKey);
            }
        }

        function resizeIframe(iframe, contentWidth, contentHeight) {
            try {
                const minWidth = 300, maxWidth = 600, minHeight = 200, maxHeight = 960, headerHeight = 60;
                const maxModalHeight = Math.floor(window.innerHeight * 0.9);
                const maxIframeHeight = Math.max(minHeight, maxModalHeight - headerHeight);
                const newWidth = Math.max(minWidth, Math.min(maxWidth, contentWidth));
                const newHeight = Math.max(minHeight, Math.min(maxHeight, maxIframeHeight, contentHeight));
                iframe.style.width = newWidth + 'px';
                iframe.style.height = newHeight + 'px';
                const modalContent = document.getElementById('modalContent');
                if (modalContent) {
                    modalContent.style.width = newWidth + 'px';
                    modalContent.style.height = Math.min(newHeight + headerHeight, maxModalHeight) + 'px';
                }
            } catch (e) {
                const iframe = document.getElementById('updateIframe');
                const modalContent = document.getElementById('modalContent');
                if (iframe) { iframe.style.width = '500px'; iframe.style.height = '300px'; }
                if (modalContent) { modalContent.style.width = '500px'; modalContent.style.height = '360px'; }
            }
        }

        window.addEventListener('message', function(event) {
            if (event.data && event.data.type === 'vodSync-iframe-resize') {
                const iframe = document.getElementById('updateIframe');
                if (iframe) resizeIframe(iframe, event.data.width, event.data.height);
            }
        });

        async function checkForUpdatesTM() {
            try {
                const currentVersion = (GM_info.script && GM_info.script.version) ? GM_info.script.version : '';
                if (!currentVersion) return;
                let lastCheckedVersion = GM_getValue('vodSync_lastCheckedVersion', null);
                lastCheckedVersion = await Promise.resolve(lastCheckedVersion);
                if (typeof lastCheckedVersion !== 'string') lastCheckedVersion = null;
                const versionUpgraded = !lastCheckedVersion || compareVersions(currentVersion, lastCheckedVersion) > 0;
                if (versionUpgraded) {
                    const showNotification = !lastCheckedVersion || shouldShowUpdateNotification(lastCheckedVersion, currentVersion);
                    if (showNotification) createAndShowUpdateModal(currentVersion);
                    const setResult = GM_setValue('vodSync_lastCheckedVersion', currentVersion);
                    await Promise.resolve(setResult);
                }
            } catch (err) {
                logToExtension('업데이트 확인 중 오류:', err);
            }
        }

        setTimeout(checkForUpdatesTM, 2000);
    })();
})(); 