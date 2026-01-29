// public/scripts/sales/sales-analysis-helper.js

const SalesAnalysisHelper = {
    calculateOverview: function(deals) {
        let totalVal = 0, totalDays = 0, cycleCount = 0;
        deals.forEach(d => {
            totalVal += d.numericValue || 0;
            if (d.createdTime && d.wonDate) {
                const diff = Math.ceil(Math.abs(new Date(d.wonDate) - new Date(d.createdTime)) / 86400000);
                if (!isNaN(diff)) { totalDays += diff; cycleCount++; }
            }
        });
        return {
            totalWonValue: totalVal,
            totalWonDeals: deals.length,
            averageDealValue: deals.length ? totalVal / deals.length : 0,
            averageSalesCycleInDays: cycleCount ? Math.round(totalDays / cycleCount) : 0
        };
    },

    calculateKpis: function(deals) {
        const calcUnique = (keyword) => {
            const unique = new Set();
            deals.forEach(d => {
                const m = (d.salesModel || '').trim();
                if (m.includes(keyword) && d.customerCompany) unique.add(d.customerCompany.trim());
            });
            return unique.size;
        };
        return { direct: calcUnique('直販') || calcUnique('直接販售'), si: calcUnique('SI') || calcUnique('系統整合'), mtb: calcUnique('MTB') || calcUnique('工具機') };
    },

    calculateGroupStats: function(deals, field, metric='count') {
        const map = {};
        deals.forEach(d => {
            const k = d[field] || '未分類';
            if (!map[k]) map[k] = { count: 0, value: 0 };
            map[k].count++; map[k].value += d.numericValue || 0;
        });
        return Object.entries(map).map(([n, v]) => ({ name: n, y: metric === 'value' ? v.value : v.count })).sort((a,b) => b.y - a.y);
    },

    calculateProductStats: function(deals) {
        const map = {};
        deals.forEach(d => {
            try {
                if (d.potentialSpecification) {
                    const specs = typeof d.potentialSpecification === 'string' ? JSON.parse(d.potentialSpecification) : d.potentialSpecification;
                    Object.entries(specs).forEach(([n, q]) => { const qty = parseInt(q) || 0; if (qty > 0) map[n] = (map[n] || 0) + qty; });
                }
            } catch(e){}
        });
        return Object.entries(map).map(([n, q]) => ({ name: n, y: q })).sort((a,b) => b.y - a.y);
    },

    calculateChannelStats: function(deals) {
        const map = {};
        deals.forEach(d => {
            let ch = d.channelDetails || d.salesChannel || '直接販售';
            if (ch === '-' || ch === '無') ch = '直接販售';
            map[ch] = (map[ch] || 0) + (d.numericValue || 0);
        });
        return Object.entries(map).map(([n, v]) => ({ name: n, y: v })).sort((a,b) => b.y - a.y);
    },

    generateCSV: function(deals) {
        if (!deals.length) return null;
        const headers = ['成交日期', '機會種類', '機會名稱', '終端客戶', '銷售模式', '主要通路', '目前階段', '價值', '負責業務'];
        const rows = deals.map(d => [
            d.wonDate ? new Date(d.wonDate).toLocaleDateString() : '-',
            d.opportunityType || '-', d.opportunityName || '(未命名)', d.customerCompany || '-', d.salesModel || '-',
            d.channelDetails || d.salesChannel || '-', d.currentStage || '-', d.numericValue || 0, d.assignee || '-'
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
        return '\ufeff' + headers.join(',') + '\n' + rows.join('\n');
    }
};