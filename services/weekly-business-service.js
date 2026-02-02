/* [v7.0.10] Weekly Standard A + S SQL-Ready Polish */
/**
 * services/weekly-business-service.js
 * 週間業務邏輯服務 (Service Layer)
 * @version 7.0.10 (Fix Date String Comparison)
 * @date 2026-01-30
 * @description 
 * [SQL Integration Phase]
 * 1. 新增 _fetchWeeklyEntries 收斂點，支援 SQL First (Read) 與 Sheet Fallback。
 * 2. Update/Delete 強制使用 forceSheet: true 以保留 rowIndex。
 * 3. Read 介面 (List/Summary) 統一改用 _fetchWeeklyEntries。
 * 4. 新增 _toServiceDTO 處理 SQL snake_case 轉 Service/Frontend 格式。
 * 5. 新增 Runtime Log 確認 SQL 讀取成功。
 * 6. [Fix] 使用字串比較 (String Comparison) 進行日期過濾，徹底解決時區偏移導致資料消失的問題。
 */

class WeeklyBusinessService {
    /**
     * 透過 Service Container 注入依賴
     */
    constructor({ 
        weeklyBusinessReader, 
        weeklyBusinessWriter, 
        weeklyBusinessRepo, // [SQL] Optional Injection
        dateHelpers, 
        calendarService, 
        systemReader,
        opportunityService, 
        config 
    }) {
        this.weeklyBusinessReader = weeklyBusinessReader;
        this.weeklyBusinessWriter = weeklyBusinessWriter;
        this.weeklyBusinessRepo = weeklyBusinessRepo; // [SQL]
        this.dateHelpers = dateHelpers;
        this.calendarService = calendarService;
        this.systemReader = systemReader;
        this.opportunityService = opportunityService;
        this.config = config;
    }

    /**
     * [Internal] 資料格式轉換 (SQL -> Service/Frontend)
     * 將資料庫 snake_case 欄位轉換為 Service 與 Frontend 預期的格式 (包含中文 Key)
     */
    _toServiceDTO(row) {
        if (!row) return null;

        return {
            // --- 1. Service 必要識別與邏輯欄位 ---
            recordId: row.record_id,
            weekId: row.week_id,
            '日期': row.entry_date, // Service 排序與計算依賴
            summaryContent: row.summary_content, // Service Summary List 依賴
            creator: row.created_by,

            // --- 2. CamelCase 標準化 (Rest of fields) ---
            entryDate: row.entry_date,
            category: row.category,
            topic: row.topic,
            participants: row.participants,
            todoItems: row.todo_items,
            createdTime: row.created_time,
            updatedTime: row.updated_time,

            // --- 3. 前端顯示用欄位 (Frontend Legacy Keys) ---
            '分類': row.category,
            '項目': row.topic,
            '內容': row.summary_content, // Mapping summary to content area
            '參與人': row.participants,
            '追蹤事項': row.todo_items,
            '下週計畫': row.plan ?? '',       // [Defensive] 若 SQL 無此欄位則給空字串
            '部門': row.division ?? ''        // [Defensive] 若 SQL 無此欄位則給空字串
        };
    }

    /**
     * [Internal] 資料讀取收斂點
     * @param {Object} options - { forceSheet: boolean }
     * - forceSheet: true 用於 Write (需要 rowIndex)
     * - forceSheet: false 用於 Read (優先 SQL)
     */
    async _fetchWeeklyEntries(options = { forceSheet: false }) {
        // 1. SQL First (Read-Only Path)
        if (!options.forceSheet && this.weeklyBusinessRepo) {
            try {
                // SQL Repo 不會回傳 rowIndex，僅適用於 View
                const sqlEntries = await this.weeklyBusinessRepo.findAll();
                
                // [Log] 確認 SQL 讀取成功
                console.log('[WeeklyService] Read Source: SQL');

                // 轉換 SQL snake_case 為 Service DTO
                return sqlEntries.map(row => this._toServiceDTO(row));

            } catch (error) {
                console.warn('[WeeklyService] SQL Read Failed, falling back to Sheet:', error);
                // Fallback continues below
            }
        }

        // 2. Sheet Reader (Write Path / Fallback)
        // 回傳包含 rowIndex 的完整資料
        return await this.weeklyBusinessReader.getAllEntries();
    }

    /**
     * 獲取特定週次的所有條目
     * [View-Only] 負責 Filter, Sort, Day Calculation
     * [Fix v7.0.10] 使用字串比較過濾日期，避免時區偏移
     * @param {string} weekId - 週次 ID (e.g., "2026-W03")
     */
    async getEntriesForWeek(weekId) {
        try {
            // 1. 取得全量資料 (Via Convergence Point)
            const allEntries = await this._fetchWeeklyEntries({ forceSheet: false });
            
            // 2. [Fix] Date Range String Filter Setup
            const weekInfo = this.dateHelpers.getWeekInfo(weekId);
            if (!weekInfo || !weekInfo.days || weekInfo.days.length === 0) {
                return [];
            }
            
            // 使用字串 (YYYY-MM-DD) 進行比對，確保無時區干擾
            const weekStartStr = weekInfo.days[0].date;
            const weekEndStr = weekInfo.days[weekInfo.days.length - 1].date;

            // 3. Filter by String Date Range
            let entries = allEntries.filter(entry => {
                const dateVal = entry.entryDate || entry['日期'];
                if (!dateVal) return false;
                
                // 字串比對: "2026-01-20" >= "2026-01-19" works correctly for ISO format
                return dateVal >= weekStartStr && dateVal <= weekEndStr;
            });
            
            // 4. Sort by Date (Desc)
            entries.sort((a, b) => new Date(b['日期']) - new Date(a['日期']));

            // 5. Calculate 'day' (View-Only Field)
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
            // [Modified] 統一走 _fetchWeeklyEntries，支援 SQL 切換
            const rawData = await this._fetchWeeklyEntries({ forceSheet: false });
            
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

        // [Modified] 統一走 _fetchWeeklyEntries，支援 SQL 切換
        const summaryData = await this._fetchWeeklyEntries({ forceSheet: false });
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
            // 1. Service Lookup (FORCE SHEET to ensure rowIndex exists)
            const allEntries = await this._fetchWeeklyEntries({ forceSheet: true });
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
            // 1. Service Lookup (FORCE SHEET to ensure rowIndex exists)
            const allEntries = await this._fetchWeeklyEntries({ forceSheet: true });
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