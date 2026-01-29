/**
 * data/contact-sql-reader.js
 * [Strict Digital Forensics Mode]
 * - Type: SQL Reader (Read-Only)
 * - Target: PostgreSQL (Supabase)
 * - Table: contacts
 * - Schema: Strict adherence to provided JSON schema
 * - Constraints: No rowIndex, No guessing, No update/delete
 * - Version: 1.0.0
 * - Date: 2026-01-29
 */

const { supabase } = require('../config/supabase');

class ContactSqlReader {

    constructor() {
        this.tableName = 'contacts';
    }

    /**
     * Get a single contact by ID
     * @param {string} contactId 
     * @returns {Promise<Object|null>} Contact DTO or null
     */
    async getContactById(contactId) {
        if (!contactId) throw new Error('ContactSqlReader: contactId is required');

        try {
            const { data, error } = await supabase
                .from(this.tableName)
                .select('*')
                .eq('contact_id', contactId)
                .single();

            // Ignore "Row not found" (PGRST116), throw strict on others
            if (error) {
                if (error.code === 'PGRST116') {
                    return null;
                }
                throw new Error(`[ContactSqlReader] DB Error: ${error.message}`);
            }

            if (!data) return null;

            return this._mapRowToDto(data);

        } catch (error) {
            console.error('[ContactSqlReader] getContactById Error:', error);
            throw error;
        }
    }

    /**
     * Get all contacts
     * @returns {Promise<Array<Object>>} Array of Contact DTOs
     */
    async getContacts() {
        try {
            const { data, error } = await supabase
                .from(this.tableName)
                .select('*');

            if (error) {
                throw new Error(`[ContactSqlReader] DB Error: ${error.message}`);
            }

            // Map all rows strictly
            return data.map(row => this._mapRowToDto(row));

        } catch (error) {
            console.error('[ContactSqlReader] getContacts Error:', error);
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
            contactId: row.contact_id,
            sourceId: row.source_id,

            // Basic Info
            name: row.name,
            companyId: row.company_id,
            department: row.department,
            jobTitle: row.job_title,

            // Contact Info
            mobile: row.mobile,
            phone: row.phone,
            email: row.email,

            // Metadata / Audit
            createdTime: row.created_time,
            updatedTime: row.updated_time,
            createdBy: row.created_by,
            updatedBy: row.updated_by
        };
    }
}

module.exports = ContactSqlReader;