/**
 * 다시보기 페이지의 타임라인 댓글을 인식하고, VOD linker가 동기화 시 참조할 수 있는 형태로 가공해 두는 클래스의 베이스.
 * 댓글 컨테이너를 찾은 뒤 주기적으로 댓글 요소를 찾아 타임라인 댓글이면 변환 체크박스를 붙이고,
 * 체크/해제 시 멤버 배열에 댓글 요소를 저장/제거해 두었다가 VOD linker 요청 시 가공해 전달한다.
 */
import { IVodSync } from './interface4log.js';

export class TimelineCommentProcessorBase extends IVodSync {
    static CHECKBOX_CLASS = 'vodSync-timeline-sync-cb';

    /**
     * 자식 클래스에서 설정할 selector 변수들.
     * - containerSelector: string — 컨테이너를 찾을 CSS 선택자
     * - containerCondition: () => boolean — 컨테이너 탐색 전 조건(예: pathname). 기본은 항상 true
     * - commentRowSelector: string — 컨테이너 안 댓글 한 줄(행) 요소 선택자
     * - commentTextSelector: string — 댓글 한 줄에서 텍스트를 꺼낼 하위 요소 선택자
     * - checkboxSlotSelector: string — 댓글 한 줄에서 체크박스를 넣을 슬롯 요소 선택자(없으면 해당 행 사용)
     * - commentInputSelector: string — 댓글 작성란 입력 요소 선택자(동기화된 타임라인 자동 기입 시 사용, 자식에서 설정)
     */
    constructor() {
        super();
        this._started = false;
        /** 미리보기 내용을 채웠으면 true (인터벌에서 한 번만 채움) */
        this._timelinePayloadApplied = false;
        /** 전달받은 타임라인 동기화 페이로드 (receive 시 저장) */
        this._incomingTimelineSyncPayload = null;
        /** 미리보기 창 뼈대 (receive 시 생성). listWrap은 뼈대의 내용 영역 참조용. */
        this._timelinePreviewWrap = null;
        this._timelinePreviewListWrap = null;
        /** 채워넣은 행 데이터 (복사 버튼에서 사용) */
        this._timelinePreviewRows = null;
        /** 찾아둔 댓글 컨테이너. document에 연결되어 있으면 재탐색 생략 */
        this._cachedCommentContainer = null;
        /** 변환 체크가 된 댓글 한 줄 요소들. 체크 시 추가·해제 시 제거. */
        this._selectedCommentRows = [];
        /** 체크박스 스타일 객체. 자식 클래스에서 키 추가·값 수정 가능. (예: this.checkboxWrapStyle.right = '30px') */
        this.checkboxWrapStyle = { position: 'absolute', top: '2px', right: '2px', zIndex: 1, fontSize: '13px', padding: '2px 6px', borderRadius: '4px', transition: 'background-color .15s ease' };
        this.checkboxLabelStyle = { cursor: 'pointer', position: 'relative', display: 'inline-block' };
        this.checkboxInputStyle = { position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'pointer' };
        this.checkboxWrapCheckedStyle = { backgroundColor: '#a8d8ea', color: '#1a1a1a' };
        this.checkboxWrapUncheckedStyle = { backgroundColor: 'rgba(0,0,0,0.06)', color: '#888' };
        window.VODSync = window.VODSync || {};
        window.VODSync.timelineCommentProcessor = this;
    }

    /** style 객체를 요소에 적용. camelCase 키를 element.style에 그대로 대입. */
    _applyStyle(el, styleObj) {
        if (!styleObj) return;
        for (const [k, v] of Object.entries(styleObj)) {
            if (v != null && v !== '') el.style[k] = v;
        }
    }

    /** selector로 댓글 컨테이너 반환 (containerCondition 적용 후 containerSelector로 querySelector) */
    _getContainer() {
        if (this.containerCondition && !this.containerCondition()) return null;
        const sel = this.containerSelector;
        return sel ? document.querySelector(sel) || null : null;
    }

    /** selector로 컨테이너 안 댓글 행 목록 반환 */
    _getCommentRows(container) {
        if (!container) return [];
        const sel = this.commentRowSelector;
        if (!sel) return [];
        return Array.from(container.querySelectorAll(sel));
    }

    /** selector로 댓글 한 줄에서 표시용 텍스트 추출 */
    getTimelineCommentText(rowEl) {
        const sel = this.commentTextSelector;
        if (!sel) return rowEl?.textContent || '';
        const el = rowEl.querySelector(sel);
        return (el ? el.textContent : rowEl.textContent) || '';
    }

