/**
 * public/scripts/companies/company-list.js
 * 職責：管理「公司總覽列表頁」
 * * @version 7.2.0 (Fix: Toast Styles & Double Encoding)
 * * @description 完整包含 CSS 注入 (含 Toast)、路由註冊、雙重編碼刪除邏輯。
 */

// ==================== 全域變數 ====================
let allCompaniesData = [];
let companyListFilters = { type: 'all', stage: 'all', rating: 'all' };
let currentSort = { field: 'lastActivity', direction: 'desc' };

// ==================== 1. 動態樣式注入 (含 Toast 修復) ====================
function _injectCompanyListStyles() {
    // 避免重複注入
    if (document.getElementById('company-list-upgraded-styles')) return;

    const style = document.createElement('style');
    style.id = 'company-list-upgraded-styles';
    style.innerHTML = `
        /* Table Styles */
        .comp-list-container { width: 100%; overflow-x: auto; background: var(--card-bg, #fff); border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .comp-list-table { width: 100%; border-collapse: collapse; min-width: 900px; }
        .comp-list-table th { padding: 12px 16px; text-align: left; background: var(--glass-bg, #f8fafc); color: var(--text-secondary, #64748b); font-weight: 600; font-size: 0.9rem; border-bottom: 1px solid var(--border-color, #e2e8f0); white-space: nowrap; }
        .comp-list-table td { padding: 12px 16px; border-bottom: 1px solid var(--border-color, #e2e8f0); vertical-align: middle; font-size: 0.95rem; color: var(--text-main, #334155); }
        .comp-list-table tr:hover { background-color: var(--glass-bg, #f8fafc); }
        
        /* Badges & Chips */
        .comp-type-chip { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 0.8rem; color: white; font-weight: 500; }
        .comp-status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; color: white; }
        .comp-opp-count { display: inline-block; padding: 2px 8px; border-radius: 6px; background: #f3f4f6; color: #1f2937; font-weight: 700; font-size: 0.85rem; }
        
        /* Sortable Header */
        .comp-list-table th.sortable { cursor: pointer; user-select: none; transition: color 0.2s; }
        .comp-list-table th.sortable:hover { color: var(--accent-blue, #2563eb); }
        
        /* Buttons */
        .btn-mini-delete { background: none; border: none; color: #9ca3af; cursor: pointer; padding: 6px; border-radius: 4px; transition: all 0.2s; }
        .btn-mini-delete:hover { color: #ef4444; background: #fee2e2; }
        
        /* Links */
        .text-link { color: var(--accent-blue, #2563eb); text-decoration: none; font-weight: 500; }
        .text-link:hover { text-decoration: underline; }

        /* ★★★ Critical Fix: Toast Notification Styles ★★★ */
        #toast-container {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .toast {
            min-width: 250px;
            padding: 12px 20px;
            background: #fff;
            color: #333;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            opacity: 0;
            transform: translateY(20px);
            transition: all 0.3s cubic-bezier(0.68, -0.55, 0.27, 1.55);
            border-left: 4px solid #3b82f6; /* Default Blue */
        }
        .toast.show {
            opacity: 1;
            transform: translateY(0);
        }
        .toast-success { border-left-color: #22c55e; }
        .toast-error { border-left-color: #ef4444; }
        .toast-warning { border-left-color: #f59e0b; }
        .toast-info { border-left-color: #3b82f6; }
    `;
    document.head.appendChild(style);
}

// ==================== 2. 核心功能：刪除邏輯 ====================
async function executeDeleteCompany(encodedName) {
    if (!encodedName) return;
    const name = decodeURIComponent(encodedName);
    
    const confirmFunc = window.showConfirmDialog || window.confirmAction || window.confirm;
    
    // 定義實際執行刪除的閉包
    const doDelete = async () => {
        await performDeleteAPI(name);
    };

    if (typeof confirmFunc === 'function' && window.showConfirmDialog) {
        showConfirmDialog(`確定要永久刪除公司「${name}」及其所有關聯資料嗎？`, doDelete);
    } else {
        if (confirm(`(系統提示) 確定要刪除「${name}」嗎？此操作無法復原。`)) {
             doDelete();
        }
    }
}

