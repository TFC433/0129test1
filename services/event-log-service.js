/**
 * services/event-log-service.js
 * 事件紀錄服務邏輯
 * @version 5.2.0 (Phase 5 - SQL Reader Fallback Injection)
 * @date 2026-01-29
 * @description
 * [Standard A] Join 邏輯集中在 Service；所有回傳物件皆 clone，避免污染 Reader Cache。
 * [Hotfix] 當 eventType 變更時，rowIndex 不可跨 sheet update，必須 delete + create (Move)。
 * [Fix] deleteEventLog: 修正 Controller 呼叫斷裂，新增 eventId 解析邏輯。
 * [Test] 注入 EventLogSqlReader 供讀取測試，失敗時 Fallback 至 Sheet Reader。
 * 依賴注入：EventLogReader, EventLogWriter, OpportunityReader, CompanyReader, SystemReader, CalendarService
 */

// [Patch] 引入 SQL Reader 供測試期雙軌並行
const EventLogSqlReader = require('../data/event-log-sql-reader');

class EventLogService {
    constructor(eventReader, eventWriter, oppReader, companyReader, systemReader, calendarService) {
        this.eventReader = eventReader;
        this.eventWriter = eventWriter;
        this.oppReader = oppReader;
        this.companyReader = companyReader;
        this.systemReader = systemReader;
        this.calendarService = calendarService;

        // [Patch] 測試期硬性注入 SQL Reader (不經由 DI Container)
        this.sqlReader = new EventLogSqlReader();
    }

    _invalidateEventCacheSafe() {
        try {
            if (this.eventReader && typeof this.eventReader.invalidateCache === 'function') {
                this.eventReader.invalidateCache('eventLogs');
            } else if (this.eventReader && this.eventReader.cache) {
                // fallback: clear all cache if invalidateCache is not available
                this.eventReader.cache = {};
            }
        } catch (e) {
            // do nothing
        }
    }

    async getAllEvents() {
        try {
            // [Patch Start] SQL Read Priority with Fallback
            let events;
            try {
                events = await this.sqlReader.getEventLogs();
                // 簡易驗證：若 SQL 回傳非陣列或 null，視為失敗
                if (!Array.isArray(events)) throw new Error('SQL returned invalid structure');
                console.log('[EventLogService] getAllEvents: Serving from SQL Reader');
            } catch (sqlError) {
                console.error('[EventLogService] getAllEvents: SQL Read Failed, fallback to Sheet.', sqlError.message);
                // Fallback: 使用原本的 Sheet Reader
                events = await this.eventReader.getEventLogs();
            }
            // [Patch End]

            // [Modified] 將原本 Promise.all 中的 getEventLogs 移除，因為 events 已在上方取得
            const [opps, comps] = await Promise.all([
                this.oppReader.getOpportunities(),
                this.companyReader.getCompanyList()
            ]);

            const oppMap = new Map(opps.map(o => [o.opportunityId, o.opportunityName]));
            const compMap = new Map(comps.map(c => [c.companyId, c.companyName]));

            return events.map(raw => {
                const e = { ...raw }; // clone

                // alias for compatibility
                if (!e.id && e.eventId) e.id = e.eventId;

                if (e.opportunityId) e.opportunityName = oppMap.get(e.opportunityId) || e.opportunityId;
                if (e.companyId) e.companyName = compMap.get(e.companyId) || e.companyId;

                return e;
            });
        } catch (error) {
            console.error('[EventLogService] getAllEvents Error:', error);
            return [];
        }
    }

