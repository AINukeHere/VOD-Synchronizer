if (window !== top) {
    class StreamerIDManager {
        constructor() {
            this.BTN_TEXT_IDLE = "Find VOD";
            this.BTN_TEXT_FINDING_STREAMER_ID = "스트리머 ID를 찾는 중...";
            this.BTN_TEXT_FINDING_VOD = "다시보기를 찾는 중...";
            this.isChzzkRequest = false;
            this.curProcessingBtn = null;
            this.request_vod_ts = null;
            this.log('in iframe');
            this.init();
        }
        log(...data) {
            console.log('[streamerID_get.js]', ...data);
        }
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
        tryGetStreamerID(nickname) {
            return new Promise((resolve, reject) => {
                const intervalID = setInterval(() => {
                    this.log("TryGetStreamerID - soop 요청");
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
            const searchIframe = document.createElement('iframe');
            searchIframe.style.display = 'none';
            searchIframe.src = url.toString();
            document.body.appendChild(searchIframe);
        }
        findVodList(streamerId, targetTimestamp, responseTo) {
            const targetDateTime = new Date(targetTimestamp);
            const year = targetDateTime.getFullYear();
            const month = targetDateTime.getMonth() + 1;
            const monthsParam = `${year}${String(month).padStart(2, "0")}`;
            const url = new URL(`https://ch.sooplive.co.kr/${streamerId}/vods/review`);
            url.searchParams.set("page", 1);
            url.searchParams.set("months", `${monthsParam}${monthsParam}`);
            url.searchParams.set("perPage", 60);
            const reqUrl = new URL(url.toString());
            reqUrl.searchParams.set("p_request", "GET_VOD_LIST");
            reqUrl.searchParams.set("request_vod_ts", targetDateTime.getTime());
            this.log('SOOP VOD 리스트 요청:', reqUrl.toString());
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = reqUrl.toString();
            document.body.appendChild(iframe);
            window.parent.postMessage({
                response: "STATUS_STREAM_ID_CHECKED",
                reqUrl: reqUrl.toString()
            }, responseTo);
            window.addEventListener('message', function handleVodList(event) {
                if (event.data.response === "VOD_LIST") {
                    this.log("VOD 리스트 받음:", event.data.resultVODLinks);
                    window.parent.postMessage({
                        response: "VOD_LIST",
                        resultVODLinks: event.data.resultVODLinks,
                    }, responseTo);
                    document.body.removeChild(iframe);
                    window.removeEventListener('message', handleVodList);
                }
            }.bind(this));
        }
        updateFindVodButtons() {
            setInterval(() => {
                if (!this.isChzzkRequest) return;
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
        handleChzzkRequest() {
            this.isChzzkRequest = true;
            this.log('chzzk 요청 감지, 타임스탬프:', new Date(this.request_vod_ts).toLocaleString());
            this.updateFindVodButtons();
            window.addEventListener("message", (event) => {
                if (event.data.response === "STREAMER_ID") {
                    this.curProcessingBtn.innerText = this.BTN_TEXT_FINDING_VOD;
                    const streamer_id = event.data.streamer_id;
                    this.log('streamer_id: ', streamer_id);
                    if (streamer_id != null) {
                        this.findVodList(streamer_id, this.request_vod_ts, "https://chzzk.naver.com");
                    }
                }
            });
        }
        handleSoopRequest(params) {
            this.log('soop 요청 감지, 타임스탬프:', new Date(this.request_vod_ts).toLocaleString());
            const request_nickname = params.get("szKeyword");
            const decoded_nickname = decodeURI(request_nickname);
            this.tryGetStreamerID(decoded_nickname)
                .then(streamer_id => {
                    this.findVodList(streamer_id, this.request_vod_ts, "https://vod.sooplive.co.kr");
                })
                .catch(err => {
                    this.log(err.message);
                });
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
        init() {
            const params = new URLSearchParams(window.location.search);
            const p_request = params.get("p_request");
            const url_request_vod_ts = params.get("request_vod_ts");
            if (url_request_vod_ts)
                this.request_vod_ts = parseInt(url_request_vod_ts);
            // URL에서 파라미터 제거
            const url = new URL(window.location.href);
            url.searchParams.delete('p_request');
            url.searchParams.delete('request_vod_ts');
            window.history.replaceState({}, '', url.toString());
            if (p_request == "GET_SOOP_VOD_FROM_CHZZK") {
                this.handleChzzkRequest();
            } else if (p_request === "GET_SOOP_VOD_FROM_SOOP") {
                this.handleSoopRequest(params);
            } else if (p_request == "GET_STREAMER_ID") {
                this.handleGetStreamerIDRequest(params);
            }
            if (params.get('only_search') === '1') {
                this.setupSearchAreaOnlyMode();
            }
        }
    }
    // 인스턴스 생성
    new StreamerIDManager();
}