    /** HH:MM:SS / MM:SS 패턴으로 재생 시각(초) 파싱. 서브클래스에서 오버라이드 가능. */
    parsePlaybackSecondsFromText(text) {
        if (!text || typeof text !== 'string') return null;
        const t = text.trim();
        const withSec = t.match(/(?:^|[\s\[(])(\d{1,2}):(\d{2}):(\d{2})(?:\s|]|\)|$)/);
        if (withSec) return parseInt(withSec[1], 10) * 3600 + parseInt(withSec[2], 10) * 60 + parseInt(withSec[3], 10);
        const minSec = t.match(/(?:^|[\s\[(])(\d{1,2}):(\d{2})(?:\s|]|\)|$)(?!\d)/);
        if (minSec) return parseInt(minSec[1], 10) * 60 + parseInt(minSec[2], 10);
        return null;
    }

    /** selector로 체크박스를 넣을 슬롯 반환 (없으면 rowEl) */
    _getCheckboxInsertSlot(rowEl) {
        const sel = this.checkboxSlotSelector;
        if (!sel) return rowEl;
        return rowEl.querySelector(sel) || rowEl;
    }

    /** 재생 시각(초)을 댓글용 시간 문자열로 포맷. 자식 클래스에서 오버라이드 가능. */
    formatPlaybackTimeAsComment(playbackSec) {
        if (typeof playbackSec !== 'number' || playbackSec < 0 || !isFinite(playbackSec)) return '';
        const h = Math.floor(playbackSec / 3600);
        const m = Math.floor((playbackSec % 3600) / 60);
        const s = Math.floor(playbackSec % 60);
        if (h > 0) return `[${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}] `;
        return `[${m}:${String(s).padStart(2, '0')}] `;
    }

