import { IVodSync } from './interface4log.js';

/** 라이브 중 VOD 시청 알려주기 대상 VOD 유형 (다시보기 REVIEW 제외) */
const TARGET_FILE_TYPES = new Set(['CLIP', 'CATCH', 'EDITOR', 'NORMAL']);
const DEFAULT_COMMENT_TEXT = '잘 볼게요';
const DEDUP_STORAGE_PREFIX = 'vodSync_liveWatchComment:';
const MIN_DEDUP_MS = 60 * 1000;
const TOAST_AUTO_HIDE_MS = 5000;
const DEFAULT_COOLDOWN_SECONDS = 3600;

/**
 * 확장 사용자가 라이브 중일 때 클립·캐치·편집·업로드 VOD를 열면
 * 제작자에게 UP 하기·댓글 등록 알림을 보낸다.
 * (음소거 상태에서는 보내지 않고, 음소거가 풀릴 때까지 기다린다.)
 */
export class SoopLiveWatchCommentNotifier extends IVodSync {
    constructor() {
        super();
        this.likeEnabled = true;
        this.commentEnabled = false;
        this.commentText = DEFAULT_COMMENT_TEXT;
        this.toastEnabled = true;
        this.dedupMode = 'cooldown'; // existing_comment | cooldown
        this.cooldownType = 'video_duration'; // video_duration | custom_hours
        this.cooldownSeconds = DEFAULT_COOLDOWN_SECONDS;
        this._attempted = false;
        this.log('loaded');
        this.init();
    }

    async init() {
        await this._loadSettings();
        if (!this.likeEnabled && !this.commentEnabled) {
            this.log('설정 OFF — 라이브 중 VOD 시청 알려주기 건너뜀');
            return;
        }
        await this._tryNotify();
    }

