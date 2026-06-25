/* ============================================================
   Aura+ — Frontend JavaScript
   SPA-like navigation, API calls, real-time updates
   ============================================================ */

let dashboardData = null;
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
// API
// ============================================================

async function api(path, options = {}) {
  try {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    return await res.json();
  } catch (e) {
    console.error('API error:', e);
    return null;
  }
}

// ============================================================
// DASHBOARD LOAD
// ============================================================

async function loadDashboard() {
  dashboardData = await api('/api/dashboard');
  if (!dashboardData) {
    toast('Failed to load dashboard');
    return;
  }
  renderGreeting();
  renderQuote();
  renderWeather();
  renderHomeNews();
  renderHomeCrypto();
  renderClocks();
  renderTasks();
  renderNotes();
  renderBookmarks();
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================

function renderGreeting() {
  const d = dashboardData;
  document.getElementById('greeting').textContent = `${d.greeting}, Aman`;
  document.getElementById('topDate').textContent = d.date;
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
  if (!w) return;
  const strip = document.getElementById('weatherStrip');
  strip.innerHTML = `
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
  `).join('');
}

function renderHomeNews() {
  const news = dashboardData.news;
  if (!news) return;
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
  const el = document.getElementById('clocks');
  el.innerHTML = Object.entries(clocks).map(([city, data]) => `
    <div class="clock-row">
      <span class="city">${city}</span>
      <span class="time">${data.time}</span>
    </div>
  `).join('');
}

function updateClocks() {
  if (dashboardData && dashboardData.clocks) {
    // Re-fetch just clocks on interval
    loadDashboard();
  }
}

// ============================================================
// NEWS
// ============================================================

async function loadNews(topic) {
  const news = await api(`/api/news/${topic}`);
  if (news) {
    renderNewsCards(news, document.getElementById('newsGrid'));
  }
}

async function searchNews() {
  const query = document.getElementById('globalSearch').value.trim();
  if (!query) return;
  navigateTo('news');
  const results = await api(`/api/news/search/${encodeURIComponent(query)}`);
  if (results) {
    renderNewsCards(results, document.getElementById('newsGrid'));
    // Deactivate all tabs
    document.querySelectorAll('#newsTabs .tab').forEach(t => t.classList.remove('active'));
  }
}

function setupSearch() {
  document.getElementById('globalSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchNews();
  });
}

// ============================================================
// TASKS
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

async function addTask() {
  const input = document.getElementById('taskInput');
  const text = input.value.trim();
  if (!text) return;
  const task = await api('/api/tasks', { method: 'POST', body: JSON.stringify({ text }) });
  if (task) {
    dashboardData.tasks.unshift(task);
    renderTasks();
    input.value = '';
    toast('Task added');
  }
}

async function toggleTask(id) {
  const task = dashboardData.tasks.find(t => t.id === id);
  if (!task) return;
  task.done = !task.done;
  await api(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ done: task.done }) });
  renderTasks();
}

async function deleteTask(id) {
  await api(`/api/tasks/${id}`, { method: 'DELETE' });
  dashboardData.tasks = dashboardData.tasks.filter(t => t.id !== id);
  renderTasks();
  toast('Task deleted');
}

// ============================================================
// NOTES
// ============================================================

function renderNotes() {
  const notes = dashboardData.notes || { content: '' };
  document.getElementById('notesArea').value = notes.content;
}

async function saveNotes() {
  const content = document.getElementById('notesArea').value;
  await api('/api/notes', { method: 'POST', body: JSON.stringify({ content }) });
  toast('Notes saved');
}

// ============================================================
// BOOKMARKS
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

async function addBookmark() {
  const title = document.getElementById('bmTitle').value.trim();
  const url = document.getElementById('bmUrl').value.trim();
  if (!title || !url) return;
  const bm = await api('/api/bookmarks', { method: 'POST', body: JSON.stringify({ title, url }) });
  if (bm) {
    dashboardData.bookmarks.push(bm);
    renderBookmarks();
    document.getElementById('bmTitle').value = '';
    document.getElementById('bmUrl').value = '';
    toast('Bookmark saved');
  }
}

async function deleteBookmark(id) {
  await api(`/api/bookmarks/${id}`, { method: 'DELETE' });
  dashboardData.bookmarks = dashboardData.bookmarks.filter(b => b.id !== id);
  renderBookmarks();
}

