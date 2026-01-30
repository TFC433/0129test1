/**
 * services/company-service.js
 * 公司業務邏輯層
 * * @version 7.7.0 (Phase 6-2: SQL First Implementation)
 * @date 2026-01-30
 * * @description
 * * 1. [Feature] 實作 SQL First + Sheet Fallback 讀取策略 (_getAllCompanies)。
 * * 2. [Fix] Write 流程 (_findCompanyRowIndex) 強制讀取 Sheet 以確保 rowIndex 存在。
 * * 3. [Strict] 保持前端合約與 DTO Mapping 不變。
 */

class CompanyService {
    constructor(
        companyReader, companyWriter, contactReader, contactWriter,
        opportunityReader, opportunityWriter, interactionReader, interactionWriter,
        eventLogReader, systemReader, companySqlReader // Inject SQL Reader
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
        this.companySqlReader = companySqlReader; // Assign
    }

    // --- DTO Mapping (SQL-ready) ---

    /**
     * 將原始資料 (Sheet/SQL) 轉換為 Service 標準 DTO
     * @param {Object} raw 原始資料列
     * @returns {Object} 符合前端合約的 DTO
     */
    _toServiceDTO(raw) {
        if (!raw) return null;

        // 目標：輸出欄位必須與目前 Sheet Reader (前端合約) 完全一致
        // 來源：優先讀取 Sheet 欄位，若無則讀取 SQL 欄位 (預備未來)
        return {
            // Identity
            companyId: raw.companyId || raw.company_id || '',
            companyName: raw.companyName || raw.company_name || '',
            
            // Contact & Location
            phone: raw.phone || '',
            address: raw.address || '',
            county: raw.county || raw.city || '', // SQL use 'city'
            
            // Business Info
            introduction: raw.introduction || raw.description || '', // SQL use 'description'
            companyType: raw.companyType || raw.company_type || '',
            customerStage: raw.customerStage || raw.customer_stage || '',
            engagementRating: raw.engagementRating || raw.interactionRating || '', // SQL use 'interactionRating'
            
            // Audit (維持前端 Key: createdTime, lastUpdateTime, etc.)
            createdTime: raw.createdTime || raw.created_time || '',
            lastUpdateTime: raw.lastUpdateTime || raw.updatedTime || raw.updated_time || '',
            creator: raw.creator || raw.createdBy || raw.created_by || '',
            lastModifier: raw.lastModifier || raw.updatedBy || raw.updated_by || '',

            // System (Sheet Write 需要，SQL 來源會是 undefined)
            rowIndex: raw.rowIndex
        };
    }

    // --- Internal Data Fetching Methods (Semantic Separation) ---

    /**
     * 取得所有公司 (已轉 DTO)
     * 策略: SQL First -> Sheet Fallback
     */
    async _getAllCompanies() {
        let companies = null;

        // 1. Try SQL
        if (this.companySqlReader) {
            try {
                const sqlRaw = await this.companySqlReader.getCompanies();
                // 必須檢查是否為空陣列，若為空則視為尚未同步，觸發 Fallback
                if (sqlRaw && Array.isArray(sqlRaw) && sqlRaw.length > 0) {
                    console.log('[CompanyService] Read Source: SQL');
                    companies = sqlRaw.map(item => this._toServiceDTO(item));
                }
            } catch (error) {
                console.warn(`[CompanyService] SQL Read Failed, falling back: ${error.message}`);
                // Continue to Fallback
            }
        }

        // 2. Fallback to Sheet (若 SQL 失敗、未注入、或回傳空資料)
        if (!companies) {
            console.log('[CompanyService] Read Source: Sheet (Fallback)');
            try {
                const sheetRaw = await this.companyReader.getCompanyList();
                companies = sheetRaw.map(item => this._toServiceDTO(item));
            } catch (sheetError) {
                console.error('[CompanyService] Sheet Read Failed:', sheetError);
                throw sheetError; // Sheet 也失敗則拋出例外
            }
        }

        return companies;
    }

    /**
     * 依名稱取得單一公司 (已轉 DTO)
     * 目前邏輯: 從 List 中尋找 (In-Memory)
     * 繼承 _getAllCompanies 的來源策略
     */
    async _getCompanyByName(companyName) {
        if (!companyName) return null;
        
        const companies = await this._getAllCompanies();
        const normalizedTarget = this._normalizeCompanyName(companyName);
        
        return companies.find(c => 
            this._normalizeCompanyName(c.companyName) === normalizedTarget
        ) || null;
    }

    // --- Helpers ---

