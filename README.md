# Price-Forecast-GPT

**PETROCHEM FORECAST ENGINE** — 27개 석유화학·에너지·운임 지표를 Driver로 활용해 12개 Target 가격을 멀티기간으로 예측하는 구매 의사결정 대시보드입니다.

## Forecast Targets

NMCL001 WTI · PAAAD00 Naphtha · AAMFI00 SM CFR China · AAOTM00 Ethylene · PHASM05 Benzene · AAWWK00 Propylene · PHAOO00 ACN · BTNEA00 Butadiene NEA · PHBIF00 PP · PHAIL00 PS · PHAIR00 HIPS · PHAHF00 ABS

## Architecture

`Private Google Sheet` → `Apps Script private API` → `GitHub Actions forecast.yml` → `Ensemble Forecast + Walk-forward Backtest` → `GitHub Pages`

Licensed historical prices remain in the private Google Sheet and are not committed to this public repository.

## Forecast Engine v1.1

- Multi-horizon forecasts
  - Daily targets: 1D / 3D / 5D / 10D / 20D
  - Weekly targets: 1W / 2W / 4W / 8W
- Trend / moving-average state
- Momentum
- Bollinger + RSI mean reversion
- Lagged cross-commodity driver linkage
- Assessment staleness penalty
- Regime-aware ensemble weights
- Up / Flat / Down probabilities and 80% bands
- Procurement signal
- Walk-forward no-lookahead backtest
- Direction accuracy / MAE / Brier / model skill
- Forecast history + model score writeback to Google Sheet

## Live Apps Script

Admin console and private data API are served by the bound Apps Script deployment.

The public workflow stores only the Apps Script URL. The private `DATA_API_KEY` must be stored as a GitHub Actions secret.

## GitHub Secret required

Repository → **Settings → Secrets and variables → Actions → New repository secret**

- Name: `APPS_SCRIPT_API_KEY`
- Value: Apps Script Script Property `DATA_API_KEY`

Do not commit this value into the repository.

## GitHub Pages

Repository → **Settings → Pages → Build and deployment → Source: GitHub Actions**

Then run **Actions → forecast → Run workflow** once.

The same workflow is also dispatched automatically by the Apps Script Admin console after **저장 + 예측**.

## Admin

The dashboard `/admin.html` route redirects to the deployed Apps Script Admin console.

## Data rules

- Google Sheet `prices` rows 1–5 are metadata.
- Actual observations begin on row 6.
- Missing values remain missing; they are never zero-filled.
- Weekly assessments are modeled on observed assessment bars.
- Driver signals use lagged information to avoid look-ahead leakage.
- Repeated assessments and stale prices are modeled explicitly through freshness penalties.

> Forecasts are probabilistic decision-support estimates and are not guaranteed future prices.