    /**
     * 미리보기 패널에서 타임라인 한 칸에 표시할 문자열 (H:MM:SS 또는 M:SS). 자식에서 오버라이드 가능.
     * @param {number} playbackSec
     * @returns {string}
     */
    getTimelineDisplayText(playbackSec) {
        if (typeof playbackSec !== 'number' || playbackSec < 0 || !isFinite(playbackSec)) return '--:--';
        const h = Math.floor(playbackSec / 3600);
        const m = Math.floor((playbackSec % 3600) / 60);
        const s = Math.floor(playbackSec % 60);
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    /**
     * 미리보기/댓글에 넣을 타임라인 한 칸 DOM 요소 생성. 플랫폼별로 오버라이드.
     * @param {number} playbackSec 재생 시각(초)
     * @returns {HTMLElement}
     */
    createTimelineDisplayElement(playbackSec) {
        const span = document.createElement('span');
        span.className = 'vodSync-timeline-preview-time';
        span.textContent = this.getTimelineDisplayText(playbackSec);
        span.style.cssText = 'font-family:monospace;font-size:13px;cursor:pointer;text-decoration:underline;';
        span._vodSyncUpdateTime = (sec) => { span.textContent = this.getTimelineDisplayText(sec); };
        return span;
    }

    /**
     * 타임라인 동기화 페이로드를 전달받음. 뼈대가 없으면 미리보기 창 뼈대만 생성하고, 내용 채움은 인터벌에서 주기적으로 시도.
     * @param {(string|number)[]} payload
     */
    receiveTimelineSyncPayload(payload) {
        if (!Array.isArray(payload) || payload.length === 0) return;
        this._incomingTimelineSyncPayload = payload;
        this._timelinePayloadApplied = false;
        if (!this._timelinePreviewWrap?.isConnected) {
            this._createTimelinePreviewSkeleton();
        }
    }

    /**
     * 미리보기 창 뼈대만 생성 (헤더·빈 목록 영역·푸터). 내용은 fillTimelinePreviewContent()에서 채움.
     */
    _createTimelinePreviewSkeleton() {
        const wrap = document.createElement('div');
        wrap.className = 'vodSync-timeline-preview-wrap';
        wrap.style.cssText = 'position:fixed;right:16px;bottom:16px;width:420px;max-width:90vw;max-height:80vh;z-index:99999;display:flex;flex-direction:column;box-shadow:0 4px 20px rgba(0,0,0,0.2);border-radius:8px;overflow:hidden;background:#fff;';
        const panel = document.createElement('div');
        panel.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;';

        const header = document.createElement('div');
        header.style.cssText = 'padding:10px 12px;border-bottom:1px solid #eee;font-weight:bold;font-size:14px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px;';
        header.textContent = '타임라인 동기화 미리보기';
        const collapseBtn = document.createElement('button');
        collapseBtn.type = 'button';
        collapseBtn.textContent = '접기';
        collapseBtn.style.cssText = 'padding:4px 10px;font-size:12px;cursor:pointer;';
        const bodyArea = document.createElement('div');
        bodyArea.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden;';
        const listWrap = document.createElement('div');
        listWrap.style.cssText = 'overflow:auto;flex:1;min-height:120px;padding:8px;';
        const footer = document.createElement('div');
        footer.style.cssText = 'padding:10px 12px;border-top:1px solid #eee;display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;';

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.textContent = '변환된 타임라인 복사';
        copyBtn.style.cssText = 'padding:6px 12px;cursor:pointer;background:#1a73e8;color:#fff;border:none;border-radius:4px;font-size:12px;';
        copyBtn.addEventListener('click', () => {
            const rows = this._timelinePreviewRows;
            if (!rows || rows.length === 0) return;
            const text = rows.map(rowFrags =>
                rowFrags.map(f => f.type === 'string' ? f.value : (f.playbackSec != null ? this.formatPlaybackTimeAsComment(f.playbackSec).trim() : '--:-- ')).join('')
            ).join('\n');
            if (text) navigator.clipboard.writeText(text).then(() => { copyBtn.textContent = '복사됨'; setTimeout(() => { copyBtn.textContent = '변환된 타임라인 복사'; }, 1500); }).catch(() => { copyBtn.textContent = '복사 실패'; });
        });
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '닫기';
        closeBtn.style.cssText = 'padding:6px 12px;cursor:pointer;background:#666;color:#fff;border:none;border-radius:4px;font-size:12px;';
        closeBtn.addEventListener('click', () => {
            wrap.remove();
            this._timelinePreviewWrap = null;
            this._timelinePreviewListWrap = null;
            this._timelinePreviewRows = null;
        });

        collapseBtn.addEventListener('click', () => {
            const collapsed = bodyArea.style.display === 'none';
            bodyArea.style.display = collapsed ? 'flex' : 'none';
            collapseBtn.textContent = collapsed ? '접기' : '펴기';
        });

        header.appendChild(collapseBtn);
        footer.appendChild(copyBtn);
        footer.appendChild(closeBtn);
        bodyArea.appendChild(listWrap);
        bodyArea.appendChild(footer);
        panel.appendChild(header);
        panel.appendChild(bodyArea);
        wrap.appendChild(panel);
        document.body.appendChild(wrap);

        this._timelinePreviewWrap = wrap;
        this._timelinePreviewListWrap = listWrap;
    }

    /**
     * 수신 페이로드가 있고 tsManager가 변환 가능할 때만 미리보기 목록 영역에 내용 채움. 인터벌에서 주기 호출.
     */
    fillTimelinePreviewContent() {
        if (this._timelinePayloadApplied) return;
        const payload = this._incomingTimelineSyncPayload;
        if (!Array.isArray(payload) || payload.length === 0) return;
        if (!this._timelinePreviewListWrap?.isConnected) return;
        const tsManager = window.VODSync?.tsManager;
        if (!tsManager?.canConvertGlobalTSToPlaybackTime()) return;
        const globalTSToPlaybackTime = tsManager.globalTSToPlaybackTime;
        if (!globalTSToPlaybackTime) return;

        // 페이로드 → 순서 유지 fragments (string | timeline), \n 기준으로 행 분리
        const fragments = [];
        let globalTsCount = 0;
        let convertedCount = 0;
        for (const item of payload) {
            const asGlobalMs = typeof item === 'number' && !isNaN(item)
                ? item
                : (typeof item === 'string' && /^\d{10,15}$/.test(String(item).trim())
                    ? parseInt(item, 10)
                    : NaN);
            if (!isNaN(asGlobalMs)) {
                globalTsCount++;
                const sec = globalTSToPlaybackTime.call(tsManager, asGlobalMs);
                if (sec != null) {
                    convertedCount++;
                    fragments.push({ type: 'timeline', playbackSec: Math.max(0, Math.floor(sec)) });
                } else {
                    fragments.push({ type: 'timeline', playbackSec: null });
                }
            } else if (typeof item === 'string') {
                fragments.push({ type: 'string', value: item });
            }
        }
        if (globalTsCount > 0 && convertedCount === 0) return;

        const rows = [];
        let currentRow = [];
        for (const frag of fragments) {
            if (frag.type === 'string') {
                const parts = frag.value.split('\n');
                for (let i = 0; i < parts.length; i++) {
                    if (i > 0) {
                        rows.push(currentRow);
                        currentRow = [];
                    }
                    if (parts[i].length > 0) currentRow.push({ type: 'string', value: parts[i] });
                }
            } else {
                currentRow.push(frag);
            }
        }
        if (currentRow.length > 0) rows.push(currentRow);
        if (rows.length === 0) return;

        this._timelinePayloadApplied = true;
        this._incomingTimelineSyncPayload = null;
        this._timelinePreviewRows = rows;

        // TODO: 치지직에서도 간단하게 element 구성만으로 이동이 가능하다면 굳이 이걸 타임라인부분에 이벤트리스너를 추가할 필요가 없음.
        // const moveToPlaybackTime = tsManager?.moveToPlaybackTime?.bind(tsManager);
        const listWrap = this._timelinePreviewListWrap;
        listWrap.textContent = '';

        rows.forEach((rowFragments) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:6px 8px;border-radius:4px;margin-bottom:4px;border:1px solid #eee;font-size:13px;';
            for (const frag of rowFragments) {
                if (frag.type === 'string') {
                    const textSpan = document.createElement('span');
                    textSpan.style.whiteSpace = 'pre-wrap';
                    textSpan.textContent = frag.value;
                    row.appendChild(textSpan);
                } else {
                    if (frag.playbackSec == null) {
                        const placeholder = document.createElement('span');
                        placeholder.textContent = '--:--';
                        placeholder.style.cssText = 'font-family:monospace;color:#999;';
                        row.appendChild(placeholder);
                    } else {
                        const timeEl = this.createTimelineDisplayElement(frag.playbackSec);
                        // TODO: 치지직에서도 간단하게 element 구성만으로 이동이 가능하다면 굳이 이걸 타임라인부분에 이벤트리스너를 추가할 필요가 없음.
                        // timeEl.addEventListener('click', (e) => { e.stopPropagation(); if (moveToPlaybackTime) moveToPlaybackTime(frag.playbackSec, false); });
                        const btnMinus = document.createElement('button');
                        btnMinus.type = 'button';
                        btnMinus.textContent = '-1';
                        btnMinus.style.cssText = 'padding:2px 6px;font-size:11px;cursor:pointer;';
                        const btnPlus = document.createElement('button');
                        btnPlus.type = 'button';
                        btnPlus.textContent = '+1';
                        btnPlus.style.cssText = 'padding:2px 6px;font-size:11px;cursor:pointer;';
                        btnMinus.addEventListener('click', (e) => {
                            e.stopPropagation();
                            frag.playbackSec = Math.max(0, frag.playbackSec - 1);
                            if (timeEl._vodSyncUpdateTime) timeEl._vodSyncUpdateTime(frag.playbackSec);
                            else timeEl.textContent = this.getTimelineDisplayText(frag.playbackSec);
                        });
                        btnPlus.addEventListener('click', (e) => {
                            e.stopPropagation();
                            frag.playbackSec += 1;
                            if (timeEl._vodSyncUpdateTime) timeEl._vodSyncUpdateTime(frag.playbackSec);
                            else timeEl.textContent = this.getTimelineDisplayText(frag.playbackSec);
                        });
                        row.appendChild(timeEl);
                        row.appendChild(btnMinus);
                        row.appendChild(btnPlus);
                    }
                }
            }
            listWrap.appendChild(row);
        });
    }

