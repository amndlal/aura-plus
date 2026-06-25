"""
Aura+ — Production-grade personal command center
Flask backend with REST API, real-time data, caching, error handling
"""

from flask import Flask, render_template, jsonify, request
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from functools import lru_cache
import time
import json
import os

app = Flask(__name__)

# ============================================================
# CACHE LAYER — prevents hammering APIs on every request
# ============================================================

cache = {}

def cached(key, ttl, fetcher):
    """Simple time-based cache. Returns cached data if fresh, else re-fetches."""
    now = time.time()
    if key in cache and now - cache[key]["time"] < ttl:
        return cache[key]["data"]
    try:
        data = fetcher()
        cache[key] = {"data": data, "time": now}
        return data
    except Exception as e:
        if key in cache:
            return cache[key]["data"]
        return None

# ============================================================
# DATA LAYER — file-based persistence
# ============================================================

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

def read_json(filename, default):
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return default

def write_json(filename, data):
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)

# ============================================================
# API SERVICES
# ============================================================

def fetch_weather(city="Cologne"):
    url = f"https://wttr.in/{city}?format=j1"
    r = requests.get(url, timeout=8)
    r.raise_for_status()
    data = r.json()
    current = data["current_condition"][0]
    forecast = []
    for day in data.get("weather", [])[:3]:
        forecast.append({
            "date": day["date"],
            "max": day["maxtempC"],
            "min": day["mintempC"],
            "desc": day["hourly"][4]["weatherDesc"][0]["value"] if day.get("hourly") else ""
        })
    return {
        "temp": current["temp_C"],
        "feels": current["FeelsLikeC"],
        "humidity": current["humidity"],
        "wind": current["windspeedKmph"],
        "desc": current["weatherDesc"][0]["value"],
        "uv": current.get("uvIndex", "—"),
        "visibility": current.get("visibility", "—"),
        "forecast": forecast
    }

def fetch_news(topic="world", count=12):
    url = f"https://news.google.com/rss/search?q={topic}&hl=en-IN&gl=IN&ceid=IN:en"
    r = requests.get(url, timeout=8)
    root = ET.fromstring(r.content)
    items = root.findall(".//item")
    articles = []
    for item in items[:count]:
        title = item.find("title").text or ""
        link = item.find("link").text if item.find("link") is not None else ""
        source = item.find("source").text if item.find("source") is not None else ""
        pub = item.find("pubDate").text if item.find("pubDate") is not None else ""
        articles.append({"title": title, "link": link, "source": source, "date": pub})
    return articles

def fetch_crypto():
    url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,dogecoin,ripple&vs_currencies=usd&include_24hr_change=true&include_market_cap=true"
    r = requests.get(url, timeout=8)
    r.raise_for_status()
    return r.json()

def fetch_rates():
    url = "https://open.er-api.com/v6/latest/USD"
    r = requests.get(url, timeout=8)
    r.raise_for_status()
    return r.json().get("rates", {})

def fetch_quote():
    r = requests.get("https://zenquotes.io/api/random", timeout=5)
    data = r.json()
    return {"text": data[0]["q"], "author": data[0]["a"]}

