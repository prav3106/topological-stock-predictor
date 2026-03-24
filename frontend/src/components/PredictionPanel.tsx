import { useMemo } from 'react';
import {
    LineChart, Line, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell,
} from 'recharts';
import type { PredictionData } from '../types/market';

interface PredictionPanelProps {
    data: PredictionData | null;
    loading: boolean;
    error: string | null;
    onHorizonChange: (days: number) => void;
    selectedHorizon: number;
    onClose: () => void;
}

export default function PredictionPanel({
    data, loading, error, onHorizonChange, selectedHorizon, onClose,
}: PredictionPanelProps) {
    const directionStyles: Record<string, { icon: string; color: string; bg: string }> = {
        UP: { icon: '↑', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
        DOWN: { icon: '↓', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
        NEUTRAL: { icon: '→', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    };

    const residualChartData = useMemo(() => {
        if (!data?.residual_history) return [];
        return data.residual_history.map((v, i) => ({
            day: i - data.residual_history.length + 1,
            residual: parseFloat(v.toFixed(4)),
        }));
    }, [data]);

    const featureData = useMemo(() => {
        if (!data?.feature_importances) return [];
        return Object.entries(data.feature_importances)
            .slice(0, 8)
            .map(([name, value]) => ({
                name: name.replace('tda_', '').replace('_', ' ').substring(0, 15),
                importance: parseFloat((value as number).toFixed(4)),
            }));
    }, [data]);

    if (!data && !loading && !error) {
        return (
            <div className="panel prediction-panel">
                <div className="empty-container">
                    <span className="empty-icon">🎯</span>
                    <p>Click a stock node in the graph to see predictions</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="panel prediction-panel">
                <div className="prediction-header">
                    <h2>Stock Prediction</h2>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>
                <div className="loading-container">
                    <div className="loading-spinner" />
                    <p className="loading-text">Training model & generating prediction…</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="panel prediction-panel">
                <div className="prediction-header">
                    <h2>Prediction Error</h2>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>
                <div className="error-container">
                    <span className="error-icon">⚠</span>
                    <p className="error-text">{error}</p>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const dir = directionStyles[data.direction] || directionStyles.NEUTRAL;
    const pt = data.price_target;
    const prob = data.probability;

    return (
        <div className="panel prediction-panel">
            <div className="prediction-header">
                <h2>{data.ticker.replace('.NS', '')} Prediction</h2>
                <button className="close-btn" onClick={onClose}>✕</button>
            </div>

            {/* Direction + Price */}
            <div className="direction-card" style={{ background: dir.bg, borderColor: dir.color }}>
                <div className="direction-row">
                    <span className="direction-icon" style={{ color: dir.color }}>{dir.icon}</span>
                    <span className="direction-label" style={{ color: dir.color }}>{data.direction}</span>
                    <span className="probability-badge">
                        {(prob * 100).toFixed(1)}% confidence
                    </span>
                </div>
                <div className="price-row">
                    <div className="price-item">
                        <span className="price-label">Current</span>
                        <span className="price-value">₹{pt.current_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="price-arrow" style={{ color: dir.color }}>{dir.icon}</div>
                    <div className="price-item">
                        <span className="price-label">Target ({data.horizon_days}d)</span>
                        <span className="price-value" style={{ color: dir.color }}>
                            ₹{pt.target_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>
                <div className="price-range">
                    <span>₹{pt.lower_bound.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    <div className="range-bar">
                        <div
                            className="range-fill"
                            style={{
                                width: `${Math.min(prob * 100, 95)}%`,
                                background: `linear-gradient(90deg, ${dir.color}40, ${dir.color})`,
                            }}
                        />
                    </div>
                    <span>₹{pt.upper_bound.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="return-badge" style={{ color: dir.color }}>
                    Est. return: {pt.estimated_return > 0 ? '+' : ''}{pt.estimated_return.toFixed(2)}%
                </div>
            </div>

            {/* Horizon Selector */}
            <div className="horizon-selector">
                <span className="horizon-label">Horizon:</span>
                {[5, 10, 20].map(d => (
                    <button
                        key={d}
                        className={`horizon-btn ${selectedHorizon === d ? 'active' : ''}`}
                        onClick={() => onHorizonChange(d)}
                    >
                        {d}d
                    </button>
                ))}
            </div>

            {/* Residual History Chart */}
            {residualChartData.length > 0 && (
                <div className="chart-section">
                    <h3>Residual History (60 days)</h3>
                    <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={residualChartData} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,130,200,0.1)" />
                            <XAxis dataKey="day" tick={{ fill: '#8892b0', fontSize: 10 }} />
                            <YAxis tick={{ fill: '#8892b0', fontSize: 10 }} />
                            <Tooltip
                                contentStyle={{
                                    background: 'rgba(15,20,40,0.95)',
                                    border: '1px solid rgba(100,130,200,0.3)',
                                    borderRadius: '6px',
                                    color: '#e0e6f0',
                                    fontSize: '11px',
                                }}
                            />
                            <Line
                                type="monotone"
                                dataKey="residual"
                                stroke="#818cf8"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4, fill: '#818cf8' }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Feature Importance */}
            {featureData.length > 0 && (
                <div className="chart-section">
                    <h3>Feature Importance</h3>
                    <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={featureData} layout="vertical" margin={{ top: 5, right: 10, bottom: 5, left: 60 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,130,200,0.1)" />
                            <XAxis type="number" tick={{ fill: '#8892b0', fontSize: 10 }} />
                            <YAxis dataKey="name" type="category" tick={{ fill: '#8892b0', fontSize: 10 }} width={55} />
                            <Tooltip
                                contentStyle={{
                                    background: 'rgba(15,20,40,0.95)',
                                    border: '1px solid rgba(100,130,200,0.3)',
                                    borderRadius: '6px',
                                    color: '#e0e6f0',
                                    fontSize: '11px',
                                }}
                            />
                            <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                                {featureData.map((_, i) => (
                                    <Cell key={i} fill={`hsl(${220 + i * 15}, 70%, ${55 + i * 3}%)`} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
