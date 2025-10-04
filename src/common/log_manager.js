// ===================== 로그 관리자 =====================
// Background script로 중앙 집중식 로그 관리
// 모든 context에서 동일한 로그 저장소 사용

// 탭 정보를 가져오는 함수 (ID와 제목)
function getTabInfo() {
    return new Promise((resolve) => {
        // background script에서 실행 중인 경우
        if (typeof chrome !== 'undefined' && chrome.tabs) {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                const tab = tabs[0];
                resolve({
                    id: tab?.id || 'unknown',
                    title: tab?.title || 'unknown'
                });
            });
        } else {
            // content script에서는 background script에 요청
            chrome.runtime.sendMessage({ action: 'getTabId' }, (response) => {
                if (chrome.runtime.lastError) {
                    // background script에 접근할 수 없는 경우
                    resolve({
                        id: 'unknown',
                        title: document.title || 'unknown'
                    });
                } else {
                    resolve({
                        id: response.tabId || 'unknown',
                        title: response.tabTitle || document.title || 'unknown'
                    });
                }
            });
        }
    });
}

// 탭 제목에서 식별자 생성
function createTabDisplayName(tabTitle) {
    if (!tabTitle || tabTitle === 'unknown') {
        return 'Unknown';
    }
    
    // 제목의 앞부분 10자까지 사용
    let displayName = tabTitle.substring(0, 10);
    
    // 특수문자 제거 및 정리
    displayName = displayName.replace(/[^\w\s가-힣]/g, '');
    
    // 공백이 많으면 줄이기
    displayName = displayName.replace(/\s+/g, ' ').trim();
    
    // 원본 제목이 10자보다 길면 ... 추가
    if (tabTitle.length > 10) {
        displayName += '...';
    }
    
    return displayName || 'Tab';
}

// 탭 정보를 포함한 로그 메시지 생성
function createLogMessage(tabId, tabTitle, ...args) {
    const timestamp = new Date().toLocaleTimeString();
    const displayName = createTabDisplayName(tabTitle);
    return [`[${displayName}] [${timestamp}]`, ...args];
}

// 디버깅용 함수 - 현재 탭 정보 확인
async function debugTabInfo() {
    const tabInfo = await getTabInfo();
    const displayName = createTabDisplayName(tabInfo.title);
    
    console.log('Tab ID:', tabInfo.id);
    console.log('Tab Title:', tabInfo.title);
    console.log('Display Name:', displayName);
    console.log('Current URL:', window.location.href);
    
    return { 
        tabId: tabInfo.id, 
        tabTitle: tabInfo.title,
        displayName: displayName,
        url: window.location.href
    };
}

// 공통 로깅 함수 (모든 파일에서 사용) - Background script로 직접 전송
async function logToExtension(...args) {
    try {
        const tabInfo = await getTabInfo();
        const logMessage = createLogMessage(tabInfo.id, tabInfo.title, ...args);
        
        chrome.runtime.sendMessage({
            action: 'addLog',
            level: 'log',
            args: logMessage
        }).catch(() => {
            // Background script에 접근할 수 없는 경우 콘솔에 출력
            console.log(...logMessage);
        });
        // console.log(...logMessage);
    } catch (error) {
        console.error(...args);
    }
}

async function infoToExtension(...args) {
    try {
        const tabInfo = await getTabInfo();
        const logMessage = createLogMessage(tabInfo.id, tabInfo.title, ...args);
        
        chrome.runtime.sendMessage({
            action: 'addLog',
            level: 'info',
            args: logMessage
        }).catch(() => {
            console.info(...logMessage);
        });
        console.info(...logMessage);
    } catch (error) {
        console.info(...args);
    }
}

async function warnToExtension(...args) {
    try {
        const tabInfo = await getTabInfo();
        const logMessage = createLogMessage(tabInfo.id, tabInfo.title, ...args);
        
        chrome.runtime.sendMessage({
            action: 'addLog',
            level: 'warn',
            args: logMessage
        }).catch(() => {
            console.warn(...logMessage);
        });
        console.warn(...logMessage);
    } catch (error) {
        console.warn(...args);
    }
}

async function errorToExtension(...args) {
    try {
        const tabInfo = await getTabInfo();
        const logMessage = createLogMessage(tabInfo.id, tabInfo.title, ...args);
        
        chrome.runtime.sendMessage({
            action: 'addLog',
            level: 'error',
            args: logMessage
        }).catch(() => {
            console.error(...logMessage);
        });
        console.error(...logMessage);
    } catch (error) {
        console.error(...args);
    }
}

async function debugToExtension(...args) {
    try {
        const tabInfo = await getTabInfo();
        const logMessage = createLogMessage(tabInfo.id, tabInfo.title, ...args);
        
        chrome.runtime.sendMessage({
            action: 'addLog',
            level: 'debug',
            args: logMessage
        }).catch(() => {
            console.debug(...logMessage);
        });
        console.debug(...logMessage);
    } catch (error) {
        console.debug(...args);
    }
} 