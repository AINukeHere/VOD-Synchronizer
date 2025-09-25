// SOOP VOD Finder 클래스들
// 공통 유틸리티 함수들
function parseDateFromText(innerText) {
    // N일 전 형식인지 체크
    const dayAgoMatch = innerText.match(/(\d+)일 전/);
    if (dayAgoMatch) {
        const daysAgo = parseInt(dayAgoMatch[1]);
        const uploadDate = new Date();
        uploadDate.setDate(uploadDate.getDate() - daysAgo);
        const year = uploadDate.getFullYear();
        const month = uploadDate.getMonth() + 1;
        const day = uploadDate.getDate();
        logToExtension(`일전 형식 파싱: ${daysAgo}일전 -> ${year}-${month}-${day}`);
        return { year, month, day };
    }
    // HH시간전 형식인지 체크
    const timeAgoMatch = innerText.match(/(\d+)시간 전/);
    if (timeAgoMatch) {
        const hoursAgo = parseInt(timeAgoMatch[1]);
        const uploadDate = new Date();
        uploadDate.setHours(uploadDate.getHours() - hoursAgo);
        const year = uploadDate.getFullYear();
        const month = uploadDate.getMonth() + 1;
        const day = uploadDate.getDate();
        logToExtension(`시간전 형식 파싱: ${hoursAgo}시간전 -> ${year}-${month}-${day}`);
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
export class SoopVODFinder {
    constructor() {
        const params = new URLSearchParams(window.location.search);
        const p_request = params.get("p_request");
        if (p_request === "GET_VOD_LIST_NEW_SOOP") {
            const rangeHours = params.get("range_hours");
            const request_vod_ts = params.get("request_vod_ts");

            this.requestVodDatetime = new Date(parseInt(request_vod_ts));
            this.rangeHours = rangeHours ? parseInt(rangeHours) : 24; // 검색 기간 범위 디폴트 24시간

            this.requestYear = this.requestVodDatetime.getFullYear();
            this.requestMonth = this.requestVodDatetime.getMonth() + 1;
            this.requestDay = this.requestVodDatetime.getDate();

            this.start();
        }
    }
    log(...data){
        logToExtension('[SoopVODFinder]', ...data);
    }

    async start() {
        let vodInfoList = null;
        this.log('시작' + window.location.toString());
        for(let iteration = 0; iteration < 10; ++iteration){
            vodInfoList = await this.getVodInfoList(this.rangeHours, iteration);
            if (vodInfoList === null || vodInfoList.length < 60) {
                this.log('현재 페이지 VOD 정보 수집 완료:', vodInfoList?.length);
                break;
            }
            this.log('60개이상 검색되었으므로 검색 기간을 줄여서 재검색');
            this.rangeHours = this.rangeHours / 2;
        }
        this.sendFinalResult(vodInfoList);
    }

    async getVodInfoList(rangeHours, iteration) {
        // 처음에만 필터를 여는 코드를 실행
        if (iteration == 0) {
            // MutationObserver로 필터 열기 버튼 대기
            this.log('필터 열기 버튼 찾기 시작');
            const filterOpenButton = await this.waitForElement('[class*="__soopui__FilterList-module__btnFilter___"]', 1, 5000);
            if (!filterOpenButton) {
                this.log('필터 열기 버튼 찾기 실패');
                return null;
            }
            this.log('필터 열기');
            filterOpenButton.click();
        }

        // MutationObserver로 날짜 선택기 열기 버튼 대기
        this.log('날짜 선택기 열기 버튼 찾기 시작');
        const dateSelectorOpenButton = await this.waitForElement('[class*="__soopui__InputBox-module__iconOnly__"]', 1, 5000);
        if (!dateSelectorOpenButton) {
            this.log('날짜 선택기 열기 버튼 찾기 실패');
            return null;
        }
        this.log('날짜 선택기 열기');
        dateSelectorOpenButton.click();

        // MutationObserver로 년월 선택기 열기 버튼 대기
        this.log('년월 선택기 열기 버튼 찾기 시작');
        const yearMonthDropdownButtons = await this.waitForElement('[class*="__soopui__Dropdown-module__dropDownButton__"]', 2, 5000);
        if (!yearMonthDropdownButtons || yearMonthDropdownButtons.length < 2) {
            this.log('년월 선택기 열기 버튼 찾기 실패');
            return null;
        }
        const yearDropdownButton = yearMonthDropdownButtons[0];
        const monthDropdownButton = yearMonthDropdownButtons[1];

        // 검색 기간 정하기 - 설정에서 가져오기
        const searchRangeHours = rangeHours;
        const startDate = new Date(this.requestVodDatetime.getTime() - searchRangeHours * 60 * 60 * 1000);
        const endDate = new Date(this.requestVodDatetime.getTime() + searchRangeHours * 60 * 60 * 1000);
        // 끝 날짜가 현재날짜보다 뒤가 되지는 않도록 처리
        if (endDate > new Date()) {
            endDate = new Date();
        }
        this.log(`기간 필터: ${startDate} ~ ${endDate}`);
        await this.setFilter(yearDropdownButton, monthDropdownButton, startDate); // 첫번째 호출하면 시작날짜가 설정됨
        this.log('기간 필터 시작날짜 설정 완료');
        await this.setFilter(yearDropdownButton, monthDropdownButton, endDate); // 두번째 호출하면 끝날짜가 설정됨
        this.log('기간 필터 끝날짜 설정 완료');

        // MutationObserver로 적용 버튼 대기
        this.log('적용 버튼 찾기 시작');
        const applyButton = await this.waitForElement('[class*="__soopui__DatepickerWrapper-module__button__"]', 1, 5000);
        if (!applyButton) {
            this.log('적용 버튼 찾기 실패');
            return null;
        }
        this.log('기간 필터 적용');
        applyButton.click();

        const oldVodListBox = document.querySelector('[class*="VodList_itemListBox__"]');
        const oldVodListItems = oldVodListBox.querySelectorAll('[class*="VodList_itemContainer__"]');
        oldVodListItems.forEach(item => item.classList.add('oldVodListItems'));

        // MutationObserver로 VOD 리스트 박스 업데이트 대기
        this.log('VOD 리스트 박스 업데이트 대기 시작');
        const vodListBox = await this.waitForElementWithCondition(
            '[class*="VodList_itemListBox__"]',
            (element) => {           
                const vodItem = element.querySelectorAll('[class*="VodList_itemContainer__"]:not(.oldVodListItems)');
                const vodItemCount = vodItem.length;
                // VOD 아이템이 있거나 "등록된 VOD가 없습니다" 메시지가 있는 경우
                const hasVodItems = vodItemCount > 0;
                const hasEmptyMessage = element.querySelector('[class*="__soopui__Empty-module__empty__"]') !== null;
                return hasVodItems || hasEmptyMessage;
            },
            5000
        );
        if (!vodListBox) {
            this.log('VOD 리스트 박스 업데이트 실패');
            return null;
        }
        
        // VOD 아이템이 있는지 확인
        const vodList_itemContainers = vodListBox.querySelectorAll('[class*="VodList_itemContainer__"]');
        this.log(`VOD 리스트 박스 업데이트 완료: ${vodList_itemContainers.length}개 항목`);

        const vodInfoList = [];
        for(var i = 0; i < vodList_itemContainers.length; ++i){
            const vodList_itemContainer = vodList_itemContainers[i];
            const vodDateElement = vodList_itemContainer.querySelectorAll('[class*="__soopui__ThumbnailMoreInfo-module__md__"]')[1];
            const link = vodList_itemContainer.querySelector('a').href;
            const { year, month, day } = parseDateFromText(vodDateElement.innerText);
            const vodInfo = {
                year: year,
                month: month,
                day: day,
                link: link
            };
            this.log(vodInfo);
            vodInfoList.push(vodInfo);
        }
        return vodInfoList;
    }
    async setFilter(yearDropdownOpenButton, monthDropdownOpenButton, startDate) {
        const year = startDate.getFullYear();
        const month = startDate.getMonth() + 1;
        const day = startDate.getDate();

        if (parseInt(yearDropdownOpenButton.innerText) !== year) {
            this.log('[setFilter] yearDropdown 열기');
            this.triggerMouseDown(yearDropdownOpenButton);
            this.triggerMouseUp(yearDropdownOpenButton);
            
        // MutationObserver로 yearDropdownList 대기
        this.log('[setFilter] yearDropdownList 찾기 시작');
        const yearDropdownList = await this.waitForElement('[class*="__soopui__DropdownList-module__dropdownItem__"]', 1, 10000);
        if (!yearDropdownList) {
            this.log('[setFilter] yearDropdownList 찾기 실패');
            return false;
        }
            for (var i = 0; i < yearDropdownList.childNodes.length; ++i) {
                const yearDropdownItem = yearDropdownList.childNodes[i];
                if (parseInt(yearDropdownItem.innerText) == year) {
                    this.triggerMouseDown(yearDropdownItem);
                    break;
                }
            }
            
        // MutationObserver로 년도 선택 완료 대기
        this.log('[setFilter] 년도 선택 완료 대기 시작');
        const yearSelected = await this.waitForElementWithCondition(
            '[class*="__soopui__Dropdown-module__dropDownButton__"]',
            (element) => parseInt(element.innerText) === year,
            10000
        );
        if (!yearSelected) {
            this.log('[setFilter] 년도 선택 실패');
            return false;
        }
        }
        this.log('[setFilter] monthDropdown 열기');
        this.triggerMouseDown(monthDropdownOpenButton);
        this.triggerMouseUp(monthDropdownOpenButton);

        // MutationObserver로 monthDropdownList 대기
        this.log('[setFilter] monthDropdownList 찾기 시작');
        const monthDropdownList = await this.waitForElement('[class*="__soopui__DropdownList-module__dropdownItem__"]', 1, 10000);
        if (!monthDropdownList) {
            this.log('[setFilter] monthDropdownList 찾기 실패');
            return false;
        }

        for (var i = 0; i < monthDropdownList.childNodes.length; ++i) {
            const monthDropdownItem = monthDropdownList.childNodes[i];
            if (parseInt(monthDropdownItem.innerText) == month) {
                this.triggerMouseDown(monthDropdownItem);
                break;
            }
        }

        // MutationObserver로 월 선택 완료 대기
        this.log('[setFilter] 월 선택 완료 대기 시작');
        const monthSelected = await this.waitForElementWithCondition(
            '[class*="__soopui__Dropdown-module__dropDownButton__"]',
            (element) => parseInt(element.innerText) === month,
            10000
        );
        if (!monthSelected) {
            this.log('[setFilter] 월 선택 실패');
            return false;
        }

        const daySelectButtons = document.querySelectorAll('.rdrDay:not(.rdrDayPassive)');
        for (var i = 0; i < daySelectButtons.length; ++i) {
            const daySelectButton = daySelectButtons[i];
            if (parseInt(daySelectButton.innerText) == day) {
                this.triggerMouseDown(daySelectButton);
                this.triggerMouseUp(daySelectButton);
                break;
            }
        }
    }
    triggerMouseDown(element) {
        const mouseDownEvent = new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0,        // 왼쪽 마우스 버튼
            buttons: 1,       // 마우스 다운 상태
            clientX: 0,       // 마우스 X 좌표
            clientY: 0,       // 마우스 Y 좌표
            screenX: 0,       // 화면 X 좌표
            screenY: 0        // 화면 Y 좌표
        });
        
        element.dispatchEvent(mouseDownEvent);
    }
    triggerMouseUp(element) {
        const mouseUpEvent = new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            button: 0,        // 왼쪽 마우스 버튼
            buttons: 0,       // 마우스 업 상태
            clientX: 0,
            clientY: 0,
            screenX: 0,
            screenY: 0
        });
        
        element.dispatchEvent(mouseUpEvent);
    }

    // MutationObserver를 사용한 효율적인 요소 대기
    async waitForElement(selector, expectedCount = 1, timeout = 10000) {
        return new Promise((resolve) => {
            // 먼저 이미 존재하는지 확인
            const existingElements = document.querySelectorAll(selector);
            if (existingElements.length === expectedCount) {
                resolve(expectedCount === 1 ? existingElements[0] : existingElements);
                return;
            }

            let timeoutId;
            const observer = new MutationObserver((mutations) => {
                const elements = document.querySelectorAll(selector);
                if (elements.length === expectedCount) {
                    observer.disconnect();
                    clearTimeout(timeoutId);
                    resolve(expectedCount === 1 ? elements[0] : elements);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeOldValue: true
            });

            // 타임아웃 설정
            timeoutId = setTimeout(() => {
                observer.disconnect();
                const elements = document.querySelectorAll(selector);
                this.log(`요소 대기 타임아웃: ${selector} (${elements.length}/${expectedCount})`);
                resolve(expectedCount === 1 ? elements[0] : elements);
            }, timeout);
        });
    }

    // 특정 조건을 만족하는 요소 대기
    async waitForElementWithCondition(selector, condition, timeout = 10000) {
        return new Promise((resolve) => {
            const checkElements = () => {
                const elements = document.querySelectorAll(selector);
                for (let element of elements) {
                    if (condition(element)) {
                        return element;
                    }
                }
                return null;
            };

            // 먼저 이미 존재하는지 확인
            const existingElement = checkElements();
            if (existingElement) {
                resolve(existingElement);
                return;
            }

            let timeoutId;
            const observer = new MutationObserver((mutations) => {
                const element = checkElements();
                if (element) {
                    observer.disconnect();
                    clearTimeout(timeoutId);
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true
            });

            timeoutId = setTimeout(() => {
                observer.disconnect();
                this.log(`조건부 요소 대기 타임아웃: ${selector}`);
                resolve(null);
            }, timeout);
        });
    }
    sendFinalResult(vodInfoList) {
        const message = {
            response: "SOOP_VOD_LIST",
            resultVODLinks: null
        };
        if (vodInfoList) {
            const finalVodLinks = this.createFinalVodLinkList(vodInfoList);
            this.log(`최종 VOD 링크 수: ${finalVodLinks.length}`);
            message.resultVODLinks = finalVodLinks;
        }
        window.parent.postMessage(message, "https://www.sooplive.co.kr");
        window.close();
    }
    
    createFinalVodLinkList(vodInfoList) {        
        let resultVODLinks = [];
        
        let firstIndex = -1;
        let lastIndex = -1;
        for (var i = 0; i < vodInfoList.length; ++i) {
            const vodInfo = vodInfoList[i];
            // 요청날짜보다 더 최근 것 중 가장 오래된 것 찾기
            if (vodInfo.year > this.requestYear || 
               (vodInfo.year == this.requestYear && vodInfo.month > this.requestMonth) || 
               (vodInfo.year == this.requestYear && vodInfo.month == this.requestMonth && vodInfo.day > this.requestDay)) {
                firstIndex = i;
            }
            // 요청날짜보다 더 오래된 것 중 가장 최근 것 찾기
            else{
                lastIndex = i;
                if (vodInfo.year < this.requestYear ||
                    (vodInfo.year == this.requestYear && vodInfo.month < this.requestMonth) ||
                    (vodInfo.year == this.requestYear && vodInfo.month == this.requestMonth && vodInfo.day < this.requestDay)) {
                    break;
                }
            }
        }
        if (firstIndex == -1) firstIndex = 0;
        for (var i = firstIndex; i <= lastIndex; ++i) {
            const vodInfo = vodInfoList[i];
            resultVODLinks.push(vodInfo.link);
            this.log(`vod added: ${vodInfo.year}-${vodInfo.month}-${vodInfo.day} ${vodInfo.link}`);
        }
        return resultVODLinks;
    }
}