// ============================================================
// STOCKS
// ============================================================

let currentStockSymbol = null;
let stockChartCanvas = null;

async function loadStocksSection() {
  loadIndices();
  loadWatchlist();
  loadMovers();
  loadStockNews();
  setupStockSearch();
  setupChartControls();
}

async function loadIndices() {
  const data = await api('/api/stocks/indices');
  const el = document.getElementById('indicesGrid');
  if (!data || !data.length) {
    el.innerHTML = '<div class="loading">Market data unavailable</div>';
    return;
  }
  el.innerHTML = data.map(idx => {
    if (idx.error) return `<div class="index-card"><div class="index-name">${idx.name}</div><div class="index-price">—</div></div>`;
    const dir = idx.change >= 0 ? 'up' : 'down';
    const arrow = idx.change >= 0 ? '▲' : '▼';
    return `
      <div class="index-card ${dir}" onclick="openStockDetail('${idx.symbol}')">
        <div class="index-name">${idx.name}</div>
        <div class="index-price">${formatStockPrice(idx.price, idx.currency)}</div>
        <div class="index-change ${dir}">${arrow} ${Math.abs(idx.change).toFixed(2)} (${Math.abs(idx.changePct).toFixed(2)}%)</div>
      </div>
    `;
  }).join('');

  // Market status
  const status = document.getElementById('marketStatus');
  const states = data.filter(d => d.marketState);
  const usMarket = states.find(s => s.symbol === '^GSPC');
  const isOpen = usMarket && usMarket.marketState === 'REGULAR';
  status.innerHTML = `
    <div class="market-status-item"><div class="market-dot ${isOpen ? '' : 'closed'}"></div> US Market: ${isOpen ? 'Open' : 'Closed'}</div>
    ${data.filter(d => !d.error).slice(0, 4).map(d => {
      const dir = d.change >= 0 ? 'up' : 'down';
      return `<div class="market-status-item"><strong>${d.name}</strong> <span class="index-change ${dir}">${d.changePct >= 0 ? '+' : ''}${d.changePct.toFixed(2)}%</span></div>`;
    }).join('')}
  `;
}

async function loadWatchlist() {
  const symbols = await api('/api/stocks/watchlist');
  if (!symbols || !symbols.length) {
    document.getElementById('watchlistGrid').innerHTML = '<div class="loading">Add stocks to your watchlist using the search above</div>';
    return;
  }
  const el = document.getElementById('watchlistGrid');
  el.innerHTML = '<div class="loading">Loading watchlist...</div>';

  const results = [];
  for (const sym of symbols) {
    try {
      const data = await api(`/api/stocks/quote/${sym}`);
      if (data && !data.error) results.push(data);
    } catch {}
  }

  el.innerHTML = results.map(s => {
    const dir = s.change >= 0 ? 'up' : 'down';
    const arrow = s.change >= 0 ? '▲' : '▼';
    const chartPoints = s.chart ? generateMiniChartSVG(s.chart, dir) : '';
    return `
      <div class="watchlist-card" onclick="openStockDetail('${s.symbol}')">
        <button class="watchlist-remove" onclick="event.stopPropagation();removeFromWatchlist('${s.symbol}')">×</button>
        <div class="watchlist-symbol">${s.symbol}</div>
        <div class="watchlist-name">${s.name}</div>
        <div class="watchlist-price">${formatStockPrice(s.price, s.currency)}</div>
        <div class="watchlist-change ${dir}">${arrow} ${Math.abs(s.change).toFixed(2)} (${Math.abs(s.changePct).toFixed(2)}%)</div>
        ${chartPoints}
      </div>
    `;
  }).join('') || '<div class="loading">No watchlist data available</div>';
}

