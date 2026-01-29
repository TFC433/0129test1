/* [v7.0.2] Standard A Refactor */
/**
 * services/announcement-service.js
 * 布告欄業務邏輯層
 * * @version 7.0.0 (Standard A Refactor)
 * @date 2026-01-23
 * @description 
 * 1. 承接原 Reader 的排序邏輯 (置頂優先 + 時間倒序)。
 * 2. 負責業務過濾 (狀態檢查)。
 */

class AnnouncementService {
    /**
     * @param {Object} dependencies
     * @param {AnnouncementReader} dependencies.announcementReader
     * @param {AnnouncementWriter} dependencies.announcementWriter
     */
    constructor({ announcementReader, announcementWriter }) {
        this.announcementReader = announcementReader;
        this.announcementWriter = announcementWriter;
    }

    /**
     * 取得所有已發布公告 (含置頂排序)
     * @returns {Promise<Array>}
     */
    async getAnnouncements() {
        try {
            // 1. 取得 Raw Data
            let data = await this.announcementReader.getAnnouncements();
            
            // 2. 業務過濾：僅顯示已發布
            data = data.filter(item => item.status === '已發布');

            // 3. [Moved from Reader] 業務排序：置頂優先 > 最後更新時間
            data.sort((a, b) => {
                // 置頂判斷
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                
                // 時間排序 (Desc)
                const dateA = new Date(a.lastUpdateTime || 0);
                const dateB = new Date(b.lastUpdateTime || 0);
                return dateB - dateA;
            });

            return data;
        } catch (error) {
            console.error('[AnnouncementService] getAnnouncements Error:', error);
            throw error;
        }
    }

    /**
     * 建立新公告
     * @param {Object} data - 公告資料
     * @param {Object} user - 建立者使用者物件
     */
    async createAnnouncement(data, user) {
        try {
            const creatorName = user.displayName || user.username || user.name || 'System';
            
            // 業務驗證
            if (!data.title) {
                throw new Error('公告標題為必填');
            }

            const result = await this.announcementWriter.createAnnouncement(data, creatorName);
            return result;
        } catch (error) {
            console.error('[AnnouncementService] createAnnouncement Error:', error);
            throw error;
        }
    }

    /**
     * 更新公告
     * @param {string} id - 公告 ID
     * @param {Object} data - 更新資料
     * @param {Object} user - 操作者
     */
    async updateAnnouncement(id, data, user) {
        try {
            const modifierName = user.displayName || user.username || user.name || 'System';

            // 1. 查找公告以獲取 rowIndex (Reader 已快取，效能無虞)
            const allAnnouncements = await this.announcementReader.getAnnouncements();
            const target = allAnnouncements.find(a => a.id === id);

            if (!target) {
                throw new Error(`找不到公告 ID: ${id}`);
            }

            const rowIndex = target.rowIndex;

            const result = await this.announcementWriter.updateAnnouncement(rowIndex, data, modifierName);
            return result;
        } catch (error) {
            console.error('[AnnouncementService] updateAnnouncement Error:', error);
            throw error;
        }
    }

    /**
     * 刪除公告
     * @param {string} id - 公告 ID
     */
    async deleteAnnouncement(id) {
        try {
            // 1. 查找公告以獲取 rowIndex
            const allAnnouncements = await this.announcementReader.getAnnouncements();
            const target = allAnnouncements.find(a => a.id === id);

            if (!target) {
                throw new Error(`找不到公告 ID: ${id}`);
            }

            const rowIndex = target.rowIndex;
            const result = await this.announcementWriter.deleteAnnouncement(rowIndex);
            return result;
        } catch (error) {
            console.error('[AnnouncementService] deleteAnnouncement Error:', error);
            throw error;
        }
    }
}

module.exports = AnnouncementService;