    async getEventById(eventId) {
        try {
            // [Patch Start] SQL Read Priority with Fallback
            let rawEvent;
            try {
                rawEvent = await this.sqlReader.getEventLogById(eventId);
                if (!rawEvent) throw new Error(`Event ${eventId} not found in SQL`);
                console.log(`[EventLogService] getEventById: Serving ${eventId} from SQL Reader`);
            } catch (sqlError) {
                console.error(`[EventLogService] getEventById: SQL Read Failed for ${eventId}, fallback to Sheet.`, sqlError.message);
                // Fallback: 使用原本的 Sheet Reader
                rawEvent = await this.eventReader.getEventLogById(eventId);
            }
            // [Patch End]

            if (!rawEvent) return null;

            const event = { ...rawEvent }; // clone
            if (!event.id && event.eventId) event.id = event.eventId;

            try {
                const [opps, comps] = await Promise.all([
                    this.oppReader.getOpportunities(),
                    this.companyReader.getCompanyList()
                ]);

                const oppMap = new Map(opps.map(o => [o.opportunityId, o.opportunityName]));
                const compMap = new Map(comps.map(c => [c.companyId, c.companyName]));

                if (event.opportunityId) event.opportunityName = oppMap.get(event.opportunityId) || event.opportunityId;
                if (event.companyId) event.companyName = compMap.get(event.companyId) || event.companyId;
            } catch (joinError) {
                console.warn(`[EventLogService] Join failed for ${eventId}, returning raw clone.`, joinError);
            }

            return event;
        } catch (error) {
            console.error(`[EventLogService] getEventById Error (${eventId}):`, error);
            return null;
        }
    }

    async createEvent(data, user) {
        try {
            const modifier = user?.displayName || user?.username || 'System';

            const result = await this.eventWriter.createEventLog(data, modifier);
            this._invalidateEventCacheSafe();

            if (result.success && data.syncToCalendar === 'true') {
                try {
                    const startIso = new Date(data.createdTime || Date.now()).toISOString();
                    const endIso = new Date(Date.now() + 3600000).toISOString();

                    const calendarEvent = {
                        summary: `[${data.eventType}] ${data.eventName}`,
                        description: data.eventContent || '',
                        start: { dateTime: startIso },
                        end: { dateTime: endIso }
                    };

                    await this.calendarService.createEvent(calendarEvent);
                } catch (calError) {
                    console.warn('[EventLogService] Calendar sync failed:', calError);
                }
            }

            return result;
        } catch (error) {
            console.error('[EventLogService] createEvent Error:', error);
            throw error;
        }
    }

    async updateEvent(rowIndex, data, user) {
        try {
            const modifier = user?.displayName || user?.username || 'System';
            const result = await this.eventWriter.updateEventLog(rowIndex, data, modifier);
            this._invalidateEventCacheSafe();
            return result;
        } catch (error) {
            console.error(`[EventLogService] updateEvent Error (Row: ${rowIndex}):`, error);
            throw error;
        }
    }

