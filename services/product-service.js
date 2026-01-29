/**
 * services/product-service.js
 * 商品管理服務
 * * @version 5.2.1 (Phase 4 Optimization)
 * @date 2026-01-13
 * @author Gemini (System Architect)
 * @description 負責市場商品資料的查詢、建立與維護。
 * 優化：實作 batchUpdate 的 Dirty Checking (差異更新) 與 Rate Limiting (速率限制) 以解決 429 錯誤。
 */

class ProductService {
    /**
     * @param {ProductReader} productReader
     * @param {ProductWriter} productWriter
     * @param {SystemReader} systemReader - 用於讀取分類排序設定
     * @param {SystemWriter} systemWriter - 用於寫入分類排序設定
     */
    constructor(productReader, productWriter, systemReader, systemWriter) {
        this.productReader = productReader;
        this.productWriter = productWriter;
        this.systemReader = systemReader;
        this.systemWriter = systemWriter;
    }

    /**
     * 取得所有商品列表
     * @param {Object} filters - 選填篩選條件 { category, status, search }
     */
    async getAllProducts(filters = {}) {
        try {
            let products = await this.productReader.getAllProducts();

            // 記憶體內篩選 (In-Memory Filtering)
            if (filters.category) {
                products = products.filter(p => p.category === filters.category);
            }
            if (filters.status) {
                products = products.filter(p => p.status === filters.status);
            }
            if (filters.search) {
                const term = filters.search.toLowerCase();
                products = products.filter(p => 
                    (p.name && p.name.toLowerCase().includes(term)) ||
                    (p.id && p.id.toLowerCase().includes(term))
                );
            }

            return products;
        } catch (error) {
            console.error('[ProductService] getAllProducts Error:', error);
            // 根據安全策略，這裡可以選擇拋出錯誤或回傳空陣列
            // 為了讓前端不掛掉，暫時回傳空陣列，但記錄錯誤
            return [];
        }
    }

    /**
     * 取得單一商品詳情
     * @param {string} productId 
     */
    async getProductById(productId) {
        try {
            const products = await this.productReader.getAllProducts();
            return products.find(p => p.id === productId) || null;
        } catch (error) {
            console.error(`[ProductService] getProductById Error (${productId}):`, error);
            return null;
        }
    }

    /**
     * 建立新商品
     * @param {Object} productData 
     * @param {Object} user 
     */
    async createProduct(productData, user) {
        try {
            const modifier = user.displayName || user.username || 'System';
            // 資料清洗或驗證可在此執行
            return await this.productWriter.createProduct(productData, modifier);
        } catch (error) {
            console.error('[ProductService] createProduct Error:', error);
            throw error;
        }
    }

    /**
     * ★★★ 優化版：批次更新商品 (支援差異更新與速率限制) ★★★
     * @param {Array} products 
     * @param {Object} user 
     */
    async batchUpdate(products, user) {
        if (!Array.isArray(products)) {
            throw new Error('Invalid input: products must be an array');
        }

        const modifier = user.displayName || user.username || 'System';
        const stats = { updated: 0, appended: 0, skipped: 0, errors: 0 };
        
        console.log(`🔄 [ProductService] 開始批次處理 ${products.length} 筆資料...`);

        // 1. 取得現有資料以進行比對 (Dirty Checking)
        // 必須強制重新讀取一次，確保比對基準是最新的，避免覆蓋他人修改
        if (this.productReader.clearCache) this.productReader.clearCache();
        const currentProducts = await this.productReader.getAllProducts();
        
        // 建立 Map 加速查找: ID -> Product Object
        const productMap = new Map(currentProducts.map(p => [p.id, p]));

        // 2. 逐筆處理
        for (const item of products) {
            try {
                const existing = productMap.get(item.id);

                if (existing) {
                    // 檢查是否真的有變更 (Dirty Checking)
                    if (this._hasChanges(existing, item)) {
                        console.log(`📝 [Diff] 偵測到變更: ${item.id} (${item.name})`);
                        
                        await this.productWriter.updateProduct(existing.rowIndex, item, modifier);
                        stats.updated++;
                        
                        // ★★★ Rate Limiting 保護 ★★★
                        // 每寫入一筆，暫停 300ms，防止 Google API 429 錯誤
                        // (Google Quota 約為每分鐘 60 次寫入，300ms 間隔相對安全)
                        await this._delay(300);
                    } else {
                        // 資料完全相同，跳過不寫入
                        stats.skipped++;
                    }
                } else {
                    // 新增模式
                    console.log(`➕ [New] 新增商品: ${item.id}`);
                    await this.productWriter.createProduct(item, modifier);
                    stats.appended++;
                    
                    // 新增操作通常較慢，給予較長的緩衝
                    await this._delay(500);
                }
            } catch (err) {
                console.error(`❌ [ProductService] Batch update failed for ID ${item.id}:`, err);
                stats.errors++;
            }
        }
        
        console.log(`✅ [ProductService] 批次處理完成: 更新=${stats.updated}, 新增=${stats.appended}, 跳過=${stats.skipped}, 失敗=${stats.errors}`);

        // 操作完成後再次清除快取，確保下次讀取正確
        await this.refreshCache();
        
        return stats;
    }

