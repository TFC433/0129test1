/**
 * services/interaction-service.js
 * 互動紀錄業務邏輯層
 * * @version 6.1.0 (Phase 5 - Standard A Refactoring)
 * @date 2026-01-23
 * @description 負責處理互動紀錄的查詢、排序、過濾、分頁與 Join。[Standard A] 承擔完整邏輯。
 * 依賴注入：InteractionReader, InteractionWriter, OpportunityReader, CompanyReader
 */

class InteractionService {
    /**
     * @param {InteractionReader} interactionReader 
     * @param {InteractionWriter} interactionWriter 
     * @param {OpportunityReader} opportunityReader 
     * @param {CompanyReader} companyReader 
     */
    constructor(interactionReader, interactionWriter, opportunityReader, companyReader) {
        this.interactionReader = interactionReader;
        this.interactionWriter = interactionWriter;
        this.opportunityReader = opportunityReader;
        this.companyReader = companyReader;
    }

    /**
     * 搜尋互動紀錄 (包含 Join, Filter, Sort, Pagination)
     * [Standard A] Logic moved from Reader to Service
     * @param {string} query 
     * @param {number} page 
     * @param {boolean} fetchAll 
     */
    async searchInteractions(query, page = 1, fetchAll = false) {
        try {
            // 1. Raw Fetch (Parallel)
            const [interactions, opportunities, companies] = await Promise.all([
                this.interactionReader.getInteractions(), // Raw
                this.opportunityReader.getOpportunities(), // Raw
                this.companyReader.getCompanyList() // Raw
            ]);

            // 2. Prepare Maps for Join
            const oppMap = new Map(opportunities.map(o => [o.opportunityId, o.opportunityName]));
            const compMap = new Map(companies.map(c => [c.companyId, c.companyName]));

            // 3. Clone & Join Logic (Preserving exact logic from old Reader)
            let results = interactions.map(item => {
                const newItem = { ...item }; // Clone to prevent cache pollution
                
                let contextName = '未指定'; 

                if (newItem.opportunityId && oppMap.has(newItem.opportunityId)) {
                    contextName = oppMap.get(newItem.opportunityId); 
                } else if (newItem.companyId && compMap.has(newItem.companyId)) {
                    contextName = compMap.get(newItem.companyId); 
                } else if (newItem.opportunityId) {
                    contextName = '未知機會'; 
                } else if (newItem.companyId) {
                    contextName = '未知公司'; 
                }

                newItem.opportunityName = contextName;
                return newItem;
            });

            // 4. Filter (Query)
            if (query) {
                const searchTerm = query.toLowerCase();
                results = results.filter(i =>
                    (i.contentSummary && i.contentSummary.toLowerCase().includes(searchTerm)) ||
                    (i.eventTitle && i.eventTitle.toLowerCase().includes(searchTerm)) ||
                    (i.opportunityName && i.opportunityName.toLowerCase().includes(searchTerm)) ||
                    (i.recorder && i.recorder.toLowerCase().includes(searchTerm))
                );
            }

            // 5. Sort (Time Descending - Logic from old Reader)
            results.sort((a, b) => {
                const dateA = new Date(a.interactionTime);
                const dateB = new Date(b.interactionTime);
                if (isNaN(dateB)) return -1;
                if (isNaN(dateA)) return 1;
                return dateB - dateA;
            });

            // 6. Pagination
            // [Evidence] Reader used: this.config.PAGINATION.INTERACTIONS_PER_PAGE
            const config = this.interactionReader.config;
            const pageSize = (config && config.PAGINATION && config.PAGINATION.INTERACTIONS_PER_PAGE) 
                ? config.PAGINATION.INTERACTIONS_PER_PAGE 
                : 20; // Fallback

            if (fetchAll) {
                return {
                    data: results,
                    pagination: {
                        current: 1,
                        total: 1,
                        totalItems: results.length,
                        hasNext: false,
                        hasPrev: false
                    }
                };
            }

            const startIndex = (page - 1) * pageSize;
            const paginatedData = results.slice(startIndex, startIndex + pageSize);
            
            return {
                data: paginatedData,
                pagination: { 
                    current: page, 
                    total: Math.ceil(results.length / pageSize), 
                    totalItems: results.length, 
                    hasNext: (startIndex + pageSize) < results.length, 
                    hasPrev: page > 1 
                }
            };

        } catch (error) {
            console.error('[InteractionService] searchInteractions Error:', error);
            throw error;
        }
    }

    /**
     * 取得特定機會的互動紀錄
     * @param {string} opportunityId 
     */
    async getInteractionsByOpportunity(opportunityId) {
        try {
            // [Standard A] Use internal search (fetchAll=true) to get joined data, then filter
            const result = await this.searchInteractions('', 1, true); 
            // Return Array as expected by Controller
            return result.data.filter(log => log.opportunityId === opportunityId);
        } catch (error) {
            console.error('[InteractionService] getInteractionsByOpportunity Error:', error);
            return [];
        }
    }

    /**
     * 取得特定公司的互動紀錄
     * @param {string} companyId 
     */
    async getInteractionsByCompany(companyId) {
        try {
            const result = await this.searchInteractions('', 1, true);
            return result.data.filter(log => log.companyId === companyId);
        } catch (error) {
            console.error('[InteractionService] getInteractionsByCompany Error:', error);
            return [];
        }
    }

    /**
     * 新增互動紀錄
     * @param {Object} data 
     * @param {Object} user 
     */
    async createInteraction(data, user) {
        try {
            const safeUser = user || {};
            const newId = await this.interactionWriter.createInteraction(data, safeUser);
            this.interactionReader.invalidateCache('interactions');
            return { success: true, id: newId };
        } catch (error) {
            console.error('[InteractionService] createInteraction Error:', error);
            throw error;
        }
    }

    /**
     * 更新互動紀錄
     * @param {string} id 
     * @param {Object} data 
     * @param {Object} user 
     */
    async updateInteraction(id, data, user) {
        try {
            const safeUser = user || {};
            await this.interactionWriter.updateInteraction(id, data, safeUser);
            this.interactionReader.invalidateCache('interactions');
            return { success: true };
        } catch (error) {
            console.error('[InteractionService] updateInteraction Error:', error);
            throw error;
        }
    }

    /**
     * 刪除互動紀錄
     * @param {string} id 
     * @param {Object} user 
     */
    async deleteInteraction(id, user) {
        try {
            const safeUser = user || {};
            await this.interactionWriter.deleteInteraction(id, safeUser);
            this.interactionReader.invalidateCache('interactions');
            return { success: true };
        } catch (error) {
            console.error('[InteractionService] deleteInteraction Error:', error);
            throw error;
        }
    }
}

module.exports = InteractionService;