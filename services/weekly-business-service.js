/* [v7.0.4] Weekly Standard A + S Final Polish */
/**
 * services/weekly-business-service.js
 * 週間業務邏輯服務 (Service Layer)
 * * @version 7.0.1 (Standard A + S Final)
 * @date 2026-01-23
 * @description 
 * [Final Polish]
 * 1. deleteWeeklyBusinessEntry 介面修正 (移除 rowIndex 參數)。
 * 2. getEntriesForWeek 增加明確的 View-only 欄位標記。
 */

class WeeklyBusinessService {
    /**
     * 透過 Service Container 注入依賴
     */
    constructor({ 
        weeklyBusinessReader, 
        weeklyBusinessWriter, 
        dateHelpers, 
        calendarService, 
        systemReader,
        opportunityService, 
        config 
    }) {
        this.weeklyBusinessReader = weeklyBusinessReader;
        this.weeklyBusinessWriter = weeklyBusinessWriter;
        this.dateHelpers = dateHelpers;
        this.calendarService = calendarService;
        this.systemReader = systemReader;
        this.opportunityService = opportunityService;
        this.config = config;
    }

    /**
     * 獲取特定週次的所有條目
     * [View-Only] 負責 Filter, Sort, Day Calculation
     * @param {string} weekId - 週次 ID (e.g., "2026-W03")
     */
    async getEntriesForWeek(weekId) {
        try {
            // 1. 取得全量資料 (Raw)
            const allEntries = await this.weeklyBusinessReader.getAllEntries();
            
            // 2. Filter by weekId
            let entries = allEntries.filter(entry => entry.weekId === weekId);
            
            // 3. Sort by Date (Desc)
            entries.sort((a, b) => new Date(b['日期']) - new Date(a['日期']));

            // 4. Calculate 'day' (View-Only Field)
            entries = entries.map(entry => {
                let dayValue = -1;
                try {
                    const dateString = entry['日期'];
                    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
                        const [year, month, day] = dateString.split('-').map(Number);
                        // 使用 UTC 避免時區偏差導致週幾計算錯誤
                        const entryDateUTC = new Date(Date.UTC(year, month - 1, day));
                        if (!isNaN(entryDateUTC.getTime())) {
                            dayValue = entryDateUTC.getUTCDay();
                        }
                    }
                } catch (e) {
                    dayValue = -1;
                }

                return {
                    ...entry,
                    // [Backward Compatibility] 前端既有邏輯依賴 entry.day
                    day: dayValue,
                    // [Standard A+S] 明確的 View-only 結構標記
                    _view: { day: dayValue }
                };
            });

            return entries || [];
        } catch (error) {
            console.error(`[WeeklyService] getEntriesForWeek Error (${weekId}):`, error);
            return [];
        }
    }

    /**
     * 獲取週報列表摘要
     */
    async getWeeklyBusinessSummaryList() {
        try {
            const rawData = await this.weeklyBusinessReader.getWeeklySummary();
            
            const weekSummaryMap = new Map();
            rawData.forEach(item => {
                const { weekId, summaryContent } = item;
                if (weekId && /^\d{4}-W\d{2}$/.test(weekId)) {
                    if (!weekSummaryMap.has(weekId)) {
                        weekSummaryMap.set(weekId, { weekId: weekId, summaryCount: 0 });
                    }
                    if (summaryContent && summaryContent.trim() !== '') {
                        weekSummaryMap.get(weekId).summaryCount++;
                    }
                }
            });
            const summaryData = Array.from(weekSummaryMap.values());
            
            const weeksList = summaryData.map(item => {
                const weekId = item.weekId;
                const weekInfo = this.dateHelpers.getWeekInfo(weekId);
                
                return {
                    id: weekId,
                    title: weekInfo.title,
                    dateRange: weekInfo.dateRange,
                    summaryCount: item.summaryCount
                };
            });

            // UX 優化：確保「本週」總是存在
            const today = new Date();
            const currentWeekId = this.dateHelpers.getWeekId(today);
            const currentWeekInfo = this.dateHelpers.getWeekInfo(currentWeekId);
            const hasCurrentWeek = weeksList.some(w => w.title === currentWeekInfo.title);

            if (!hasCurrentWeek) {
                 weeksList.unshift({
                     id: currentWeekId, 
                     title: currentWeekInfo.title,
                     dateRange: currentWeekInfo.dateRange,
                     summaryCount: 0
                 });
            }

            return weeksList.sort((a, b) => b.id.localeCompare(a.id));

        } catch (error) {
            console.error('[WeeklyService] getWeeklyBusinessSummaryList Error:', error);
            throw error;
        }
    }

    /**
     * 獲取單週詳細資料 (包含日曆過濾邏輯)
     */
    async getWeeklyDetails(weekId, userId = null) {
        const weekInfo = this.dateHelpers.getWeekInfo(weekId);
        
        let entriesForWeek = await this.getEntriesForWeek(weekId);
        
        // 日曆與系統設定讀取
        const firstDay = new Date(weekInfo.days[0].date + 'T00:00:00'); 
        const lastDay = new Date(weekInfo.days[weekInfo.days.length - 1].date + 'T00:00:00'); 
        const endQueryDate = new Date(lastDay.getTime() + 24 * 60 * 60 * 1000); 

        const queries = [
            this.calendarService.getHolidaysForPeriod(firstDay, endQueryDate), 
            this.systemReader.getSystemConfig() 
        ];

        if (this.config.PERSONAL_CALENDAR_ID) {
            queries.push(
                this.calendarService.getEventsForPeriod(firstDay, endQueryDate, this.config.PERSONAL_CALENDAR_ID)
            );
        } else {
            queries.push(Promise.resolve([]));
        }

        if (this.config.CALENDAR_ID) {
            queries.push(
                this.calendarService.getEventsForPeriod(firstDay, endQueryDate, this.config.CALENDAR_ID)
            );
        } else {
            queries.push(Promise.resolve([]));
        }

        const results = await Promise.all(queries);
        const holidays = results[0];
        const systemConfig = results[1] || {};
        const rawDxEvents = results[2] || []; 
        const rawAtEvents = results[3] || [];

        // 關鍵字過濾邏輯
        const rules = systemConfig['日曆篩選規則'] || [];
        const dxBlockRule = rules.find(r => r.value === 'DX_屏蔽關鍵字');
        const dxBlockKeywords = (dxBlockRule ? dxBlockRule.note : '').split(',').map(s => s.trim()).filter(Boolean);

        const atTransferRule = rules.find(r => r.value === 'AT_轉移關鍵字');
        const atTransferKeywords = (atTransferRule ? atTransferRule.note : '').split(',').map(s => s.trim()).filter(Boolean);

        const finalDxList = [];
        const finalAtList = [];

        rawDxEvents.forEach(evt => {
            const summary = evt.summary || '';
            const shouldBlock = dxBlockKeywords.some(kw => summary.includes(kw));
            if (!shouldBlock) finalDxList.push(evt);
        });

        rawAtEvents.forEach(evt => {
            const summary = evt.summary || '';
            const shouldTransfer = atTransferKeywords.some(kw => summary.includes(kw));
            if (shouldTransfer) finalDxList.push(evt);
            else finalAtList.push(evt);
        });

        const organizeEventsByDay = (events) => {
            const map = {};
            events.forEach(event => {
                const startVal = event.start.dateTime || event.start.date;
                if (!startVal) return;

                const eventDate = new Date(startVal);
                const dateKey = eventDate.toLocaleDateString('en-CA', { timeZone: this.config.TIMEZONE });

                if (!map[dateKey]) map[dateKey] = [];
                
                const isAllDay = !!event.start.date;
                const timeStr = isAllDay ? '全天' : eventDate.toLocaleTimeString('zh-TW', { timeZone: this.config.TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false });

                map[dateKey].push({
                    summary: event.summary,
                    isAllDay: isAllDay,
                    time: timeStr,
                    htmlLink: event.htmlLink,
                    location: event.location,
                    description: event.description
                });
            });
            return map;
        };

        const dxEventsByDay = organizeEventsByDay(finalDxList);
        const atEventsByDay = organizeEventsByDay(finalAtList);

        weekInfo.days.forEach(day => {
            if (holidays.has(day.date)) day.holidayName = holidays.get(day.date);
            day.dxCalendarEvents = dxEventsByDay[day.date] || [];
            day.atCalendarEvents = atEventsByDay[day.date] || [];
        });

        return {
            id: weekId,
            ...weekInfo, 
            entries: entriesForWeek 
        };
    }

    /**
     * 獲取週次選項 (下拉選單)
     */
    async getWeekOptions() {
        const today = new Date();
        const prevWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

        const summaryData = await this.weeklyBusinessReader.getWeeklySummary();
        const existingWeekIds = new Set(summaryData.map(w => w.weekId));

        const options = [
            { id: this.dateHelpers.getWeekId(prevWeek), label: '上一週' },
            { id: this.dateHelpers.getWeekId(today),    label: '本週' },
            { id: this.dateHelpers.getWeekId(nextWeek), label: '下一週' }
        ];

        options.forEach(opt => {
            opt.disabled = existingWeekIds.has(opt.id);
        });

        return options;
    }

    /**
     * 建立週報
     */
    async createWeeklyBusinessEntry(data) {
        const entryDate = new Date(data.date || new Date());
        const weekId = this.dateHelpers.getWeekId(entryDate);
        
        const fullData = { 
            ...data, 
            weekId: weekId
        };
        
        const creator = data.creator || 'System';
        return this.weeklyBusinessWriter.createEntry(fullData, creator);
    }

    /**
     * 更新週報
     * [Flow Control] Lookup ID via Service -> Pure Write
     */
    async updateWeeklyBusinessEntry(recordId, data) {
        try {
            // 1. Service Lookup (Simulate SQL Where)
            const allEntries = await this.weeklyBusinessReader.getAllEntries();
            const target = allEntries.find(e => e.recordId === recordId);
            
            if (!target) {
                throw new Error(`找不到紀錄 ID: ${recordId}`);
            }

            // 2. Pure Write
            const modifier = data.creator || 'System';
            return await this.weeklyBusinessWriter.updateEntryRow(target.rowIndex, data, modifier);
        } catch (error) {
            console.error('[WeeklyService] updateWeeklyBusinessEntry Error:', error);
            throw error;
        }
    }

    /**
     * 刪除週報
     * [Fix 1] 移除 rowIndex 參數，改由 Service 內部查找
     * [Flow Control] Lookup ID via Service -> Pure Write
     */
    async deleteWeeklyBusinessEntry(recordId) {
        try {
            // 1. Service Lookup
            const allEntries = await this.weeklyBusinessReader.getAllEntries();
            const target = allEntries.find(e => e.recordId === recordId);
            
            if (!target) {
                throw new Error(`找不到紀錄 ID: ${recordId}`);
            }

            // 2. Pure Write (傳遞 rowIndex 給 Writer)
            return await this.weeklyBusinessWriter.deleteEntryRow(target.rowIndex);
        } catch (error) {
            console.error('[WeeklyService] deleteWeeklyBusinessEntry Error:', error);
            throw error;
        }
    }
}

module.exports = WeeklyBusinessService;