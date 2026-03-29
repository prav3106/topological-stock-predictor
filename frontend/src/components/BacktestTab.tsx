import React, { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
  Legend,
  AreaChart,
} from 'recharts';

// ═══════════════════════════════════════
// TYPES
// ═══════════════════════════════════════

interface SeriesPoint {
  date: string;
  actual?: number;
  predicted: number;
  upperBound: number;
  lowerBound: number;
  confidence: number;
  divergence: number;
}

interface BacktestResult {
  stock: {
    symbol: string;
    companyName: string;
    exchange: string;
    lastClose: number;
    changePercent: number;
  };
  series: SeriesPoint[];
  metrics: {
    mape: number;
    directionalAccuracy: number;
    maxDivergence: number;
    correlation: number;
    avgConfidence: number;
  };
}

// ═══════════════════════════════════════
// MOCK DATA GENERATOR
// ═══════════════════════════════════════

const generateMockData = (ticker: string): BacktestResult => {
  const points: SeriesPoint[] = [];
  const now = new Date();
  const startDate = new Date();
  startDate.setDate(now.getDate() - 90);

  let currentPrice = 2850 + Math.random() * 200;
  let predictedPrice = currentPrice;

  for (let i = 0; i < 104; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    
    // Random walk for actual price
    const change = (Math.random() - 0.48) * 40; 
    currentPrice += change;

    // Model prediction (convincingly close but with lag/divergence)
    const noise = (Math.random() - 0.5) * 15;
    const lagFactor = 0.7;
    predictedPrice = predictedPrice * (1 - lagFactor) + currentPrice * lagFactor + noise;

    const isFuture = i > 90;
    const divergence = predictedPrice - currentPrice;
    const confidence = 85 + Math.random() * 10;
    const vol = 30 + Math.random() * 20;

    points.push({
      date: dateStr,
      actual: isFuture ? undefined : currentPrice,
      predicted: predictedPrice,
      upperBound: predictedPrice + vol,
      lowerBound: predictedPrice - vol,
      confidence: confidence,
      divergence: isFuture ? 0 : divergence,
    });
  }

  return {
    stock: {
      symbol: ticker.includes('.NS') ? ticker : `${ticker}.NS`,
      companyName: ticker === 'RELIANCE' ? 'Reliance Industries Ltd' : 'NSE Constituent',
      exchange: 'NSE',
      lastClose: currentPrice,
      changePercent: 1.2,
    },
    series: points,
    metrics: {
      mape: 1.42,
      directionalAccuracy: 74.5,
      maxDivergence: 84.20,
      correlation: 0.94,
      avgConfidence: 91.2,
    },
  };
};

// ═══════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════

