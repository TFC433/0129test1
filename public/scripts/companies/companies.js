/**
 * public/scripts/companies/companies.js
 * 職責：載入公司詳細資料頁的數據，並協調UI渲染與事件綁定模組
 * * @version 7.4.0 (Restored from 0109)
 * * @description 嚴格還原 0109 版本的主控制器邏輯。
 */

/**
 * 載入並渲染公司詳細資料頁面的主函式
 * @param {string} encodedCompanyName - URL編碼過的公司名稱
 */
async function loadCompanyDetailsPage(encodedCompanyName) {
    const container = document.getElementById('page-company-details');
    // 解碼名稱
    const companyName = decodeURIComponent(encodedCompanyName);
    
    // 若找不到專屬容器，嘗試尋找通用容器 (v7.0 相容)
    const targetContainer = container || document.getElementById('page-content') || document.body;

    targetContainer.innerHTML = `<div class="loading show" style="padding-top: 100px;"><div class="spinner"></div><p>正在載入 ${companyName} 的詳細資料...</p></div>`;

    try {
        const result = await authedFetch(`/api/companies/${encodedCompanyName}/details`);
        if (!result.success) throw new Error(result.error || '無法載入公司資料');

        // 從解構賦值中移除 interactions (依照 0109 邏輯)
        const { companyInfo, contacts = [], opportunities = [], potentialContacts = [], eventLogs = [] } = result.data;
        
        // 1. 設定頁面標題
        const titleEl = document.getElementById('page-title');
        const subtitleEl = document.getElementById('page-subtitle');
        if (titleEl) titleEl.textContent = companyInfo.companyName;
        if (subtitleEl) subtitleEl.textContent = '公司詳細資料與關聯活動';

        // 2. 渲染頁面骨架 (垂直瀑布流 - 0109 結構)
        // 注意：這裡依賴 company-details-ui.js 中的渲染函式
        targetContainer.innerHTML = `
            ${typeof renderCompanyInfoCard === 'function' ? renderCompanyInfoCard(companyInfo) : '<div class="alert alert-error">UI渲染函式缺失</div>'}

            <div id="tab-content-company-events" class="tab-content active" style="margin-bottom: var(--spacing-6);"></div>

            <div class="dashboard-widget grid-col-12" style="margin-top: var(--spacing-6);">
                <div class="widget-header"><h2 class="widget-title">相關機會案件 (${opportunities.length})</h2></div>
                <div class="widget-content">${typeof renderCompanyOpportunitiesTable === 'function' ? renderCompanyOpportunitiesTable(opportunities) : ''}</div>
            </div>

            <div class="dashboard-widget grid-col-12" style="margin-top: var(--spacing-6);">
                <div class="widget-header"><h2 class="widget-title">已建檔聯絡人 (${contacts.length})</h2></div>
                <div class="widget-content">${typeof renderCompanyContactsTable === 'function' ? renderCompanyContactsTable(contacts) : ''}</div>
            </div>

            <div class="dashboard-widget grid-col-12" style="margin-top: var(--spacing-6);">
                <div class="widget-header"><h2 class="widget-title">潛在聯絡人 (${potentialContacts.length})</h2></div>
                <div id="potential-contacts-container" class="widget-content"></div>
            </div>
        `;
        
        // 3. 初始化並渲染各個模組
        // 若 OpportunityEvents 存在則初始化
        if (window.OpportunityEvents) {
            OpportunityEvents.init(eventLogs, { companyId: companyInfo.companyId, companyName: companyInfo.companyName });
        }
        
        if (window.PotentialContactsManager) {
            PotentialContactsManager.render({
                containerSelector: '#potential-contacts-container',
                potentialContacts: potentialContacts, 
                comparisonList: contacts, 
                comparisonKey: 'name',
                context: 'company'
            });
        }

        // 4. 綁定所有互動事件 (0109 邏輯)
        if (typeof initializeCompanyEventListeners === 'function') {
            initializeCompanyEventListeners(companyInfo);
        }
        
        // 5. 更新下拉選單 (若 CRM_APP 存在)
        if (window.CRM_APP && typeof CRM_APP.updateAllDropdowns === 'function') {
            CRM_APP.updateAllDropdowns();
        }

    } catch (error) {
        if (error.message !== 'Unauthorized') {
            console.error('載入公司詳細資料失敗:', error);
            const titleEl = document.getElementById('page-title');
            if (titleEl) titleEl.textContent = '錯誤';
            targetContainer.innerHTML = `<div class="alert alert-error">載入公司資料失敗: ${error.message}</div>`;
        }
    }
}

// 向主應用程式註冊此模組管理的頁面載入函式 (v7.0 Router 整合)
window.loadCompanyDetailsPage = loadCompanyDetailsPage;
if (window.CRM_APP) {
    if (!window.CRM_APP.pageModules) window.CRM_APP.pageModules = {};
    // 註冊兩個可能的名稱以防萬一
    window.CRM_APP.pageModules['company-details'] = loadCompanyDetailsPage;
}