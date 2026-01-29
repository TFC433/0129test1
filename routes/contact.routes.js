/**
 * routes/contact.routes.js
 * 聯絡人/潛在客戶模組路由
 * * @version 6.1.1 (Fixed: Dashboard Route & Data Shape)
 * @date 2026-01-15
 */
const express = require('express');
const router = express.Router();
const ContactController = require('../controllers/contact.controller');

// =======================================================
// 🏭 Controller Factory
// =======================================================
const getController = (req) => {
    const services = req.app.get('services');
    if (!services.contactService || !services.workflowService) {
        throw new Error('System Service Error: Contact or Workflow service not available.');
    }
    return new ContactController(
        services.contactService,
        services.workflowService,
        services.contactWriter
    );
};

// =======================================================
// 🛣️ Route Definitions
// =======================================================

// GET /api/contacts/dashboard (新增：統計資料路由)
// ★★★ 必須放在 '/' 或 '/:id' 之前，否則會被攔截 ★★★
router.get('/dashboard', async (req, res, next) => {
    try {
        await getController(req).getDashboardStats(req, res);
    } catch (e) { next(e); }
});

// GET /api/contacts (列表搜尋)
router.get('/', async (req, res, next) => {
    try {
        await getController(req).searchContacts(req, res);
    } catch (e) { next(e); }
});

// GET /api/contacts/list (正式名單)
router.get('/list', async (req, res, next) => {
    try {
        await getController(req).searchContactList(req, res);
    } catch (e) { next(e); }
});

// POST /api/contacts/:rowIndex/upgrade (升級)
router.post('/:rowIndex/upgrade', async (req, res, next) => {
    try {
        await getController(req).upgradeContact(req, res);
    } catch (e) { next(e); }
});

// PUT /api/contacts/:contactId (更新)
router.put('/:contactId', async (req, res, next) => {
    try {
        await getController(req).updateContact(req, res);
    } catch (e) { next(e); }
});

// POST /api/contacts/:contactId/link-card (連結名片)
router.post('/:contactId/link-card', async (req, res, next) => {
    try {
        await getController(req).linkCardToContact(req, res);
    } catch (e) { next(e); }
});

// POST /api/contacts/:rowIndex/file (歸檔)
router.post('/:rowIndex/file', async (req, res, next) => {
    try {
        await getController(req).fileContact(req, res);
    } catch (e) { next(e); }
});

module.exports = router;