/* ============================================================
   Aura+ — Static Frontend (No Backend Required)
   Direct API calls + localStorage for persistence
   ============================================================ */

let dashboardData = { tasks: [], notes: { content: '' }, bookmarks: [], crypto: null, news: [], weather: null, clocks: {} };
let timerInterval = null;
let timerSeconds = 25 * 60;
let timerRunning = false;
let sessions = 0;

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
  setupNavigation();
  setupSearch();
  setInterval(updateClocks, 60000);
});

// ============================================================
// DIRECT API CALLS (replaces Flask backend)
// ============================================================

async function fetchJSON(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.error('Fetch error:', url, e.message);
    return null;
  }
}

async function fetchWeather(city = 'Cologne') {
  const data = await fetchJSON(`https://wttr.in/${city}?format=j1`).catch(() => null);
  if (!data || !data.current_condition) return null;
  const current = data.current_condition[0];
  const forecast = (data.weather || []).slice(0, 3).map(day => ({
    date: day.date,
    max: day.maxtempC,
    min: day.mintempC,
    desc: day.hourly && day.hourly[4] ? day.hourly[4].weatherDesc[0].value : ''
  }));
  return { temp: current.temp_C, feels: current.FeelsLikeC, humidity: current.humidity, wind: current.windspeedKmph, desc: current.weatherDesc[0].value, forecast };
}

