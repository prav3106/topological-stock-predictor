"""
backtest_engine.py
Walk-forward historical simulation for backtesting visualization.
"""

import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta

from data_fetcher import get_processed_data
from graph_engine import get_residual_history
from topology_engine import run_topology_analysis
from prediction_engine import build_features, create_target, walk_forward_predict, compute_price_target

logger = logging.getLogger(__name__)

def run_backtest(
    ticker: str,
    horizon_days: int = 30,
    window_days: int = 90,
) -> Dict[str, Any]:
    """
    Run a walk-forward backtest for a specific ticker.
    Fixes lag-alignment: aligns prediction for t+H with actual at t+H.
    """
    # Optimized defaults for NSE
    lookback = 252 # Use enough for training
    prices, log_returns, zscore_returns = get_processed_data(None, lookback * 2)
    
    if ticker not in prices.columns:
        raise ValueError(f"Ticker {ticker} not found in available data.")
        
    all_dates = prices.index
    # Start backtest early enough to fill the window
    backtest_start_idx = len(all_dates) - window_days - horizon_days
    if backtest_start_idx < 126:
        backtest_start_idx = 126
        
    series = []
    # Map of target_date_str -> prediction_data
    # This stores the prediction made at time t for time t + horizon
    predictions_map: Dict[str, Dict[str, Any]] = {}
    
    logger.info("Running real-data backtest for %s (Lag-Corrected)...", ticker)
    
    for i in range(backtest_start_idx, len(all_dates) + 1):
        is_future = (i == len(all_dates))
        if is_future:
            current_date = all_dates[-1] + timedelta(days=1)
            prices_slice = prices
            log_ret_slice = log_returns
            z_ret_slice = zscore_returns
        else:
            current_date = all_dates[i]
            # --- STRICT T-1 ALIGNMENT ASSERTION ---
            # Features at i must ONLY use data up to i-1
            log_ret_slice = log_returns.iloc[:i]
            z_ret_slice = zscore_returns.iloc[:i]
            prices_slice = prices.iloc[:i] # Use price up to i-1 for features
            
            if i > 0:
                assert log_ret_slice.index[-1] < current_date, f"Data leakage at {current_date}"

        if len(z_ret_slice) < 60: continue
            
        try:
            # 1. Generate prediction for the FUTURE (current_date + horizon)
            res_history = get_residual_history(z_ret_slice, history_length=60)
            tda_res = run_topology_analysis(res_history)
            tda_features = tda_res["features"]
            
            feats = build_features(log_ret_slice, z_ret_slice, res_history, tda_features, ticker)
            target = create_target(log_ret_slice, ticker, horizon_days)
            
            pred, prob, _ = walk_forward_predict(feats, target, n_splits=3)
            
            # Use the latest actual price (at i-1) as base for prediction
            last_known_price = float(prices[ticker].iloc[i-1]) if i > 0 else float(prices[ticker].iloc[0])
            price_info = compute_price_target(last_known_price, pred, prob, horizon_days)
            
            # Calculate target date string
            target_date = current_date + timedelta(days=horizon_days)
            # Find the closest actual trading day for historical targets if possible
            if not is_future:
                target_idx = i + horizon_days
                if target_idx < len(all_dates):
                    target_date = all_dates[target_idx]
            
            target_date_str = target_date.strftime("%Y-%m-%d")
            predictions_map[target_date_str] = {
                "predicted": float(price_info["target_price"]),
                "upperBound": float(price_info["upper_bound"]),
                "lowerBound": float(price_info["lower_bound"]),
                "confidence": float(prob * 100),
            }

            # 2. Add entry for TODAY to series
            # The 'predicted' value for today is what we predicted H days ago
            current_date_str = current_date.strftime("%Y-%m-%d")
            past_pred = predictions_map.get(current_date_str)
            
            actual_val = float(prices[ticker].iloc[i]) if i < len(all_dates) else None
            
            if past_pred:
                divergence_val = past_pred["predicted"] - actual_val if actual_val is not None else 0.0
                series.append({
                    "date": current_date_str,
                    "actual": actual_val,
                    "predicted": past_pred["predicted"],
                    "upperBound": past_pred["upperBound"],
                    "lowerBound": past_pred["lowerBound"],
                    "confidence": past_pred["confidence"],
                    "divergence": float(divergence_val)
                })
            elif is_future or i >= len(all_dates) - horizon_days:
                # For the "future" part of the chart, we show the predictions made RECENTLY
                # but they won't have 'actual' values.
                # Find the prediction made recently for this date
                # Actually, the logic above (predictions_map) already handles future dates.
                # However, we only just made a prediction for T+H.
                # Let's ensure we add future predictions into the series as well.
                pass

        except Exception as e:
            logger.debug("Skip step %d: %s", i, e)
            continue

    # Post-fill the future predictions into the series
    # (Those made in the last 'horizon_days' of the loop for dates beyond len(all_dates))
    sorted_preds = sorted(predictions_map.keys())
    for d_str in sorted_preds:
        # If this date is not in series yet (i.e. it's in the future)
        if not any(s["date"] == d_str for s in series):
            p = predictions_map[d_str]
            series.append({
                "date": d_str,
                "actual": None,
                "predicted": p["predicted"],
                "upperBound": p["upperBound"],
                "lowerBound": p["lowerBound"],
                "confidence": p["confidence"],
                "divergence": 0.0
            })

    # 3. Smoothing (EMA) to reduce high-frequency noise/spikes from discrete classification flips
    if len(series) > 5:
        alpha = 0.4 # Smoothing factor
        ema_pred = float(series[0]["predicted"])
        ema_upper = float(series[0]["upperBound"])
        ema_lower = float(series[0]["lowerBound"])
        
        for k in range(1, len(series)):
            ema_pred = alpha * float(series[k]["predicted"]) + (1 - alpha) * ema_pred
            ema_upper = alpha * float(series[k]["upperBound"]) + (1 - alpha) * ema_upper
            ema_lower = alpha * float(series[k]["lowerBound"]) + (1 - alpha) * ema_lower
            
            series[k]["predicted"] = round(ema_pred, 2)
            series[k]["upperBound"] = round(ema_upper, 2)
            series[k]["lowerBound"] = round(ema_lower, 2)
            # Re-calculate divergence based on smoothed prediction
            if series[k]["actual"] is not None:
                series[k]["divergence"] = round(ema_pred - float(series[k]["actual"]), 2)

    # 4. Metrics calculation (Strict alignment)
    valid = [s for s in series if s["actual"] is not None and s["predicted"] is not None]
    if len(valid) > 10:
        actuals = np.array([float(s["actual"]) for s in valid])
        preds = np.array([float(s["predicted"]) for s in valid])
        
        mape = float(np.mean(np.abs((actuals - preds) / (actuals + 1e-9))) * 100)
        
        correct_dir = 0
        for j in range(1, len(valid)):
            actual_move = actuals[j] - float(valid[j-1]["actual"])
            pred_move = preds[j] - float(valid[j-1]["actual"])
            if np.sign(actual_move) == np.sign(pred_move):
                correct_dir += 1
        
        dir_acc = (correct_dir / (len(valid) - 1)) * 100
        max_div = float(np.max(np.abs(actuals - preds)))
        corr = float(np.corrcoef(actuals, preds)[0, 1]) if len(actuals) > 1 else 0.0
        avg_conf = float(np.mean([s["confidence"] for s in valid]))
    else:
        mape, dir_acc, max_div, corr, avg_conf = 0.0, 0.0, 0.0, 0.0, 0.0

    last_price = float(prices[ticker].iloc[-1])
    prev_price = float(prices[ticker].iloc[-2]) if len(prices) > 1 else last_price
    change_pct = ((last_price - prev_price) / (prev_price + 1e-9)) * 100

    return {
        "stock": {
            "symbol": ticker,
            "companyName": ticker.split('.')[0],
            "exchange": "NSE",
            "lastClose": last_price,
            "changePercent": round(float(change_pct), 2)
        },
        "series": series[-(window_days + horizon_days):],
        "metrics": {
            "mape": round(float(mape), 2),
            "directionalAccuracy": round(float(dir_acc), 2),
            "maxDivergence": round(float(max_div), 2),
            "correlation": round(float(corr), 3),
            "avgConfidence": round(float(avg_conf), 1)
        }
    }