async function performDeleteAPI(rawName) {
    if (typeof showLoading === 'function') showLoading('正在刪除...');
    
    // ★★★ Critical Fix: 雙重編碼防止 URI malformed ★★★
    const safeName = encodeURIComponent(encodeURIComponent(rawName));

    try {
        const res = await authedFetch(`/api/companies/${safeName}`, { method: 'DELETE' });
        
        const toastFunc = window.showNotification || window.showToast;

        if (res.success) {
            if(toastFunc) toastFunc('刪除成功', 'success');
            else alert('刪除成功');
            await loadCompaniesListPage(); 
        } else {
            throw new Error(res.error || '刪除失敗');
        }
    } catch (e) {
        console.error('[Delete Error]', e);
        const toastFunc = window.showNotification || window.showToast;
        if (e.message !== 'Unauthorized') {
            const msg = `刪除失敗: ${e.message}`;
            if(toastFunc) toastFunc(msg, 'error');
            else alert(msg);
        }
    } finally {
        if (typeof hideLoading === 'function') hideLoading();
    }
}

// ==================== 3. 主頁面載入 ====================
async function loadCompaniesListPage() {
    const container = document.getElementById('page-companies');
    if (!container) return;

    // ★★★ 注入樣式 (含 Toast) ★★★
    _injectCompanyListStyles();

    container.onclick = handleCompanyListClick;
    container.onkeydown = handleCompanyListKeydown;

    // 渲染 UI 骨架
    container.innerHTML = `
        <div id="company-list-root">
            <div id="companies-dashboard-container" class="dashboard-grid-flexible" style="margin-bottom: 24px;">
                <div class="loading show" style="grid-column: span 12;"><div class="spinner"></div><p>載入分析圖表中...</p></div>
            </div>
            <div class="dashboard-widget">
                <div class="widget-header">
                    <div style="display: flex; align-items: baseline; gap: 15px;">
                        <h2 class="widget-title">公司總覽</h2>
                        <span style="font-size: 0.9rem; color: var(--text-muted);">共 <span id="companies-count-display">0</span> 筆</span>
                    </div>
                </div>
                
                <div class="search-pagination" style="padding: 0 1.5rem 1rem; display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; position: relative;">
                    <input type="text" class="search-box" id="company-list-search" placeholder="搜尋公司名稱..." style="flex-grow: 1;">
                    
                    <button class="action-btn small primary" data-action="toggle-quick-create" data-show="true" id="btn-toggle-create" style="flex-shrink: 0; display: flex; align-items: center; gap: 4px;">
                        <span style="font-size: 1.2em; line-height: 1;">+</span> 快速新增
                    </button>

                    <div id="company-list-filters" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <select id="company-type-filter" class="form-select-sm" data-filter="type"><option value="all">所有類型</option></select>
                        <select id="company-stage-filter" class="form-select-sm" data-filter="stage"><option value="all">所有階段</option></select>
                        <select id="company-rating-filter" class="form-select-sm" data-filter="rating"><option value="all">所有評級</option></select>
                    </div>
                </div>

                <div id="company-quick-create-card" style="display: none; margin: 0 1.5rem 1.5rem; padding: 1.25rem; background-color: var(--secondary-bg); border: 2px solid var(--accent-blue); border-radius: var(--rounded-lg); box-shadow: 0 4px 12px rgba(0,0,0,0.1); animation: slideDown 0.3s ease-out;">
                    <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
                        <div style="font-weight: 700; color: var(--accent-blue); display: flex; align-items: center; gap: 0.5rem; white-space: nowrap;">
                            <span style="font-size: 1.2rem;">🏢</span> 新增公司
                        </div>
                        <input type="text" id="quick-create-name-input" class="form-input" placeholder="請輸入完整公司名稱" style="flex-grow: 1; min-width: 250px; background: var(--primary-bg);">
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="action-btn secondary small" data-action="toggle-quick-create" data-show="false">取消</button>
                            <button class="action-btn primary small" data-action="submit-quick-create">🚀 建立並前往</button>
                        </div>
                    </div>
                </div>

                <div id="companies-list-content" class="widget-content" style="padding: 0;">
                    <div class="loading show"><div class="spinner"></div><p>載入公司列表中...</p></div>
                </div>
            </div>
        </div>
    `;

    try {
        const [dashboardResult, listResult, oppsResult, systemConfigResult] = await Promise.all([
            authedFetch(`/api/companies/dashboard`),
            authedFetch(`/api/companies`), 
            authedFetch(`/api/opportunities?page=0`), 
            authedFetch(`/api/config`) 
        ]);

        if (systemConfigResult) {
            window.CRM_APP = window.CRM_APP || {};
            window.CRM_APP.systemConfig = systemConfigResult;
            populateFilterOptions('company-type-filter', systemConfigResult['公司類型'], '所有類型');
            populateFilterOptions('company-stage-filter', systemConfigResult['客戶階段'], '所有階段');
            populateFilterOptions('company-rating-filter', systemConfigResult['互動評級'], '所有評級');
            
            document.querySelectorAll('#company-list-filters select').forEach(select => {
                select.addEventListener('change', handleCompanyFilterChange);
            });
        }

        if (dashboardResult.success && dashboardResult.data.chartData) {
            renderCompaniesDashboardCharts(dashboardResult.data.chartData);
        }

        if (listResult.success) {
            const companies = listResult.data || [];
            const allOpps = oppsResult || [];
            
            const oppCountMap = new Map();
            allOpps.forEach(opp => {
                const companyName = opp.customerCompany;
                if (companyName) oppCountMap.set(companyName, (oppCountMap.get(companyName) || 0) + 1);
            });

            allCompaniesData = companies.map(c => ({ ...c, opportunityCount: oppCountMap.get(c.companyName) || 0 }));
            filterAndRenderCompanyList();

            const searchInput = document.getElementById('company-list-search');
            if (searchInput) searchInput.addEventListener('keyup', handleCompanyListSearch);
        } else {
             throw new Error(listResult.error || '無法獲取公司列表');
        }

    } catch (error) {
        if (error.message !== 'Unauthorized') {
            const contentDiv = document.getElementById('companies-list-content');
            if (contentDiv) contentDiv.innerHTML = `<div class="alert alert-error">載入公司列表失敗: ${error.message}</div>`;
        }
    }
}

