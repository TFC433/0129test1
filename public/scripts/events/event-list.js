// public/scripts/events/event-list.js
// 職責：渲染並管理「事件紀錄」頁面的主列表 (含搜尋、篩選、統計、圖示化操作)
// (Systematic Refactor: Event Delegation - 統一事件處理機制)
/**
 * @version 1.0.3
 * @date 2026-01-22
 * @description [Forensics Probe] Added debug counters and call traces.
 */

// 模組內部狀態
let _fullEventData = [];
let _eventFilters = { type: 'all', time: 'all', creator: 'all' };
let _eventSearchQuery = '';

// [Forensics Probe] Debug Counters
window._DEBUG_EVENT_LIST_BIND_COUNT ||= 0;
window._DEBUG_EVENT_LIST_CLICK_COUNT ||= 0;

/**
 * 初始化並渲染事件紀錄列表介面
 * @param {HTMLElement} container - 容器
 * @param {Array<object>} eventList - 資料來源
 */
function renderEventLogList(container, eventList) {
    if (!container) return;

    // 1. 儲存原始資料
    _fullEventData = eventList || [];

    // 2. 注入 CSS 樣式
    _injectEventListStyles();

    // 3. 渲染介面骨架 (包裹 root class 以便委派)
    // 注意：每次呼叫 render 都會重建這個結構，這保證了事件監聽器的生命週期是正確的
    container.innerHTML = `
        <div class="event-list-root dashboard-widget" style="margin-top: 24px;">
            <div class="widget-header">
                <div style="display: flex; align-items: baseline; gap: 12px;">
                    <h2 class="widget-title">事件紀錄明細</h2>
                    <span style="font-size: 0.9rem; color: var(--text-muted);">共 <span id="event-list-count">0</span> 筆</span>
                </div>
            </div>

            <div class="search-pagination" style="padding: 0 1.5rem 1rem; display: flex; flex-wrap: wrap; gap: 1rem; align-items: center;">
                <input type="text" class="search-box" id="event-list-search" placeholder="搜尋事件、對象或建立者..." style="flex-grow: 1; min-width: 200px;">
                
                <button class="action-btn small primary" data-action="create-event" style="flex-shrink: 0; display: flex; align-items: center; gap: 4px;">
                    <span style="font-size: 1.1em; line-height: 1;">+</span> 新增紀錄
                </button>

                <div id="event-list-filters" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    <select id="event-filter-type" class="form-select-sm"><option value="all">所有類型</option></select>
                    <select id="event-filter-time" class="form-select-sm">
                        <option value="all">所有時間</option>
                        <option value="7">近 7 天</option>
                        <option value="30">近 30 天</option>
                        <option value="90">近 90 天</option>
                    </select>
                    <select id="event-filter-creator" class="form-select-sm"><option value="all">所有建立者</option></select>
                </div>
            </div>

            <div class="widget-content" style="padding: 0;">
                <div id="event-list-table-container" class="event-list-container">
                    <div class="loading show"><div class="spinner"></div></div>
                </div>
            </div>
        </div>
    `;

    // 4. 綁定事件委派 (針對剛建立的 Widget Root)
    const widgetRoot = container.querySelector('.event-list-root');
    if (widgetRoot) {
        // [Forensics Probe] Log binding
        window._DEBUG_EVENT_LIST_BIND_COUNT++;
        console.log(`[Forensics] BIND event-list click (Count: ${window._DEBUG_EVENT_LIST_BIND_COUNT})`, {
            container: container,
            widgetRoot: widgetRoot,
            hasOldListener: !!widgetRoot.onclick // simple check
        });
        // print stack trace to see who called render
        console.trace('[Forensics] BIND Trace');

        // 確保移除舊的 (雖然後面 innerHTML 覆蓋了 DOM，但好習慣)
        widgetRoot.removeEventListener('click', handleEventListClick);
        widgetRoot.addEventListener('click', handleEventListClick);
    }

    // 5. 初始化篩選選項
    _populateEventFilterOptions();

    // 6. 綁定輸入與 Select 事件 (這些元素在上面 HTML 剛剛生成，可以直接綁定)
    const searchInput = document.getElementById('event-list-search');
    if (searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            _eventSearchQuery = e.target.value.toLowerCase().trim();
            _filterAndRenderEvents();
        });
    }
    
    ['type', 'time', 'creator'].forEach(key => {
        const el = document.getElementById(`event-filter-${key}`);
        if (el) {
            el.addEventListener('change', (e) => {
                _eventFilters[key] = e.target.value;
                _filterAndRenderEvents();
            });
        }
    });

    // 7. 初始渲染表格
    _filterAndRenderEvents();
}

