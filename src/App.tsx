import { useState } from 'react';
import { TradingViewWidget } from './components/TradingViewWidget';
import { GexTable } from './components/GexTable';
import { Square, Columns, Rows } from 'lucide-react';
import './index.css';

function App() {
  const [layout, setLayout] = useState<'single' | 'vertical' | 'horizontal'>('single');

  return (
    <div className="app-container" style={{ paddingTop: '16px' }}>
      
      {/* Layout Toolbar */}
      <div className="glass-panel" style={{ display: 'flex', gap: '8px', padding: '8px 16px', alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold', marginRight: '16px', color: '#94a3b8' }}>Layout:</span>
        <button onClick={() => setLayout('single')} style={{ background: layout === 'single' ? 'rgba(59, 130, 246, 0.2)' : 'transparent', color: layout === 'single' ? '#3b82f6' : '#94a3b8', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer' }} title="Single Chart">
          <Square size={20} />
        </button>
        <button onClick={() => setLayout('vertical')} style={{ background: layout === 'vertical' ? 'rgba(59, 130, 246, 0.2)' : 'transparent', color: layout === 'vertical' ? '#3b82f6' : '#94a3b8', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer' }} title="Vertical Split">
          <Columns size={20} />
        </button>
        <button onClick={() => setLayout('horizontal')} style={{ background: layout === 'horizontal' ? 'rgba(59, 130, 246, 0.2)' : 'transparent', color: layout === 'horizontal' ? '#3b82f6' : '#94a3b8', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer' }} title="Horizontal Split">
          <Rows size={20} />
        </button>
      </div>

      <main className="main-content">
        <div style={{ flex: 3, display: 'flex', flexDirection: layout === 'horizontal' ? 'column' : 'row', gap: '24px', minHeight: 0, minWidth: 0 }}>
          <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, position: 'relative' }}>
            <TradingViewWidget />
          </div>
          
          {layout !== 'single' && (
            <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0, position: 'relative' }}>
              <TradingViewWidget chartId="secondary" />
            </div>
          )}
        </div>
        
        <aside className="glass-panel side-panel">
          <h3 style={{ paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '16px' }}>
            0DTE Gamma Exposure
          </h3>
          
          <GexTable activeCharts={layout === 'single' ? ['primary'] : ['primary', 'secondary']} />

        </aside>
      </main>
    </div>
  );
}

export default App;
