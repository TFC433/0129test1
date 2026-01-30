/**
 * services/contact-service.js
 * 聯絡人業務邏輯服務層
 * * @version HOTFIX-PHASE6-2-READ-SWITCH-V2
 * @date 2026-01-30
 * @description Service behavior switching: SQL Primary Read with Sheet Fallback.
 * Strict error handling: SQL Empty/Null triggers fallback; Sheet errors propagate.
 */

class ContactService {
    /**
     * @param {ContactReader} contactReader
     * @param {ContactWriter} contactWriter
     * @param {CompanyReader} companyReader
     * @param {Object} config
     * @param {ContactSqlReader} [contactSqlReader] - Optional Injection for SQL Read
     */
    constructor(contactReader, contactWriter, companyReader, config, contactSqlReader) {
        this.contactReader = contactReader;
        this.contactWriter = contactWriter;
        this.companyReader = companyReader;
        this.config = config || { PAGINATION: { CONTACTS_PER_PAGE: 20 } }; 
        this.contactSqlReader = contactSqlReader; // SQL Reader Injection
    }

    /**
     * 內部輔助：正規化 Key
     */
    _normalizeKey(str = '') {
        return String(str).toLowerCase().trim();
    }

    /**
     * [Helper] Map SQL DTO to Service DTO
     * 處理欄位名稱差異：jobTitle -> position
     */
    _mapSqlContact(contact) {
        return {
            ...contact,
            position: contact.jobTitle || contact.position
        };
    }

    /**
     * [Helper] DTO Mapper for Official Contacts
     * 負責固定 Service 層對外輸出的欄位契約，並處理聚合邏輯。
     * @param {Object} contact - Raw contact from Reader
     * @param {Map} companyNameMap - Map of companyId -> companyName
     * @returns {Object} Service DTO
     */
    _mapOfficialContact(contact, companyNameMap) {
        return {
            ...contact,
            companyName: companyNameMap.get(contact.companyId) || contact.companyId
        };
    }

    /**
     * [Helper] Fetch and Aggregate Official Contacts
     * 集中處理資料來源讀取與 Join 邏輯，供 search 與 getById 共用。
     * Implements Phase 6-2: SQL Primary -> Sheet Fallback
     * @param {boolean} forceSheet - 若為 true 則強制使用 Sheet (用於 Fallback)
     * @returns {Promise<Array>} Aggregated DTOs
     */
    async _fetchOfficialContactsWithCompanies(forceSheet = false) {
        let allContacts = null;

        // 1. Primary: SQL Read
        if (!forceSheet) {
            if (this.contactSqlReader) {
                try {
                    const sqlContacts = await this.contactSqlReader.getContacts();
                    
                    // Strict Validation: Empty Array or Null must trigger fallback
                    if (!sqlContacts || sqlContacts.length === 0) {
                        throw new Error('SQL returned empty data or null (Treating as sync lag)');
                    }

                    // SQL Success: Map DTO
                    allContacts = sqlContacts.map(c => this._mapSqlContact(c));

                } catch (error) {
                    console.warn('[ContactService] SQL Read Error/Empty (Fallback to Sheet):', error.message);
                    // Explicitly fall through to Sheet
                    allContacts = null;
                }
            } else {
                // Reader not injected - Log configuration state
                console.warn('[ContactService] SQL Reader NOT injected. Skipping to Sheet.');
            }
        }

        // 2. Fallback: Sheet Read (If SQL failed, empty, or not configured)
        if (!allContacts) {
            // If this fails, we let it throw (do not swallow Sheet errors)
            allContacts = await this.contactReader.getContactList();
        }

        // 3. Common: Join Companies
        const allCompanies = await this.companyReader.getCompanyList();
        const companyNameMap = new Map(allCompanies.map(c => [c.companyId, c.companyName]));

        return allContacts.map(contact => this._mapOfficialContact(contact, companyNameMap));
    }

    /**
     * [Helper] Resolve RowIndex for Official Contact Update
     * 隔離對 rowIndex 的依賴，未來替換 SQL 時可在此處適配。
     * [CRITICAL] Update 必須依賴 Sheet Reader 取得 rowIndex，禁止使用 SQL。
     * @param {string} contactId 
     * @returns {Promise<number>} rowIndex
     */
    async _resolveContactRowIndex(contactId) {
        // Strict Sheet Read for Write Operations
        const allContacts = await this.contactReader.getContactList();
        const target = allContacts.find(c => c.contactId === contactId);

        if (!target) {
            throw new Error(`Contact ID not found: ${contactId}`);
        }
        
        const rowIndex = target.rowIndex;
        if (!rowIndex) {
            throw new Error(`System Error: Missing rowIndex for Contact ${contactId}`);
        }
        return rowIndex;
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
     * [Refactor]: Uses _fetchOfficialContactsWithCompanies for data aggregation
     */
    async searchOfficialContacts(query, page = 1) {
        try {
            // 1. Fetch & Join (Delegated to Helper with SQL Primary / Sheet Fallback)
            let contacts = await this._fetchOfficialContactsWithCompanies();

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
     * [Phase 6-2]: SQL Primary -> Throw on Null -> Sheet Fallback
     * [Semantics]: Distinguishes "Not Found" (return null) vs "System Error" (throw)
     */
    async getContactById(contactId) {
        // 1. Primary: SQL Read
        if (this.contactSqlReader) {
            try {
                const sqlContact = await this.contactSqlReader.getContactById(contactId);
                
                if (sqlContact) {
                    // SQL Hit: Perform Join & Return
                    const allCompanies = await this.companyReader.getCompanyList();
                    const companyNameMap = new Map(allCompanies.map(c => [c.companyId, c.companyName]));
                    
                    const mappedContact = this._mapSqlContact(sqlContact);
                    return this._mapOfficialContact(mappedContact, companyNameMap);
                }
                
                // SQL Miss (null): Warning log, then proceed to fallback
                console.warn(`[ContactService] Contact ID ${contactId} not found in SQL. Attempting Fallback.`);

            } catch (error) {
                console.warn('[ContactService] SQL Single Read Error (Fallback):', error.message);
                // Proceed to Fallback
            }
        } else {
            console.warn('[ContactService] SQL Reader NOT injected. Using Sheet Fallback for getContactById.');
        }

        // 2. Fallback: Sheet Read
        // Must strictly handle errors vs not found
        try {
            // Uses _fetchOfficialContactsWithCompanies(true) to handle Join logic consistently
            const contacts = await this._fetchOfficialContactsWithCompanies(true);
            const contact = contacts.find(c => c.contactId === contactId);
            
            // "Not Found" semantics: return null
            return contact || null;

        } catch (fallbackError) {
            // "System Error" semantics: throw
            console.error('[ContactService] getContactById Fallback Error:', fallbackError);
            throw fallbackError;
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

                    // Explicit DTO contract for Linked Contacts
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
     * [Flow Control]: Find rowIndex via Helper -> Call Writer
     */
    async updateContact(contactId, updateData, user) {
        try {
            // 1. Resolve RowIndex (Isolated Logic - Strict Sheet)
            const rowIndex = await this._resolveContactRowIndex(contactId);

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