// ==================== 4. 事件處理與輔助函式 ====================

function handleCompanyListClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const payload = btn.dataset;
    e.stopPropagation();

    switch (action) {
        case 'sort': handleCompanySort(payload.field); break;
        case 'toggle-quick-create': toggleQuickCreateCard(payload.show === 'true'); break;
        case 'submit-quick-create': submitQuickCreateCompany(); break;
        case 'delete-company': executeDeleteCompany(payload.name).catch(console.error); break;
        case 'navigate':
            e.preventDefault();
            let params = {};
            if (payload.params) {
                try { params = JSON.parse(payload.params); } catch (err) { }
            }
            if (window.CRM_APP && window.CRM_APP.navigateTo) {
                CRM_APP.navigateTo(payload.page, params);
            } else if (window.router) {
                window.router.push(`/companies/${encodeURIComponent(params.companyName)}/details`);
            }
            break;
    }
}

function handleCompanyListKeydown(e) {
    if (e.target.id === 'quick-create-name-input' && e.key === 'Enter') submitQuickCreateCompany();
}

function filterAndRenderCompanyList() {
    const query = document.getElementById('company-list-search')?.value.toLowerCase() || '';
    const { type, stage, rating } = companyListFilters;
    const countDisplay = document.getElementById('companies-count-display');

    let filtered = allCompaniesData.filter(c => {
        const nameMatch = query ? (c.companyName || '').toLowerCase().includes(query) : true;
        const typeMatch = type === 'all' ? true : c.companyType === type;
        const stageMatch = stage === 'all' ? true : c.customerStage === stage;
        const ratingMatch = rating === 'all' ? true : c.engagementRating === rating;
        return nameMatch && typeMatch && stageMatch && ratingMatch;
    });

    filtered.sort((a, b) => {
        let valA = a[currentSort.field];
        let valB = b[currentSort.field];
        const valAStr = String(valA || '');
        const valBStr = String(valB || '');
        
        if (currentSort.field === 'lastActivity') {
             const tA = new Date(valA || 0).getTime();
             const tB = new Date(valB || 0).getTime();
             return currentSort.direction === 'asc' ? tA - tB : tB - tA;
        }
        
        return currentSort.direction === 'asc' 
            ? valAStr.localeCompare(valBStr, 'zh-Hant') 
            : valBStr.localeCompare(valAStr, 'zh-Hant');
    });

    if (countDisplay) countDisplay.textContent = filtered.length;
    const listContent = document.getElementById('companies-list-content');
    if (listContent) listContent.innerHTML = renderCompaniesTable(filtered);
}

