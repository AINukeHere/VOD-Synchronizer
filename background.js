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
        height: 650
    }, (window) => {
        // 생성된 창의 ID를 저장
        settingsWindowId = window.id;
    });
}

// 창이 닫힐 때 ID 초기화
chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === settingsWindowId) {
        settingsWindowId = null;
    }
}); 