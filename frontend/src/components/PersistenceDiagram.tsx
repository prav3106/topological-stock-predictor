import { useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { TopologyData } from '../types/market';

interface PersistenceDiagramProps {
    data: TopologyData | null;
    loading: boolean;
    error: string | null;
}

export default function PersistenceDiagram({ data, loading, error }: PersistenceDiagramProps) {
    const { h0Points, h1Points, maxVal } = useMemo(() => {
        if (!data?.diagrams) return { h0Points: [], h1Points: [], maxVal: 1 };

        const h0 = data.diagrams.h0.map(p => ({
            birth: parseFloat(p.birth.toFixed(4)),
            death: parseFloat(p.death.toFixed(4)),
            lifetime: parseFloat((p.death - p.birth).toFixed(4)),
            dim: 'H0',
        }));

        const h1 = data.diagrams.h1.map(p => ({
            birth: parseFloat(p.birth.toFixed(4)),
            death: parseFloat(p.death.toFixed(4)),
            lifetime: parseFloat((p.death - p.birth).toFixed(4)),
            dim: 'H1',
        }));

        const allVals = [...h0, ...h1].flatMap(p => [p.birth, p.death]);
        const mx = allVals.length > 0 ? Math.max(...allVals) * 1.1 : 1;

        return { h0Points: h0, h1Points: h1, maxVal: mx };
    }, [data]);

    const regimeColors: Record<string, { bg: string; text: string; glow: string }> = {
        LOW_COMPLEXITY: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', glow: '0 0 20px rgba(34,197,94,0.3)' },
        HIGH_COMPLEXITY: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', glow: '0 0 20px rgba(239,68,68,0.3)' },
        TRANSITION: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', glow: '0 0 20px rgba(245,158,11,0.3)' },
    };

    const regimeLabels: Record<string, string> = {
        LOW_COMPLEXITY: '📈 Low Complexity — Trending',
        HIGH_COMPLEXITY: '🌀 High Complexity — Mean-Reversion',
        TRANSITION: '⚡ Transition — Mixed Signals',
    };

    if (loading) {
        return (
            <div className="panel persistence-panel">
                <div className="loading-container">
                    <div className="loading-spinner" />
                    <p className="loading-text">Computing persistent homology…</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="panel persistence-panel">
                <div className="error-container">
                    <span className="error-icon">⚠</span>
                    <p className="error-text">{error}</p>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="panel persistence-panel">
                <div className="empty-container">
                    <span className="empty-icon">◎</span>
                    <p>Run topology analysis to see persistence diagram</p>
                </div>
            </div>
        );
    }

    const regime = data.regime;
    const rc = regimeColors[regime] || regimeColors.TRANSITION;
    const features = data.features;

    return (
        <div className="panel">
            <div className="prediction-header">
                <h2 className="mono">Persistence Diagram</h2>
                <div className={`signal-pill ${regime === 'LOW_COMPLEXITY' ? 'under' : regime === 'HIGH_COMPLEXITY' ? 'over' : 'neutral'}`} style={{ fontSize: '0.75rem' }}>
                    {regimeLabels[regime] || regime}
                </div>
            </div>

            {/* Chart */}
            <div className="chart-container" style={{ marginTop: '20px' }}>
                <ResponsiveContainer width="100%" height={320}>
                    <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                            type="number" dataKey="birth" name="Birth"
                            domain={[0, maxVal]}
                        />
                        <YAxis
                            type="number" dataKey="death" name="Death"
                            domain={[0, maxVal]}
                        />
                        <ReferenceLine
                            segment={[{ x: 0, y: 0 }, { x: maxVal, y: maxVal }]}
                            stroke="var(--border-primary)"
                            strokeDasharray="5 5"
                        />
                        <Tooltip
                            content={({ active, payload }) => {
                                if (!active || !payload || payload.length === 0) return null;
                                const point = payload[0].payload;
                                const lifetime = (point.death - point.birth).toFixed(4);
                                const isSignificant = point.death - point.birth > 0.05;
                                const dimLabel = point.dim === 'H0'
                                    ? '🔵 Connected Component (H0)'
                                    : '🔶 Loop / Cycle (H1)';
                                
                                return (
                                    <div style={{
                                        background: 'var(--bg-surface)',
                                        border: '1px solid var(--border-primary)',
                                        borderRadius: '8px',
                                        padding: '12px',
                                        color: 'var(--text-primary)',
                                        fontSize: '11px',
                                        maxWidth: '240px',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                    }}>
                                        <div style={{ fontWeight: 700, marginBottom: '6px', color: 'var(--accent-blue)' }}>{dimLabel}</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontFamily: 'var(--font-mono)' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Birth:</span>
                                            <span>{point.birth.toFixed(4)}</span>
                                            <span style={{ color: 'var(--text-muted)' }}>Death:</span>
                                            <span>{point.death.toFixed(4)}</span>
                                            <span style={{ color: 'var(--text-muted)' }}>Life:</span>
                                            <span style={{ color: isSignificant ? 'var(--accent-blue)' : 'inherit' }}>{lifetime}</span>
                                        </div>
                                    </div>
                                );
                            }}
                        />
                        <Scatter
                            name="H0"
                            data={h0Points}
                            fill="var(--accent-blue)"
                            opacity={0.6}
                            shape="circle"
                        />
                        <Scatter
                            name="H1"
                            data={h1Points}
                            fill="#f59e0b"
                            opacity={0.7}
                            shape="diamond"
                        />
                    </ScatterChart>
                </ResponsiveContainer>
            </div>

            {/* TDA Metrics */}
            <div style={{ marginTop: '32px' }}>
                <h3 className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '16px', letterSpacing: '0.1em' }}>TOPOLOGICAL FEATURES</h3>
                <div className="metrics-grid-2x4">
                    <div className="metric-item">
                        <p className="metric-label">Betti-0</p>
                        <p className="metric-value">{features.betti_0}</p>
                    </div>
                    <div className="metric-item">
                        <p className="metric-label">Betti-1</p>
                        <p className="metric-value">{features.betti_1}</p>
                    </div>
                    <div className="metric-item">
                        <p className="metric-label">Max Persistence H0</p>
                        <p className="metric-value">{features.max_persistence_h0.toFixed(3)}</p>
                    </div>
                    <div className="metric-item">
                        <p className="metric-label">Max Persistence H1</p>
                        <p className="metric-value">{features.max_persistence_h1.toFixed(3)}</p>
                    </div>
                    <div className="metric-item">
                        <p className="metric-label">Mean Lifetime H0</p>
                        <p className="metric-value">{features.mean_lifetime_h0.toFixed(3)}</p>
                    </div>
                    <div className="metric-item">
                        <p className="metric-label">Mean Lifetime H1</p>
                        <p className="metric-value">{features.mean_lifetime_h1.toFixed(3)}</p>
                    </div>
                    <div className="metric-item">
                        <p className="metric-label">Topological Entropy</p>
                        <p className="metric-value">{features.topological_entropy.toFixed(3)}</p>
                    </div>
                    <div className="metric-item">
                        <p className="metric-label">Components</p>
                        <p className="metric-value">{features.n_components}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
