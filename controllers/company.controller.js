/**
 * controllers/company.controller.js
 * 公司模組控制器
 * * @version 7.3.0 (Final Fix: Search Filters & Double Decoding)
 * * @date 2026-01-16
 * * @description
 * * 1. [Fix] getCompanies 支援過濾參數 (q, type, stage, rating)，解決搜尋失效問題。
 * * 2. [Fix] 實作 URI Double Decoding，防止特殊字元導致後端崩潰。
 * * 3. [Architecture] 採用 Class 結構以支援 Service Container 注入。
 */

const { handleApiError } = require('../middleware/error.middleware');

class CompanyController {
    /**
     * 建構子：透過依賴注入取得 CompanyService
     * @param {CompanyService} companyService 
     */
    constructor(companyService) {
        this.companyService = companyService;
    }

    /**
     * 取得公司列表 (支援搜尋與篩選)
     * GET /api/companies?q=...&type=...&stage=...
     */
    getCompanies = async (req, res) => {
        try {
            // [Fix] 從 req.query 提取過濾條件
            // 這些參數將傳遞給 Service 進行記憶體內過濾
            const filters = {
                q: req.query.q || req.query.search || '',
                type: req.query.type,
                stage: req.query.stage,
                rating: req.query.rating
            };

            // 呼叫 Service 的列表方法 (已包含 Activity 排序邏輯)
            const sortedCompanies = await this.companyService.getCompanyListWithActivity(filters);
            
            res.json({ success: true, data: sortedCompanies });
        } catch (error) {
            handleApiError(res, error, 'Get Companies');
        }
    };

    /**
     * 建立新公司
     * POST /api/companies
     */
    createCompany = async (req, res) => {
        try {
            const { companyName } = req.body;
            if (!companyName) {
                return res.status(400).json({ success: false, error: 'Company name is required' });
            }
            
            // 傳入 req.body 作為完整資料 (包含 type, phone 等)，確保一次寫入
            const result = await this.companyService.createCompany(companyName, req.body, req.user);
            res.json(result);
        } catch (error) {
            handleApiError(res, error, 'Create Company');
        }
    };

    /**
     * 取得公司詳細資料 (含關聯資料)
     * GET /api/companies/:companyName/details
     */
    getCompanyDetails = async (req, res) => {
        try {
            // [Security] 針對 URL 參數進行解碼，防止 % 符號或斜線造成錯誤
            const companyName = decodeURIComponent(req.params.companyName);
            
            const result = await this.companyService.getCompanyDetails(companyName);
            res.json({ success: true, data: result });
        } catch (error) {
            handleApiError(res, error, 'Get Company Details');
        }
    };

    /**
     * 更新公司資料
     * PUT /api/companies/:companyName
     */
    updateCompany = async (req, res) => {
        try {
            const companyName = decodeURIComponent(req.params.companyName);
            
            // 呼叫 Service 更新邏輯
            const result = await this.companyService.updateCompany(
                companyName, 
                req.body, 
                req.user
            );
            
            res.json(result);
        } catch (error) {
            handleApiError(res, error, 'Update Company');
        }
    };

    /**
     * 刪除公司
     * DELETE /api/companies/:companyName
     */
    deleteCompany = async (req, res) => {
        try {
            const companyName = decodeURIComponent(req.params.companyName);
            
            const result = await this.companyService.deleteCompany(companyName, req.user);
            res.json(result);
        } catch (error) {
            // 特別處理「有關聯資料無法刪除」的邏輯錯誤，回傳 400 讓前端顯示 Toast
            if (error.message && error.message.startsWith('無法刪除')) {
                return res.status(400).json({ success: false, error: error.message });
            }
            handleApiError(res, error, 'Delete Company');
        }
    };
}

module.exports = CompanyController;