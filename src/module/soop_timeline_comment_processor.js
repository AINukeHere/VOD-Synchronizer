import { TimelineCommentProcessorBase } from './base_timeline_comment_processor.js';

export class SoopTimelineCommentProcessor extends TimelineCommentProcessorBase {
    /** 더보기 레이어 안 편집 구간 가져오기 버튼(SOOP 전용) */
    static CLIP_IMPORT_IN_MORE_CLASS = 'vodSync-timeline-clip-import-in-more';
    static BTN_CLIP_IMPORT_IN_MORE = '편집 구간으로 가져오기';
    static BTN_CLIP_IMPORT_IN_MORE_TOOLTIP = '본문에서 시간 ~ 시간 구간을 찾아 VOD 편집 구간으로 추가합니다';

    constructor() {
        super();
        // Selector override
        this.containerSelector = '#commentHighlight';
        this.commentRowSelector = 'li';
        this.commentTextSelector = '.cmmt-txt';
        this.checkboxSlotSelector = '.cmmt-header';
        this.commentInputSelector = 'section.cmmt_inp'; // 댓글 작성란 입력 요소
        this.commentInputCurrentTimeButtonSlotSelector = 'div.grid-start'; // 댓글 작성란 입력 요소 내부의 현재 시간 삽입 버튼 추가 슬롯
        this.commentInputTextareaSelector = 'div.write-inp'; // 댓글 작성란 입력 요소 내부의 텍스트 입력 요소

        // Style override
        this.checkboxWrapStyle.right = '30px';
    }

