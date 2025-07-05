
if (window !== top){
    function log(...data){
        console.log('[streamerID_get.js]', data);
    }
    
    log('in iframe');
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
            log("TryGetStreamerID");
            const streamer_id = GetStreamerID(nickname);
            if (streamer_id == null) return;
            // 부모 페이지로 VOD List 를 보냄
            window.parent.postMessage(
                {
                    response: "STREAMER_ID",
                    streamer_nickname: nickname,
                    streamer_id: streamer_id
                }, 
            "https://vod.sooplive.co.kr");
            clearInterval(intervalID);
        }, 100);
    }
    const params = new URLSearchParams(window.location.search);
    const p_request = params.get("p_request");
    if (p_request === "GET_STREAMER_ID"){
        const request_nickname = params.get("szKeyword");
        const decoded_nickname = decodeURI(request_nickname)
        TryGetStreamerID(decoded_nickname)
    }
    else{
        window.addEventListener("message", (event) =>{
            if (event.data.request === "GET_STREAMER_ID"){
                const streamer_nickname = event.data.nickname;
                const streamer_id = GetStreamerID(streamer_nickname);
                if (streamer_id != null){
                    event.source.postMessage(
                        {
                            response: "STREAMER_ID",
                            streamer_nickname: streamer_nickname,
                            streamer_id: streamer_id
                        }, 
                    event.origin);
                    log('streamer_id: ', streamer_id);
                }
            }
        });
    }
}