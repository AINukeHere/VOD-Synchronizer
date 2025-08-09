// 설정 관리자
logToExtension('settings_manager.js loaded');
class SettingsManager {
    constructor() {
        this.defaultSettings = {
            enableTimestamp: true,
            enableChzzkSoopPanel: true,
            enableSoopChzzkPanel: true,
            enableRpPanel: true
        };
        this.settings = { ...this.defaultSettings };
        this.isLoaded = false;
        this.loadPromise = null;
        this.init();
    }

    async init() {
        this.loadPromise = this.loadSettings();
        await this.loadPromise;
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get('vodSyncSettings');
            this.settings = { ...this.defaultSettings, ...result.vodSyncSettings };
            this.isLoaded = true;
            logToExtension('[SettingsManager] 설정 로드 완료:', this.settings);
        } catch (error) {
            console.error('[SettingsManager] 설정 로드 실패:', error);
            this.settings = { ...this.defaultSettings };
            this.isLoaded = true;
        }
    }

    async getSetting(key) {
        // 설정이 로드되지 않았다면 로드 완료까지 기다림
        if (!this.isLoaded && this.loadPromise) {
            await this.loadPromise;
        }
        return this.settings[key] !== undefined ? this.settings[key] : this.defaultSettings[key];
    }

    async isFeatureEnabled(feature) {
        return await this.getSetting(feature);
    }

    // 설정 변경 감지
    onSettingsChanged(callback) {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync' && changes.vodSyncSettings) {
                this.settings = { ...this.defaultSettings, ...changes.vodSyncSettings.newValue };
                logToExtension('[SettingsManager] 설정 변경 감지:', this.settings);
                if (callback) callback(this.settings);
            }
        });
    }

    // 설정 로드 완료 대기
    async waitForLoad() {
        if (!this.isLoaded && this.loadPromise) {
            await this.loadPromise;
        }
        return this.settings;
    }
}

// 전역 설정 관리자 인스턴스
window.VODSync = window.VODSync || {};
window.VODSync.SettingsManager = new SettingsManager(); 