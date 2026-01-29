/**
 * @version 1.0.1
 * @date 2026-01-23
 * @description
 * [Standard A Fix]
 * - 修正 Controller 直接呼叫 Reader 的違規行為
 * - getEventLogById 改為透過 EventLogService 存取資料
 * - API endpoint / response shape / 前端行為 完全不變
 */

const { handleApiError } = require('../middleware/error.middleware');

// 輔助函式：從 req.app 獲取服務
const getServices = (req) => req.app.get('services');

// ==========================================
// Part 1: 事件紀錄 (Event Log) 相關功能
// ==========================================

// POST /api/events
exports.createEventLog = async (req, res) => {
    try {
        const { eventLogService } = getServices(req);
        // 將 req.user.name (操作者) 傳入 Service，確保建立者正確
        res.json(
            await eventLogService.createEvent(
                req.body,
                { displayName: req.user.name }
            )
        );

    } catch (error) {
        handleApiError(res, error, 'Create Event Log');
    }
};

// GET /api/events/:eventId
exports.getEventLogById = async (req, res) => {
    try {
        // 【Standard A 修正】Controller 不可直接呼叫 Reader，統一透過 Service
        const { eventLogService } = getServices(req);
        const data = await eventLogService.getEventById(req.params.eventId);
        res.json({ success: !!data, data });
    } catch (error) {
        handleApiError(res, error, 'Get Event Log By Id');
    }
};

// PUT /api/events/:eventId
exports.updateEventLog = async (req, res) => {
    try {
        const { eventLogService } = getServices(req);
        res.json(
            await eventLogService.updateEventLog(
                req.params.eventId,
                req.body,
                req.user.name
            )
        );
    } catch (error) {
        handleApiError(res, error, 'Update Event Log');
    }
};

// DELETE /api/events/:eventId
exports.deleteEventLog = async (req, res) => {
    try {
        const { eventLogService } = getServices(req);
        res.json(await eventLogService.deleteEventLog(req.params.eventId, req.user.name));
    } catch (error) {
        handleApiError(res, error, 'Delete Event Log');
    }
};

// ==========================================
// Part 2: 日曆 (Calendar) 與 自動同步功能
// ==========================================

// POST /api/calendar/events
exports.createCalendarEvent = async (req, res) => {
    try {
        const { eventService } = getServices(req);
        const result = await eventService.createCalendarEventAndSync(
            req.body,
            req.user
        );
        res.json(result);
    } catch (error) {
        handleApiError(res, error, 'Create Calendar Event & Sync');
    }
};

// GET /api/calendar/week
exports.getThisWeekEvents = async (req, res) => {
    try {
        const { eventService } = getServices(req);
        res.json(await eventService.getThisWeekEvents());
    } catch (error) {
        handleApiError(res, error, 'Get Week Events');
    }
};
