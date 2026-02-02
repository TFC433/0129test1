/**
 * data/weekly-business-sql-reader.js
 * WeeklyBusiness SQL Reader
 * @version 7.0.6 (Final SQL Contract)
 * @date 2026-01-30
 * @description 
 * [Strict Mode]
 * - Implements findAll() for Service compatibility.
 * - Maps SQL columns to Service/Frontend required keys (including Chinese keys).
 * - Read-only (No rowIndex).
 */

const { supabase } = require('../config/supabase');

class WeeklyBusinessSqlReader {

    constructor() {
        this.tableName = 'weekly_business_entries';
    }

    /**
     * [Contract] Service Interface Implementation
     * 讀取所有週報資料，並轉換格式以符合 Service 需求
     */
    async findAll() {
        try {
            const { data, error } = await supabase
                .from(this.tableName)
                .select(`
                    record_id,
                    entry_date,
                    week_id,
                    category,
                    topic,
                    participants,
                    summary_content,
                    todo_items,
                    created_time,
                    updated_time,
                    created_by
                `)
                .order('entry_date', { ascending: false });

            if (error) {
                console.error('[WeeklySqlReader] DB Error:', error);
                throw new Error(`WeeklyBusinessSqlReader DB Error: ${error.message}`);
            }

            return data.map(row => this._mapRowToDto(row));

        } catch (error) {
            console.error('[WeeklySqlReader] findAll Critical Failure:', error);
            throw error;
        }
    }

    /**
     * [Internal] Map SQL Row to DTO
     * 必須包含 Service 邏輯依賴的 Key (例如: '日期' 用於排序)
     */
    _mapRowToDto(row) {
        if (!row) return null;

        return {
            // --- Standard DTO ---
            recordId: row.record_id,
            weekId: row.week_id,
            entryDate: row.entry_date,
            category: row.category,
            topic: row.topic,
            participants: row.participants,
            summaryContent: row.summary_content,
            todoItems: row.todo_items,
            
            // --- Metadata ---
            createdTime: row.created_time,
            updatedTime: row.updated_time,
            creator: row.created_by,

            // --- [CRITICAL] Legacy Compatibility for Service/Frontend ---
            // Service 使用 entry['日期'] 進行 new Date() 排序與計算
            '日期': row.entry_date,
            '分類': row.category,
            '項目': row.topic,
            '內容': row.summary_content,
            '參與人': row.participants,
            '追蹤事項': row.todo_items
        };
    }
}

module.exports = WeeklyBusinessSqlReader;