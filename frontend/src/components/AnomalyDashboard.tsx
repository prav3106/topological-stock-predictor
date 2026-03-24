import type { AnomaliesData } from '../types/market';

interface AnomalyDashboardProps {
    data: AnomaliesData | null;
    loading: boolean;
    error: string | null;
    onTickerClick: (ticker: string) => void;
}

export default function AnomalyDashboard({ data, loading, error, onTickerClick }: AnomalyDashboardProps) {
    if (loading) {
        return (
            <div className="panel anomaly-panel">
                <div className="loading-container">
                    <div className="loading-spinner" />
                    <p className="loading-text">Detecting anomalies…</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="panel anomaly-panel">
                <div className="error-container">
                    <span className="error-icon">⚠</span>
                    <p className="error-text">{error}</p>
                </div>
            </div>
        );
    }

    if (!data || data.anomalies.length === 0) {
        return (
            <div className="panel anomaly-panel">
                <div className="empty-container">
                    <span className="empty-icon">🔍</span>
                    <p>No anomalies detected. Build the graph first.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="panel anomaly-panel">
            <h2>Top Anomalies</h2>
            <p className="panel-subtitle">Stocks most diverged from graph consensus</p>

            <div className="anomaly-table-wrapper">
                <table className="anomaly-table">
                    <thead>
                        <tr>
                            <th>Ticker</th>
                            <th>Residual</th>
                            <th>Signal</th>
                            <th>Predicted Move</th>
                            <th>Confidence</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.anomalies.map(a => {
                            const isOver = a.signal === 'OVERPERFORMING';
                            const rowColor = isOver
                                ? 'rgba(239, 68, 68, 0.08)'
                                : a.signal === 'UNDERPERFORMING'
                                    ? 'rgba(59, 130, 246, 0.08)'
                                    : 'transparent';

                            const signalColor = isOver ? '#ef4444' : a.signal === 'UNDERPERFORMING' ? '#60a5fa' : '#f59e0b';

                            return (
                                <tr
                                    key={a.ticker}
                                    style={{ background: rowColor }}
                                    className="anomaly-row"
                                    onClick={() => onTickerClick(a.ticker)}
                                >
                                    <td className="ticker-cell">
                                        <span className="ticker-name">{a.ticker.replace('.NS', '')}</span>
                                        {a.price > 0 && <span className="ticker-price">₹{a.price.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>}
                                    </td>
                                    <td>
                                        <span
                                            className="residual-badge"
                                            style={{ color: signalColor }}
                                        >
                                            {a.residual > 0 ? '+' : ''}{a.residual.toFixed(4)}
                                        </span>
                                    </td>
                                    <td>
                                        <span className="signal-badge" style={{ color: signalColor, borderColor: signalColor }}>
                                            {isOver ? '🔴' : '🔵'} {a.signal}
                                        </span>
                                    </td>
                                    <td className="move-cell">{a.predicted_move}</td>
                                    <td>
                                        <div className="confidence-bar-wrapper">
                                            <div
                                                className="confidence-bar-fill"
                                                style={{
                                                    width: `${a.confidence * 100}%`,
                                                    background: `linear-gradient(90deg, ${signalColor}60, ${signalColor})`,
                                                }}
                                            />
                                            <span className="confidence-label">{(a.confidence * 100).toFixed(0)}%</span>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
