/**
 * 페이지 MAIN 전용. vod_editor_category.js를 <script>로 로드한 뒤
 * window.szVodCategory를 content script로 postMessage한다. (CORS 회피)
 * data-vs-msg-type / data-vs-category-url 로 설정을 받는다.
 */
(function loadSoopVodEditorCategory() {
    const cur = document.currentScript;
    const msgType = cur?.getAttribute('data-vs-msg-type') || 'vodSync-vod-editor-category';
    const url =
        cur?.getAttribute('data-vs-category-url')
        || 'https://live.sooplive.com/script/locale/ko_KR/vod_editor_category.js';

    const s = document.createElement('script');
    s.src = url;
    s.onload = function () {
        let payload = null;
        try {
            payload = window.szVodCategory && typeof window.szVodCategory === 'object'
                ? window.szVodCategory
                : null;
        } catch (_e) {
            payload = null;
        }
        window.postMessage({ type: msgType, payload }, '*');
        s.remove();
    };
    s.onerror = function () {
        window.postMessage({ type: msgType, payload: null }, '*');
        s.remove();
    };
    (document.documentElement || document.head || document.body).appendChild(s);
})();
