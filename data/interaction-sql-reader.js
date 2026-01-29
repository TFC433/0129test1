/**
 * data/interaction-sql-reader.js
 * [Strict Digital Forensics Mode]
 * - Type: SQL Reader (Read-Only)
 * - Target: PostgreSQL (Supabase)
 * - Table: interactions
 * - Schema: Strict adherence to provided schema list
 * - Constraints: No rowIndex, No guessing, No update/delete
 * - Version: 1.0.0
 * - Date: 2026-01-29
 */

const { supabase } = require('../config/supabase');

class InteractionSqlReader {

    constructor() {
        this.tableName = 'interactions';
    }

    /**
     * Get a single interaction by ID
     * @param {string} interactionId 
     * @returns {Promise<Object|null>} Interaction DTO or null
     */
    async getInteractionById(interactionId) {
        if (!interactionId) throw new Error('InteractionSqlReader: interactionId is required');

        try {
            const { data, error } = await supabase
                .from(this.tableName)
                .select('*')
                .eq('interaction_id', interactionId)
                .single();

            // Ignore "Row not found" (PGRST116), throw strict on others
            if (error) {
                if (error.code === 'PGRST116') {
                    return null;
                }
                throw new Error(`[InteractionSqlReader] DB Error: ${error.message}`);
            }

            if (!data) return null;

            return this._mapRowToDto(data);

        } catch (error) {
            console.error('[InteractionSqlReader] getInteractionById Error:', error);
            throw error;
        }
    }

    /**
     * Get all interactions
     * @returns {Promise<Array<Object>>} Array of Interaction DTOs
     */
    async getInteractions() {
        try {
            const { data, error } = await supabase
                .from(this.tableName)
                .select('*');

            if (error) {
                throw new Error(`[InteractionSqlReader] DB Error: ${error.message}`);
            }

            // Map all rows strictly
            return data.map(row => this._mapRowToDto(row));

        } catch (error) {
            console.error('[InteractionSqlReader] getInteractions Error:', error);
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
            // Identity & Relations
            interactionId: row.interaction_id,
            opportunityId: row.opportunity_id,
            companyId: row.company_id,

            // Core Details
            interactionTime: row.interaction_time,
            interactionType: row.interaction_type,
            eventTitle: row.event_title,
            contentSummary: row.content_summary,

            // Metadata & Actions
            participants: row.participants,
            nextAction: row.next_action,
            attachmentLink: row.attachment_link,
            calendarEventId: row.calendar_event_id,
            recorder: row.recorder,
            
            // Audit
            createdTime: row.created_time
        };
    }
}

module.exports = InteractionSqlReader;