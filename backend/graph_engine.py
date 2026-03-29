"""
graph_engine.py
Correlation-based graph construction + Laplacian graph diffusion.
"""

import numpy as np
import pandas as pd
import networkx as nx
from scipy.linalg import expm
from typing import Dict, List, Tuple, Any
import datetime
import logging

logger = logging.getLogger(__name__)

# --- Global In-Memory Cache for Graph Stability ---
_graph_cache: Dict[Tuple[int, int, int, float, float], Dict[str, Any]] = {}



def compute_correlation_matrix(zscore_returns: pd.DataFrame) -> pd.DataFrame:
    """Compute pairwise Pearson correlation matrix on standardized returns."""
    return zscore_returns.corr()


def build_adjacency_matrix(corr_matrix: pd.DataFrame, sigma: float = 0.5) -> np.ndarray:
    """
    Build adjacency matrix using Gaussian kernel:
      W_ij = exp(-(1 - corr(i,j))^2 / sigma^2)
    Diagonal is set to 0.
    """
    corr = corr_matrix.values
    n = corr.shape[0]
    distance = (1.0 - corr) ** 2
    W = np.exp(-distance / (sigma ** 2))
    np.fill_diagonal(W, 0.0)
    return W


def compute_normalized_laplacian(W: np.ndarray) -> np.ndarray:
    """
    Compute normalized Laplacian:
      L = I - D^{-1/2} W D^{-1/2}
    """
    n = W.shape[0]
    d = W.sum(axis=1)
    d_inv_sqrt = np.zeros(n)
    mask = d > 1e-10
    d_inv_sqrt[mask] = 1.0 / np.sqrt(d[mask])
    D_inv_sqrt = np.diag(d_inv_sqrt)
    L = np.eye(n) - D_inv_sqrt @ W @ D_inv_sqrt
    return L


def graph_diffusion(L: np.ndarray, f0: np.ndarray, t: float = 1.0) -> np.ndarray:
    """
    Matrix exponential diffusion:
      f(t) = expm(-t * L) @ f(0)
    """
    kernel = expm(-t * L)
    ft = kernel @ f0
    return ft


def compute_expected_returns(W: np.ndarray, returns: np.ndarray) -> np.ndarray:
    """Compute expected returns based on neighbor weights."""
    row_sums = W.sum(axis=1, keepdims=True)
    row_sums[row_sums == 0] = 1.0
    W_norm = W / row_sums
    return W_norm @ returns


def compute_residuals(actual: np.ndarray, expected: np.ndarray) -> np.ndarray:
    """
    Compute raw residuals and normalize to standard Z-scores.
    Positive residual → stock outperforming peers → mean-reversion DOWN
    Negative residual → stock underperforming peers → mean-reversion UP
    """
    raw_res = actual - expected
    std = np.std(raw_res)
    if std > 1e-10:
        return (raw_res - np.mean(raw_res)) / std
    return raw_res - np.mean(raw_res)


def compute_spring_layout(
    W: np.ndarray,
    tickers: List[str],
    edge_threshold: float = 0.3,
) -> Dict[str, Tuple[float, float]]:
    """Compute spring layout positions for graph visualization."""
    n = W.shape[0]
    G = nx.Graph()
    for i in range(n):
        G.add_node(tickers[i])
    for i in range(n):
        for j in range(i + 1, n):
            if W[i, j] > edge_threshold:
                G.add_edge(tickers[i], tickers[j], weight=float(W[i, j]))

    pos = nx.spring_layout(G, seed=42, k=2.0 / np.sqrt(n))
    return {node: (float(x), float(y)) for node, (x, y) in pos.items()}


