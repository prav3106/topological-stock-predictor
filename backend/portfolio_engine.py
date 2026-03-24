"""
portfolio_engine.py
Risk-adjusted portfolio allocation using CVXPY.
Creates market-neutral and sector-neutral alpha portfolios.
"""

import numpy as np
import pandas as pd
import logging
from typing import Dict

try:
    import cvxpy as cp
except ImportError:
    cp = None

logger = logging.getLogger(__name__)

def optimize_portfolio(
    alpha_signals: Dict[str, float],
    cov_matrix: pd.DataFrame,
    sector_mapping: Dict[str, str] = None,
    risk_aversion: float = 1.0,
    max_position: float = 0.05,
    market_neutral: bool = True,
    sector_neutral: bool = True,
) -> Dict[str, float]:
    """
    Optimize portfolio weights based on alpha signals using Convex Optimization.
    """
    if cp is None:
        logger.warning("cvxpy not installed. Falling back to simple proportional weighting.")
        return _fallback_weights(alpha_signals, max_position)
        
    tickers = list(alpha_signals.keys())
    n = len(tickers)
    
    # Scale alphas directly
    alpha = np.array([alpha_signals.get(t, 0.0) for t in tickers])
    
    try:
        cov = cov_matrix.loc[tickers, tickers].values
    except KeyError:
        logger.warning("Covariance matrix indices mismatch. Using fallback.")
        return _fallback_weights(alpha_signals, max_position)
    
    w = cp.Variable(n)
    
    # Maximize Expected Return - Risk Penalty
    expected_return = alpha.T @ w
    risk = cp.quad_form(w, cov)
    objective = cp.Maximize(expected_return - risk_aversion * risk)
    
    constraints = [
        w >= -max_position,
        w <= max_position,
        cp.norm(w, 1) <= 1.0  # 100% Gross exposure limit
    ]
    
    if market_neutral:
        # Sum of weights = 0 (Zero Beta if betas were 1.0)
        constraints.append(cp.sum(w) == 0)
        
    if sector_neutral and sector_mapping:
        # Zero weight sum within each sector bucket
        sectors = set(sector_mapping.values())
        for sec in sectors:
            sec_idx = [i for i, t in enumerate(tickers) if sector_mapping.get(t) == sec]
            if len(sec_idx) > 1:
                constraints.append(cp.sum(w[sec_idx]) == 0)
                
    prob = cp.Problem(objective, constraints)
    
    try:
        prob.solve(solver=cp.SCS)
        weights = w.value
        if weights is None:
            raise ValueError("CVXPY solve returned None.")
    except Exception as e:
        logger.error(f"Portfolio optimization failed: {e}")
        return _fallback_weights(alpha_signals, max_position)
        
    # Format and clean weights
    weights = np.round(weights, 4)
    portfolio = {}
    for i in range(n):
        if abs(weights[i]) > 1e-4:
            portfolio[tickers[i]] = float(weights[i])
            
    return portfolio

def _fallback_weights(alpha_signals: Dict[str, float], max_position: float) -> Dict[str, float]:
    """Inverse proportional fallback."""
    tickers = list(alpha_signals.keys())
    alphas = np.array([alpha_signals[t] for t in tickers])
    
    alphas = alphas - np.mean(alphas)
    total = np.sum(np.abs(alphas))
    
    if total > 0:
        w = alphas / total
    else:
        w = np.zeros_like(alphas)
        
    w = np.clip(w, -max_position, max_position)
    return {t: float(val) for t, val in zip(tickers, w) if abs(val) > 1e-4}
