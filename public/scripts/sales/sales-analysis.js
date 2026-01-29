// public/scripts/sales/sales-analysis.js

// 全域狀態管理
let salesAnalysisData = null; 
let salesStartDate = null;
let salesEndDate = null;
let allWonDeals = [];         // 所有的成交案件
let displayedDeals = [];      // 篩選與排序後的案件
let currentSalesModelFilter = 'all';

// 列表狀態
let currentSortState = { field: 'wonDate', direction: 'desc' };
let currentPage = 1;
let rowsPerPage = 10; 

/**
 * 入口函數
 */
async function loadSalesAnalysisPage(startDateISO, endDateISO) {
    const container = document.getElementById('page-sales-analysis');
    if (!container) return;

    // 若沒有傳入日期 (初始載入)，則設為 null (代表全歷史/不篩選)
    if (!startDateISO || !endDateISO) {
        salesStartDate = null;
        salesEndDate = null;
    } else {
        salesStartDate = startDateISO;
        salesEndDate = endDateISO;
    }

    // 1. 注入 CSS
    SalesAnalysisComponents.injectStyles();

    // 2. 渲染基礎骨架
    container.innerHTML = SalesAnalysisComponents.getMainLayout(salesStartDate, salesEndDate);

    // 綁定查詢按鈕事件
    const refreshBtn = document.getElementById('sales-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshSalesAnalysis);
    }

    // 綁定清除篩選按鈕事件
    const clearBtn = document.getElementById('sales-clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearSalesFilter);
    }

    // 3. 獲取數據
    await fetchAndRenderSalesData(salesStartDate, salesEndDate);
}

function refreshSalesAnalysis() {
    const startDateInput = document.getElementById('sales-start-date');
    const endDateInput = document.getElementById('sales-end-date');
    if (!startDateInput || !endDateInput) return;

    const startDate = startDateInput.value;
    const endDate = endDateInput.value;

    if (startDate && endDate) {
        if (startDate <= endDate) {
            document.getElementById('sales-overview-content').innerHTML = '<div class="loading show"><div class="spinner"></div></div>';
            document.getElementById('sales-kpi-content').innerHTML = '';
            document.getElementById('won-deals-content').innerHTML = '<div class="loading show" style="padding: 20px;"><div class="spinner"></div></div>';
            loadSalesAnalysisPage(startDate, endDate);
        } else {
            showNotification('開始日期不能大於結束日期', 'warning');
        }
    } else {
        showNotification('請選擇有效的開始和結束日期', 'warning');
    }
}

function clearSalesFilter() {
    document.getElementById('sales-overview-content').innerHTML = '<div class="loading show"><div class="spinner"></div></div>';
    document.getElementById('sales-kpi-content').innerHTML = '';
    document.getElementById('won-deals-content').innerHTML = '<div class="loading show" style="padding: 20px;"><div class="spinner"></div></div>';
    loadSalesAnalysisPage(null, null);
}

async function fetchAndRenderSalesData(startDate, endDate) {
    try {
        // 處理 null 日期：轉為空字串傳給後端
        const sParam = startDate || '';
        const eParam = endDate || '';
        const result = await authedFetch(`/api/sales-analysis?startDate=${sParam}&endDate=${eParam}`);
        if (!result.success || !result.data) throw new Error(result.error || '無法獲取分析數據');
        
        salesAnalysisData = result.data;
        allWonDeals = salesAnalysisData.wonDeals || [];

        SalesAnalysisComponents.initSalesModelFilterOptions(allWonDeals);
        
        const options = salesAnalysisData.paginationOptions || [10, 20, 50, 100];
        rowsPerPage = options[0];
        SalesAnalysisComponents.initPaginationOptions(options, rowsPerPage);

        sortDeals('wonDate', 'desc');
        displayedDeals = [...allWonDeals];

        updateDashboard(allWonDeals);
        renderPaginatedTable();

        const dRange = document.getElementById('sales-date-range-display');
        if(dRange) {
            if (startDate && endDate) {
                dRange.textContent = `資料期間：${new Date(startDate + 'T00:00:00').toLocaleDateString('zh-TW')} - ${new Date(endDate + 'T00:00:00').toLocaleDateString('zh-TW')}`;
            } else {
                dRange.textContent = `資料期間：全歷史資料`;
            }
        }

    } catch (error) {
        console.error('載入失敗:', error);
        document.getElementById('sales-charts-container').innerHTML = `<div class="alert alert-error">載入失敗: ${error.message}</div>`;
    }
}

