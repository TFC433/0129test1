/**
 * TFC CRM Refactor
 * Date: 2026-01-23
 * Version: v7.2.x (Phase 5 / Standard A - Round 3 Completed)
 * Module: Opportunity
 * Contract: v1.0 (No API/UI regression)
 */

/**
 * services/opportunity-service.js
 * 機會案件業務邏輯層 (Service Layer)
 * * @version 7.6.0 (Phase 6-2: Fix Data Truncation)
 * @date 2026-01-30
 * @description 負責處理與「機會案件」相關的 CRUD、關聯管理與自動日誌。
 * [Phase 6-2] 引入 OpportunitySqlReader，實作 Read SQL First + Sheet Fallback。
 * [Fix] searchOpportunities 移除後端分頁 Slice，直接回傳完整 Array 以符合前端全量資料預期。
 * 依賴注入：Readers (Opportunity, Interaction, EventLog, Contact, System) & Writers (Company, Contact, Opportunity, Interaction) & Config
 */

class OpportunityService {
    /**
     * @param {Object} config - 系統設定
     * @param {OpportunityReader} opportunityReader
     * @param {OpportunityWriter} opportunityWriter
     * @param {ContactReader} contactReader
     * @param {ContactWriter} contactWriter
     * @param {CompanyReader} companyReader // 用於查找公司ID
     * @param {CompanyWriter} companyWriter // 用於建立新公司
     * @param {InteractionReader} interactionReader
     * @param {InteractionWriter} interactionWriter
     * @param {EventLogReader} eventLogReader
     * @param {SystemReader} systemReader
     * @param {OpportunitySqlReader} [opportunitySqlReader] // [Added] Phase 6-2 Injection
     */
    constructor({
        config,
        opportunityReader,
        opportunityWriter,
        contactReader,
        contactWriter,
        companyReader,
        companyWriter,
        interactionReader,
        interactionWriter,
        eventLogReader,
        systemReader,
        opportunitySqlReader // [Added]
    }) {
        this.config = config;
        
        // Readers
        this.opportunityReader = opportunityReader;
        this.interactionReader = interactionReader;
        this.eventLogReader = eventLogReader;
        this.contactReader = contactReader;
        this.systemReader = systemReader;
        this.companyReader = companyReader;
        this.opportunitySqlReader = opportunitySqlReader; // [Added]

        // Writers
        this.opportunityWriter = opportunityWriter;
        this.contactWriter = contactWriter;
        this.companyWriter = companyWriter;
        this.interactionWriter = interactionWriter;
    }

    /**
     * 標準化公司名稱的輔助函式
     * @param {string} name - 公司名稱
     * @returns {string} - 標準化後的名稱
     */
    _normalizeCompanyName(name) {
        if (!name) return '';
        return name
            .toLowerCase()
            .trim()
            .replace(/股份有限公司|有限公司|公司/g, '') // 移除常見後綴
            .replace(/\(.*\)/g, '') // 移除括號內容
            .trim();
    }

    /**
     * [Phase 6-2] 統一資料獲取入口
     * 策略：SQL First -> Sheet Fallback
     * @param {boolean} forceSheet - 強制讀取 Sheet (用於 Write 操作需 rowIndex 時)
     */
    async _fetchOpportunities(forceSheet = false) {
        let opportunities = null;

        // 1. Try SQL
        if (!forceSheet && this.opportunitySqlReader) {
            try {
                const sqlData = await this.opportunitySqlReader.getOpportunities();
                if (sqlData && Array.isArray(sqlData) && sqlData.length > 0) {
                    console.log('[OpportunityService] Read Source: SQL');
                    // SQL Reader 應回傳符合 DTO 形狀的資料
                    opportunities = sqlData; 
                }
            } catch (error) {
                console.warn(`[OpportunityService] SQL Read Failed, falling back: ${error.message}`);
                // Fallback will happen below
            }
        }

        // 2. Fallback to Sheet
        if (!opportunities) {
            if (!forceSheet) console.log('[OpportunityService] Read Source: Sheet (Fallback)');
            try {
                opportunities = await this.opportunityReader.getOpportunities();
            } catch (error) {
                console.error('[OpportunityService] Sheet Read Failed:', error);
                throw error;
            }
        }

        return opportunities;
    }

