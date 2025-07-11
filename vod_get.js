if (window !== top){
    function log(...data){
        console.log('[vod_get.js]', ...data);
    }
    function GetVodList(datetime){
        const dateSpanElements = document.querySelectorAll('#contents > div > div > section > section.vod-list > ul > li > div.vod-info > div > span.date');
        const vodLinkList = document.querySelectorAll('#contents > div > div > section > section.vod-list > ul > li > div.vod-info > p > a');
        if (dateSpanElements.length == 0) return null;
        if (vodLinkList.length == 0) return null;
        log("date length", dateSpanElements.length);
        log("link length", vodLinkList.length);
        const request_year = datetime.getFullYear();
        const request_month = datetime.getMonth()+1;
        const request_day = datetime.getDate();
        let resultVODLinks = [];
        let prevMonth = 0;
        let prevDay = 0;
        for (var i = dateSpanElements.length - 1; i >= 0 ; --i){
            const innerText = dateSpanElements[i].innerText;
            let year, month, day;
            
            // HH시간전 형식인지 체크
            const timeAgoMatch = innerText.match(/(\d+)시간 전/);
            if (timeAgoMatch) {
                const hoursAgo = parseInt(timeAgoMatch[1]);
                const uploadDate = new Date();
                uploadDate.setHours(uploadDate.getHours() - hoursAgo);
                year = uploadDate.getFullYear();
                month = uploadDate.getMonth() + 1;
                day = uploadDate.getDate();
                log(`시간전 형식 파싱: ${hoursAgo}시간전 -> ${year}-${month}-${day}`);
            } else {
                // YYYY-MM-DD 형식 처리
                const [_year, _month, _day] = innerText.split("-");
                year = parseInt(_year);
                month = parseInt(_month);
                day = parseInt(_day);
            }
            
            if (i < dateSpanElements.length - 1){
                if (prevMonth > request_month || prevDay > request_day){
                    break;
                }
            }
            if (year >= request_year && month >= request_month && day >= request_day){
                resultVODLinks.push(vodLinkList[i].href);
                prevMonth = month;
                prevDay = day;
                log(`vod added: ${month}-${day} ${vodLinkList[i].href}`);
            }
        }
        // TODO: 최대치까지 표시됐다면 다음 페이지 검색필요
        // if (vodLinkList.length == 60)

        return resultVODLinks;
    }
    function TryGetVodList(request_datetime){
        const intervalID = setInterval(() => {
            const resultVODLinks = GetVodList(request_datetime);
            log("TryGetVodList");
            if (resultVODLinks == null) return;
            // 부모 페이지로 VOD List 를 보냄
            window.parent.postMessage(
                {
                    response: "VOD_LIST",
                    request_datetime: request_datetime,
                    resultVODLinks: resultVODLinks
                }, 
            "https://vod.sooplive.co.kr");
            clearInterval(intervalID);
        }, 100);
    }
    log('[vod_get.js] in iframe');
    const params = new URLSearchParams(window.location.search);
    const p_request = params.get("p_request");
    if (p_request === "GET_VOD_LIST"){
        
        const global_ts = params.get("req_global_ts");
        const request_datetime = new Date(parseInt(global_ts));
        TryGetVodList(request_datetime)
    }
    else{
        window.addEventListener("message", (event) => {
            if(event.data.request === "GET_VOD_LIST"){
                const resultVODLinks = GetVodList(event.data.datetime);
                // 부모 페이지로 VOD List 를 보냄
                event.source.postMessage(
                    {
                        response: "VOD_LIST",
                        request_datetime: event.data.datetime,
                        resultVODLinks: resultVODLinks
                    }, 
                event.origin);
            }
        })
    }
}