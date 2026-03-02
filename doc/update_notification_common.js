// 이미지 모달 열기
function openImageModal(imageSrc) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    if (modal && modalImage) {
        modalImage.src = imageSrc;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

// 이미지 모달 닫기
function closeImageModal() {
    const modal = document.getElementById('imageModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ESC 키로 모달 닫기
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeImageModal();
    }
});

// 버그 수정 섹션 토글
function toggleBugFix() {
    const section = document.getElementById('bugFixSection');
    if (section) {
        section.classList.toggle('expanded');
        // 애니메이션 완료 후 최종 크기 재계산 (0.3초 후)
        setTimeout(sendSizeToParent, 350);
    }
}

// 페이지 로드 완료 후 부모 페이지에 크기 정보 전송
function sendSizeToParent() {
    const updateContainer = document.querySelector('.update-container');
    if (!updateContainer) {
        console.error('컨텐츠 컨테이너를 찾을 수 없습니다.');
        return;
    }

    const rect = updateContainer.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(updateContainer);
    const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
    const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
    const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(computedStyle.paddingRight) || 0;

    const width = rect.width + paddingLeft + paddingRight;
    // 컨테이너의 scrollHeight만 사용. document/body scrollHeight를 쓰면 iframe 높이 설정 → body가 그만큼 늘어남 → 다음 전송 시 그 값이 다시 전달되어 토글할 때마다 높이가 커지는 현상 발생
    const height = updateContainer.scrollHeight + paddingTop + paddingBottom;

    if (window.parent && window.parent !== window) {
        window.parent.postMessage({
            type: 'vodSync-iframe-resize',
            width: width,
            height: height
        }, '*');
    }
}

// DOM 로드 완료 후 크기 전송
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sendSizeToParent);
} else {
    sendSizeToParent();
}

// 추가로 약간의 지연을 두고 한 번 더 전송 (폰트 로딩 등 고려)
setTimeout(sendSizeToParent, 1000);

