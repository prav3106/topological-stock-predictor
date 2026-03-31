/* ─────────────────────────────────────────────
   TypeScript interfaces for all API responses
   ───────────────────────────────────────────── */

export interface GraphNode {
    id: string;
    residual: number;
    zscore: number;
    diffused: number;
    x: number;
    y: number;
    price?: number;
}

export interface GraphEdge {
    source: string;
    target: string;
    weight: number;
    correlation: number;
}

export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
    tickers: string[];
    residuals: Record<string, number>;
}

export interface PersistencePoint {
    birth: number;
    death: number;
}

export interface TDAFeatures {
    n_components: number;
    n_loops: number;
    max_persistence_h0: number;
    max_persistence_h1: number;
    mean_lifetime_h0: number;
    mean_lifetime_h1: number;
    topological_entropy: number;
    betti_0: number;
    betti_1: number;
}

export interface TopologyData {
    diagrams: {
        h0: PersistencePoint[];
        h1: PersistencePoint[];
    };
    features: TDAFeatures;
    regime: 'BULL' | 'BEAR' | 'SIDEWAYS' | 'VOLATILE';
    point_cloud_shape: number[];
}

export interface PriceTarget {
    current_price: number;
    target_price: number;
    estimated_return: number;
    upper_bound: number;
    lower_bound: number;
}

export interface PredictionData {
    ticker: string;
    horizon_days: number;
    direction: 'UP' | 'DOWN' | 'NEUTRAL';
    prediction_value: number;
    probability: number;
    price_target: PriceTarget;
    feature_importances: Record<string, number>;
    residual_history: number[];
}

export interface AnomalyItem {
    ticker: string;
    residual: number;
    signal: 'OVERPERFORMING' | 'UNDERPERFORMING' | 'NEUTRAL';
    predicted_move: string;
    price: number;
    confidence: number;
}

export interface AnomaliesData {
    anomalies: AnomalyItem[];
}

export interface MarketRegimeData {
    regime: 'BULL' | 'BEAR' | 'SIDEWAYS' | 'VOLATILE';
    description: string;
    features: TDAFeatures;
}

export interface GraphParams {
    lookback_days: number;
    sigma: number;
    diffusion_t: number;
    edge_threshold: number;
}

export interface TopologyParams {
    lookback_days: number;
    embedding_dim: number;
}

export interface PredictParams {
    ticker: string;
    horizon_days: number;
}
