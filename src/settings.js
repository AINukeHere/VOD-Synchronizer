// 설정 창 JavaScript
class settingPageManager {
    constructor() {
        this.log('constructor');
        this.defaultSettings = {};
        this.settings = {};
        this.init();
    }
    log(...data){
        console.log(`[${this.constructor.name}] `, ...data);
    }

    init() {
        this.loadSettings();
        this.setupEventListeners();
        this.displayVersion();
    }

    loadSettings() {
        this.log('loadSettings');
        chrome.runtime.sendMessage({ action: 'getDefaultSettings'}, (response) => {
            this.defaultSettings = response.defaultSettings;
        });
        chrome.runtime.sendMessage({ action: 'getAllSettings'}, (response) => {
            this.settings = { ...this.defaultSettings, ...response.settings };
            this.displaySettings();
        });
    }

    saveSettings() {
        chrome.runtime.sendMessage({ action: 'saveSettings', settings: this.settings}, (response) => {
            if (response.success) {
                this.showStatus('설정이 저장되었습니다.', 'success');
            } else {
                this.showStatus('설정 저장에 실패했습니다.', 'error');
            }
        });
    }

    resetSettings() {
        this.settings = { ...this.defaultSettings };
        this.displaySettings();
        this.showStatus('설정이 초기화되었습니다.', 'success');
    }

    displaySettings() {
        // 체크박스 설정
        document.getElementById('enableTimestamp').checked = this.settings.enableTimestamp;
        document.getElementById('enableSyncPanel').checked = this.settings.enableSyncPanel;
        document.getElementById('enableRpPanel').checked = this.settings.enableRpPanel;
        document.getElementById('enableUpdateNotification').checked = this.settings.enableUpdateNotification;
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
        this.settings.enableTimestamp = document.getElementById('enableTimestamp').checked;
        this.settings.enableSyncPanel = document.getElementById('enableSyncPanel').checked;
        this.settings.enableRpPanel = document.getElementById('enableRpPanel').checked;
        this.settings.enableUpdateNotification = document.getElementById('enableUpdateNotification').checked;
    }

