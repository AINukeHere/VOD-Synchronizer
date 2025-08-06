if (window !== top){
    function log(...data){
        logToExtension('[vod_get.js]', ...data);
    }
    
    // 공통 유틸리티 함수
    function parseDateFromText(innerText) {
        // HH시간전 형식인지 체크
        const timeAgoMatch = innerText.match(/(\d+)시간 전/);
        if (timeAgoMatch) {
            const hoursAgo = parseInt(timeAgoMatch[1]);
            const uploadDate = new Date();
            uploadDate.setHours(uploadDate.getHours() - hoursAgo);
            const year = uploadDate.getFullYear();
            const month = uploadDate.getMonth() + 1;
            const day = uploadDate.getDate();
            log(`시간전 형식 파싱: ${hoursAgo}시간전 -> ${year}-${month}-${day}`);
            return { year, month, day };
        } else {
            // YYYY-MM-DD 형식 처리
            const [_year, _month, _day] = innerText.split("-");
            const year = parseInt(_year);
            const month = parseInt(_month);
            const day = parseInt(_day);
            return { year, month, day };
        }
    }
    
    function getVodInfoList() {
        const textToExplainEmpty = document.querySelector('#contents > div > div > section > section.vod-list > ul > li > p');
        if (textToExplainEmpty && textToExplainEmpty.innerText === '등록된 VOD가 없습니다.'){
            return [];
        }
        const dateSpanElements = document.querySelectorAll('#contents > div > div > section > section.vod-list > ul > li > div.vod-info > div > span.date');
        const vodLinkList = document.querySelectorAll('#contents > div > div > section > section.vod-list > ul > li > div.vod-info > p > a');
        if (dateSpanElements.length == 0) return null;
        if (vodLinkList.length == 0) return null;
        log("date length", dateSpanElements.length);
        log("link length", vodLinkList.length);
        
        const vodInfoList = [];
        for (var i = 0; i < dateSpanElements.length; ++i){
            const innerText = dateSpanElements[i].innerText;
            const { year, month, day } = parseDateFromText(innerText);
            const vodInfo = {
                year: year,
                month: month,
                day: day,
                link: vodLinkList[i].href
            };
            vodInfoList.push(vodInfo);
        }
        return vodInfoList;
    }
    
    // 페이지 1에서 동작하는 메인 매니저 클래스
    class PageOneVodManager {
        constructor(requestVodDatetime) {
            this.requestVodDatetime = requestVodDatetime;
            this.allVodInfoList = [];
            this.childVodListInfoList = [];
            this.expectedChildPages = 0;
            this.receivedChildPages = 0;
            this.childIframes = [];
            
            this.requestYear = requestVodDatetime.getFullYear();
            this.requestMonth = requestVodDatetime.getMonth() + 1;
            this.requestDay = requestVodDatetime.getDate();
        }
        
        start() {
            log('[PageOneVodManager] 시작' + window.location.toString());
            this.tryGetCurrentPageVodInfo();
        }
        
        tryGetCurrentPageVodInfo() {
            const intervalID = setInterval(() => {
                const vodInfoList = getVodInfoList();
                if (vodInfoList === null) return;
                
                log('[PageOneVodManager] 현재 페이지 VOD 정보 수집 완료:', vodInfoList.length);
                this.allVodInfoList.push(...vodInfoList);
                this.checkAndCreateChildPages();
                clearInterval(intervalID);
                this.checkAllDataReceived();
            }, 100);
        }
        
        checkAndCreateChildPages() {
            const pages = document.querySelectorAll('#contents > div > div > section > section.vod-srh_wrap > div > a');
            this.expectedChildPages = pages.length - 2; // 첫 번째 페이지와 다음페이지 넘김버튼 제외
            
            log(`[PageOneVodManager] 추가 페이지 수: ${this.expectedChildPages}`);
            
            if (this.expectedChildPages > 0) {
                // 자식 페이지로부터 메시지 수신 대기
                window.addEventListener('message', (event) => {
                    if (event.data.response === "SOOP_VOD_INFO_LIST") {
                        this.handleChildPageData(event.data.resultVODInfos);
                    }
                });
                for (var i = 1; i < pages.length - 1; ++i) {
                    const page = pages[i];
                    const iframe = document.createElement('iframe');
                    iframe.src = page.href;
                    iframe.style.display = 'none';
                    document.body.appendChild(iframe);
                    this.childIframes.push(iframe); 
                }
            } else {
                // 추가 페이지가 없으면 바로 결과 전송
                this.sendFinalResult();
            }
        }
        
        handleChildPageData(childVodInfoList) {
            this.receivedChildPages++;
            log(`[PageOneVodManager] 자식 페이지 데이터 수신 (${this.receivedChildPages}/${this.expectedChildPages})`);
            
            if (childVodInfoList && childVodInfoList.length > 0) {
                this.childVodListInfoList.push(childVodInfoList);
            }
            
            this.checkAllDataReceived();
        }
        
        checkAllDataReceived() {
            if (this.receivedChildPages >= this.expectedChildPages) {
                this.sendFinalResult();
            }
        }
        
        sendFinalResult() {
            const finalVodLinks = this.createFinalVodLinkList();
            log(`[PageOneVodManager] 최종 VOD 링크 수: ${finalVodLinks.length}`);
            
            const message = {
                response: "SOOP_VOD_LIST",
                resultVODLinks: finalVodLinks
            };
            window.parent.postMessage(message, "https://www.sooplive.co.kr");
        }
        
        createFinalVodLinkList() {
            // 날짜순으로 정렬 (오래된 순)
            this.childVodListInfoList.sort((a, b) => {
                if (a.year !== b.year) return a.year - b.year;
                if (a.month !== b.month) return a.month - b.month;
                return a.day - b.day;
            });
            for (var i = 0; i < this.childVodListInfoList.length; ++i) {
                this.allVodInfoList.push(...this.childVodListInfoList[i]);
            }
            
            let resultVODLinks = [];
            
            // 요청날짜와 동일한 첫번째 요소와 끝 요소 인덱스 찾기
            let firstIndex = -1;
            let lastIndex = -1;
            for (var i = 0; i < this.allVodInfoList.length; ++i) {
                const vodInfo = this.allVodInfoList[i];

                if (vodInfo.year > this.requestYear || 
                   (vodInfo.year == this.requestYear && vodInfo.month > this.requestMonth) || 
                   (vodInfo.year == this.requestYear && vodInfo.month == this.requestMonth && vodInfo.day > this.requestDay)) {
                    firstIndex = i;
                }
                else if (vodInfo.year < this.requestYear ||
                    (vodInfo.year == this.requestYear && vodInfo.month < this.requestMonth) ||
                    (vodInfo.year == this.requestYear && vodInfo.month == this.requestMonth && vodInfo.day < this.requestDay)) {
                    lastIndex = i;
                    break;
                }
            }
            for (var i = firstIndex; i <= lastIndex; ++i) {
                const vodInfo = this.allVodInfoList[i];
                resultVODLinks.push(vodInfo.link);
                log(`vod added: ${vodInfo.year}-${vodInfo.month}-${vodInfo.day} ${vodInfo.link}`);
            }
            return resultVODLinks;
        }
    }
    
    // 페이지 2 이상에서 동작하는 자식 페이지 매니저 클래스
    class ChildPageVodManager {
        constructor(requestVodDatetime) {
            this.requestVodDatetime = requestVodDatetime;
        }
        
        start() {
            log('[ChildPageVodManager] 시작' + window.location.toString());
            this.tryGetVodInfo();
        }
        
        tryGetVodInfo() {
            const intervalID = setInterval(() => {
                const vodInfoList = getVodInfoList();
                if (vodInfoList === null) return;
                
                log('[ChildPageVodManager] VOD 정보 수집 완료:', vodInfoList.length);
                
                // 부모 페이지(PageOneVodManager)로 데이터 전송
                const message = {
                    response: "SOOP_VOD_INFO_LIST",
                    resultVODInfos: vodInfoList
                };
                window.parent.postMessage(message, window.origin);
                clearInterval(intervalID);
            }, 100);
        }
    }
    
    // 메인 실행 로직
    log('[vod_get.js] in iframe');
    const params = new URLSearchParams(window.location.search);
    const p_request = params.get("p_request");
    const pageNum = parseInt(params.get("page") || "1");
    
    if (p_request === "GET_VOD_LIST") {
        const request_vod_ts = params.get("request_vod_ts");
        const request_vod_datetime = new Date(parseInt(request_vod_ts));
        
        if (pageNum === 1) {
            // 페이지 1: 메인 매니저 실행
            const pageOneManager = new PageOneVodManager(request_vod_datetime);
            pageOneManager.start();
        } else {
            // 페이지 2 이상: 자식 페이지 매니저 실행
            const childManager = new ChildPageVodManager(request_vod_datetime);
            childManager.start();
        }
    }
}