/**
 * data/opportunity-reader.js
 * 專門負責讀取所有與「機會案件」相關資料的類別
 * * @version 6.1.2 (Fix: Remove Aggregation Logic)
 * @date 2026-01-27
 * @description 實作 Strict Mode，移除內部 require 與聚合邏輯，回歸純粹的資料讀取職責。
 */

const BaseReader = require('./base-reader');

class OpportunityReader extends BaseReader {
    /**
     * @param {Object} sheets - Google Sheets API Client
     * @param {string} spreadsheetId - [Required] 指定要讀取的 Sheet ID
     */
    constructor(sheets, spreadsheetId) {
        super(sheets, spreadsheetId);
    }

    /**
     * 內部輔助：建立標題與索引的對照表
     */
    _buildHeaderMap(headerRow) {
        const map = {};
        if (!headerRow || !Array.isArray(headerRow) || headerRow.length === 0) return map;
        
        headerRow.forEach((title, index) => {
            if (title) {
                map[title.trim()] = index;
            }
        });
        return map;
    }

    /**
     * 內部輔助：安全地根據標題獲取值
     */
    _getValue(row, map, fieldName) {
        const index = map[fieldName];
        if (index === undefined || index < 0) return ''; 
        return row[index] || '';
    }

    /**
     * 取得所有機會案件 (核心函式)
     * @returns {Promise<Array<object>>} - 保證回傳陣列
     */
    async getOpportunities() {
        const cacheKey = 'opportunities';
        const range = `${this.config.SHEETS.OPPORTUNITIES}!A:ZZ`;

        try {
            // ★★★ 使用 this.targetSpreadsheetId ★★★
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.targetSpreadsheetId, 
                range: range,
            });

            const rows = response.data.values;
            // 防呆：如果完全沒資料，回傳空陣列
            if (!rows || !Array.isArray(rows) || rows.length === 0) {
                console.warn('[OpportunityReader] Google Sheet 回傳空資料');
                return []; 
            }

            // 解析標題列
            const headerRow = rows[0];
            const headerMap = this._buildHeaderMap(headerRow);
            const FIELD_NAMES = this.config.OPPORTUNITY_FIELD_NAMES;

            // 檢查關鍵欄位
            if (headerMap[FIELD_NAMES.ID] === undefined) {
                console.warn(`⚠️ [OpportunityReader] 警告：找不到核心標題 "${FIELD_NAMES.ID}"`);
            }

            // 解析資料列
            const opportunities = [];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;

                const opp = {
                    rowIndex: i + 1,
                    opportunityId: this._getValue(row, headerMap, FIELD_NAMES.ID),
                    opportunityName: this._getValue(row, headerMap, FIELD_NAMES.NAME),
                    customerCompany: this._getValue(row, headerMap, FIELD_NAMES.CUSTOMER),
                    
                    salesModel: this._getValue(row, headerMap, FIELD_NAMES.SALES_MODEL),
                    
                    // 將 '主要通路/下單方' 對應到 channelDetails
                    channelDetails: this._getValue(row, headerMap, FIELD_NAMES.CHANNEL),
                    salesChannel: this._getValue(row, headerMap, FIELD_NAMES.CHANNEL),

                    channelContact: this._getValue(row, headerMap, FIELD_NAMES.CHANNEL_CONTACT),
                    mainContact: this._getValue(row, headerMap, FIELD_NAMES.CONTACT),
                    assignee: this._getValue(row, headerMap, FIELD_NAMES.ASSIGNEE),
                    opportunityType: this._getValue(row, headerMap, FIELD_NAMES.TYPE),
                    opportunitySource: this._getValue(row, headerMap, FIELD_NAMES.SOURCE),
                    currentStage: this._getValue(row, headerMap, FIELD_NAMES.STAGE),
                    expectedCloseDate: this._getValue(row, headerMap, FIELD_NAMES.CLOSE_DATE),
                    opportunityValue: this._getValue(row, headerMap, FIELD_NAMES.VALUE),
                    opportunityValueType: this._getValue(row, headerMap, FIELD_NAMES.VALUE_TYPE),
                    orderProbability: this._getValue(row, headerMap, FIELD_NAMES.PROBABILITY),
                    
                    potentialSpecification: this._getValue(row, headerMap, FIELD_NAMES.PRODUCT_SPEC),
                    deviceScale: this._getValue(row, headerMap, FIELD_NAMES.DEVICE_SCALE),
                    
                    notes: this._getValue(row, headerMap, FIELD_NAMES.NOTES),
                    driveFolderLink: this._getValue(row, headerMap, FIELD_NAMES.DRIVE_LINK),
                    currentStatus: this._getValue(row, headerMap, FIELD_NAMES.STATUS),
                    
                    stageHistory: this._getValue(row, headerMap, FIELD_NAMES.HISTORY),
                    
                    createdTime: this._getValue(row, headerMap, FIELD_NAMES.CREATED_TIME),
                    lastUpdateTime: this._getValue(row, headerMap, FIELD_NAMES.LAST_UPDATE_TIME),
                    lastModifier: this._getValue(row, headerMap, FIELD_NAMES.LAST_MODIFIER),
                    
                    parentOpportunityId: this._getValue(row, headerMap, FIELD_NAMES.PARENT_ID)
                };
                
