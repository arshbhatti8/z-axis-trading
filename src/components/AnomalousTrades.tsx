import { useEffect, useState } from 'react';

interface AnomalousTrade {
  time: number;
  price: number;
  size: number;
}

export const AnomalousTrades = ({ defaultTicker = 'SPY' }: { defaultTicker?: string }) => {
  const [activeTicker, setActiveTicker] = useState(defaultTicker);
  const [tickerInput, setTickerInput] = useState(defaultTicker);
  const [trades, setTrades] = useState<AnomalousTrade[]>([]);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    setStatus('loading');
    const ws = new WebSocket(`ws://${window.location.hostname}:8001/ws/anomalous/${activeTicker}`);
    ws.onopen = () => setStatus('success'); // Once connected, it's successful even if no trades yet
    ws.onerror = () => setStatus('error');
    ws.onclose = () => setStatus('error');
    ws.onmessage = (e) => {
      try {
        const trade = JSON.parse(e.data);
        if (trade && trade.size) {
           setStatus('success');
           setTrades(prev => [trade, ...prev].slice(0, 50));
        }
      } catch (err) {}
    };
    return () => ws.close();
  }, [activeTicker]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: '16px', padding: '0 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' }}>Anomalous Trades</div>
        <form onSubmit={(e) => { e.preventDefault(); setActiveTicker(tickerInput.toUpperCase()); setTrades([]); }}>
          <input 
            type="text" 
            value={tickerInput} 
            onChange={e => setTickerInput(e.target.value)} 
            placeholder="Ticker..." 
            style={{ width: '60px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', outline: 'none' }}
          />
        </form>
      </div>
      {status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#94a3b8', padding: '40px 20px', gap: '16px' }}>
          <div style={{ width: '24px', height: '24px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <div style={{ fontSize: '12px' }}>Connecting to data feed...</div>
        </div>
      )}
      {status === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#ef4444', padding: '40px 20px', gap: '16px' }}>
          <div style={{ fontSize: '12px' }}>Failed to connect to anomalous trades feed.</div>
        </div>
      )}
      {status === 'success' && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
              <th style={{ padding: '8px', fontWeight: 'normal' }}>Time</th>
              <th style={{ padding: '8px', textAlign: 'right', fontWeight: 'normal' }}>Price</th>
              <th style={{ padding: '8px', textAlign: 'right', fontWeight: 'normal' }}>Size</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '8px', color: '#94a3b8' }}>{new Date(t.time * 1000).toLocaleTimeString()}</td>
                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>${t.price.toFixed(2)}</td>
                <td style={{ padding: '8px', textAlign: 'right', color: '#eab308', fontWeight: 'bold' }}>{t.size.toLocaleString()}</td>
              </tr>
            ))}
            {trades.length === 0 && (
               <tr>
                 <td colSpan={3} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Awaiting anomalous prints...</td>
               </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};
