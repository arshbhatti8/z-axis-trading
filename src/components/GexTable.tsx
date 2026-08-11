import { useEffect, useState } from 'react';

interface GexItem {
  strike: number;
  gex: number;
}

interface GexData {
  ticker: string;
  spot_price: number;
  total_gex: number;
  zero_gamma?: number;
  most_negative: GexItem[];
  most_positive: GexItem[];
}

export const GexTable = ({ activeCharts = ['primary'] }: { activeCharts?: string[] }) => {
  const formatGex = (val: number, decimals: number = 2) => {
    const abs = Math.abs(val);
    if (abs >= 1e9) return (val / 1e9).toFixed(decimals) + 'B';
    if (abs >= 1e6) return (val / 1e6).toFixed(decimals) + 'M';
    return (val / 1e3).toFixed(decimals) + 'K';
  };
  const [dataMap, setDataMap] = useState<Record<string, { data: GexData | null, status: string }>>({});
  const [sortBy, setSortBy] = useState<'strike' | 'gex'>('strike');

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', padding: '0 8px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>Sort by:</span>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value as 'strike' | 'gex')}
            style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', outline: 'none' }}
          >
            <option value="strike">Strike</option>
            <option value="gex">GEX Size</option>
          </select>
        </div>
        <button
          onClick={() => {
            activeCharts.forEach(id => {
              const ticker = dataMap[id]?.data?.ticker;
              if (ticker) window.dispatchEvent(new CustomEvent('requestGexRefresh', { detail: { ticker } }));
            });
          }}
          className="btn-tactile active-blue"
          style={{ fontSize: '12px' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          Refresh
        </button>
      </div>
      {activeCharts.map(chartId => {
        const entry = dataMap[chartId] || { status: 'loading', data: null };
        const { data, status } = entry as any;
        
        if (status === 'loading') {
          return (
            <div key={chartId} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#94a3b8', padding: '40px 20px', gap: '16px' }}>
              <div style={{ width: '24px', height: '24px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <div style={{ fontSize: '12px' }}>Awaiting GEX data for {chartId}...</div>
            </div>
          );
        }

        if (status === 'error' || !data) {
          return (
            <div key={chartId} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#ef4444', padding: '40px 20px', gap: '16px' }}>
              <div style={{ fontSize: '12px' }}>Failed to load GEX data for {chartId}.</div>
            </div>
          );
        }

        let allStrikes = [...data.most_positive, ...data.most_negative];
        
        if (sortBy === 'strike') {
          allStrikes.sort((a, b) => b.strike - a.strike);
        } else {
          allStrikes.sort((a, b) => b.gex - a.gex);
        }

        return (
          <div key={chartId} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: '16px', padding: '0 8px' }}>
              <div style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' }}>
                GEX List ({data.ticker})
              </div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: data.total_gex >= 0 ? '#10b981' : '#ef4444' }}>
                {data.total_gex >= 0 ? '+' : ''}{formatGex(data.total_gex, 2)}
              </div>
              {data.zero_gamma && (
                <div style={{ marginTop: '4px', fontSize: '13px', color: '#eab308', fontWeight: 'bold' }}>
                  Zero Gamma: ${data.zero_gamma.toFixed(2)}
                </div>
              )}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                  <th style={{ padding: '8px', fontWeight: 'normal' }}>Strike</th>
                  <th style={{ padding: '8px', textAlign: 'right', fontWeight: 'normal' }}>GEX Size</th>
                </tr>
              </thead>
              <tbody>
                {allStrikes.map((item, i) => {
                  const maxGex = Math.max(...allStrikes.map(s => Math.abs(s.gex)));
                  const gexPercent = maxGex > 0 ? (Math.abs(item.gex) / maxGex) * 100 : 0;
                  const isPositive = item.gex >= 0;

                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
                      <td style={{ padding: '10px 8px', fontWeight: 'bold' }}>${item.strike}</td>
                      <td style={{ 
                        padding: '10px 8px', 
                        textAlign: 'right',
                        color: isPositive ? '#00ff66' : '#ff2a55',
                        fontWeight: '600'
                      }}>
                        <div style={{
                          position: 'absolute',
                          right: 0,
                          top: '2px',
                          bottom: '2px',
                          width: `${gexPercent}%`,
                          backgroundColor: isPositive ? 'rgba(0, 255, 102, 0.15)' : 'rgba(255, 42, 85, 0.15)',
                          borderRight: `2px solid ${isPositive ? '#00ff66' : '#ff2a55'}`,
                          zIndex: 0,
                          pointerEvents: 'none'
                        }} />
                        <span style={{ position: 'relative', zIndex: 1 }}>
                          {isPositive ? '+' : ''}{formatGex(item.gex, 2)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};