    /**
     * 輔助函式：建立一筆機會互動日誌
     * @private
     */
    async _logOpportunityInteraction(opportunityId, title, summary, modifier) {
        try {
            await this.interactionWriter.createInteraction({
                opportunityId: opportunityId,
                eventType: '系統事件',
                eventTitle: title,
                contentSummary: summary,
                recorder: modifier,
                interactionTime: new Date().toISOString()
            });
        } catch (logError) {
            console.warn(`[OpportunityService] 寫入機會日誌失敗 (OppID: ${opportunityId}): ${logError.message}`);
        }
    }

    /**
     * 建立新機會案件
     */
    async createOpportunity(opportunityData, user) {
        try {
            const modifier = user.displayName || user.username || 'System';
            const result = await this.opportunityWriter.createOpportunity(opportunityData, modifier);
            
            // Invalidate Cache if available
            if (this.opportunityReader.invalidateCache) {
                this.opportunityReader.invalidateCache('opportunities');
            }
            return result;
        } catch (error) {
            console.error('[OpportunityService] createOpportunity Error:', error);
            throw error;
        }
    }

    /**
     * 高效獲取機會案件的完整詳細資料
     * 包含：互動紀錄、事件報告、已關聯聯絡人、潛在聯絡人建議、主要聯絡人職稱補全
     */
    async getOpportunityDetails(opportunityId) {
        try {
            // [Modified] Use _fetchOpportunities (SQL/Sheet)
            const [
                allOpportunities, 
                interactionsFromCache, 
                eventLogsFromCache, 
                allLinks,
                allOfficialContacts,
                allPotentialContacts
            ] = await Promise.all([
                this._fetchOpportunities(), // [Modified]
                this.interactionReader.getInteractions(),
                this.eventLogReader.getEventLogs(),
                this.contactReader.getAllOppContactLinks(),
                this.contactReader.getContactList(),
                this.contactReader.getContacts()
            ]);
            
            const opportunityInfo = allOpportunities.find(opp => opp.opportunityId === opportunityId);
            if (!opportunityInfo) {
                throw new Error(`找不到機會ID為 ${opportunityId} 的案件`);
            }

            // --- Build linked contacts (JOIN links + official contacts) ---
            const safeGet = (obj, keys) => {
                for (const k of keys) {
                    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
                }
                return undefined;
            };

            const normalizeStr = (v) => (v === undefined || v === null) ? '' : String(v).trim();

            const linkedContactsFromCache = (allLinks || [])
                .filter(link => {
                    const linkOppId = normalizeStr(safeGet(link, ['opportunityId', 'oppId', 'opportunity_id']));
                    if (!linkOppId) return false;

                    const statusVal = normalizeStr(safeGet(link, ['status', 'linkStatus', 'state'])).toLowerCase();
                    const isActive = !statusVal || statusVal === 'active'; // if status missing, treat as active (legacy tolerance)

                    return linkOppId === normalizeStr(opportunityId) && isActive;
                })
                .map(link => {
                    const linkContactId = normalizeStr(safeGet(link, ['contactId', 'id', 'contact_id']));
                    if (!linkContactId) return null;

                    const contact = (allOfficialContacts || []).find(c => normalizeStr(c.contactId) === linkContactId);
                    if (!contact) return null;

                    const linkId = safeGet(link, ['linkId', 'id', 'rowId', 'rowIndex']);
                    return { ...contact, linkId: linkId };
                })
                .filter(Boolean);
            
            // 互動紀錄排序
            const interactions = interactionsFromCache
                .filter(i => i.opportunityId === opportunityId)
                .sort((a, b) => new Date(b.interactionTime || b.createdTime) - new Date(a.interactionTime || a.createdTime));

            // 事件報告排序 (依 createdTime)
            const eventLogs = eventLogsFromCache
                .filter(log => log.opportunityId === opportunityId)
                .sort((a, b) => new Date(b.createdTime || 0) - new Date(a.createdTime || 0));

            const normalizedOppCompany = this._normalizeCompanyName(opportunityInfo.customerCompany);
            
            // 篩選同公司的潛在聯絡人
            const potentialContacts = allPotentialContacts.filter(pc => {
                const normalizedPcCompany = this._normalizeCompanyName(pc.company);
                return normalizedPcCompany && normalizedOppCompany && normalizedPcCompany === normalizedOppCompany;
            });

            // --- 自動補全主要聯絡人的職稱 (Job Title Resolution) ---
            let mainContactJobTitle = '';
            const targetName = (opportunityInfo.mainContact || '').trim();
            
            if (targetName) {
                // 1. 從已關聯聯絡人找
                const linkedMatch = linkedContactsFromCache.find(c => c.name === targetName);
                if (linkedMatch && linkedMatch.position) {
                    mainContactJobTitle = linkedMatch.position;
                } 
                // 2. 從潛在聯絡人找
                else {
                    const potentialMatch = potentialContacts.find(pc => pc.name === targetName); 
                    if (potentialMatch && potentialMatch.position) {
                        mainContactJobTitle = potentialMatch.position;
                    } else {
                        // 3. 放寬標準全域找
                        const fallbackMatch = allPotentialContacts.find(pc => 
                            pc.name === targetName && 
                            this._normalizeCompanyName(pc.company) === normalizedOppCompany
                        );
                        if (fallbackMatch && fallbackMatch.position) {
                            mainContactJobTitle = fallbackMatch.position;
                        }
                    }
                }
            }
            opportunityInfo.mainContactJobTitle = mainContactJobTitle;

            // --- 親子機會查找 ---
            let parentOpportunity = null;
            if (opportunityInfo.parentOpportunityId) {
                parentOpportunity = allOpportunities.find(opp => opp.opportunityId === opportunityInfo.parentOpportunityId) || null;
            }
            const childOpportunities = allOpportunities.filter(opp => opp.parentOpportunityId === opportunityId);

            return {
                opportunityInfo,
                interactions,
                eventLogs,
                linkedContacts: linkedContactsFromCache,
                potentialContacts,
                parentOpportunity,
                childOpportunities
            };
        } catch (error) {
            console.error(`[OpportunityService] getOpportunityDetails Error (${opportunityId}):`, error);
            throw error;
        }
    }

