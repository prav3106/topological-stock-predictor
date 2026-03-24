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
        <div className="panel persistence-panel">
            <h2>Persistence Diagram</h2>

            {/* Regime Badge */}
            <div className="regime-badge" style={{ background: rc.bg, boxShadow: rc.glow, borderColor: rc.text }}>
                <span className="regime-label" style={{ color: rc.text }}>
                    {regimeLabels[regime] || regime}
                </span>
            </div>

            {/* Chart */}
            <div className="chart-container">
                <ResponsiveContainer width="100%" height={350}>
                    <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(100,130,200,0.1)" />
                        <XAxis
                            type="number" dataKey="birth" name="Birth"
                            domain={[0, maxVal]}
                            tick={{ fill: '#8892b0', fontSize: 11 }}
                            label={{ value: 'Birth', position: 'bottom', fill: '#8892b0', fontSize: 12 }}
                        />
                        <YAxis
                            type="number" dataKey="death" name="Death"
                            domain={[0, maxVal]}
                            tick={{ fill: '#8892b0', fontSize: 11 }}
                            label={{ value: 'Death', angle: -90, position: 'insideLeft', fill: '#8892b0', fontSize: 12 }}
                        />
                        <ReferenceLine
                            segment={[{ x: 0, y: 0 }, { x: maxVal, y: maxVal }]}
                            stroke="rgba(200,200,200,0.3)"
                            strokeDasharray="5 5"
                            label=""
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
                                const interpretation = point.dim === 'H0'
                                    ? (isSignificant
                                        ? 'A distinct cluster of correlated stocks. Longer lifetime = more independent sector group.'
                                        : 'A minor component that quickly merged — likely noise.')
                                    : (isSignificant
                                        ? 'A circular correlation pattern (e.g., A↔B↔C↔A). Indicates complex market structure.'
                                        : 'A short-lived loop — likely noise in correlations.');

                                return (
                                    <div style={{
                                        background: 'rgba(10, 15, 30, 0.97)',
                                        border: '1px solid rgba(100,150,255,0.35)',
                                        borderRadius: '10px',
                                        padding: '14px 18px',
                                        color: '#e0e8ff',
                                        fontSize: '13px',
                                        lineHeight: '1.7',
                                        maxWidth: '320px',
                                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                                    }}>
                                        <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '8px' }}>
                                            {dimLabel}
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                                            <span style={{ color: '#8892b0' }}>Birth:</span>
                                            <span style={{ fontFamily: 'monospace' }}>{point.birth.toFixed(4)}</span>
                                            <span style={{ color: '#8892b0' }}>Death:</span>
                                            <span style={{ fontFamily: 'monospace' }}>{point.death.toFixed(4)}</span>
                                            <span style={{ color: '#8892b0' }}>Lifetime:</span>
                                            <span style={{
                                                fontFamily: 'monospace',
                                                fontWeight: 700,
                                                color: isSignificant ? '#60a5fa' : '#6b7280',
                                            }}>{lifetime}</span>
                                        </div>
                                        <div style={{
                                            marginTop: '10px',
                                            padding: '8px 10px',
                                            background: isSignificant ? 'rgba(96,165,250,0.1)' : 'rgba(107,114,128,0.1)',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            color: isSignificant ? '#93c5fd' : '#9ca3af',
                                            borderLeft: `3px solid ${isSignificant ? '#60a5fa' : '#4b5563'}`,
                                        }}>
                                            {interpretation}
                                        </div>
                                    </div>
                                );
                            }}
                        />
                        <Scatter
                            name="H0 (Components)"
                            data={h0Points}
                            fill="#60a5fa"
                            opacity={0.8}
                            shape="circle"
                        />
                        <Scatter
                            name="H1 (Loops)"
                            data={h1Points}
                            fill="#fb923c"
                            opacity={0.8}
                            shape="diamond"
                        />
                    </ScatterChart>
                </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="persistence-legend">
                <span className="legend-item"><span className="dot" style={{ background: '#60a5fa' }} />H0 — Connected Components</span>
                <span className="legend-item"><span className="dot" style={{ background: '#fb923c' }} />H1 — Loops / Cycles</span>
            </div>

            {/* TDA Metrics */}
            <div className="tda-metrics">
                <h3>Topological Features</h3>
                <div className="metrics-grid">
                    <div className="metric">
                        <span className="metric-label">Betti-0</span>
                        <span className="metric-value">{features.betti_0}</span>
                    </div>
                    <div className="metric">
                        <span className="metric-label">Betti-1</span>
                        <span className="metric-value">{features.betti_1}</span>
                    </div>
                    <div className="metric">
                        <span className="metric-label">Max Pers. H0</span>
                        <span className="metric-value">{features.max_persistence_h0.toFixed(3)}</span>
                    </div>
                    <div className="metric">
                        <span className="metric-label">Max Pers. H1</span>
                        <span className="metric-value">{features.max_persistence_h1.toFixed(3)}</span>
                    </div>
                    <div className="metric">
                        <span className="metric-label">Mean Life H0</span>
                        <span className="metric-value">{features.mean_lifetime_h0.toFixed(3)}</span>
                    </div>
                    <div className="metric">
                        <span className="metric-label">Mean Life H1</span>
                        <span className="metric-value">{features.mean_lifetime_h1.toFixed(3)}</span>
                    </div>
                    <div className="metric">
                        <span className="metric-label">Entropy</span>
                        <span className="metric-value">{features.topological_entropy.toFixed(3)}</span>
                    </div>
                    <div className="metric">
                        <span className="metric-label">Components</span>
                        <span className="metric-value">{features.n_components}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
