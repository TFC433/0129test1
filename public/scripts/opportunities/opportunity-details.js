// views/scripts/opportunity-details.js (重構後的主控制器)

window.currentDetailOpportunityId = null;
window.currentOpportunityData = null; 

/**
 * 載入並渲染機會詳細頁面的主函式
 * @param {string} opportunityId - 機會ID
 */
async function loadOpportunityDetailPage(opportunityId) {
    window.currentDetailOpportunityId = opportunityId;
    
    const container = document.getElementById('page-opportunity-details');
    if (!container) return;

    container.innerHTML = `<div class="loading show" style="padding-top: 50px;"><div class="spinner"></div><p>正在載入機會詳細資料...</p></div>`;

    try {
        const opportunityDetailPageTemplate = await fetch('/views/opportunity-detail.html').then(res => res.text());
        const result = await authedFetch(`/api/opportunities/${opportunityId}/details`);
        if (!result.success) throw new Error(result.error);
        
        const { opportunityInfo, interactions, eventLogs, linkedContacts, potentialContacts, parentOpportunity, childOpportunities } = result.data;
        window.currentOpportunityData = opportunityInfo; 

        // 1. 渲染主模板
        container.innerHTML = opportunityDetailPageTemplate;
        document.getElementById('page-title').textContent = '機會案件管理 - 機會詳細';
        document.getElementById('page-subtitle').textContent = '機會詳細資料與關聯活動';

        // 2. 使用 requestAnimationFrame 確保 DOM 插入後再初始化元件
        requestAnimationFrame(() => {
            // 渲染資訊卡與步驟條
            OpportunityInfoCard.render(opportunityInfo);
            OpportunityInfoCardEvents.init(opportunityInfo);
            OpportunityStepper.init(opportunityInfo);
            
            // --- 【修復關鍵】：確保傳入 linkedContacts 以利總覽模式職稱顯示 ---
            OpportunityEvents.init(eventLogs || [], { 
                opportunityId: opportunityInfo.opportunityId, 
                opportunityName: opportunityInfo.opportunityName,
                linkedContacts: linkedContacts || []
            });

            // 初始化互動區塊
            const interactionContainer = document.getElementById('tab-content-interactions');
            if (interactionContainer) {
                OpportunityInteractions.init(interactionContainer, { opportunityId: opportunityInfo.opportunityId }, interactions || []);
            }
            
            // 初始化關聯對象
            OpportunityContacts.init(opportunityInfo, linkedContacts || []);
            OpportunityAssociatedOpps.render({ opportunityInfo, parentOpportunity, childOpportunities });
            
            // 初始化潛在聯絡人
            if (window.PotentialContactsManager) {
                PotentialContactsManager.render({
                    containerSelector: '#opp-potential-contacts-container',
                    potentialContacts: potentialContacts || [],
                    comparisonList: linkedContacts || [],
                    comparisonKey: 'name',
                    context: 'opportunity',
                    opportunityId: opportunityInfo.opportunityId
                });
            }
            
            // 3. 更新全域 UI 元件
            CRM_APP.updateAllDropdowns();
        });

    } catch (error) {
        if (error.message !== 'Unauthorized') {
            console.error('[OpportunityDetails] 載入失敗:', error);
            container.innerHTML = `<div class="alert alert-error">載入機會詳細資料失敗: ${error.message}</div>`;
        }
    }
}

// 註冊模組
if (window.CRM_APP) {
    window.CRM_APP.pageModules['opportunity-details'] = loadOpportunityDetailPage;
}