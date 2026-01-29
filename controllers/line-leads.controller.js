/**
 * controllers/line-leads.controller.js
 * LINE LIFF 潛在客戶控制器
 * * @version 7.1.3 (Line-Leads L1→L2)
 * @date 2026-01-26
 * @description Line-Leads L1→L2：移除 Controller 內 Token 驗證實作與 Writer 直接依賴，改由 AuthService + ContactService 承擔。
 * @contract 遵守契約 v1.0：DOM/API/localStorage 不變。
 */

const { handleApiError } = require('../middleware/error.middleware');

class LineLeadsController {
    constructor(contactService, authService) {
        this.contactService = contactService;
        this.authService = authService;
    }

    // GET /api/line/leads
    getAllLeads = async (req, res) => {
        try {
            // 1. 手動提取 Token (因為我們移出了 authMiddleware)
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];

            if (!token) {
                return res.status(401).json({ success: false, message: '未提供 Token' });
            }

            // 2. 驗證（L2：驗證細節移入 AuthService）
            let user = null;

            if (token === 'TEST_LOCAL_TOKEN') {
                // 🚧 本地開發模式：維持原日誌行為
                console.log('🚧 [Dev] 本地模式：跳過 LINE 驗證');
            }

            user = await this.authService.verifyLineIdToken(token);
            if (!user) {
                return res.status(401).json({ success: false, message: 'LINE Token 驗證失敗' });
            }

            // 3. 執行業務邏輯
            if (!this.contactService) {
                throw new Error('ContactService not initialized in Controller');
            }

            const leads = await this.contactService.getPotentialContacts(3000);

            // 包裹回傳格式以符合前端 result.success 檢查
            res.json({
                success: true,
                data: leads
            });

        } catch (error) {
            console.error('⚠ Get All Leads Error:', error);
            handleApiError(res, error, 'Get All Leads');
        }
    };

    // PUT /api/line/leads/:rowIndex
    updateLead = async (req, res) => {
        try {
            // 1. 驗證 (同上)
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];
            if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });

            if (token !== 'TEST_LOCAL_TOKEN') {
                const user = await this.authService.verifyLineIdToken(token);
                if (!user) return res.status(401).json({ success: false, message: 'Invalid Token' });
            }

            // 2. 執行更新
            const rowIndex = parseInt(req.params.rowIndex);
            const updateData = req.body;

            // ★ 行為等價：保持原本 modifier 規則（只看 body，否則 LineUser）
            const modifier = updateData.modifier || 'LineUser';

            // L2：寫入統一委派至 ContactService（移除 Writer 直接依賴）
            await this.contactService.updatePotentialContact(rowIndex, updateData, modifier);

            res.json({ success: true, message: '更新成功' });

        } catch (error) {
            handleApiError(res, error, 'Update Lead');
        }
    };
}

module.exports = LineLeadsController;
