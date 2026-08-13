import { SettingsManager } from './settings_manager.js';

// 설정 탭 ID (아이콘 클릭·단축키 공통)
let settingsTabId = null;

function createSettingsTab() {
    const url = chrome.runtime.getURL('src/settings.html');
    chrome.tabs.create({ url, active: true }, (tab) => {
        if (chrome.runtime.lastError) {
            console.error('[VOD Master] 설정 탭 생성 실패:', chrome.runtime.lastError.message);
            settingsTabId = null;
            return;
        }
        if (!tab?.id) {
            settingsTabId = null;
            return;
        }
        settingsTabId = tab.id;
    });
}

// 이미 연 설정 탭이 있으면 그 탭으로 이동, 없으면 새 탭으로 연다.
function openSettingsTab() {
    if (settingsTabId === null) {
        createSettingsTab();
        return;
    }
    chrome.tabs.get(settingsTabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
            createSettingsTab();
            return;
        }
        chrome.tabs.update(settingsTabId, { active: true }, () => {
            if (tab.windowId != null) {
                chrome.windows.update(tab.windowId, { focused: true });
            }
        });
    });
}

// 이전 버전에서 default_popup이 남아 있으면 onClicked가 안 뜨므로 명시적으로 비운다.
chrome.action.setPopup({ popup: '' });

// 확장 아이콘 클릭 → 새 탭에서 설정
chrome.action.onClicked.addListener(() => {
    openSettingsTab();
});

// 단축키도 동일하게 새 탭으로 설정 연다
chrome.commands.onCommand.addListener((command) => {
    if (command === 'open-settings') {
        openSettingsTab();
    }
});

// 전역 설정 관리자 (리스너 등록 후에 초기화)
const settingsManager = new SettingsManager();
// 로그 관리 기능
let logs = [];
const maxLogs = 1000;

// 로그 추가
function addLog(level, args, tabId = null) {
    const timestamp = new Date().toLocaleTimeString();
    const message = args.map(arg => {
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg);
            } catch (e) {
                return arg.toString();
            }
        }
        return String(arg);
    }).join(' ');
    
    const logEntry = {
        timestamp,
        level,
        message,
        fullArgs: args,
        tabId: tabId || 'unknown'
    };
    
    logs.push(logEntry);
    
    // 최대 로그 개수 제한
    if (logs.length > maxLogs) {
        logs.shift();
    }
}

chrome.tabs.onRemoved.addListener(function(tabid, removed) {
    if (tabid === settingsTabId) {
        settingsTabId = null;
    }
    settingsManager.removeChangeCallback(tabid);
    settingsManager.unregisterBroadcastSyncTab(tabid);
});
// 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'addLog') {
        // sender.tab.id를 사용하여 실제 탭 ID 가져오기
        const tabId = sender.tab ? sender.tab.id : request.tabId || 'unknown';
        addLog(request.level, request.args, tabId);
        sendResponse({ success: true });
    } else if (request.action === 'getTabId') {
        // 탭 ID와 제목 요청 처리
        const tabId = sender.tab ? sender.tab.id : 'unknown';
        const tabTitle = sender.tab ? sender.tab.title : 'unknown';
        sendResponse({ tabId: tabId, tabTitle: tabTitle });
    } else if (request.action === 'getLogs') {
        const tabId = request.tabId || null;
        let filteredLogs = logs;
        
        if (tabId) {
            filteredLogs = filteredLogs.filter(log => log.tabId === tabId);
        }
        
        sendResponse({ logs: filteredLogs });
    } else if (request.action === 'clearLogs') {
        logs = [];
        sendResponse({ success: true });
    } else if (request.action === 'getAllSettings') {
        // 모든 설정 조회
        settingsManager.getAllSettings().then((settings) => {
            console.log('getAllSettings response:', settings);
            sendResponse({ success: true, settings: settings });
        });
    } else if (request.action === 'getSetting') {
        // 특정 설정 조회
        settingsManager.getSetting(request.key).then((value) => {
            sendResponse({ success: true, value: value });
        });
    } else if (request.action === 'isFeatureEnabled') {
        // 기능 활성화 여부 조회
        const enabled = settingsManager.isFeatureEnabled(request.feature)
        sendResponse({ success: true, enabled: enabled });
    } else if (request.action === 'saveSettings') {
        // 설정 저장
        settingsManager.saveSettings(request.settings).then((success) => {
            sendResponse({ success: success });
        });
    } else if (request.action === 'resetSettings') {
        // 설정 초기화
        settingsManager.resetSettings().then((success) => {
            sendResponse({ success: success });
        });
    } else if (request.action === 'getDefaultSettings') {
        // 기본 설정 조회
        sendResponse({ success: true, defaultSettings: settingsManager.defaultSettings });
    } else if (request.action === 'addChangeCallback') {
        // 설정 변경 콜백 등록
        settingsManager.addChangeCallback(sender.tab?.id);
        sendResponse({ success: true });
    }
    else if (request.action === 'removeChangeCallback') {
        // 설정 변경 콜백 해제
        settingsManager.removeChangeCallback(sender.tab?.id);
        sendResponse({ success: true });
    }
    else if (request.action === 'registerBroadcastSyncTab') {
        settingsManager.registerBroadcastSyncTab(sender.tab?.id);
        sendResponse({ success: true });
    }
    else if (request.action === 'unregisterBroadcastSyncTab') {
        settingsManager.unregisterBroadcastSyncTab(sender.tab?.id);
        sendResponse({ success: true });
    }
    else if (request.action === 'broadCastSync') {
        settingsManager.sendBroadcastSyncToRegistered(sender.tab?.id, request.request_vod_ts);
        sendResponse({ success: true });
    }
    else if (request.action === 'openSettings') {
        // 콘텐츠 스크립트의 window.open(chrome-extension://)은 Chrome이 차단하므로 백그라운드에서 연다.
        openSettingsTab();
        sendResponse({ success: true });
    }
    return true;
}); 