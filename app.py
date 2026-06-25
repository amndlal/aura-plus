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
