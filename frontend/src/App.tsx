import { useState, useCallback } from 'react';
import GraphView from './components/GraphView';
import PersistenceDiagram from './components/PersistenceDiagram';
import PredictionPanel from './components/PredictionPanel';
import AnomalyDashboard from './components/AnomalyDashboard';
import ControlsPanel from './components/ControlsPanel';
import {
    useGraphData,
    useTopologyData,
    usePrediction,
    useAnomalies,
    useAutoRefresh,
} from './hooks/useMarketData';
import type { GraphParams } from './types/market';

type TabKey = 'graph' | 'topology' | 'anomalies';

export default function App() {
    const [activeTab, setActiveTab] = useState<TabKey>('graph');
    const [params, setParams] = useState<GraphParams>({
        lookback_days: 252,
        sigma: 0.5,
        diffusion_t: 1.0,
        edge_threshold: 0.3,
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
    ];

    return (
        <div className="app-container">
            {/* Header */}
            <header className="app-header">
                <div className="header-brand">
                    <span className="brand-icon">⬡</span>
                    <div>
                        <h1>Topology Trading System</h1>
                        <p className="brand-subtitle">Graph Diffusion · TDA · Indian Market (NSE)</p>
                    </div>
                </div>
                <div className="header-status">
                    {graph.data && (
                        <span className="status-chip success">
                            {graph.data.nodes.length} stocks loaded
                        </span>
                    )}
                    {topology.data && (
                        <span className={`status-chip ${topology.data.regime === 'LOW_COMPLEXITY' ? 'success' :
                                topology.data.regime === 'HIGH_COMPLEXITY' ? 'danger' : 'warning'
                            }`}>
                            {topology.data.regime.replace('_', ' ')}
                        </span>
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
                                <span className="tab-icon">{t.icon}</span>
                                {t.label}
                            </button>
                        ))}
                    </nav>

                    {/* Tab content */}
                    <div className="tab-content">
                        {activeTab === 'graph' && (
                            <div className="graph-layout">
                                <GraphView
                                    data={graph.data}
                                    loading={graph.loading}
                                    error={graph.error}
                                    edgeThreshold={params.edge_threshold}
                                    onNodeClick={handleNodeClick}
                                />
                                <PredictionPanel
                                    data={prediction.data}
                                    loading={prediction.loading}
                                    error={prediction.error}
                                    onHorizonChange={handleHorizonChange}
                                    selectedHorizon={horizon}
                                    onClose={handleClosePrediction}
                                />
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
                    </div>
                </main>
            </div>
        </div>
    );
}
