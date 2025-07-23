class RPNicknamePanel {
    constructor() {
        this.panel = null;
        this.toggleBtn = null;
        this.isPanelOpen = false;
        this.isPanelVisible = true;
        this.lastInputTime = Date.now();
        this.mouseCheckInterval = null;
        this.nicknamesByServer = {}; // 서버별 전체 데이터
        this.currentServer = null;   // 현재 선택된 서버
        this.themeCheckInterval = null;
        this.currentTheme = null;
        this.searchInput = null;     // 검색 input 참조
        this.init();
    }

    async init() {
        await this.loadNicknames();
        await this.loadSelectedServer();
        this.createPanel();
        this.createToggleBtn();
        this.setupMouseTracking();
        this.startThemeMonitoring();
        this.closePanel();
        this.applyTheme(false); // 기본적으로 light 테마임
    }

    async loadNicknames() {
        try {
            const response = await fetch(chrome.runtime.getURL('rp_nicknames.json'));
            const data = await response.json();
            this.nicknamesByServer = data;
            // 첫 서버를 기본 선택
            this.currentServer = Object.keys(data)[0] || null;
            logToExtension('[RPNicknamePanel] 서버별 RP 닉네임 데이터 로드 완료:', Object.keys(data));
        } catch (error) {
            logToExtension('[RPNicknamePanel] RP 닉네임 데이터 로드 실패:', error);
            this.nicknamesByServer = {};
            this.currentServer = null;
        }
    }

    async loadSelectedServer() {
        return new Promise((resolve) => {
            if (!chrome.storage || !chrome.storage.sync) {
                resolve();
                return;
            }
            chrome.storage.sync.get(['rpPanelSelectedServer'], (result) => {
                const saved = result.rpPanelSelectedServer;
                if (saved && this.nicknamesByServer[saved]) {
                    this.currentServer = saved;
                }
                resolve();
            });
        });
    }

    saveSelectedServer() {
        if (chrome.storage && chrome.storage.sync) {
            chrome.storage.sync.set({ rpPanelSelectedServer: this.currentServer });
        }
    }

    createPanel() {
        this.panel = document.createElement('div');
        this.panel.id = 'rp-nickname-panel';
        this.panel.style.position = 'fixed';
        this.panel.style.top = '620px'; // SoopPanel 아래쪽 (80px + 520px + 20px)
        this.panel.style.right = '0';
        this.panel.style.width = '340px';
        this.panel.style.height = '400px';
        this.panel.style.background = 'rgba(255,255,255,0.98)';
        this.panel.style.border = '2px solid #28a745'; // 초록 테두리
        this.panel.style.borderRadius = '10px 0 0 10px';
        this.panel.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)';
        this.panel.style.zIndex = '10000';
        this.panel.style.transition = 'opacity 0.5s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
        this.panel.style.opacity = '1';
        this.panel.style.display = 'flex';
        this.panel.style.flexDirection = 'column';
        this.panel.style.alignItems = 'stretch';
        this.panel.style.padding = '0';
        this.panel.style.gap = '0';

        // 패널 헤더
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.background = 'rgba(40,167,69,1)'; // #28a745
        header.style.color = 'rgba(255,255,255,1)';
        header.style.fontWeight = 'bold';
        header.style.fontSize = '16px';
        header.style.padding = '10px 16px';
        header.style.borderRadius = '8px 0 0 0';

        // 왼쪽: 타이틀
        const headerTitle = document.createElement('span');
        headerTitle.innerText = 'RP 닉네임 매핑';
        headerTitle.style.flex = '1 1 auto';
        headerTitle.style.textAlign = 'left';
        headerTitle.style.background = 'none';
        headerTitle.style.color = 'none';

        // 서버 선택 드롭다운 (오른쪽)
        const serverSelectArea = document.createElement('div');
        serverSelectArea.style.display = 'flex';
        serverSelectArea.style.alignItems = 'center';
        serverSelectArea.style.justifyContent = 'flex-end';
        serverSelectArea.style.gap = '8px';
        serverSelectArea.style.background = 'none';
        serverSelectArea.style.color = 'none';
        // serverLabel, serverSelect 생성 및 스타일은 기존과 동일
        const serverLabel = document.createElement('span');
        serverLabel.innerText = '서버:';
        serverLabel.style.fontWeight = 'bold';
        serverLabel.style.fontSize = '13px';
        serverLabel.style.marginRight = '4px';
        const serverSelect = document.createElement('select');
        serverSelect.style.fontSize = '13px';
        serverSelect.style.padding = '2px 8px';
        serverSelect.style.borderRadius = '4px';
        serverSelect.style.border = '1px solid rgba(40,167,69,1)';
        serverSelect.style.background = 'rgba(255,255,255,1)';
        serverSelect.style.cursor = 'pointer';
        Object.keys(this.nicknamesByServer).forEach(server => {
            const option = document.createElement('option');
            option.value = server;
            option.innerText = server;
            serverSelect.appendChild(option);
        });
        serverSelect.value = this.currentServer;
        serverSelect.addEventListener('change', (e) => {
            this.currentServer = e.target.value;
            this.saveSelectedServer();
            if (this.searchInput) this.searchInput.value = '';
            this.renderTableBody();
            this.applyTheme(this.currentTheme === 'dark');
        });
        serverSelectArea.appendChild(serverLabel);
        serverSelectArea.appendChild(serverSelect);

        // header에 타이틀과 서버 선택 영역을 flex row로 배치
        header.appendChild(headerTitle);
        header.appendChild(serverSelectArea);
        this.panel.appendChild(header);

        // 검색 영역
        this.searchArea = document.createElement('div');
        this.searchArea.style.padding = '12px 16px';
        this.searchArea.style.backgroundColor = 'rgba(248,249,250,1)';
        this.searchArea.style.borderBottom = '1px solid rgba(222,226,230,1)';

        this.searchInput = document.createElement('input');
        this.searchInput.type = 'text';
        this.searchInput.placeholder = 'RP 닉네임 또는 스트리머명으로 검색...';
        this.searchInput.style.width = '100%';
        this.searchInput.style.padding = '8px 12px';
        this.searchInput.style.border = '1px solid rgba(206,212,218,1)';
        this.searchInput.style.borderRadius = '4px';
        this.searchInput.style.fontSize = '14px';
        this.searchInput.style.boxSizing = 'border-box';
        this.searchInput.addEventListener('input', (e) => {
            this.filterNicknames(e.target.value);
        });
        this.searchArea.appendChild(this.searchInput);
        this.panel.appendChild(this.searchArea);

        // 테이블 컨테이너
        this.tableContainer = document.createElement('div');
        this.tableContainer.style.flex = '1 1 0%';
        this.tableContainer.style.overflowY = 'auto';
        this.tableContainer.style.padding = '0';
        this.tableContainer.style.backgroundColor = 'rgba(255,255,255,1)';

        // 테이블
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.fontSize = '14px';

        // 테이블 헤더
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.style.backgroundColor = '#f8f9fa';
        headerRow.style.borderBottom = '2px solid #dee2e6';

        const rpHeader = document.createElement('th');
        rpHeader.innerText = 'RP 닉네임';
        rpHeader.style.padding = '8px 16px';
        rpHeader.style.textAlign = 'left';
        rpHeader.style.borderBottom = '1px solid #dee2e6';
        rpHeader.style.fontWeight = 'bold';

        const streamerHeader = document.createElement('th');
        streamerHeader.innerText = '실제 스트리머';
        streamerHeader.style.padding = '8px 16px';
        streamerHeader.style.textAlign = 'left';
        streamerHeader.style.borderBottom = '1px solid #dee2e6';
        streamerHeader.style.fontWeight = 'bold';

        headerRow.appendChild(rpHeader);
        headerRow.appendChild(streamerHeader);
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // 테이블 바디
        this.tbody = document.createElement('tbody');
        this.renderTableBody();
        table.appendChild(this.tbody);
        this.tableContainer.appendChild(table);
        this.panel.appendChild(this.tableContainer);

        document.body.appendChild(this.panel);
    }

    createToggleBtn() {
        this.toggleBtn = document.createElement('button');
        this.toggleBtn.id = 'rp-nickname-panel-toggle-btn';
        this.toggleBtn.innerHTML = '▲RP 닉네임';
        this.toggleBtn.style.position = 'fixed';
        this.toggleBtn.style.top = '820px'; // 패널 중앙 (620px + 400px/2)
        this.toggleBtn.style.transform = 'translateY(-50%) rotate(-90deg)';
        this.toggleBtn.style.transformOrigin = 'center center';
        this.toggleBtn.style.width = '140px';
        this.toggleBtn.style.height = '48px';
        this.toggleBtn.style.fontSize = '15px';
        this.toggleBtn.style.textAlign = 'center';
        this.toggleBtn.style.lineHeight = '1.2';
        this.toggleBtn.style.background = '#28a745'; // 초록
        this.toggleBtn.style.color = 'white';
        this.toggleBtn.style.border = 'none';
        this.toggleBtn.style.borderRadius = '8px 0 0 8px';
        this.toggleBtn.style.fontWeight = 'bold';
        this.toggleBtn.style.cursor = 'pointer';
        this.toggleBtn.style.zIndex = '10001';
        this.toggleBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        this.toggleBtn.style.transition = 'right 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.3s';
        this.toggleBtn.addEventListener('click', () => {
            this.togglePanel();
        });
        document.body.appendChild(this.toggleBtn);
    }

    togglePanel() {
        if (this.isPanelOpen) {
            this.closePanel();
        } else {
            this.openPanel();
        }
    }

    openPanel() {
        this.panel.style.right = '0';
        this.toggleBtn.innerHTML = '▼ RP 닉네임';
        this.toggleBtn.style.right = '292px';
        this.isPanelOpen = true;
    }

    closePanel() {
        this.panel.style.right = '-340px';
        this.toggleBtn.innerHTML = '▲ RP 닉네임';
        this.toggleBtn.style.right = '-48px';
        this.isPanelOpen = false;
    }

    setupMouseTracking() {
        let isMouseOnPanel = false;
        this.lastInputTime = Date.now();

        this.panel.addEventListener('mouseenter', () => {
            isMouseOnPanel = true;
            this.showPanelWithOpacity();
        });

        this.panel.addEventListener('mouseleave', () => {
            isMouseOnPanel = false;
        });

        document.addEventListener('mousemove', () => {
            this.lastInputTime = Date.now();
            this.showPanelWithOpacity();
        });

        document.addEventListener('keydown', () => {
            this.lastInputTime = Date.now();
            this.showPanelWithOpacity();
        });

        document.addEventListener('mouseleave', () => {
            this.hidePanelWithOpacity();
        });

        this.mouseCheckInterval = setInterval(() => {
            const currentTime = Date.now();
            const timeSinceLastInput = currentTime - this.lastInputTime;
            if (timeSinceLastInput >= 2000 && this.isPanelVisible && !isMouseOnPanel) {
                this.hidePanelWithOpacity();
            }
        }, 200);
    }

    showPanelWithOpacity() {
        this.panel.style.transition = 'opacity 0.3s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
        this.panel.style.opacity = '1';
        if (this.toggleBtn) {
            this.toggleBtn.style.transition = 'opacity 0.3s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
            this.toggleBtn.style.opacity = '1';
        }
        this.isPanelVisible = true;
    }

    hidePanelWithOpacity() {
        this.panel.style.transition = 'opacity 0.5s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
        this.panel.style.opacity = '0.1';
        if (this.toggleBtn) {
            this.toggleBtn.style.transition = 'opacity 0.5s, right 0.5s cubic-bezier(0.4,0,0.2,1)';
            this.toggleBtn.style.opacity = '0.1';
        }
        this.isPanelVisible = false;
    }

    hideCompletely() {
        this.panel.style.right = '-340px';
        this.toggleBtn.style.right = '-112px';
    }

    // 테마 감지 및 변경 메서드들
    startThemeMonitoring() {
        // 치지직 페이지인지 확인
        if (window.location.hostname.includes('chzzk.naver.com')) {
            // 초기 테마 설정
            this.updateTheme();
            
            // 주기적으로 테마 변경 감지
            this.themeCheckInterval = setInterval(() => {
                this.updateTheme();
            }, 250); // 1초마다 체크
        }
    }

    updateTheme() {
        const darkThemeClass = document.querySelector('.theme_dark')
        
        let newTheme = 'light';
        let isDark = false;
        if (darkThemeClass) {
            newTheme = 'dark';
            isDark = true;
        }
        if (newTheme !== this.currentTheme) {
            this.applyTheme(isDark);
        }
    }

    applyTheme(isDark) {
        this.currentTheme = isDark ? 'dark' : 'light';
        if (!this.panel) return;

        // 서버 선택 드롭다운 영역
        const header = this.panel.querySelector('div');
        const serverSelectArea = header?.querySelector('div');
        const serverSelect = serverSelectArea?.querySelector('select');
        if (serverSelect) {
            serverSelect.style.background = isDark ? 'rgba(52,58,64,1)' : 'rgba(255,255,255,1)'; // #343a40, #ffffff
            serverSelect.style.color = isDark ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,1)'; // #ffffff, #000000
            serverSelect.style.border = isDark ? '1px solid rgba(40,167,69,1)' : '1px solid rgba(40,167,69,1)'; // #28a745, #28a745
        }

        // 헤더
        if (header) {
            header.style.background = 'rgba(40,167,69,1)'; // #28a745
            header.style.color = 'rgba(255,255,255,1)';
        }

        // 검색 영역
        if (this.searchArea) {
            this.searchArea.style.backgroundColor = isDark ? 'rgba(73,80,87,1)' : 'rgba(248,249,250,1)'; // #495057, #f8f9fa
            this.searchArea.style.borderBottom = isDark ? '1px solid rgba(108,117,125,1)' : '1px solid rgba(222,226,230,1)'; // #6c757d, #dee2e6
        }

        // 검색 입력창
        if (this.searchInput) {
            this.searchInput.style.backgroundColor = isDark ? 'rgba(52,58,64,1)' : 'rgba(255,255,255,1)'; // #343a40, #ffffff
            this.searchInput.style.color = isDark ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,1)'; // #ffffff, #000000
            this.searchInput.style.border = isDark ? '1px solid rgba(108,117,125,1)' : '1px solid rgba(206,212,218,1)'; // #6c757d, #ced4da
        }

        // 테이블 컨테이너
        if (this.tableContainer) {
            this.tableContainer.style.backgroundColor = isDark ? 'rgba(52,58,64,1)' : 'rgba(255,255,255,1)'; // #343a40, #ffffff
        }
        
        // 테이블 헤더
        const thead = this.panel.querySelector('thead');
        const headerRow = thead?.querySelector('tr');
        const headers = thead?.querySelectorAll('th');
        if (headerRow) {
            headerRow.style.backgroundColor = isDark ? 'rgba(73,80,87,1)' : 'rgba(248,249,250,1)'; // #495057, #f8f9fa
            headerRow.style.borderBottom = isDark ? '2px solid rgba(108,117,125,1)' : '2px solid rgba(222,226,230,1)'; // #6c757d, #dee2e6
        }

        // 테이블 바디
        const tbody = this.panel.querySelector('tbody');
        const rows = tbody?.querySelectorAll('tr');
        if (rows) {
            rows.forEach(row => {
                row.style.backgroundColor = isDark ? 'rgba(52,58,64,1)' : 'rgba(255,255,255,1)'; // #343a40, #ffffff
                row.style.color = isDark ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,1)'; // #ffffff, #000000
                row.style.borderBottom = isDark ? '1px solid rgba(73,80,87,1)' : '1px solid rgba(222,226,230,1)'; // #495057, #dee2e6
                const cells = row.querySelectorAll('td');
                cells.forEach(cell => {
                    cell.style.color = isDark ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,1)'; // #ffffff, #000000
                    cell.style.borderBottom = isDark ? '1px solid rgba(73,80,87,1)' : '1px solid rgba(222,226,230,1)'; // #495057, #dee2e6
                });
            });
        }
    }

    filterNicknames(searchTerm) {
        const all = this.nicknamesByServer[this.currentServer] || [];
        const filteredNicknames = all.filter(nickname => {
            const searchLower = searchTerm.toLowerCase();
            return nickname.rp.toLowerCase().includes(searchLower) || 
                   nickname.streamer.toLowerCase().includes(searchLower);
        });
        this.renderTableBody(filteredNicknames);
        // 테마 재적용
        // this.applyTheme();
    }

    renderTableBody(nicknamesToRender = null) {
        const all = this.nicknamesByServer[this.currentServer] || [];
        const nicknames = nicknamesToRender || all;
        
        // 기존 tbody 내용 제거
        this.tbody.innerHTML = '';
        let isDark = this.currentTheme === 'dark';

        
        if (nicknames.length === 0) {
            const emptyRow = document.createElement('tr');
            const emptyCell = document.createElement('td');
            emptyCell.colSpan = 2;
            emptyCell.innerText = '검색 결과가 없습니다.';
            emptyCell.style.padding = '20px';
            emptyCell.style.textAlign = 'center';
            emptyCell.style.color = isDark ? 'rgba(173,181,189,1)' : 'rgba(108,117,125,1)'; // #adb5bd, #6c757d
            emptyCell.style.fontStyle = 'italic';
            emptyCell.style.backgroundColor = isDark ? 'rgba(52,58,64,1)' : 'rgba(255,255,255,1)';
            emptyRow.appendChild(emptyCell);
            this.tbody.appendChild(emptyRow);
            return;
        }

        nicknames.forEach((nickname, index) => {
            const row = document.createElement('tr');
            
            row.style.borderBottom = isDark ? '1px solid rgba(73,80,87,1)' : '1px solid rgba(222,226,230,1)'; // #495057, #dee2e6
            row.style.backgroundColor = isDark ? 'rgba(52,58,64,1)' : 'rgba(255,255,255,1)'; // #343a40, #ffffff
            row.style.color = isDark ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,1)'; // #ffffff, #000000

            const rpCell = document.createElement('td');
            rpCell.innerText = nickname.rp;
            rpCell.style.padding = '8px 16px';
            rpCell.style.fontWeight = 'bold';
            rpCell.style.color = 'rgba(40,167,69,1)'; // #28a745

            const streamerCell = document.createElement('td');
            streamerCell.innerText = nickname.streamer;
            streamerCell.style.padding = '8px 16px';
            streamerCell.style.color = isDark ? 'rgba(255,255,255,1)' : 'rgba(0,0,0,1)';

            row.appendChild(rpCell);
            row.appendChild(streamerCell);
            this.tbody.appendChild(row);
        });
    }
} 