# Price-Forecast-GPT

**PETROCHEM FORECAST ENGINE** — 27개 석유화학/에너지/운임 지표를 Driver로 활용해, 노란색으로 지정된 12개 Target을 멀티기간으로 예측하는 구매 의사결정용 대시보드입니다.

## Forecast targets
NMCL001, PAAAD00, AAMFI00, AAOTM00, PHASM05, AAWWK00, PHAOO00, BTNEA00, PHBIF00, PHAIL00, PHAIR00, PHAHF00

## Private data architecture
- Historical licensed price data is **not stored in this public GitHub repository**.
- Native Google Sheet DB: `Price-Forecast-GPT DB`
- Coverage: 2020-01-02 ~ 2026-10-02
- Series: 27 market variables + AssessDate
- Tabs: `prices_raw`, `prices`, `variables`, `targets`, `forecast_history`, `actual_vs_forecast`, `model_score`, `settings`

## Architecture
`Private Google Sheet` → `Apps Script API` → `GitHub Actions` → `Ensemble Forecast` → `GitHub Pages`

Forecast v1 combines:
- Trend / moving-average state
- Momentum
- Bollinger/RSI mean reversion
- Lagged cross-commodity driver correlations
- Stale-assessment penalty
- Volatility/regime-aware weights
- Multi-horizon probability bands
- Procurement signal + confidence

## One-time setup
1. Open the **Price-Forecast-GPT DB** Google Sheet.
2. **Extensions → Apps Script**.
3. Paste the entire contents of `apps_script/Code.gs` into `Code.gs`.
4. In **Project Settings → Script properties**, add:
   - `ADMIN_PASSWORD` = password used by the Admin page
   - `READ_TOKEN` = long random token used only by GitHub Actions
   - `GITHUB_TOKEN` = fine-grained GitHub PAT for `Price-Forecast-GPT` with Actions write permission
   - `GITHUB_REPO` = `jskimlam/Price-Forecast-GPT`
5. Run `initialize()` once and approve Google permissions.
6. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Copy the deployed `/exec` URL.
8. GitHub repository → **Settings → Secrets and variables → Actions**:
   - `PF_GAS_URL` = Apps Script `/exec` URL
   - `PF_READ_TOKEN` = same value as Apps Script `READ_TOKEN`
9. GitHub repository → **Settings → Pages → Source: GitHub Actions**
10. Run **Actions → build-site → Run workflow** once.

## Daily operation
Use `/admin.html` on the deployed GitHub Pages site. Enter any of the 27 available market prices. Forecast Targets are highlighted in gold. Saving updates the Google Sheet and requests an immediate dashboard rebuild.

> Forecasts are probabilistic decision-support estimates and are not guaranteed future prices.
