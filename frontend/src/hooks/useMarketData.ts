import { useState, useCallback, useRef, useEffect } from 'react';
import type {
    GraphData,
    TopologyData,
    PredictionData,
    AnomaliesData,
    MarketRegimeData,
    GraphParams,
    TopologyParams,
    PredictParams,
} from '../types/market';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface ApiState<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
}

function useApiCall<T, P = void>() {
    const [state, setState] = useState<ApiState<T>>({
        data: null,
        loading: false,
        error: null,
    });

    const abortRef = useRef<AbortController | null>(null);

    const execute = useCallback(async (
        url: string,
        options?: { method?: string; body?: P },
    ) => {
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setState(prev => ({ ...prev, loading: true, error: null }));

        try {
            const fetchOpts: RequestInit = {
                method: options?.method || 'GET',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
            };
            if (options?.body) {
                fetchOpts.body = JSON.stringify(options.body);
            }

            const res = await fetch(`${API_BASE}${url}`, fetchOpts);
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({ detail: res.statusText }));
                throw new Error(errBody.detail || `HTTP ${res.status}`);
            }

            const data: T = await res.json();
            setState({ data, loading: false, error: null });
            return data;
        } catch (err: unknown) {
            if (err instanceof DOMException && err.name === 'AbortError') return null;
            const msg = err instanceof Error ? err.message : 'Unknown error';
            setState({ data: null, loading: false, error: msg });
            return null;
        }
    }, []);

    return { ...state, execute };
}

export function useGraphData() {
    const api = useApiCall<GraphData, GraphParams>();

    const buildGraph = useCallback((params: GraphParams) => {
        return api.execute('/build-graph', { method: 'POST', body: params });
    }, [api.execute]);

    return { ...api, buildGraph };
}

export function useTopologyData() {
    const api = useApiCall<TopologyData, TopologyParams>();

    const runTopology = useCallback((params: TopologyParams) => {
        return api.execute('/topology', { method: 'POST', body: params });
    }, [api.execute]);

    return { ...api, runTopology };
}

export function usePrediction() {
    const api = useApiCall<PredictionData, PredictParams>();

    const predict = useCallback((params: PredictParams) => {
        return api.execute('/predict', { method: 'POST', body: params });
    }, [api.execute]);

    return { ...api, predict };
}

export function useAnomalies() {
    const api = useApiCall<AnomaliesData>();

    const fetchAnomalies = useCallback(() => {
        return api.execute('/anomalies');
    }, [api.execute]);

    return { ...api, fetchAnomalies };
}

export function useMarketRegime() {
    const api = useApiCall<MarketRegimeData>();

    const fetchRegime = useCallback(() => {
        return api.execute('/market-regime');
    }, [api.execute]);

    return { ...api, fetchRegime };
}

export function useAutoRefresh(
    callback: () => void,
    enabled: boolean,
    intervalMs: number = 15 * 60 * 1000,
) {
    useEffect(() => {
        if (!enabled) return;
        const id = setInterval(callback, intervalMs);
        return () => clearInterval(id);
    }, [callback, enabled, intervalMs]);
}
