// SOOP 스트리머 닉네임으로부터 ID를 찾거나 다시보기 동기화까지 해줄 수 있는 클래스
// case 1: 치지직 페이지에서 soop sync panel에서 요청됨
// case 2: soop vod 플레이어 페이지에서 Find VOD 버튼을 눌러서 Soop Streamer 닉네임으로부터 ID를 찾아야할때
export class SoopStreamerIDManager {
    constructor() {
        this.BTN_TEXT_IDLE = "Find VOD";
        this.BTN_TEXT_FINDING_STREAMER_ID = "스트리머 ID를 찾는 중...";
        this.BTN_TEXT_FINDING_VOD = "다시보기를 찾는 중...";

        this.curProcessingBtn = null;
        this.request_vod_ts = null;
        this.parentOrigin = null;
        this.init();
    }
    
    log(...data){
        logToExtension('[soop_streamer_id_manager.js]', ...data);
    }
    
    // 현재 페이지가 검색결과 페이지라고 가정하고 스트리머 ID를 찾는 함수
    getStreamerID(nickname) {
        const searchResults = document.querySelectorAll('#container > div.search_strm_area > ul > .strm_list');
        let streamer_id = null;
        if (searchResults) {
            searchResults.forEach(element => {
                const nicknameBtn = element.querySelector('.nick > button');
                const idSpan = element.querySelector('.id');
                if (nickname === nicknameBtn.innerText) {
                    streamer_id = idSpan.innerText.slice(1, -1);
                }
            });
        }
        return streamer_id;
    }
    // 스트리머 ID를 찾기를 반복함
    tryGetStreamerID(nickname) {
        return new Promise((resolve, reject) => {
            const intervalID = setInterval(() => {
                this.log("TryGetStreamerID");
                const streamer_id = this.getStreamerID(nickname);
                if (streamer_id == null) return;
                this.log(`streamer_id 찾음: ${streamer_id}`);
                clearInterval(intervalID);
                resolve(streamer_id);
            }, 100);
            setTimeout(() => {
                clearInterval(intervalID);
                reject(new Error("streamer_id를 찾지 못했습니다."));
            }, 5000);
        });
    }

