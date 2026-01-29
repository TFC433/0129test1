// controllers/system.controller.js
const { handleApiError } = require('../middleware/error.middleware');
// [New] 引入 SystemService 以支援向後相容的內部實例化
const SystemService = require('../services/system-service');

class SystemController {
    /**
     * @param {SystemService|SystemReader} arg1 - SystemService 或 SystemReader (Legacy)
     * @param {DashboardService|SystemWriter} arg2 - DashboardService 或 SystemWriter (Legacy)
     * @param {DashboardService} [arg3] - DashboardService (Legacy only)
     */
    constructor(arg1, arg2, arg3) {
        // Duck Typing: 若第一個參數具有 getSystemConfig 方法，判定為 SystemService
        const isService = arg1 && typeof arg1.getSystemConfig === 'function';

        if (isService) {
            // 新式注入: (systemService, dashboardService)
            this.systemService = arg1;
            this.dashboardService = arg2;
        } else {
            // 舊式注入相容: (systemReader, systemWriter, dashboardService)
            // 內部自行組裝 Service
            this.systemService = new SystemService(arg1, arg2);
            this.dashboardService = arg3;
        }
    }

    // 處理 GET /api/config
    getSystemConfig = async (req, res) => {
        try {
            const config = await this.systemService.getSystemConfig();
            res.json(config);
        } catch (error) {
            handleApiError(res, error, 'Get Config');
        }
    };

    // 處理 POST /api/cache/invalidate
    invalidateCache = async (req, res) => {
        try {
            const result = await this.systemService.invalidateCache();
            res.json(result);
        } catch (error) {
            handleApiError(res, error, 'Invalidate Cache');
        }
    };

    // 處理 GET /api/system/status
    getSystemStatus = async (req, res) => {
        try {
            const result = await this.systemService.getSystemStatus();
            res.json(result);
        } catch (error) {
            handleApiError(res, error, 'Get System Status');
        }
    };

    // --- Dashboard 聚合方法 (維持使用 DashboardService) ---

    // 處理 GET /api/dashboard
    getDashboardData = async (req, res) => {
        try {
            const data = await this.dashboardService.getDashboardData();
            res.json({ success: true, data });
        } catch (error) {
            handleApiError(res, error, 'Get Dashboard');
        }
    };

    // 處理 GET /api/contacts/dashboard
    getContactsDashboardData = async (req, res) => {
        try {
            const data = await this.dashboardService.getContactsDashboardData();
            res.json({ success: true, data });
        } catch (error) {
            handleApiError(res, error, 'Get Contacts Dashboard');
        }
    };

    // 處理 GET /api/events/dashboard
    getEventsDashboardData = async (req, res) => {
        try {
            const data = await this.dashboardService.getEventsDashboardData();
            res.json({ success: true, data });
        } catch (error) {
            handleApiError(res, error, 'Get Events Dashboard');
        }
    };

    // 處理 GET /api/companies/dashboard
    getCompaniesDashboardData = async (req, res) => {
        try {
            const data = await this.dashboardService.getCompaniesDashboardData();
            res.json({ success: true, data });
        } catch (error) {
            handleApiError(res, error, 'Get Companies Dashboard');
        }
    };
}

module.exports = SystemController;