import { useState, useEffect } from 'react';
import { TradingViewWidget } from './components/TradingViewWidget';
import { PremiumTable } from './components/PremiumTable';
import { AnomalousTrades } from './components/AnomalousTrades';
import { Square, Columns, Rows, DollarSign, Activity, Settings } from 'lucide-react';
import { Responsive as ResponsiveGridLayout, WidthProvider } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './index.css';

const ResponsiveGrid = WidthProvider(ResponsiveGridLayout);

function App() {
  const [layoutMode, setLayoutMode] = useState<'single' | 'vertical' | 'horizontal'>('single');
  const [showPremium, setShowPremium] = useState(false);
  const [showAnomalous, setShowAnomalous] = useState(false);
  const [isMockMode, setIsMockMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    // Default to today local time
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  });
  
  // Keep track of which tickers are active in charts for the tables to consume
  // For simplicity, primary is always SPY/active, secondary is also tracked inside TradingViewWidget
  // We'll just pass the chart IDs down
  const activeCharts = layoutMode === 'single' ? ['primary'] : ['primary', 'secondary'];

  const getInitialLayout = () => {
    let items = [];
    if (layoutMode === 'single') {
      items.push({ i: 'chart-primary', x: 0, y: 0, w: 12, h: 10 });
    } else if (layoutMode === 'vertical') {
      items.push({ i: 'chart-primary', x: 0, y: 0, w: 6, h: 10 });
      items.push({ i: 'chart-secondary', x: 6, y: 0, w: 6, h: 10 });
    } else {
      items.push({ i: 'chart-primary', x: 0, y: 0, w: 12, h: 5 });
      items.push({ i: 'chart-secondary', x: 0, y: 5, w: 12, h: 5 });
    }

    if (showPremium) {
      items.push({ i: 'premium-panel', x: 9, y: 5, w: 3, h: 5 });
    }
    
    if (showAnomalous) {
      items.push({ i: 'anomalous-panel', x: 0, y: 10, w: 12, h: 4 });
    }
    
    return items;
  };

  const [layouts, setLayouts] = useState({ lg: getInitialLayout() });

  // Update layout when buttons are clicked
  useEffect(() => {
    setLayouts({ lg: getInitialLayout() });
  }, [layoutMode, showPremium, showAnomalous]);

  const onLayoutChange = (_layout: any, allLayouts: any) => {
    setLayouts(allLayouts);
  };

  return (
    <div className="app-container" style={{ paddingTop: '16px', overflowX: 'hidden' }}>
      
      {/* Layout Toolbar */}
      <div className="glass-panel" style={{ display: 'flex', gap: '16px', padding: '8px 16px', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 'bold', color: '#94a3b8' }}>Layout:</span>
          <button onClick={() => setLayoutMode('single')} className={`btn-tactile ${layoutMode === 'single' ? 'active-blue' : ''}`} title="Single Chart">
            <Square size={18} />
          </button>
          <button onClick={() => setLayoutMode('vertical')} className={`btn-tactile ${layoutMode === 'vertical' ? 'active-blue' : ''}`} title="Vertical Split">
            <Columns size={18} />
          </button>
          <button onClick={() => setLayoutMode('horizontal')} className={`btn-tactile ${layoutMode === 'horizontal' ? 'active-blue' : ''}`} title="Horizontal Split">
            <Rows size={18} />
          </button>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 'bold', color: '#94a3b8' }}>Panels:</span>
          <button onClick={() => setShowPremium(!showPremium)} className={`btn-tactile ${showPremium ? 'active-green' : ''}`} title="Toggle Premium Panel">
            <DollarSign size={18} />
            <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Premium</span>
          </button>
          <button onClick={() => setShowAnomalous(!showAnomalous)} className={`btn-tactile ${showAnomalous ? 'active-yellow' : ''}`} title="Toggle Anomalous Trades">
            <Activity size={18} />
            <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Anomalous</span>
          </button>
        </div>
        
        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <span style={{ fontWeight: 'bold', color: '#94a3b8' }}>Playback Date:</span>
          <input 
            type="date" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="input-tactile"
          />
          
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setShowSettings(!showSettings)}
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center' }}
              title="Settings"
            >
              <Settings size={20} />
            </button>
            
            {showSettings && (
              <div style={{ 
                position: 'absolute', 
                top: '100%', 
                right: 0, 
                marginTop: '8px',
                background: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '12px',
                zIndex: 100,
                width: 'max-content',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                backdropFilter: 'blur(8px)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
                  <span style={{ color: 'white', fontSize: '14px', fontWeight: 'bold' }}>Data Source</span>
                  <button 
                    onClick={() => setIsMockMode(!isMockMode)}
                    style={{ 
                      background: isMockMode ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)', 
                      color: isMockMode ? '#10b981' : '#94a3b8',
                      border: `1px solid ${isMockMode ? '#10b981' : 'rgba(255,255,255,0.1)'}`,
                      padding: '6px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      transition: 'all 0.2s'
                    }}
                  >
                    {isMockMode ? 'Simulated GEX' : 'Live GEX'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <ResponsiveGrid
          className="layout"
          layouts={layouts}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={60}
          onLayoutChange={onLayoutChange}
          draggableHandle=".drag-handle"
          margin={[16, 16]}
          resizeHandles={['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne']}
        >
          <div key="chart-primary" className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="drag-handle" style={{ cursor: 'move', padding: '8px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '12px', color: '#64748b', textAlign: 'center' }}>:: Drag Handle ::</div>
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <TradingViewWidget chartId="primary" globalDate={selectedDate} isMockMode={isMockMode} />
            </div>
          </div>

          {layoutMode !== 'single' && (
            <div key="chart-secondary" className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="drag-handle" style={{ cursor: 'move', padding: '8px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '12px', color: '#64748b', textAlign: 'center' }}>:: Drag Handle ::</div>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <TradingViewWidget chartId="secondary" globalDate={selectedDate} isMockMode={isMockMode} />
              </div>
            </div>
          )}

          {showPremium && (
            <div key="premium-panel" className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="drag-handle" style={{ cursor: 'move', padding: '8px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '12px', color: '#64748b', textAlign: 'center' }}>:: Drag Handle ::</div>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                <PremiumTable activeCharts={activeCharts} />
              </div>
            </div>
          )}

          {showAnomalous && (
            <div key="anomalous-panel" className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="drag-handle" style={{ cursor: 'move', padding: '8px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '12px', color: '#64748b', textAlign: 'center' }}>:: Drag Handle ::</div>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                <AnomalousTrades defaultTicker="SPY" />
              </div>
            </div>
          )}
        </ResponsiveGrid>
      </div>
    </div>
  );
}

export default App;
