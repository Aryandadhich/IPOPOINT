# IPOPoint

India's IPO discovery and tracking platform — live GMP, allotment dates, and a personal multi-account IPO tracker.

---

## Features

- **Live IPO cards** — Open, Upcoming, Top GMP, Allotted tabs (data from InvestorGain.com)
- **GMP sidebar** — top 5 IPOs ranked by Grey Market Premium
- **Search & Track** — add any IPO to your personal tracker in one click
- **Multi-account tracker** — track 3 demat accounts (S/A/R), allotment status per account
- **Auto listing gain** — calculated automatically when you enter listing price
- **P&L dashboard** — total gain/loss, win rate, allotment stats
- **Excel export** — download your full tracker as .xlsx
- **Auth** — JWT-based register/login, bcrypt passwords, 7-day sessions
- **Dark / Light theme** — persists in localStorage

---

## Local Development

### 1. Clone

```bash
git clone https://github.com/Aryandadhich/IPOPOINT.git
cd IPOPOINT
```

### 2. Install dependencies

```bash
cd webapp
pip install -r requirements.txt
```

### 3. Set up environment

```bash
cp .env.example .env
# Edit .env and set a strong SECRET_KEY
```

### 4. Run

```bash
python app.py
```

App runs at **http://localhost:5000**

Or with Flask CLI:

```bash
cd webapp
flask run --port 5000
```

---

## Production Deploy (Render.com)

1. Connect your GitHub repo to [Render.com](https://render.com)
2. Set **Root Directory** to `webapp`
3. Set **Build Command**: `pip install -r requirements.txt`
4. Set **Start Command**: `gunicorn app:app`
5. Add environment variable: `SECRET_KEY` = (generate with `python -c "import secrets; print(secrets.token_hex(32))"`)

---

## Project Structure

```
webapp/
├── app.py              ← Flask backend (auth, scraper, all API routes)
├── requirements.txt    ← Python dependencies
├── Procfile            ← Render.com / Heroku start command
├── .env.example        ← Environment variable template (safe to commit)
└── templates/
    ├── index.html      ← Homepage (live IPOs, GMP, search)
    ├── login.html      ← Login page
    ├── register.html   ← Register page
    └── tracker.html    ← Personal IPO tracker (auth-gated)
```

---

## Security Notes

- `SECRET_KEY` must be set via environment variable in production — **never hardcode it**
- `webapp/.env` is in `.gitignore` — never commit it
- `webapp/ipo_data.db` is in `.gitignore` — SQLite DB is local only
- All tracker API routes require JWT authentication
- Each user only sees and can modify their own IPO data
- Security headers applied on every response (X-Frame-Options, HSTS, etc.)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, Flask |
| Auth | PyJWT, bcrypt |
| Scraping | Selenium + ChromeDriver |
| Database | SQLite (dev) / upgrade to PostgreSQL for prod |
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Deploy | Gunicorn + Render.com |

---

*Data sourced from InvestorGain.com · Not financial advice*