    // Helper: 正規化公司名稱
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
    // [Critical] Write 操作必須強制讀取 Sheet 以確保 rowIndex 存在
    // 不可使用 _getAllCompanies (因為可能來自 SQL)
    async _findCompanyRowIndex(companyName) {
        // Force Sheet Read
        const rawList = await this.companyReader.getCompanyList();
        
        const normalizedTarget = this._normalizeCompanyName(companyName);
        const target = rawList.find(c => 
            this._normalizeCompanyName(c.companyName) === normalizedTarget
        );
        
        if (!target) throw new Error(`找不到公司: ${companyName}`);
        if (!target.rowIndex) throw new Error('系統錯誤: 無法取得資料行號 (rowIndex missing)');
        
        return target.rowIndex;
    }

    // --- Public Methods ---

    // 1. 建立公司
    async createCompany(companyName, companyData, user) {
        try {
            const modifier = user.displayName || user.username || user || 'System';
            
            // 檢查重複 (使用 _getCompanyByName，來源可能是 SQL，僅檢查存在性，安全)
            const existing = await this._getCompanyByName(companyName);

            if (existing) {
                return { 
                    success: true, 
                    id: existing.companyId, 
                    name: existing.companyName, 
                    message: '公司已存在', 
                    existed: true,
                    data: existing
                };
            }

            // 準備資料
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
            // 使用內部方法取得 DTO List (支援 SQL/Sheet 切換)
            let companies = await this._getAllCompanies();

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

            // 下拉選單過濾
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
            
            const [interactions, eventLogs] = await Promise.all([
                this.interactionReader.getInteractions(),
                this.eventLogReader.getEventLogs()
            ]);

            const lastActivityMap = new Map();
            
            const updateActivity = (companyId, dateStr) => {
                if (!companyId || !dateStr) return;
                const ts = new Date(dateStr).getTime();
                if (isNaN(ts)) return;
                const current = lastActivityMap.get(companyId) || 0;
                if (ts > current) lastActivityMap.set(companyId, ts);
            };

            interactions.forEach(item => updateActivity(item.companyId, item.interactionTime || item.date));
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
                    _sortTs: lastTs || 0
                };
            });

            // 排序: 最新活動在前 (Desc)
            result.sort((a, b) => b._sortTs - a._sortTs);

            return result.map(({ _sortTs, ...rest }) => rest);

        } catch (error) {
            console.error('[CompanyService] List Error:', error);
            try {
                // 最後一道防線：若上述邏輯炸裂，強制回退 Sheet 重讀
                const sheetRaw = await this.companyReader.getCompanyList();
                return sheetRaw.map(item => this._toServiceDTO(item));
            } catch (fallbackError) {
                return [];
            }
        }
    }

    // 3. 取得詳細資料
    async getCompanyDetails(companyName) {
        try {
            // 平行讀取資料
            const [allCompanies, allContacts, allOpportunities, allInteractions, allEventLogs, allPotentialContacts] = await Promise.all([
                this._getAllCompanies(), // 支援 SQL/Sheet 切換
                this.contactReader.getContactList(),
                this.opportunityReader.getOpportunities(),
                this.interactionReader.getInteractions(),
                this.eventLogReader.getEventLogs(),
                this.contactReader.getContacts(3000)
            ]);

            // 尋找目標公司
            const normalizedTarget = this._normalizeCompanyName(companyName);
            const companyInfo = allCompanies.find(c => this._normalizeCompanyName(c.companyName) === normalizedTarget);

            if (!companyInfo) {
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
            
            // 1. 正式聯絡人
            const contacts = allContacts.filter(c => c.companyId === companyId);
            
            // 2. 商機
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

            // 5. 潛在聯絡人
            const potentialContacts = allPotentialContacts.filter(pc => 
                this._normalizeCompanyName(pc.company) === normalizedTarget
            );

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
            
            // 檢查公司是否存在 (使用一般讀取)
            const companyInfo = await this._getCompanyByName(companyName);
            if (!companyInfo) throw new Error(`找不到公司: ${companyName}`);

            // [Strict] 取得行號 (必須使用 _findCompanyRowIndex 強制讀取 Sheet)
            const rowIndex = await this._findCompanyRowIndex(companyName);

            // 執行寫入
            const result = await this.companyWriter.updateCompany(rowIndex, updateData, modifier);
            
            // 紀錄 Log
            await this._logCompanyInteraction(companyInfo.companyId, '資料更新', `公司資料已更新。`, modifier);
            
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
            // 檢查關聯商機
            const opps = await this.opportunityReader.getOpportunities();
            const relatedOpps = opps.filter(o => 
                this._normalizeCompanyName(o.customerCompany) === this._normalizeCompanyName(companyName)
            );
            
            if (relatedOpps.length > 0) {
                throw new Error(`無法刪除：尚有 ${relatedOpps.length} 個關聯機會案件 (例如: ${relatedOpps[0].opportunityName})。請先移除關聯案件。`);
            }

            // [Strict] 取得行號 (必須使用 _findCompanyRowIndex 強制讀取 Sheet)
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