    /**
     * 更新機會案件，並自動新增多種互動紀錄
     */
    async updateOpportunity(rowIndex, updateData, user) {
        try {
            const modifier = user.displayName || user.username || 'System';
            
            // [Modified] Use strict sheet read or ensure rowIndex exists. 
            // Using _fetchOpportunities(true) to force Sheet read ensuring rowIndex validity and consistency.
            const opportunities = await this._fetchOpportunities(true); 
            const originalOpportunity = opportunities.find(o => o.rowIndex === parseInt(rowIndex));
            
            if (!originalOpportunity) {
                throw new Error(`找不到要更新的機會 (Row: ${rowIndex})`);
            }
            
            const oldStage = originalOpportunity.currentStage;
            const opportunityId = originalOpportunity.opportunityId;

            // --- 獲取對照表以供日誌使用 ---
            const systemConfig = await this.systemReader.getSystemConfig();
            const getNote = (configKey, value) => (systemConfig[configKey] || []).find(i => i.value === value)?.note || value || 'N/A';
            const stageMapping = new Map((systemConfig['機會階段'] || []).map(item => [item.value, item.note]));
            
            const logs = [];

            // 1. 檢查階段變更
            const newStage = updateData.currentStage;
            if (newStage && oldStage && newStage !== oldStage) {
                const oldStageName = stageMapping.get(oldStage) || oldStage;
                const newStageName = stageMapping.get(newStage) || newStage;
                logs.push(`階段從【${oldStageName}】更新為【${newStageName}】`);
            }
            
            // 2. 檢查機會價值變更
            if (updateData.opportunityValue !== undefined && updateData.opportunityValue !== originalOpportunity.opportunityValue) {
                logs.push(`機會價值從 [${originalOpportunity.opportunityValue || '未設定'}] 更新為 [${updateData.opportunityValue || '未設定'}]`);
            }

            // 3. 檢查負責業務變更
            if (updateData.assignee !== undefined && updateData.assignee !== originalOpportunity.assignee) {
                logs.push(`負責業務從 [${getNote('團隊成員', originalOpportunity.assignee)}] 變更為 [${getNote('團隊成員', updateData.assignee)}]`);
            }
            
            // 4. 檢查結案日期變更
            if (updateData.expectedCloseDate !== undefined && updateData.expectedCloseDate !== originalOpportunity.expectedCloseDate) {
                logs.push(`預計結案日從 [${originalOpportunity.expectedCloseDate || '未設定'}] 更新為 [${updateData.expectedCloseDate || '未設定'}]`);
            }

            // --- 執行更新 ---
            const updateResult = await this.opportunityWriter.updateOpportunity(rowIndex, updateData, modifier);
            
            // Invalidate Cache
            if (this.opportunityReader.invalidateCache) {
                this.opportunityReader.invalidateCache('opportunities');
            }
            
            // --- 寫入日誌 ---
            if (logs.length > 0) {
                await this._logOpportunityInteraction(
                    opportunityId,
                    '機會資料更新',
                    logs.join('； '),
                    modifier
                );
            }
            
            return updateResult;
        } catch (error) {
            console.error('[OpportunityService] updateOpportunity Error:', error);
            throw error;
        }
    }
    
