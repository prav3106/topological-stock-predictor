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
        <div className="panel">
            <h2 className="mono">Anomalies Detected</h2>
            <p className="panel-subtitle">Stocks most diverged from graph consensus</p>

            <div className="anomaly-table-wrapper" style={{ marginTop: '24px' }}>
                <table className="anomaly-table">
                    <thead>
                        <tr>
                            <th>Ticker</th>
                            <th>Residual</th>
                            <th>Signal</th>
                            <th>Move</th>
                            <th style={{ textAlign: 'right' }}>Confidence</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.anomalies.map(a => {
                            const isOver = a.signal === 'OVERPERFORMING';
                            const signalClass = isOver ? 'over' : a.signal === 'UNDERPERFORMING' ? 'under' : '';

                            return (
                                <tr
                                    key={a.ticker}
                                    className="anomaly-row"
                                    onClick={() => onTickerClick(a.ticker)}
                                >
                                    <td className="symbol-col">
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span>{a.ticker.replace('.NS', '')}</span>
                                            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>₹{a.price.toLocaleString('en-IN')}</span>
                                        </div>
                                    </td>
                                    <td className={a.residual > 0 ? 'res-positive' : 'res-negative'}>
                                        {a.residual > 0 ? '+' : ''}{a.residual.toFixed(4)}
                                    </td>
                                    <td>
                                        <span className={`signal-pill ${signalClass}`}>
                                            {a.signal}
                                        </span>
                                    </td>
                                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{a.predicted_move}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                            <div style={{ width: '60px', height: '2px', background: 'var(--border-primary)', position: 'relative' }}>
                                                <div style={{
                                                    position: 'absolute',
                                                    right: 0,
                                                    width: `${a.confidence * 100}%`,
                                                    height: '100%',
                                                    background: isOver ? 'var(--bearish)' : 'var(--accent-blue)',
                                                }} />
                                            </div>
                                            <span className="mono" style={{ fontSize: '0.65rem', width: '25px', textAlign: 'right' }}>
                                                {Math.round(a.confidence * 100)}%
                                            </span>
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
