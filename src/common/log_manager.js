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
            console.error(...logMessage);
        });
        // console.log(...logMessage);
    } catch (error) {
        console.log(...args);
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
            console.error(...logMessage);
        });
        console.log(...logMessage);
    } catch (error) {
        console.log(...args);
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
            console.error(...logMessage);
        });
        console.log(...logMessage);
    } catch (error) {
        console.log(...args);
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
        console.log(...args);
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
            console.error(...logMessage);
        });
        console.debug(...logMessage);
    } catch (error) {
        console.debug(...args);
    }
}

// ===================== 업데이트 관리자 =====================
// 버전 업데이트 감지 및 알림 기능

// 업데이트 내역 데이터
const UPDATE_HISTORY = {
    "1.2.3": {
        date: "2025-01-15",
        changes: [
            "간단한 반복 재생 설정 기능을 추가했습니다. VOD 플레이어의 설정을 누르면 반복 재생 메뉴가 추가됩니다.",
            "이제 업데이트 시 1회에 한하여 업데이트 내역을 표시합니다."
        ]
    },
    "1.2.2": {
        date: "2025-01-09",
        changes: [
            "SOOP 타임스탬프 관리 개선",
            "동기화 성능 최적화",
            "UI/UX 개선"
        ]
    },
    "1.2.1": {
        date: "2025-01-05",
        changes: [
            "CHZZK 연동 기능 강화",
            "설정 저장 방식 개선",
            "오류 처리 로직 개선"
        ]
    }
};

// 현재 버전 가져오기
function getCurrentVersion() {
    return chrome.runtime.getManifest().version;
}

// 저장된 마지막 확인 버전 가져오기
async function getLastCheckedVersion() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['lastCheckedVersion'], (result) => {
            resolve(result.lastCheckedVersion || null);
        });
    });
}

// 마지막 확인 버전 저장
async function setLastCheckedVersion(version) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ lastCheckedVersion: version }, () => {
            resolve();
        });
    });
}

// 버전 비교 함수 (semantic versioning)
function compareVersions(version1, version2) {
    const v1parts = version1.split('.').map(Number);
    const v2parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
        const v1part = v1parts[i] || 0;
        const v2part = v2parts[i] || 0;
        
        if (v1part > v2part) return 1;
        if (v1part < v2part) return -1;
    }
    return 0;
}

// 간단한 iframe 모달 템플릿
const MODAL_HTML_TEMPLATE = `
    <div id="vodSyncUpdateModal" style="
        position: fixed;
        z-index: 999999;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        ">
        <div id="modalContent" style="
            background-color: #fefefe;
            margin: auto;
            padding: 0;
            border-radius: 10px;
            width: auto;
            min-width: 300px;
            max-width: 90vw;
            height: auto;
            min-height: 200px;
            max-height: 90vh;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            animation: vodSyncModalSlideIn 0.3s ease-out;
            position: relative;
            ">
            <div style="
                background: linear-gradient(135deg, #007bff, #0056b3);
                color: white;
                padding: 15px 20px;
                border-radius: 10px 10px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
                ">
                <h2 style="margin: 0; font-size: 18px; font-weight: 600;"> VOD Synchronizer 업데이트 알림</h2>
                <span class="vod-sync-close" style="
                color: white;
                font-size: 28px;
                font-weight: bold;
                cursor: pointer;
                line-height: 1;
                ">&times;</span>
            </div>
            <iframe id="updateIframe" style="
            width: 500px;
            height: 300px;
            border: none;
            border-radius: 0 0 10px 10px;
            transition: width 0.3s ease, height 0.3s ease;
            "></iframe>
        </div>
    </div>
    <style>
        @keyframes vodSyncModalSlideIn {
            from {
                opacity: 0;
                transform: translateY(-50px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        .vod-sync-close:hover {
            opacity: 0.7;
        }
    </style>
`;

