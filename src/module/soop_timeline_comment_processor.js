import { TimelineCommentProcessorBase } from './base_timeline_comment_processor.js';

export class SoopTimelineCommentProcessor extends TimelineCommentProcessorBase {
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

    
}
