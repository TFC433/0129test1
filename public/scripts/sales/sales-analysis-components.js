// public/scripts/sales/sales-analysis-components.js

const SalesAnalysisComponents = {
    _icons: {
        money: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`,
        check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
        avg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="5" x2="5" y2="19"></line><circle cx="6.5" cy="6.5" r="2.5"></circle><circle cx="17.5" cy="17.5" r="2.5"></circle></svg>`,
        cycle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`
    },

    injectStyles: function() {
        const styleId = 'sales-analysis-custom-style';
        let style = document.getElementById(styleId);
        
        if (style) {
            // [修正] 如果樣式已存在，將其移到 head 最末端以確保在 SPA 切換時的優先權
            document.head.appendChild(style);
            return;
        }

        style = document.createElement('style');
        style.id = styleId;
        // [修正] 增加 #page-sales-analysis 前綴提升權重，防止被其他頁面的 .stat-card 樣式覆蓋
        style.innerHTML = `
            #page-sales-analysis .stat-card.solid-fill { border-left: none !important; color: white !important; transition: transform 0.2s ease; }
            #page-sales-analysis .stat-card.solid-fill:hover { transform: translateY(-5px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.15); }
            #page-sales-analysis .stat-card.solid-fill.solid-green:hover { background-color: #10b981 !important; }
            #page-sales-analysis .stat-card.solid-fill.solid-teal:hover { background-color: #0d9488 !important; }
            #page-sales-analysis .stat-card.solid-fill.solid-blue:hover { background-color: #3b82f6 !important; }
            #page-sales-analysis .stat-card.solid-fill.solid-purple:hover { background-color: #8b5cf6 !important; }
            #page-sales-analysis .stat-card.solid-fill .stat-label, 
            #page-sales-analysis .stat-card.solid-fill .stat-number, 
            #page-sales-analysis .stat-card.solid-fill .stat-icon { color: white !important; }
            #page-sales-analysis .stat-card.solid-fill .stat-icon { background: rgba(255, 255, 255, 0.2) !important; }
            #page-sales-analysis .solid-green { background-color: #10b981 !important; }
            #page-sales-analysis .solid-teal { background-color: #0d9488 !important; }
            #page-sales-analysis .solid-blue { background-color: #3b82f6 !important; }
            #page-sales-analysis .solid-purple { background-color: #8b5cf6 !important; }
            #page-sales-analysis .stat-card.orange { border-left-color: #f97316; }
            .sales-chip { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 0.85rem; color: white; white-space: nowrap; }
            .type-chip { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 0.85rem; color: white; white-space: nowrap; }
            .channel-chip { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.85rem; border: 1px solid #e5e7eb; background-color: #f9fafb; color: #374151; }
            .custom-select-control { background-color: #f3f4f6; border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
            .sortable-header { cursor: pointer; user-select: none; }
            .sort-icon { margin-left: 4px; font-size: 0.8em; color: #9ca3af; }
            .pagination-container { display: flex; align-items: center; justify-content: center; gap: 15px; margin-top: 20px; }
            .page-btn { padding: 6px 12px; border: 1px solid #d1d5db; border-radius: 6px; background-color: white; cursor: pointer; }
            @media (min-width: 1000px) { .four-charts-row { display: grid !important; grid-template-columns: repeat(4, 1fr) !important; gap: 16px; } }
        `;
        document.head.appendChild(style);
    },

    getMainLayout: function(start, end) {
        // 若 start/end 為 null 或空值，則不填入 input value
        const sVal = start || '';
        const eVal = end || '';
        const rangeText = (start && end) ? `${start} - ${end}` : '全歷史資料';

        return `
            <div class="dashboard-widget">
                <div class="widget-header" style="align-items: flex-start;">
                    <div><h2 class="widget-title">績效概覽</h2><p id="sales-date-range-display" style="color: var(--text-muted); font-size: 0.9rem; margin-top: 5px;">資料期間：${rangeText}</p></div>
                    <div style="display: flex; gap: 15px; align-items: center; flex-wrap: wrap;">
                        <div class="form-group" style="margin-bottom: 0;"><label class="form-label" style="font-size: 0.8rem;">開始日期</label><input type="date" id="sales-start-date" class="form-input form-input-sm" value="${sVal}"></div>
                        <div class="form-group" style="margin-bottom: 0;"><label class="form-label" style="font-size: 0.8rem;">結束日期</label><input type="date" id="sales-end-date" class="form-input form-input-sm" value="${eVal}"></div>
                        <div style="display:flex; gap:10px; margin-top: 20px;">
                            <button id="sales-refresh-btn" class="action-btn primary" style="height: 40px;">查詢</button>
                            <button id="sales-clear-btn" class="action-btn secondary" style="height: 40px;">清除篩選</button>
                        </div>
                    </div>
                </div>
                <div id="sales-overview-content" class="widget-content"><div class="loading show"><div class="spinner"></div></div></div>
                <div id="sales-kpi-content" class="widget-content" style="margin-top: 16px;"></div>
            </div>
            <div id="sales-charts-container" class="dashboard-grid-flexible four-charts-row" style="margin-top: 24px; display:block;"></div>
            <div class="dashboard-widget" style="margin-top: 24px;">
                <div class="widget-header" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; padding-bottom: 15px; border-bottom: 1px solid var(--border-color); gap: 15px;">
                    <div style="display: flex; align-items: baseline; gap: 15px;"><h2 class="widget-title">成交案件列表</h2><span style="font-size: 0.9rem; color: var(--text-muted);">共 <span id="deals-count-display">0</span> 筆</span></div>
                    <div style="display: flex; gap: 15px; align-items: center;">
                        <button class="action-btn secondary" onclick="exportSalesToCSV()">匯出 CSV</button>
                        <select id="rows-per-page-select" class="custom-select-control" onchange="handleRowsPerPageChange()"></select>
                        <select id="sales-model-filter" class="custom-select-control" onchange="handleSalesModelFilterChange()"><option value="all">全部商流</option></select>
                    </div>
                </div>
                <div id="won-deals-content" class="widget-content" style="padding: 0;"></div>
                <div id="pagination-container" class="pagination-container" style="display: none;">
                    <button class="page-btn" onclick="changePage(-1)" id="btn-prev-page">上一頁</button><span class="page-info" id="page-info-display"></span><button class="page-btn" onclick="changePage(1)" id="btn-next-page">下一頁</button>
                </div>
            </div>
        `;
    },

    renderSalesOverviewAndKpis: function(ov, kpis) {
        const container = document.getElementById('sales-overview-content');
        const kpiContainer = document.getElementById('sales-kpi-content');
        if(!container || !kpiContainer) return;

        const fmtM = v => (v||0).toLocaleString('zh-TW', {style:'currency', currency:'TWD', minimumFractionDigits:0});
        
        container.innerHTML = `
            <div class="stats-grid" style="grid-template-columns: repeat(4, 1fr);"> 
                <div class="stat-card solid-fill solid-green"><div class="stat-header"><div class="stat-icon">${this._icons.money}</div><div class="stat-label">總成交金額</div></div><div class="stat-number">${fmtM(ov.totalWonValue)}</div></div>
                <div class="stat-card blue"><div class="stat-header"><div class="stat-icon" style="background:var(--accent-blue);">${this._icons.check}</div><div class="stat-label">總成交案件數</div></div><div class="stat-number">${ov.totalWonDeals} 件</div></div>
                <div class="stat-card purple"><div class="stat-header"><div class="stat-icon" style="background:var(--accent-purple);">${this._icons.avg}</div><div class="stat-label">平均成交金額</div></div><div class="stat-number">${fmtM(ov.averageDealValue)}</div></div>
                <div class="stat-card orange"><div class="stat-header"><div class="stat-icon" style="background:var(--accent-orange);">${this._icons.cycle}</div><div class="stat-label">平均成交週期</div></div><div class="stat-number">${ov.averageSalesCycleInDays} 天</div></div>
            </div>`;

        kpiContainer.innerHTML = `
            <div class="stats-grid" style="grid-template-columns: repeat(3, 1fr);"> 
                <div class="stat-card solid-fill solid-teal"><div class="stat-header"><div class="stat-label">直販</div></div><div class="stat-number">${kpis.direct} 家</div></div>
                <div class="stat-card solid-fill solid-blue"><div class="stat-header"><div class="stat-label">SI販售</div></div><div class="stat-number">${kpis.si} 家</div></div>
                <div class="stat-card solid-fill solid-purple"><div class="stat-header"><div class="stat-label">MTB販售</div></div><div class="stat-number">${kpis.mtb} 家</div></div>
            </div>`;
    },

    renderAllCharts: function(typeData, sourceData, productData, channelData) {
        const container = document.getElementById('sales-charts-container');
        if (!container) return;
        
        const prodH = Math.max(300, productData.length * 30);
        const chanH = Math.max(300, channelData.length * 30);

        container.innerHTML = `
            <div class="dashboard-widget"><div class="widget-header"><h2 class="widget-title">成交類型 (依金額計)</h2></div><div id="chart-pie-type" style="height: 300px;"></div></div>
            <div class="dashboard-widget"><div class="widget-header"><h2 class="widget-title">成交來源 (依金額計)</h2></div><div id="chart-pie-source" style="height: 300px;"></div></div>
            <div class="dashboard-widget"><div class="widget-header"><h2 class="widget-title">熱銷商品</h2></div><div style="max-height: 300px; overflow-y:auto;"><div id="chart-bar-product" style="height: ${prodH}px;"></div></div></div>
            <div class="dashboard-widget"><div class="widget-header"><h2 class="widget-title">商流通路</h2></div><div style="max-height: 300px; overflow-y:auto;"><div id="chart-bar-channel" style="height: ${chanH}px;"></div></div></div>
        `;

        setTimeout(() => {
            if (typeof createThemedChart !== 'function') return;
            const pieOpt = (name, data) => ({
                chart: { type: 'pie', margin: [0, 0, 0, 0] }, title: { text: '' }, 
                tooltip: { pointFormat: '<b>{point.percentage:.1f}%</b> ({point.y:,.0f})' },
                plotOptions: { pie: { dataLabels: { enabled: true, format: '<b>{point.name}</b>: {point.percentage:.1f} %', distance: 10 }, showInLegend: true } },
                legend: { align: 'center', verticalAlign: 'bottom', layout: 'horizontal', itemStyle: { fontSize: '10px' } },
                series: [{ name, data }]
            });

            createThemedChart('chart-pie-type', pieOpt('類型', typeData));
            createThemedChart('chart-pie-source', pieOpt('來源', sourceData));
            createThemedChart('chart-bar-product', { chart: { type: 'bar' }, title: { text: '' }, xAxis: { categories: productData.map(d => d.name) }, yAxis: { title: { text: '數量' } }, legend: { enabled: false }, series: [{ name: '數量', data: productData.map(d => d.y), color: '#8b5cf6' }] });
            createThemedChart('chart-bar-channel', { chart: { type: 'bar' }, title: { text: '' }, xAxis: { categories: channelData.map(d => d.name) }, yAxis: { title: { text: '金額' } }, legend: { enabled: false }, series: [{ name: '金額', data: channelData.map(d => d.y), color: '#10b981' }] });
        }, 50);
    },

    renderWonDealsTable: function(deals, page, perPage, sortState, modelColors, typeColors) {
        const container = document.getElementById('won-deals-content');
        if (!container) return;
        if (!deals.length) { container.innerHTML = '<div class="alert alert-info" style="margin:20px;text-align:center;">此分頁沒有資料</div>'; return; }

        const getIcon = (f) => sortState.field === f ? (sortState.direction === 'asc' ? '↑' : '↓') : '↕';
        const getCls = (f) => sortState.field === f ? 'sortable-header active' : 'sortable-header';

        let html = `<div class="table-container" style="overflow-x:auto;"><table class="data-table sticky-header"><thead><tr style="white-space:nowrap;">
            <th>項次</th><th class="${getCls('wonDate')}" onclick="handleSortTable('wonDate')">成交日期 ${getIcon('wonDate')}</th>
            <th>機會種類</th><th>機會名稱</th><th>終端客戶</th><th>銷售模式</th><th>主要通路</th><th>階段</th>
            <th style="text-align:right;" class="${getCls('numericValue')}" onclick="handleSortTable('numericValue')">機會價值 ${getIcon('numericValue')}</th><th>負責業務</th></tr></thead><tbody>`;

        deals.forEach((d, i) => {
            const idx = ((page - 1) * perPage) + i + 1;
            const modelHtml = d.salesModel ? `<span class="sales-chip" style="background:${modelColors[d.salesModel] || '#6b7280'}">${d.salesModel}</span>` : '-';
            const typeHtml = d.opportunityType ? `<span class="type-chip" style="background:${typeColors[d.opportunityType] || '#6b7280'}">${d.opportunityType}</span>` : '-';
            const chanHtml = (d.channelDetails || d.salesChannel || '-') === '-' ? '-' : `<span class="channel-chip">${d.channelDetails || d.salesChannel}</span>`;
            
            html += `<tr><td>${idx}</td><td>${new Date(d.wonDate).toLocaleDateString()}</td><td>${typeHtml}</td>
                <td><a href="#" class="text-link" onclick="event.preventDefault();CRM_APP.navigateTo('opportunity-details',{opportunityId:'${d.opportunityId}'})"><strong>${d.opportunityName}</strong></a></td>
                <td>${d.customerCompany || '-'}</td><td>${modelHtml}</td><td>${chanHtml}</td>
                <td><span class="status-badge status-won">${d.currentStage}</span></td>
                <td style="text-align:right;font-weight:600;">$${(d.numericValue||0).toLocaleString()}</td><td>${d.assignee || '-'}</td></tr>`;
        });
        container.innerHTML = html + '</tbody></table></div>';
    },

    initSalesModelFilterOptions: function(deals) {
        const select = document.getElementById('sales-model-filter');
        if (!select) return;
        const models = [...new Set(deals.map(d => d.salesModel).filter(Boolean))];
        select.innerHTML = '<option value="all">全部顯示</option>' + models.sort().map(m => `<option value="${m}">${m}</option>`).join('');
    },

    initPaginationOptions: function(options, current) {
        const select = document.getElementById('rows-per-page-select');
        if (!select) return;
        select.innerHTML = options.map(opt => `<option value="${opt}" ${opt === current ? 'selected' : ''}>${opt} 筆</option>`).join('');
    },

    updatePaginationControls: function(current, totalCount, perPage) {
        const container = document.getElementById('pagination-container');
        if (!container || totalCount === 0) { if(container) container.style.display = 'none'; return; }
        container.style.display = 'flex';
        const totalPages = Math.ceil(totalCount / perPage) || 1;
        document.getElementById('page-info-display').textContent = `第 ${current} 頁 / 共 ${totalPages} 頁`;
        document.getElementById('btn-prev-page').disabled = current === 1;
        document.getElementById('btn-next-page').disabled = current === totalPages;
    }
};