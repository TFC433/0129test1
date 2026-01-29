/**
 * data/opportunity-sql-reader.js
 * [Strict Digital Forensics Mode]
 * - Type: SQL Reader (Read-Only)
 * - Target: PostgreSQL (Supabase)
 * - Table: opportunities
 * - Schema: Strict adherence to provided schema list
 * - Constraints: No rowIndex, No guessing, No update/delete
 * - Version: 1.0.0
 * - Date: 2026-01-29
 */

const { supabase } = require('../config/supabase');

class OpportunitySqlReader {

    constructor() {
        this.tableName = 'opportunities';
    }

    /**
     * Get a single opportunity by ID
     * @param {string} opportunityId 
     * @returns {Promise<Object|null>} Opportunity DTO or null
     */
    async getOpportunityById(opportunityId) {
        if (!opportunityId) throw new Error('OpportunitySqlReader: opportunityId is required');

        try {
            const { data, error } = await supabase
                .from(this.tableName)
                .select('*')
                .eq('opportunity_id', opportunityId)
                .single();

            // Ignore "Row not found" (PGRST116), throw strict on others
            if (error) {
                if (error.code === 'PGRST116') {
                    return null;
                }
                throw new Error(`[OpportunitySqlReader] DB Error: ${error.message}`);
            }

            if (!data) return null;

            return this._mapRowToDto(data);

        } catch (error) {
            console.error('[OpportunitySqlReader] getOpportunityById Error:', error);
            throw error;
        }
    }

    /**
     * Get all opportunities
     * @returns {Promise<Array<Object>>} Array of Opportunity DTOs
     */
    async getOpportunities() {
        try {
            const { data, error } = await supabase
                .from(this.tableName)
                .select('*');

            if (error) {
                throw new Error(`[OpportunitySqlReader] DB Error: ${error.message}`);
            }

            // Map all rows strictly
            return data.map(row => this._mapRowToDto(row));

        } catch (error) {
            console.error('[OpportunitySqlReader] getOpportunities Error:', error);
            throw error;
        }
    }

    /**
     * Maps Raw SQL Row to DTO
     * Strict adherence to provided schema.
     * snake_case -> camelCase
     */
    _mapRowToDto(row) {
        if (!row) return null;

        return {
            // Identity
            opportunityId: row.opportunity_id,
            parentOpportunityId: row.parent_opportunity_id,

            // Core Info
            opportunityName: row.opportunity_name,
            opportunityType: row.opportunity_type,
            source: row.source,
            owner: row.owner,

            // Customer & Contacts
            customerCompany: row.customer_company,
            mainContact: row.main_contact,
            endCustomerContact: row.end_customer_contact,
            channelContact: row.channel_contact,

            // Sales Details
            salesModel: row.sales_model,
            salesChannel: row.sales_channel,
            currentStage: row.current_stage,
            currentStatus: row.current_status,
            
            // Metrics & Values
            expectedCloseDate: row.expected_close_date,
            winProbability: row.win_probability,
            opportunityValue: row.opportunity_value,
            valueCalcMode: row.value_calc_mode,
            equipmentScale: row.equipment_scale,

            // Products & Details
            productDetails: row.product_details,
            notes: row.notes,
            driveLink: row.drive_link,
            stageHistory: row.stage_history,

            // Metadata / Audit
            createdTime: row.created_time,
            updatedTime: row.updated_time,
            updatedBy: row.updated_by
        };
    }
}

module.exports = OpportunitySqlReader;