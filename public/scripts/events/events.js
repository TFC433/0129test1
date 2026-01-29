// views/scripts/events.js (重構後的主控制器)

// 全域變數，用於跨模組共享數據
let eventLogPageData = {
    eventList: [],
    chartData: {}
};

/**
 * 載入並渲染事件紀錄頁面的主函式
 * 這是此頁面的唯一入口點
 */
async function loadEventLogsPage() {
    const dashboardContainer = document.getElementById('event-log-dashboard-container');
    const listContainer = document.getElementById('event-log-list-container');
    
    // 顯示載入中的畫面
    if(dashboardContainer) dashboardContainer.innerHTML = '<div class="loading show"><div class="spinner"></div></div>';
    if(listContainer) listContainer.innerHTML = '<div class="loading show"><div class="spinner"></div><p>載入紀錄中...</p></div>';
    
    try {
        // 一次性獲取所有頁面需要的資料
        const result = await authedFetch('/api/events/dashboard');
        if (!result.success) throw new Error(result.details || '讀取資料失敗');
        
        eventLogPageData = result.data;

        // 協調呼叫各個模組進行渲染
        renderEventsDashboardCharts(dashboardContainer, eventLogPageData.chartData);
        renderEventLogList(listContainer, eventLogPageData.eventList);

    } catch (error) {
        if (error.message !== 'Unauthorized') {
            console.error('❌ 載入事件紀錄頁面失敗:', error);
            if(dashboardContainer) dashboardContainer.innerHTML = '';
            if(listContainer) listContainer.innerHTML = `<div class="alert alert-error">讀取事件列表失敗: ${error.message}</div>`;
        }
    }
}

// ==================== 快捷方式與模組註冊 ====================

// 為了讓系統中其他地方的按鈕（如頁首）可以呼叫，保留全域函式
function showEventLogForCreation() {
    // 呼叫彈窗管理模組的函式
    showEventLogFormModal();
}

function showEventLogModalByOpp(opportunityId, opportunityName) {
    showEventLogFormModal({ opportunityId, opportunityName });
}

// 向主應用程式註冊此模組
if (window.CRM_APP) {
    window.CRM_APP.pageModules.events = loadEventLogsPage;
}