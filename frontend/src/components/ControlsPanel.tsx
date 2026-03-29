import { memo } from 'react';
import type { GraphParams } from '../types/market';

interface ControlsPanelProps {
    params: GraphParams;
    onParamsChange: (params: GraphParams) => void;
    onRefresh: () => void;
    autoRefresh: boolean;
    onAutoRefreshToggle: () => void;
    loading: boolean;
}

const ToggleSwitch = ({ active, onToggle, label }: { active: boolean; onToggle: () => void; label: string }) => (
    <div className={`toggle-switch ${active ? 'active' : ''}`} onClick={onToggle}>
        <div className="toggle-track">
            <div className="toggle-thumb" />
        </div>
        <span className="control-label" style={{ marginBottom: 0, marginLeft: 10 }}>{label}</span>
    </div>
);

const ControlSlider = ({
    label, value, min, max, step, onChange,
}: {
    label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) => (
    <div className="control-group">
        <div className="control-label">
            <span>{label}</span>
            <span className="control-value-pill">{typeof value === 'number' ? value.toFixed(step < 1 ? 2 : 0) : value}</span>
        </div>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="slider"
        />
    </div>
);

export default memo(function ControlsPanel({
    params, onParamsChange, onRefresh, autoRefresh, onAutoRefreshToggle, loading,
}: ControlsPanelProps) {
    const handleChange = (key: keyof GraphParams, value: number) => {
        onParamsChange({ ...params, [key]: value });
    };

    return (
        <div className="controls-panel">
            <h2 className="mono">Parameters</h2>

            <ControlSlider
                label="Lookback Period"
                value={params.lookback_days}
                min={20}
                max={500}
                step={5}
                onChange={(v) => handleChange('lookback_days', v)}
            />

            <ControlSlider
                label="Diffusion Time (t)"
                value={params.diffusion_t}
                min={0.1}
                max={5.0}
                step={0.1}
                onChange={(v) => handleChange('diffusion_t', v)}
            />

            <ControlSlider
                label="Sigma (Kernel)"
                value={params.sigma}
                min={0.1}
                max={2.0}
                step={0.05}
                onChange={(v) => handleChange('sigma', v)}
            />

            <ControlSlider
                label="Edge Threshold"
                value={params.edge_threshold}
                min={0.05}
                max={0.95}
                step={0.05}
                onChange={(v) => handleChange('edge_threshold', v)}
            />

            <div style={{ marginTop: '32px' }}>
                <button
                    className={`refresh-btn ${loading ? 'loading' : ''}`}
                    onClick={onRefresh}
                    disabled={loading}
                >
                    {loading ? 'COMPUTING...' : 'REFRESH ENGINE'}
                    {loading && <div className="loader" style={{ width: 12, height: 12, borderWidth: 1, marginLeft: 8 }} />}
                </button>

                <ToggleSwitch
                    active={autoRefresh}
                    onToggle={onAutoRefreshToggle}
                    label="AUTO-UPDATE"
                />
            </div>

            <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '1px solid var(--border-primary)' }}>
                <p className="metric-label" style={{ marginBottom: 8, color: 'var(--text-muted)' }}>Engine Status</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--bullish)', fontSize: '0.75rem', fontWeight: 600 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--bullish)', boxShadow: '0 0 8px var(--bullish)' }} />
                    LIVE NSE FEED
                </div>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
                    Topological features are recomputed in background threads using GSP algorithms.
                </p>
            </div>
        </div>
    );
});
