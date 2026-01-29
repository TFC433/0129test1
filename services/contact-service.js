/* [v7.0.2] Standard A Refactor */
/**
 * services/contact-service.js
 * 聯絡人業務邏輯服務層
 * * @version 7.1.0 (Phase 5 - SQL Reader Fallback Injection)
 * @date 2026-01-29
 * @description 
 * [SQL-Ready Refactor]
 * 1. 承接所有 Reader 移除的業務邏輯 (Filter, Sort, Pagination, Join)。
 * 2. 負責資料流控制：讀取 Reader -> 計算/合併 -> 傳遞 rowIndex 給 Writer。
 * 3. 確保 Writer 接收到的指令是 Pure Write (RowIndex + Data)。
 * [Test] 注入 ContactSqlReader 供讀取測試，失敗時 Fallback 至 Sheet Reader。
 */

// [Patch] 引入 SQL Reader 供測試期雙軌並行
const ContactSqlReader = require('../data/contact-sql-reader');

class ContactService {
    /**
     * @param {ContactReader} contactReader
     * @param {ContactWriter} contactWriter
     * @param {CompanyReader} companyReader
     * @param {Object} config
     */
    constructor(contactReader, contactWriter, companyReader, config) {
        this.contactReader = contactReader;
        this.contactWriter = contactWriter;
        this.companyReader = companyReader;
        this.config = config || { PAGINATION: { CONTACTS_PER_PAGE: 20 } }; 

        // [Patch] 測試期硬性注入 SQL Reader (不經由 DI Container)
        this.sqlReader = new ContactSqlReader();
    }

    /**
     * 內部輔助：正規化 Key
     */
    _normalizeKey(str = '') {
        return String(str).toLowerCase().trim();
    }

    /**
     * 取得儀表板統計數據
     */
    async getDashboardStats() {
        try {
            // 從 Reader 取得 Raw Data，自行統計
            const contacts = await this.contactReader.getContacts();
            
            return {
                total: contacts.length,
                pending: contacts.filter(c => !c.status || c.status === 'Pending').length,
                processed: contacts.filter(c => c.status === 'Processed').length,
                dropped: contacts.filter(c => c.status === 'Dropped').length
            };
        } catch (error) {
            console.error('[ContactService] getDashboardStats Error:', error);
            return { total: 0, pending: 0, processed: 0, dropped: 0 };
        }
    }

    /**
     * 取得潛在客戶列表 (Raw Data / Business Cards)
     * [Moved Logic]: Limit, Filter empty, Sort
     */
    async getPotentialContacts(limit = 2000) {
        try {
            let contacts = await this.contactReader.getContacts();
            
            // 1. Filter: 過濾掉完全無效的空行
            contacts = contacts.filter(c => c.name || c.company);

            // 2. Sort: 依時間倒序 (Service Layer Sorting)
            contacts.sort((a, b) => {
                const dateA = new Date(a.createdTime);
                const dateB = new Date(b.createdTime);
                if (isNaN(dateB.getTime())) return -1;
                if (isNaN(dateA.getTime())) return 1;
                return dateB - dateA;
            });

            // 3. Limit
            if (limit > 0) {
                contacts = contacts.slice(0, limit);
            }

            return contacts;
        } catch (error) {
            console.error('[ContactService] getPotentialContacts Error:', error);
            throw error;
        }
    }

    /**
     * 搜尋潛在客戶 (簡易過濾)
     * [Moved Logic]: searchContacts (Keyword Filter)
     */
    async searchContacts(query) {
        try {
            let contacts = await this.getPotentialContacts(9999); 

            if (query) {
                const searchTerm = query.toLowerCase();
                contacts = contacts.filter(c =>
                    (c.name && c.name.toLowerCase().includes(searchTerm)) ||
                    (c.company && c.company.toLowerCase().includes(searchTerm))
                );
            }
            return { data: contacts };
        } catch (error) {
            console.error('[ContactService] searchContacts Error:', error);
            throw error;
        }
    }

