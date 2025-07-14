
if (window !== top){
    function log(...data){
        console.log('[streamerID_get.js]', ...data);
    }
    BTN_TEXT_IDLE = "Find VOD";
    log('in iframe');
    
    let isChzzkRequest = false;
    let request_ts = null;
    let request_vod_ts = null;
    
    function GetStreamerID(nickname){
        const searchResults = document.querySelectorAll('#container > div.search_strm_area > ul > .strm_list');
        let streamer_id = null;
        if (searchResults){
            searchResults.forEach(element => {
                const nicknameBtn = element.querySelector('.nick > button');
                const idSpan = element.querySelector('.id');
                if (nickname === nicknameBtn.innerText){
                    streamer_id = idSpan.innerText.slice(1,-1);
                }
            });
        }
        return streamer_id;
    }
    
    function TryGetStreamerID(nickname){
        const intervalID = setInterval(() => {
            log("TryGetStreamerID - soop 요청");
            const streamer_id = GetStreamerID(nickname);
            if (streamer_id == null) return;
            log(`streamer_id 찾음: ${streamer_id}`);
            findVodList(streamer_id, request_vod_ts, "https://vod.sooplive.co.kr");
            clearInterval(intervalID);

        }, 100);
    }
    
    function searchStreamerInIframe(nickname) {
        const encodedNickname = encodeURI(nickname);
        const url = new URL(`https://www.sooplive.co.kr/search`);
        url.searchParams.set("szLocation", "total_search");
        url.searchParams.set("szSearchType", "streamer");
        url.searchParams.set("szKeyword", encodedNickname);
        url.searchParams.set("szStype", "di");
        url.searchParams.set("szActype", "input_field");
        url.searchParams.set("p_request", "GET_STREAMER_ID");
        
        log('검색 결과 페이지 iframe 열기:', url.toString());
        
        // 검색 결과 페이지를 iframe으로 열기
        const searchIframe = document.createElement('iframe');
        searchIframe.style.display = 'none';
        searchIframe.src = url.toString();
        document.body.appendChild(searchIframe);
    }
    
    function findVodList(streamerId, targetTimestamp, responseTo) {
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
        
        log('SOOP VOD 리스트 요청:', reqUrl.toString());
        
        // iframe을 생성하여 VOD 리스트 요청
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = reqUrl.toString();
        document.body.appendChild(iframe);
        
        // VOD 리스트 응답 처리
        window.addEventListener('message', function handleVodList(event) {
            if (event.data.response === "VOD_LIST") {
                log("VOD 리스트 받음:", event.data.resultVODLinks);
                
                // 부모 페이지(chzzk)로 VOD 리스트 전송
                window.parent.postMessage({
                    response: "VOD_LIST",
                    resultVODLinks: event.data.resultVODLinks,
                }, responseTo);
                
                // iframe 제거
                document.body.removeChild(iframe);
                window.removeEventListener('message', handleVodList);
            }
        });
    }
    
    function updateFindVodButtons() {
        setInterval(() => {
            if (!isChzzkRequest) return;
            const searchResults = document.querySelectorAll('#areaSuggest > ul > li > a');
            // const searchResults = document.querySelectorAll('#container > div.search_strm_area > ul > .strm_list');
            if (searchResults) {
                searchResults.forEach(element => {
                    if (element.querySelector('em')) return;
                    
                    const existsBtn = element.querySelector('.find-vod');
                    if (!existsBtn){
                        const button = document.createElement("button");
                        button.className = "find-vod";
                        button.innerText = BTN_TEXT_IDLE;
                        button.style.background = "gray";
                        button.style.fontSize = "12px";
                        button.style.color = "white";
                        button.style.marginLeft = "20px";
                        button.style.padding = "5px";
                        element.appendChild(button);
                        button.addEventListener('click', function (e){
                            e.preventDefault();       // a 태그의 기본 이동 동작 막기
                            e.stopPropagation();      // 이벤트 버블링 차단
                            const nicknameSpan = element.querySelector('span');
                            const nickname = nicknameSpan.innerText;
                            
                            log('Find VOD 클릭:', nickname);
                            searchStreamerInIframe(nickname);
                        });
                    }
                });
            }
        }, 1000);
    }
    
    // URL 파라미터 확인
    const params = new URLSearchParams(window.location.search);
    const p_request = params.get("p_request");
    const url_request_vod_ts = params.get("request_vod_ts");
    if (url_request_vod_ts)
        request_vod_ts = parseInt(url_request_vod_ts);

    // URL에서 파라미터 제거
    const url = new URL(window.location.href);
    url.searchParams.delete('p_request');
    url.searchParams.delete('request_vod_ts');
    window.history.replaceState({}, '', url.toString());
    
    if (p_request == "GET_SOOP_VOD_FROM_CHZZK") {
        isChzzkRequest = true;
        log('chzzk 요청 감지, 타임스탬프:', new Date(request_vod_ts).toLocaleString());
        // Find VOD 버튼 업데이트 시작
        updateFindVodButtons();

        window.addEventListener("message", (event) =>{
            if (event.data.response === "STREAMER_ID"){
                const streamer_id = event.data.streamer_id;
                log('streamer_id: ', streamer_id);
                if (streamer_id != null){
                    findVodList(streamer_id, request_vod_ts, "https://chzzk.naver.com");
                }
            }
        });
    }
    else if (p_request === "GET_SOOP_VOD_FROM_SOOP"){
        log('soop 요청 감지, 타임스탬프:', new Date(request_vod_ts).toLocaleString());
        const request_nickname = params.get("szKeyword");
        const decoded_nickname = decodeURI(request_nickname);
        TryGetStreamerID(decoded_nickname);
    }
    else if (p_request === "GET_STREAMER_ID"){
        log("GET_STREAMER_ID 요청받음");
        const request_nickname = params.get("szKeyword");
        const decoded_nickname = decodeURI(request_nickname)
        TryGetStreamerID(decoded_nickname)
    }
}