def build_graph_data(
    zscore_returns: pd.DataFrame,
    sigma: float = 0.5,
    diffusion_t: float = 0.7,
    edge_threshold: float = 0.58,
) -> Dict[str, Any]:
    """
    Full graph pipeline with Weekly Caching and Sparsity Guard.
    """
    tickers = list(zscore_returns.columns)
    n = len(tickers)
    
    # 1. Weekly Caching Key
    # We use the ISO week and year of the latest data point to stabilize the graph
    last_date = zscore_returns.index[-1]
    year, week, _ = last_date.isocalendar()
    lookback = len(zscore_returns)
    cache_key = (year, week, lookback, sigma, edge_threshold)
    
    if cache_key in _graph_cache:
        logger.info("Using cached graph for Week %d, %d", week, year)
        return _graph_cache[cache_key]

    # Step 1: Correlation
    corr_matrix = compute_correlation_matrix(zscore_returns)
    
    # 2. Gaussian Kernel (using provided sigma)
    W = build_adjacency_matrix(corr_matrix, sigma=sigma)

    # 3. Sparsity Guard
    # Requirement: avg degree >= 3. Avg degree = total_edges / node_count
    # Total edges = count(W > threshold) / 2 (since symmetric)
    current_threshold = edge_threshold
    max_retries = 3
    for attempt in range(max_retries):
        edge_mask = W > current_threshold
        total_edges = np.sum(edge_mask) / 2.0
        avg_degree = total_edges / n
        
        if avg_degree >= 3.0:
            break
        
        logger.warning(
            "Graph sparse (avg degree %.2f). Falling back: %.2f -> %.2f", 
            avg_degree, current_threshold, current_threshold - 0.05
        )
        current_threshold -= 0.05
    
    edge_threshold = current_threshold

    # Step 3: Normalized Laplacian (using final thresholded W)
    L = compute_normalized_laplacian(W)

    # Step 4: Alpha Expectations
    f0 = zscore_returns.iloc[-1].values.astype(np.float64)
    expected_ret = compute_expected_returns(W, f0)

    # Step 5: Z-Scored Residuals & Laplacian Smoothing
    residuals = compute_residuals(f0, expected_ret)
    ft = graph_diffusion(L, residuals, t=diffusion_t)

    # Step 6: Spring layout
    positions = compute_spring_layout(W, tickers, edge_threshold)

    # Build edges list (only above final threshold)
    edges = []
    for i in range(n):
        for j in range(i + 1, n):
            if W[i, j] > edge_threshold:
                edges.append({
                    "source": tickers[i],
                    "target": tickers[j],
                    "weight": float(W[i, j]),
                    "correlation": float(corr_matrix.iloc[i, j]),
                })

    # Build nodes list
    nodes = []
    for i, ticker in enumerate(tickers):
        nodes.append({
            "id": ticker,
            "residual": float(residuals[i]),
            "zscore": float(f0[i]),
            "diffused": float(ft[i]),
            "x": positions.get(ticker, (0, 0))[0],
            "y": positions.get(ticker, (0, 0))[1],
        })

    result = {
        "nodes": nodes,
        "edges": edges,
        "tickers": tickers,
        "residuals": {t: float(residuals[i]) for i, t in enumerate(tickers)},
        "correlation_matrix": corr_matrix.values.tolist(),
        "meta": {
            "week": week,
            "year": year,
            "threshold": edge_threshold
        }
    }
    
    # Save to cache
    _graph_cache[cache_key] = result
    return result


def get_residual_history(
    zscore_returns: pd.DataFrame,
    sigma: float = 0.5,
    diffusion_t: float = 1.0,
    history_length: int = 60,
) -> Dict[str, List[float]]:
    """
    Compute residual history for the last `history_length` days.
    Returns dict: ticker → list of residual values.
    """
    tickers = list(zscore_returns.columns)
    n = len(tickers)

    corr_matrix = compute_correlation_matrix(zscore_returns)
    W = build_adjacency_matrix(corr_matrix, sigma=sigma)
    L = compute_normalized_laplacian(W)

    start_idx = max(0, len(zscore_returns) - history_length)
    residual_history = {t: [] for t in tickers}

    for day_idx in range(start_idx, len(zscore_returns)):
        f0 = zscore_returns.iloc[day_idx].values.astype(np.float64)
        expected_ret = compute_expected_returns(W, f0)
        res = compute_residuals(f0, expected_ret)
        ft = graph_diffusion(L, res, t=diffusion_t)
        for i, ticker in enumerate(tickers):
            residual_history[ticker].append(float(ft[i]))

    return residual_history