function generateMiniChartSVG(chartData, dir) {
  if (!chartData || chartData.length < 2) return '';
  const closes = chartData.map(d => d.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const w = 240;
  const h = 40;
  const points = closes.map((c, i) => {
    const x = (i / (closes.length - 1)) * w;
    const y = h - ((c - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  const color = dir === 'up' ? '#10b981' : '#ef4444';
  return `<svg class="mini-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"/></svg>`;
}

async function loadMovers() {
  const data = await api('/api/stocks/movers');
  if (!data) return;

  const renderList = (items, elId) => {
    const el = document.getElementById(elId);
    el.innerHTML = items.map(s => {
      const dir = s.changePct >= 0 ? 'up' : 'down';
      const arrow = s.changePct >= 0 ? '▲' : '▼';
      return `
        <div class="mover-item" onclick="openStockDetail('${s.symbol}')">
          <div>
            <div class="mover-symbol">${s.symbol.replace('.NS', '')}</div>
            <div class="mover-name">${s.name}</div>
          </div>
          <div>
            <div class="mover-price">${formatStockPrice(s.price, s.currency)}</div>
            <div class="mover-change ${dir}">${arrow} ${Math.abs(s.changePct).toFixed(2)}%</div>
          </div>
        </div>
      `;
    }).join('') || '<div class="loading">No data</div>';
  };

  renderList(data.gainers, 'gainersList');
  renderList(data.losers, 'losersList');
}

async function loadStockNews() {
  const news = await api('/api/news/stock market');
  if (news && news.length) {
    renderNewsCards(news.slice(0, 6), document.getElementById('stockNews'));
  }
}

async function openStockDetail(symbol) {
  currentStockSymbol = symbol;
  const detail = document.getElementById('stockDetail');
  detail.style.display = 'block';
  detail.scrollIntoView({ behavior: 'smooth' });

  const data = await api(`/api/stocks/quote/${symbol}`);
  if (!data || data.error) {
    document.getElementById('stockDetailHeader').innerHTML = `<h1>Could not load ${symbol}</h1>`;
    return;
  }

  const dir = data.change >= 0 ? 'up' : 'down';
  const arrow = data.change >= 0 ? '▲' : '▼';

  document.getElementById('stockDetailHeader').innerHTML = `
    <div class="stock-detail-left">
      <h1>${data.name}</h1>
      <span class="symbol-badge">${data.symbol} · ${data.exchange}</span>
    </div>
    <div class="stock-detail-right">
      <div class="stock-detail-price">${formatStockPrice(data.price, data.currency)}</div>
      <div class="stock-detail-change ${dir}">${arrow} ${Math.abs(data.change).toFixed(2)} (${Math.abs(data.changePct).toFixed(2)}%)</div>
    </div>
  `;

  document.getElementById('stockStats').innerHTML = `
    <div class="stat-item"><div class="stat-label">Day High</div><div class="stat-value">${data.dayHigh}</div></div>
    <div class="stat-item"><div class="stat-label">Day Low</div><div class="stat-value">${data.dayLow}</div></div>
    <div class="stat-item"><div class="stat-label">Prev Close</div><div class="stat-value">${data.prevClose}</div></div>
    <div class="stat-item"><div class="stat-label">Volume</div><div class="stat-value">${formatVolume(data.volume)}</div></div>
    <div class="stat-item"><div class="stat-label">52W High</div><div class="stat-value">${data.fiftyTwoWeekHigh}</div></div>
    <div class="stat-item"><div class="stat-label">52W Low</div><div class="stat-value">${data.fiftyTwoWeekLow}</div></div>
  `;

  loadStockChart(symbol, '1d', '5m');
}

async function loadStockChart(symbol, range, interval) {
  const chartData = await api(`/api/stocks/chart/${symbol}?range=${range}&interval=${interval}`);
  if (!chartData || !chartData.length) return;
  drawChart(chartData);
}

function drawChart(data) {
  const canvas = document.getElementById('stockChart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 280 * dpr;
  ctx.scale(dpr, dpr);
  canvas.style.height = '280px';

  const w = rect.width;
  const h = 280;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const closes = data.map(d => d.close);
  const min = Math.min(...closes) * 0.999;
  const max = Math.max(...closes) * 1.001;
  const range = max - min;

  const isUp = closes[closes.length - 1] >= closes[0];
  const lineColor = isUp ? '#10b981' : '#ef4444';
  const fillColor = isUp ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)';

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 0.5;
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + (chartH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();

    // Labels
    const val = max - (range / gridLines) * i;
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(val.toFixed(2), padding.left - 8, y + 4);
  }

  // Line path
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartW;
    const y = padding.top + (1 - (d.close - min) / range) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Fill area
  const lastX = padding.left + chartW;
  const baseY = padding.top + chartH;
  ctx.lineTo(lastX, baseY);
  ctx.lineTo(padding.left, baseY);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();

  // Current price line
  const lastClose = closes[closes.length - 1];
  const priceY = padding.top + (1 - (lastClose - min) / range) * chartH;
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, priceY);
  ctx.lineTo(w - padding.right, priceY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Price label
  ctx.fillStyle = lineColor;
  ctx.font = 'bold 12px Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(lastClose.toFixed(2), w - padding.right + 4, priceY + 4);
}

function setupChartControls() {
  document.querySelectorAll('.chart-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (currentStockSymbol) {
        loadStockChart(currentStockSymbol, btn.dataset.range, btn.dataset.interval);
      }
    });
  });
}

function setupStockSearch() {
  const input = document.getElementById('stockSearchInput');
  const results = document.getElementById('stockSearchResults');
  let timeout;

  input.addEventListener('input', () => {
    clearTimeout(timeout);
    const q = input.value.trim();
    if (q.length < 2) { results.classList.remove('show'); return; }
    timeout = setTimeout(async () => {
      const data = await api(`/api/stocks/search/${encodeURIComponent(q)}`);
      if (data && data.length) {
        results.innerHTML = data.map(s => `
          <div class="search-result-item" onclick="selectStock('${s.symbol}')">
            <div>
              <div class="search-result-symbol">${s.symbol}</div>
              <div class="search-result-name">${s.name}</div>
            </div>
            <div class="search-result-exchange">${s.exchange}</div>
          </div>
        `).join('');
        results.classList.add('show');
      } else {
        results.classList.remove('show');
      }
    }, 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchStocks();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.stock-search-container')) {
      results.classList.remove('show');
    }
  });
}

async function searchStocks() {
  const input = document.getElementById('stockSearchInput');
  const q = input.value.trim().toUpperCase();
  if (!q) return;
  document.getElementById('stockSearchResults').classList.remove('show');
  openStockDetail(q);
}

function selectStock(symbol) {
  document.getElementById('stockSearchInput').value = '';
  document.getElementById('stockSearchResults').classList.remove('show');
  openStockDetail(symbol);
}

async function addToWatchlist(symbol) {
  await api('/api/stocks/watchlist', { method: 'POST', body: JSON.stringify({ symbol }) });
  toast(`${symbol} added to watchlist`);
  loadWatchlist();
}

async function removeFromWatchlist(symbol) {
  await api(`/api/stocks/watchlist/${symbol}`, { method: 'DELETE' });
  toast(`${symbol} removed`);
  loadWatchlist();
}

async function refreshWatchlist() {
  document.getElementById('watchlistGrid').innerHTML = '<div class="loading">Refreshing...</div>';
  loadWatchlist();
}

function formatStockPrice(price, currency) {
  if (currency === 'INR') return `₹${price.toLocaleString('en-IN')}`;
  if (currency === 'EUR') return `€${price.toLocaleString()}`;
  if (currency === 'GBP') return `£${price.toLocaleString()}`;
  return `$${price.toLocaleString()}`;
}

function formatVolume(vol) {
  if (!vol) return '—';
  if (vol >= 1e9) return (vol / 1e9).toFixed(2) + 'B';
  if (vol >= 1e6) return (vol / 1e6).toFixed(2) + 'M';
  if (vol >= 1e3) return (vol / 1e3).toFixed(1) + 'K';
  return vol.toString();
}

// ============================================================
// CURRENCY CONVERTER
// ============================================================

async function convertCurrency() {
  const amount = document.getElementById('convAmount').value;
  const from = document.getElementById('convFrom').value;
  const to = document.getElementById('convTo').value;
  const result = await api(`/api/convert?amount=${amount}&from=${from}&to=${to}`);
  if (result) {
    document.getElementById('convResult').textContent = `${amount} ${from} = ${result.result.toLocaleString()} ${to}`;
  }
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
  // Sidebar nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.section));
  });

  // "See all" buttons
  document.querySelectorAll('.see-all').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.section));
  });

  // News tabs
  document.querySelectorAll('#newsTabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#newsTabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadNews(tab.dataset.topic);
    });
  });

  // Mobile menu toggle
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

function navigateTo(section) {
  // Update sidebar
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-section="${section}"]`).classList.add('active');

  // Update sections
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(`section-${section}`).classList.add('active');

  // Load section data
  if (section === 'news') loadNews('world');
  if (section === 'stocks') loadStocksSection();
  if (section === 'crypto') renderCryptoPage();

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
}

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
