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

const ConfidenceRing = ({ value }: { value: number }) => {
    const radius = 18;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value * circumference);

    return (
        <div className="confidence-ring">
            <svg width="44" height="44" className="confidence-arc">
                <circle
                    cx="22" cy="22" r={radius}
                    fill="transparent"
                    stroke="var(--border-primary)"
                    strokeWidth="3"
                />
                <circle
                    cx="22" cy="22" r={radius}
                    fill="transparent"
                    stroke="var(--accent-blue)"
                    strokeWidth="3"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                />
            </svg>
            <span style={{ position: 'absolute', fontSize: '0.65rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                {Math.round(value * 100)}%
            </span>
        </div>
    );
};

export default function PredictionPanel({
    data, loading, error, onHorizonChange, selectedHorizon, onClose,
}: PredictionPanelProps) {
    const directionStyles: Record<string, { icon: string; color: string; class: string }> = {
        UP: { icon: '↑', color: 'var(--bullish)', class: 'up' },
        DOWN: { icon: '↓', color: 'var(--bearish)', class: 'down' },
        NEUTRAL: { icon: '→', color: 'var(--neutral)', class: 'neutral' },
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
            .slice(0, 6)
            .map(([name, value]) => ({
                name: name.replace('tda_', '').replace('_', ' ').substring(0, 12).toUpperCase(),
                importance: parseFloat((value as number).toFixed(4)),
            }));
    }, [data]);

    if (!data && !loading && !error) {
        return (
            <div className="panel" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center', opacity: 0.5 }}>
                    <p className="mono" style={{ fontSize: '0.8rem' }}>SELECT NODE FOR ANALYSIS</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="panel" style={{ height: '100%' }}>
                <div className="loading-overlay">
                    <div className="loader" />
                    <p className="mono" style={{ fontSize: '0.7rem' }}>TRAINING MODEL...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="panel" style={{ height: '100%' }}>
                <div className="prediction-header" style={{ marginBottom: 20 }}>
                    <h2 className="mono">ERROR</h2>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>
                <p className="mono" style={{ color: 'var(--bearish)', fontSize: '0.8rem' }}>{error}</p>
            </div>
        );
    }

    if (!data) return null;

    const dir = directionStyles[data.direction] || directionStyles.NEUTRAL;
    const pt = data.price_target;

    return (
        <div className="prediction-sidebar">
            <div className="prediction-header">
                <h2 className="mono">{data.ticker.replace('.NS', '')} ANALYSIS</h2>
            </div>

            <div className={`prediction-card ${dir.class}`}>
                <div className="direction-display">
                    <div className="direction-box" style={{ color: dir.color }}>
                        <span>{dir.icon}</span>
                        <span>{data.direction}</span>
                    </div>
                    <ConfidenceRing value={data.probability} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                        <p className="metric-label">Current Price</p>
                        <p className="metric-value">₹{pt.current_price.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                        <p className="metric-label">Target ({data.horizon_days}d)</p>
                        <p className="metric-value" style={{ color: dir.color }}>₹{pt.target_price.toLocaleString('en-IN')}</p>
                    </div>
                </div>

                <div style={{ marginTop: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span className="mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>₹{pt.lower_bound.toFixed(0)}</span>
                        <span className="mono" style={{ fontSize: '0.7rem', fontWeight: 700, color: dir.color }}>
                            {pt.estimated_return > 0 ? '+' : ''}{pt.estimated_return.toFixed(2)}% EST.
                        </span>
                        <span className="mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>₹{pt.upper_bound.toFixed(0)}</span>
                    </div>
                    <div style={{ height: 2, background: 'var(--border-primary)', position: 'relative' }}>
                        <div
                            style={{
                                position: 'absolute',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                width: `${data.probability * 100}%`,
                                height: '100%',
                                background: dir.color,
                                boxShadow: `0 0 10px ${dir.color}80`,
                            }}
                        />
                    </div>
                </div>
            </div>

            <div className="horizon-selector">
                {[5, 10, 20].map(d => (
                    <button
                        key={d}
                        className={`horizon-btn ${selectedHorizon === d ? 'active' : ''}`}
                        onClick={() => onHorizonChange(d)}
                    >
                        {d}D
                    </button>
                ))}
            </div>

            {/* Residual Chart */}
            <div className="panel" style={{ padding: '16px', background: 'transparent', boxShadow: 'none' }}>
                <h3 className="mono" style={{ fontSize: '0.7rem', marginBottom: '12px', color: 'var(--text-muted)' }}>RESIDUAL HISTORY</h3>
                <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={residualChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="day" hide />
                        <YAxis hide domain={['auto', 'auto']} />
                        <Tooltip
                            contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-primary)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}
                            itemStyle={{ color: 'var(--accent-blue)' }}
                            labelStyle={{ display: 'none' }}
                        />
                        <Line
                            type="monotone"
                            dataKey="residual"
                            stroke="var(--accent-blue)"
                            strokeWidth={1.5}
                            dot={false}
                            animationDuration={1000}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Feature Importance */}
            <div className="panel" style={{ padding: '16px', background: 'transparent', boxShadow: 'none' }}>
                <h3 className="mono" style={{ fontSize: '0.7rem', marginBottom: '12px', color: 'var(--text-muted)' }}>MODEL FEATURES</h3>
                <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={featureData} layout="vertical" margin={{ left: -20 }}>
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 9, fontFamily: 'var(--font-mono)' }} stroke="none" />
                        <Tooltip
                            contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-primary)', fontSize: '10px' }}
                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                        />
                        <Bar dataKey="importance" radius={[0, 2, 2, 0]}>
                            {featureData.map((_, i) => (
                                <Cell key={i} fill={i === 0 ? 'var(--accent-blue)' : 'var(--border-primary)'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
