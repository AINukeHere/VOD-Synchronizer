/**
 * SOOP VOD: 페이지 MAIN 전용. `type="module"` + 확장 리소스 `src` 로만 로드한다 (CSP).
 * 콘텐츠 스크립트 모듈들과 같이 `export class` 중심으로 두고, 마지막에 `mountVodCorePageBridge()` 한 번 호출.
 */
export class VodCorePageBridge {
    static GHOST_ID = '__vs_vodcore_ghost';

    constructor() {
        let el = document.getElementById(VodCorePageBridge.GHOST_ID);
        if (!el) {
            el = document.createElement('div');
            el.id = VodCorePageBridge.GHOST_ID;
            el.setAttribute('aria-hidden', 'true');
            el.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;clip:rect(0,0,0,0);';
            (document.documentElement || document.body).appendChild(el);
        }
        /** @type {HTMLElement} */
        this.ghost = el;
        this._boundTick = this.tick.bind(this);
    }

    static num(x) {
        return typeof x === 'number' && x > 0 && Number.isFinite(x) ? x : 0;
    }

    /** @param {object} it */
    itemDurationSec(it) {
        if (!it || typeof it !== 'object') return 0;
        const n = VodCorePageBridge.num;
        let d =
            n(it.duration) ||
            n(it.fileDuration) ||
            n(it.vodDuration) ||
            n(it.playTime) ||
            n(it.length) ||
            n(it.time) ||
            n(it.durationSec);
        if (d > 0) return d;
        const st = n(it.startTime) || n(it.beginTime) || n(it.start);
        const en = n(it.endTime) || n(it.finishTime) || n(it.end);
        if (st >= 0 && en > st) return en - st;
        return 0;
    }

    /** @param {unknown[]} list */
    sumList(list) {
        if (!Array.isArray(list)) return 0;
        let s = 0;
        for (let i = 0; i < list.length; i++) {
            s += this.itemDurationSec(list[i]);
        }
        return s;
    }

    /**
     * @param {object} cfg
     */
    configFilesDurationSum(cfg) {
        if (!cfg || typeof cfg !== 'object') return 0;
        const keys = [
            'files',
            'fileList',
            'fileItems',
            'vodFileList',
            'mediaFiles',
            'fileInfoList',
            'vodFiles',
            'arrFile',
            'lstFile',
        ];
        const nests = [cfg, cfg.vod, cfg.broadcast, cfg.stream, cfg.program, cfg.data, cfg.info].filter(
            (o) => o && typeof o === 'object'
        );
        const sums = [];
        const seen = new Set();
        for (let n = 0; n < nests.length; n++) {
            const obj = nests[n];
            for (let k = 0; k < keys.length; k++) {
                const key = keys[k];
                const list = obj[key];
                if (!Array.isArray(list) || list.length === 0) continue;
                const s = this.sumList(list);
                if (s <= 0) continue;
                const sid = `${n}:${key}:${list.length}`;
                if (seen.has(sid)) continue;
                seen.add(sid);
                sums.push(s);
            }
        }
        if (sums.length === 0) return 0;
        const lo = Math.min(...sums);
        const hi = Math.max(...sums);
        if (sums.length >= 2 && hi > lo + 0.5 && lo < hi * 0.5) return hi;
        return sums.length === 1 ? sums[0] : Math.min(...sums);
    }

    syncGhostFromVodCore() {
        const g = this.ghost;
        const vc = window.vodCore;
        if (vc && typeof vc === 'object' && vc.config) {
            const cfg = vc.config;
            g.dataset.totalFileDuration = String(cfg.totalFileDuration ?? '');
            g.dataset.titleNo = cfg.titleNo != null ? String(cfg.titleNo) : '';
            g.dataset.loginId = cfg.loginId != null ? String(cfg.loginId) : '';
            const cfgSum = this.configFilesDurationSum(cfg);
            g.dataset.configFilesDurationSum = cfgSum > 0 ? String(cfgSum) : '';
            const fiSum = this.sumList(vc.fileItems);
            g.dataset.fileItemsDurationSum = fiSum > 0 ? String(fiSum) : '';
            const pt = vc.playerController && vc.playerController.playingTime;
            g.dataset.playingTime =
                typeof pt === 'number' && Number.isFinite(pt) ? String(pt) : '';
        } else {
            g.dataset.totalFileDuration = '';
            g.dataset.configFilesDurationSum = '';
            g.dataset.fileItemsDurationSum = '';
            g.dataset.playingTime = '';
            g.dataset.titleNo = '';
            g.dataset.loginId = '';
        }
    }

    applyPendingSeek() {
        const g = this.ghost;
        const req = g.getAttribute('data-vs-seek');
        if (req == null || req === '') return;
        g.removeAttribute('data-vs-seek');
        const sec = parseFloat(req);
        const v2 = window.vodCore;
        if (v2 && typeof v2.seek === 'function' && Number.isFinite(sec)) {
            v2.seek(Math.max(0, sec));
        }
    }

    applyPendingPlaybackRate() {
        const g = this.ghost;
        const req = g.getAttribute('data-vs-playback-rate');
        if (req == null || req === '') return;
        g.removeAttribute('data-vs-playback-rate');
        const rate = parseFloat(req);
        if (!Number.isFinite(rate) || rate <= 0) return;
        const v2 = window.vodCore;
        if (v2 && typeof v2 === 'object') {
            try {
                v2.speed = rate;
            } catch (e) {
                /* ignore */
            }
        }
    }

    tick() {
        try {
            this.syncGhostFromVodCore();
            this.applyPendingSeek();
            this.applyPendingPlaybackRate();
        } catch (e) {
            /* ignore */
        }
        requestAnimationFrame(this._boundTick);
    }

    start() {
        requestAnimationFrame(this._boundTick);
    }
}

/**
 * 페이지 콘솔·디버그용. 동일 URL 모듈은 브라우저가 한 번만 평가하므로 중복 start 방지.
 * @returns {VodCorePageBridge|null}
 */
export function mountVodCorePageBridge() {
    if (typeof window === 'undefined') return null;
    if (window.__vsVodCoreBridge) {
        return window.VODSyncPage?.vodCorePageBridgeInstance ?? null;
    }
    window.__vsVodCoreBridge = true;
    window.VODSyncPage = window.VODSyncPage || {};
    window.VODSyncPage.VodCorePageBridge = VodCorePageBridge;
    const bridge = new VodCorePageBridge();
    window.VODSyncPage.vodCorePageBridgeInstance = bridge;
    bridge.start();
    return bridge;
}

mountVodCorePageBridge();
