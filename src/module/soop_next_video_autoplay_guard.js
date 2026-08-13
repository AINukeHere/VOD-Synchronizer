import { IVodSync } from './interface4log.js';

/**
 * SOOP VOD 다음 영상 자동 재생을 막는다. (라이브 여부와 무관)
 * #video의 ended 전파를 막되, 분할 파일의 중간 전환(ended)은 그대로 둔다.
 * playIdx가 files 마지막일 때만 차단한다.
 */
export class SoopNextVideoAutoplayGuard extends IVodSync {
    constructor() {
        super();
        this.enabled = true;
        this._timer = null;
        this._boundVideos = new WeakSet();
        this._onVideoEndedCapture = (e) => {
            if (!this._shouldBlockEndedPropagation()) return;
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
        this.log('다음 영상 자동 재생 방지 시작 (1초 간격, 마지막 파일 ended만 차단)');
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
            this.log('video ended 가드 등록');
        });
    }

    /**
     * 분할 VOD 중간 파일 ended는 허용하고, 마지막 파일일 때만 차단한다.
     */
    _shouldBlockEndedPropagation() {
        const { playIdx, fileCount } = this._readPlayIdxState();

        if (playIdx != null && fileCount != null && fileCount > 0) {
            const isLast = playIdx >= fileCount - 1;
            this.log(
                isLast
                    ? `마지막 파일 ended — 다음 영상 자동재생 차단 (playIdx=${playIdx}/${fileCount - 1})`
                    : `중간 파일 ended — 전파 허용 (playIdx=${playIdx}, last=${fileCount - 1})`
            );
            return isLast;
        }

        // playIdx를 못하면 단일 파일로 보고 차단 (중간 전환 오탐보다 다음 영상 방지 우선)
        this.log('playIdx/files 확인 불가 — 다음 영상 자동재생 차단');
        return true;
    }

    _readPlayIdxState() {
        const vc = window.VODSync?.getVodCore?.() ?? null;
        let playIdx = null;
        let fileCount = null;
        if (!vc) return { playIdx, fileCount };

        const rawIdx = vc.playerController?.playIdx;
        if (Number.isFinite(Number(rawIdx))) {
            playIdx = Math.floor(Number(rawIdx));
        }

        const files = vc.config?.files;
        if (Array.isArray(files) && files.length > 0) {
            fileCount = files.length;
        } else if (Array.isArray(vc.fileItems) && vc.fileItems.length > 0) {
            fileCount = vc.fileItems.length;
        } else if (Number.isFinite(Number(vc.filesLength)) && Number(vc.filesLength) > 0) {
            fileCount = Math.floor(Number(vc.filesLength));
        }

        return { playIdx, fileCount };
    }
}