    /**
     * 將一個聯絡人關聯到機會案件的工作流
     */
    async addContactToOpportunity(opportunityId, contactData, user) {
        try {
            const modifier = user.displayName || user.username || 'System';
            let contactToLink;
            let logTitle = '關聯聯絡人';

            // 情況 A: 關聯已存在的聯絡人
            if (contactData.contactId) {
                contactToLink = { id: contactData.contactId, name: contactData.name };
            } 
            // 情況 B: 建立新聯絡人並關聯
            else {
                if (!contactData.company) throw new Error("無法關聯聯絡人：缺少公司名稱。");
                
                logTitle = '建立並關聯新聯絡人';
                // 1. 確保公司存在
                const contactCompanyData = await this.companyWriter.getOrCreateCompany(contactData.company, contactData, modifier, {});
                // 2. 建立聯絡人
                contactToLink = await this.contactWriter.getOrCreateContact(contactData, contactCompanyData, modifier);

                // 3. 如果是從潛在客戶升級，更新原始狀態
                if (contactData.rowIndex) {
                    logTitle = '從潛在客戶關聯';
                    await this.contactWriter.updateContactStatus(
                        contactData.rowIndex,
                        this.config.CONSTANTS.CONTACT_STATUS.UPGRADED
                    );
                }
            }

            // 執行關聯
            const linkResult = await this.opportunityWriter.linkContactToOpportunity(opportunityId, contactToLink.id, modifier);
            
            // 寫入日誌
            await this._logOpportunityInteraction(
                opportunityId,
                logTitle,
                `將聯絡人 "${contactToLink.name}" 關聯至此機會。`,
                modifier
            );

            return { success: true, message: '聯絡人關聯成功', data: { contact: contactToLink, link: linkResult } };
        } catch (error) {
            console.error('[OpportunityService] addContactToOpportunity Error:', error);
            throw error;
        }
    }

    /**
     * 刪除機會與聯絡人的關聯
     */
    async deleteContactLink(opportunityId, contactId, user) {
        try {
            const modifier = user.displayName || user.username || 'System';
            
            const allContacts = await this.contactReader.getContactList();
            const contact = allContacts.find(c => c.contactId === contactId);
            const contactName = contact ? contact.name : `ID ${contactId}`;

            const deleteResult = await this.opportunityWriter.deleteContactLink(opportunityId, contactId);

            if (deleteResult.success) {
                await this._logOpportunityInteraction(
                    opportunityId,
                    '解除聯絡人關聯',
                    `將聯絡人 "${contactName}" 從此機會移除。`,
                    modifier
                );
            }

            return deleteResult;
        } catch (error) {
            console.error('[OpportunityService] deleteContactLink Error:', error);
            throw error;
        }
    }