    async _loadSettings() {
        if (window.VODSync?.IS_TAMPER_MONKEY_SCRIPT === true) {
            if (typeof GM_getValue === 'function') {
                this.likeEnabled = GM_getValue('soopLiveWatchLikeNotify', true) !== false;
                this.commentEnabled = GM_getValue('soopLiveWatchCommentNotify', false) === true;
                const text = GM_getValue('soopLiveWatchCommentText', DEFAULT_COMMENT_TEXT);
                this.commentText = typeof text === 'string' && text.trim() ? text : DEFAULT_COMMENT_TEXT;
                this.toastEnabled = GM_getValue('soopLiveWatchCommentToast', true) !== false;
                this._applyDedupSettings({
                    soopLiveWatchCommentDedupMode: GM_getValue('soopLiveWatchCommentDedupMode', 'cooldown'),
                    soopLiveWatchCommentCooldownType: GM_getValue('soopLiveWatchCommentCooldownType', 'video_duration'),
                    soopLiveWatchCommentCooldownSeconds: GM_getValue('soopLiveWatchCommentCooldownSeconds', null),
                    soopLiveWatchCommentCooldownHours: GM_getValue('soopLiveWatchCommentCooldownHours', null),
                });
            }
            return;
        }
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getAllSettings' });
            if (response?.success && response.settings) {
                const s = response.settings;
                this.likeEnabled = s.soopLiveWatchLikeNotify !== false;
                this.commentEnabled = s.soopLiveWatchCommentNotify === true;
                const text = s.soopLiveWatchCommentText;
                if (typeof text === 'string' && text.trim()) {
                    this.commentText = text;
                }
                if (s.soopLiveWatchCommentToast !== undefined) {
                    this.toastEnabled = s.soopLiveWatchCommentToast !== false;
                }
                this._applyDedupSettings(s);
            }
        } catch (error) {
            this.warn('설정 로드 실패, 기본값 사용:', error);
        }
    }

    _applyDedupSettings(settings = {}) {
        this.dedupMode = settings.soopLiveWatchCommentDedupMode === 'existing_comment'
            ? 'existing_comment'
            : 'cooldown';
        this.cooldownType = settings.soopLiveWatchCommentCooldownType === 'custom_hours'
            ? 'custom_hours'
            : 'video_duration';
        this.cooldownSeconds = this._normalizeCooldownSeconds(
            settings.soopLiveWatchCommentCooldownSeconds,
            settings.soopLiveWatchCommentCooldownHours
        );
    }

    // 임의 지정 대기 시간(초). 예전 시간 단위 설정이 있으면 초로 변환한다.
    _normalizeCooldownSeconds(secondsValue, legacyHoursValue) {
        const seconds = Number(secondsValue);
        if (Number.isFinite(seconds) && seconds > 0) {
            return Math.max(1, Math.floor(seconds));
        }
        const hours = Number(legacyHoursValue);
        if (Number.isFinite(hours) && hours > 0) {
            return Math.max(1, Math.round(hours * 3600));
        }
        return DEFAULT_COOLDOWN_SECONDS;
    }

    async _setToastEnabled(enabled) {
        this.toastEnabled = enabled;
        if (window.VODSync?.IS_TAMPER_MONKEY_SCRIPT === true) {
            if (typeof GM_setValue === 'function') {
                GM_setValue('soopLiveWatchCommentToast', enabled);
            }
            return;
        }
        try {
            await chrome.runtime.sendMessage({
                action: 'saveSettings',
                settings: { soopLiveWatchCommentToast: enabled },
            });
        } catch (error) {
            this.warn('토스트 설정 저장 실패:', error);
        }
    }

    _getTitleNoFromUrl() {
        const m = window.location.pathname.match(/\/player\/(\d+)/);
        return m?.[1] ?? null;
    }

    _buildReferer(titleNo, fileType) {
        const base = `${window.VODSync?.SoopUrls?.VOD_ORIGIN || 'https://vod.sooplive.com'}/player/${titleNo}`;
        if (String(fileType).toUpperCase() === 'CATCH') {
            return `${base}/catch`;
        }
        return base;
    }

    _dedupKey(titleNo) {
        return `${DEDUP_STORAGE_PREFIX}${titleNo}`;
    }

    // 시간 기반 대기 남은 ms. 없거나 만료면 0.
    _getDedupRemainingMs(titleNo) {
        try {
            const raw = localStorage.getItem(this._dedupKey(titleNo));
            if (!raw) return 0;
            const parsed = JSON.parse(raw);
            const expiresAt = Number(parsed?.expiresAt);
            if (!Number.isFinite(expiresAt)) {
                localStorage.removeItem(this._dedupKey(titleNo));
                return 0;
            }
            const remainingMs = expiresAt - Date.now();
            if (remainingMs <= 0) {
                localStorage.removeItem(this._dedupKey(titleNo));
                return 0;
            }
            return remainingMs;
        } catch (_e) {
            return 0;
        }
    }

    _markDedup(titleNo, durationMs) {
        const ttl = Math.max(Number(durationMs) || 0, MIN_DEDUP_MS);
        try {
            localStorage.setItem(
                this._dedupKey(titleNo),
                JSON.stringify({ expiresAt: Date.now() + ttl })
            );
        } catch (error) {
            this.warn('중복 방지 저장 실패:', error);
        }
    }

    _resolveCooldownMs(totalFileDurationMs) {
        if (this.cooldownType === 'custom_hours') {
            return Math.max(this.cooldownSeconds * 1000, MIN_DEDUP_MS);
        }
        return Math.max(Number(totalFileDurationMs) || 0, MIN_DEDUP_MS);
    }

    /**
     * 댓글 본문 비교용 정규화. HTML 줄바꿈·태그·공백을 맞춘다.
     * @param {string} text
     * @returns {string}
     */
    _normalizeCommentText(text) {
        return String(text ?? '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * 내가 남긴 부모 댓글 중 동일 문구가 있는지 확인. (대댓글은 조회 범위 밖)
     * 조회 실패 시 false — 댓글 등록을 막지 않는다.
     */
    async _hasExistingMatchingComment(api, opts) {
        const titleNo = opts?.titleNo;
        const loginId = opts?.loginId;
        const content = opts?.content;
        if (titleNo == null || !loginId || typeof content !== 'string') {
            return false;
        }
        if (typeof api.GetSoopParentCommentsInVod !== 'function') {
            this.warn('GetSoopParentCommentsInVod 없음 — 기존 댓글 판별 스킵');
            return false;
        }

        const needle = this._normalizeCommentText(content);
        if (!needle) return false;

        try {
            const list = await api.GetSoopParentCommentsInVod(titleNo);
            if (!Array.isArray(list)) {
                this.warn('기존 댓글 목록 조회 실패 — 중복으로 보지 않음');
                return false;
            }
            const lid = String(loginId);
            return list.some(
                (c) => String(c?.user_id) === lid
                    && this._normalizeCommentText(c?.comment) === needle
            );
        } catch (error) {
            this.warn('기존 댓글 판별 실패:', error);
            return false;
        }
    }

    _getPlayerVideo() {
        const video = document.querySelector('video');
        return video instanceof HTMLVideoElement ? video : null;
    }

    // muted이거나 volume이 0이면 음소거로 본다.
    _isVideoUnmuted(video = this._getPlayerVideo()) {
        if (!(video instanceof HTMLVideoElement)) return false;
        return !video.muted && video.volume > 0;
    }

    // 음소거가 풀릴 때까지 대기. (자동재생이 음소거라서 시청 직후엔 보통 음소거 상태)
    async _waitUntilUnmuted() {
        if (this._isVideoUnmuted()) return true;
        this.log('음소거 해제 대기 중...');
        return new Promise((resolve) => {
            let attachedVideo = null;
            const onVolumeChange = () => {
                if (this._isVideoUnmuted(attachedVideo)) finish(true);
            };
            const finish = (ok) => {
                clearInterval(pollId);
                if (attachedVideo) {
                    attachedVideo.removeEventListener('volumechange', onVolumeChange);
                }
                resolve(ok);
            };
            const ensureListener = () => {
                const video = this._getPlayerVideo();
                if (!video || video === attachedVideo) return;
                if (attachedVideo) {
                    attachedVideo.removeEventListener('volumechange', onVolumeChange);
                }
                attachedVideo = video;
                attachedVideo.addEventListener('volumechange', onVolumeChange);
            };
            const pollId = setInterval(() => {
                ensureListener();
                if (this._isVideoUnmuted()) finish(true);
            }, 400);
            ensureListener();
        });
    }

    async _resolveLoginId() {
        // 확장 환경은 vodCore 고스트 동기화 직후 loginId가 비어 있을 수 있어 잠시 재시도
        for (let i = 0; i < 10; i++) {
            const vc = window.VODSync?.getVodCore?.();
            const fromVodCore = vc?.config?.loginId != null ? String(vc.config.loginId) : '';
            if (fromVodCore) return fromVodCore;
            if (i < 9) await new Promise((r) => setTimeout(r, 300));
        }
        const api = window.VODSync?.soopAPI;
        if (!api || typeof api.GetPrivateInfo !== 'function') return null;
        const priv = await api.GetPrivateInfo();
        return priv?.CHANNEL?.LOGIN_ID ?? null;
    }

    // 알림 성공 안내. UP 하기/댓글 등록 중 무엇이 됐는지 정확히 표시. 「다시 알리지 않음」으로 이후 토스트만 끈다.
    _showSuccessToast({ liked = false, commented = false, commentText = '' } = {}) {
        if (!this.toastEnabled) return;
        if (!liked && !commented) return;

        const existing = document.getElementById('vodSyncLiveWatchCommentToast');
        if (existing) existing.remove();

        let titleText = '';
        if (liked && commented) {
            titleText = 'VOD를 UP하고 댓글을 등록했습니다.';
        } else if (liked) {
            titleText = 'VOD를 UP했습니다.';
        } else {
            titleText = 'VOD에 댓글을 등록했습니다.';
        }

        const toast = document.createElement('div');
        toast.id = 'vodSyncLiveWatchCommentToast';
        toast.setAttribute('role', 'status');
        toast.style.cssText = `
            position: fixed;
            right: 16px;
            bottom: 16px;
            z-index: 2147483000;
            max-width: 320px;
            padding: 12px 14px;
            background: rgba(72, 80, 96, 0.82);
            color: #fff;
            border-radius: 10px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.22);
            font-family: 'Segoe UI', Tahoma, sans-serif;
            font-size: 13px;
            line-height: 1.45;
        `;

        const title = document.createElement('div');
        title.textContent = titleText;
        title.style.fontWeight = '600';
        title.style.marginBottom = commented ? '4px' : '8px';

        toast.appendChild(title);

        if (commented) {
            const body = document.createElement('div');
            body.textContent = `댓글: ${commentText}`;
            body.style.opacity = '0.9';
            body.style.marginBottom = '8px';
            body.style.wordBreak = 'break-word';
            toast.appendChild(body);
        }

        const footer = document.createElement('div');
        footer.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-top: 2px;
        `;

        const countdown = document.createElement('span');
        countdown.style.cssText = 'opacity: 0.75; font-size: 12px; flex-shrink: 0;';

        const dismissBtn = document.createElement('button');
        dismissBtn.type = 'button';
        dismissBtn.textContent = '이 창을 다시 열지 않음';
        dismissBtn.style.cssText = `
            border: 1px solid rgba(255,255,255,0.35);
            background: transparent;
            color: #fff;
            border-radius: 6px;
            padding: 4px 8px;
            font-size: 12px;
            cursor: pointer;
            white-space: nowrap;
        `;

        let remainingSec = Math.ceil(TOAST_AUTO_HIDE_MS / 1000);
        const updateCountdown = () => {
            countdown.textContent = `${remainingSec}초후 닫음`;
        };
        updateCountdown();

        const closeToast = () => {
            clearTimeout(hideTimer);
            clearInterval(countdownTimer);
            toast.remove();
        };
        dismissBtn.addEventListener('click', async () => {
            await this._setToastEnabled(false);
            closeToast();
        });

        footer.appendChild(countdown);
        footer.appendChild(dismissBtn);
        toast.appendChild(footer);
        document.body.appendChild(toast);

        const countdownTimer = setInterval(() => {
            remainingSec -= 1;
            if (remainingSec <= 0) {
                closeToast();
                return;
            }
            updateCountdown();
        }, 1000);
        const hideTimer = setTimeout(closeToast, TOAST_AUTO_HIDE_MS);
    }

    async _tryNotify() {
        if (this._attempted) return;
        this._attempted = true;

        const titleNo = this._getTitleNoFromUrl();
        if (!titleNo) return;

        // 시간 기반 대기 모드만 localStorage로 선차단
        if (this.dedupMode === 'cooldown') {
            const remainingMs = this._getDedupRemainingMs(titleNo);
            if (remainingMs > 0) {
                const remainingSec = Math.ceil(remainingMs / 1000);
                this.log(`재등록 대기 중 — titleNo=${titleNo}, 남은 시간=${remainingSec}초`);
                return;
            }
        }

        const api = window.VODSync?.soopAPI;
        if (!api) {
            this.warn('soopAPI 없음');
            return;
        }

        const vodInfo = await api.GetSoopVodInfo(titleNo);
        const data = vodInfo?.data;
        if (!data || vodInfo?.result !== 1) {
            this.log('VOD 정보 조회 실패 또는 비공개');
            return;
        }

        const fileType = String(data.file_type || '').toUpperCase();
        if (!TARGET_FILE_TYPES.has(fileType)) {
            this.log(`대상 아님 file_type=${fileType}`);
            return;
        }

        // 댓글이 막힌 VOD는 요청하지 않음
        if (data.comment_yn === 0 || data.comment_yn === '0' || data.comment_yn === false) {
            this.warn(`댓글을 작성할 수 없는 영상입니다. titleNo=${titleNo}`);
            return;
        }

        const bjId = data.bj_id != null ? String(data.bj_id) : '';
        const writerId = data.writer_id != null ? String(data.writer_id) : '';
        if (!bjId) {
            this.warn('bj_id 없음');
            return;
        }

        const loginId = await this._resolveLoginId();
        if (!loginId) {
            this.log('로그인 ID 없음 — 건너뜀');
            return;
        }

        // 본인이 만든 VOD면 알림 대상이 없으므로 건너뜀
        if (writerId && writerId === loginId) {
            this.log('본인 작성 VOD — 건너뜀');
            return;
        }

        // 확장 사용자가 라이브 중일 때만
        let broad = await api.GetChannelBroad(loginId);
        if (!broad) {
            this.log('라이브 중이 아님 — 건너뜀');
            return;
        }

        const content = String(this.commentText || DEFAULT_COMMENT_TEXT).trim() || DEFAULT_COMMENT_TEXT;
        let skipComment = !this.commentEnabled;

        // 같은 문구의 내 댓글이 있으면 댓글만 건너뜀 (API 연동 후 동작)
        if (this.commentEnabled && this.dedupMode === 'existing_comment') {
            const exists = await this._hasExistingMatchingComment(api, {
                stationNo: data.station_no,
                bbsNo: data.bbs_no,
                titleNo: data.title_no ?? titleNo,
                bjId,
                loginId,
                content,
                fileType,
            });
            if (exists) {
                this.log(`동일 문구 댓글 이미 존재 — 댓글 건너뜀 titleNo=${titleNo}`);
                skipComment = true;
                if (!this.likeEnabled) return;
            }
        }

        // 음소거면 알림 안 보내고, 해제될 때까지 대기
        await this._waitUntilUnmuted();

        // 음소거 대기 중 방송이 끝났을 수 있어 다시 확인
        broad = await api.GetChannelBroad(loginId);
        if (!broad) {
            this.log('음소거 해제 후 라이브 종료 — 건너뜀');
            return;
        }

        if (this.commentEnabled && !skipComment && this.dedupMode === 'existing_comment') {
            const exists = await this._hasExistingMatchingComment(api, {
                stationNo: data.station_no,
                bbsNo: data.bbs_no,
                titleNo: data.title_no ?? titleNo,
                bjId,
                loginId,
                content,
                fileType,
            });
            if (exists) {
                this.log(`음소거 해제 후 동일 문구 댓글 확인 — 댓글 건너뜀 titleNo=${titleNo}`);
                skipComment = true;
                if (!this.likeEnabled) return;
            }
        }

        const referer = this._buildReferer(titleNo, fileType);
        const boardType = data.board_type ?? 105;
        const resolvedTitleNo = data.title_no ?? titleNo;
        let liked = false;
        let commented = false;

        if (this.likeEnabled) {
            if (typeof api.LikeVodTitle !== 'function') {
                this.warn('LikeVodTitle API 없음');
            } else {
                const likeResult = await api.LikeVodTitle({
                    stationNo: data.station_no,
                    titleNo: resolvedTitleNo,
                    boardType,
                    referer,
                });
                if (likeResult) {
                    liked = true;
                    this.log(`라이브 시청 UP 완료 titleNo=${titleNo} fileType=${fileType}`);
                } else {
                    liked = false;
                    this.warn(`UP 하기 실패 titleNo=${titleNo}`);
                }
            }
        }

        if (this.commentEnabled && !skipComment) {
            const commentResult = await api.WriteVodComment({
                stationNo: data.station_no,
                bbsNo: data.bbs_no,
                titleNo: resolvedTitleNo,
                bjId,
                boardType,
                content,
                fileType,
                referer,
            });
            if (commentResult) {
                commented = true;
                this.log(`라이브 시청 댓글 작성 완료 titleNo=${titleNo} fileType=${fileType}`);
            } else {
                commented = false;
                this.warn(`댓글을 작성할 수 없는 영상이거나 작성에 실패했습니다. titleNo=${titleNo}`);
            }
        }

        if (!liked && !commented) return;

        if (this.dedupMode === 'cooldown') {
            this._markDedup(titleNo, this._resolveCooldownMs(data.total_file_duration));
        }
        this._showSuccessToast({ liked, commented, commentText: content });
    }
}
