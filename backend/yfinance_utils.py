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
    """
    def __init__(self, cache_dir: str = ".cache", max_retries: int = 5):
        self.cache_dir = cache_dir
        self.max_retries = max_retries
        self.base_delay = 2.0  # seconds
        
        if not os.path.exists(self.cache_dir):
            os.makedirs(self.cache_dir)

    def _get_cache_path(self, ticker: str, start: str, end: str) -> str:
        # Simple file-per-ticker cache
        return os.path.join(self.cache_dir, f"{ticker}_{start}_{end}.csv")

    def fetch_single(self, ticker: str, start: str, end: str) -> Optional[pd.DataFrame]:
        cache_path = self._get_cache_path(ticker, start, end)
        
        if os.path.exists(cache_path):
            try:
                # Use index_col=0 and parse_dates=True
                # Add skipfooter/header if needed, but better to just ensure clean save
                df = pd.read_csv(cache_path, index_col=0, parse_dates=True, on_bad_lines='skip')
                if not df.empty:
                    # Coerce to numeric in case headers got mixed in
                    df = df.apply(pd.to_numeric, errors='coerce')
                    df = df.dropna()
                    if not df.empty:
                        return df
            except Exception as e:
                logger.warning(f"Failed to read cache for {ticker}: {e}")

        for attempt in range(self.max_retries):
            try:
                data = yf.download(
                    ticker,
                    start=start,
                    end=end,
                    progress=False,
                    threads=False,
                    auto_adjust=True
                )
                
                if not data.empty:
                    # Flatten multi-index if it exists
                    if isinstance(data.columns, pd.MultiIndex):
                        if "Close" in data.columns.get_level_values(0):
                            data = data["Close"]
                        else:
                            data = data.iloc[:, [0]] # fallback first col
                    
                    # Ensure it's a clean single-column DF named 'Close'
                    if isinstance(data, pd.Series):
                        data = data.to_frame(name="Close")
                    elif "Close" not in data.columns:
                        data.columns = ["Close"]
                        
                    data = data[["Close"]] # Cleanest state
                    
                    # Save to cache
                    try:
                        data.to_csv(cache_path)
                    except Exception as e:
                        logger.warning(f"Failed to write cache for {ticker}: {e}")
                    return data
                else:
                    logger.warning(f"No data returned for {ticker} on attempt {attempt+1}")
                    
            except Exception as e:
                if "429" in str(e) or "Too Many Requests" in str(e):
                    delay = self.base_delay * (2 ** attempt) + random.uniform(0, 1)
                    logger.warning(f"Rate limit hit for {ticker}. Retrying in {delay:.2f}s...")
                    time.sleep(delay)
                else:
                    logger.error(f"Error fetching {ticker}: {e}")
                    break 
        
        return None

    def fetch_batched(self, tickers: List[str], start: str, end: str, batch_size: int = 15) -> pd.DataFrame:
        """
        Fetch multiple tickers in batches to respect rate limits and speed up fetching.
        """
        all_prices = []
        
        for i in range(0, len(tickers), batch_size):
            batch = tickers[i : i + batch_size]
            
            # Check cache first for all tickers in batch
            uncached_tickers = []
            for ticker in batch:
                df = self.fetch_single(ticker, start, end)
                if df is not None:
                    # Standardize column name for concatenation
                    df.columns = [ticker]
                    all_prices.append(df)
                else:
                    uncached_tickers.append(ticker)
            
            if not uncached_tickers:
                continue

            logger.info(f"Downloading {len(uncached_tickers)} uncached tickers...")
            for attempt in range(self.max_retries):
                try:
                    batch_data = yf.download(
                        uncached_tickers,
                        start=start,
                        end=end,
                        progress=False,
                        threads=False,
                        auto_adjust=True
                    )
                    
                    if not batch_data.empty:
                        # Extract "Close" level
                        if isinstance(batch_data.columns, pd.MultiIndex):
                            if "Close" in batch_data.columns.get_level_values(0):
                                prices = batch_data["Close"]
                            else:
                                prices = batch_data # Fallback
                        else:
                            prices = batch_data[["Close"]] if "Close" in batch_data.columns else batch_data

                        # Save and append each ticker
                        for ticker in uncached_tickers:
                            if ticker in prices.columns:
                                ticker_df = prices[[ticker]].copy()
                                ticker_df.columns = ["Close"]
                                # Save clean version to disk
                                cache_path = self._get_cache_path(ticker, start, end)
                                ticker_df.to_csv(cache_path)
                                
                                # Rename for return
                                ticker_df.columns = [ticker]
                                all_prices.append(ticker_df)
                        break
                    else:
                        time.sleep(1)
                except Exception as e:
                    if "429" in str(e):
                        time.sleep(self.base_delay * (2 ** attempt))
                    else:
                        break
            
            if i + batch_size < len(tickers):
                time.sleep(2)
                
        if not all_prices:
            return pd.DataFrame()
            
        return pd.concat(all_prices, axis=1)
