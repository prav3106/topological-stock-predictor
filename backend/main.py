"""
main.py
FastAPI application with all endpoints for the Topology Trading System.
"""

import logging
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from data_fetcher import get_processed_data, fetch_nifty50_tickers, get_current_prices, TICKER_SECTORS
from graph_engine import build_graph_data, get_residual_history
from topology_engine import run_topology_analysis
from prediction_engine import predict_stock
from portfolio_engine import optimize_portfolio
from backtest_engine import run_backtest

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# FastAPI App
# ──────────────────────────────────────────────
app = FastAPI(
    title="Topology Trading System",
    description="Graph diffusion + TDA-based stock analysis for the Indian market (NSE)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────
# Request/Response Models
# ──────────────────────────────────────────────

class BuildGraphRequest(BaseModel):
    lookback_days: int = Field(default=126, ge=30, le=504)
    sigma: float = Field(default=0.5, gt=0.01, le=5.0)
    diffusion_t: float = Field(default=0.7, gt=0.01, le=5.0)
    edge_threshold: float = Field(default=0.58, ge=0.0, le=1.0)


class TopologyRequest(BaseModel):
    lookback_days: int = Field(default=126, ge=30, le=504)
    embedding_dim: int = Field(default=10, ge=3, le=60)


class PredictRequest(BaseModel):
    ticker: str
    horizon_days: int = Field(default=5, ge=1, le=60)


class PortfolioRequest(BaseModel):
    risk_aversion: float = Field(default=1.0, ge=0.01, le=10.0)
    max_position: float = Field(default=0.05, ge=0.01, le=1.0)
    market_neutral: bool = Field(default=True)
    sector_neutral: bool = Field(default=True)


class BacktestRequest(BaseModel):
    ticker: str
    horizon_days: int = Field(default=30, ge=7, le=60)
    window_days: int = Field(default=90, ge=30, le=200)


# ──────────────────────────────────────────────
# Global state cache for cross-endpoint usage
# ──────────────────────────────────────────────
_state = {
    "graph_data": None,
    "residual_history": None,
    "tda_result": None,
    "log_returns": None,
    "zscore_returns": None,
    "prices": None,
    "tickers": None,
}


def _ensure_data(lookback_days: int = 126):
    """Ensure data is loaded."""
    if _state["prices"] is None:
        tickers = fetch_nifty50_tickers()
        prices, log_ret, z_ret = get_processed_data(tickers, lookback_days)
        _state["prices"] = prices
        _state["log_returns"] = log_ret
        _state["zscore_returns"] = z_ret
        _state["tickers"] = list(z_ret.columns)


# ──────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "topology-trading-system"}


@app.post("/api/build-graph")
async def build_graph(req: BuildGraphRequest):
    """
    Build the stock correlation graph with Laplacian diffusion.
    Returns nodes, edges, residuals, and layout positions.
    """
    try:
        _ensure_data(req.lookback_days)

        z_ret = _state["zscore_returns"]

        graph_data = build_graph_data(
            z_ret,
            sigma=req.sigma,
            diffusion_t=req.diffusion_t,
            edge_threshold=req.edge_threshold,
        )

        # Also compute residual history for later use
        res_history = get_residual_history(
            z_ret, sigma=req.sigma, diffusion_t=req.diffusion_t,
            history_length=60,
        )
        _state["graph_data"] = graph_data
        _state["residual_history"] = res_history

        # Add current prices to nodes
        try:
            current_prices = get_current_prices(list(z_ret.columns))
            for node in graph_data["nodes"]:
                node["price"] = current_prices.get(node["id"], 0.0)
        except Exception:
            pass

        return graph_data

    except Exception as e:
        logger.error("build-graph error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/topology")
async def topology_analysis(req: TopologyRequest):
    """
    Run Topological Data Analysis (Persistent Homology).
    Returns persistence diagrams, TDA features, and regime classification.
    """
    try:
        _ensure_data(req.lookback_days)

        # Ensure residual history exists
        if _state["residual_history"] is None:
            z_ret = _state["zscore_returns"]
            res_history = get_residual_history(z_ret, history_length=60)
            _state["residual_history"] = res_history

        tda_result = run_topology_analysis(
            _state["residual_history"],
            embedding_dim=req.embedding_dim,
        )
        _state["tda_result"] = tda_result
        return tda_result

    except Exception as e:
        logger.error("topology error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/predict")
async def predict(req: PredictRequest):
    """
    Predict stock direction for a given ticker and horizon.
    Returns direction (UP/DOWN/NEUTRAL), probability, price target, feature importances.
    """
    try:
        _ensure_data()

        ticker = req.ticker
        if ticker not in _state["tickers"]:
            available = _state["tickers"]
            raise HTTPException(
                status_code=404,
                detail=f"Ticker {ticker} not found. Available: {available[:10]}…",
            )

        # Ensure residual history
        if _state["residual_history"] is None:
            z_ret = _state["zscore_returns"]
            res_history = get_residual_history(z_ret, history_length=60)
            _state["residual_history"] = res_history

        # Get TDA features (run if not available)
        if _state["tda_result"] is None:
            tda_result = run_topology_analysis(_state["residual_history"])
            _state["tda_result"] = tda_result
        tda_features = _state["tda_result"]["features"]

        # Current price
        try:
            current_prices = get_current_prices([ticker])
            current_price = current_prices.get(ticker, 0.0)
        except Exception:
            current_price = float(_state["prices"][ticker].iloc[-1])

        result = predict_stock(
            ticker=ticker,
            horizon_days=req.horizon_days,
            log_returns=_state["log_returns"],
            zscore_returns=_state["zscore_returns"],
            residuals_history=_state["residual_history"],
            tda_features=tda_features,
            current_price=current_price,
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error("predict error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/market-regime")
async def market_regime():
    """
    Current market regime classification based on topological features.
    """
    try:
        _ensure_data()

        if _state["residual_history"] is None:
            z_ret = _state["zscore_returns"]
            res_history = get_residual_history(z_ret, history_length=60)
            _state["residual_history"] = res_history

        tda_result = run_topology_analysis(_state["residual_history"])
        _state["tda_result"] = tda_result

        regime = tda_result["regime"]
        features = tda_result["features"]

        regime_descriptions = {
            "LOW_COMPLEXITY": "Trending market — momentum strategies favored",
            "HIGH_COMPLEXITY": "Complex market — mean-reversion and diffusion arbitrage favored",
            "TRANSITION": "Transitional regime — reduce exposure, mixed signals",
        }

        return {
            "regime": regime,
            "description": regime_descriptions.get(regime, "Unknown"),
            "features": features,
        }

    except Exception as e:
        logger.error("market-regime error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/anomalies")
async def anomalies():
    """
    Top 5 most anomalous stocks by absolute residual.
    """
    try:
        _ensure_data()

        if _state["graph_data"] is None:
            z_ret = _state["zscore_returns"]
            graph_data = build_graph_data(z_ret)
            _state["graph_data"] = graph_data

        nodes = _state["graph_data"]["nodes"]

        # Sort by absolute residual
        sorted_nodes = sorted(nodes, key=lambda x: abs(x["residual"]), reverse=True)
        top5 = sorted_nodes[:5]

        anomalies_list = []
        for node in top5:
            residual = node["residual"]
            if residual > 0:
                signal = "OVERPERFORMING"
                predicted_move = "Mean-reversion DOWN expected"
            elif residual < 0:
                signal = "UNDERPERFORMING"
                predicted_move = "Mean-reversion UP expected"
            else:
                signal = "NEUTRAL"
                predicted_move = "No strong signal"

            anomalies_list.append({
                "ticker": node["id"],
                "residual": round(residual, 4),
                "signal": signal,
                "predicted_move": predicted_move,
                "price": node.get("price", 0.0),
                "confidence": round(min(abs(residual) / 2.0, 1.0), 2),
            })

        return {"anomalies": anomalies_list}

    except Exception as e:
        logger.error("anomalies error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/portfolio")
async def generate_portfolio(req: PortfolioRequest):
    """
    Generate an optimized long/short portfolio from topological alphas.
    """
    try:
        _ensure_data()

        if _state["graph_data"] is None:
            z_ret = _state["zscore_returns"]
            graph_data = build_graph_data(z_ret)
            _state["graph_data"] = graph_data

        nodes = _state["graph_data"]["nodes"]
        
        # Alpha signals = negative residuals (mean reversion downward if positive)
        alpha_signals = {node["id"]: -node["residual"] for node in nodes}
        
        # Calculate covariance from log returns
        cov_matrix = _state["log_returns"].cov() * 252 # Annualized
        
        weights = optimize_portfolio(
            alpha_signals=alpha_signals,
            cov_matrix=cov_matrix,
            sector_mapping=TICKER_SECTORS,
            risk_aversion=req.risk_aversion,
            max_position=req.max_position,
            market_neutral=req.market_neutral,
            sector_neutral=req.sector_neutral,
        )
        
        # Build detailed response
        portfolio_details = []
        for ticker, weight in weights.items():
            portfolio_details.append({
                "ticker": ticker,
                "weight": weight,
                "direction": "LONG" if weight > 0 else "SHORT",
                "sector": TICKER_SECTORS.get(ticker, "Unknown")
            })
            
        # Sort by absolute weight magnitude
        portfolio_details = sorted(portfolio_details, key=lambda x: abs(x["weight"]), reverse=True)
        
        return {
            "portfolio": portfolio_details,
            "metrics": {
                "gross_exposure": round(sum(abs(w) for w in weights.values()), 4),
                "net_exposure": round(sum(weights.values()), 4),
                "long_count": sum(1 for w in weights.values() if w > 0),
                "short_count": sum(1 for w in weights.values() if w < 0)
            }
        }
        
    except Exception as e:
        logger.error("portfolio error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/backtest")
async def backtest(req: BacktestRequest):
    """
    Run a historical backtest for a specific ticker.
    """
    try:
        # Ticker check handled in engine
        result = run_backtest(
            ticker=req.ticker,
            horizon_days=req.horizon_days,
            window_days=req.window_days
        )
        return result
    except Exception as e:
        logger.error("backtest error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/tickers")
async def list_tickers():
    """List available tickers."""
    try:
        _ensure_data()
        return {"tickers": _state["tickers"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────
# Startup event: pre-fetch data
# ──────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    """Warm the cache in the background so the health check passes immediately."""
    logger.info("🚀 Starting Topology Trading System…")
    # Warm up in a separate thread to avoid blocking the main event loop
    import asyncio
    asyncio.create_task(asyncio.to_thread(background_warmup_sync))

def background_warmup_sync():
    """Synchronous warmup wrapper for use in a separate thread."""
    try:
        # Import inside the call to be sure it's in the thread if needed
        from data_fetcher import get_processed_data
        _ensure_data(252)
        logger.info("✅ Data pre-fetched successfully (%d tickers)", len(_state["tickers"] or []))
    except Exception as e:
        logger.warning("⚠️ Background startup data fetch failed: %s", e)


# The original background_warmup should be renamed or removed
# I'll rename it as shown above.


if __name__ == "__main__":
    import uvicorn
    import os
    # Use Railway's $PORT or default to 8000
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
