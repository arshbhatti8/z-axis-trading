import { TradingViewWidget } from './components/TradingViewWidget';
import { GexTable } from './components/GexTable';
import './index.css';

function App() {
  return (
    <div className="app-container">
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
