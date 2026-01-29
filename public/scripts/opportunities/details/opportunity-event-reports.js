// views/scripts/opportunity-details/event-reports.js
// 職責：專門管理「事件報告」頁籤的 UI 與功能，包含總覽模式與列表模式
// (V6 - 最終修復版：補回公開方法並整合全域樣式)

const OpportunityEvents = (() => {
    // 模組私有變數
    let _eventLogs = [];
    let _context = {}; // 儲存機會或公司的上下文資訊
    let _cachedContacts = []; // 儲存初始化時傳入的聯絡人資料，用於職稱補完

    /**
     * 【核心修正】：動態注入樣式。
     * 將原先位於 event-log-list.html 的 CSS 移至此處，
     * 解決「總覽模式」首次開啟時樣式走板的問題。
     */
    function _injectStyles() {
        const styleId = 'event-reports-unified-styles';
        if (document.getElementById(styleId)) return;
        
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            /* --- 總覽模式外層容器 --- */
            #event-logs-overview-view, [id^="event-logs-overview-view-"] {
                display: flex;
                flex-direction: column;
                gap: 20px;
                width: 100%;
            }

            /* --- 報告卡片核心結構 --- */
            .report-view { 
                background-color: var(--primary-bg);
                border-radius: var(--rounded-xl);
                overflow: hidden;
            }

            .report-header {
                --header-color: var(--accent-purple); 
                background: color-mix(in srgb, var(--header-color) 15%, var(--primary-bg));
                border: 1px solid color-mix(in srgb, var(--header-color) 30%, var(--border-color));
                padding: 20px 25px;
                border-radius: 12px;
                margin-bottom: 20px;
            }

            .report-title {
                font-size: 1.6rem; font-weight: 700; color: var(--text-primary);
                line-height: 1.3; margin-bottom: 15px; display: flex; align-items: center; gap: 12px;
            }

            .header-meta-info {
                display: flex; justify-content: space-between; font-size: 0.95rem;
                color: var(--text-secondary); padding-top: 12px;
                border-top: 1px solid color-mix(in srgb, var(--header-color) 20%, var(--border-color));
            }

            /* --- 內容區塊排版 --- */
            .report-container { display: flex; flex-direction: column; gap: 20px; }
            /* 保持您要求的左側 10% 內縮排版 */
            [id^="event-logs-overview-view-"] .report-container { padding-left: 10% !important; }

            .report-section {
                background: var(--card-bg); border: 1px solid var(--border-color);
                border-radius: 12px; padding: 24px; box-shadow: var(--shadow-sm);
            }

            .section-title {
                font-size: 1.2rem; font-weight: 700; color: var(--text-primary);
                margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid var(--border-color);
                display: flex; align-items: center; gap: 8px;
            }

            /* --- 資訊欄位 Grid 佈局 --- */
            .info-item {
                display: grid; grid-template-columns: 140px 1fr; gap: 16px; padding: 12px 0; align-items: start; 
            }

            .info-label {
                font-weight: 600; color: var(--text-muted); font-size: 0.95rem;
                padding-top: 10px; text-align: right;
            }

            .info-value-box {
                background-color: var(--primary-bg); border: 1px solid var(--border-color);
                padding: 10px 12px; border-radius: 8px; min-height: 42px;
                color: var(--text-primary); font-size: 1rem; line-height: 1.6;
                white-space: pre-wrap; word-break: break-word;
            }

            /* --- 人員膠囊樣式 --- */
            .participants-wrapper { display: flex; flex-wrap: wrap; gap: 8px; width: 100%; }
            .participant-pill {
                display: inline-flex; align-items: center; padding: 4px 12px;
                border-radius: 20px; font-size: 0.9rem; font-weight: 500;
                background-color: var(--secondary-bg); border: 1px solid var(--border-color);
            }
            .participant-pill.our-side {
                background-color: color-mix(in srgb, var(--accent-blue) 10%, var(--secondary-bg));
                color: var(--accent-blue);
            }
            .participant-pill.client-side {
                background-color: color-mix(in srgb, var(--accent-green) 10%, var(--secondary-bg));
                color: var(--accent-green);
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * 渲染初始視圖（列表模式）
     */
    function _render() {
        const container = _context.opportunityId 
            ? document.getElementById('tab-content-events') 
            : document.getElementById('tab-content-company-events');

        if (!container) return;

        const headerHtml = `
            <div class="widget-header">
                <h2 class="widget-title">相關事件報告</h2>
                <div style="display: flex; gap: 10px;">
                    ${(_eventLogs && _eventLogs.length > 0) ? `
                    <button id="toggle-overview-btn-${_context.id}" class="action-btn small secondary" 
                            onclick="OpportunityEvents.toggleOverview(true, '${_context.id}')">
                        總覽模式
                    </button>` : ''}
                    <button class="action-btn small primary" onclick="OpportunityEvents.showAddEventModal()">
                        📝 新增事件
                    </button>
                </div>
            </div>
        `;
        
        let listHtml = '';
        if (!_eventLogs || _eventLogs.length === 0) {
            listHtml = '<div class="alert alert-info">此處尚無相關的事件報告</div>';
        } else {
            listHtml = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>建立時間</th>
                            <th>事件名稱</th>
                            <th>建立者</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>`;
            _eventLogs.forEach(log => {
                listHtml += `
                    <tr>
                        <td data-label="建立時間">${formatDateTime(log.createdTime)}</td>
                        <td data-label="事件名稱">${log.eventName || '(未命名)'}</td>
                        <td data-label="建立者">${log.creator || 'N/A'}</td>
                        <td data-label="操作">
                            <button class="action-btn small info" onclick="showEventLogReport('${log.eventId}')">
                                📄 查看報告
                            </button>
                        </td>
                    </tr>
                `;
            });
            listHtml += '</tbody></table>';
        }

        container.innerHTML = `
            <div class="dashboard-widget">
                ${headerHtml}
                <div class="widget-content">
                    <div id="event-logs-list-view-${_context.id}">${listHtml}</div>
                    <div id="event-logs-overview-view-${_context.id}" style="display: none;"></div>
                </div>
            </div>
        `;
    }

    // --- 公開方法 (API) ---

    /**
     * 開啟新增事件 Modal
     */
    function showAddEventModal() {
        if (_context.opportunityId) {
            const oppName = _context.opportunityName ? _context.opportunityName.replace(/'/g, "\\'") : '';
            if (typeof showEventLogModalByOpp === 'function') {
                showEventLogModalByOpp(_context.opportunityId, oppName);
            } else {
                console.error("找不到 showEventLogModalByOpp 函式。");
            }
        } else if (_context.companyId) {
            if (typeof showEventLogFormModal === 'function') {
                showEventLogFormModal({ companyId: _context.companyId, companyName: _context.companyName });
            }
        }
    }

    /**
     * 切換列表模式與總覽模式
     */
    async function toggleOverview(showOverview, contextId) {
        const listView = document.getElementById(`event-logs-list-view-${contextId}`);
        const overviewView = document.getElementById(`event-logs-overview-view-${contextId}`);
        const toggleBtn = document.getElementById(`toggle-overview-btn-${contextId}`);

        if (!listView || !overviewView) return;

        if (showOverview) {
            listView.style.display = 'none';
            overviewView.style.display = 'flex';
            overviewView.innerHTML = '<div class="loading show"><div class="spinner"></div><p>載入報告總覽中...</p></div>';
            
            toggleBtn.textContent = '返回列表';
            toggleBtn.setAttribute('onclick', `OpportunityEvents.toggleOverview(false, '${contextId}')`);

            // 使用 setTimeout 確保 DOM 狀態穩定並應用新注入的樣式
            setTimeout(() => {
                if (typeof renderEventLogReportHTML === 'function') {
                    if (_eventLogs && _eventLogs.length > 0) {
                        const allReportsHtml = _eventLogs.map(log => {
                            const logData = { ...log };
                            // 補上上下文名稱
                            if (_context.opportunityId) {
                                logData.opportunityName = logData.opportunityName || _context.opportunityName;
                            }
                            // 傳入已有的聯絡人資料，確保總覽中的職稱能正確顯示
                            return renderEventLogReportHTML(logData, _cachedContacts);
                        }).join('');
                        
                        overviewView.innerHTML = allReportsHtml;
                    } else {
                        overviewView.innerHTML = '<div class="alert alert-info">此處尚無相關的事件報告</div>';
                    }
                } else {
                    overviewView.innerHTML = '<div class="alert alert-error">報告渲染引擎載入失敗，請重新整理頁面。</div>';
                }
            }, 50);

        } else {
            listView.style.display = 'block';
            overviewView.style.display = 'none';
            toggleBtn.textContent = '總覽模式';
            toggleBtn.setAttribute('onclick', `OpportunityEvents.toggleOverview(true, '${contextId}')`);
        }
    }

    /**
     * 模組初始化
     * @param {Array} eventLogs - 事件日誌陣列
     * @param {Object} context - 上下文 (包含 opportunityId 或 companyId)
     */
    function init(eventLogs, context) {
        _eventLogs = eventLogs || [];
        _context = { 
            ...context, 
            id: context.opportunityId || context.companyId 
        };
        // 重要：儲存從詳細頁傳入的聯絡人資訊 (包含各員之職稱)
        _cachedContacts = context.linkedContacts || []; 

        _injectStyles();
        _render();
    }

    // 回傳公開介面
    return {
        init: init,
        toggleOverview: toggleOverview,
        showAddEventModal: showAddEventModal // 修復點：公開此函式以供 onclick 使用
    };
})();