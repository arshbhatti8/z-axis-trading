import { Activity, Settings, Bell } from 'lucide-react';
import { TradingViewWidget } from './components/TradingViewWidget';
import { GexTable } from './components/GexTable';
import './index.css';

function App() {
  return (
    <div className="app-container">
      <header className="glass-panel header">
        <h1>
          <Activity color="#3b82f6" size={28} />
          OptionsInsight
        </h1>
        <div className="controls">
          <button className="btn">
            <Bell size={18} />
          </button>
          <button className="btn">
            <Settings size={18} />
          </button>
          <button className="btn active">
            Connect Wallet
          </button>
        </div>
      </header>

      <main className="main-content">
        <TradingViewWidget />
        
        <aside className="glass-panel side-panel">
          <h3 style={{ paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '16px' }}>
            0DTE Gamma Exposure
          </h3>
          
          <GexTable />

        </aside>
      </main>
    </div>
  );
}

export default App;
