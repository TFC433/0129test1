/**
 * data/company-sql-reader.js
 * [Strict Digital Forensics Mode]
 * - Type: SQL Reader (Read-Only)
 * - Target: PostgreSQL (Supabase)
 * - Table: companies
 * - Schema: Strict adherence to provided JSON schema
 * - Constraints: No rowIndex, No guessing, No update/delete
 * - Version: 1.0.0
 * - Date: 2026-01-29
 */

const { supabase } = require('../config/supabase');

class CompanySqlReader {

    constructor() {
        this.tableName = 'companies';
    }

    /**
     * Get a single company by ID
     * @param {string} companyId 
     * @returns {Promise<Object|null>} Company DTO or null
     */
    async getCompanyById(companyId) {
        if (!companyId) throw new Error('CompanySqlReader: companyId is required');

        try {
            const { data, error } = await supabase
                .from(this.tableName)
                .select('*')
                .eq('company_id', companyId)
                .single();

            // Ignore "Row not found" (PGRST116), throw strict on others
            if (error) {
                if (error.code === 'PGRST116') {
                    return null;
                }
                throw new Error(`[CompanySqlReader] DB Error: ${error.message}`);
            }

            if (!data) return null;

            return this._mapRowToDto(data);

        } catch (error) {
            console.error('[CompanySqlReader] getCompanyById Error:', error);
            throw error;
        }
    }

    /**
     * Get all companies
     * @returns {Promise<Array<Object>>} Array of Company DTOs
     */
    async getCompanies() {
        try {
            const { data, error } = await supabase
                .from(this.tableName)
                .select('*');

            if (error) {
                throw new Error(`[CompanySqlReader] DB Error: ${error.message}`);
            }

            // Map all rows strictly
            return data.map(row => this._mapRowToDto(row));

        } catch (error) {
            console.error('[CompanySqlReader] getCompanies Error:', error);
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
            companyId: row.company_id,
            companyName: row.company_name,

            // Contact Info
            phone: row.phone,
            address: row.address,
            city: row.city,

            // Business Info
            description: row.description,
            companyType: row.company_type,
            customerStage: row.customer_stage,
            interactionRating: row.interaction_rating,

            // Metadata / Audit
            createdTime: row.created_time,
            updatedTime: row.updated_time,
            createdBy: row.created_by,
            updatedBy: row.updated_by
        };
    }
}

module.exports = CompanySqlReader;