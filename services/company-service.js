/**
 * services/company-service.js
 * 公司業務邏輯層
 * * @version 7.5.1 (Fix: Match Frontend Contract Keys)
 * @date 2026-01-20
 * * @description
 * * 1. [Fix] getCompanyDetails 回傳結構修正，對齊前端 companies.js 預期的 contacts, opportunities, potentialContacts。
 * * 2. [Feature] 實作 getCompanyListWithActivity 的記憶體過濾 (Search & Filter)。
 * * 3. [Strict] 確保只呼叫 Reader/Writer 存在的正確方法。
 */

class CompanyService {
    constructor(
        companyReader, companyWriter, contactReader, contactWriter,
        opportunityReader, opportunityWriter, interactionReader, interactionWriter,
        eventLogReader, systemReader
    ) {
        this.companyReader = companyReader;
        this.companyWriter = companyWriter;
        this.contactReader = contactReader;
        this.contactWriter = contactWriter;
        this.opportunityReader = opportunityReader;
        this.opportunityWriter = opportunityWriter;
        this.interactionReader = interactionReader;
        this.interactionWriter = interactionWriter;
        this.eventLogReader = eventLogReader;
        this.systemReader = systemReader;
    }

    // Helper: 正規化公司名稱 (去除 股份有限公司, 空白, 括號等)
    _normalizeCompanyName(name) {
        if (!name) return '';
        return name.toLowerCase().trim()
            .replace(/股份有限公司|有限公司|公司/g, '')
            .replace(/\(.*\)/g, '')
            .trim();
    }

    // Helper: 紀錄系統互動
    async _logCompanyInteraction(companyId, title, summary, modifier) {
        try {
            if (this.interactionWriter && this.interactionWriter.createInteraction) {
                await this.interactionWriter.createInteraction({
                    companyId: companyId,
                    eventType: '系統事件',
                    eventTitle: title,
                    contentSummary: summary,
                    recorder: modifier,
                    interactionTime: new Date().toISOString()
                });
            }
        } catch (logError) {
            console.warn(`[CompanyService] Log Interaction Error: ${logError.message}`);
        }
    }

    // Helper: 尋找公司 Row Index (用於 Update/Delete)
    async _findCompanyRowIndex(companyName) {
        // [Strict] Ensure correct method name
        const companies = await this.companyReader.getCompanyList();
        const normalizedTarget = this._normalizeCompanyName(companyName);
        
        const target = companies.find(c => 
            c.companyName === companyName || 
            this._normalizeCompanyName(c.companyName) === normalizedTarget
        );
        
        if (!target) throw new Error(`找不到公司: ${companyName}`);
        if (!target.rowIndex) throw new Error('系統錯誤: 無法取得資料行號 (rowIndex missing)');
        return target.rowIndex;
    }

    // 1. 建立公司
    async createCompany(companyName, companyData, user) {
        try {
            const modifier = user.displayName || user.username || user || 'System';
            const companies = await this.companyReader.getCompanyList();
            
            // 檢查重複
            const normalizedTarget = this._normalizeCompanyName(companyName);
            const existing = companies.find(c => this._normalizeCompanyName(c.companyName) === normalizedTarget);

            if (existing) {
                return { 
                    success: true, 
                    id: existing.companyId, 
                    name: existing.companyName, 
                    message: '公司已存在', 
                    existed: true,
                    data: existing // 回傳現有資料以便前端導航
                };
            }

            // 準備資料 (合併 name 與其他 data)
            const dataToWrite = { companyName: companyName, ...companyData };
            
            // 執行寫入
            const result = await this.companyWriter.createCompany(dataToWrite, modifier);
            
            // 清除快取
            if (this.companyReader.invalidateCache) {
                this.companyReader.invalidateCache('companyList');
            }
            
            return result;
        } catch (error) {
            console.error('[CompanyService] Create Error:', error);
            throw error;
        }
    }

