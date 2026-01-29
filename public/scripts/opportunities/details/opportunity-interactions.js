// public/scripts/opportunities/details/opportunity-interactions.js
// 職責：專門管理「互動與新增」頁籤的所有 UI 與功能

const OpportunityInteractions = (() => {
    // 模組私有變數
    let _interactions = [];
    let _context = {}; // { opportunityId, companyId }
    let _container = null;

    // ✅ [Fix] 系統自動產生類型：必須與鎖定證據一致
    // Evidence: const isLockedRecord = ['系統事件', '事件報告'].includes(item.eventType);
    const SYSTEM_GENERATED_TYPES = ['系統事件', '事件報告'];

    // 子頁籤點擊事件
    function _handleTabClick(event) {
        if (!event.target.classList.contains('sub-tab-link')) return;

        const tab = event.target;
        const tabName = tab.dataset.tab;

        _container.querySelectorAll('.sub-tab-link').forEach(t => t.classList.remove('active'));
        _container.querySelectorAll('.sub-tab-content').forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        const contentPane = _container.querySelector(`#${tabName}-pane`);
        if (contentPane) contentPane.classList.add('active');
    }

    /**
     * 【鑑識修補】HTML 轉義 (XSS 防護)
     */
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * 【鑑識修補】渲染單一互動項目
     * 使用已被 dashboard_widgets.js 證實使用的 class: .activity-feed-item/.feed-content/.feed-text/.feed-time
     * 並維持 Strategy A：rowIndex 非有效數字則不渲染刪除按鈕
     */
    function renderSingleInteractionItem(interaction) {
        if (!interaction) return '';

        const rawTime = interaction.interactionTime || interaction.createdTime || '';
        const timeStr = (typeof formatDateTime === 'function')
            ? formatDateTime(rawTime)
            : rawTime;

        const typeStr = escapeHtml(interaction.eventTitle || interaction.eventType || '未分類');
        const recorder = escapeHtml(interaction.recorder || '系統');

        const rawSummary = interaction.contentSummary || '(無內容)';
        const summaryHtml = escapeHtml(rawSummary).replace(/\n/g, '<br>');

        const rowId = interaction.interactionId;
        const rowIndex = interaction.rowIndex;

        // 鎖定邏輯（必須與 showForEditing 證據一致）
        const isLocked = ['系統事件', '事件報告'].includes(interaction.eventType);

        let buttonsHtml = '';
        if (rowId) {
            buttonsHtml += `
                <button type="button" class="action-btn small secondary" onclick="OpportunityInteractions.showForEditing('${rowId}')">
                    ${isLocked ? '檢視' : '編輯'}
                </button>
            `;

            // Strategy A: 僅當非鎖定且 rowIndex 可被安全轉為數字才渲染刪除
            const rowIndexNum = Number(rowIndex);
            if (!isLocked && Number.isFinite(rowIndexNum)) {
                buttonsHtml += `
                    &nbsp;
                    <button type="button" class="action-btn small secondary" onclick="OpportunityInteractions.confirmDelete('${rowId}', ${rowIndexNum})">
                        刪除
                    </button>
                `;
            }
        }

        return `
            <div class="activity-feed-item">
                <div class="feed-content">
                    <div class="feed-text">
                        <strong>${recorder}</strong> - <strong>${typeStr}</strong>
                        <span class="feed-time"> (${escapeHtml(timeStr)})</span>
                    </div>
                    <div class="feed-text">
                        ${summaryHtml}
                    </div>
                    <div class="feed-text">
                        ${buttonsHtml}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染一個時間軸列表
     * @param {string} containerSelector - e.g. '#discussion-timeline'
     * @param {Array<object>} interactions
     * @param {number} limit
     */
    function _renderTimelineList(containerSelector, interactions, limit = 3) {
        const historyList = _container.querySelector(containerSelector);
        if (!historyList) {
            console.error(`[Interactions] 找不到時間軸容器: ${containerSelector}`);
            return;
        }

        const allInteractions = Array.isArray(interactions) ? interactions : [];
        if (allInteractions.length === 0) {
            // ✅ [Fix] 移除 inline style（維持最小例外）
            historyList.innerHTML = `
                <div class="alert alert-info">
                    ${containerSelector.includes('discussion') ? '尚無動態' : '尚無系統活動'}
                </div>
            `;
            return;
        }

        const isExpanded = historyList.classList.contains('is-expanded');
        const interactionsToRender = isExpanded ? allInteractions : allInteractions.slice(0, limit);

        let listHtml = interactionsToRender.map(renderSingleInteractionItem).join('');

        if (allInteractions.length > limit) {
            const buttonText = isExpanded
                ? '收合紀錄'
                : `顯示其餘 ${allInteractions.length - limit} 筆紀錄`;

            listHtml += `
                <div class="interaction-timeline-toggle">
                    <button class="action-btn secondary" onclick="OpportunityInteractions.toggleListExpanded('${containerSelector}', ${!isExpanded})">
                        ${buttonText}
                    </button>
                </div>
            `;
        }

        historyList.innerHTML = listHtml;
    }

    /**
     * 公開：切換特定列表展開/收合
     */
    function toggleListExpanded(containerSelector, expand) {
        const historyList = _container.querySelector(containerSelector);
        if (historyList) {
            historyList.classList.toggle('is-expanded', !!expand);
            _updateTimelineView();
        }
    }

    /**
     * 更新時間軸視圖：分離討論 vs 系統活動
     */
    function _updateTimelineView() {
        if (!_container) return;

        const discussionInteractions = [];
        const activityLogInteractions = [];

        _interactions.forEach(interaction => {
            if (SYSTEM_GENERATED_TYPES.includes(interaction.eventType)) {
                activityLogInteractions.push(interaction);
            } else {
                discussionInteractions.push(interaction);
            }
        });

        // 可選：確保排序（若後端已排序可刪）
        // discussionInteractions.sort((a, b) => new Date(b.interactionTime || b.createdTime || 0) - new Date(a.interactionTime || a.createdTime || 0));
        // activityLogInteractions.sort((a, b) => new Date(b.interactionTime || b.createdTime || 0) - new Date(a.interactionTime || a.createdTime || 0));

        _renderTimelineList('#discussion-timeline', discussionInteractions, 5);
        _renderTimelineList('#activity-log-timeline', activityLogInteractions, 3);
    }

    /**
     * 表單提交：新增/編輯
     */
    async function _handleSubmit(event) {
        event.preventDefault();
        if (!_container) return;

        const form = _container.querySelector('#new-interaction-form');
        const rowIndex = form.querySelector('#interaction-edit-rowIndex').value;
        const isEditMode = !!rowIndex;

        showLoading(isEditMode ? '正在更新互動紀錄...' : '正在新增互動紀錄...');
        try {
            const interactionTimeInput = form.querySelector('#interaction-time').value;
            const interactionTimeISO = interactionTimeInput
                ? new Date(interactionTimeInput).toISOString()
                : new Date().toISOString();

            const interactionData = {
                interactionTime: interactionTimeISO,
                eventType: form.querySelector('#interaction-event-type').value,
                contentSummary: form.querySelector('#interaction-summary').value,
                nextAction: form.querySelector('#interaction-next-action').value,
                modifier: getCurrentUser()
            };

            if (_context.opportunityId) interactionData.opportunityId = _context.opportunityId;
            if (_context.companyId) interactionData.companyId = _context.companyId;

            const url = isEditMode ? `/api/interactions/${rowIndex}` : '/api/interactions';
            const method = isEditMode ? 'PUT' : 'POST';

            if (!isEditMode) interactionData.recorder = getCurrentUser();

            const result = await authedFetch(url, { method, body: JSON.stringify(interactionData) });

            if (!result.success) throw new Error(result.details || '操作失敗');
            // 成功後 authedFetch 可能刷新/通知（維持既有行為）
        } catch (error) {
            if (error.message !== 'Unauthorized') showNotification(`操作失敗: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    // 動態注入樣式（保留既有行為）
    function _injectStyles() {
        const styleId = 'interactions-dynamic-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .interaction-timeline-toggle {
                text-align: center;
                margin-top: var(--spacing-4);
            }
            .interaction-timeline.is-expanded {
                max-height: none;
                overflow-y: visible;
                mask-image: none;
                -webkit-mask-image: none;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * 公開：顯示表單供編輯
     */
    function showForEditing(interactionId) {
        if (!_container) return;

        const item = _interactions.find(i => i.interactionId === interactionId);
        if (!item) {
            showNotification('找不到該筆互動紀錄資料', 'error');
            return;
        }

        const form = _container.querySelector('#new-interaction-form');
        if (!form) return;

        form.querySelector('#interaction-edit-rowIndex').value = item.rowIndex;

        const interactionTime = new Date(item.interactionTime || item.createdTime || new Date().toISOString());
        interactionTime.setMinutes(interactionTime.getMinutes() - interactionTime.getTimezoneOffset());
        form.querySelector('#interaction-time').value = interactionTime.toISOString().slice(0, 16);

        form.querySelector('#interaction-event-type').value = item.eventType;
        form.querySelector('#interaction-summary').value = item.contentSummary;
        form.querySelector('#interaction-next-action').value = item.nextAction;

        const eventTypeSelect = form.querySelector('#interaction-event-type');
        const summaryTextarea = form.querySelector('#interaction-summary');
        const nextActionInput = form.querySelector('#interaction-next-action');
        const submitBtn = form.querySelector('#interaction-submit-btn');

        // Evidence: 鎖定判斷固定兩類
        const isLockedRecord = ['系統事件', '事件報告'].includes(item.eventType);

        if (isLockedRecord) {
            eventTypeSelect.disabled = true;
            summaryTextarea.readOnly = true;
            nextActionInput.readOnly = true;
            submitBtn.textContent = '💾 僅儲存時間變更';
        } else {
            eventTypeSelect.disabled = false;
            summaryTextarea.readOnly = false;
            nextActionInput.readOnly = false;
            submitBtn.textContent = '💾 儲存變更';
        }

        form.scrollIntoView({ behavior: 'smooth' });
    }

    /**
     * 公開：刪除確認
     */
    function confirmDelete(interactionId, rowIndex) {
        if (!_container) return;

        const item = _interactions.find(i => i.interactionId === interactionId);
        const summary = item ? (item.contentSummary || '此紀錄').substring(0, 30) + '...' : '此筆紀錄';

        const message = `您確定要永久刪除這筆互動紀錄嗎？\n\n"${summary}"\n\n此操作無法復原。`;

        showConfirmDialog(message, async () => {
            showLoading('正在刪除紀錄...');
            try {
                await authedFetch(`/api/interactions/${rowIndex}`, { method: 'DELETE' });
            } catch (error) {
                if (error.message !== 'Unauthorized') {
                    console.error('刪除互動紀錄失敗:', error);
                }
            } finally {
                hideLoading();
            }
        });
    }

    /**
     * 公開：初始化
     */
    function init(containerElement, context, interactions) {
        _container = containerElement;
        _context = context || {};
        _interactions = Array.isArray(interactions) ? interactions : [];

        if (!_container) {
            console.error('[Interactions] 初始化失敗：未提供有效的容器元素。');
            return;
        }

        const form = _container.querySelector('#new-interaction-form');
        if (!form) {
            console.error('[Interactions] 初始化失敗：在指定的容器中找不到 #new-interaction-form。');
            return;
        }

        // 填入下拉選單（保留既有邏輯，僅避免把系統類型放進去）
        const eventTypeSelect = form.querySelector('#interaction-event-type');
        if (eventTypeSelect && window.CRM_APP && window.CRM_APP.systemConfig && window.CRM_APP.systemConfig['互動類型']) {
            const interactionTypes = window.CRM_APP.systemConfig['互動類型'];
            eventTypeSelect.innerHTML = '<option value="">請選擇類型...</option>';

            interactionTypes.forEach(type => {
                const note = type.note || type.value;
                // 不提供系統自動類型（避免前端手動建立系統事件）
                if (!SYSTEM_GENERATED_TYPES.includes(note) && !SYSTEM_GENERATED_TYPES.includes(type.value)) {
                    eventTypeSelect.innerHTML += `<option value="${type.value}">${note}</option>`;
                }
            });

            if (eventTypeSelect.options.length === 2) eventTypeSelect.selectedIndex = 1;
        }

        // 重置表單
        form.reset();
        form.querySelector('#interaction-edit-rowIndex').value = '';
        form.querySelector('#interaction-submit-btn').textContent = '💾 新增紀錄';

        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        form.querySelector('#interaction-time').value = now.toISOString().slice(0, 16);

        form.removeEventListener('submit', _handleSubmit);
        form.addEventListener('submit', _handleSubmit);

        const tabContainer = _container.querySelector('.sub-tabs');
        if (tabContainer) {
            tabContainer.removeEventListener('click', _handleTabClick);
            tabContainer.addEventListener('click', _handleTabClick);
        }

        _injectStyles();
        _updateTimelineView();
    }

    return {
        init,
        showForEditing,
        toggleListExpanded,
        confirmDelete
    };
})();
