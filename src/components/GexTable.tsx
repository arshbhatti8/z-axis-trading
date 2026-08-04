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
  const [dataMap, setDataMap] = useState<Record<string, GexData>>({});

  useEffect(() => {
    const handleUpdate = (e: any) => {
      const { chartId, data } = e.detail;
      setDataMap(prev => ({ ...prev, [chartId]: data }));
    };
    window.addEventListener('gexDataUpdate', handleUpdate);
    return () => window.removeEventListener('gexDataUpdate', handleUpdate);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', gap: '32px' }}>
      {activeCharts.map(chartId => {
        const data = dataMap[chartId];
        
        if (!data) {
          return (
            <div key={chartId} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#94a3b8', padding: '20px' }}>
              Awaiting GEX data stream for {chartId}...
            </div>
          );
        }

        const allStrikes = [...data.most_positive, ...data.most_negative].sort((a, b) => b.strike - a.strike);

        return (
          <div key={chartId} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' }}>Total 0DTE GEX ({data.ticker})</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: data.total_gex >= 0 ? '#10b981' : '#ef4444' }}>
                {data.total_gex >= 0 ? '+' : ''}{(data.total_gex / 1e9).toFixed(2)}B
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
                  <th style={{ padding: '8px 4px', fontWeight: 'normal' }}>Strike</th>
                  <th style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 'normal' }}>GEX (B)</th>
                </tr>
              </thead>
              <tbody>
                {allStrikes.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px 4px', fontWeight: 'bold' }}>${item.strike}</td>
                    <td style={{ 
                      padding: '10px 4px', 
                      textAlign: 'right',
                      color: item.gex >= 0 ? '#10b981' : '#ef4444',
                      fontWeight: '600'
                    }}>
                      {item.gex >= 0 ? '+' : ''}{(item.gex / 1e9).toFixed(2)}
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