/**
 * 事件處理中心 (Delegation Hub)
 */
function handleEventListClick(e) {
    // [Forensics Probe] Log click firing
    window._DEBUG_EVENT_LIST_CLICK_COUNT++;
    const btn = e.target.closest('[data-action]');
    console.log(`[Forensics] CLICK fired (Total: ${window._DEBUG_EVENT_LIST_CLICK_COUNT})`, {
        target: e.target,
        btn: btn,
        action: btn ? btn.dataset.action : 'N/A',
        eventId: btn ? btn.dataset.id : 'N/A'
    });

    if (!btn) return;

    const action = btn.dataset.action;
    const payload = btn.dataset;

    // 對於非導航類的按鈕，阻止預設行為
    if (action !== 'navigate') {
        e.preventDefault();
    }

    switch (action) {
        case 'create-event':
            // 呼叫全域事件建立函式 (通常在 events.js 或 event-modal-manager.js)
            if (typeof window.showEventLogForCreation === 'function') {
                window.showEventLogForCreation();
            } else {
                console.warn('showEventLogForCreation function not found');
            }
            break;

        case 'view-report':
            // 呼叫全域報告檢視函式
            if (typeof window.showEventLogReport === 'function') {
                window.showEventLogReport(payload.id);
            } else {
                console.warn('showEventLogReport function not found');
            }
            break;
            
        case 'edit-event':
            // 呼叫獨立編輯器
             if (window.EventEditorStandalone && window.EventEditorStandalone.open) {
                window.EventEditorStandalone.open(payload.id);
            } else {
                console.warn('EventEditorStandalone module not found');
            }
            break;
            
        case 'delete-event':
             // 呼叫刪除邏輯 (假設使用 EventEditorStandalone 中的邏輯或全域邏輯，這裡示範呼叫全域刪除)
             if (window.EventEditorStandalone && window.EventEditorStandalone.open) {
                window.EventEditorStandalone.open(payload.id);
            }
            break;

        case 'navigate':
            // 處理 SPA 導航
            if (payload.page) {
                e.preventDefault(); // 阻止 href="#"
                const params = payload.params ? JSON.parse(payload.params) : {};
                if (window.CRM_APP && window.CRM_APP.navigateTo) {
                    window.CRM_APP.navigateTo(payload.page, params);
                }
            }
            break;
    }
}

/**
 * 核心邏輯：篩選資料並重新渲染表格
 */