    /**
     * 刪除一筆機會案件（增加日誌到所屬公司）
     */
    async deleteOpportunity(rowIndex, user) {
        try {
            const modifier = user.displayName || user.username || 'System';
            
            // [Modified] Use forceSheet=true to ensure rowIndex match
            const opportunities = await this._fetchOpportunities(true);
            const opportunity = opportunities.find(o => o.rowIndex === parseInt(rowIndex));
            
            if (!opportunity) {
                throw new Error(`找不到要刪除的機會 (Row: ${rowIndex})`);
            }

            const deleteResult = await this.opportunityWriter.deleteOpportunity(rowIndex, modifier);
            
            // Invalidate Cache
            if (this.opportunityReader.invalidateCache) {
                this.opportunityReader.invalidateCache('opportunities');
            }

            // 刪除後，嘗試在公司層級留下一筆紀錄
            if (deleteResult.success && opportunity.customerCompany) {
                try {
                    const allCompanies = await this.companyReader.getCompanyList();
                    const company = allCompanies.find(c => 
                        c.companyName.toLowerCase().trim() === opportunity.customerCompany.toLowerCase().trim()
                    );
                    
                    if (company) {
                        await this.interactionWriter.createInteraction({
                            companyId: company.companyId,
                            eventType: '系統事件',
                            eventTitle: '刪除機會案件',
                            contentSummary: `機會案件 "${opportunity.opportunityName}" (ID: ${opportunity.opportunityId}) 已被 ${modifier} 刪除。`,
                            recorder: modifier,
                            interactionTime: new Date().toISOString()
                        });
                    }
                } catch (logError) {
                     console.warn(`[OpportunityService] 寫入公司日誌失敗 (刪除機會時): ${logError.message}`);
                }
            }
            
            return deleteResult;
        } catch (error) {
            console.error('[OpportunityService] deleteOpportunity Error:', error);
            throw error;
        }
    }

    /**
     * 根據日期範圍獲取機會案件 (For Weekly/Dashboard Service)
     * @param {Date} startDate - 開始日期
     * @param {Date} endDate - 結束日期
     * @param {string} dateField - 要篩選的日期欄位 ('createdTime' 或 'closeDate')，預設為 'createdTime'
     * @returns {Promise<Array>} 符合條件的機會案件列表
     */
    async getOpportunitiesByDateRange(startDate, endDate, dateField = 'createdTime') {
        try {
            // [Modified] Use _fetchOpportunities (SQL/Sheet)
            const allOpportunities = await this._fetchOpportunities();
            
            return allOpportunities.filter(opp => {
                const dateVal = opp[dateField];
                if (!dateVal) return false;
                
                // 處理日期字串轉 Date 物件
                const oppDate = new Date(dateVal);
                if (isNaN(oppDate.getTime())) return false; // 忽略無效日期

                // 比較時間戳記 (包含邊界)
                return oppDate.getTime() >= startDate.getTime() && oppDate.getTime() <= endDate.getTime();
            });
        } catch (error) {
            console.error('[OpportunityService] getOpportunitiesByDateRange Error:', error);
            // 發生錯誤時回傳空陣列，避免中斷呼叫方 (如週報) 的主要流程
            return [];
        }
    }

    // --- Phase 5: Standard A Compliance (Round 3) ---

    /**
     * [Standard A] 獲取縣市分佈統計
     * * 邏輯已移至 Service 層 (不再 Proxy Reader)
     * * 透過 DI 注入的 companyReader 取得公司列表 (消除 Cross-Reader Require)
     */
    async getOpportunitiesByCounty(opportunityType = null) {
        try {
            // [Modified] Use _fetchOpportunities
            const [allOpportunities, companies] = await Promise.all([
                this._fetchOpportunities(),
                this.companyReader.getCompanyList() // Via DI
            ]);

            // 2. Filter Archived (Business Logic)
            const activeOpportunities = allOpportunities.filter(opp => 
                opp.currentStatus !== this.config.CONSTANTS.OPPORTUNITY_STATUS.ARCHIVED
            );

            // 3. Filter by Type (Business Logic)
            let filteredOpportunities = opportunityType
                ? activeOpportunities.filter(opp => opp.opportunityType === opportunityType)
                : activeOpportunities;
            
            // 4. JOIN Logic (Company Name -> County)
            // Normalization helper
            const normalize = (name) => name ? name.toLowerCase().trim() : '';
            const companyToCountyMap = new Map();
            
            (companies || []).forEach(c => {
                if (c.companyName) {
                    companyToCountyMap.set(normalize(c.companyName), c.county);
                }
            });

            // 5. Aggregation (Count by County)
            const countyCounts = {};
            filteredOpportunities.forEach(opp => {
                // Try to find county from company map
                const county = companyToCountyMap.get(normalize(opp.customerCompany));
                if (county) {
                    countyCounts[county] = (countyCounts[county] || 0) + 1;
                }
            });

            // 6. Return standard shape
            return Object.entries(countyCounts).map(([county, count]) => ({ county, count }));

        } catch (error) {
            console.error('❌ [OpportunityService] getOpportunitiesByCounty 錯誤:', error);
            return [];
        }
    }

