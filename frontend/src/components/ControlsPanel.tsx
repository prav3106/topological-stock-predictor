import type { GraphParams } from '../types/market';

interface ControlsPanelProps {
    params: GraphParams;
    onParamsChange: (params: GraphParams) => void;
    onRefresh: () => void;
    autoRefresh: boolean;
    onAutoRefreshToggle: () => void;
    loading: boolean;
}

export default function ControlsPanel({
    params, onParamsChange, onRefresh,
    autoRefresh, onAutoRefreshToggle, loading,
}: ControlsPanelProps) {
    const updateParam = <K extends keyof GraphParams>(key: K, value: GraphParams[K]) => {
        onParamsChange({ ...params, [key]: value });
    };

    return (
        <div className="controls-panel">
            <h2>Controls</h2>

            <div className="control-group">
                <label className="control-label">
                    Lookback Period
                    <span className="control-value">{params.lookback_days} days</span>
                </label>
                <input
                    type="range"
                    min={30}
                    max={252}
                    step={1}
                    value={params.lookback_days}
                    onChange={e => updateParam('lookback_days', parseInt(e.target.value))}
                    className="slider"
                />
                <div className="slider-labels">
                    <span>30d</span>
                    <span>252d</span>
                </div>
            </div>

            <div className="control-group">
                <label className="control-label">
                    Diffusion Time (t)
                    <span className="control-value">{params.diffusion_t.toFixed(2)}</span>
                </label>
                <input
                    type="range"
                    min={0.1}
                    max={2.0}
                    step={0.05}
                    value={params.diffusion_t}
                    onChange={e => updateParam('diffusion_t', parseFloat(e.target.value))}
                    className="slider"
                />
                <div className="slider-labels">
                    <span>0.1</span>
                    <span>2.0</span>
                </div>
            </div>

            <div className="control-group">
                <label className="control-label">
                    Sigma (σ)
                    <span className="control-value">{params.sigma.toFixed(2)}</span>
                </label>
                <input
                    type="range"
                    min={0.1}
                    max={2.0}
                    step={0.05}
                    value={params.sigma}
                    onChange={e => updateParam('sigma', parseFloat(e.target.value))}
                    className="slider"
                />
                <div className="slider-labels">
                    <span>0.1</span>
                    <span>2.0</span>
                </div>
            </div>

            <div className="control-group">
                <label className="control-label">
                    Edge Threshold
                    <span className="control-value">{params.edge_threshold.toFixed(2)}</span>
                </label>
                <input
                    type="range"
                    min={0.0}
                    max={0.8}
                    step={0.05}
                    value={params.edge_threshold}
                    onChange={e => updateParam('edge_threshold', parseFloat(e.target.value))}
                    className="slider"
                />
                <div className="slider-labels">
                    <span>0.0</span>
                    <span>0.8</span>
                </div>
            </div>

            <div className="control-actions">
                <button
                    className="refresh-btn"
                    onClick={onRefresh}
                    disabled={loading}
                >
                    {loading ? (
                        <>
                            <span className="btn-spinner" />
                            Processing…
                        </>
                    ) : (
                        <>
                            ⟳ Refresh Data
                        </>
                    )}
                </button>

                <button
                    className={`auto-refresh-btn ${autoRefresh ? 'active' : ''}`}
                    onClick={onAutoRefreshToggle}
                >
                    {autoRefresh ? '⏸ Auto-Refresh ON' : '▶ Auto-Refresh OFF'}
                </button>
            </div>

            <div className="controls-info">
                <p className="info-text">
                    <strong>t (Diffusion Time):</strong> Higher values = more smoothing.
                    Increase for stable markets, decrease for volatile regimes.
                </p>
                <p className="info-text">
                    <strong>σ (Sigma):</strong> Controls edge sensitivity.
                    Lower σ = only highly correlated pairs connected.
                </p>
            </div>
        </div>
    );
}