    /** 체크박스(또는 그 자식)가 속한 댓글 한 줄 요소 반환 */
    getTimelineCommentRowContaining(descendantEl) {
        let container = this._cachedCommentContainer?.isConnected ? this._cachedCommentContainer : null;
        if (!container) {
            container = this._getContainer();
            this._cachedCommentContainer = container;
        }
        if (!container) return null;
        const rows = this._getCommentRows(container);
        return rows.find(row => row.contains(descendantEl)) || null;
    }

    /**
     * 댓글 컨테이너에서 댓글들을 찾아, 타임라인 댓글이면 변환 체크박스를 추가한다.
     * (이미 체크박스가 있는 행은 스킵. 수정·접기 등으로 DOM이 바뀌어도 주기 호출로 다시 붙일 수 있음)
     */
    scanAndAttachCheckboxes(container) {
        if (!container) return;
        const rows = this._getCommentRows(container);
        for (const rowEl of rows) {
            if (rowEl.querySelector(`.${this.constructor.CHECKBOX_CLASS}`)) continue;
            const text = this.getTimelineCommentText(rowEl);
            const sec = this.parsePlaybackSecondsFromText(text);
            if (sec == null) continue;
            this.appendSyncCheckboxToRow(rowEl, sec);
        }
    }

    /**
     * 특정 댓글 한 줄 요소에 변환 체크박스를 추가. 체크/해제 시 _selectedCommentRows에 반영·배경색 시각화.
     */
    appendSyncCheckboxToRow(rowEl, playbackTimeSec) {
        const slot = this._getCheckboxInsertSlot(rowEl);
        if (!slot) return false;
        const wrap = document.createElement('span');
        wrap.className = 'vodSync-timeline-sync-wrap';
        this._applyStyle(wrap, this.checkboxWrapStyle);
        const label = document.createElement('label');
        label.title = '다른 스트리머의 다시보기가 동기화될 때 이 타임라인 댓글이 동기화된 다시보기에 맞춰 변환됩니다';
        this._applyStyle(label, this.checkboxLabelStyle);
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = this.constructor.CHECKBOX_CLASS;
        cb.dataset.playbackSec = String(playbackTimeSec);
        this._applyStyle(cb, this.checkboxInputStyle);
        const updateWrapStyle = () => {
            this._applyStyle(wrap, cb.checked ? this.checkboxWrapCheckedStyle : this.checkboxWrapUncheckedStyle);
        };
        cb.addEventListener('change', () => {
            updateWrapStyle();
            if (cb.checked) {
                if (!this._selectedCommentRows.includes(rowEl)) this._selectedCommentRows.push(rowEl);
            } else {
                this._selectedCommentRows = this._selectedCommentRows.filter(r => r !== rowEl);
            }
        });
        updateWrapStyle();
        label.appendChild(cb);
        label.appendChild(document.createTextNode('동기화할 때 이 타임라인을 변환'));
        wrap.appendChild(label);
        const pos = window.getComputedStyle(slot).position;
        if (!pos || pos === 'static') slot.style.position = 'relative';
        slot.appendChild(wrap);
        return true;
    }

