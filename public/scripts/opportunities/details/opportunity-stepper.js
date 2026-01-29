// views/scripts/opportunity-details/stepper.js
// 職責：專門管理「機會進程」區塊的所有 UI 渲染與互動邏輯
// (V2 - 修正：相容新舊兩種 stageHistory 格式)

const OpportunityStepper = (() => {
    // 模組內的私有變數
    let _opportunityInfo = null;

    // 處理圓圈點擊（三態循環）
    function _handleCircleClick(step) {
        // Remove direct reliance on event target, pass step element
        const iconEl = step.querySelector('.step-circle');
        const allSteps = Array.from(step.parentElement.children);
        const index = allSteps.indexOf(step);
        
        switch (step.dataset.status) {
            case 'pending':
                step.dataset.status = 'completed';
                step.classList.add('completed');
                step.classList.remove('skipped');
                iconEl.innerHTML = '✓';
                break;
            case 'completed':
                step.dataset.status = 'skipped';
                step.classList.remove('completed');
                step.classList.add('skipped');
                iconEl.innerHTML = '✕';
                break;
            case 'skipped':
                step.dataset.status = 'pending';
                step.classList.remove('skipped');
                iconEl.innerHTML = index + 1;
                break;
        }
    }

    // 處理階段名稱點擊（設定為目前）
    function _handleNameClick(step) {
        // Remove direct reliance on event target, pass step element
        document.querySelectorAll('.stage-stepper-container .stage-step').forEach(s => s.classList.remove('current'));
        step.classList.add('current');
    }

    // 儲存變更
    async function _saveChanges() {
        const stepperContainer = document.querySelector('.stage-stepper-container');
        if (!stepperContainer) return;

        const historyItems = [];
        stepperContainer.querySelectorAll('.stage-step').forEach(step => {
            const status = step.dataset.status;
            const stageId = step.dataset.stageId;
            if (status === 'completed') {
                historyItems.push(`C:${stageId}`);
            } else if (status === 'skipped') {
                historyItems.push(`X:${stageId}`);
            }
        });

        const currentStep = stepperContainer.querySelector('.stage-step.current');
        const newCurrentStage = currentStep ? currentStep.dataset.stageId : _opportunityInfo.currentStage;
        
        // --- 【*** 關鍵修正：確保儲存時，目前階段一定在歷程中 ***】 ---
        // 建立一個 Set 來儲存所有 "C:" 狀態的
        const historySet = new Set(historyItems.filter(item => item.startsWith('C:')));
        // 把 "X:" 狀態的也加進去
        historyItems.filter(item => item.startsWith('X:')).forEach(item => historySet.add(item));
        
        // 確保目前階段 (newCurrentStage) 一定在 "C:" 歷程中
        historySet.add(`C:${newCurrentStage}`);
        // 如果 "X:" 歷程中包含了目前階段，要把它移除
        historySet.delete(`X:${newCurrentStage}`);
        
        const newStageHistory = Array.from(historySet).join(',');
        // --- 【*** 修正結束 ***】 ---


        showLoading('正在儲存階段歷程...');
        try {
            const result = await authedFetch(`/api/opportunities/${_opportunityInfo.rowIndex}`, {
                method: 'PUT',
                body: JSON.stringify({
                    currentStage: newCurrentStage,
                    stageHistory: newStageHistory,
                    modifier: getCurrentUser()
                })
            });

            if (result.success) {
                // authedFetch 會處理整頁刷新和通知
            } else {
                throw new Error(result.error || '儲存失敗');
            }

        } catch (error) {
            if (error.message !== 'Unauthorized') {
                showNotification(`儲存失敗: ${error.message}`, 'error');
            }
        } finally {
            hideLoading();
        }
    }
    
    // 渲染檢視模式
    function _renderViewMode() {
        const container = document.getElementById('opportunity-stage-stepper');
        const header = document.querySelector('#opportunity-stage-stepper-container .widget-header');
        const allStages = CRM_APP.systemConfig['機會階段'] || [];

        header.innerHTML = `
            <h2 class="widget-title">機會進程</h2>
            <button class="action-btn small secondary" id="edit-stepper-btn">✏️ 編輯歷程</button>
        `;
        
        // Ensure old listeners are removed or element is fresh. 
        // header.innerHTML replaces content so it's fine.
        header.querySelector('#edit-stepper-btn').addEventListener('click', () => _renderEditMode());

        const stageStatusMap = new Map();
        if (_opportunityInfo.stageHistory) {
            
            // --- 【*** 關鍵修正：相容新舊格式 ***】 ---
            // 這段邏輯現在可以同時處理 "C:01_..." 和 "01_..." 兩種格式
            _opportunityInfo.stageHistory.split(',').forEach(item => {
                if (!item) return; // 忽略空字串
                
                if(item.includes(':')) {
                    // 新格式: "C:01_..." 或 "X:02_..."
                    const [status, stageId] = item.split(':');
                    stageStatusMap.set(stageId, status);
                } else {
                    // 舊格式 (無前綴): "01_..."
                    // 我們假設所有舊格式的資料都是 'Completed' (C)
                    stageStatusMap.set(item, 'C'); 
                }
            });
            // --- 【*** 修正結束 ***】 ---
        }

        let stepsHtml = allStages.map((stage, index) => {
            
            // --- 【*** 關鍵修正：重新定義顯示邏輯 (C 或 Current 都打勾) ***】 ---
            let statusClass = 'pending';
            let icon = index + 1;
            
            const status = stageStatusMap.get(stage.value); // 'C' 或 'X'
            const isCurrent = (stage.value === _opportunityInfo.currentStage);

            // 1. 判斷是否為「已完成」(打勾)
            // 您的需求：(歷程中有 'C') 或者 (這就是目前階段)，都要打勾
            if (status === 'C' || isCurrent) {
                statusClass = 'completed'; // 設為 'completed' (綠色勾)
                icon = '✓';
            } 
            // 2. 判斷是否為「已跳過」(打叉)
            else if (status === 'X') {
                statusClass = 'skipped';
                icon = '✕';
            }
            
            // 3. 判斷是否為「目前階段」(高亮)
            // 您的需求：目前階段要高亮 (藍色)
            // 這會附加到 'completed' 後面，變成 'completed current'
            if (isCurrent) {
                statusClass += ' current';
            }
            // --- 【*** 修正結束 ***】 ---

            return `
                <div class="stage-step ${statusClass.trim()}" data-stage-id="${stage.value}" title="${stage.note || stage.value}">
                    <div class="step-circle">${icon}</div>
                    <div class="step-name">${stage.note || stage.value}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = `<div class="stage-stepper-container">${stepsHtml}</div>`;
    }

    // 渲染編輯模式
    function _renderEditMode() {
        const container = document.getElementById('opportunity-stage-stepper');
        const header = document.querySelector('#opportunity-stage-stepper-container .widget-header');
        const stepperContainer = container.querySelector('.stage-stepper-container');

        if (!stepperContainer) return; // 如果還沒有渲染，則不執行
        
        // 顯示提示文字
        let hintContainer = document.getElementById('stepper-edit-hint');
        if (!hintContainer) {
            hintContainer = document.createElement('div');
            hintContainer.id = 'stepper-edit-hint';
            hintContainer.className = 'stepper-edit-hint';
            hintContainer.innerHTML = `ℹ️ <strong>操作提示</strong>：點擊 [圓圈] 可在 ( ✓ / ✕ / 無 ) 三種狀態間切換，點擊 [階段名稱] 可設定為目前階段。`;
            container.before(hintContainer);
        }
        hintContainer.style.display = 'block';

        header.innerHTML = `
            <h2 class="widget-title">機會進程 (編輯模式)</h2>
            <div>
                <button class="action-btn small" style="background: #6c757d;" id="cancel-stepper-btn">取消</button>
                <button class="action-btn small primary" id="save-stepper-btn">💾 儲存</button>
            </div>
        `;
        header.querySelector('#cancel-stepper-btn').addEventListener('click', () => {
            hintContainer.style.display = 'none';
            _renderViewMode();
        });
        header.querySelector('#save-stepper-btn').addEventListener('click', _saveChanges);

        // 直接在現有的 stepperContainer 上增加 class 和事件監聽
        stepperContainer.classList.add('edit-mode');
        
        // --- Static Binding Fix: Delegation ---
        // 移除舊的 delegated listener (如果有) - 雖然這裡是 init 邏輯，但為了安全
        stepperContainer.removeEventListener('click', _handleStepperClick);
        stepperContainer.addEventListener('click', _handleStepperClick);

        stepperContainer.querySelectorAll('.stage-step').forEach(step => {
            let status = 'pending';
            
            // --- 【*** 關鍵修正：確保編輯時 'current' 也被視為 'completed' ***】 ---
            if (step.classList.contains('current') || step.classList.contains('completed')) {
                status = 'completed';
            }
            if (step.classList.contains('skipped')) {
                status = 'skipped';
            }
            // --- 【*** 修正結束 ***】 ---
            
            step.dataset.status = status;

            // Remove previous static listeners if any (though innerHTML wasn't reset, so maybe needed if reusing elements)
            // But we are using delegation now, so we don't attach new ones.
        });
    }

    // New Delegated Handler
    function _handleStepperClick(e) {
        // Only active in edit mode? The listener is added in _renderEditMode.
        // But _renderViewMode replaces innerHTML of container's parent? No, container.innerHTML.
        // Wait, stepperContainer is inside container. 
        // _renderViewMode rewrites container.innerHTML, so stepperContainer is destroyed.
        // Thus, the listener attached in _renderEditMode is destroyed when switching back.
        // This is safe.
        
        const circle = e.target.closest('.step-circle');
        const name = e.target.closest('.step-name');
        
        if (circle) {
            const step = circle.closest('.stage-step');
            if (step) _handleCircleClick(step);
        } else if (name) {
            const step = name.closest('.stage-step');
            if (step) _handleNameClick(step);
        }
    }

    // 動態注入樣式
    function _injectStyles() {
        const styleId = 'stepper-dynamic-styles';
        if (document.getElementById(styleId)) return;
        
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .stepper-edit-hint {
                background-color: color-mix(in srgb, var(--accent-blue) 15%, var(--primary-bg));
                border: 1px solid var(--accent-blue); color: var(--text-secondary);
                padding: var(--spacing-3) var(--spacing-4); border-radius: var(--rounded-lg);
                margin-bottom: var(--spacing-5); font-size: var(--font-size-sm);
            }
            .stage-step.skipped .step-circle {
                background-color: var(--accent-red); border-color: var(--accent-red); color: white;
            }
            .stage-stepper-container.edit-mode .step-circle {
                cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease;
            }
            .stage-stepper-container.edit-mode .step-circle:hover {
                transform: scale(1.15);
            }
            .stage-stepper-container.edit-mode .step-name {
                cursor: pointer; padding: 2px 5px; border-radius: var(--rounded-sm);
                transition: background-color 0.2s ease;
            }
            .stage-stepper-container.edit-mode .step-name:hover {
                background-color: var(--glass-bg);
            }
            .stage-step.current .step-circle {
                box-shadow: 0 0 0 4px var(--accent-blue);
            }
        `;
        document.head.appendChild(style);
    }
    
    // 公開的初始化方法
    function init(opportunityInfo) {
        _opportunityInfo = opportunityInfo;
        const container = document.getElementById('opportunity-stage-stepper-container');
        if (!container) return;
        
        _injectStyles();
        _renderViewMode();
    }

    // 返回公開的 API
    return {
        init: init
    };
})();