function renderCompaniesTable(companies) {
    if (!companies.length) return '<div class="alert alert-info" style="margin:2rem; text-align:center;">找不到符合條件的公司資料</div>';

    const systemConfig = window.CRM_APP?.systemConfig || {};
    const typeColors = new Map((systemConfig['公司類型'] || []).map(t => [t.value, t.color]));
    const stageColors = new Map((systemConfig['客戶階段'] || []).map(t => [t.value, t.color]));
    const ratingColors = new Map((systemConfig['互動評級'] || []).map(t => [t.value, t.color]));

    const renderSortHeader = (field, label) => {
        let icon = '↕';
        if (currentSort.field === field) icon = currentSort.direction === 'asc' ? '↑' : '↓';
        return `<th class="sortable" data-action="sort" data-field="${field}">${label} <span>${icon}</span></th>`;
    };

    let html = `<div class="comp-list-container"><table class="comp-list-table"><thead><tr>
                    <th style="width:60px;text-align:center;">項次</th>
                    ${renderSortHeader('lastActivity', '最後活動')}
                    <th>公司類型</th>
                    ${renderSortHeader('companyName', '公司名稱')}
                    ${renderSortHeader('opportunityCount', '機會數')}
                    <th>客戶階段</th>
                    <th>互動評級</th>
                    <th style="width:80px;text-align:center;">操作</th>
                </tr></thead><tbody>`;

    companies.forEach((c, i) => {
        const typeColor = typeColors.get(c.companyType) || '#9ca3af';
        const stageColor = stageColors.get(c.customerStage) || '#6b7280';
        const ratingColor = ratingColors.get(c.engagementRating) || '#6b7280';
        const encodedName = encodeURIComponent(c.companyName || '');
        const navParams = JSON.stringify({ companyName: c.companyName || '' }).replace(/'/g, "&apos;").replace(/"/g, '&quot;');

        html += `
            <tr>
                <td style="text-align:center;color:var(--text-muted);">${i + 1}</td>
                <td style="white-space:nowrap;">${c.lastActivity ? new Date(c.lastActivity).toLocaleDateString() : '-'}</td>
                <td><span class="comp-type-chip" style="background:${typeColor}">${c.companyType || '未分類'}</span></td>
                <td>
                    <a href="#" class="text-link" data-action="navigate" data-page="company-details" data-params="${navParams}">
                        <strong>${c.companyName || '-'}</strong>
                    </a>
                </td>
                <td style="text-align:center;"><span class="comp-opp-count">${c.opportunityCount}</span></td>
                <td><span class="comp-status-badge" style="background:${stageColor}">${c.customerStage || '-'}</span></td>
                <td><span class="comp-status-badge" style="background:${ratingColor}">${c.engagementRating || '-'}</span></td>
                <td style="text-align:center;">
                    <button class="btn-mini-delete" title="刪除公司" data-action="delete-company" data-name="${encodedName}">
                        🗑️
                    </button>
                </td>
            </tr>`;
    });
    return html + '</tbody></table></div>';
}

function toggleQuickCreateCard(show) {
    const card = document.getElementById('company-quick-create-card');
    const input = document.getElementById('quick-create-name-input');
    const btn = document.getElementById('btn-toggle-create');
    if (!card) return;
    if (show) {
        card.style.display = 'block';
        if(btn) btn.style.display = 'none';
        if (input) { input.value = ''; setTimeout(() => input.focus(), 100); }
    } else {
        card.style.display = 'none';
        if(btn) btn.style.display = 'flex';
    }
}

async function submitQuickCreateCompany() {
    const input = document.getElementById('quick-create-name-input');
    const name = input?.value.trim();
    const toastFunc = window.showNotification || window.showToast;
    
    if (!name) { 
        if(toastFunc) toastFunc('請輸入公司名稱', 'warning'); 
        else alert('請輸入公司名稱');
        if(input) input.focus(); 
        return; 
    }
    
    if (typeof showLoading === 'function') showLoading('建立中...');
    try {
        const res = await authedFetch('/api/companies', { method: 'POST', body: JSON.stringify({ companyName: name }) });
        if (typeof hideLoading === 'function') hideLoading();
        
        if (res.success) {
            if(toastFunc) toastFunc('建立成功！', 'success');
            else alert('建立成功！');
            
            toggleQuickCreateCard(false);
            if (window.CRM_APP && window.CRM_APP.navigateTo) {
                CRM_APP.navigateTo('company-details', { companyName: encodeURIComponent(res.data.companyName || res.data.name) });
            } else if (window.router) {
                window.router.push(`/companies/${encodeURIComponent(res.data.companyName || res.data.name)}/details`);
            }
        } else if (res.reason === 'EXISTS') {
            if(confirm(`公司「${name}」已存在，是否直接前往查看？`)) {
                if (window.CRM_APP && window.CRM_APP.navigateTo) {
                    CRM_APP.navigateTo('company-details', { companyName: encodeURIComponent(res.data.companyName || res.data.name) });
                }
            }
        } else { 
            if(toastFunc) toastFunc(res.error || '建立失敗', 'error'); 
            else alert(res.error || '建立失敗');
        }
    } catch (e) { 
        if (typeof hideLoading === 'function') hideLoading();
        if (e.message !== 'Unauthorized') {
            const msg = '建立失敗: ' + e.message;
            if(toastFunc) toastFunc(msg, 'error'); 
            else alert(msg);
        }
    }
}

function populateFilterOptions(selectId, options, defaultText) {
    const el = document.getElementById(selectId);
    if (!el) return;
    el.innerHTML = `<option value="all">${defaultText}</option>` + (options || []).map(opt => `<option value="${opt.value}">${opt.note || opt.value}</option>`).join('');
}

function handleCompanyFilterChange(e) { companyListFilters[e.target.dataset.filter] = e.target.value; filterAndRenderCompanyList(); }
function handleCompanyListSearch() { 
    if (typeof handleSearch === 'function') handleSearch(() => filterAndRenderCompanyList()); 
    else filterAndRenderCompanyList();
}
function handleCompanySort(f) { if (currentSort.field === f) { currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc'; } else { currentSort.field = f; currentSort.direction = 'desc'; } filterAndRenderCompanyList(); }

function renderCompaniesDashboardCharts(chartData) {
    const container = document.getElementById('companies-dashboard-container');
    if (!container) return;
    container.innerHTML = `<div class="dashboard-widget grid-col-3"><div class="widget-header"><h2 class="widget-title">公司新增趨勢</h2></div><div id="company-trend-chart" class="widget-content" style="height: 250px;"></div></div><div class="dashboard-widget grid-col-3"><div class="widget-header"><h2 class="widget-title">公司類型分佈</h2></div><div id="company-type-chart" class="widget-content" style="height: 250px;"></div></div><div class="dashboard-widget grid-col-3"><div class="widget-header"><h2 class="widget-title">客戶階段分佈</h2></div><div id="customer-stage-chart" class="widget-content" style="height: 250px;"></div></div><div class="dashboard-widget grid-col-3"><div class="widget-header"><h2 class="widget-title">互動評級</h2></div><div id="engagement-rating-chart" class="widget-content" style="height: 250px;"></div></div>`;
    
    const cfg = window.CRM_APP?.systemConfig;
    const typeMap = new Map((cfg?.['公司類型'] || []).map(i => [i.value, i.note]));
    const stageMap = new Map((cfg?.['客戶階段'] || []).map(i => [i.value, i.note]));
    const ratingMap = new Map((cfg?.['互動評級'] || []).map(i => [i.value, i.note]));
    
    setTimeout(() => {
        if (typeof Highcharts !== 'undefined' && chartData) {
            renderCompanyTrendChart(chartData.trend);
            const renderChart = (typeof createThemedChart === 'function') ? createThemedChart : (id, opts) => Highcharts.chart(id, opts);
            
            renderChart('company-type-chart', getCompanyPieChartOptions('類型', chartData.type, 'companyType', typeMap));
            renderChart('customer-stage-chart', getCompanyPieChartOptions('階段', chartData.stage, 'customerStage', stageMap));
            renderChart('engagement-rating-chart', getCompanyBarChartOptions('評級', chartData.rating, 'engagementRating', ratingMap));
        }
    }, 0);
}

function renderCompanyTrendChart(data) { 
    const renderChart = (typeof createThemedChart === 'function') ? createThemedChart : (id, opts) => Highcharts.chart(id, opts);
    renderChart('company-trend-chart', { chart: { type: 'line' }, title: { text: '' }, xAxis: { categories: (data || []).map(d => d[0]?.substring(5) || '') }, yAxis: { title: { text: '數量' }, allowDecimals: false }, legend: { enabled: false }, series: [{ name: '新增公司數', data: (data || []).map(d => d[1] || 0) }] }); 
}
function getCompanyPieChartOptions(n, d, k, m) { return { chart: { type: 'pie' }, title: { text: '' }, tooltip: { pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b> ({point.y} 家)' }, plotOptions: { pie: { allowPointSelect: true, cursor: 'pointer', dataLabels: { enabled: true, format: '<b>{point.name}</b>: {point.percentage:.1f} %', distance: 20 }, point: { events: { click: function() { handleCompanyChartClick(this, k); } } } } }, series: [{ name: '家數', data: (d || []).map(item => ({ name: m.get(item.name) || item.name || '未分類', y: item.y || 0, internalValue: item.name })) }] }; }
function getCompanyBarChartOptions(n, d, k, m) { const chartD = (d || []).map(item => ({ name: m.get(item.name) || item.name || '未分類', y: item.y || 0, internalValue: item.name })); return { chart: { type: 'bar' }, title: { text: '' }, xAxis: { categories: chartD.map(item => item.name), title: { text: null } }, yAxis: { min: 0, title: { text: '公司數量', align: 'high' }, allowDecimals: false }, legend: { enabled: false }, series: [{ name: '數量', data: chartD }], plotOptions: { bar: { cursor: 'pointer', point: { events: { click: function() { handleCompanyChartClick(this, k, true); } } } } } }; }
function handleCompanyChartClick(p, k, b=false) { const val = b ? p.options.internalValue : p.internalValue; const sel = document.getElementById(`company-${k.replace('company', '').toLowerCase()}-filter`); if (!sel) return; if (p.selected) { companyListFilters[k] = 'all'; sel.value = 'all'; p.select(false, true); } else { companyListFilters[k] = val; sel.value = val; p.select(true, true); } filterAndRenderCompanyList(); }

// Router Registration
window.loadCompaniesPage = loadCompaniesListPage;
if (window.CRM_APP) {
    if (!window.CRM_APP.pageModules) window.CRM_APP.pageModules = {};
    window.CRM_APP.pageModules.companies = loadCompaniesListPage;
    console.log('✅ [CompanyList] Module registered');
}