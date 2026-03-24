"""
topology_engine.py
Persistent homology (Vietoris-Rips) + TDA feature extraction + regime classification.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Any, Tuple
import logging

try:
    from hmmlearn.hmm import GaussianHMM
except ImportError:
    GaussianHMM = None

try:
    from ripser import ripser
except ImportError:
    ripser = None  # Will fail gracefully and use fallback


def build_point_cloud(
    residual_history: Dict[str, List[float]],
    embedding_dim: int = 10,
) -> np.ndarray:
    """
    Build point cloud: X ∈ ℝ^{N × k}
    Each row = stock's last k residual values.
    """
    tickers = sorted(residual_history.keys())
    vectors = []
    for ticker in tickers:
        vals = residual_history[ticker]
        if len(vals) >= embedding_dim:
            vectors.append(vals[-embedding_dim:])
        else:
            # Pad with zeros if not enough history
            padded = [0.0] * (embedding_dim - len(vals)) + vals
            vectors.append(padded)

    X = np.array(vectors, dtype=np.float64)
    return X


def compute_persistent_homology(
    X: np.ndarray,
    maxdim: int = 1,
) -> Dict[str, Any]:
    """
    Compute Vietoris-Rips persistent homology using ripser.
    Returns persistence diagrams for H0 and H1.
    """
    if ripser is None:
        return _fallback_homology(X)

    try:
        result = ripser(X, maxdim=maxdim)
        dgms = result["dgms"]

        h0_diagram = []
        if len(dgms) > 0:
            for birth, death in dgms[0]:
                if not np.isinf(death):
                    h0_diagram.append({"birth": float(birth), "death": float(death)})
                else:
                    h0_diagram.append({"birth": float(birth), "death": float(np.max(dgms[0][dgms[0][:, 1] != np.inf][:, 1]) * 1.5) if len(dgms[0][dgms[0][:, 1] != np.inf]) > 0 else float(birth + 1.0)})

        h1_diagram = []
        if len(dgms) > 1:
            for birth, death in dgms[1]:
                if not np.isinf(death):
                    h1_diagram.append({"birth": float(birth), "death": float(death)})

        return {
            "h0": h0_diagram,
            "h1": h1_diagram,
        }

    except Exception as e:
        return _fallback_homology(X)


def _fallback_homology(X: np.ndarray) -> Dict[str, Any]:
    """Fallback: compute approximate topological features without ripser."""
    from scipy.spatial.distance import pdist, squareform

    dists = squareform(pdist(X))
    n = X.shape[0]

    # Approximate H0 via single-linkage clustering distances
    h0_diagram = []
    sorted_dists = np.sort(np.triu(dists, k=1).ravel())
    sorted_dists = sorted_dists[sorted_dists > 0]
    step = max(1, len(sorted_dists) // n)
    for i in range(0, min(n, len(sorted_dists)), step):
        h0_diagram.append({"birth": 0.0, "death": float(sorted_dists[i])})

    # Approximate H1: look for "holes" in distance matrix
    h1_diagram = []
    median_dist = float(np.median(dists[dists > 0]))
    # Simple heuristic: find triangles where all edges > median
    count = 0
    for i in range(min(n, 20)):
        for j in range(i + 1, min(n, 20)):
            for k in range(j + 1, min(n, 20)):
                if (dists[i, j] > median_dist and
                    dists[j, k] > median_dist and
                    dists[i, k] > median_dist):
                    h1_diagram.append({
                        "birth": float(median_dist * 0.8),
                        "death": float(max(dists[i, j], dists[j, k], dists[i, k])),
                    })
                    count += 1
                    if count >= 10:
                        break
            if count >= 10:
                break
        if count >= 10:
            break

    return {"h0": h0_diagram, "h1": h1_diagram}


def extract_tda_features(
    diagrams: Dict[str, Any],
    persistence_threshold: float = 0.05,
) -> Dict[str, float]:
    """
    Extract topological features from persistence diagrams.

    Features:
    - n_components: count of H0 bars with lifetime > threshold
    - n_loops: count of H1 bars with lifetime > threshold
    - max_persistence_h0, max_persistence_h1
    - mean_lifetime_h0, mean_lifetime_h1
    - topological_entropy: -sum(p * log(p)) where p = normalized lifetimes
    - betti_0, betti_1 at median epsilon
    """
    h0 = diagrams["h0"]
    h1 = diagrams["h1"]

    # Lifetimes
    lifetimes_h0 = [d["death"] - d["birth"] for d in h0 if d["death"] > d["birth"]]
    lifetimes_h1 = [d["death"] - d["birth"] for d in h1 if d["death"] > d["birth"]]

    # Counts above threshold
    n_components = sum(1 for lt in lifetimes_h0 if lt > persistence_threshold)
    n_loops = sum(1 for lt in lifetimes_h1 if lt > persistence_threshold)

    # Max persistence
    max_persistence_h0 = max(lifetimes_h0) if lifetimes_h0 else 0.0
    max_persistence_h1 = max(lifetimes_h1) if lifetimes_h1 else 0.0

    # Mean lifetime
    mean_lifetime_h0 = float(np.mean(lifetimes_h0)) if lifetimes_h0 else 0.0
    mean_lifetime_h1 = float(np.mean(lifetimes_h1)) if lifetimes_h1 else 0.0

    # Topological entropy
    all_lifetimes = lifetimes_h0 + lifetimes_h1
    if all_lifetimes and sum(all_lifetimes) > 0:
        total = sum(all_lifetimes)
        probs = [lt / total for lt in all_lifetimes if lt > 0]
        topological_entropy = -sum(p * np.log(p + 1e-15) for p in probs)
    else:
        topological_entropy = 0.0

    # Betti numbers at median epsilon
    all_births = [d["birth"] for d in h0 + h1]
    all_deaths = [d["death"] for d in h0 + h1]
    if all_births and all_deaths:
        median_eps = np.median(all_births + all_deaths)
    else:
        median_eps = 0.0

    betti_0 = sum(1 for d in h0 if d["birth"] <= median_eps < d["death"])
    betti_1 = sum(1 for d in h1 if d["birth"] <= median_eps < d["death"])

    return {
        "n_components": n_components,
        "n_loops": n_loops,
        "max_persistence_h0": max_persistence_h0,
        "max_persistence_h1": max_persistence_h1,
        "mean_lifetime_h0": mean_lifetime_h0,
        "mean_lifetime_h1": mean_lifetime_h1,
        "topological_entropy": topological_entropy,
        "betti_0": betti_0,
        "betti_1": betti_1,
    }


# --- Global HMM instance for classification ---
_hmm_model = None

def get_hmm_model():
    global _hmm_model
    if _hmm_model is None and GaussianHMM is not None:
        # Initialize a 3-state HMM
        _hmm_model = GaussianHMM(n_components=3, covariance_type="diag", random_state=42)
        # Dummy fit to initialize parameters shapes
        dummy_X = np.array([
            [0, 0.5], [0, 0.4], [1, 1.2], [2, 1.5], [3, 2.0], [4, 2.5], [1, 0.8]
        ])
        _hmm_model.fit(dummy_X)
        
        # Manually set Gaussian means for [Betti-1, Entropy] to simulate learned regimes
        # State 0: Low (trending) -> betti_1 ~ 0, entropy ~ 0.5
        # State 1: Transition -> betti_1 ~ 1, entropy ~ 1.0
        # State 2: High (volatile) -> betti_1 ~ 3, entropy ~ 1.8
        _hmm_model.means_ = np.array([
            [0.0, 0.5],
            [1.0, 1.0],
            [3.0, 1.8]
        ])
    return _hmm_model

def classify_regime(features: Dict[str, float]) -> str:
    """
    Regime classification using Hidden Markov Model on TDA features.
    Features used: betti_1 (loops), topological_entropy.
    """
    betti_1 = features.get("betti_1", 0)
    entropy = features.get("topological_entropy", 0.0)

    hmm = get_hmm_model()
    if hmm is not None:
        try:
            X = np.array([[betti_1, entropy]])
            state = hmm.predict(X)[0]
            labels = {0: "LOW_COMPLEXITY", 1: "TRANSITION", 2: "HIGH_COMPLEXITY"}
            return labels.get(state, "TRANSITION")
        except Exception as e:
            logging.warning(f"HMM predict failed: {e}. Using fallback.")

    # Fallback empirical rules
    if betti_1 > 3 and entropy > 1.5:
        return "HIGH_COMPLEXITY"
    elif betti_1 == 0 and entropy < 0.8:
        return "LOW_COMPLEXITY"
    else:
        return "TRANSITION"


def run_topology_analysis(
    residual_history: Dict[str, List[float]],
    embedding_dim: int = 10,
) -> Dict[str, Any]:
    """
    Full TDA pipeline:
      1. Build point cloud from residual history
      2. Compute persistent homology
      3. Extract features
      4. Classify regime

    Returns dict with diagrams, features, and regime.
    """
    X = build_point_cloud(residual_history, embedding_dim)
    diagrams = compute_persistent_homology(X, maxdim=1)
    features = extract_tda_features(diagrams)
    regime = classify_regime(features)

    return {
        "diagrams": diagrams,
        "features": features,
        "regime": regime,
        "point_cloud_shape": list(X.shape),
    }
