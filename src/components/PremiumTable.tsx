import { useEffect, useState } from 'react';

interface PremiumItem {
  strike: number;
  call_premium: number;
  put_premium: number;
}

export const PremiumTable = ({ activeCharts = ['primary'] }: { activeCharts?: string[] }) => {
  const [dataMap, setDataMap] = useState<Record<string, { data: { ticker: string, premium_data?: PremiumItem[] } | null, status: string }>>({});
  
  useEffect(() => {
    const handleUpdate = (e: any) => {
      const { chartId, data, status } = e.detail;
      setDataMap(prev => ({ ...prev, [chartId]: { data, status } }));
    };
    window.addEventListener('gexDataUpdate', handleUpdate);
    return () => window.removeEventListener('gexDataUpdate', handleUpdate);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', gap: '32px' }}>
      {activeCharts.map(chartId => {
        const entry = dataMap[chartId] || { status: 'loading', data: null };
        const { data, status } = entry;
        
        if (status === 'loading') {
          return (
            <div key={chartId} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#94a3b8', padding: '40px 20px', gap: '16px' }}>
              <div style={{ width: '24px', height: '24px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <div style={{ fontSize: '12px' }}>Awaiting Premium data for {chartId}...</div>
            </div>
          );
        }

        if (status === 'error' || !data || !data.premium_data) {
          return (
            <div key={chartId} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#ef4444', padding: '40px 20px', gap: '16px' }}>
              <div style={{ fontSize: '12px' }}>Failed to load Premium data for {chartId}.</div>
            </div>
          );
        }

        const items = [...data.premium_data].sort((a, b) => b.strike - a.strike);

        return (
          <div key={chartId} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: '16px', padding: '0 8px' }}>
              <div style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' }}>Strike Premium ({data.ticker})</div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                  <th style={{ padding: '8px', fontWeight: 'normal' }}>Strike</th>
                  <th style={{ padding: '8px', textAlign: 'right', fontWeight: 'normal', color: '#10b981' }}>CALL ($)</th>
                  <th style={{ padding: '8px', textAlign: 'right', fontWeight: 'normal', color: '#ef4444' }}>PUT ($)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px 8px', fontWeight: 'bold' }}>${item.strike}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#10b981' }}>
                      ${(item.call_premium / 1e6).toFixed(2)}M
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right', color: '#ef4444' }}>
                      ${(item.put_premium / 1e6).toFixed(2)}M
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};
