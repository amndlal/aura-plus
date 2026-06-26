# Aura+ — Personal Command Center

Live: https://amndlal.github.io/aura-plus

## Features
- News (World, Tech, Business, Sports, India, Germany, Entertainment, Science)
- Weather (Cologne, real-time)
- Crypto prices (Bitcoin, Ethereum, Solana, Dogecoin, Ripple)
- Currency converter
- Tasks (add, check off, delete)
- Notes (persistent)
- Bookmarks
- World clocks (Cologne, Delhi, New York, Tokyo)
- Pomodoro timer
- Calculator
- Quick links

## How to Run Locally

Just open `index.html` in any browser. No server needed.

```bash
# Option 1: Double-click index.html

# Option 2: From terminal
start index.html          # Windows
open index.html           # Mac
xdg-open index.html       # Linux
```

## How to Run on Another Computer

```bash
git clone https://github.com/amndlal/aura-plus.git
cd aura-plus
# Open index.html in browser — that's it
```

## How to Deploy (Free)

Already deployed on GitHub Pages. To redeploy elsewhere:

1. **GitHub Pages** — Settings → Pages → master branch → / (root)
2. **Netlify** — Drag the folder into netlify.com/drop
3. **Vercel** — Import from GitHub, auto-deploys

## Tech Stack
- HTML5 / CSS3 / Vanilla JavaScript
- No frameworks, no build tools, no dependencies
- APIs: Google News RSS, wttr.in, CoinGecko, Open Exchange Rates, ZenQuotes
- Storage: localStorage (tasks, notes, bookmarks persist per browser)

## File Structure
```
aura-plus/
├── index.html              ← Main page (open this)
├── static/
│   ├── css/style.css       ← All styling
│   └── js/app.js           ← All logic & API calls
├── templates/index.html    ← (legacy Flask template, not used)
├── app.py                  ← (legacy Flask backend, not needed)
└── README.md               ← This file
```
