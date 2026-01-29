/**
 * controllers/contact.controller.js
 * 聯絡人模組控制器
 * * @version 6.1.1
 * * @date 2026-01-15
 * * @description 負責處理聯絡人相關的 HTTP 請求，驗證參數，並呼叫對應的 Service。
 * * 修復了 API 回傳格式以符合前端 contacts.js 的預期 ({ data: [] })。
 */

const { handleApiError } = require('../middleware/error.middleware');

class ContactController {
    /**
     * @param {ContactService} contactService - 核心業務服務
     * @param {WorkflowService} workflowService - 跨模組工作流服務 (用於升級、歸檔)
     * @param {ContactWriter} contactWriter - (Legacy) 部分舊邏輯可能需要的寫入器
     */
    constructor(contactService, workflowService, contactWriter) {
        this.contactService = contactService;
        this.workflowService = workflowService;
        this.contactWriter = contactWriter;
    }

    /**
     * GET /api/contacts
     * 取得潛在客戶列表 (Raw Data)
     * 用於: dashboard.html#contacts 列表顯示
     */
    searchContacts = async (req, res) => {
        try {
            // 1. 呼叫 Service 取得資料
            const result = await this.contactService.getPotentialContacts();
            
            // 2. 格式化回傳
            // ★★★ 關鍵修正 ★★★
            // 前端 (contacts.js) 預期回傳格式為 { data: [...] }
            // 若直接回傳陣列，前端會因為讀取不到 .data 而顯示空白
            res.json({ data: result });
        } catch (error) {
            handleApiError(res, error, 'Get Potential Contacts');
        }
    };

    /**
     * GET /api/contacts/dashboard
     * 取得潛在客戶統計數據
     * 用於: dashboard.html#contacts 上方的統計數據
     */
    getDashboardStats = async (req, res) => {
        try {
            const stats = await this.contactService.getDashboardStats();
            res.json(stats);
        } catch (error) {
            handleApiError(res, error, 'Get Contact Dashboard Stats');
        }
    };

    /**
     * GET /api/contacts/list
     * 搜尋正式聯絡人 (Official List)
     * 用於: 聯絡人管理頁面 (含分頁)
     */
    searchContactList = async (req, res) => {
        try {
            const query = req.query.q || '';
            const page = parseInt(req.query.page || 1);
            
            const result = await this.contactService.searchOfficialContacts(query, page);
            res.json(result);
        } catch (error) {
            handleApiError(res, error, 'Search Contact List');
        }
    };

    /**
     * POST /api/contacts/:rowIndex/upgrade
     * 將潛在客戶升級為機會案件 (Opportunity)
     * 依賴: WorkflowService
     */
    upgradeContact = async (req, res) => {
        try {
            const rowIndex = parseInt(req.params.rowIndex);
            const user = req.user ? req.user.name : 'System';

            // 防呆檢查：確保 WorkflowService 已注入
            if (!this.workflowService) {
                console.error('Critical Error: WorkflowService not initialized in ContactController');
                throw new Error('系統內部錯誤: WorkflowService 未初始化');
            }

            console.log(`[ContactController] Upgrading contact at row ${rowIndex} by ${user}`);

            const result = await this.workflowService.upgradeContactToOpportunity(
                rowIndex, 
                req.body, 
                user
            );
            res.json(result);
        } catch (error) {
            handleApiError(res, error, 'Upgrade Contact');
        }
    };

    /**
     * PUT /api/contacts/:contactId
     * 更新正式聯絡人資料
     */
    updateContact = async (req, res) => {
        try {
            const contactId = req.params.contactId;
            const user = req.user ? req.user.name : 'System';

            const result = await this.contactService.updateContact(
                contactId, 
                req.body, 
                user
            );
            res.json(result);
        } catch (error) {
            handleApiError(res, error, 'Update Contact');
        }
    };

    /**
     * POST /api/contacts/:contactId/link-card
     * 將潛在客戶的名片圖檔連結到正式聯絡人
     */
    linkCardToContact = async (req, res) => {
        try {
            const { contactId } = req.params;
            const { businessCardRowIndex } = req.body;
            const user = req.user ? req.user.name : 'System';

            if (!businessCardRowIndex) {
                return res.status(400).json({ success: false, error: '缺少 businessCardRowIndex 參數' });
            }
            
            const result = await this.workflowService.linkBusinessCardToContact(
                contactId, 
                parseInt(businessCardRowIndex), 
                user
            );
            res.json(result);
        } catch (error) {
            handleApiError(res, error, 'Link Card to Contact');
        }
    };

    /**
     * POST /api/contacts/:rowIndex/file
     * 將潛在客戶歸檔 (隱藏/標記為 Dropped)
     */
    fileContact = async (req, res) => {
        try {
            const rowIndex = parseInt(req.params.rowIndex);
            const user = req.user ? req.user.name : 'System';

            const result = await this.workflowService.fileContact(
                rowIndex, 
                user
            );
            res.json(result);
        } catch (error) {
            handleApiError(res, error, 'File Contact');
        }
    };
}

module.exports = ContactController;