    /**
     * [Proxy] 兼容舊 Controller：允許 eventId 或 rowIndex
     * [Hotfix] 若 eventType 變更，必須 Move：delete(old sheet row) + create(new sheet row)
     */
    async updateEventLog(idOrRowIndex, data, modifier) {
        // 1) 先嘗試拿到 eventId（前端可能傳 eventId，也可能只傳 rowIndex）
        const inputEventId = data?.eventId || data?.id || null;

        // 2) 先讀全列表（這裡是必要的：用來解析原始 rowIndex / 原 eventType）
        // [Note] Update 流程必須依賴 Sheet 的 rowIndex，因此直接呼叫 Sheet Reader，不走 SQL fallback 邏輯
        const logs = await this.eventReader.getEventLogs();

        let original = null;

        // 2a) 優先用 eventId 找原事件（最準）
        if (inputEventId) {
            original = logs.find(l => l.eventId === inputEventId) || null;
        }

        // 2b) 若找不到，再用 rowIndex 猜（風險較高，但保持相容）
        if (!original) {
            const candidateRow = Number(idOrRowIndex);
            if (Number.isInteger(candidateRow)) {
                original = logs.find(l => Number(l.rowIndex) === candidateRow) || null;
            }
        }

        // 3) 若連原事件都找不到，就維持舊行為（交給 writer 報錯）
        //    但我們先把 rowIndex 解析成數字
        let rowIndex = idOrRowIndex;
        if (typeof rowIndex === 'string' && isNaN(Number(rowIndex))) {
            // 傳進來像 eventId 的情況：用 logs 查 rowIndex
            const target = logs.find(l => l.eventId === rowIndex);
            if (!target || !target.rowIndex) {
                throw new Error(`Update Failed: Event ID '${rowIndex}' not found.`);
            }
            rowIndex = target.rowIndex;
        }

        rowIndex = Number(rowIndex);
        if (!Number.isInteger(rowIndex)) {
            throw new Error('Invalid resolved rowIndex');
        }

        // 4) Hotfix：偵測事件種類變更 -> Move
        //    original 必須存在才做 move；否則走原本 update
        if (original && data && data.eventType && original.eventType && data.eventType !== original.eventType) {
            try {
                // (A) 先刪舊的（用原 eventType + 原 rowIndex 才刪得到）
                await this.eventWriter.deleteEventLog(original.rowIndex, original.eventType);

                // (B) 再建新的：保留 eventId（避免前端之後找不到）
                const payload = { ...data };
                payload.eventId = original.eventId;
                payload.id = original.eventId;

                // createdTime 若沒帶，保留原本建立時間（避免時間變動造成排序/顯示怪異）
                if (!payload.createdTime && original.createdTime) payload.createdTime = original.createdTime;

                const createResult = await this.eventWriter.createEventLog(payload, modifier);

                this._invalidateEventCacheSafe();

                // 盡量維持既有 shape：success 至少要有
                if (createResult && typeof createResult === 'object') {
                    return { ...createResult, moved: true };
                }
                return { success: true, moved: true };
            } catch (moveError) {
                console.error('[EventLogService] Move on eventType change failed:', moveError);
                throw moveError;
            }
        }

        // 5) 沒有 eventType 變更 -> 正常 update
        const user = { displayName: modifier };
        return await this.updateEvent(rowIndex, data, user);
    }

    /**
     * [Patch] 實作 Controller 所需的 deleteEventLog 介面
     * 負責將 eventId 解析為 rowIndex 與 eventType 後刪除
     */
    async deleteEventLog(eventId, user) {
        try {
            // 1. 讀取所有事件以查找 eventId (解析 rowIndex 與 eventType)
            // [Note] Delete 流程必須依賴 Sheet 的 rowIndex，因此直接呼叫 Sheet Reader，不走 SQL fallback 邏輯
            const logs = await this.eventReader.getEventLogs();
            const target = logs.find(l => l.eventId === eventId);

            if (!target) {
                throw new Error(`Delete Failed: Event ID '${eventId}' not found.`);
            }

            // 2. 呼叫底層 deleteEvent 進行實體刪除 (複用既有邏輯)
            // 注意：deleteEvent 內部會呼叫 Writer 並 invalidate cache
            console.log(`[EventLogService] Resolved delete for ${eventId} -> Row ${target.rowIndex} (${target.eventType})`);
            return await this.deleteEvent(target.rowIndex, target.eventType, { displayName: user });

        } catch (error) {
            console.error(`[EventLogService] deleteEventLog Error (${eventId}):`, error);
            throw error;
        }
    }

    async deleteEvent(rowIndex, eventType, user) {
        try {
            const result = await this.eventWriter.deleteEventLog(rowIndex, eventType);
            this._invalidateEventCacheSafe();
            return result;
        } catch (error) {
            console.error(`[EventLogService] deleteEvent Error (Row: ${rowIndex}):`, error);
            throw error;
        }
    }

    async getEventTypes() {
        try {
            const config = await this.systemReader.getSystemConfig();
            return config['事件類型'] || [];
        } catch (error) {
            console.error('[EventLogService] getEventTypes Error:', error);
            return [];
        }
    }
}

module.exports = EventLogService;