async function fetchNews(topic = 'world', count = 12) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en&gl=US&ceid=US:en`;
  const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'ok' && data.items) {
      return data.items.slice(0, count).map(item => ({
        title: item.title || '',
        link: item.link || '',
        source: item.author || '',
        date: item.pubDate || ''
      }));
    }
  } catch (e) { console.error('News error:', e); }
  return [];
}

async function fetchCrypto() {
  return await fetchJSON('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,dogecoin,ripple&vs_currencies=usd&include_24hr_change=true&include_market_cap=true');
}

async function fetchRates() {
  const data = await fetchJSON('https://open.er-api.com/v6/latest/USD');
  return data ? data.rates : {};
}

async function fetchQuote() {
  // Rotating local quotes (no API needed, no CORS issues)
  const quotes = [
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
    { text: "Quality means doing it right when no one is looking.", author: "Henry Ford" },
    { text: "What gets measured gets managed.", author: "Peter Drucker" },
    { text: "Efficiency is doing things right; effectiveness is doing the right things.", author: "Peter Drucker" },
    { text: "Continuous improvement is better than delayed perfection.", author: "Mark Twain" },
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "It is not the strongest that survive, but the most adaptable.", author: "Charles Darwin" },
    { text: "Data beats opinions.", author: "Jim Barksdale" },
    { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
    { text: "If you can't explain it simply, you don't understand it well enough.", author: "Albert Einstein" },
    { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
    { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
    { text: "In God we trust. All others must bring data.", author: "W. Edwards Deming" }
  ];
  return quotes[Math.floor(Math.random() * quotes.length)];
}

// ============================================================
// DASHBOARD LOAD
// ============================================================

async function loadDashboard() {
  // Load local data
  dashboardData.tasks = JSON.parse(localStorage.getItem('aura_tasks') || '[]');
  dashboardData.notes = JSON.parse(localStorage.getItem('aura_notes') || '{"content":""}');
  dashboardData.bookmarks = JSON.parse(localStorage.getItem('aura_bookmarks') || '[]');

  // Greeting
  const hour = new Date().getHours();
  dashboardData.greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  dashboardData.date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Clocks
  dashboardData.clocks = getClocks();

  // Render immediately with local data
  renderGreeting();
  renderClocks();
  renderTasks();
  renderNotes();
  renderBookmarks();

  // Show loading states
  document.getElementById('quoteCard').innerHTML = '<div class="quote-text">Loading...</div>';
  document.getElementById('weatherStrip').innerHTML = '<div class="weather-card"><div class="value">...</div><div class="label">Loading weather</div></div>';
  document.getElementById('homeNews').innerHTML = '<div class="loading">Loading news...</div>';
  document.getElementById('homeCrypto').innerHTML = '<div class="loading">Loading crypto...</div>';

  // Load remote data independently (so one failure doesn't block others)
  fetchQuote().then(q => { dashboardData.quote = q; renderQuote(); }).catch(() => {});
  fetchWeather().then(w => { dashboardData.weather = w; renderWeather(); }).catch(() => {});
  fetchNews('world', 6).then(n => { dashboardData.news = n; renderHomeNews(); }).catch(() => {});
  fetchCrypto().then(c => { dashboardData.crypto = c; renderHomeCrypto(); }).catch(() => {});
}

function getClocks() {
  const zones = { 'Cologne': 'Europe/Berlin', 'Delhi': 'Asia/Kolkata', 'New York': 'America/New_York', 'Tokyo': 'Asia/Tokyo' };
  const clocks = {};
  Object.entries(zones).forEach(([city, tz]) => {
    clocks[city] = { time: new Date().toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }) };
  });
  return clocks;
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================

function renderGreeting() {
  document.getElementById('greeting').textContent = `${dashboardData.greeting}, Aman`;
  document.getElementById('topDate').textContent = dashboardData.date;
}

function renderQuote() {
  const q = dashboardData.quote;
  if (!q) return;
  document.getElementById('quoteCard').innerHTML = `
    <div class="quote-text">"${q.text}"</div>
    <div class="quote-author">— ${q.author}</div>
  `;
}

function renderWeather() {
  const w = dashboardData.weather;
  if (!w) { document.getElementById('weatherStrip').innerHTML = '<div class="weather-card"><div class="value">—</div><div class="label">Loading...</div></div>'; return; }
  document.getElementById('weatherStrip').innerHTML = `
    <div class="weather-card"><div class="value">${w.temp}°C</div><div class="label">Temperature</div></div>
    <div class="weather-card"><div class="value">${w.feels}°C</div><div class="label">Feels Like</div></div>
    <div class="weather-card"><div class="value">${w.humidity}%</div><div class="label">Humidity</div></div>
    <div class="weather-card"><div class="value">${w.wind} km/h</div><div class="label">Wind</div></div>
    <div class="weather-card"><div class="value">${w.desc}</div><div class="label">Condition</div></div>
    ${w.forecast && w.forecast[1] ? `<div class="weather-card"><div class="value">${w.forecast[1].max}°C</div><div class="label">Tomorrow</div></div>` : ''}
  `;
}

function renderNewsCards(articles, container) {
  container.innerHTML = articles.map(a => `
    <a class="news-card" href="${a.link}" target="_blank" rel="noopener">
      <div class="news-title">${a.title}</div>
      <div class="news-meta">${a.source} · ${formatDate(a.date)}</div>
    </a>
  `).join('') || '<div class="loading">No news available</div>';
}

function renderHomeNews() {
  const news = dashboardData.news;
  if (!news || !news.length) return;
  renderNewsCards(news.slice(0, 6), document.getElementById('homeNews'));
}

function renderHomeCrypto() {
  const crypto = dashboardData.crypto;
  if (!crypto) return;
  const el = document.getElementById('homeCrypto');
  el.innerHTML = Object.entries(crypto).map(([name, data]) => {
    const change = data.usd_24h_change || 0;
    const dir = change >= 0 ? 'up' : 'down';
    const price = data.usd > 100 ? `$${data.usd.toLocaleString()}` : `$${data.usd.toFixed(4)}`;
    return `
      <div class="crypto-card">
        <div class="crypto-name">${name}</div>
        <div class="crypto-price">${price}</div>
        <div class="crypto-change ${dir}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%</div>
      </div>
    `;
  }).join('');
}

function renderClocks() {
  const clocks = dashboardData.clocks;
  if (!clocks) return;
  document.getElementById('clocks').innerHTML = Object.entries(clocks).map(([city, data]) => `
    <div class="clock-row">
      <span class="city">${city}</span>
      <span class="time">${data.time}</span>
    </div>
  `).join('');
}

function updateClocks() {
  dashboardData.clocks = getClocks();
  renderClocks();
}

// ============================================================
// NEWS
// ============================================================

async function loadNews(topic) {
  const el = document.getElementById('newsGrid');
  el.innerHTML = '<div class="loading">Loading news...</div>';
  const news = await fetchNews(topic, 12);
  renderNewsCards(news, el);
}

async function searchNews() {
  const query = document.getElementById('globalSearch').value.trim();
  if (!query) return;
  navigateTo('news');
  const el = document.getElementById('newsGrid');
  el.innerHTML = '<div class="loading">Searching...</div>';
  const results = await fetchNews(query, 12);
  renderNewsCards(results, el);
  document.querySelectorAll('#newsTabs .tab').forEach(t => t.classList.remove('active'));
}

function setupSearch() {
  document.getElementById('globalSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchNews();
  });
}

// ============================================================
// TASKS (localStorage)
// ============================================================

function renderTasks() {
  const tasks = dashboardData.tasks || [];
  const el = document.getElementById('taskList');
  const done = tasks.filter(t => t.done).length;
  document.getElementById('taskStats').textContent = `${done}/${tasks.length} completed`;

  el.innerHTML = tasks.map(t => `
    <div class="task-item">
      <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleTask(${t.id})">
      <span class="task-text ${t.done ? 'done' : ''}">${t.text}</span>
      <button class="task-delete" onclick="deleteTask(${t.id})">×</button>
    </div>
  `).join('') || '<p style="color:var(--muted);font-size:13px">No tasks yet.</p>';
}

function addTask() {
  const input = document.getElementById('taskInput');
  const text = input.value.trim();
  if (!text) return;
  const task = { id: Date.now(), text, done: false };
  dashboardData.tasks.unshift(task);
  localStorage.setItem('aura_tasks', JSON.stringify(dashboardData.tasks));
  renderTasks();
  input.value = '';
  toast('Task added');
}

function toggleTask(id) {
  const task = dashboardData.tasks.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;
  localStorage.setItem('aura_tasks', JSON.stringify(dashboardData.tasks));
  renderTasks();
}

function deleteTask(id) {
  dashboardData.tasks = dashboardData.tasks.filter(t => t.id !== id);
  localStorage.setItem('aura_tasks', JSON.stringify(dashboardData.tasks));
  renderTasks();
  toast('Task deleted');
}

// ============================================================
// NOTES (localStorage)
// ============================================================

function renderNotes() {
  document.getElementById('notesArea').value = dashboardData.notes.content || '';
}

function saveNotes() {
  const content = document.getElementById('notesArea').value;
  dashboardData.notes = { content };
  localStorage.setItem('aura_notes', JSON.stringify(dashboardData.notes));
  toast('Notes saved');
}

// ============================================================
// BOOKMARKS (localStorage)
// ============================================================

function renderBookmarks() {
  const bms = dashboardData.bookmarks || [];
  const el = document.getElementById('bookmarkList');
  el.innerHTML = bms.map(b => `
    <div class="bookmark-item">
      <a href="${b.url}" target="_blank">${b.title}</a>
      <button onclick="deleteBookmark(${b.id})">×</button>
    </div>
  `).join('') || '<p style="color:var(--muted);font-size:13px">No bookmarks yet.</p>';
}

function addBookmark() {
  const title = document.getElementById('bmTitle').value.trim();
  const url = document.getElementById('bmUrl').value.trim();
  if (!title || !url) return;
  const bm = { id: Date.now(), title, url };
  dashboardData.bookmarks.push(bm);
  localStorage.setItem('aura_bookmarks', JSON.stringify(dashboardData.bookmarks));
  renderBookmarks();
  document.getElementById('bmTitle').value = '';
  document.getElementById('bmUrl').value = '';
  toast('Bookmark saved');
}

function deleteBookmark(id) {
  dashboardData.bookmarks = dashboardData.bookmarks.filter(b => b.id !== id);
  localStorage.setItem('aura_bookmarks', JSON.stringify(dashboardData.bookmarks));
  renderBookmarks();
}

// ============================================================
// STOCKS (direct Yahoo Finance — may have CORS issues)
// ============================================================

let currentStockSymbol = null;

async function loadStocksSection() {
  loadIndices();
  loadWatchlist();
  setupStockSearch();
  setupChartControls();
}

async function loadIndices() {
  const el = document.getElementById('indicesGrid');
  el.innerHTML = '<div class="loading">Stock data requires a backend server (CORS restriction). Showing demo data.</div>';
  // Note: Yahoo Finance blocks direct browser requests (CORS). For full stock functionality, use a proxy or backend.
}

async function loadWatchlist() {
  const watchlist = JSON.parse(localStorage.getItem('aura_watchlist') || '[]');
  const el = document.getElementById('watchlistGrid');
  if (!watchlist.length) {
    el.innerHTML = '<div class="loading">Add stocks to your watchlist using the search above</div>';
    return;
  }
  el.innerHTML = watchlist.map(s => `
    <div class="watchlist-card">
      <button class="watchlist-remove" onclick="removeFromWatchlist('${s}')">×</button>
      <div class="watchlist-symbol">${s}</div>
    </div>
  `).join('');
}

function setupStockSearch() {
  const input = document.getElementById('stockSearchInput');
  if (input) {
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchStocks(); });
  }
}

function searchStocks() {
  const input = document.getElementById('stockSearchInput');
  const q = input.value.trim().toUpperCase();
  if (!q) return;
  addToWatchlist(q);
  input.value = '';
}

function selectStock(symbol) {
  document.getElementById('stockSearchInput').value = '';
  addToWatchlist(symbol);
}

function addToWatchlist(symbol) {
  const watchlist = JSON.parse(localStorage.getItem('aura_watchlist') || '[]');
  if (!watchlist.includes(symbol)) {
    watchlist.push(symbol);
    localStorage.setItem('aura_watchlist', JSON.stringify(watchlist));
    toast(`${symbol} added to watchlist`);
    loadWatchlist();
  }
}

function removeFromWatchlist(symbol) {
  let watchlist = JSON.parse(localStorage.getItem('aura_watchlist') || '[]');
  watchlist = watchlist.filter(s => s !== symbol);
  localStorage.setItem('aura_watchlist', JSON.stringify(watchlist));
  toast(`${symbol} removed`);
  loadWatchlist();
}

function refreshWatchlist() { loadWatchlist(); }

function openStockDetail(symbol) {
  toast('Live stock charts require a backend proxy (CORS restriction).');
}

function setupChartControls() {
  document.querySelectorAll('.chart-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

// ============================================================
// CURRENCY CONVERTER
// ============================================================

let ratesCache = null;

async function convertCurrency() {
  const amount = parseFloat(document.getElementById('convAmount').value);
  const from = document.getElementById('convFrom').value;
  const to = document.getElementById('convTo').value;

  if (!ratesCache) ratesCache = await fetchRates();
  if (!ratesCache) { document.getElementById('convResult').textContent = 'Failed to load rates'; return; }

  const inUSD = amount / (ratesCache[from] || 1);
  const result = inUSD * (ratesCache[to] || 1);
  document.getElementById('convResult').textContent = `${amount} ${from} = ${result.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${to}`;
}

// ============================================================
// CRYPTO PAGE
// ============================================================

function renderCryptoPage() {
  const crypto = dashboardData.crypto;
  if (!crypto) return;
  const el = document.getElementById('cryptoGrid');
  el.innerHTML = Object.entries(crypto).map(([name, data]) => {
    const change = data.usd_24h_change || 0;
    const dir = change >= 0 ? 'up' : 'down';
    const price = data.usd > 100 ? `$${data.usd.toLocaleString()}` : `$${data.usd.toFixed(4)}`;
    const mcap = data.usd_market_cap ? `$${(data.usd_market_cap / 1e9).toFixed(1)}B` : '';
    return `
      <div class="crypto-card">
        <div class="crypto-name">${name}</div>
        <div class="crypto-price">${price}</div>
        <div class="crypto-change ${dir}">${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%</div>
        ${mcap ? `<div class="news-meta">Market Cap: ${mcap}</div>` : ''}
      </div>
    `;
  }).join('');
}

// ============================================================
// POMODORO TIMER
// ============================================================

function toggleTimer() {
  if (timerRunning) {
    clearInterval(timerInterval);
    timerRunning = false;
    document.getElementById('timerStart').textContent = 'Start';
  } else {
    timerRunning = true;
    document.getElementById('timerStart').textContent = 'Pause';
    timerInterval = setInterval(() => {
      timerSeconds--;
      if (timerSeconds <= 0) {
        clearInterval(timerInterval);
        timerRunning = false;
        sessions++;
        document.getElementById('sessionCount').textContent = sessions;
        document.getElementById('timerStart').textContent = 'Start';
        timerSeconds = 25 * 60;
        toast('Pomodoro complete! Take a break.');
      }
      updateTimerDisplay();
    }, 1000);
  }
}

function resetTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  timerSeconds = 25 * 60;
  document.getElementById('timerStart').textContent = 'Start';
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const min = Math.floor(timerSeconds / 60).toString().padStart(2, '0');
  const sec = (timerSeconds % 60).toString().padStart(2, '0');
  document.getElementById('timerDisplay').textContent = `${min}:${sec}`;
}

// ============================================================
// QUICK CALC
// ============================================================

function quickCalc() {
  const input = document.getElementById('calcInput').value;
  try {
    const result = Function('"use strict"; return (' + input + ')')();
    document.getElementById('calcResult').textContent = `= ${result}`;
  } catch {
    document.getElementById('calcResult').textContent = 'Invalid expression';
  }
}

// ============================================================
// NAVIGATION
// ============================================================

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.section));
  });

  document.querySelectorAll('.see-all').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.section));
  });

  document.querySelectorAll('#newsTabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#newsTabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadNews(tab.dataset.topic);
    });
  });

  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

function navigateTo(section) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-item[data-section="${section}"]`);
  if (navBtn) navBtn.classList.add('active');

  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(`section-${section}`).classList.add('active');

  if (section === 'news') loadNews('world');
  if (section === 'stocks') loadStocksSection();
  if (section === 'crypto') renderCryptoPage();

  document.getElementById('sidebar').classList.remove('open');
}

// ============================================================
// UTILS
// ============================================================

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffH = Math.floor((now - d) / 3600000);
    if (diffH < 1) return 'Just now';
    if (diffH < 24) return `${diffH}h ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return dateStr.slice(0, 16);
  }
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}
