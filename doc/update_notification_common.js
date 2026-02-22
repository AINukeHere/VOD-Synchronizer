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
    // 스크롤이 생겨도 높이를 뚫고 나가지 않도록 문서 전체 높이(scrollHeight) 사용
    const contentHeight = Math.max(
        updateContainer.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.scrollHeight
    );
    const height = contentHeight + paddingTop + paddingBottom;

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

