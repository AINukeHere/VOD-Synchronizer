// 설정창 window ID 저장용 변수
let settingsWindowId = null;

// 단축키 이벤트 리스너
chrome.commands.onCommand.addListener((command) => {
    if (command === "open-settings") {
        if (settingsWindowId !== null) {
            // 저장된 창 ID로 창이 존재하는지 확인
            chrome.windows.get(settingsWindowId, (window) => {
                if (chrome.runtime.lastError) {
                    // 창이 없으면 새로 생성
                    createSettingsWindow();
                } else {
                    // 창이 있으면 포커스
                    chrome.windows.update(settingsWindowId, { focused: true });
                }
            });
        } else {
            // 저장된 ID가 없으면 새로 생성
            createSettingsWindow();
        }
    }
});

// 설정창 생성 함수
function createSettingsWindow() {
    chrome.windows.create({
        url: chrome.runtime.getURL('settings.html'),
        type: 'popup',
        width: 550,
        height: 750,
        focused: true
    }, (window) => {
        // 생성된 창의 ID를 저장
        settingsWindowId = window.id;
        
        // 창이 생성된 후 포커스 유지
        chrome.windows.update(window.id, { focused: true });
    });
}

// 창이 닫힐 때 ID 초기화
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === settingsWindowId) {
        settingsWindowId = null;
    }
});

// 창이 포커스를 잃을 때 다시 포커스 가져오기
chrome.windows.onFocusChanged.addListener((windowId) => {
    if (settingsWindowId !== null && windowId !== settingsWindowId) {
        // 설정창이 열려있고 다른 창이 포커스를 받았을 때
        chrome.windows.get(settingsWindowId, (window) => {
            if (!chrome.runtime.lastError && window) {
                // 설정창이 여전히 존재하면 포커스 가져오기
                chrome.windows.update(settingsWindowId, { focused: true });
            }
        });
    }
});

// 로그 관리 기능
let logs = [];
const maxLogs = 1000;

// 로그 추가
function addLog(level, args) {
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
        fullArgs: args
    };
    
    logs.push(logEntry);
    
    // 최대 로그 개수 제한
    if (logs.length > maxLogs) {
        logs.shift();
    }
}

// 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'addLog') {
        addLog(request.level, request.args);
        sendResponse({ success: true });
    } else if (request.action === 'getLogs') {
        const level = request.level || null;
        const filteredLogs = level ? logs.filter(log => log.level === level) : logs;
        sendResponse({ logs: filteredLogs });
    } else if (request.action === 'clearLogs') {
        logs = [];
        sendResponse({ success: true });
    }
}); 