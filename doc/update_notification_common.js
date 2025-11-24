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
    // 컨텐츠 컨테이너의 실제 크기 측정
    const updateContainer = document.querySelector('.update-container');
    
    if (updateContainer) {
        // 컨테이너의 실제 렌더링 크기 측정
        const rect = updateContainer.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(updateContainer);
        
        // 패딩과 마진을 고려한 실제 크기 계산
        const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
        const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
        const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
        const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
        
        const width = rect.width + paddingLeft + paddingRight;
        const height = rect.height + paddingTop + paddingBottom;
        
        // 디버깅을 위한 로그
        console.log('컨텐츠 크기 측정 결과:', {
            rectWidth: rect.width,
            rectHeight: rect.height,
            paddingTop,
            paddingBottom,
            paddingLeft,
            paddingRight,
            최종너비: width,
            최종높이: height,
            bodyScrollHeight: document.body.scrollHeight,
            htmlScrollHeight: document.documentElement.scrollHeight
        });
        
        // 부모 페이지에 크기 정보 전송
        if (window.parent && window.parent !== window) {
            console.log('크기 전송', width, height);
            window.parent.postMessage({
                type: 'vodSync-iframe-resize',
                width: width,
                height: height
            }, '*');
        }
    } else {
        console.error('컨텐츠 컨테이너를 찾을 수 없습니다.');
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