def fetch_stock_quote(symbol):
    """Fetch real-time stock data from Yahoo Finance."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5d"
    headers = {"User-Agent": "Mozilla/5.0"}
    r = requests.get(url, headers=headers, timeout=8)
    r.raise_for_status()
    data = r.json()
    result = data["chart"]["result"][0]
    meta = result["meta"]
    indicators = result["indicators"]["quote"][0]
    timestamps = result.get("timestamp", [])
    closes = indicators.get("close", [])
    volumes = indicators.get("volume", [])
    highs = indicators.get("high", [])
    lows = indicators.get("low", [])
    opens = indicators.get("open", [])

    price = meta.get("regularMarketPrice", 0)
    prev_close = meta.get("chartPreviousClose", meta.get("previousClose", price))
    change = price - prev_close
    change_pct = (change / prev_close * 100) if prev_close else 0

    chart_data = []
    for i, ts in enumerate(timestamps):
        if closes[i] is not None:
            chart_data.append({
                "time": ts,
                "open": round(opens[i], 2) if opens[i] else None,
                "high": round(highs[i], 2) if highs[i] else None,
                "low": round(lows[i], 2) if lows[i] else None,
                "close": round(closes[i], 2),
                "volume": volumes[i]
            })

    return {
        "symbol": meta.get("symbol", symbol),
        "name": meta.get("shortName", meta.get("symbol", symbol)),
        "price": round(price, 2),
        "change": round(change, 2),
        "changePct": round(change_pct, 2),
        "currency": meta.get("currency", "USD"),
        "exchange": meta.get("exchangeName", ""),
        "marketState": meta.get("marketState", ""),
        "dayHigh": round(meta.get("regularMarketDayHigh", 0), 2),
        "dayLow": round(meta.get("regularMarketDayLow", 0), 2),
        "volume": meta.get("regularMarketVolume", 0),
        "prevClose": round(prev_close, 2),
        "fiftyTwoWeekHigh": round(meta.get("fiftyTwoWeekHigh", 0), 2),
        "fiftyTwoWeekLow": round(meta.get("fiftyTwoWeekLow", 0), 2),
        "chart": chart_data
    }

def fetch_stock_batch(symbols):
    """Fetch multiple stocks."""
    results = []
    for sym in symbols:
        try:
            results.append(fetch_stock_quote(sym))
        except:
            results.append({"symbol": sym, "error": True})
    return results

def fetch_market_indices():
    """Fetch major market indices."""
    indices = ["^GSPC", "^DJI", "^IXIC", "^NSEI", "^BSESN", "^GDAXI", "^FTSE"]
    names = {"^GSPC": "S&P 500", "^DJI": "Dow Jones", "^IXIC": "NASDAQ", "^NSEI": "NIFTY 50", "^BSESN": "SENSEX", "^GDAXI": "DAX", "^FTSE": "FTSE 100"}
    results = []
    for idx in indices:
        try:
            data = fetch_stock_quote(idx)
            data["name"] = names.get(idx, data.get("name", idx))
            results.append(data)
        except:
            results.append({"symbol": idx, "name": names.get(idx, idx), "error": True})
    return results

def fetch_market_movers():
    """Fetch top gainers and losers — popular stocks."""
    popular = ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "META", "NFLX", "AMD", "INTC",
               "RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "WIPRO.NS"]
    stocks = fetch_stock_batch(popular)
    valid = [s for s in stocks if not s.get("error")]
    gainers = sorted(valid, key=lambda s: s.get("changePct", 0), reverse=True)[:5]
    losers = sorted(valid, key=lambda s: s.get("changePct", 0))[:5]
    return {"gainers": gainers, "losers": losers, "all": valid}

def fetch_stock_chart(symbol, interval="1d", range_val="1mo"):
    """Fetch chart data for a specific timeframe."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval={interval}&range={range_val}"
    headers = {"User-Agent": "Mozilla/5.0"}
    r = requests.get(url, headers=headers, timeout=8)
    r.raise_for_status()
    data = r.json()
    result = data["chart"]["result"][0]
    indicators = result["indicators"]["quote"][0]
    timestamps = result.get("timestamp", [])
    closes = indicators.get("close", [])
    volumes = indicators.get("volume", [])

    chart = []
    for i, ts in enumerate(timestamps):
        if closes[i] is not None:
            chart.append({"time": ts, "close": round(closes[i], 2), "volume": volumes[i]})
    return chart

# ============================================================
# ROUTES — Pages
# ============================================================

@app.route("/")
def index():
    return render_template("index.html")

# ============================================================
# ROUTES — REST API
# ============================================================

@app.route("/api/dashboard")
def api_dashboard():
    """Main dashboard data — single request for initial load."""
    now = datetime.now()
    hour = now.hour
    greeting = "Good morning" if hour < 12 else "Good afternoon" if hour < 17 else "Good evening"

    weather = cached("weather", 600, fetch_weather)
    crypto = cached("crypto", 60, fetch_crypto)
    rates = cached("rates", 300, fetch_rates)
    quote = cached("quote", 3600, fetch_quote)
    news = cached("news_world", 300, lambda: fetch_news("world"))

    clocks = {}
    zones = {"Cologne": 2, "Mumbai": 5.5, "New York": -4, "Tokyo": 9, "London": 1, "Dubai": 4}
    for city, offset in zones.items():
        h = int(offset)
        m = int((offset - h) * 60)
        tz = timezone(timedelta(hours=h, minutes=m))
        t = datetime.now(tz)
        clocks[city] = {"time": t.strftime("%H:%M"), "day": t.strftime("%a"), "date": t.strftime("%d %b")}

    return jsonify({
        "greeting": greeting,
        "date": now.strftime("%A, %d %B %Y"),
        "time": now.strftime("%H:%M"),
        "weather": weather,
        "crypto": crypto,
        "rates": rates,
        "quote": quote,
        "news": news,
        "clocks": clocks,
        "tasks": read_json("tasks.json", []),
        "bookmarks": read_json("bookmarks.json", []),
        "notes": read_json("notes.json", {"content": ""})
    })

@app.route("/api/news/<topic>")
def api_news(topic):
    data = cached(f"news_{topic}", 300, lambda: fetch_news(topic))
    return jsonify(data or [])

@app.route("/api/news/search/<query>")
def api_news_search(query):
    data = fetch_news(query, 15)
    return jsonify(data)

@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    return jsonify(read_json("tasks.json", []))

@app.route("/api/tasks", methods=["POST"])
def add_task():
    tasks = read_json("tasks.json", [])
    body = request.json
    task = {
        "id": int(time.time() * 1000),
        "text": body["text"],
        "done": False,
        "created": datetime.now().isoformat()
    }
    tasks.insert(0, task)
    write_json("tasks.json", tasks)
    return jsonify(task), 201

