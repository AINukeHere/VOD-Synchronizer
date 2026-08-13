import { IVodSync } from './interface4log.js';

/**
 * SOOP VOD 다음 영상 자동 재생을 막는다. (라이브 여부와 무관)
 * #video의 ended 이벤트 전파를 capture에서 막아 이어보기를 차단한다.
 */
export class SoopNextVideoAutoplayGuard extends IVodSync {
    constructor() {
        super();
        this.enabled = true;
        this._timer = null;
        this._boundVideos = new WeakSet();
        this._onVideoEndedCapture = (e) => {
            e.stopPropagation();
        };
        this.log('loaded');
        this.init();
    }

    async init() {
        if (!/\/player\/\d+/.test(window.location.pathname)) {
            return;
        }
        await this._loadSettings();
        if (!this.enabled) {
            this.log('설정 OFF — 다음 영상 자동 재생 방지 건너뜀');
            return;
        }
        this._start();
    }

    async _loadSettings() {
        if (window.VODSync?.IS_TAMPER_MONKEY_SCRIPT === true) {
            if (typeof GM_getValue === 'function') {
                this.enabled = GM_getValue('soopLiveWatchDisableAutoplay', true) !== false;
            }
            return;
        }
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getAllSettings' });
            if (response?.success && response.settings) {
                this.enabled = response.settings.soopLiveWatchDisableAutoplay !== false;
            }
        } catch (error) {
            this.warn('설정 로드 실패, 기본값 사용:', error);
        }
    }

    _start() {
        if (this._timer != null) return;
        this.log('다음 영상 자동 재생 방지 시작 (1초 간격, ended 전파 차단)');
        this._bindEndedGuards();
        this._timer = setInterval(() => this._bindEndedGuards(), 1000);
    }

    // ended가 상위로 전파되지 않게 해서 다음 영상 자동 재생을 막는다.
    _bindEndedGuards() {
        document.querySelectorAll('#video').forEach((video) => {
            if (!(video instanceof HTMLMediaElement)) return;
            if (this._boundVideos.has(video)) return;
            video.addEventListener('ended', this._onVideoEndedCapture, true);
            this._boundVideos.add(video);
            this.log('video ended 전파 차단 등록');
        });
    }
}