// 동적 모달 생성 및 표시 (iframe 방식)
function createAndShowUpdateModal(version) {
    logToExtension(`업데이트 알림 표시됨: v${version}`);
    // 기존 모달이 있으면 제거
    const existingModal = document.getElementById('vodSyncUpdateModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // 모달을 body에 추가
    document.body.insertAdjacentHTML('beforeend', MODAL_HTML_TEMPLATE);
    
    // 모달 표시
    const modal = document.getElementById('vodSyncUpdateModal');
    const iframe = document.getElementById('updateIframe');
    
    if (modal && iframe) {
        modal.style.display = 'flex';
        
        // URL 파라미터로 업데이트 정보 전달
        const iframeUrl = `https://ainukehere.github.io/VOD-Synchronizer/doc/update_notification_v${version}.html`;
        
        iframe.src = iframeUrl;
        
        // 모달 닫기 이벤트 설정
        const closeBtn = modal.querySelector('.vod-sync-close');
        
        const closeModal = () => {
            modal.remove();
        };
        
        closeBtn.onclick = closeModal;
        
        // 모달 외부 클릭 시 닫기
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };
        
        // ESC 키로 닫기
        const handleEscKey = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEscKey);
            }
        };
        document.addEventListener('keydown', handleEscKey);
    }
}


// iframe 크기 자동 조절 함수 (postMessage로 받은 크기 정보 사용)
function resizeIframe(iframe, contentWidth, contentHeight) {
    try {
        // 최소/최대 크기 제한
        const minWidth = 300;
        const maxWidth = 600;
        const minHeight = 200;
        const maxHeight = 500;
        
        const newWidth = Math.max(minWidth, Math.min(maxWidth, contentWidth));
        const newHeight = Math.max(minHeight, Math.min(maxHeight, contentHeight));
        
        iframe.style.width = newWidth + 'px';
        iframe.style.height = newHeight + 'px';
        
        // 모달 컨테이너도 iframe 크기에 맞게 조절
        const modalContent = document.getElementById('modalContent');
        if (modalContent) {
            modalContent.style.width = newWidth + 'px';
            modalContent.style.height = (newHeight + 60) + 'px'; // 헤더 높이(60px) 추가
        }
    } catch (error) {
        console.error('iframe 크기 조절 중 오류:', error);
        // 오류 발생 시 기본 크기 유지
        iframe.style.width = '500px';
        iframe.style.height = '300px';
        
        const modalContent = document.getElementById('modalContent');
        if (modalContent) {
            modalContent.style.width = '500px';
            modalContent.style.height = '360px'; // 헤더 높이(60px) 추가
        }
    }
}

// postMessage 이벤트 리스너 추가
window.addEventListener('message', function(event) {
    // 보안을 위해 origin 확인 (필요시)
    // if (event.origin !== 'https://ainukehere.github.io') return;
    
    if (event.data && event.data.type === 'vodSync-iframe-resize') {
        const iframe = document.getElementById('updateIframe');
        if (iframe) {
            resizeIframe(iframe, event.data.width, event.data.height);
        }
    }
});
// 업데이트 확인 및 알림
async function checkForUpdates() {
    try {
        const currentVersion = getCurrentVersion();
        const lastCheckedVersion = await getLastCheckedVersion();
        
        logToExtension(`업데이트 확인 중... 현재 버전: ${currentVersion}, 마지막 확인: ${lastCheckedVersion || '없음'}`);
        
        // 처음 설치하거나 버전이 다른 경우
        if (!lastCheckedVersion || compareVersions(currentVersion, lastCheckedVersion) > 0) {
            logToExtension(`새로운 업데이트 감지됨: v${currentVersion}`);
            
            // 업데이트 알림 설정 확인
            const settings = await getSettings();
            if (settings.enableUpdateNotification) {
                createAndShowUpdateModal(currentVersion);
            } else {
                logToExtension(`업데이트 알림이 비활성화되어 있습니다.`);
            }
            
            // 현재 버전을 마지막 확인 버전으로 저장
            await setLastCheckedVersion(currentVersion);
        } else {
            logToExtension(`업데이트 없음. 현재 버전: ${currentVersion}`);
        }
    } catch (error) {
        errorToExtension('업데이트 확인 중 오류 발생:', error);
    }
}

// 설정 가져오기 함수
async function getSettings() {
    try {
        const response = await chrome.runtime.sendMessage({ action: 'getAllSettings' });
        if (response.success) {
            return response.settings;
        } else {
            // 기본값도 SettingsManager에서 가져오기
            const defaultResponse = await chrome.runtime.sendMessage({ action: 'getDefaultSettings' });
            return defaultResponse.defaultSettings;
        }
    } catch (error) {
        logToExtension('설정 로드 실패:', error);
        // 최후의 수단으로 하드코딩된 기본값
        return {};
    }
}

// 로그 매니저 로드 시 자동으로 업데이트 확인
// 약간의 지연을 두고 업데이트 확인 (페이지 로딩 완료 후)
setTimeout(() => {
    checkForUpdates();
}, 2000);