    /**
     * 【內部輔助】比對兩筆商品資料是否有實質差異
     * @param {Object} existing - 現有資料 (來自 Reader)
     * @param {Object} incoming - 傳入資料 (來自 Frontend)
     * @returns {boolean} true 表示有差異，需要更新
     */
    _hasChanges(existing, incoming) {
        // 定義需要比對的欄位 (排除系統欄位如 rowIndex, createTime, lastModifier 等)
        const fieldsToCheck = [
            'name', 'category', 'group', 'combination', 'unit', 'spec',
            'cost', 'priceMtb', 'priceSi', 'priceMtu',
            'supplier', 'series', 'interface', 'property', 'aspect',
            'description', 'status'
        ];

        for (const field of fieldsToCheck) {
            let val1 = existing[field];
            let val2 = incoming[field];

            // 標準化：處理 undefined/null 轉為空字串
            if (val1 === undefined || val1 === null) val1 = '';
            if (val2 === undefined || val2 === null) val2 = '';

            // 轉為字串並 trim 後比對，忽略型別差異 (如 100 vs "100")
            if (String(val1).trim() !== String(val2).trim()) {
                // console.log(`Difference found in ${field}: "${val1}" vs "${val2}"`); // Debug用
                return true;
            }
        }

        return false;
    }

    /**
     * 【內部輔助】延遲函式
     * @param {number} ms - 毫秒
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 強制重新整理快取
     */
    async refreshCache() {
        if (this.productReader.clearCache) {
            this.productReader.clearCache();
        }
        if (this.systemReader.clearCache) {
            this.systemReader.clearCache();
        }
        // 預熱
        await this.productReader.getAllProducts();
    }

    // ============================================================
    // ★★★ Phase 4 Refactoring: 分類排序邏輯移入 Service ★★★
    // ============================================================

    /**
     * 獲取產品分類排序
     * @returns {Promise<Array<string>>} 分類名稱陣列
     */
    async getCategoryOrder() {
        try {
            const systemConfig = await this.systemReader.getSystemConfig();
            
            // 讀取 SystemPref 中的 PRODUCT_CATEGORY_ORDER
            if (systemConfig && systemConfig['SystemPref']) {
                const pref = systemConfig['SystemPref'].find(p => p.value === 'PRODUCT_CATEGORY_ORDER');
                if (pref && pref.note) {
                    return JSON.parse(pref.note);
                }
            }
            return []; // 若未設定則回傳空陣列
        } catch (error) {
            console.warn('[ProductService] getCategoryOrder Failed:', error);
            return [];
        }
    }

    /**
     * 儲存產品分類排序
     * @param {Array<string>} order - 分類名稱陣列
     * @param {Object} user - 操作者
     */
    async saveCategoryOrder(order, user) {
        try {
            if (!Array.isArray(order)) throw new Error('Order must be an array');
            
            // 寫入 SystemPref (依賴 SystemWriter.updateSystemPref 方法)
            // 這裡不需要像 Batch Update 那麼嚴格的 Rate Limit，因為是單次操作
            await this.systemWriter.updateSystemPref('PRODUCT_CATEGORY_ORDER', JSON.stringify(order));
            
            // 清除 System 快取
            if (this.systemReader.clearCache) {
                this.systemReader.clearCache();
            }
            
            return { success: true };
        } catch (error) {
            console.error('[ProductService] saveCategoryOrder Failed:', error);
            throw error;
        }
    }
}

module.exports = ProductService;