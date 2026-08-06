import { useState, useEffect } from 'react';
import { TradingViewWidget } from './components/TradingViewWidget';
import { GexTable } from './components/GexTable';
import { PremiumTable } from './components/PremiumTable';
import { AnomalousTrades } from './components/AnomalousTrades';
import { Square, Columns, Rows, DollarSign, Activity } from 'lucide-react';
import { Responsive as ResponsiveGridLayout, WidthProvider } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './index.css';

const ResponsiveGrid = WidthProvider(ResponsiveGridLayout);

function App() {
  const [layoutMode, setLayoutMode] = useState<'single' | 'vertical' | 'horizontal'>('single');
  const [showPremium, setShowPremium] = useState(false);
  const [showAnomalous, setShowAnomalous] = useState(false);
  const [gexLimit, setGexLimit] = useState<number>(0);
  
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
          <button onClick={() => setLayoutMode('single')} style={{ background: layoutMode === 'single' ? 'rgba(59, 130, 246, 0.2)' : 'transparent', color: layoutMode === 'single' ? '#3b82f6' : '#94a3b8', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer' }} title="Single Chart">
            <Square size={20} />
          </button>
          <button onClick={() => setLayoutMode('vertical')} style={{ background: layoutMode === 'vertical' ? 'rgba(59, 130, 246, 0.2)' : 'transparent', color: layoutMode === 'vertical' ? '#3b82f6' : '#94a3b8', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer' }} title="Vertical Split">
            <Columns size={20} />
          </button>
          <button onClick={() => setLayoutMode('horizontal')} style={{ background: layoutMode === 'horizontal' ? 'rgba(59, 130, 246, 0.2)' : 'transparent', color: layoutMode === 'horizontal' ? '#3b82f6' : '#94a3b8', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer' }} title="Horizontal Split">
            <Rows size={20} />
          </button>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 'bold', color: '#94a3b8' }}>Panels:</span>
          <button onClick={() => setShowPremium(!showPremium)} style={{ background: showPremium ? 'rgba(16, 185, 129, 0.2)' : 'transparent', color: showPremium ? '#10b981' : '#94a3b8', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} title="Toggle Premium Panel">
            <DollarSign size={20} />
            <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Premium</span>
          </button>
          <button onClick={() => setShowAnomalous(!showAnomalous)} style={{ background: showAnomalous ? 'rgba(234, 179, 8, 0.2)' : 'transparent', color: showAnomalous ? '#eab308' : '#94a3b8', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} title="Toggle Anomalous Trades">
            <Activity size={20} />
            <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Anomalous</span>
          </button>
        </div>

        <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 'bold', color: '#94a3b8' }}>GEX Limit:</span>
          <select 
            value={gexLimit} 
            onChange={(e) => setGexLimit(Number(e.target.value))}
            style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '4px 8px', outline: 'none' }}
          >
            <option value={0}>All Strikes</option>
            <option value={5}>5 Strikes</option>
            <option value={10}>10 Strikes</option>
            <option value={20}>20 Strikes</option>
            <option value={50}>50 Strikes</option>
          </select>
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
              <TradingViewWidget chartId="primary" gexLimit={gexLimit} />
            </div>
          </div>

          {layoutMode !== 'single' && (
            <div key="chart-secondary" className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="drag-handle" style={{ cursor: 'move', padding: '8px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '12px', color: '#64748b', textAlign: 'center' }}>:: Drag Handle ::</div>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <TradingViewWidget chartId="secondary" gexLimit={gexLimit} />
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
