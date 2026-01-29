/**
 * services/workflow-service.js
 * 工作流程服務
 * * @version 5.0.0 (Phase 5 Refactoring)
 * @date 2026-01-09
 * @description 負責處理跨模組的複雜業務流程，例如「機會轉訂單」、「聯絡人升級」等。
 * 依賴注入：OpportunityService, InteractionService, ContactService
 */

class WorkflowService {
    /**
     * @param {OpportunityService} opportunityService
     * @param {InteractionService} interactionService
     * @param {ContactService} contactService
     */
    constructor(opportunityService, interactionService, contactService) {
        this.opportunityService = opportunityService;
        this.interactionService = interactionService;
        this.contactService = contactService;
    }

    /**
     * 執行機會案件結案流程
     * @param {string} opportunityId 
     * @param {string} result - 'Won' | 'Lost'
     * @param {Object} user 
     */
    async closeOpportunity(opportunityId, result, user) {
        try {
            const status = result === 'Won' ? '已成交' : '已結案(失敗)';
            
            // 1. 更新機會狀態
            await this.opportunityService.updateOpportunity(
                opportunityId, 
                { currentStatus: '已完成', currentStage: status }, 
                user
            );

            // 2. 自動建立結案互動紀錄
            await this.interactionService.createInteraction({
                opportunityId: opportunityId,
                eventTitle: `[系統自動] 機會結案 - ${result}`,
                eventType: '系統紀錄',
                contentSummary: `使用者 ${user.displayName} 將此機會標記為 ${result}。`,
                interactionTime: new Date().toISOString()
            }, user);

            return { success: true, message: `機會已結案 (${result})` };
        } catch (error) {
            console.error('[WorkflowService] closeOpportunity Error:', error);
            throw error;
        }
    }

    /**
     * 將潛在客戶升級為正式聯絡人，並自動建立初始機會
     * @param {Object} rawContactData 
     * @param {Object} user 
     */
    async upgradeContactAndCreateOpp(rawContactData, user) {
        try {
            // 1. 建立正式聯絡人
            const contactResult = await this.contactService.createContact(rawContactData, user);
            
            // 2. 如果成功，建立初始機會
            if (contactResult.success && contactResult.id) {
                const oppResult = await this.opportunityService.createOpportunity({
                    opportunityName: `${rawContactData.name} - 初始商機`,
                    mainContact: rawContactData.name, // 暫存名稱，理想應存 ID
                    currentStage: '01_初步接觸'
                }, user);

                // 3. 建立關聯 (如果 OpportunityService 有提供此 API)
                // await this.opportunityService.linkContact(oppResult.id, contactResult.id);
                
                return { 
                    success: true, 
                    contactId: contactResult.id, 
                    opportunityId: oppResult.id 
                };
            }
            throw new Error('聯絡人建立失敗');
        } catch (error) {
            console.error('[WorkflowService] upgradeContactAndCreateOpp Error:', error);
            throw error;
        }
    }
}

module.exports = WorkflowService;