    /**
     * 한 개 이상의 댓글에서 미리보기용 세그먼트 생성.
     * @param {HTMLElement[]} rowEls 댓글 행 요소 배열
     * @returns {(string|number)[]}
     */
    buildSegmentsFromComments(commentEls) {
        const tsManager = window.VODSync?.tsManager;
        const result = [];
        for (const commentEl of commentEls) {
            const cmmtTxt = commentEl?.querySelector('.cmmt-txt');
            if (!cmmtTxt) continue;
            const root = cmmtTxt.querySelector('p') || cmmtTxt;
            const nodes = root.childNodes;
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if (node.nodeType === Node.TEXT_NODE) {
                    const t = node.textContent;
                    if (t) result.push(t);
                    continue;
                }
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                if (node.classList?.contains('best')) continue;
                if (node.tagName === 'BR') { result.push('\n'); continue; }
                if (node.classList?.contains('time_link') && node.hasAttribute('data-time')) {
                    const sec = parseInt(node.getAttribute('data-time'), 10);
                    if (!isNaN(sec) && tsManager?.playbackTimeToGlobalTS) {
                        const globalDate = tsManager.playbackTimeToGlobalTS(sec);
                        if (globalDate instanceof Date && !isNaN(globalDate.getTime())) {
                            result.push(globalDate.getTime());
                        }
                    }
                    continue;
                }
                const t = node.textContent?.trim();
                if (t) result.push(t);
            }
        }
        return result;
    }

    /** Soop 댓글 타임라인 스타일: <a class="time_link">[ <strong class="time_link">HH:MM:SS</strong> ]</a> */
    createTimelineDisplayElement(playbackSec) {
        const sec = Math.floor(playbackSec);
        const a = document.createElement('a');
        a.setAttribute('data-time', String(sec));
        a.className = 'time_link';
        a.style.cursor = 'pointer';
        a.appendChild(document.createTextNode('[ '));
        const strong = document.createElement('strong');
        strong.className = 'time_link';
        strong.style.color = '#0182ff';
        strong.setAttribute('data-time', String(sec));
        strong.textContent = this.getTimelineDisplayText(playbackSec);
        a.appendChild(strong);
        a.appendChild(document.createTextNode(' ]'));
        const self = this;
        a._vodSyncUpdateTime = (s) => {
            const n = Math.floor(s);
            a.setAttribute('data-time', String(n));
            strong.setAttribute('data-time', String(n));
            strong.textContent = self.getTimelineDisplayText(s);
        };
        return a;
    }

    /** 단일 시각 토큰(예: 1:49:49)을 초로 변환. 편집 구간 가져오기 줄 파싱용. */
    parseHmsTokenToSeconds(token) {
        if (token == null || typeof token !== 'string') return null;
        return this.parsePlaybackSecondsFromText(token.trim());
    }

    /**
     * 한 줄에서 `앞글자 [ 01:02:03 ] ~ [ 4:05 ] 뒤글자` 또는 `1:02:03 ~ 4:05` 패턴을 찾는다(SOOP time_link 텍스트).
     * 앞·뒤 trim 후 공백으로 이은 문자열이 편집 구간 이름(둘 다 비면 이름 생략).
     * @returns {{ begin: number, end: number, name?: string }|null}
     */
    parseCommentLineForClipRange(line) {
        if (!line || typeof line !== 'string') return null;
        const hms = String.raw`\d{1,2}:\d{2}(?::\d{2})?`;
        const timeTok = String.raw`(?:\[\s*)?(${hms})(?:\s*\])?`;
        const m = line.match(new RegExp(String.raw`^([\s\S]*?)${timeTok}\s*~\s*${timeTok}\s*([\s\S]*)$`));
        if (!m) return null;
        const begin = this.parseHmsTokenToSeconds(m[2]);
        const end = this.parseHmsTokenToSeconds(m[3]);
        if (begin == null || end == null) return null;
        const left = m[1].trim();
        const right = m[4].trim();
        const name = [left, right].filter(Boolean).join(' ');
        return name ? { begin, end, name } : { begin, end };
    }

    /** 더보기 메뉴: 댓글에서 구간을 파싱해 편집 VOD 편집 구간으로 넘긴다. */
    importClipsFromCommentRow(rowEl) {
        const lines = this.getCommentLinesForClipImport(rowEl);
        const items = [];
        for (const line of lines) {
            const one = this.parseCommentLineForClipRange(line);
            if (one) items.push(one);
        }
        if (items.length === 0) {
            window.alert(
                '가져올 구간이 없습니다. "128강 1:49:49 ~ 1:54:48" 형식이 있는지 확인하세요.'
            );
            return;
        }
        const veditor = window.VODSync?.soopVeditorReplacement;
        if (!veditor || typeof veditor.importClipsFromParsedRanges !== 'function') {
            window.alert('VOD 편집 패널을 아직 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.');
            return;
        }
        veditor.importClipsFromParsedRanges(items);
    }

    _injectClipImportButtonIntoMoreLayer(layer, rowEl, closeMore) {
        if (!layer.querySelector(`.${this.constructor.CLIP_IMPORT_IN_MORE_CLASS}`)) {
            const clipBtn = document.createElement('button');
            clipBtn.type = 'button';
            clipBtn.className = this.constructor.CLIP_IMPORT_IN_MORE_CLASS;
            clipBtn.textContent = this.constructor.BTN_CLIP_IMPORT_IN_MORE;
            clipBtn.title = this.constructor.BTN_CLIP_IMPORT_IN_MORE_TOOLTIP;
            clipBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.importClipsFromCommentRow(rowEl);
                closeMore();
            });
            layer.appendChild(clipBtn);
        }
    }

    /** BR·블록 경계마다 줄을 나눠 `시간 ~ 시간` 줄 파싱에 쓴다. */
    getCommentLinesForClipImport(rowEl) {
        const cmmtTxt = rowEl?.querySelector('.cmmt-txt');
        if (!cmmtTxt) {
            const raw = this._extractTextContent(rowEl);
            return raw
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
        }
        const root = cmmtTxt.querySelector('p') || cmmtTxt;
        const lines = [];
        let buf = '';
        const flush = () => {
            const t = buf.trim();
            if (t) lines.push(t);
            buf = '';
        };
        for (let i = 0; i < root.childNodes.length; i++) {
            const node = root.childNodes[i];
            if (node.nodeType === Node.TEXT_NODE) {
                const t = node.textContent;
                if (t) buf += t;
                continue;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            if (node.classList?.contains('best')) continue;
            if (node.tagName === 'BR') {
                flush();
                continue;
            }
            const t = node.textContent;
            if (t) buf += t;
        }
        flush();
        return lines;
    }
}
