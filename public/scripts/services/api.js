// public/scripts/services/api.js
// 職責：專門處理 API 請求、認證 Token、錯誤處理以及流量控制 (Traffic Control)

// --- Traffic Control Configuration ---
const RATE_LIMIT_CONFIG = {
    maxRequestsPerSecond: 5,  // Max requests allowed per second
    interval: 1000 / 5,       // Interval between requests (200ms)
    maxRetries: 3,            // Max retry attempts for 429
    backoffBase: 1000         // Base wait time for backoff (1s)
};

// Request Queue for Throttling
const requestQueue = [];
let isProcessingQueue = false;
let lastRequestTime = 0;

let isRedirectingToLogin = false;

/**
 * 經過認證與流量控制的 fetch 函式
 * @param {string} url - API 的 URL
 * @param {object} [options={}] - fetch 的選項
 * @returns {Promise<any>}
 */
async function authedFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        // Enqueue the request
        requestQueue.push({ url, options, resolve, reject, attempts: 0 });
        processQueue();
    });
}

/**
 * Process the request queue with throttling
 */
async function processQueue() {
    if (isProcessingQueue || requestQueue.length === 0) return;

    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    const delay = Math.max(0, RATE_LIMIT_CONFIG.interval - timeSinceLastRequest);

    isProcessingQueue = true;

    setTimeout(async () => {
        const req = requestQueue.shift();
        if (req) {
            lastRequestTime = Date.now();
            try {
                const result = await executeFetch(req.url, req.options, req.attempts);
                req.resolve(result);
            } catch (error) {
                req.reject(error);
            }
        }
        isProcessingQueue = false;
        if (requestQueue.length > 0) {
            processQueue();
        }
    }, delay);
}

/**
 * Execute the actual fetch with Retry logic
 */
async function executeFetch(url, options, attempts) {
    const token = localStorage.getItem('crm-token');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const method = options.method ? options.method.toUpperCase() : 'GET';
    const isWriteOperation = ['POST', 'PUT', 'DELETE'].includes(method);

    try {
        console.log(`[authedFetch] Requesting: ${method} ${url}`);
        const response = await fetch(url, { ...options, headers });

        // --- Handle 429 Too Many Requests (Exponential Backoff) ---
        if (response.status === 429) {
            if (attempts < RATE_LIMIT_CONFIG.maxRetries) {
                const waitTime = RATE_LIMIT_CONFIG.backoffBase * Math.pow(2, attempts);
                console.warn(`[authedFetch] 429 Rate Limit. Retrying in ${waitTime}ms... (Attempt ${attempts + 1})`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                return executeFetch(url, options, attempts + 1);
            } else {
                throw new Error('Server is busy (429). Please try again later.');
            }
        }

        // --- Handle Unauthorized ---
        if (response.status === 401 || response.status === 403) {
            if (!isRedirectingToLogin) {
                isRedirectingToLogin = true;
                localStorage.removeItem('crm-token');
                localStorage.removeItem('crmToken');
                localStorage.removeItem('crmCurrentUserName');
                localStorage.removeItem('crmUserRole');
                showNotification('您的登入已過期或無效，將跳轉至登入頁面。', 'error', 3000);
                setTimeout(() => { window.location.href = '/login.html'; }, 2000);
            }
            throw new Error('Unauthorized');
        }

        // --- Parse Response ---
        let result = null;
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            try {
                result = await response.json();
            } catch (jsonError) {
                if (!response.ok) throw new Error(`API 請求失敗，狀態碼: ${response.status}，且回應非有效 JSON。`);
                throw new Error(`API 請求成功，但回應的 JSON 格式無效。`);
            }
        }

        if (!response.ok) {
            const errorDetails = result?.details || result?.message || result?.error || response.statusText || `HTTP error ${response.status}`;
            throw new Error(errorDetails);
        }

        // --- Smart Refresh on Write ---
        if (isWriteOperation && response.ok && !options.skipRefresh) {
            const successMsg = result?.message || (method === 'DELETE' ? '刪除成功！' : '操作成功！');
            showNotification(successMsg, 'success', 2000);
            if (window.CRM_APP && typeof window.CRM_APP.refreshCurrentView === 'function') {
                setTimeout(() => window.CRM_APP.refreshCurrentView(successMsg), 100);
            } else {
                setTimeout(() => location.reload(), 1500);
            }
        }

        return result;

    } catch (error) {
        if (error.message !== 'Unauthorized' && !isRedirectingToLogin) {
            const displayError = error.message.length > 100 ? error.message.substring(0, 97) + '...' : error.message;
            showNotification(`操作失敗: ${displayError}`, 'error');
        }
        throw error;
    }
}