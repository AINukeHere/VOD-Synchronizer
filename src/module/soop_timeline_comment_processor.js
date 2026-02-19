import { TimelineCommentProcessorBase } from './base_timeline_comment_processor.js';

export class SoopTimelineCommentProcessor extends TimelineCommentProcessorBase {
    constructor() {
        super();
        this.containerSelector = '#commentHighlight';
        this.commentRowSelector = 'li';
        this.commentTextSelector = '.cmmt-txt';
        this.checkboxSlotSelector = '.cmmt-header';
        this.checkboxWrapStyle.right = '30px';
        /** 댓글 작성란 입력 요소 (동기화된 타임라인 자동 기입 시 사용) */
        this.commentInputSelector = '#commentWrite, .comment_write textarea, [class*="commentWrite"] textarea, [class*="comment_write"]';
    }

    buildSyncSegmentsFromCheckbox(checkboxEl) {
        const rowEl = this.getTimelineCommentRowContaining(checkboxEl);
        const cmmtTxt = rowEl?.querySelector('.cmmt-txt');
        if (!cmmtTxt) return [];
        const tsManager = window.VODSync?.tsManager;
        const root = cmmtTxt.querySelector('p') || cmmtTxt;
        const result = [];
        const nodes = root.childNodes;
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            if (node.nodeType === Node.TEXT_NODE) {
                const t = node.textContent?.trim();
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
                let text = '';
                for (i++; i < nodes.length; i++) {
                    const n = nodes[i];
                    if (n.nodeType === Node.TEXT_NODE) text += n.textContent;
                    else if (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'BR') break;
                    else if (n.nodeType === Node.ELEMENT_NODE && !n.classList?.contains('best')) text += n.textContent || '';
                }
                const trimmed = text.trim();
                if (trimmed) result.push(trimmed);
                i--;
                continue;
            }
            const t = node.textContent?.trim();
            if (t) result.push(t);
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
}
