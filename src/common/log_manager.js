// ===================== 로그 관리자 =====================
// Background script로 중앙 집중식 로그 관리
// 모든 context에서 동일한 로그 저장소 사용

// 공통 로깅 함수 (모든 파일에서 사용) - Background script로 직접 전송
function logToExtension(...args) {
    try {
        chrome.runtime.sendMessage({
            action: 'addLog',
            level: 'log',
            args: args
        }).catch(() => {
            // Background script에 접근할 수 없는 경우 콘솔에 출력
            console.error(...args);
        });
        // console.log(...args);
    } catch (error) {
        console.log(...args);
    }
}

function infoToExtension(...args) {
    try {
        chrome.runtime.sendMessage({
            action: 'addLog',
            level: 'info',
            args: args
        }).catch(() => {
            console.info(...args);
        });
    } catch (error) {
        console.info(...args);
    }
}

function warnToExtension(...args) {
    try {
        chrome.runtime.sendMessage({
            action: 'addLog',
            level: 'warn',
            args: args
        }).catch(() => {
            console.warn(...args);
        });
    } catch (error) {
        console.warn(...args);
    }
}

function errorToExtension(...args) {
    try {
        chrome.runtime.sendMessage({
            action: 'addLog',
            level: 'error',
            args: args
        }).catch(() => {
            console.error(...args);
        });
    } catch (error) {
        console.error(...args);
    }
}

function debugToExtension(...args) {
    try {
        chrome.runtime.sendMessage({
            action: 'addLog',
            level: 'debug',
            args: args
        }).catch(() => {
            console.debug(...args);
        });
    } catch (error) {
        console.debug(...args);
    }
} 