    // 2. 取得列表 (含搜尋、過濾、最後活動排序)
    async getCompanyListWithActivity(filters = {}) {
        try {
            // [Strict] Correct method
            const companiesRaw = await this.companyReader.getCompanyList();
            let companies = companiesRaw;

            // --- Step 1: 記憶體過濾 (Memory Filtering) ---
            
            // 文字搜尋 (q)
            if (filters.q) {
                const q = filters.q.toLowerCase().trim();
                companies = companies.filter(c => 
                    (c.companyName || '').toLowerCase().includes(q) ||
                    (c.phone || '').includes(q) ||
                    (c.address || '').toLowerCase().includes(q) ||
                    (c.county || '').toLowerCase().includes(q) ||
                    (c.introduction || '').toLowerCase().includes(q)
                );
            }

            // 下拉選單過濾 (Type, Stage, Rating)
            if (filters.type && filters.type !== 'all') {
                companies = companies.filter(c => c.companyType === filters.type);
            }
            if (filters.stage && filters.stage !== 'all') {
                companies = companies.filter(c => c.customerStage === filters.stage);
            }
            if (filters.rating && filters.rating !== 'all') {
                companies = companies.filter(c => c.engagementRating === filters.rating);
            }

            // --- Step 2: 計算最後活動時間 (Last Activity) ---
            
            // 並行取得互動與日誌
            const [interactions, eventLogs] = await Promise.all([
                this.interactionReader.getInteractions(),
                this.eventLogReader.getEventLogs()
            ]);

            const lastActivityMap = new Map();
            
            // Helper to update max timestamp
            const updateActivity = (companyId, dateStr) => {
                if (!companyId || !dateStr) return;
                const ts = new Date(dateStr).getTime();
                if (isNaN(ts)) return;
                const current = lastActivityMap.get(companyId) || 0;
                if (ts > current) lastActivityMap.set(companyId, ts);
            };

            // 遍歷互動紀錄
            interactions.forEach(item => updateActivity(item.companyId, item.interactionTime || item.date));
            // 遍歷系統日誌
            eventLogs.forEach(item => updateActivity(item.companyId, item.createdTime));

            // --- Step 3: 組合與排序 ---
            
            const result = companies.map(comp => {
                let lastTs = lastActivityMap.get(comp.companyId);
                
                // Fallback: 若無互動，使用建立時間
                if (!lastTs && comp.createdTime) {
                    const createdTs = new Date(comp.createdTime).getTime();
                    if (!isNaN(createdTs)) lastTs = createdTs;
                }

                return {
                    ...comp,
                    lastActivity: lastTs ? new Date(lastTs).toISOString() : null,
                    _sortTs: lastTs || 0 // 暫存用於排序
                };
            });

            // 排序: 最新活動在前 (Desc)
            result.sort((a, b) => b._sortTs - a._sortTs);

            // 移除暫存欄位並回傳
            return result.map(({ _sortTs, ...rest }) => rest);

        } catch (error) {
            console.error('[CompanyService] List Error:', error);
            // Fallback: 發生錯誤時回傳原始列表，確保頁面不白屏
            return await this.companyReader.getCompanyList();
        }
    }

