// views/scripts/components/potential-contacts-manager.js
// 職責：共用的潛在聯絡人管理模組，處理顯示、建檔與關聯邏輯

const PotentialContactsManager = (() => {

    /**
     * 渲染潛在聯絡人列表的核心函式
     * @param {object} options - 設定物件
     * @param {string} options.containerSelector - 渲染目標容器的 CSS 選擇器
     * @param {Array<object>} options.potentialContacts - 潛在聯絡人資料陣列
     * @param {Array<object>} options.comparisonList - 用於比對狀態的聯絡人陣列 (已建檔或已關聯)
     * @param {string} options.comparisonKey - 用於比對的鍵名 (例如 'name')
     * @param {string} options.context - 當前情境 ('company' 或 'opportunity')
     * @param {string} [options.opportunityId] - (可選) 在 'opportunity' 情境下需要提供
     */
    function render(options) {
        const {
            containerSelector,
            potentialContacts,
            comparisonList = [],
            comparisonKey = 'name',
            context,
            opportunityId
        } = options;

        const container = document.querySelector(containerSelector);
        if (!container) {
            console.error(`[PotentialContactsManager] 找不到容器: ${containerSelector}`);
            return;
        }

        if (!potentialContacts || potentialContacts.length === 0) {
            container.innerHTML = '<div class="alert alert-info" style="text-align:center;">在潛在客戶池中沒有找到該公司的聯絡人</div>';
            return;
        }

        const comparisonSet = new Set(comparisonList.map(item => item[comparisonKey]));

        let tableHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>姓名</th>
                        <th>公司</th>
                        <th>職位</th>
                        <th>聯絡方式</th>
                        <th>狀態</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>`;
        
        potentialContacts.forEach(contact => {
            const contactJsonString = JSON.stringify(contact).replace(/'/g, "&apos;");
            const isAlreadyHandled = comparisonSet.has(contact[comparisonKey]);
            
            let statusBadge = '';
            let actionButton = '';

            if (isAlreadyHandled) {
                const statusText = context === 'company' ? '已建檔' : '已關聯';
                statusBadge = `<span class="contact-card-status upgraded">${statusText}</span>`;
                actionButton = ''; // 已處理，不顯示按鈕
            } else {
                statusBadge = `<span class="contact-card-status pending">待處理</span>`;
                if (context === 'company') {
                    actionButton = `<button class="action-btn small primary" onclick='PotentialContactsManager.handleFileContact(${contactJsonString})'>📋 建檔</button>`;
                } else if (context === 'opportunity') {
                    actionButton = `<button class="action-btn small primary" onclick='PotentialContactsManager.handleLinkContact(${contactJsonString}, "${opportunityId}")'>🔗 關聯</button>`;
                }
            }

            // 【修改】將 a href 連結改為 onclick 按鈕
            const safeDriveLink = contact.driveLink ? contact.driveLink.replace(/'/g, "\\'") : '';
            const driveLinkBtn = contact.driveLink
                ? `<button class="action-btn small info" title="預覽名片" onclick="showBusinessCardPreview('${safeDriveLink}')">💳 名片</button>`
                : '';
            // 【修改結束】

            tableHTML += `
                <tr>
                    <td data-label="姓名"><strong>${contact.name || '-'}</strong></td>
                    <td data-label="公司">${contact.company || '-'}</td>
                    <td data-label="職位">${contact.position || '-'}</td>
                    <td data-label="聯絡方式">${contact.mobile ? `<div>📱 ${contact.mobile}</div>` : ''}${contact.phone ? `<div>📞 ${contact.phone}</div>` : ''}</td>
                    <td data-label="狀態">${statusBadge}</td>
                    <td data-label="操作">
                        <div class="action-buttons-container">
                            ${actionButton}
                            ${driveLinkBtn}
                        </div>
                    </td>
                </tr>`;
        });

        tableHTML += '</tbody></table>';
        container.innerHTML = tableHTML;
    }

    /**
     * 處理「建檔」按鈕點擊事件
     * @param {object} contactData - 潛在聯絡人的資料
     */
    async function handleFileContact(contactData) {
        const confirmMsg = `您確定要將潛在聯絡人「${contactData.name}」建立正式檔案嗎？`;
        showConfirmDialog(confirmMsg, async () => {
            showLoading('正在建立聯絡人檔案...');
            try {
                const result = await authedFetch(`/api/contacts/${contactData.rowIndex}/file`, {
                    method: 'POST'
                });
                
                if (result.success) {
                    showNotification('聯絡人建檔成功！', 'success');
                    // 重新載入當前頁面以刷新狀態
                    const companyName = document.querySelector('#page-title').textContent;
                    if (companyName) {
                       await CRM_APP.navigateTo('company-details', { companyName: encodeURIComponent(companyName) });
                    }
                } else {
                    throw new Error(result.error || '建檔失敗');
                }
            } catch (error) {
                if (error.message !== 'Unauthorized') showNotification(`建檔失敗: ${error.message}`, 'error');
            } finally {
                hideLoading();
            }
        });
    }

    /**
     * 處理「關聯」按鈕點擊事件
     * @param {object} contactData - 潛在聯絡人的資料
     * @param {string} opportunityId - 要關聯到的機會 ID
     */
    async function handleLinkContact(contactData, opportunityId) {
        showLoading('正在關聯聯絡人...');

        const payload = {
            name: contactData.name,
            position: contactData.position,
            mobile: contactData.mobile,
            phone: contactData.phone,
            email: contactData.email,
            rowIndex: contactData.rowIndex, 
            company: contactData.company,
        };

        try {
            const result = await authedFetch(`/api/opportunities/${opportunityId}/contacts`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (!result.success) throw new Error(result.error || '後端處理失敗');
            
            showNotification('聯絡人關聯成功！', 'success');
            await loadOpportunityDetailPage(opportunityId); // 重新載入機會詳細頁面
        } catch (error) {
            if (error.message !== 'Unauthorized') showNotification(`關聯失敗: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    // 返回公開的 API
    return {
        render,
        handleFileContact,
        handleLinkContact
    };
})();

// 將模組掛載到全域 window 物件，以便 HTML 中的 onclick 可以呼叫
window.PotentialContactsManager = PotentialContactsManager;