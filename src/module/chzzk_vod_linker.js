const BTN_TEXT_IDLE = "Find VOD";
const BTN_TEXT_FINDING_STREAMER_ID = "스트리머 ID를 찾는 중...";
const BTN_TEXT_FINDING_VOD = "다시보기를 찾는 중...";
// 메인 페이지에서 검색하고 버튼을 누르면 스트리머id를 api로 찾고 그 스트리머 채널을 iframe으로 열게 함. 그 iframe에서 vod link를 받아서 새 탭에서 열음
export class ChzzkVODLinker{
    constructor(){
        this.iframeTag = null;
        this.curProcessBtn = null;
        
        // VODSync 네임스페이스에 자동 등록
        window.VODSync = window.VODSync || {};
        if (window.VODSync.chzzkVODLinker) {
            console.warn('[VODSync] ChzzkVODLinker가 이미 존재합니다. 기존 인스턴스를 덮어씁니다.');
        }
        window.VODSync.chzzkVODLinker = this;
        
        this.init();
    }
    log(...data){
        logToExtension('[chzzkVODLinker]', ...data);
    }
    init(){
        this.iframeTag = document.createElement('iframe');
        this.iframeTag.style.display = 'none';
        document.body.appendChild(this.iframeTag);
        this.ChzzkSyncButtonManagement();
        // 메시지 리스너 추가
        window.addEventListener('message', (event) => {
            if (event.data.response === "CHZZK_VOD") {
                this.curProcessBtn.innerText = BTN_TEXT_IDLE;
                this.curProcessBtn = null;
                this.log("CHZZK VOD link 받음:", event.data.vod_link);
                this.handleChzzkVodLink(event.data.vod_link);
            }
            else if (event.data.response === "CHZZK_VOD_NOT_FOUND"){
                this.curProcessBtn.innerText = BTN_TEXT_IDLE;
                this.curProcessBtn = null;
                this.log("CHZZK VOD를 찾지 못했다고 응답받음. 사유:",event.data.reason);
                alert("동기화 가능한 VOD를 찾지 못했습니다.");
            }
            else if (event.data.response === 'CHZZK_VOD_FINDER_STATUS'){
                this.curProcessBtn.innerText = `${event.data.pageNum}페이지에서 ${BTN_TEXT_FINDING_VOD}[${event.data.retryCount}]`;
            }
        });
    }
    
    // 동기화 버튼 onclick 핸들러
    handleFindVODButtonClick(e, button){
        e.preventDefault();
        e.stopPropagation();
        if (this.curProcessBtn){
            alert('이미 처리중인 작업이 있습니다');
            return;
        }
        this.curProcessBtn = button;
        const searchWordSpan = button.parentElement.querySelector('[class^="search_keyword__"]');
        
        if (!searchWordSpan){
            return;
        }

        // 스트리머 ID 검색
        button.innerText = BTN_TEXT_FINDING_STREAMER_ID;
        const keyword = searchWordSpan.innerText;
        this.log(`검색어: ${keyword}`);
        const channelSearchAPI = new URL(`https://api.chzzk.naver.com/service/v1/search/channels`);
        const encodedKeyword = encodeURI(keyword);
        channelSearchAPI.searchParams.set('keyword', encodedKeyword);
        channelSearchAPI.searchParams.set('offset', 0);
        channelSearchAPI.searchParams.set('size', 50);
        fetch(channelSearchAPI.toString())
        .then(response=>response.json())
        .then(result=>{
            if (result.code !== 200) return;

            const data = result.content.data;
            if (data.length > 0){
                const channelObj = data[0].channel;
                const channel_id = channelObj.channelId;
                const channel_name = channelObj.channelName;
                
                // 스트리머 ID로 iframe VOD 페이지에서 찾도록 함
                const vodListUrl = new URL(`https://chzzk.naver.com/${channel_id}/videos`);
                vodListUrl.searchParams.set('videoType', 'REPLAY');
                vodListUrl.searchParams.set('sortType', 'LATEST');
                vodListUrl.searchParams.set('page', 1);
                vodListUrl.searchParams.set('p_request', 'GET_VOD');
                const tsManager = window.VODSync?.tsManager;
                vodListUrl.searchParams.set('request_vod_ts', tsManager.getCurDateTime().getTime());
                this.curProcessBtn.innerText = BTN_TEXT_FINDING_VOD;
                this.iframeTag.src = vodListUrl.toString();
            }
            else{
                this.curProcessBtn.innerText = BTN_TEXT_IDLE;
                alert(`${keyword}의 스트리머 ID를 찾지 못했습니다.`);
            }
        })
        .catch(error => {
            console.error('에러 발생:', error);
        })
    }
    // 치지직 검색 결과에 동기화 버튼 추가
    ChzzkSyncButtonManagement() {
        setInterval(() => {
            if (!window.location.pathname.includes('/video/')) return; // 다시보기 페이지가 아니면 버튼 생성 X

            const searchHeader = document.querySelector('div[class^="search_header_"]');
            if (searchHeader) return; // 검색 결과 없음 → 버튼 생성 X

            const searchResults = document.querySelectorAll('div[class^="search_container__"] > div > ul > li > a');
            if (!searchResults) return;

            searchResults.forEach(element => {
                if (element.querySelector('.chzzk-sync-btn')) return; // 이미 버튼 있음

                const button = document.createElement('button');
                button.className = 'chzzk-sync-btn';
                button.innerText = BTN_TEXT_IDLE;
                button.style.background = '#00d564';
                button.style.color = 'black';
                button.style.fontSize = '12px';
                button.style.marginLeft = '12px';
                button.style.padding = '4px 8px';
                button.style.border = 'none';
                button.style.borderRadius = '4px';
                button.style.cursor = 'pointer';

                button.addEventListener('click', (e) => this.handleFindVODButtonClick(e, button));
                element.appendChild(button);
            });
        }, 200);
    }
    // 치지직 다시보기 링크를 받아서 새 탭에서 열음
    handleChzzkVodLink(vod_link){
        const tsManager = window.VODSync?.tsManager;
        const curTS = tsManager.getCurDateTime().getTime();
        const url = new URL(vod_link);
        url.searchParams.set('request_vod_ts', curTS);
        if (tsManager.isPlaying())
            url.searchParams.set('request_real_ts', Date.now());
        this.log(`vod 열기 ${url.toString()}`);
        window.open(url, "_blank");
    }
}