    setupEventListeners() {
        // 저장 버튼
        document.getElementById('saveSettings').addEventListener('click', () => {
            this.collectSettings();
            this.saveSettings();
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

        // 문의하기 링크
        document.getElementById('inquiryLink').addEventListener('click', showInquiryAlert);

        // 데이터 관리 섹션 접기/펼치기
        const dataManagementHeader = document.querySelector('.collapsible-header');
        const dataManagementContent = document.getElementById('dataManagementContent');
        const dataManagementToggle = document.getElementById('dataManagementToggle');
        
        dataManagementHeader.addEventListener('click', () => {
            const isHidden = dataManagementContent.style.display === 'none';
            dataManagementContent.style.display = isHidden ? 'block' : 'none';
            dataManagementToggle.textContent = isHidden ? '▲' : '▼';
        });

        // Storage 초기화 버튼
        document.getElementById('clearStorage').addEventListener('click', () => {
            this.clearAllStorage();
        });

        // Storage 정보 보기 버튼
        document.getElementById('showStorageInfo').style.display = 'none'; // 디버깅용이므로 비활성화
        document.getElementById('showStorageInfo').addEventListener('click', () => {
            this.showStorageInfo();
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

    showStatus(message, type) {
        const statusElement = document.getElementById('status');
        statusElement.textContent = message;
        statusElement.className = `status ${type}`;
        statusElement.style.display = 'block';
        
        setTimeout(() => {
            statusElement.style.display = 'none';
        }, 3000);
    }

    // Storage 초기화 (디버깅용)
    async clearAllStorage() {
        if (!confirm('모든 저장된 데이터를 삭제하시겠습니까?\n\n삭제될 데이터:\n• 확장 프로그램 설정\n• 업데이트 확인 정보\n이 작업은 되돌릴 수 없습니다.')) {
            return;
        }

        try {
            // Chrome Storage API로 모든 데이터 삭제
            await chrome.storage.sync.clear();
            await chrome.storage.local.clear();
            this.showStatus('모든 저장된 데이터가 삭제되었습니다.', 'success');
            this.log('Storage 초기화 완료 - 모든 데이터 삭제됨');
        } catch (error) {
            console.error('Storage 초기화 실패:', error);
            this.showStatus('Storage 초기화에 실패했습니다.', 'error');
        }
    }

    // Storage 정보 보기 (디버깅용)
    async showStorageInfo() {
        try {
            const MAX_DISPLAY_LEN = 200;
            const syncData = await chrome.storage.sync.get(null);
            const localData = await chrome.storage.local.get(null);
            
            const syncKeys = Object.keys(syncData);
            const localKeys = Object.keys(localData);
            
            let message = `📊 Storage 정보\n\n`;
            message += `🔄 Sync Storage (${syncKeys.length}개 항목):\n`;
            if (syncKeys.length > 0) {
                syncKeys.forEach(key => {
                    const value = syncData[key];
                    const valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
                    message += `  • ${key}: ${valueStr.substring(0, MAX_DISPLAY_LEN)}${valueStr.length > MAX_DISPLAY_LEN ? '...' : ''}\n`;
                });
            } else {
                message += `  (비어있음)\n`;
            }
            
            message += `\n💾 Local Storage (${localKeys.length}개 항목):\n`;
            if (localKeys.length > 0) {
                localKeys.forEach(key => {
                    const value = localData[key];
                    const valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
                    message += `  • ${key}: ${valueStr.substring(0, MAX_DISPLAY_LEN)}${valueStr.length > MAX_DISPLAY_LEN ? '...' : ''}\n`;
                });
            } else {
                message += `  (비어있음)\n`;
            }
            
            // 콘솔에도 상세 정보 출력
            this.log('=== Storage 정보 ===');
            this.log('Sync Storage:', syncData);
            this.log('Local Storage:', localData);
            
            alert(message);
            
        } catch (error) {
            console.error('Storage 정보 조회 실패:', error);
            this.showStatus('Storage 정보를 가져올 수 없습니다.', 'error');
        }
    }
}

// 설정 창이 로드되면 초기화
document.addEventListener('DOMContentLoaded', () => {
    new settingPageManager();
    
    // 탭 기능 설정
    function setupTabs() {
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.getAttribute('data-tab');
                
                // 모든 탭 비활성화
                tabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                
                // 선택된 탭 활성화
                tab.classList.add('active');
                document.getElementById(targetTab).classList.add('active');
            });
        });
    }
    
    // 로그 기능 설정
    function setupLogs() {
        const logContainer = document.getElementById('logContainer');
        const clearLogsBtn = document.getElementById('clearLogs');
        const refreshLogsBtn = document.getElementById('refreshLogs');
        
        // 체크박스 필터들
        const filterDebug = document.getElementById('filterDebug');
        const filterInfo = document.getElementById('filterInfo');
        const filterLog = document.getElementById('filterLog');
        const filterWarn = document.getElementById('filterWarn');
        const filterError = document.getElementById('filterError');
        
        let lastLogCount = 0; // 마지막 로그 개수 추적
        let allLogs = []; // 모든 로그 저장
        
        // 로그가 새로 추가되었는지 추적
        let hasNewLogs = false;
        
        // 활성화된 필터 레벨들 가져오기
        function getActiveFilters() {
            const activeFilters = [];
            if (filterDebug.checked) activeFilters.push('debug');
            if (filterInfo.checked) activeFilters.push('info');
            if (filterLog.checked) activeFilters.push('log');
            if (filterWarn.checked) activeFilters.push('warn');
            if (filterError.checked) activeFilters.push('error');
            return activeFilters;
        }
        
        // 로그 새로고침
        async function refreshLogs() {
            chrome.runtime.sendMessage({action: 'getLogs'}, (response) => {
                try {
                    allLogs = response.logs || [];
                    const currentLogCount = allLogs.length;
                    
                    // 로그가 추가되었는지 확인
                    hasNewLogs = currentLogCount > lastLogCount;
                    
                    // 기존 로그 개수 업데이트
                    lastLogCount = currentLogCount;

                    // 필터 적용
                    const activeFilters = getActiveFilters();
                    const filteredLogs = allLogs.filter(log => activeFilters.includes(log.level));
                    
                    logContainer.innerHTML = '';
                    
                    if (filteredLogs.length === 0) {
                        if (allLogs.length === 0) {
                            logContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">로그가 없습니다.</div>';
                        } else {
                            logContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">선택된 레벨의 로그가 없습니다.</div>';
                        }
                        return;
                    }
                    
                    filteredLogs.forEach(log => {
                        const logElement = document.createElement('div');
                        logElement.style.padding = '8px 12px';
                        logElement.style.borderBottom = '1px solid #eee';
                        logElement.style.fontFamily = 'monospace';
                        logElement.style.fontSize = '12px';
                        logElement.style.whiteSpace = 'pre-wrap';
                        logElement.style.wordBreak = 'break-all';
                        
                        // 로그 레벨에 따른 색상
                        const levelColors = {
                            debug: '#6c757d',
                            info: '#007bff',
                            log: '#28a745',
                            warn: '#ffc107',
                            error: '#dc3545'
                        };
                        
                        logElement.style.color = levelColors[log.level] || '#000';
                        logElement.textContent = `[${log.level.toUpperCase()}] ${log.message}`;
                        
                        logContainer.appendChild(logElement);
                    });
                    
                    // 새 로그가 추가되었으면 항상 맨 아래로 스크롤
                    if (hasNewLogs) {
                        logContainer.scrollTop = logContainer.scrollHeight;
                    }
                } catch (error) {
                    logContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">로그를 가져올 수 없습니다.</div>';
                }
            });
        }
        
        // 로그 지우기
        clearLogsBtn.addEventListener('click', async () => {
            try {
                await chrome.runtime.sendMessage({ action: 'clearLogs'});
                refreshLogs();
            } catch (error) {
                console.error('로그 지우기 실패:', error);
            }
        });
        
        // 로그 새로고침
        refreshLogsBtn.addEventListener('click', refreshLogs);
        
        // 체크박스 필터 변경 이벤트
        filterDebug.addEventListener('change', refreshLogs);
        filterInfo.addEventListener('change', refreshLogs);
        filterLog.addEventListener('change', refreshLogs);
        filterWarn.addEventListener('change', refreshLogs);
        filterError.addEventListener('change', refreshLogs);
        
        // 초기 로그 로드
        refreshLogs();
        
        // 5초마다 자동 새로고침
        setInterval(refreshLogs, 5000);
    }
    
    setupTabs();
    setupLogs();
});

// 문의하기 기능
function showInquiryAlert(event) {
    event.preventDefault();
    if (confirm('카카오톡 1:1 오픈채팅입니다.\n버그 신고, 기능 요청, 사용법 문의 등 언제든지 편하게 문의해주세요!\n아 그리고 잘 찾아보면 송금버튼도... 앜!')) {
        window.open('https://open.kakao.com/o/sqBqEFSh');
    }
} 