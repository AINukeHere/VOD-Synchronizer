// 설정 창 JavaScript
class SettingsManager {
    constructor() {
        this.defaultSettings = {
            enableTimestamp: true,
            enableChzzkSoopPanel: true,
            enableSoopChzzkPanel: true,
            enableRpPanel: true
        };
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.setupEventListeners();
        this.displaySettings();
        this.displayVersion();
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get('vodSyncSettings');
            this.settings = result.vodSyncSettings || this.defaultSettings;
        } catch (error) {
            console.error('설정 로드 실패:', error);
            this.settings = this.defaultSettings;
        }
    }

    async saveSettings() {
        try {
            await chrome.storage.sync.set({ vodSyncSettings: this.settings });
            this.showStatus('설정이 저장되었습니다.', 'success');
        } catch (error) {
            console.error('설정 저장 실패:', error);
            this.showStatus('설정 저장에 실패했습니다.', 'error');
        }
    }

    displaySettings() {
        // 체크박스 설정
        document.getElementById('enableTimestamp').checked = this.settings.enableTimestamp;
        document.getElementById('enableChzzkSoopPanel').checked = this.settings.enableChzzkSoopPanel;
        document.getElementById('enableSoopChzzkPanel').checked = this.settings.enableSoopChzzkPanel;
        document.getElementById('enableRpPanel').checked = this.settings.enableRpPanel;
    }

    displayVersion() {
        try {
            // Chrome 확장 프로그램의 버전 정보 가져오기
            const manifest = chrome.runtime.getManifest();
            const version = manifest.version;
            const versionElement = document.getElementById('versionInfo');
            if (versionElement) {
                versionElement.textContent = `버전 ${version}`;
            }
        } catch (error) {
            console.error('버전 정보 로드 실패:', error);
            const versionElement = document.getElementById('versionInfo');
            if (versionElement) {
                versionElement.textContent = '버전 정보를 불러올 수 없습니다.';
            }
        }
    }

    collectSettings() {
        this.settings = {
            enableTimestamp: document.getElementById('enableTimestamp').checked,
            enableChzzkSoopPanel: document.getElementById('enableChzzkSoopPanel').checked,
            enableSoopChzzkPanel: document.getElementById('enableSoopChzzkPanel').checked,
            enableRpPanel: document.getElementById('enableRpPanel').checked
        };
    }

    setupEventListeners() {
        // 저장 버튼
        document.getElementById('saveSettings').addEventListener('click', async () => {
            this.collectSettings();
            await this.saveSettings();
        });

        // 닫기 버튼
        document.getElementById('closeSettings').addEventListener('click', () => {
            window.close();
        });

        // 설정 내보내기
        document.getElementById('exportSettings').addEventListener('click', () => {
            this.exportSettings();
        });

        // 설정 가져오기
        document.getElementById('importSettings').addEventListener('click', () => {
            this.importSettings();
        });

        // 설정 초기화
        document.getElementById('resetSettings').addEventListener('click', () => {
            if (confirm('모든 설정을 초기화하시겠습니까?')) {
                this.resetSettings();
            }
        });

        // 데이터 관리 섹션 접기/펼치기
        const dataManagementHeader = document.querySelector('.collapsible-header');
        const dataManagementContent = document.getElementById('dataManagementContent');
        const dataManagementToggle = document.getElementById('dataManagementToggle');
        
        dataManagementHeader.addEventListener('click', () => {
            const isHidden = dataManagementContent.style.display === 'none';
            dataManagementContent.style.display = isHidden ? 'block' : 'none';
            dataManagementToggle.textContent = isHidden ? '▲' : '▼';
        });

        // Enter 키로 저장
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.collectSettings();
                this.saveSettings();
            }
        });
    }

    exportSettings() {
        const dataStr = JSON.stringify(this.settings, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = 'vod-synchronizer-settings.json';
        link.click();
        
        URL.revokeObjectURL(url);
        this.showStatus('설정이 내보내졌습니다.', 'success');
    }

    importSettings() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const importedSettings = JSON.parse(e.target.result);
                        this.settings = { ...this.defaultSettings, ...importedSettings };
                        this.displaySettings();
                        this.saveSettings();
                        this.showStatus('설정이 가져와졌습니다.', 'success');
                    } catch (error) {
                        this.showStatus('설정 파일 형식이 올바르지 않습니다.', 'error');
                    }
                };
                reader.readAsText(file);
            }
        };
        
        input.click();
    }

    async resetSettings() {
        this.settings = { ...this.defaultSettings };
        this.displaySettings();
        await this.saveSettings();
        this.showStatus('설정이 초기화되었습니다.', 'success');
    }

    showStatus(message, type) {
        const statusElement = document.getElementById('status');
        statusElement.textContent = message;
        statusElement.className = `status ${type}`;
        statusElement.style.display = 'block';
        
        setTimeout(() => {
            statusElement.style.display = 'none';
        }, 3000);
    }
}

// 설정 창이 로드되면 초기화
document.addEventListener('DOMContentLoaded', () => {
    new SettingsManager();
}); 