/**
 * public/scripts/services/ui.js
 * * 職責：管理所有全域 UI 元素，如彈窗、通知、面板、載入畫面和共用元件渲染器
 * * @version 6.1.7 (Hotfix: Restore renderPagination)
 * * @date 2026-01-23
 * @description
 * 1. 新增功能：名片預覽圖可點擊開啟 Google Drive 原檔 (Zoom In)。
 * 2. [鑑識修復] 補回 window.showNotification 與 window.showConfirmDialog 對應，解決前端 ReferenceError。
 * 3. [鑑識修復] 補回 window.renderPagination，解決互動頁面分頁 ReferenceError。
 */

// 【修改】將起始層級提高到 3000，確保系統彈窗永遠蓋在應用程式畫面(包含獨立編輯器)之上
let zIndexCounter = 3000;

// Global variable to store the callback for the confirm dialog
window.confirmActionCallback = null;
let currentPreviewDriveLink = null;

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        zIndexCounter++; // Increment z-index for the new modal
        modal.style.zIndex = zIndexCounter; // Apply it
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
        console.log(`[UI] Modal shown: #${modalId} (z-index: ${zIndexCounter})`);
    } else {
        console.error(`[UI] Error: Modal with ID "${modalId}" not found.`);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        console.log(`[UI] Modal closed: #${modalId}`);
        const anyModalOpen = document.querySelector('.modal[style*="display: block"]');
        if (!anyModalOpen) {
            document.body.style.overflow = ''; // Restore background scrolling only if no other modals are open
            console.log('[UI] Restored body scroll.');
        }
    }
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    // Trigger reflow for animation
    void toast.offsetWidth;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

function showLoading(message = '載入中...') {
    const overlay = document.getElementById('loading-overlay');
    const text = document.getElementById('loading-text');
    if (overlay && text) {
        text.textContent = message;
        overlay.style.display = 'flex';
        console.log(`[UI] Loading shown: ${message}`);
    }
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        console.log('[UI] Loading hidden.');
    }
}

function confirmAction(message, callback) {
    const modal = document.getElementById('confirm-modal');
    const msgElement = document.getElementById('confirm-message');
    const confirmBtn = document.getElementById('btn-confirm-yes');

    if (modal && msgElement && confirmBtn) {
        msgElement.textContent = message;

        // Remove existing listener to prevent multiple firings
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

        newBtn.addEventListener('click', () => {
            closeModal('confirm-modal');
            if (callback) callback();
        });

        showModal('confirm-modal');
    } else {
        // Fallback if modal elements are missing
        if (confirm(message)) {
            if (callback) callback();
        }
    }
}

/**
 * 渲染狀態標籤 (Chip)
 * @param {string} status - 狀態文字
 * @returns {string} HTML string
 */
function renderStatusChip(status) {
    if (!status) return '';

    // 定義狀態顏色映射 (可根據需求擴充)
    const statusColors = {
        'New': 'bg-blue-100 text-blue-800',
        'Contacted': 'bg-yellow-100 text-yellow-800',
        'Qualified': 'bg-green-100 text-green-800',
        'Lost': 'bg-red-100 text-red-800',
        'Won': 'bg-purple-100 text-purple-800',
        'Pending': 'bg-gray-100 text-gray-800'
    };

    const colorClass = statusColors[status] || 'bg-gray-100 text-gray-800';
    return `<span class="px-2 py-1 rounded-full text-xs font-medium ${colorClass}">${status}</span>`;
}

/**
 * 渲染優先級標籤
 * @param {string} priority
 * @returns {string} HTML
 */
function renderPriorityChip(priority) {
    if (!priority) return '';

    const priorityColors = {
        'High': 'text-red-600 font-bold',
        'Medium': 'text-yellow-600 font-medium',
        'Low': 'text-green-600'
    };

    const classStr = priorityColors[priority] || 'text-gray-500';
    return `<span class="${classStr}">${priority}</span>`;
}

// -----------------------------------------------------
// ⚠️ 以下為本次修復的核心區域：名片預覽功能 (v6.1.5)
// -----------------------------------------------------

/**
 * 顯示名片預覽 (v6.1.5 Refactored)
 * * @version 6.1.5
 * @description
 * 1. 使用後端串流 (/api/drive/thumbnail) 取得高清圖。
 * 2. 圖片可點擊 (Wrap in <a>)，在新分頁開啟 Google Drive 原檔。
 * 3. 自動適應視窗大小，無卷軸。
 */