function _filterAndRenderEvents() {
    const tableContainer = document.getElementById('event-list-table-container');
    const countDisplay = document.getElementById('event-list-count');
    if (!tableContainer) return;

    // --- 篩選邏輯 ---
    const now = Date.now();
    const timeMap = { '7': 7, '30': 30, '90': 90 };
    
    let filtered = _fullEventData.filter(evt => {
        // 1. 搜尋 (比對：事件名、機會名、公司名、建立者)
        if (_eventSearchQuery) {
            const searchContent = `${evt.eventName} ${evt.opportunityName||''} ${evt.companyName||''} ${evt.creator}`.toLowerCase();
            if (!searchContent.includes(_eventSearchQuery)) return false;
        }

        // 2. 類型篩選
        if (_eventFilters.type !== 'all' && evt.eventType !== _eventFilters.type) return false;

        // 3. 時間篩選
        if (_eventFilters.time !== 'all') {
            const days = timeMap[_eventFilters.time];
            const evtTime = new Date(evt.lastModifiedTime || evt.createdTime).getTime();
            if ((now - evtTime) > (days * 24 * 60 * 60 * 1000)) return false;
        }

        // 4. 建立者篩選
        if (_eventFilters.creator !== 'all' && evt.creator !== _eventFilters.creator) return false;

        return true;
    });

    // 更新統計
    if (countDisplay) countDisplay.textContent = filtered.length;

    // --- 渲染表格 ---
    if (filtered.length === 0) {
        tableContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">沒有符合條件的事件紀錄</div>';
        return;
    }

    const eventTypeConfig = new Map((window.CRM_APP?.systemConfig?.['事件類型'] || []).map(t => [t.value, { note: t.note, color: t.color }]));

    let html = `
        <table class="event-list-table">
            <thead>
                <tr>
                    <th class="col-idx">項次</th>
                    <th class="col-date">最後更新</th>
                    <th class="col-type">事件類型</th>
                    <th class="col-name">事件名稱</th>
                    <th class="col-obj-tag">關聯對象</th>
                    <th class="col-obj-name">對象名稱</th>
                    <th class="col-user">建立者</th>
                    <th class="col-actions">操作</th>
                </tr>
            </thead>
            <tbody>`;

    filtered.forEach((event, index) => {
        // 類型 Tag
        const typeInfo = eventTypeConfig.get(event.eventType) || { note: (event.eventType || 'unknown').toUpperCase(), color: '#9ca3af' };
        const typeHtml = `<span class="common-chip" style="background-color: ${typeInfo.color};">${typeInfo.note}</span>`;

        // 日期
        const displayTime = event.lastModifiedTime || event.createdTime;
        const dateStr = displayTime ? new Date(displayTime).toLocaleDateString('zh-TW') : '-';

        // 關聯對象處理 (優先機會，其次公司)
        let objTagHtml = '<span style="color:#d1d5db;">-</span>';
        let objNameHtml = '<span style="color:#d1d5db;">-</span>';

        if (event.opportunityId) {
            objTagHtml = `<span class="common-chip" style="background-color: #3b82f6;">機會</span>`;
            // data-action 導航
            const params = JSON.stringify({ opportunityId: event.opportunityId }).replace(/"/g, '&quot;');
            objNameHtml = `<a href="#" class="text-link text-truncate" title="${event.opportunityName || event.opportunityId}" 
                            data-action="navigate" 
                            data-page="opportunity-details" 
                            data-params="${params}">
                            ${event.opportunityName || '(未命名)'}
                           </a>`;
        } else if (event.companyName || event.companyId) {
            const cName = event.companyName || event.companyId;
            objTagHtml = `<span class="common-chip" style="background-color: #6b7280;">公司</span>`;
            // data-action 導航
            const params = JSON.stringify({ companyName: encodeURIComponent(cName) }).replace(/"/g, '&quot;');
            objNameHtml = `<a href="#" class="text-link text-truncate" title="${cName}" 
                            data-action="navigate" 
                            data-page="company-details" 
                            data-params="${params}">
                            ${cName}
                           </a>`;
        }

        html += `
            <tr>
                <td class="col-idx">${index + 1}</td>
                <td class="col-date">${dateStr}</td>
                <td class="col-type">${typeHtml}</td>
                <td class="col-name">
                    <span class="text-truncate" title="${event.eventName || '(未命名)'}">${event.eventName || '(未命名)'}</span>
                </td>
                <td class="col-obj-tag">${objTagHtml}</td>
                <td class="col-obj-name">${objNameHtml}</td>
                <td class="col-user" title="${event.creator}">${event.creator}</td>
                <td class="col-actions">
                    <button class="btn-mini-view" title="查看完整報告" 
                            data-action="view-report" 
                            data-id="${event.eventId}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                    <button class="btn-mini-view" title="編輯" 
                            data-action="edit-event" 
                            data-id="${event.eventId}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                </td>
            </tr>`;
    });

    html += '</tbody></table>';
    tableContainer.innerHTML = html;
}

/**
 * 輔助：填入篩選選單
 */
function _populateEventFilterOptions() {
    const typeSelect = document.getElementById('event-filter-type');
    const creatorSelect = document.getElementById('event-filter-creator');
    
    // 1. 類型 (從 System Config)
    const types = window.CRM_APP?.systemConfig?.['事件類型'] || [];
    if (typeSelect) {
        // 清空並重新填充
        typeSelect.innerHTML = '<option value="all">所有類型</option>'; 
        types.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.value;
            opt.textContent = t.note || t.value;
            typeSelect.appendChild(opt);
        });
    }

    // 2. 建立者 (從資料中提取唯一值)
    if (creatorSelect) {
        creatorSelect.innerHTML = '<option value="all">所有建立者</option>';
        const creators = new Set(_fullEventData.map(e => e.creator).filter(Boolean));
        [...creators].sort().forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            opt.textContent = c;
            creatorSelect.appendChild(opt);
        });
    }
}