    /**
     * [Standard A] 按階段聚合機會案件
     * * Migrated from Reader to Service to avoid cross-reader dependency (SystemReader)
     */
    async getOpportunitiesByStage() {
        try {
            // [Modified] Use _fetchOpportunities
            const [opportunities, systemConfig] = await Promise.all([
                this._fetchOpportunities(),
                this.systemReader.getSystemConfig()
            ]);
            
            const safeOpportunities = Array.isArray(opportunities) ? opportunities : [];
            const stages = systemConfig['機會階段'] || [];
            const stageGroups = {};

            // 初始化所有階段
            stages.forEach(stage => {
                stageGroups[stage.value] = { name: stage.note || stage.value, opportunities: [], count: 0 };
            });

            // 分類
            safeOpportunities.forEach(opp => {
                if (opp.currentStatus === '進行中') {
                    const stageKey = opp.currentStage;
                    if (stageGroups[stageKey]) {
                        stageGroups[stageKey].opportunities.push(opp);
                        stageGroups[stageKey].count++;
                    }
                }
            });
            return stageGroups;
        } catch (error) {
            console.error('❌ [OpportunityService] getOpportunitiesByStage 錯誤:', error);
            return {};
        }
    }

    /**
     * [Standard A] 搜尋機會案件
     * [Phase 6-2 Modified] Reimplemented to support SQL First.
     * Logic: Fetch All (SQL/Sheet) -> InMemory Filter/Sort
     * [Fix 1] Return Array only to match Frontend Contract (remove pagination metadata object wrapper)
     * [Fix 2] Remove backend slicing logic to return FULL result set (Fixing data truncation issue)
     */
    async searchOpportunities(query, page, filters) {
        try {
            // 1. Fetch Data (SQL First)
            let items = await this._fetchOpportunities();

            // 2. Filter (Reimplementing Reader logic for Service Layer control)
            if (!filters || !filters.includeArchived) {
                items = items.filter(o => o.currentStatus !== this.config.CONSTANTS.OPPORTUNITY_STATUS.ARCHIVED);
            }

            // Filter: Query (Name / Company)
            if (query) {
                const q = query.toLowerCase().trim();
                items = items.filter(o => 
                    (o.opportunityName && o.opportunityName.toLowerCase().includes(q)) ||
                    (o.customerCompany && o.customerCompany.toLowerCase().includes(q))
                );
            }

            // Filter: Specific Fields
            if (filters) {
                if (filters.stage && filters.stage !== 'all') {
                    items = items.filter(o => o.currentStage === filters.stage);
                }
                if (filters.assignee && filters.assignee !== 'all') {
                    items = items.filter(o => o.assignee === filters.assignee);
                }
                if (filters.status && filters.status !== 'all') {
                    items = items.filter(o => o.currentStatus === filters.status);
                }
                if (filters.minProb) {
                    items = items.filter(o => Number(o.probability || 0) >= Number(filters.minProb));
                }
            }

            // 3. Sort (Default: lastUpdateTime desc)
            items.sort((a, b) => {
                const dateA = new Date(a.lastUpdateTime || 0).getTime();
                const dateB = new Date(b.lastUpdateTime || 0).getTime();
                return dateB - dateA;
            });

            // 4. Return Full List (No Slicing)
            // 前端自行處理分頁或預期全量顯示，後端不再切片
            return items;

        } catch (error) {
             console.error('❌ [OpportunityService] searchOpportunities 錯誤:', error);
             throw error;
        }
    }

    /**
     * [Proxy] 批量更新機會案件 (原 Controller 直呼 Writer)
     */
    async batchUpdateOpportunities(updates) {
        const result = await this.opportunityWriter.batchUpdateOpportunities(updates);
        
        // Invalidate Cache
        if (this.opportunityReader.invalidateCache) {
            this.opportunityReader.invalidateCache('opportunities');
        }
        return result;
    }
}

module.exports = OpportunityService;