    // 3. 取得詳細資料 (聚合 Contact, Opportunity, Interaction, EventLog)
    async getCompanyDetails(companyName) {
        try {
            // [Fix] 增加 contactReader.getContacts(3000) 以取得潛在客戶 (Raw Data)
            // 這裡必須同時讀取「正式聯絡人」與「潛在聯絡人」
            const [allCompanies, allContacts, allOpportunities, allInteractions, allEventLogs, allPotentialContacts] = await Promise.all([
                this.companyReader.getCompanyList(),
                this.contactReader.getContactList(),
                this.opportunityReader.getOpportunities(),
                this.interactionReader.getInteractions(),
                this.eventLogReader.getEventLogs(),
                this.contactReader.getContacts(3000) // 讀取潛在客戶
            ]);

            // 尋找目標公司
            const normalizedTarget = this._normalizeCompanyName(companyName);
            const companyInfo = allCompanies.find(c => this._normalizeCompanyName(c.companyName) === normalizedTarget);

            if (!companyInfo) {
                // [Fix] 回傳結構需符合前端預期 (contacts, opportunities, potentialContacts)
                return { 
                    companyInfo: null, 
                    contacts: [], 
                    opportunities: [], 
                    potentialContacts: [],
                    interactions: [], 
                    eventLogs: [] 
                };
            }

            const companyId = companyInfo.companyId;

            // 聚合關聯資料
            
            // 1. 正式聯絡人 (By CompanyID) - Key: contacts
            const contacts = allContacts.filter(c => c.companyId === companyId);
            
            // 2. 商機 (By CompanyName Fuzzy Match) - Key: opportunities
            const opportunities = allOpportunities.filter(o => 
                this._normalizeCompanyName(o.customerCompany) === normalizedTarget
            );
            const relatedOppIds = new Set(opportunities.map(o => o.opportunityId));
            
            // 3. 互動紀錄
            const interactions = allInteractions.filter(i => 
                i.companyId === companyId || (i.opportunityId && relatedOppIds.has(i.opportunityId))
            ).sort((a, b) => new Date(b.interactionTime || 0) - new Date(a.interactionTime || 0));

            // 4. 系統日誌
            const eventLogs = allEventLogs.filter(e => 
                e.companyId === companyId || (e.opportunityId && relatedOppIds.has(e.opportunityId))
            ).sort((a, b) => new Date(b.createdTime || 0) - new Date(a.createdTime || 0));

            // 5. [Fix] 潛在聯絡人 (By CompanyName Fuzzy Match) - Key: potentialContacts
            const potentialContacts = allPotentialContacts.filter(pc => 
                this._normalizeCompanyName(pc.company) === normalizedTarget
            );

            // [Fix] Key 名稱對齊前端: relatedContacts -> contacts, relatedOpportunities -> opportunities
            return { companyInfo, contacts, opportunities, potentialContacts, interactions, eventLogs };

        } catch (error) {
            console.error(`[CompanyService] Details Error (${companyName}):`, error);
            throw error;
        }
    }

    // 4. 更新公司
    async updateCompany(companyName, updateData, user) {
        try {
            const modifier = user.displayName || user.username || 'System';
            
            // 確保公司存在
            const details = await this.getCompanyDetails(companyName);
            if (!details.companyInfo) throw new Error(`找不到公司: ${companyName}`);

            // 取得行號並寫入
            const rowIndex = await this._findCompanyRowIndex(companyName);
            const result = await this.companyWriter.updateCompany(rowIndex, updateData, modifier);
            
            // 紀錄 Log
            await this._logCompanyInteraction(details.companyInfo.companyId, '資料更新', `公司資料已更新。`, modifier);
            
            // 清除快取
            if (this.companyReader.invalidateCache) {
                this.companyReader.invalidateCache('companyList');
            }

            return result;
        } catch (error) {
            console.error('[CompanyService] Update Error:', error);
            throw error;
        }
    }

    // 5. 刪除公司
    async deleteCompany(companyName, user) {
        try {
            // 檢查關聯商機 (保護機制)
            const opps = await this.opportunityReader.getOpportunities();
            const relatedOpps = opps.filter(o => 
                this._normalizeCompanyName(o.customerCompany) === this._normalizeCompanyName(companyName)
            );
            
            if (relatedOpps.length > 0) {
                throw new Error(`無法刪除：尚有 ${relatedOpps.length} 個關聯機會案件 (例如: ${relatedOpps[0].opportunityName})。請先移除關聯案件。`);
            }

            // 執行刪除
            const rowIndex = await this._findCompanyRowIndex(companyName);
            const result = await this.companyWriter.deleteCompany(rowIndex);
            
            // 清除快取
            if (this.companyReader.invalidateCache) {
                console.log('[CompanyService] 刪除後清除快取: companyList');
                this.companyReader.invalidateCache('companyList');
            }

            return result;
        } catch (error) {
            console.error('[CompanyService] Delete Error:', error);
            throw error;
        }
    }
}

module.exports = CompanyService;