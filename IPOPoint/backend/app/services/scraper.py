"""InvestorGain Selenium scraper + response parser.

Results are cached for SCRAPE_CACHE_TTL seconds (default 10 min) to avoid
hammering the site on every request.
"""
from __future__ import annotations
import re
import time
from datetime import date as _date
from difflib import SequenceMatcher
from flask import current_app

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager

# ── Compiled patterns ─────────────────────────────────────────────────────────
CURRENT_GMP_RE = re.compile(r"\(([+-]?\d+(?:\.\d+)?)%\)")
DATE_RE        = re.compile(r"^\d{1,2}-[A-Za-z]{3}$")

# Module-level cache — shared across requests
_scrape_cache: dict = {"lines": [], "ts": 0}


# ── Fetch ─────────────────────────────────────────────────────────────────────

def fetch_investorgain() -> list[str]:
    """Scrape investorgain IPO table using headless Chrome.

    Returns a list of raw text lines from the rendered table.
    Results are cached for SCRAPE_CACHE_TTL seconds.
    """
    global _scrape_cache
    ttl = current_app.config.get("SCRAPE_CACHE_TTL", 600)
    now = time.time()

    if now - _scrape_cache["ts"] < ttl and _scrape_cache["lines"]:
        return _scrape_cache["lines"]

    try:
        opts = Options()
        opts.add_argument("--headless=new")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        driver = webdriver.Chrome(
            service=Service(ChromeDriverManager().install()),
            options=opts,
        )
        driver.get("https://www.investorgain.com/report/live-ipo-gmp/331/")
        time.sleep(10)
        table_text = driver.find_element(By.TAG_NAME, "table").text
        driver.quit()

        lines = [x.strip() for x in table_text.split("\n") if x.strip()]
        _scrape_cache = {"lines": lines, "ts": now}
        return lines

    except Exception as exc:
        print(f"[scraper] error: {exc}")
        return []


# ── Parsers ───────────────────────────────────────────────────────────────────

def parse_all_ipos(lines: list[str]) -> list[dict]:
    """Parse ALL IPO entries from scraped lines into a structured list."""
    ipos = []
    i = 0
    while i < len(lines):
        line = lines[i]
        is_ipo = (
            re.search(r"IPO[A-Z]*\s*$", line) or
            re.search(r"(BSE|NSE)\s+SME[A-Z]*\s*$", line)
        )
        if not is_ipo:
            i += 1
            continue

        # Determine mainboard vs SME
        ipo_type = "sme" if re.search(r"(BSE|NSE)\s+SME", line) else "mainboard"

        raw_name = re.sub(
            r"\s+(IPO[A-Z]*|BSE SME[A-Z]*|NSE SME[A-Z]*)$", "", line
        ).strip()

        # Collect block until ✅
        block: list[str] = []
        j = i + 1
        while j < len(lines) and lines[j] != "✅":
            block.append(lines[j])
            j += 1

        gmp = _extract_gmp(block)
        dates = [l for l in block if DATE_RE.match(l)]
        issue_price = _extract_issue_price_exact(block)

        status = "upcoming"
        if "ALLOTTED" in line.upper():
            status = "allotted"
        elif "LISTED" in line.upper():
            status = "listed"
        elif len(dates) >= 2:
            status = _resolve_status(dates[0], dates[1])

        ipos.append({
            "name":           raw_name,
            "gmp":            f"{gmp}%" if gmp is not None else "",
            "gmp_num":        gmp or 0,
            "open_date":      dates[0] if len(dates) > 0 else "",
            "close_date":     dates[1] if len(dates) > 1 else "",
            "allotment_date": dates[2] if len(dates) > 2 else "",
            "issue_price":    issue_price or "",
            "status":         status,
            "ipo_type":       ipo_type,
        })
        i = j + 1

    return ipos


def parse_ipo_block(lines: list[str], name: str) -> tuple[dict | None, float]:
    """Find best fuzzy match for *name* and return extracted IPO data.

    Returns (result_dict, best_score). result_dict is None when no match found.
    """
    best_idx   = None
    best_score = 0.0

    for i, line in enumerate(lines):
        score = _similarity(name, line)
        if score > best_score:
            best_score = score
            best_idx   = i

    if best_idx is None or best_score < 0.40:
        return None, best_score

    block: list[str] = []
    for j in range(best_idx + 1, min(len(lines), best_idx + 30)):
        if lines[j] == "✅":
            break
        block.append(lines[j])

    dates       = [l for l in block if DATE_RE.match(l)]
    gmp         = _extract_gmp(block)
    issue_price = _extract_issue_price_fuzzy(block)

    return {
        "matched_name":   lines[best_idx],
        "score":          round(best_score, 2),
        "open_date":      dates[0] if len(dates) > 0 else "",
        "close_date":     dates[1] if len(dates) > 1 else "",
        "allotment_date": dates[2] if len(dates) > 2 else "",
        "gmp":            f"{gmp}%" if gmp is not None else "",
        "issue_price":    issue_price or "",
    }, best_score


# ── Helpers ───────────────────────────────────────────────────────────────────

_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

def _parse_ipo_date(s: str) -> _date | None:
    """Parse '3-Sep' style date into a date object (assumes current year)."""
    try:
        parts = s.strip().split("-")
        if len(parts) != 2:
            return None
        day = int(parts[0])
        mon = _MONTHS.get(parts[1].lower())
        if not mon:
            return None
        today = _date.today()
        # If parsed month is earlier than current month, it's probably next year
        year = today.year if mon >= today.month else today.year + 1
        return _date(year, mon, day)
    except Exception:
        return None


def _resolve_status(open_str: str, close_str: str) -> str:
    """Return 'open', 'upcoming', or 'allotted' based on today vs open/close dates."""
    today    = _date.today()
    open_dt  = _parse_ipo_date(open_str)
    close_dt = _parse_ipo_date(close_str)

    if open_dt is None or close_dt is None:
        # Cannot determine — fall back to open (original behaviour)
        return "open"

    if today < open_dt:
        return "upcoming"
    if today > close_dt:
        return "allotted"
    return "open"


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _extract_gmp(block: list[str]) -> int | None:
    if not block:
        return None
    m = CURRENT_GMP_RE.search(block[0])
    return round(float(m.group(1))) if m else None


def _extract_issue_price_exact(block: list[str]) -> str | None:
    """Match standalone ₹NNN.NN lines (no percentage) — used in parse_all_ipos."""
    for bl in block:
        mp = re.search(r"^₹([\d,]+(?:\.\d+)?)$", bl)
        if mp:
            return mp.group(1).replace(",", "")
    return None


def _extract_issue_price_fuzzy(block: list[str]) -> str | None:
    """Match first ₹NNN.NN that starts the line and has no % — used in parse_ipo_block."""
    for bl in block:
        mp = re.search(r"₹([\d,]+(?:\.\d+)?)", bl)
        if mp and bl.startswith("₹") and "%" not in bl:
            return mp.group(1).replace(",", "")
    return None