const BacktestTab: React.FC = () => {
  const [ticker, setTicker] = useState('RELIANCE.NS');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [horizon, setHorizon] = useState(30);

  const fetchBacktest = async (t: string) => {
    setLoading(true);
    try {
      // Simulate network delay for "Bloomberg terminal" feel
      await new Promise(resolve => setTimeout(resolve, 1500));
      setResult(generateMockData(t));
    } catch (err) {
      console.error('Backtest error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBacktest('RELIANCE.NS');
  }, []);

  const handleRun = () => {
    fetchBacktest(ticker);
  };

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Find divergence zones (|predicted - actual| > 50)
  const divergenceZones = useMemo(() => {
    if (!result) return [];
    const zones: { start: string; end: string }[] = [];
    let currentZone: { start: string; end: string } | null = null;

    result.series.forEach((p, i) => {
      if (p.actual !== undefined && Math.abs(p.divergence) > 50) {
        if (!currentZone) {
          currentZone = { start: p.date, end: p.date };
        } else {
          currentZone.end = p.date;
        }
      } else {
        if (currentZone) {
          zones.push(currentZone);
          currentZone = null;
        }
      }
    });
    return zones;
  }, [result]);

  if (!result) return null;

  return (
    <div className="backtest-container">
      {/* TOP CONTROL BAR */}
      <div className="backtest-controls panel">
        <div className="search-box">
          <input 
            type="text" 
            className="ticker-input mono" 
            value={ticker} 
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="ENTER TICKER (e.g. INFY)"
          />
          <div className="search-icon">⌕</div>
        </div>

        <div className="control-divider" />

        <div className="date-controls">
          <div className="date-picker-mini">
            <span>START</span>
            <input type="date" defaultValue="2024-01-01" className="mono" />
          </div>
          <div className="date-picker-mini">
            <span>END</span>
            <input type="date" defaultValue={todayStr} className="mono" />
          </div>
        </div>

        <div className="control-divider" />

        <select className="model-select mono">
          <option>GRAPH DIFFUSION</option>
          <option>TDA MOMENTUM</option>
          <option>PERSISTENCE SIGNAL</option>
        </select>

        <div className="horizon-toggle">
          {[7, 14, 30, 60].map(h => (
            <button 
              key={h} 
              className={`hz-btn mono ${horizon === h ? 'active' : ''}`}
              onClick={() => setHorizon(h)}
            >
              {h}D
            </button>
          ))}
        </div>

        <button 
          className={`run-btn ${loading ? 'loading' : ''}`} 
          onClick={handleRun}
          disabled={loading}
        >
          {loading ? 'CALCULATING...' : '▶ RUN'}
        </button>
      </div>

      {/* STOCK INFO STRIP */}
      <div className="stock-info-strip mono">
        <span className="ticker-badge">{result.stock.symbol}</span>
        <span className="company-name">{result.stock.companyName}</span>
        <span className="exchange-label">{result.stock.exchange}</span>
        <div className="price-info">
          <span className="last-close">₹{result.stock.lastClose.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          <span className="price-change up">▲ {result.stock.changePercent}%</span>
        </div>
      </div>

      {/* MAIN CHART */}
      <div className="main-chart-container panel">
        <div className="chart-header">
          <div className="chart-legend-custom mono">
            <div className="leg-item"><span className="dot actual" /> ACTUAL</div>
            <div className="leg-item"><span className="dot predicted" /> PREDICTED</div>
            <div className="leg-item"><span className="dot confidence" /> CONFIDENCE</div>
          </div>
        </div>
        
        <div className="hero-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={result.series} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <defs>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false}
                tickFormatter={(val) => {
                  const d = new Date(val);
                  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                }}
              />
              <YAxis 
                domain={['auto', 'auto']} 
                axisLine={false} 
                tickLine={false}
                tickFormatter={(val) => `₹${val.toLocaleString('en-IN')}`}
              />
              
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="custom-chart-tooltip mono">
                        <p className="tt-date">{data.date}</p>
                        <div className="tt-row">
                          <span>ACTUAL</span>
                          <span className="val-green">₹{data.actual?.toFixed(2) || '--'}</span>
                        </div>
                        <div className="tt-row">
                          <span>PREDICTED</span>
                          <span className="val-cyan">₹{data.predicted.toFixed(2)}</span>
                        </div>
                        <div className="tt-row divider">
                          <span>DELTA</span>
                          <span className={data.divergence > 0 ? 'val-cyan' : 'val-red'}>
                            {data.divergence > 0 ? '+' : ''}{data.divergence.toFixed(2)}
                          </span>
                        </div>
                        <div className="tt-row">
                          <span>CONFIDENCE</span>
                          <span className="val-white">{data.confidence.toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />

              {divergenceZones.map((zone, idx) => (
                <ReferenceArea 
                  key={idx}
                  x1={zone.start} 
                  x2={zone.end} 
                  fill="#ff3a5c" 
                  fillOpacity={0.12} 
                  stroke="none"
                />
              ))}

              <ReferenceLine x={todayStr} stroke="rgba(255,255,255,0.4)" strokeDasharray="5 5" label={{ value: 'NOW', position: 'top', fill: '#fff', fontSize: 10, fontFamily: 'JetBrains Mono' }} />

              <Area 
                type="monotone" 
                dataKey="upperBound" 
                stroke="none" 
                fill="#00e5ff" 
                fillOpacity={0.08} 
                connectNulls
              />
              <Area 
                type="monotone" 
                dataKey="lowerBound" 
                stroke="none" 
                fill="#00e5ff" 
                fillOpacity={0.08} 
                connectNulls
              />

              <Line 
                type="monotone" 
                dataKey="actual" 
                stroke="#39ff14" 
                strokeWidth={2} 
                dot={false} 
                activeDot={{ r: 4, fill: '#39ff14', strokeWidth: 0 }}
              />
              <Line 
                type="monotone" 
                dataKey="predicted" 
                stroke="#00e5ff" 
                strokeWidth={2} 
                strokeDasharray="6 3" 
                dot={false}
                filter="url(#glow)"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* METRICS ROW */}
      <div className="metrics-row">
        <div className="metric-card glass">
          <span className="m-label">MAPE ERROR</span>
          <span className="m-value mono">{result.metrics.mape}%</span>
          <div className="m-status up">GOOD</div>
        </div>
        <div className="metric-card glass">
          <span className="m-label">DIR. ACCURACY</span>
          <span className="m-value mono">{result.metrics.directionalAccuracy}%</span>
          <div className="m-status up">STABLE</div>
        </div>
        <div className="metric-card glass">
          <span className="m-label">MAX DIVERGENCE</span>
          <span className="m-value mono">₹{result.metrics.maxDivergence.toFixed(2)}</span>
          <div className="m-status warning">PEAKED</div>
        </div>
        <div className="metric-card glass">
          <span className="m-label">CORRELATION</span>
          <span className="m-value mono">{result.metrics.correlation}</span>
          <div className="m-status up">HIGH</div>
        </div>
        <div className="metric-card glass">
          <span className="m-label">AVG CONFIDENCE</span>
          <span className="m-value mono">{result.metrics.avgConfidence}%</span>
          <div className="m-status up">STRONG</div>
        </div>
      </div>

      {/* DIVERGENCE TIMELINE */}
      <div className="divergence-timeline panel">
        <div className="timeline-header mono">RESIDUAL DIVERGENCE FLOW [PREDICTED - ACTUAL]</div>
        <div className="mini-flow-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={result.series}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
              <XAxis dataKey="date" hide />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip content={() => null} />
              <defs>
                <linearGradient id="divGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00e5ff" stopOpacity={0.3}/>
                  <stop offset="50%" stopColor="#00e5ff" stopOpacity={0}/>
                  <stop offset="50%" stopColor="#ff3a5c" stopOpacity={0}/>
                  <stop offset="95%" stopColor="#ff3a5c" stopOpacity={0.3}/>
                </linearGradient>
              </defs>
              <Area 
                type="monotone" 
                dataKey="divergence" 
                stroke="rgba(255,255,255,0.1)" 
                fill="url(#divGradient)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default BacktestTab;