async function showBusinessCardPreview(driveLink) {
    // 1. 狀態鎖定
    currentPreviewDriveLink = driveLink;

    const contentArea = document.getElementById('business-card-preview-content');
    const modalId = 'business-card-preview-modal';

    if (!contentArea) {
        console.error('[UI] 系統錯誤：找不到預覽容器 #business-card-preview-content');
        showToast('無法開啟預覽：UI 元件缺失', 'error');
        return;
    }

    // 2. 顯示 Loading
    contentArea.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem;">
            <div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p style="margin-top: 1rem; color: #666; font-size: 0.9rem;">正在讀取高清影像...</p>
        </div>
    `;

    // 3. 開啟 Modal
    showModal(modalId);

    // 4. 準備 URL
    const proxyUrl = `/api/drive/thumbnail?link=${encodeURIComponent(driveLink)}`;
    const img = new Image();

    // 5. 載入成功處理
    img.onload = () => {
        if (currentPreviewDriveLink !== driveLink) return;

        contentArea.innerHTML = ''; // 清除 Loading

        // --- 建立點擊連結 (<a> Wrapper) ---
        const linkWrapper = document.createElement('a');
        linkWrapper.href = driveLink;   // 指向 Google Drive 原檔
        linkWrapper.target = '_blank';  // 開啟新分頁
        linkWrapper.title = '點擊開啟原始檔案 (Google Drive)';
        linkWrapper.style.display = 'block';
        linkWrapper.style.textAlign = 'center';
        linkWrapper.style.cursor = 'zoom-in'; // 游標變更為放大鏡

        // --- 圖片樣式設定 ---
        img.style.maxWidth = '100%';
        img.style.maxHeight = '70vh'; // 留白給標題與下方提示
        img.style.width = 'auto';
        img.style.height = 'auto';
        img.style.objectFit = 'contain';
        img.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        img.style.borderRadius = '4px';
        img.style.border = '1px solid #eee';

        // --- 組合元素 ---
        linkWrapper.appendChild(img);
        contentArea.appendChild(linkWrapper);

        // --- 加入下方提示文字 ---
        const hint = document.createElement('div');
        hint.innerHTML = '<small style="color: #888; margin-top: 8px; display: block;"><i class="fas fa-external-link-alt"></i> 點擊圖片可開啟原檔</small>';
        hint.style.textAlign = 'center';
        contentArea.appendChild(hint);

        console.log('[UI] 名片預覽載入成功 (Stream Mode + Link)');
    };

    // 6. 載入失敗處理
    img.onerror = () => {
        if (currentPreviewDriveLink !== driveLink) return;
        console.warn('[UI] 名片預覽載入失敗');

        contentArea.innerHTML = `
            <div class="alert alert-warning" style="text-align: center; margin: 1rem;">
                <p><strong>預覽載入失敗</strong></p>
                <p class="text-muted small">無法直接顯示此圖片。</p>
                <a href="${driveLink}" target="_blank" class="btn btn-primary btn-sm mt-2">
                    <i class="fas fa-external-link-alt"></i> 開啟 Google Drive 原檔
                </a>
            </div>
        `;
    };

    // 7. 觸發載入
    img.src = proxyUrl;
}

function closeBusinessCardPreview() {
    currentPreviewDriveLink = null;

    const contentArea = document.getElementById('business-card-preview-content');

    // 清理可能殘留的 iframe (舊版相容)
    const iframe = document.getElementById('business-card-iframe');
    if (iframe) {
        iframe.src = 'about:blank';
        iframe.remove();
    }

    // 清理圖片與內容
    if (contentArea) {
        contentArea.innerHTML = '';
    }

    closeModal('business-card-preview-modal');
}

/**
 * 渲染分頁元件 (Adapter for legacy calls)
 * - 目的：補回 interactions.js 等頁面腳本依賴的全域 renderPagination
 * - 設計：不假設 callback 的參數格式，只保證「至少傳 page」；
 *         若 callback 接受更多參數，它自己可從 DOM 讀取（例如搜尋框）。
 *
 * @param {string} containerId - 容器 ID
 * @param {object} pagination - 分頁物件 { current, total, totalItems, hasNext, hasPrev }
 * @param {string} callbackName - 全域回呼函式名稱 (e.g. 'loadAllInteractionsPage')
 */
function renderPagination(containerId, pagination, callbackName) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!pagination || !pagination.totalItems || pagination.totalItems <= 0) {
        container.innerHTML = '';
        return;
    }

    const current = Number(pagination.current) || 1;
    const total = Number(pagination.total) || 1;
    const hasNext = !!pagination.hasNext;
    const hasPrev = !!pagination.hasPrev;

    // 建立 DOM（避免 inline onclick 字串拼接造成注入/跳脫問題）
    container.innerHTML = `
        <div class="pagination-wrap" style="display:flex; gap:12px; align-items:center; justify-content:center;">
            <button type="button" class="pagination-btn" id="${containerId}-prev" ${hasPrev ? '' : 'disabled'}>
                <i class="fas fa-chevron-left"></i> 上一頁
            </button>
            <span class="pagination-info">第 ${current} 頁 / 共 ${total} 頁</span>
            <button type="button" class="pagination-btn" id="${containerId}-next" ${hasNext ? '' : 'disabled'}>
                下一頁 <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;

    const prevBtn = document.getElementById(`${containerId}-prev`);
    const nextBtn = document.getElementById(`${containerId}-next`);

    const invoke = (page) => {
        const fn = window[callbackName];
        if (typeof fn !== 'function') {
            console.warn(`[UI] renderPagination: callback "${callbackName}" not found on window.`);
            return;
        }
        // 只保證傳 page；其他參數由 callback 自行從 DOM 取得（最不回歸）
        fn(page);
    };

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (!hasPrev) return;
            invoke(Math.max(1, current - 1));
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (!hasNext) return;
            invoke(Math.min(total, current + 1));
        });
    }
}

// =======================================================
// [Critical Fix] Adapter Layer for Legacy Compatibility
// 解決 company-list.js 等模組呼叫 showNotification 失敗的問題
// =======================================================

// Native Exports
window.showModal = showModal;
window.closeModal = closeModal;
window.showToast = showToast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.confirmAction = confirmAction;
window.renderStatusChip = renderStatusChip;
window.renderPriorityChip = renderPriorityChip;
window.showBusinessCardPreview = showBusinessCardPreview;
window.closeBusinessCardPreview = closeBusinessCardPreview;

// [Fix] Export pagination renderer (for interactions.js)
window.renderPagination = renderPagination;

// Legacy Aliases (The Fix)
window.showNotification = showToast;         // Map showNotification to showToast
window.showConfirmDialog = confirmAction;    // Map showConfirmDialog to confirmAction

console.log('[UI] UI Services loaded with legacy adapters (showNotification, showConfirmDialog, renderPagination).');