    // 스트리머 ID를 찾기 위해 검색 결과 페이지 iframe을 열음
    searchStreamerInIframe(nickname) {
        this.curProcessingBtn.innerText = this.BTN_TEXT_FINDING_STREAMER_ID;
        const encodedNickname = encodeURI(nickname);
        const url = new URL(`https://www.sooplive.co.kr/search`);
        url.searchParams.set("szLocation", "total_search");
        url.searchParams.set("szSearchType", "streamer");
        url.searchParams.set("szKeyword", encodedNickname);
        url.searchParams.set("szStype", "di");
        url.searchParams.set("szActype", "input_field");
        url.searchParams.set("p_request", "GET_STREAMER_ID");
        this.log('검색 결과 페이지 iframe 열기:', url.toString());
        this.searchIframe.src = url.toString();
    }
    // 검색 결과에 FindVOD 버튼을 추가하는 기능을 시작함
    startUpdateFindVodButtons() {
        setInterval(() => {
            if (this.parentOrigin !== "https://chzzk.naver.com") return;
            const searchResults = document.querySelectorAll('#areaSuggest > ul > li > a');
            if (searchResults) {
                searchResults.forEach(element => {
                    if (element.querySelector('em')) return;
                    const existsBtn = element.querySelector('.find-vod');
                    if (!existsBtn) {
                        element.style.display = 'flex';
                        element.style.alignItems = 'center';
                        const button = document.createElement("button");
                        button.className = "find-vod";
                        button.innerText = this.BTN_TEXT_IDLE;
                        button.style.background = "gray";
                        button.style.fontSize = "12px";
                        button.style.color = "white";
                        button.style.marginLeft = "20px";
                        button.style.padding = "5px";
                        element.appendChild(button);
                        button.addEventListener('click', (e) => {
                            this.curProcessingBtn = button;
                            e.preventDefault();
                            e.stopPropagation();
                            const nicknameSpan = element.querySelector('span');
                            const nickname = nicknameSpan.innerText;
                            this.log('Find VOD 클릭:', nickname);
                            this.searchStreamerInIframe(nickname);
                        });
                    }
                });
            }
        }, 1000);
    }
    handleGetStreamerIDRequest(params) {
        this.log("chzzk의 soop iframe의 soop iframe이 요청 감지");
        const request_nickname = params.get("szKeyword");
        const decoded_nickname = decodeURI(request_nickname);
        this.tryGetStreamerID(decoded_nickname)
        .then(streamer_id => {
            window.parent.postMessage({
                response: "STREAMER_ID",
                streamer_id: streamer_id
            }, "https://www.sooplive.co.kr");
        })
        .catch(err => {
            this.log(err.message);
        });
    }
    // 검색 결과 페이지에서 검색 결과 영역만 남기고 나머지는 숨기게 함. (SOOP sync panel에서 iframe으로 열릴 때 사용)
    setupSearchAreaOnlyMode() {
        (function waitForGnbAndSearchArea() {
            const gnb = document.querySelector('#soop-gnb');
            const searchArea = document.querySelector('.sc-hvigdm.khASjK.topSearchArea');
            const backBtn = document.querySelector('#topSearchArea > div > div > button');
            let allDone = true;
            if (gnb) {
                Array.from(gnb.parentNode.children).forEach(sibling => {
                    if (sibling !== gnb) sibling.style.display = 'none';
                });
            } else {
                allDone = false;
            }
            if (searchArea) {
                searchArea.style.display = "flow";
                Array.from(searchArea.parentNode.children).forEach(sibling => {
                    if (sibling !== searchArea) sibling.remove();
                });
            } else {
                allDone = false;
            }
            if (backBtn) {
                backBtn.style.display = "none";
            } else {
                allDone = false;
            }
            document.body.style.background = 'white';
            if (!allDone) setTimeout(waitForGnbAndSearchArea, 200);
        })();
    }
    findVodListInIframe(streamerId, targetTimestamp) {
        const targetDateTime = new Date(targetTimestamp);
        const year = targetDateTime.getFullYear();
        const month = targetDateTime.getMonth() + 1;
        const monthsParam = `${year}${String(month).padStart(2, "0")}`;
        const url = new URL(`https://www.sooplive.co.kr/station/${streamerId}/vod/review`);
        const reqUrl = new URL(url.toString());
        reqUrl.searchParams.set("p_request", "GET_VOD_LIST_NEW_SOOP");
        reqUrl.searchParams.set("request_vod_ts", targetDateTime.getTime());
        this.log('SOOP VOD 리스트 요청:', reqUrl.toString());
        this.searchIframe.src = reqUrl.toString();
    }
    handleGetVodListRequest(params) {
        this.log('VOD 리스트 요청 감지, 타임스탬프:', new Date(this.request_vod_ts).toLocaleString());
        const request_from = params.get("request_from");
        const request_nickname = params.get("szKeyword");
        const decoded_nickname = decodeURI(request_nickname);
        if (request_from == "SOOP"){
            this.parentOrigin = "https://vod.sooplive.co.kr";
            // soop -> soop 요청인 경우 이미 검색페이지가 열려있으므로 지금 페이지에서 streamer id를 찾고 VOD 리스트를 찾게 함
            this.tryGetStreamerID(decoded_nickname)
            .then(streamer_id => {
                window.parent.postMessage({
                    response: "STATUS_STREAM_ID_CHECKED",
                    streamer_id: streamer_id
                }, this.parentOrigin);
                this.findVodListInIframe(streamer_id, this.request_vod_ts);
            })
            .catch(err => {
                this.log(err.message);
            });
        }
        else if (request_from == "CHZZK"){
            this.parentOrigin = "https://chzzk.naver.com";
            // chzzk -> soop 요청인 경우 FindVOD 버튼을 추가하는 기능을 얘가 하고 그걸 클릭하면 동작하도록 함
            this.log('chzzk 요청 감지, 타임스탬프:', new Date(this.request_vod_ts).toLocaleString());
            this.startUpdateFindVodButtons();
        }
        else{
            log(`Unknown request_from: ${request_from}`);
            return;
        }
    }
    init() {
        const params = new URLSearchParams(window.location.search);
        const p_request = params.get("p_request");
        if (p_request == "GET_VOD_LIST_NEW_SOOP") { return; }

        const url_request_vod_ts = params.get("request_vod_ts");
        if (url_request_vod_ts)
            this.request_vod_ts = parseInt(url_request_vod_ts);
        // URL에서 파라미터 제거
        const url = new URL(window.location.href);
        url.searchParams.delete('p_request');
        url.searchParams.delete('request_vod_ts');
        url.searchParams.delete('request_from');
        window.history.replaceState({}, '', url.toString());

        if (p_request === "GET_VOD_LIST") {
            this.handleGetVodListRequest(params);
        } else if (p_request === "GET_STREAMER_ID") {
            this.handleGetStreamerIDRequest(params);
        }
        if (params.get('only_search') === '1') {
            this.setupSearchAreaOnlyMode();
        }

        this.searchIframe = document.createElement('iframe');
        this.searchIframe.src = "about:blank";
        this.searchIframe.style.display = 'none';
        document.body.appendChild(this.searchIframe);

        window.addEventListener("message", (event) => {
            // CHZZK VOD 페이지에서 Soop Sync Panel에서 열린 경우 따로 스트리머 ID를 찾아야함. 찾는 iframe을 생성하면 응답을 받아야함
            if (event.data.response === "STREAMER_ID") {
                if (this.curProcessingBtn) this.curProcessingBtn.innerText = this.BTN_TEXT_FINDING_VOD;
                const streamer_id = event.data.streamer_id;
                this.log('streamer_id: ', streamer_id);
                if (streamer_id != null) {
                    this.findVodListInIframe(streamer_id, this.request_vod_ts);
                }
            }
            // CHZZK -> SOOP 과 SOOP -> SOOP 두 경우 모두 동일한 응답을 받음. 
            if (event.data.response === "SOOP_VOD_LIST") {
                if (this.curProcessingBtn) this.curProcessingBtn.innerText = this.BTN_TEXT_IDLE; //응답 처리에서 버튼 텍스트 수정만 다름. soop sync panel에 띄워진 버튼의 텍스트를 갱신해야함
                this.log("VOD 리스트 받음:", event.data.resultVODLinks);
                window.parent.postMessage({
                    response: "SOOP_VOD_LIST",
                    resultVODLinks: event.data.resultVODLinks,
                }, this.parentOrigin);
            }
        });
        this.log('init complete');
    }
}