    /**
     * 搜尋正式聯絡人 (Official Contact List)
     * [Moved Logic]: searchContactList (Join, Filter, Pagination)
     */
    async searchOfficialContacts(query, page = 1) {
        try {
            // [Patch Start] SQL Read Priority with Fallback
            let allContacts;
            try {
                allContacts = await this.sqlReader.getContacts();
                // 簡易驗證：若 SQL 回傳非陣列或 null，視為失敗
                if (!Array.isArray(allContacts)) throw new Error('SQL returned invalid structure');
                console.log('[ContactService] searchOfficialContacts: Serving from SQL Reader');
            } catch (sqlError) {
                console.error('[ContactService] searchOfficialContacts: SQL Read Failed, fallback to Sheet.', sqlError.message);
                // Fallback: 使用原本的 Sheet Reader
                allContacts = await this.contactReader.getContactList();
            }
            // [Patch End]

            const allCompanies = await this.companyReader.getCompanyList();

            const companyNameMap = new Map(allCompanies.map(c => [c.companyId, c.companyName]));

            // 1. In-Memory Join
            let contacts = allContacts.map(contact => ({
                ...contact,
                companyName: companyNameMap.get(contact.companyId) || contact.companyId
            }));

            // 2. Filter
            if (query) {
                const searchTerm = query.toLowerCase();
                contacts = contacts.filter(c =>
                    (c.name && c.name.toLowerCase().includes(searchTerm)) ||
                    (c.companyName && c.companyName.toLowerCase().includes(searchTerm))
                );
            }

            // 3. Pagination
            const pageSize = (this.config && this.config.PAGINATION) ? this.config.PAGINATION.CONTACTS_PER_PAGE : 20;
            const startIndex = (page - 1) * pageSize;
            const paginated = contacts.slice(startIndex, startIndex + pageSize);

            return {
                data: paginated,
                pagination: {
                    current: page,
                    total: Math.ceil(contacts.length / pageSize),
                    totalItems: contacts.length,
                    hasNext: (startIndex + pageSize) < contacts.length,
                    hasPrev: page > 1
                }
            };
        } catch (error) {
            console.error('[ContactService] searchOfficialContacts Error:', error);
            throw error;
        }
    }

    /**
     * 根據 ID 取得單一正式聯絡人詳情
     */
    async getContactById(contactId) {
        try {
            // [Patch Start] SQL Read Priority with Fallback
            let rawContact;
            try {
                rawContact = await this.sqlReader.getContactById(contactId);
                if (!rawContact) throw new Error(`Contact ${contactId} not found in SQL`);
                console.log(`[ContactService] getContactById: Serving ${contactId} from SQL Reader`);
            } catch (sqlError) {
                console.error(`[ContactService] getContactById: SQL Read Failed for ${contactId}, fallback to Sheet.`, sqlError.message);
                // Fallback: 使用原本的邏輯 (內部呼叫 searchOfficialContacts 進行查找與 Join)
                const result = await this.searchOfficialContacts(contactId, 1);
                const contact = result.data.find(c => c.contactId === contactId);
                return contact || null;
            }
            // [Patch End]

            if (!rawContact) return null;

            const contact = { ...rawContact }; // clone

            try {
                const companies = await this.companyReader.getCompanyList();
                const companyMap = new Map(companies.map(c => [c.companyId, c.companyName]));

                if (contact.companyId) contact.companyName = companyMap.get(contact.companyId) || contact.companyId;
            } catch (joinError) {
                console.warn(`[ContactService] Join failed for ${contactId}, returning raw clone.`, joinError);
            }

            return contact;
        } catch (error) {
            console.error('[ContactService] getContactById Error:', error);
            return null;
        }
    }

