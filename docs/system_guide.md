# Topology Trading System — Dashboard Guide

## Overview

This application uses **Graph Signal Processing** and **Topological Data Analysis (TDA)** to detect anomalies and predict stock movements in the Indian market (NSE Nifty 50). Below is a plain-language explanation of each tab.

---

## 1. Graph View Tab

### What You're Seeing
An interactive **force-directed graph** where:
- **Each node** = one NSE stock (e.g., RELIANCE, TCS, INFY)
- **Each edge (line)** = a strong correlation between two stocks
- **Node color** = how anomalous that stock is right now

### How It Works (Laplacian Diffusion)
1. **Correlation Matrix**: We compute pairwise correlations between all 50 stocks using their recent returns
2. **Graph Construction**: Stocks with high correlation get connected by edges. The edge weight uses a Gaussian kernel: `W = exp(-(1−corr)² / σ²)`
3. **Heat Diffusion**: We apply a "heat equation" on the graph. Imagine each stock's current z-score return as a temperature. The diffusion process spreads this heat to correlated neighbors
4. **Residual = Anomaly**: The difference between a stock's **original signal** and its **diffused (smoothed) signal** is the **residual**. A large residual means the stock is behaving differently from what its correlated peers suggest

### Color Legend
| Color | Meaning | Trading Signal |
|-------|---------|---------------|
| 🔴 Red | Positive residual (overperforming vs. peers) | Potential mean-reversion **DOWN** |
| 🔵 Blue | Negative residual (underperforming vs. peers) | Potential mean-reversion **UP** |
| ⚪ Grey | Near-zero residual | Neutral / in-line with peers |

### Controls
- **Sigma (σ)**: Controls edge sensitivity. Lower σ = only very highly correlated pairs get edges
- **Diffusion Time (t)**: How much smoothing to apply. Higher t = more smoothing = larger residuals for outliers
- **Edge Threshold**: Minimum edge weight to display. Lower = more edges visible

---

## 2. Topology Tab (Persistence Diagram)

### What You're Seeing
A **persistence diagram** — the core visualization of Topological Data Analysis (TDA). It shows the "shape" of the market's correlation structure.

### Key Concepts

#### What is Persistent Homology?
Imagine slowly increasing a threshold and connecting stocks whose correlation exceeds that threshold. As you increase the threshold:
- **Connected components form** (isolated groups of stocks merge together) — tracked as **H0 features**
- **Loops/cycles appear** (circular correlation patterns like A↔B↔C↔A) — tracked as **H1 features**

Each topological feature has a:
- **Birth**: The threshold at which the feature first appears
- **Death**: The threshold at which the feature disappears (merges with another component or loop closes)
- **Lifetime = Death − Birth**: How persistent/significant the feature is. **Longer lifetime = more important structural feature**

#### The Diagram
- **X-axis** = Birth time
- **Y-axis** = Death time
- **Diagonal dashed line** = Birth = Death (features on this line are noise/insignificant)
- **Points far from the diagonal** = significant, persistent structural features

#### Market Regimes (The 4-State HMM)
The system uses a **Hidden Markov Model (HMM)** that identifies four tactical regimes by monitoring both the market's "shape" (topology) and its "speed" (momentum/volatility).

| Regime | Visual | Meaning | Tactical Strategy |
|--------|---------|---------|------------------|
| **BULL** | 🟢 Green | Positive momentum + stable structure | Momentum & trend-following favored |
| **BEAR** | 🔴 Red | Negative momentum + high complexity | Defensive / Hedging / Short-selling |
| **SIDEWAYS** | 🟠 Amber | Low volatility + range-bound action | Range-trading & mean-reversion |
| **VOLATILE** | 🟣 Purple | Erratic price action + extreme complexity | High risk; reduce exposure or use spreads |

### Interactive Tooltips & Helpers
- **Hover Status**: Hover over any status chip in the header for a detailed tactical explanation.
- **The legend (ⓘ)**: Click or hover the info icon in the header for a quick reference to the 4-state market legend.
- **Persistence Points**: Hover over any dot in the diagram to see its specific "Lifetime" (statistical significance).
- **Interpretations**: Each topological feature now has a human-readable interpretation of its market impact.

---

## 3. Anomalies Tab

### What You're Seeing
A ranked table of the **top 5 most anomalous stocks** — the ones whose behavior diverges most from their correlated peers.

### Columns Explained
| Column | Meaning |
|--------|---------|
| **Ticker** | Stock symbol + current price |
| **Residual** | The diffusion residual. Larger absolute value = more anomalous |
| **Signal** | OVERPERFORMING (positive residual) or UNDERPERFORMING (negative residual) |
| **Predicted Move** | Expected mean-reversion direction based on the residual |
| **Confidence** | How confident the signal is (based on residual magnitude, capped at 100%) |

### How to Read It
- A stock showing **🔴 OVERPERFORMING** with a large positive residual has been outperforming its correlated sector peers. The system predicts a **mean-reversion DOWN** — i.e., it may pull back toward the sector average.
- A stock showing **🔵 UNDERPERFORMING** with a large negative residual has been lagging behind its peers. The system predicts a **mean-reversion UP**.
- **Confidence** reflects how extreme the deviation is. Higher confidence = stronger anomaly signal.

### Important Caveats
- This is a **statistical signal**, not a guarantee. Stocks can continue trending against the predicted reversion.
- The system works best when used alongside fundamental analysis and risk management.
- Synthetic data mode (used when Yahoo Finance is rate-limited) generates realistic but artificial patterns for demonstration purposes.

---

## Quick Reference: The Full Pipeline

```
NSE Stock Data (yfinance)
    ↓
Log Returns → Z-Score Normalization (60-day rolling window)
    ↓
Correlation Matrix → Gaussian Kernel Adjacency Matrix
    ↓
Normalized Graph Laplacian
    ↓
┌──────────────────────────┐     ┌────────────────────────────────┐
│ Heat Diffusion:          │     │ Hybrid Topological-HMM:        │
│ f(t) = exp(-tL) · f(0)  │     │ 1. Ripser (Persistent Homology)│
│ Residual = f(0) - f(t)  │     │ 2. Momentum & Volatility stats │
│         ↓                │     │ 3. 4-State HMM Classification  │
│ Graph View + Anomalies   │     │         ↓                      │
│ (Anomaly Detection)      │     │ Dashboard Legend + Regimes     │
└──────────────────────────┘     └────────────────────────────────┘
    ↓                                    ↓
    └─────────── Random Forest Predictor ───────────┘
                 (Volatility-Adjusted Targets)
                        ↓
               Directional Probability & 
               Estimated Price Targets
```
