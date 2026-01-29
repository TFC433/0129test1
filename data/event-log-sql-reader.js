/**
 * data/event-log-sql-reader.js
 * [Strict Digital Forensics Mode]
 * - Type: SQL Reader (Read-Only)
 * - Target: PostgreSQL (Supabase)
 * - Schema: Strict adherence to provided JSON schemas
 * - Constraints: No rowIndex, No guessing, No update/delete
 */

const { supabase } = require('../config/supabase');

class EventLogSqlReader {

    constructor() {
        // 定義表名與對應的 eventType (Hard Rule)
        this.tables = {
            general: 'event_logs_general',
            iot: 'event_logs_iot',
            dt: 'event_logs_dt',
            dx: 'event_logs_dx',
            summary: 'event_logs_summary'
        };
    }

    /**
     * Get a single event by ID
     * Scans all 5 tables. Throws error on DB failure.
     * @param {string} eventId 
     * @returns {Promise<Object|null>} Event DTO or null
     */
    async getEventLogById(eventId) {
        if (!eventId) throw new Error('EventLogSqlReader: eventId is required');

        try {
            // 並行查詢所有分表
            const queries = Object.entries(this.tables).map(async ([type, tableName]) => {
                const { data, error } = await supabase
                    .from(tableName)
                    .select('*')
                    .eq('event_id', eventId)
                    .single();

                // Ignore "Row not found" (PGRST116), throw strict on others
                if (error && error.code !== 'PGRST116') { 
                    throw new Error(`[EventLogSqlReader] DB Error in ${tableName}: ${error.message}`);
                }
                return data ? { type, data } : null;
            });

            const results = await Promise.all(queries);
            const found = results.find(res => res !== null);

            if (!found) return null;

            return this._mapRowToDto(found.data, found.type);

        } catch (error) {
            console.error('[EventLogSqlReader] getEventLogById Error:', error);
            throw error; // Strict re-throw
        }
    }

    /**
     * Get all events
     * Unions data from all 5 tables.
     * @returns {Promise<Array<Object>>} Array of Event DTOs
     */
    async getEventLogs() {
        try {
            const queries = Object.entries(this.tables).map(async ([type, tableName]) => {
                const { data, error } = await supabase
                    .from(tableName)
                    .select('*');

                if (error) {
                    throw new Error(`[EventLogSqlReader] DB Error in ${tableName}: ${error.message}`);
                }
                
                return data.map(row => this._mapRowToDto(row, type));
            });

            const results = await Promise.all(queries);
            
            // Flatten results from all tables
            return results.flat();

        } catch (error) {
            console.error('[EventLogSqlReader] getEventLogs Error:', error);
            throw error; // Strict re-throw
        }
    }

    /**
     * Maps Raw SQL Row to DTO
     * Strict camelCase conversion based on provided schema.
     * No fallback logic. No column guessing.
     */
    _mapRowToDto(row, type) {
        if (!row) return null;

        // Common Base Fields (Available in most schemas)
        const baseDto = {
            // Hard Rules
            rowIndex: null, 
            eventType: type,

            // Identity & Metadata
            eventId: row.event_id,
            creator: row.creator,
            companyId: row.company_id,
            editCount: row.edit_count,
            createdTime: row.created_time,
            lastModifiedTime: row.last_modified_time,
            
            // Core Content
            eventName: row.event_name,
            opportunityId: row.opportunity_id,
            visitPlace: row.visit_place,
            eventContent: row.event_content,
            eventNotes: row.event_notes,
            ourParticipants: row.our_participants,
            clientParticipants: row.client_participants,
            clientQuestions: row.client_questions,
            clientIntelligence: row.client_intelligence
        };

        // Type Specific Mapping (Strict Schema Adherence)
        switch (type) {
            case 'general':
                return baseDto;

            case 'iot':
                return {
                    ...baseDto,
                    iotStatus: row.iot_status,
                    deviceScale: row.device_scale,
                    lineFeatures: row.line_features,
                    painAnalysis: row.pain_analysis,
                    painCategory: row.pain_category,
                    painDescription: row.pain_description,
                    productionStatus: row.production_status,
                    systemArchitecture: row.system_architecture
                };

            case 'dt':
                return {
                    ...baseDto,
                    industry: row.industry,
                    deviceScale: row.device_scale,
                    processingType: row.processing_type
                };

            case 'dx':
                return baseDto;

            case 'summary':
                // Note: Summary table has different column set in provided schema
                return {
                    // Base fields present in summary schema
                    rowIndex: null,
                    eventType: type,
                    eventId: row.event_id,
                    creator: row.creator,
                    companyId: row.company_id,
                    createdTime: row.created_time,
                    opportunityId: row.opportunity_id,
                    visitPlace: row.visit_place,
                    
                    // Summary Specific fields
                    iotStatus: row.iot_status,
                    deviceScale: row.device_scale,
                    participants: row.participants, // Note: Not 'our/client_participants' in schema
                    visitTarget: row.visit_target,
                    companyScale: row.company_scale,
                    lineFeatures: row.line_features,
                    painCategory: row.pain_category,
                    salesChannel: row.sales_channel,
                    demandSummary: row.demand_summary,
                    painExtraNote: row.pain_extra_note,
                    winProbability: row.win_probability,
                    opportunityName: row.opportunity_name,
                    painDescription: row.pain_description,
                    expectedQuantity: row.expected_quantity,
                    fanucExpectation: row.fanuc_expectation,
                    productionStatus: row.production_status,
                    systemArchitecture: row.system_architecture,
                    externalIntegration: row.external_integration
                };

            default:
                return baseDto;
        }
    }
}

module.exports = EventLogSqlReader;