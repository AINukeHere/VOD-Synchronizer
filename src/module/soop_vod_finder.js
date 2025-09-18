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
    constructor(requestVodDatetime) {
        this.requestVodDatetime = requestVodDatetime;
        this.vodInfoList = [];
        this._i = 0;
        this.MAX_RETRY_COUNT = 10;
        
        this.requestYear = requestVodDatetime.getFullYear();
        this.requestMonth = requestVodDatetime.getMonth() + 1;
        this.requestDay = requestVodDatetime.getDate();
    }
    log(...data){
        logToExtension('[SoopVODFinder]', ...data);
    }
    
    start() {
        log('시작' + window.location.toString());
        this.getVodInfoList().then((vodInfoList) => {
            if (vodInfoList === null) {
                log('VOD 정보 수집 실패. 5초 후 재시도');
                setTimeout(() => {
                    this.start();
                }, 5000);
                return;
            }
            log('현재 페이지 VOD 정보 수집 완료:', vodInfoList.length);
            this.sendFinalResult(vodInfoList);
        });
    }

    async getVodInfoList() {
        let filterOpenButton = null;
        for(this._i = 0; this._i < this.MAX_RETRY_COUNT; ++this._i){
            this.log(`필터 열기 버튼 찾기(${this._i}/${this.MAX_RETRY_COUNT})`);
            const filterOpenButtons = document.querySelectorAll('[class*="__soopui__FilterList-module__btnFilter___"]');
            if (filterOpenButtons.length == 1) {
                filterOpenButton = filterOpenButtons[0];
                break;
            }
            this.log(`filterOpenButtons length is not 1. It was: ${filterOpenButtons.length}`);
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (this._i == this.MAX_RETRY_COUNT) {
            this.log('필터 열기 버튼 찾기 실패');
            return null;
        }
        this.log('필터 열기');
        filterOpenButton.click();

        let dateSelectorOpenButton = null;
        for(this._i = 0; this._i < this.MAX_RETRY_COUNT; ++this._i){
            this.log(`날짜 선택기 열기 버튼 찾기(${this._i}/${this.MAX_RETRY_COUNT})`);
            const dateSelectorOpenButtons = document.querySelectorAll('[class*="__soopui__InputBox-module__iconOnly__"]');
            if (dateSelectorOpenButtons.length == 1) {
                dateSelectorOpenButton = dateSelectorOpenButtons[0];
                break;
            }
            this.log(`dateSelectorOpenButtons length is not 1. It was: ${dateSelectorOpenButtons.length}`);
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (this._i == this.MAX_RETRY_COUNT) {
            this.log('날짜 선택기 열기 버튼 찾기 실패');
            return null;
        }
        this.log('날짜 선택기 열기');
        dateSelectorOpenButton.click();

        let yearDropdownButton = null;
        let monthDropdownButton = null;
        for(this._i = 0; this._i < this.MAX_RETRY_COUNT; ++this._i){
            this.log(`년월 선택기 열기 버튼 찾기(${this._i}/${this.MAX_RETRY_COUNT})`);
            const yearMonthDropdownOpenButtons = document.querySelectorAll('[class*="__soopui__Dropdown-module__dropDownButton__"]');
            if (yearMonthDropdownOpenButtons.length == 2) {
                yearDropdownButton = yearMonthDropdownOpenButtons[0];
                monthDropdownButton = yearMonthDropdownOpenButtons[1];
                break;
            }
            this.log(`yearDropdownOpenButtons length is not 2. It was: ${yearMonthDropdownOpenButtons.length}`);
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (this._i == this.MAX_RETRY_COUNT) {
            this.log('년월 선택기 열기 버튼 찾기 실패');
            return null;
        }

        const startDate = new Date(this.requestVodDatetime.getTime() - 1 * 24 * 60 * 60 * 1000);
        const endDate = new Date(this.requestVodDatetime.getTime() + 1 * 24 * 60 * 60 * 1000);
        this.log(`기간 필터: ${startDate} ~ ${endDate}`);
        await this.setFilter(yearDropdownButton, monthDropdownButton, startDate); // 첫번째 호출하면 시작날짜가 설정됨
        this.log('기간 필터 시작날짜 설정 완료');
        await this.setFilter(yearDropdownButton, monthDropdownButton, endDate); // 두번째 호출하면 끝날짜가 설정됨
        this.log('기간 필터 끝날짜 설정 완료');

        let applyButton = null;
        for(this._i = 0; this._i < this.MAX_RETRY_COUNT; ++this._i){
            this.log(`적용 버튼 찾기(${this._i}/${this.MAX_RETRY_COUNT})`);
            applyButton = document.querySelector('[class*="__soopui__DatepickerWrapper-module__button__"]');
            if (applyButton) break; 
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (this._i == this.MAX_RETRY_COUNT) {
            this.log('적용 버튼 찾기 실패');
            return null;
        }
        this.log('기간 필터 적용');
        applyButton.click();

        const oldVodListBox = document.querySelector('[class*="VodList_itemListBox__"]');
        oldVodListBox.style.display = 'none';
        for(this._i = 0; this._i < this.MAX_RETRY_COUNT; ++this._i){
            this.log(`VOD 리스트 박스 업데이트 검사(${this._i}/${this.MAX_RETRY_COUNT})`);
            const newVodListBox = document.querySelector('[class*="VodList_itemListBox__"]');
            if (newVodListBox && newVodListBox.style.display != 'none') {
                const vodList_itemContainers = newVodListBox.querySelectorAll('[class*="VodList_itemContainer__"]');
                this.log(`VOD 리스트 박스 업데이트 검사 완료: ${vodList_itemContainers.length}`);
                if (0 < vodList_itemContainers.length) {
                    break;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (this._i == this.MAX_RETRY_COUNT) {
            this.log('VOD 리스트 박스 업데이트 검사 통과 실패');
            return null;
        }

        const vodInfoList = [];
        const vodList_itemContainers = document.querySelectorAll('[class*="VodList_itemContainer__"]');
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
            
            let yearDropdownList = null;
            for(this._i = 0; this._i < this.MAX_RETRY_COUNT; ++this._i){
                this.log(`[setFilter] yearDropdownList 찾기(${this._i}/${this.MAX_RETRY_COUNT})`);
                yearDropdownList = document.querySelector('[class*="__soopui__DropdownList-module__dropdownItem__"]');
                if (yearDropdownList) break;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (this._i == this.MAX_RETRY_COUNT) {
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
            
            for (this._i = 0; this._i < this.MAX_RETRY_COUNT; ++this._i) {
                this.log(`[setFilter] 년도 선택 innerText검사(${this._i}/${this.MAX_RETRY_COUNT})`);
                if (parseInt(yearDropdownOpenButton.innerText) == year) {
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (this._i == this.MAX_RETRY_COUNT) {
                this.log('[setFilter] 년도 선택 innerText검사 통과 실패');
                return false;
            }
        }
        this.log('[setFilter] monthDropdown 열기');
        this.triggerMouseDown(monthDropdownOpenButton);
        this.triggerMouseUp(monthDropdownOpenButton);

        let monthDropdownList = null;
        for(this._i = 0; this._i < this.MAX_RETRY_COUNT; ++this._i){
            this.log(`[setFilter] monthDropdownList 찾기(${this._i}/${this.MAX_RETRY_COUNT})`);
            monthDropdownList = document.querySelector('[class*="__soopui__DropdownList-module__dropdownItem__"]');
            if (monthDropdownList) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (this._i == this.MAX_RETRY_COUNT) {
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

        for (this._i = 0; this._i < this.MAX_RETRY_COUNT; ++this._i) {
            this.log(`[setFilter] 월 선택 innerText검사(${this._i}/${this.MAX_RETRY_COUNT})`);
            if (parseInt(monthDropdownOpenButton.innerText) == month) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (this._i == this.MAX_RETRY_COUNT) {
            this.log('[setFilter] 월 선택 innerText검사 통과 실패');
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
            view: window,
            bubbles: true,
            cancelable: true,
            isTrusted: true,
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
            view: window,
            bubbles: true,
            cancelable: true,
            isTrusted: true,
            button: 0,        // 왼쪽 마우스 버튼
            buttons: 0,       // 마우스 업 상태
            clientX: 0,
            clientY: 0,
            screenX: 0,
            screenY: 0
        });
        
        element.dispatchEvent(mouseUpEvent);
    }
    sendFinalResult(vodInfoList) {
        const finalVodLinks = this.createFinalVodLinkList(vodInfoList);
        log(`최종 VOD 링크 수: ${finalVodLinks.length}`);
        
        const message = {
            response: "SOOP_VOD_LIST",
            resultVODLinks: finalVodLinks
        };
        window.parent.postMessage(message, "https://www.sooplive.co.kr");
        window.close();
    }
    
    createFinalVodLinkList(vodInfoList) {
        // 날짜순으로 정렬 (오래된 순)
        // if (this.childVodListInfoList.length > 0) {
        //     this.childVodListInfoList.sort((a, b) => {
        //         if (a.year !== b.year) return a.year - b.year;
        //         if (a.month !== b.month) return a.month - b.month;
        //         return a.day - b.day;
        //     });
        //     for (var i = 0; i < this.childVodListInfoList.length; ++i) {
        //         this.allVodInfoList.push(...this.childVodListInfoList[i]);
        //     }
        // }
        
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
            log(`vod added: ${vodInfo.year}-${vodInfo.month}-${vodInfo.day} ${vodInfo.link}`);
        }
        return resultVODLinks;
    }
}
