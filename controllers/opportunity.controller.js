// controllers/opportunity.controller.js
/**
 * OpportunityController
 * * @version 5.2.0 (Phase 3 - Class Refactoring - Fix Layering)
 * @date 2026-01-20
 * @description 機會案件控制器，最複雜的業務模組。
 * [Fix] 移除對 Reader/Writer 的直接依賴，全面透過 OpportunityService。
 */

const { handleApiError } = require('../middleware/error.middleware');

class OpportunityController {
    /**
     * @param {OpportunityService} opportunityService
     * @param {WorkflowService} workflowService
     * @param {DashboardService} dashboardService
     * @param {OpportunityReader} opportunityReader - (Deprecated in Controller)
     * @param {OpportunityWriter} opportunityWriter - (Deprecated in Controller)
     */
    constructor(opportunityService, workflowService, dashboardService, opportunityReader, opportunityWriter) {
        this.opportunityService = opportunityService;
        this.workflowService = workflowService;
        this.dashboardService = dashboardService;
        this.opportunityReader = opportunityReader;
        this.opportunityWriter = opportunityWriter;
    }

    // GET /api/opportunities/dashboard
    getDashboardData = async (req, res) => {
        try {
            const data = await this.dashboardService.getOpportunitiesDashboardData();
            res.json({ success: true, data });
        } catch (error) {
            handleApiError(res, error, 'Opp Dashboard');
        }
    };

    // GET /api/opportunities/by-county
    getOpportunitiesByCounty = async (req, res) => {
        try {
            // [Fix] Layering: Call Service instead of Reader
            const result = await this.opportunityService.getOpportunitiesByCounty(req.query.opportunityType);
            res.json(result);
        } catch (error) {
            handleApiError(res, error, 'Opp By County');
        }
    };

    // GET /api/opportunities/ (Search)
    searchOpportunities = async (req, res) => {
        try {
            const { q, page = 0, assignee, type, stage } = req.query;
            const filters = { assignee, type, stage };
            Object.keys(filters).forEach(key => (filters[key] === undefined || filters[key] === '') && delete filters[key]);
            
            // [Fix] Layering: Call Service instead of Reader
            const result = await this.opportunityService.searchOpportunities(q, parseInt(page), filters);
            res.json(result);
        } catch (error) {
            handleApiError(res, error, 'Search Opps');
        }
    };

    // GET /api/opportunities/:opportunityId/details
    getOpportunityDetails = async (req, res) => {
        try {
            const data = await this.opportunityService.getOpportunityDetails(req.params.opportunityId);
            res.json({ success: true, data });
        } catch (error) {
            handleApiError(res, error, 'Get Opp Details');
        }
    };

    // POST /api/opportunities/
    createOpportunity = async (req, res) => {
        try {
            // 使用 WorkflowService 處理建立邏輯 (可能包含發通知等)
            const result = await this.workflowService.createOpportunity(req.body, req.user.name);
            res.json(result);
        } catch (error) {
            handleApiError(res, error, 'Create Opp');
        }
    };

    // PUT /api/opportunities/batch
    batchUpdateOpportunities = async (req, res) => {
        try {
            // [Fix] Layering: Call Service instead of Writer
            const result = await this.opportunityService.batchUpdateOpportunities(req.body.updates);
            res.json(result);
        } catch (error) {
            handleApiError(res, error, 'Batch Update Opps');
        }
    };

    // PUT /api/opportunities/:rowIndex
    updateOpportunity = async (req, res) => {
        try {
            const result = await this.opportunityService.updateOpportunity(
                parseInt(req.params.rowIndex), 
                req.body, 
                req.user
            );
            res.json(result);
        } catch (error) {
            handleApiError(res, error, 'Update Opp');
        }
    };

    // DELETE /api/opportunities/:rowIndex
    deleteOpportunity = async (req, res) => {
        try {
            const result = await this.opportunityService.deleteOpportunity(
                parseInt(req.params.rowIndex), 
                req.user
            );
            res.json(result);
        } catch (error) {
            handleApiError(res, error, 'Delete Opp');
        }
    };

    // POST /api/opportunities/:opportunityId/contacts
    addContactToOpportunity = async (req, res) => {
        try {
            const result = await this.opportunityService.addContactToOpportunity(
                req.params.opportunityId, 
                req.body, 
                req.user
            );
            res.json(result);
        } catch (error) {
            handleApiError(res, error, 'Add Contact to Opp');
        }
    };

    // DELETE /api/opportunities/:opportunityId/contacts/:contactId
    deleteContactLink = async (req, res) => {
        try {
            const result = await this.opportunityService.deleteContactLink(
                req.params.opportunityId, 
                req.params.contactId, 
                req.user
            );
            res.json(result);
        } catch (error) {
            handleApiError(res, error, 'Delete Contact Link');
        }
    };
}

module.exports = OpportunityController;