/**
 * 輔助：注入 CSS
 */
function _injectEventListStyles() {
    const styleId = 'event-list-table-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
            .event-list-container { width: 100%; overflow-x: auto; background: var(--card-bg, #fff); min-height: 200px; }
        .event-list-table { width: 100%; border-collapse: collapse; min-width: 1000px; }
        
        .event-list-table th { 
            padding: 12px 16px; 
            text-align: left; 
            background: var(--glass-bg); 
            color: var(--text-secondary); 
            font-weight: 600; 
            font-size: 0.9rem; 
            border-bottom: 1px solid var(--border-color); 
            white-space: nowrap; 
        }
        
        .event-list-table td { 
            padding: 10px 16px; 
            border-bottom: 1px solid var(--border-color); 
            vertical-align: middle; 
            font-size: 0.95rem; 
            color: var(--text-main); 
        }
        
        .event-list-table tr:not(.locked):hover { background-color: var(--glass-bg); }
        
        .event-list-table tr.locked { background-color: var(--bg-locked); color: var(--text-locked); }
        .event-list-table tr.locked td { color: var(--text-locked); }

        /* 欄位寬度與樣式 */
        .col-idx { width: 60px; text-align: center !important; color: var(--text-muted); font-weight: 600; }
        .col-date { width: 110px; white-space: nowrap; }
        .col-type { width: 110px; }
        .col-name { min-width: 200px; max-width: 300px; font-weight: 600; }
        .col-obj-tag { width: 90px; text-align: center; }
        .col-obj-name { min-width: 180px; max-width: 250px; }
        .col-user { width: 120px; white-space: nowrap; }
        .col-actions { width: 80px; text-align: center !important; }

        /* Tag 標籤樣式 (統一風格) */
        .common-chip { 
            display: inline-block; 
            padding: 3px 10px; 
            border-radius: 4px; 
            font-size: 0.8rem; 
            color: white; 
            white-space: nowrap; 
            font-weight: 500; 
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        
        /* 文字處理 */
        .text-truncate { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .text-link { color: var(--accent-blue); text-decoration: none; transition: color 0.2s; }
        .text-link:hover { text-decoration: underline; color: var(--primary-color); }

        /* 圖示按鈕樣式 */
        .btn-mini-view {
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            padding: 6px;
            border-radius: 4px;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        .btn-mini-view:hover {
            color: var(--accent-blue);
            background: #e0f2fe; 
        }
    `;
    document.head.appendChild(style);
}