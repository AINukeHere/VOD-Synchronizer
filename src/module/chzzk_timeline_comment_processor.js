import { TimelineCommentProcessorBase } from './base_timeline_comment_processor.js';

/** 치지직 다시보기 타임라인 댓글. 아직 DOM 분석 전이라 selector 미설정(구현 없음). */
export class ChzzkTimelineCommentProcessor extends TimelineCommentProcessorBase {
    constructor() {
        super();
        // 치지직 분석 후 containerSelector, commentRowSelector, commentTextSelector, checkboxSlotSelector 등 설정
    }
}