@app.route("/api/tasks/<int:task_id>", methods=["PATCH"])
def update_task(task_id):
    tasks = read_json("tasks.json", [])
    for t in tasks:
        if t["id"] == task_id:
            t.update(request.json)
            break
    write_json("tasks.json", tasks)
    return jsonify({"ok": True})

@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    tasks = read_json("tasks.json", [])
    tasks = [t for t in tasks if t["id"] != task_id]
    write_json("tasks.json", tasks)
    return jsonify({"ok": True})

@app.route("/api/notes", methods=["GET"])
def get_notes():
    return jsonify(read_json("notes.json", {"content": ""}))

@app.route("/api/notes", methods=["POST"])
def save_notes():
    write_json("notes.json", request.json)
    return jsonify({"ok": True})

@app.route("/api/bookmarks", methods=["GET"])
def get_bookmarks():
    return jsonify(read_json("bookmarks.json", []))

@app.route("/api/bookmarks", methods=["POST"])
def add_bookmark():
    bookmarks = read_json("bookmarks.json", [])
    body = request.json
    bm = {"id": int(time.time() * 1000), "title": body["title"], "url": body["url"]}
    bookmarks.append(bm)
    write_json("bookmarks.json", bookmarks)
    return jsonify(bm), 201

@app.route("/api/bookmarks/<int:bm_id>", methods=["DELETE"])
def delete_bookmark(bm_id):
    bookmarks = read_json("bookmarks.json", [])
    bookmarks = [b for b in bookmarks if b["id"] != bm_id]
    write_json("bookmarks.json", bookmarks)
    return jsonify({"ok": True})

# ============================================================
# ROUTES — Stocks API
# ============================================================

@app.route("/api/stocks/indices")
def api_indices():
    data = cached("indices", 120, fetch_market_indices)
    return jsonify(data or [])

@app.route("/api/stocks/movers")
def api_movers():
    data = cached("movers", 120, fetch_market_movers)
    return jsonify(data or {"gainers": [], "losers": [], "all": []})

@app.route("/api/stocks/quote/<symbol>")
def api_stock_quote(symbol):
    try:
        data = fetch_stock_quote(symbol.upper())
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 404

@app.route("/api/stocks/chart/<symbol>")
def api_stock_chart(symbol):
    interval = request.args.get("interval", "1d")
    range_val = request.args.get("range", "1mo")
    try:
        data = fetch_stock_chart(symbol.upper(), interval, range_val)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 404

@app.route("/api/stocks/watchlist", methods=["GET"])
def get_watchlist():
    return jsonify(read_json("watchlist.json", ["AAPL", "MSFT", "GOOGL", "TSLA", "RELIANCE.NS", "NIFTY50.NS"]))

@app.route("/api/stocks/watchlist", methods=["POST"])
def add_to_watchlist():
    watchlist = read_json("watchlist.json", ["AAPL", "MSFT", "GOOGL", "TSLA", "RELIANCE.NS"])
    symbol = request.json.get("symbol", "").upper()
    if symbol and symbol not in watchlist:
        watchlist.append(symbol)
        write_json("watchlist.json", watchlist)
    return jsonify(watchlist)

@app.route("/api/stocks/watchlist/<symbol>", methods=["DELETE"])
def remove_from_watchlist(symbol):
    watchlist = read_json("watchlist.json", [])
    watchlist = [s for s in watchlist if s != symbol.upper()]
    write_json("watchlist.json", watchlist)
    return jsonify(watchlist)

@app.route("/api/stocks/search/<query>")
def search_stocks(query):
    """Search for stock symbols."""
    url = f"https://query1.finance.yahoo.com/v1/finance/search?q={query}&quotesCount=8&newsCount=0"
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        r = requests.get(url, headers=headers, timeout=5)
        data = r.json()
        results = []
        for q in data.get("quotes", []):
            if q.get("quoteType") in ("EQUITY", "ETF", "INDEX"):
                results.append({
                    "symbol": q["symbol"],
                    "name": q.get("shortname") or q.get("longname", q["symbol"]),
                    "exchange": q.get("exchange", ""),
                    "type": q.get("quoteType", "")
                })
        return jsonify(results)
    except:
        return jsonify([])

@app.route("/api/convert")
def convert_currency():
    amount = float(request.args.get("amount", 1))
    frm = request.args.get("from", "USD")
    to = request.args.get("to", "INR")
    rates = cached("rates", 300, fetch_rates)
    if not rates:
        return jsonify({"error": "Could not fetch rates"}), 500
    from_rate = rates.get(frm, 1)
    to_rate = rates.get(to, 1)
    result = amount * (to_rate / from_rate)
    return jsonify({"amount": amount, "from": frm, "to": to, "result": round(result, 2)})

# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":
    app.run(debug=True, port=5000)