    /**
     * 根據機會 ID 取得關聯的聯絡人詳細資料
     * [Moved Logic]: getLinkedContacts (Complex Join & Aggregation)
     */
    async getLinkedContacts(opportunityId) {
        try {
            const [allLinks, allContacts, allCompanies, allPotentialContacts] = await Promise.all([
                this.contactReader.getAllOppContactLinks(),
                this.contactReader.getContactList(),
                this.companyReader.getCompanyList(),
                this.contactReader.getContacts() // Raw potential contacts
            ]);

            const linkedContactIds = new Set();
            for (const link of allLinks) {
                if (link.opportunityId === opportunityId && link.status === 'active') {
                    linkedContactIds.add(link.contactId);
                }
            }

            if (linkedContactIds.size === 0) return [];

            const companyNameMap = new Map(allCompanies.map(c => [c.companyId, c.companyName]));

            // 建立潛在客戶名片圖檔映射
            const potentialCardMap = new Map();
            allPotentialContacts.forEach(pc => {
                if (pc.name && pc.company && pc.driveLink) {
                    const key = this._normalizeKey(pc.name) + '|' + this._normalizeKey(pc.company);
                    if (!potentialCardMap.has(key)) {
                        potentialCardMap.set(key, pc.driveLink);
                    }
                }
            });

            const linkedContacts = allContacts
                .filter(contact => linkedContactIds.has(contact.contactId))
                .map(contact => {
                    let driveLink = '';
                    const companyName = companyNameMap.get(contact.companyId) || '';

                    if (contact.name && companyName) {
                        const key = this._normalizeKey(contact.name) + '|' + this._normalizeKey(companyName);
                        driveLink = potentialCardMap.get(key) || '';
                    }

                    return {
                        contactId: contact.contactId,
                        sourceId: contact.sourceId,
                        name: contact.name,
                        companyId: contact.companyId,
                        department: contact.department,
                        position: contact.position,
                        mobile: contact.mobile,
                        phone: contact.phone,
                        email: contact.email,
                        companyName: companyName,
                        driveLink: driveLink
                    };
                });

            return linkedContacts;
        } catch (error) {
            console.error('[ContactService] getLinkedContacts Error:', error);
            return [];
        }
    }

    /**
     * 更新正式聯絡人資料
     * [Flow Control]: Find rowIndex via Reader -> Call Writer
     */
    async updateContact(contactId, updateData, user) {
        try {
            // 1. 透過 Reader 查找目標 rowIndex (模擬 DB Index Scan)
            const allContacts = await this.contactReader.getContactList();
            const target = allContacts.find(c => c.contactId === contactId);

            if (!target) {
                throw new Error(`Contact ID not found: ${contactId}`);
            }

            const rowIndex = target.rowIndex;
            if (!rowIndex) {
                throw new Error(`System Error: Missing rowIndex for Contact ${contactId}`);
            }

            // 2. 呼叫 Writer 執行 Pure Write
            await this.contactWriter.updateContactRow(rowIndex, updateData, user);
            
            // 3. Invalidate Cache
            this.contactReader.invalidateCache('contactList');
            return { success: true };
        } catch (error) {
            console.error('[ContactService] updateContact Error:', error);
            throw error;
        }
    }

    /**
     * 更新潛在客戶資料
     * [Flow Control]: Read -> Merge -> Write (Read-Modify-Write at Service Layer)
     */
    async updatePotentialContact(rowIndex, updateData, modifier) {
        try {
            // 1. Read Raw Data for Merge (Service Layer Merge)
            const allContacts = await this.contactReader.getContacts();
            const target = allContacts.find(c => c.rowIndex === parseInt(rowIndex));

            if (!target) {
                throw new Error(`找不到潛在客戶 Row: ${rowIndex}`);
            }

            // 2. Prepare Merged Data
            const mergedData = {
                ...target,
                ...updateData
            };
            
            // Business Logic: Append Notes
            if (updateData.notes) {
                const oldNotes = target.notes || '';
                const newNoteEntry = `[${modifier} ${new Date().toLocaleDateString()}] ${updateData.notes}`;
                mergedData.notes = oldNotes ? `${oldNotes}\n${newNoteEntry}` : newNoteEntry;
            }

            // 3. Call Writer (Pure Write)
            await this.contactWriter.writePotentialContactRow(rowIndex, mergedData);
            
            // 4. Invalidate Cache
            this.contactReader.invalidateCache('contacts');

            return { success: true };
        } catch (error) {
            console.error('[ContactService] updatePotentialContact Error:', error);
            throw error;
        }
    }
}

module.exports = ContactService;