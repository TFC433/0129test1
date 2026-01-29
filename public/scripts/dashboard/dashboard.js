// public/scripts/dashboard/dashboard.js (V3.1 - Modularized Controller)

const dashboardManager = {
    // 狀態變數
    kanbanRawData: {},
    processedOpportunities: [], 
    availableYears: [], 

    /**
     * 初始化與刷新儀表板資料
     * @param {boolean} force - 是否強制從後端刷新 (忽略快取)
     */
    async refresh(force = false) {
        console.log(`🔄 [Dashboard] 執行儀表板刷新... (強制: ${force})`);
        
        // 呼叫 UI 管家顯示全域 Loading
        if (window.DashboardUI) DashboardUI.showGlobalLoading('正在同步儀表板資料...');

        const dashboardApiUrl = force ? `/api/dashboard?t=${Date.now()}` : '/api/dashboard';

        try {
            // 1. 併發請求資料
            const [dashboardResult, announcementResult, interactionsResult] = await Promise.all([
                authedFetch(dashboardApiUrl),
                authedFetch('/api/announcements'),
                authedFetch('/api/interactions/all?fetchAll=true') 
            ]);

            if (!dashboardResult.success) throw new Error(dashboardResult.details || '獲取儀表板資料失敗');
            if (!interactionsResult || !interactionsResult.data) throw new Error('獲取互動資料失敗 (回應格式不正確)');

            const data = dashboardResult.data;
            const interactions = interactionsResult.data || [];
            this.kanbanRawData = data.kanbanData || {};
            
            // 2. 資料處理：計算最後活動時間與年份
            const latestInteractionMap = new Map();
            interactions.forEach(interaction => {
                const id = interaction.opportunityId;
                const existing = latestInteractionMap.get(id) || 0;
                const current = new Date(interaction.interactionTime || interaction.createdTime).getTime();
                if (current > existing) latestInteractionMap.set(id, current);
            });

            const allOpportunities = Object.values(this.kanbanRawData).flatMap(stage => stage.opportunities);
            const yearSet = new Set();
            
            this.processedOpportunities = allOpportunities.map(item => {
                const selfUpdate = new Date(item.lastUpdateTime || item.createdTime).getTime();
                const lastInteraction = latestInteractionMap.get(item.opportunityId) || 0;
                item.effectiveLastActivity = Math.max(selfUpdate, lastInteraction);
                
                const year = item.createdTime ? new Date(item.createdTime).getFullYear() : null;
                item.creationYear = year;
                if(year) yearSet.add(year);
                
                return item;
            });
            this.availableYears = Array.from(yearSet).sort((a, b) => b - a); 

            // 3. 呼叫子模組進行渲染
            
            // A. 基礎 Widgets
            if (window.DashboardWidgets) {
                DashboardWidgets.renderStats(data.stats);
                if (announcementResult.success) {
                    DashboardWidgets.renderAnnouncements(announcementResult.data);
                }
                const activityWidget = document.querySelector('#activity-feed-widget .widget-content');
                if (activityWidget) {
                    activityWidget.innerHTML = DashboardWidgets.renderActivityFeed(data.recentActivity || []);
                }
            }

            // B. 週間業務 (Weekly)
            if (window.DashboardWeekly) {
                DashboardWeekly.render(data.weeklyBusiness || [], data.thisWeekInfo);
            }

            // C. 看板 (Kanban)
            if (window.DashboardKanban) {
                // Fix Initialization Race Condition: Check if initialized or rely on idempotent init.
                // We rely on the idempotent init() in dashboard_kanban.js (which checks isInitialized).
                // But for extra safety, we can also check here if we wanted to avoid the call entirely.
                // Since we updated DashboardKanban.init to be safe, calling it here is fine.
                DashboardKanban.init((forceRefresh) => this.refresh(forceRefresh));
                
                // 更新資料並渲染
                DashboardKanban.update(
                    this.processedOpportunities, 
                    this.kanbanRawData, 
                    this.availableYears
                );
            }

            // D. 地圖 (Map)
            if (window.mapManager) {
                await window.mapManager.update();
            }

        } catch (error) {
            if (error.message !== 'Unauthorized') {
                console.error("[Dashboard] 刷新儀表板時發生錯誤:", error);
                showNotification("儀表板刷新失敗", "error");
            }
        } finally {
            if (window.DashboardUI) DashboardUI.hideGlobalLoading();
            console.log('✅ [Dashboard] 儀表板刷新完成');
        }
    },
    
    /**
     * 強制重新整理 (清除快取並重載)
     */
    forceRefresh: async function() {
        if (window.DashboardUI) DashboardUI.showGlobalLoading('正在強制同步所有資料...');
        let currentPageName = 'dashboard'; 
        let currentPageParams = {};

        try {
            const currentHash = window.location.hash.substring(1);
            if (currentHash && window.CRM_APP.pageConfig[currentHash.split('?')[0]]) {
                const [pageName, paramsString] = currentHash.split('?');
                currentPageName = pageName;
                if (paramsString) {
                    try {
                        currentPageParams = Object.fromEntries(new URLSearchParams(paramsString));
                        Object.keys(currentPageParams).forEach(key => {
                            currentPageParams[key] = decodeURIComponent(currentPageParams[key]);
                        });
                    } catch (e) {
                        console.warn(`[Dashboard] 解析 forceRefresh 的 URL 參數失敗: ${paramsString}`, e);
                        currentPageParams = {};
                    }
                }
            }
            
            await authedFetch('/api/cache/invalidate', { method: 'POST' });
            showNotification('後端快取已清除，正在重新載入...', 'info');

            Object.keys(window.CRM_APP.pageConfig).forEach(key => {
                 if (!key.includes('-details')) { 
                     window.CRM_APP.pageConfig[key].loaded = false;
                 }
            });

            await this.refresh(true);

            showNotification('所有資料已強制同步！正在重新整理目前頁面...', 'success');

            await new Promise(resolve => setTimeout(resolve, 150));
            await window.CRM_APP.navigateTo(currentPageName, currentPageParams, false);

        } catch (error) {
            if (error.message !== 'Unauthorized') {
                console.error("[Dashboard] 強制刷新失敗:", error);
                showNotification("強制刷新失敗，請稍後再試。", "error");
            }
            if (window.DashboardUI) DashboardUI.hideGlobalLoading();
        } finally {
            if (window.DashboardUI) DashboardUI.hideGlobalLoading();
        }
    }
};

window.dashboardManager = dashboardManager;

if (typeof CRM_APP === 'undefined') {
    window.CRM_APP = { systemConfig: {} };
}