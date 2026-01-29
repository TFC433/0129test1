// routes/opportunity.routes.js
/**
 * Opportunity Routes
 * * @version 5.1.0 (Phase 3 - Service Locator Pattern)
 * @date 2026-01-13
 */

const express = require('express');
const router = express.Router();

// 輔助函式
const getController = (req) => {
    const services = req.app.get('services');
    if (!services || !services.opportunityController) {
        throw new Error('OpportunityController 尚未初始化');
    }
    return services.opportunityController;
};

// GET /api/opportunities/dashboard
router.get('/dashboard', (req, res, next) => {
    getController(req).getDashboardData(req, res, next);
});

// GET /api/opportunities/by-county
router.get('/by-county', (req, res, next) => {
    getController(req).getOpportunitiesByCounty(req, res, next);
});

// GET /api/opportunities/
router.get('/', (req, res, next) => {
    getController(req).searchOpportunities(req, res, next);
});

// GET /api/opportunities/:opportunityId/details
router.get('/:opportunityId/details', (req, res, next) => {
    getController(req).getOpportunityDetails(req, res, next);
});

// POST /api/opportunities/
router.post('/', (req, res, next) => {
    getController(req).createOpportunity(req, res, next);
});

// PUT /api/opportunities/batch
router.put('/batch', (req, res, next) => {
    getController(req).batchUpdateOpportunities(req, res, next);
});

// PUT /api/opportunities/:rowIndex
router.put('/:rowIndex', (req, res, next) => {
    getController(req).updateOpportunity(req, res, next);
});

// DELETE /api/opportunities/:rowIndex
router.delete('/:rowIndex', (req, res, next) => {
    getController(req).deleteOpportunity(req, res, next);
});

// POST /api/opportunities/:opportunityId/contacts
router.post('/:opportunityId/contacts', (req, res, next) => {
    getController(req).addContactToOpportunity(req, res, next);
});

// DELETE /api/opportunities/:opportunityId/contacts/:contactId
router.delete('/:opportunityId/contacts/:contactId', (req, res, next) => {
    getController(req).deleteContactLink(req, res, next);
});

module.exports = router;