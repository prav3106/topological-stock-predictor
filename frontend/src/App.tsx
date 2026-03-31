import { useState, useCallback, useEffect } from 'react';
import GraphView from './components/GraphView';
import PersistenceDiagram from './components/PersistenceDiagram';
import PredictionPanel from './components/PredictionPanel';
import AnomalyDashboard from './components/AnomalyDashboard';
import ControlsPanel from './components/ControlsPanel';
import BacktestTab from './components/BacktestTab';
import {
    useGraphData,
    useTopologyData,
    usePrediction,
    useAnomalies,
    useAutoRefresh,
} from './hooks/useMarketData';
import type { GraphParams } from './types/market';

const REGIME_DESCRIPTIONS: Record<string, string> = {
    'BULL': 'Bullish Market — Strong upward momentum, low volatility',
    'BEAR': 'Bearish Market — Negative momentum, high risk',
    'SIDEWAYS': 'Sideways Market — Low volatility, range-bound price action',
    'VOLATILE': 'Volatile Market — High uncertainty, rapid price swings',
};

type TabKey = 'graph' | 'topology' | 'anomalies' | 'backtest';

export default function App() {
    const [activeTab, setActiveTab] = useState<TabKey>('graph');
    const [params, setParams] = useState<GraphParams>({
        lookback_days: 252,
        sigma: 0.8,
        diffusion_t: 1.2,
        edge_threshold: 0.45,
    });
    const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
    const [horizon, setHorizon] = useState(5);
    const [autoRefresh, setAutoRefresh] = useState(false);

    const graph = useGraphData();
    const topology = useTopologyData();
    const prediction = usePrediction();
    const anomalies = useAnomalies();

    const isAnyLoading = graph.loading || topology.loading;

    const handleRefresh = useCallback(() => {
        graph.buildGraph(params);
        topology.runTopology({ lookback_days: params.lookback_days, embedding_dim: 10 });
        anomalies.fetchAnomalies();
    }, [params, graph.buildGraph, topology.runTopology, anomalies.fetchAnomalies]);

    // Initial fetch on mount
    useEffect(() => {
        handleRefresh();
    }, []);

    useAutoRefresh(handleRefresh, autoRefresh);

    const handleNodeClick = useCallback((ticker: string) => {
        setSelectedTicker(ticker);
        prediction.predict({ ticker, horizon_days: horizon });
    }, [horizon, prediction.predict]);

    const handleHorizonChange = useCallback((days: number) => {
        setHorizon(days);
        if (selectedTicker) {
            prediction.predict({ ticker: selectedTicker, horizon_days: days });
        }
    }, [selectedTicker, prediction.predict]);

    const handleClosePrediction = useCallback(() => {
        setSelectedTicker(null);
    }, []);

    const tabs: { key: TabKey; label: string; icon: string }[] = [
        { key: 'graph', label: 'Graph View', icon: '◉' },
        { key: 'topology', label: 'Topology', icon: '◎' },
        { key: 'anomalies', label: 'Anomalies', icon: '⚡' },
        { key: 'backtest', label: 'Backtest', icon: '◷' },
    ];

    return (
        <div className="app-container">
            {/* Header */}
            <header className="app-header">
                <div className="header-brand">
                    <span className="brand-icon">⬡</span>
                    <div>
                        <h1>TOPOLOGY</h1>
                        <p className="brand-subtitle">TRADING SYSTEM</p>
                    </div>
                </div>

                <div className="header-status">
                    {graph.data && (
                        <div className="status-chip success mono">
                            {graph.data.nodes.length} STOCKS LOADED
                        </div>
                    )}
                    {topology.data && (
                        <div className="regime-label-container">
                            <div 
                                className="help-icon" 
                                data-tooltip-align="right"
                                data-tooltip="Market State Legend:&#10;• BULL: Bullish (Trending Up)&#10;• BEAR: Bearish (Trending Down)&#10;• SIDEWAYS: Neutral (Range-bound)&#10;• VOLATILE: High Risk (Erratic price action)"
                            >
                                i
                            </div>
                            <span className="regime-label">REGIME:</span>
                            <div 
                                className={`status-chip ${
                                    topology.data.regime === 'BULL' ? 'success' :
                                    topology.data.regime === 'BEAR' ? 'danger' :
                                    topology.data.regime === 'SIDEWAYS' ? 'warning' : 'volatile'
                                } mono`}
                                data-tooltip-align="right"
                                data-tooltip={REGIME_DESCRIPTIONS[topology.data.regime]}
                            >
                                <span className="status-dot" />
                                {topology.data.regime.replace('_', ' ')}
                            </div>
                        </div>
                    )}
                </div>
            </header>

            {/* Main layout */}
            <div className="app-layout">
                {/* Sidebar Controls */}
                <aside className="app-sidebar">
                    <ControlsPanel
                        params={params}
                        onParamsChange={setParams}
                        onRefresh={handleRefresh}
                        autoRefresh={autoRefresh}
                        onAutoRefreshToggle={() => setAutoRefresh(p => !p)}
                        loading={isAnyLoading}
                    />
                </aside>

                {/* Main content */}
                <main className="app-main">
                    {/* Tab navigation */}
                    <nav className="tab-nav">
                        {tabs.map(t => (
                            <button
                                key={t.key}
                                className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
                                onClick={() => setActiveTab(t.key)}
                            >
                                {t.label}
                            </button>
                        ))}
                    </nav>

                    {/* Tab content */}
                    <div className="tab-content">
                        {activeTab === 'graph' && (
                            <div className="graph-layout">
                                <div className="graph-view-container">
                                    <div className="graph-vignette" />
                                    <GraphView
                                        data={graph.data}
                                        loading={graph.loading}
                                        error={graph.error}
                                        edgeThreshold={params.edge_threshold}
                                        onNodeClick={handleNodeClick}
                                    />
                                </div>
                                <div className="prediction-sidebar">
                                    <PredictionPanel
                                        data={prediction.data}
                                        loading={prediction.loading}
                                        error={prediction.error}
                                        onHorizonChange={handleHorizonChange}
                                        selectedHorizon={horizon}
                                        onClose={handleClosePrediction}
                                    />
                                </div>
                            </div>
                        )}

                        {activeTab === 'topology' && (
                            <PersistenceDiagram
                                data={topology.data}
                                loading={topology.loading}
                                error={topology.error}
                            />
                        )}

                        {activeTab === 'anomalies' && (
                            <AnomalyDashboard
                                data={anomalies.data}
                                loading={anomalies.loading}
                                error={anomalies.error}
                                onTickerClick={handleNodeClick}
                            />
                        )}

                        {activeTab === 'backtest' && (
                            <BacktestTab />
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
}