                if (opp.currentStatus !== this.config.CONSTANTS.OPPORTUNITY_STATUS.ARCHIVED) {
                    opportunities.push(opp);
                }
            }

            // 排序
            opportunities.sort((a, b) => {
                const timeA = a.lastUpdateTime || a.createdTime;
                const timeB = b.lastUpdateTime || b.createdTime;
                return new Date(timeB) - new Date(timeA);
            });

            // 寫入快取
            if (this.cache) {
                this.cache[cacheKey] = opportunities;
            }

            return opportunities;

        } catch (error) {
            console.error('❌ [OpportunityReader] 讀取失敗:', error);
            return []; 
        }
    }

    /**
     * 搜尋並分頁機會案件
     * 負責執行查詢、過濾、排序與分頁的單一真相
     */
    async searchOpportunities(query, page = 1, filters = {}, sortOptions = null) {
        let opportunities = await this.getOpportunities();
        if (!Array.isArray(opportunities)) opportunities = [];

        // 1. Keyword Search
        if (query) {
            const searchTerm = query.toLowerCase();
            opportunities = opportunities.filter(o => {
                if (searchTerm.startsWith('opp') && o.opportunityId && o.opportunityId.toLowerCase() === searchTerm) {
                    return true;
                }
                return (o.opportunityName && o.opportunityName.toLowerCase().includes(searchTerm)) ||
                       (o.customerCompany && o.customerCompany.toLowerCase().includes(searchTerm));
            });
        }

        // 2. Attribute Filters
        if (filters.assignee) opportunities = opportunities.filter(o => o.assignee === filters.assignee);
        if (filters.type) opportunities = opportunities.filter(o => o.opportunityType === filters.type);
        if (filters.stage) opportunities = opportunities.filter(o => o.currentStage === filters.stage);
        
        // 3. Sorting (若有指定排序選項則執行，否則維持 getOpportunities 的預設排序)
        if (sortOptions && sortOptions.field) {
            const field = sortOptions.field;
            const dir = sortOptions.direction === 'asc' ? 1 : -1;
            
            opportunities.sort((a, b) => {
                let valA, valB;
                // Special handling for legacy time field fallback
                if (field === 'lastUpdateTime') {
                    valA = new Date(a.lastUpdateTime || a.createdTime).getTime();
                    valB = new Date(b.lastUpdateTime || b.createdTime).getTime();
                } else {
                    valA = a[field];
                    valB = b[field];
                }
                
                if (valA < valB) return -1 * dir;
                if (valA > valB) return 1 * dir;
                return 0;
            });
        }

        // 4. Pagination
        if (!page || page <= 0) {
            return opportunities;
        }

        const pageSize = this.config.PAGINATION.OPPORTUNITIES_PER_PAGE;
        const startIndex = (page - 1) * pageSize;
        const paginated = opportunities.slice(startIndex, startIndex + pageSize);
        return {
            data: paginated,
            pagination: { 
                current: page, 
                total: Math.ceil(opportunities.length / pageSize), 
                totalItems: opportunities.length, 
                hasNext: (startIndex + pageSize) < opportunities.length, 
                hasPrev: page > 1 
            }
        };
    }
}

module.exports = OpportunityReader;