# Topology-Based Graph Diffusion Trading System

> **Real-time Indian stock market analysis** powered by graph diffusion, topological data analysis, and machine learning.

![NSE/BSE](https://img.shields.io/badge/Market-NSE%2FBSE-blue)
![Python](https://img.shields.io/badge/Backend-FastAPI-green)
![React](https://img.shields.io/badge/Frontend-React%20%2B%20TS-61dafb)
![Docker](https://img.shields.io/badge/Deploy-Docker-2496ED)

## Overview

This system constructs a dynamic stock correlation graph from **Nifty 50** constituents, runs **Laplacian graph diffusion** to detect mispriced stocks, applies **Topological Data Analysis** (persistent homology) to classify market regimes, and generates directional predictions using walk-forward ML models.

### Key Features

- **Live Data** — Fetches real-time NSE stock data via yfinance
- **Graph Diffusion** — Normalized Laplacian + matrix exponential detects anomalous stocks
- **TDA Regime Detection** — Persistent homology (H0/H1) classifies LOW/TRANSITION/HIGH complexity
- **ML Predictions** — GradientBoosting with purged walk-forward CV and 5-day embargo
- **Interactive UI** — Force graph visualization, persistence diagrams, prediction panel

---

## Quick Start (Local)

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker & Docker Compose (optional)

### Option 1: Docker Compose (Recommended)

```bash
git clone <repo-url>
cd tolological-stock-predictor
docker-compose up --build
```

Open http://localhost in your browser.

### Option 2: Run Separately

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. The Vite dev server proxies `/api/*` to `localhost:8000`.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/build-graph` | Build correlation graph + run diffusion |
| POST | `/api/topology` | Compute persistent homology + regime |
| POST | `/api/predict` | Predict stock direction |
| GET | `/api/market-regime` | Current market regime |
| GET | `/api/anomalies` | Top 5 anomalous stocks |
| GET | `/api/tickers` | List available tickers |
| GET | `/api/health` | Health check |

### Example: Build Graph

```bash
curl -X POST http://localhost:8000/api/build-graph \
  -H 'Content-Type: application/json' \
  -d '{"lookback_days": 252, "sigma": 0.5, "diffusion_t": 1.0, "edge_threshold": 0.3}'
```

---

## Deployment

### Railway.app

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

Configure environment variables in Railway dashboard:
- `PYTHONUNBUFFERED=1`

### Render.com

1. Push code to GitHub
2. Create a new "Blueprint" on Render
3. Connect your repo — Render will detect `render.yaml`
4. Deploy

### VPS (DigitalOcean / AWS EC2)

```bash
# On your VPS:
sudo apt update && sudo apt install -y docker.io docker-compose
git clone <repo-url>
cd tolological-stock-predictor
sudo docker-compose up -d

# Optional: SSL via certbot
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

**Systemd service for auto-restart:**

```bash
sudo tee /etc/systemd/system/topology-trading.service << EOF
[Unit]
Description=Topology Trading System
After=docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/path/to/tolological-stock-predictor
ExecStart=/usr/bin/docker-compose up
ExecStop=/usr/bin/docker-compose down
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable topology-trading
sudo systemctl start topology-trading
```

---

## Adding More Stocks

Edit `backend/data_fetcher.py`:

1. Add tickers to `FALLBACK_TICKERS`:
   ```python
   FALLBACK_TICKERS = [
       "RELIANCE.NS", "TCS.NS", ...,
       "NEWSTOCK.NS",  # add here
   ]
   ```

2. Or pass custom tickers via the API:
   The system uses the Nifty 50 scraper by default. To use a custom list, modify the `fetch_nifty50_tickers()` function.

3. For BSE stocks, use `.BO` suffix instead of `.NS`.

---

## Tuning the Diffusion Parameter `t`

| Market Condition | Recommended `t` | Rationale |
|-----------------|-----------------|-----------|
| **Stable / Trending** | 0.3 – 0.8 | Less smoothing preserves individual signals |
| **Normal / Mixed** | 0.8 – 1.2 | Balanced diffusion |
| **Volatile / Crisis** | 1.2 – 2.0 | More smoothing → stronger consensus signal |

**Sigma (σ):**
- Lower σ (0.1–0.3): Only highly correlated pairs form edges → sparse graph
- Higher σ (0.5–1.0): More edges → denser graph, more diffusion effect

---

## Architecture

```
┌────────────────────────────────────┐
│          React + TypeScript        │
│   Graph View · TDA · Predictions   │
└──────────────┬─────────────────────┘
               │ /api/*
┌──────────────▼─────────────────────┐
│          FastAPI Backend           │
│  ┌───────────┐  ┌───────────────┐  │
│  │ Graph     │  │ Topology      │  │
│  │ Engine    │  │ Engine        │  │
│  │ (scipy)   │  │ (ripser)      │  │
│  └───────────┘  └───────────────┘  │
│  ┌───────────┐  ┌───────────────┐  │
│  │ Data      │  │ Prediction    │  │
│  │ Fetcher   │  │ Engine        │  │
│  │ (yfinance)│  │ (sklearn)     │  │
│  └───────────┘  └───────────────┘  │
└────────────────────────────────────┘
```

---

## License

MIT