    /** VOD linker가 호출. 변환 체크된 댓글 요소들을 모아 가공한 페이로드 반환. */
    getTimelineSyncPayload() {
        const connected = this._selectedCommentRows.filter(r => r.isConnected);
        this._selectedCommentRows = connected;
        return this.buildPayloadFromCommentRows(connected);
    }

    /**
     * 1개 이상의 댓글 요소를 받아 동기화 전달용 데이터로 가공. 각 행의 체크박스로 세그먼트를 만든 뒤 이어 붙임.
     * @param {Element[]} rowElements
     * @returns {(string|number)[]}
     */
    buildPayloadFromCommentRows(rowElements) {
        const result = [];
        let first = true;
        for (const rowEl of rowElements) {
            const cb = rowEl.querySelector(`.${this.constructor.CHECKBOX_CLASS}`);
            if (!cb) continue;
            if (!first) result.push('\n');
            first = false;
            const segs = this.buildSyncSegmentsFromCheckbox(cb);
            if (Array.isArray(segs)) {
                for (const x of segs) {
                    if (typeof x === 'string' || (typeof x === 'number' && !isNaN(x))) result.push(x);
                }
            }
        }
        return result;
    }

    /**
     * 체크박스가 속한 댓글 한 줄에서 동기화용 세그먼트 생성. 파생 클래스에서 오버라이드 가능.
     * @param {HTMLInputElement} checkboxEl
     * @returns {(string|number)[]}
     */
    buildSyncSegmentsFromCheckbox(checkboxEl) {
        const rowEl = this.getTimelineCommentRowContaining(checkboxEl);
        const text = rowEl ? this.getTimelineCommentText(rowEl) : '';
        const sec = parseInt(checkboxEl.dataset.playbackSec, 10);
        if (isNaN(sec)) return text ? [text] : [];
        const tsManager = window.VODSync?.tsManager;
        const globalDate = tsManager?.playbackTimeToGlobalTS?.(sec);
        const globalMs = globalDate instanceof Date && !isNaN(globalDate.getTime()) ? globalDate.getTime() : null;
        if (globalMs != null) return [globalMs, text];
        return text ? [text] : [];
    }

    /**
     * 타임라인 댓글 감시 시작. 주기적으로 컨테이너를 찾고, 있으면 해당 컨테이너에서 댓글을 찾아 체크박스를 붙인다.
     */
    startWatching() {
        if (this._started) return;
        this._started = true;
        setInterval(() => {
            let container = this._cachedCommentContainer;
            if (!container || !container.isConnected) {
                container = this._getContainer();
                this._cachedCommentContainer = container;
            }
            this.scanAndAttachCheckboxes(container);
            this.fillTimelinePreviewContent();
        }, 500);
    }
}
