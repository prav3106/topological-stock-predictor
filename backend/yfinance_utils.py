import os
import time
import random
import logging
import pandas as pd
import yfinance as yf
import requests
from typing import List, Optional, Dict
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class YFinanceFetcher:
    """
    Robust utility for fetching Yahoo Finance data with batching, 
    exponential backoff, and local caching.
    Includes 'stealth' features to bypass cloud IP blocks.
    """
    def __init__(self, cache_dir: str = ".cache", max_retries: int = 5):
        self.cache_dir = cache_dir
        self.max_retries = max_retries
        self.base_delay = 3.0  # Increased base delay
        
        # Browser-like headers
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive"
        }
        
        self.session = requests.Session()
        self.session.headers.update(self.headers)
        
        if not os.path.exists(self.cache_dir):
            os.makedirs(self.cache_dir)

    def _get_cache_path(self, ticker: str, start: str, end: str) -> str:
        return os.path.join(self.cache_dir, f"{ticker}_{start}_{end}.csv")

    def fetch_single(self, ticker: str, start: str, end: str) -> Optional[pd.DataFrame]:
        cache_path = self._get_cache_path(ticker, start, end)
        
        if os.path.exists(cache_path):
            try:
                df = pd.read_csv(cache_path, index_col=0, parse_dates=True, on_bad_lines='skip')
                if not df.empty:
                    df = df.apply(pd.to_numeric, errors='coerce')
                    df = df.dropna()
                    if not df.empty:
                        return df
            except Exception as e:
                logger.warning(f"Failed to read cache for {ticker}: {e}")

        for attempt in range(self.max_retries):
            try:
                # Use Ticker.history() which often hits a different, less-blocked endpoint
                tk = yf.Ticker(ticker, session=self.session)
                data = tk.history(start=start, end=end, interval="1d", auto_adjust=True)
                
                if not data.empty:
                    # Ticker.history normally returns a clean single-index DF
                    if "Close" not in data.columns:
                        # Fallback to whatever first numeric column exists
                        data = data.iloc[:, [0]]
                        data.columns = ["Close"]
                        
                    data = data[["Close"]]
                    
                    try:
                        data.to_csv(cache_path)
                    except Exception as e:
                        logger.warning(f"Failed to write cache for {ticker}: {e}")
                    return data
                else:
                    logger.warning(f"No data returned for {ticker} on attempt {attempt+1}")
                    time.sleep(self.base_delay + random.uniform(1, 4))
                    
            except Exception as e:
                delay = self.base_delay * (2 ** attempt) + random.uniform(1, 5)
                logger.warning(f"Error fetching {ticker}: {e}. Retrying in {delay:.2f}s...")
                time.sleep(delay)
        
        return None

    def fetch_batched(self, tickers: List[str], start: str, end: str, batch_size: int = 5) -> pd.DataFrame:
        """
        Fetch multiple tickers in small batches to avoid detection.
        """
        all_prices = []
        
        for i in range(0, len(tickers), batch_size):
            batch = tickers[i : i + batch_size]
            
            uncached_tickers = []
            for ticker in batch:
                df = self.fetch_single(ticker, start, end)
                if df is not None:
                    df.columns = [ticker]
                    all_prices.append(df)
                else:
                    uncached_tickers.append(ticker)
            
            if not uncached_tickers:
                continue

            # Small jitter after each batch
            time.sleep(random.uniform(2, 5))
            
        if not all_prices:
            return pd.DataFrame()
            
        return pd.concat(all_prices, axis=1)
