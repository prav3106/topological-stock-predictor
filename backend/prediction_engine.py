"""
prediction_engine.py
Walk-forward ML prediction with purged cross-validation and embargo.
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from typing import Dict, List, Any, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


def build_features(
    log_returns: pd.DataFrame,
    zscore_returns: pd.DataFrame,
    residuals_history: Dict[str, List[float]],
    tda_features: Dict[str, float],
    ticker: str,
) -> pd.DataFrame:
    """
    Build feature set for a single stock:
      - residuals (last 20 values)
      - TDA summary features
      - 20-day momentum
      - 20-day realized volatility
    """
    if ticker not in log_returns.columns:
        raise ValueError(f"Ticker {ticker} not found in data")

    ret = log_returns[ticker].dropna()
    zret = zscore_returns[ticker].dropna()

    # Align to common index
    common_idx = ret.index.intersection(zret.index)
    ret = ret.loc[common_idx]
    zret = zret.loc[common_idx]

    # Momentum: 20-day cumulative return
    momentum_20 = ret.rolling(20).sum()

    # Volatility: 20-day realized vol
    vol_20 = ret.rolling(20).std() * np.sqrt(252)

    # 5-day momentum
    momentum_5 = ret.rolling(5).sum()

    # 10-day momentum
    momentum_10 = ret.rolling(10).sum()

    # Mean reversion signal: z-score
    zscore_signal = zret

    # Build features DataFrame
    features = pd.DataFrame(index=common_idx)
    features["momentum_20"] = momentum_20
    features["momentum_10"] = momentum_10
    features["momentum_5"] = momentum_5
    features["volatility_20"] = vol_20
    features["zscore"] = zscore_signal

    # Lagged returns
    for lag in [1, 2, 3, 5]:
        features[f"ret_lag_{lag}"] = ret.shift(lag)

    # Residuals as features (use last available values, broadcast)
    res_vals = residuals_history.get(ticker, [])
    if len(res_vals) > 0:
        features["residual_latest"] = res_vals[-1] if res_vals else 0.0
        features["residual_mean_5"] = np.mean(res_vals[-5:]) if len(res_vals) >= 5 else np.mean(res_vals)
        features["residual_std_5"] = np.std(res_vals[-5:]) if len(res_vals) >= 5 else 0.0
    else:
        features["residual_latest"] = 0.0
        features["residual_mean_5"] = 0.0
        features["residual_std_5"] = 0.0

    # TDA features (constant per snapshot)
    for key, val in tda_features.items():
        features[f"tda_{key}"] = val

    features = features.dropna()
    return features


def create_target(
    log_returns: pd.DataFrame,
    ticker: str,
    horizon_days: int = 5,
) -> pd.Series:
    """
    Target: sign(forward_return) over horizon_days
      1 = UP, -1 = DOWN, 0 = NEUTRAL (< 0.5% move)
    """
    ret = log_returns[ticker].dropna()
    forward_ret = ret.shift(-horizon_days).rolling(horizon_days).sum().shift(-horizon_days + horizon_days)
    # Simpler: cumulative return over next horizon_days
    forward_ret = ret.rolling(window=horizon_days).sum().shift(-horizon_days)

    target = pd.Series(0, index=forward_ret.index, dtype=int)
    target[forward_ret > 0.005] = 1   # UP
    target[forward_ret < -0.005] = -1  # DOWN
    # else 0 = NEUTRAL

    return target


def walk_forward_predict(
    features: pd.DataFrame,
    target: pd.Series,
    embargo_days: int = 5,
    n_splits: int = 5,
    min_train_size: int = 100,
) -> Tuple[int, float, Dict[str, float]]:
    """
    Walk-forward cross-validation with purging and embargo.

    Returns:
      - prediction: 1 (UP), -1 (DOWN), or 0 (NEUTRAL)
      - probability: confidence score
      - feature_importances: dict of feature name → importance
    """
    # Align features and target
    common_idx = features.index.intersection(target.index)
    if len(common_idx) < min_train_size + 20:
        logger.warning("Not enough data for walk-forward CV")
        return 0, 0.5, {}

    X = features.loc[common_idx]
    y = target.loc[common_idx]

    # Remove rows where target might leak (last horizon_days rows)
    X = X.iloc[:-embargo_days] if len(X) > embargo_days else X
    y = y.iloc[:-embargo_days] if len(y) > embargo_days else y

    if len(X) < min_train_size + 20:
        return 0, 0.5, {}

    # Final split: use all but last 20 days for training, predict latest state
    split_point = len(X) - 20
    X_train = X.iloc[:split_point]
    y_train = y.iloc[:split_point]

    # Purge: remove last embargo_days from training to avoid data leakage
    if len(X_train) > embargo_days:
        X_train = X_train.iloc[:-embargo_days]
        y_train = y_train.iloc[:-embargo_days]

    if len(X_train) < min_train_size:
        return 0, 0.5, {}

    # Handle class imbalance
    unique_classes = y_train.unique()
    if len(unique_classes) < 2:
        return int(unique_classes[0]) if len(unique_classes) == 1 else 0, 0.6, {}

    # Train GradientBoosting
    model = GradientBoostingClassifier(
        n_estimators=100,
        max_depth=3,
        learning_rate=0.1,
        min_samples_leaf=10,
        subsample=0.8,
        random_state=42,
    )

    try:
        model.fit(X_train.values, y_train.values)
    except Exception as e:
        logger.error("Model training failed: %s", e)
        return 0, 0.5, {}

    # Predict on the latest available features
    latest_features = features.iloc[[-1]].values
    try:
        pred = model.predict(latest_features)[0]
        proba = model.predict_proba(latest_features)

        # Get probability for predicted class
        classes = model.classes_
        pred_idx = np.where(classes == pred)[0][0]
        prob = float(proba[0][pred_idx])
    except Exception:
        pred = 0
        prob = 0.5

    # Feature importances
    feat_imp = {}
    if hasattr(model, "feature_importances_"):
        for i, col in enumerate(features.columns):
            feat_imp[col] = float(model.feature_importances_[i])

    return int(pred), prob, feat_imp


def compute_price_target(
    current_price: float,
    prediction: int,
    probability: float,
    horizon_days: int = 5,
    base_move_pct: float = 0.02,
) -> Dict[str, float]:
    """
    Compute approximate price target:
      target = current_price * (1 + predicted_return_estimate)

    predicted_return_estimate is scaled by probability and horizon.
    """
    # Scale move by probability and horizon
    horizon_factor = np.sqrt(horizon_days / 5.0)  # Square-root-of-time scaling
    confidence_factor = (probability - 0.5) * 2  # Scale [0.5, 1.0] → [0, 1]
    confidence_factor = max(0.0, confidence_factor)

    estimated_return = prediction * base_move_pct * horizon_factor * (0.5 + confidence_factor)

    target_price = current_price * (1 + estimated_return)
    upper_bound = current_price * (1 + abs(estimated_return) * 1.5)
    lower_bound = current_price * (1 - abs(estimated_return) * 1.5)

    if prediction > 0:
        lower_bound = min(lower_bound, current_price * 0.98)
        upper_bound = max(upper_bound, current_price * 1.01)
    elif prediction < 0:
        lower_bound = min(lower_bound, current_price * 0.99)
        upper_bound = max(upper_bound, current_price * 1.02)

    return {
        "current_price": current_price,
        "target_price": round(target_price, 2),
        "estimated_return": round(estimated_return * 100, 4),
        "upper_bound": round(upper_bound, 2),
        "lower_bound": round(lower_bound, 2),
    }


def predict_stock(
    ticker: str,
    horizon_days: int,
    log_returns: pd.DataFrame,
    zscore_returns: pd.DataFrame,
    residuals_history: Dict[str, List[float]],
    tda_features: Dict[str, float],
    current_price: float,
) -> Dict[str, Any]:
    """
    Full prediction pipeline for a single stock.
    """
    # Build features
    features = build_features(
        log_returns, zscore_returns,
        residuals_history, tda_features, ticker,
    )

    # Create target
    target = create_target(log_returns, ticker, horizon_days)

    # Walk-forward prediction
    prediction, probability, feat_importances = walk_forward_predict(
        features, target,
    )

    # Direction label
    direction_map = {1: "UP", -1: "DOWN", 0: "NEUTRAL"}
    direction = direction_map.get(prediction, "NEUTRAL")

    # Price target
    price_info = compute_price_target(
        current_price, prediction, probability, horizon_days,
    )

    # Residual history for the chart
    res_history = residuals_history.get(ticker, [])

    return {
        "ticker": ticker,
        "horizon_days": horizon_days,
        "direction": direction,
        "prediction_value": prediction,
        "probability": round(probability, 4),
        "price_target": price_info,
        "feature_importances": dict(sorted(
            feat_importances.items(), key=lambda x: abs(x[1]), reverse=True,
        )[:10]),  # Top 10 features
        "residual_history": res_history[-60:],  # Last 60 days
    }
