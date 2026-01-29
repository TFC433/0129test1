/**
 * routes/line-leads.routes.js
 * @version 1.1.0
 * @date 2026-01-26
 * @description Line-Leads L1→L2：改由 services 容器注入 authService（移除 contactWriter 直接注入）。
 */

const express = require('express');
const router = express.Router();
const LineLeadsController = require('../controllers/line-leads.controller');

// 依賴注入：從 app 中獲取 services
const getController = (req) => {
    const app = req.app;
    const services = app.get('services');

    const { contactService, authService } = services;

    if (!authService) {
        throw new Error("authService is not available in app.get('services'). Make sure services/index.js includes authService.");
    }

    return new LineLeadsController(contactService, authService);
};

// GET /api/line/leads - 取得所有名片資料
router.get('/leads', (req, res) => getController(req).getAllLeads(req, res));

// PUT /api/line/leads/:rowIndex - 更新特定名片狀態/資料
router.put('/leads/:rowIndex', (req, res) => getController(req).updateLead(req, res));

module.exports = router;