function sortDeals(field, direction, sortDisplayedOnly = false) {
    const targetArray = sortDisplayedOnly ? displayedDeals : allWonDeals;
    targetArray.sort((a, b) => {
        let valA, valB;
        if (field === 'wonDate') {
            valA = a.wonDate ? new Date(a.wonDate).getTime() : 0;
            valB = b.wonDate ? new Date(b.wonDate).getTime() : 0;
        } else if (field === 'numericValue') {
            valA = a.numericValue || 0;
            valB = b.numericValue || 0;
        } else return 0;
        return direction === 'asc' ? valA - valB : valB - valA;
    });
    if (!sortDisplayedOnly) displayedDeals = [...allWonDeals];
}

function updateDashboard(deals) {
    const overview = SalesAnalysisHelper.calculateOverview(deals);
    const kpis = SalesAnalysisHelper.calculateKpis(deals);
    SalesAnalysisComponents.renderSalesOverviewAndKpis(overview, kpis);

    const typeData = SalesAnalysisHelper.calculateGroupStats(deals, 'opportunityType', 'value');
    const sourceData = SalesAnalysisHelper.calculateGroupStats(deals, 'opportunitySource', 'value');
    const productData = SalesAnalysisHelper.calculateProductStats(deals);
    const channelData = SalesAnalysisHelper.calculateChannelStats(deals);

    SalesAnalysisComponents.renderAllCharts(typeData, sourceData, productData, channelData);
}

function renderPaginatedTable() {
    const countDisplay = document.getElementById('deals-count-display');
    if (countDisplay) countDisplay.textContent = displayedDeals.length;

    const startIndex = (currentPage - 1) * rowsPerPage;
    const pageDeals = displayedDeals.slice(startIndex, startIndex + rowsPerPage);

    SalesAnalysisComponents.renderWonDealsTable(
        pageDeals, 
        currentPage, 
        rowsPerPage, 
        currentSortState,
        salesAnalysisData.salesModelColors || {},
        salesAnalysisData.eventTypeColors || {}
    );
    SalesAnalysisComponents.updatePaginationControls(currentPage, displayedDeals.length, rowsPerPage);
}

window.handleSalesModelFilterChange = function() {
    const select = document.getElementById('sales-model-filter');
    currentSalesModelFilter = select ? select.value : 'all';
    displayedDeals = currentSalesModelFilter !== 'all' ? allWonDeals.filter(d => d.salesModel === currentSalesModelFilter) : [...allWonDeals];
    sortDeals(currentSortState.field, currentSortState.direction, true);
    currentPage = 1;
    renderPaginatedTable();
    updateDashboard(displayedDeals);
};

window.handleSortTable = function(field) {
    if (currentSortState.field === field) {
        currentSortState.direction = currentSortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortState.field = field;
        currentSortState.direction = 'desc';
    }
    sortDeals(currentSortState.field, currentSortState.direction, true);
    renderPaginatedTable();
};

window.handleRowsPerPageChange = function() {
    const select = document.getElementById('rows-per-page-select');
    if (select) {
        rowsPerPage = parseInt(select.value);
        currentPage = 1; 
        renderPaginatedTable();
    }
};

window.changePage = function(delta) {
    const totalPages = Math.ceil(displayedDeals.length / rowsPerPage);
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        renderPaginatedTable();
    }
};

window.exportSalesToCSV = function() {
    const csvContent = SalesAnalysisHelper.generateCSV(allWonDeals, salesStartDate, salesEndDate);
    if (!csvContent) return;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `成交案件分析_${salesStartDate}_至_${salesEndDate}.csv`;
    link.click();
    showNotification(`已開始下載 CSV`, 'success');
};

if (window.CRM_APP) {
    if (!window.CRM_APP.pageModules) window.CRM_APP.pageModules = {};
    window.CRM_APP.pageModules['sales-analysis'] = loadSalesAnalysisPage;
}