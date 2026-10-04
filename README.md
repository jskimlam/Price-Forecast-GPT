# Price-Forecast-GPT

**PETROCHEM FORECAST ENGINE** — 27개 석유화학/에너지/운임 지표를 Driver로 활용해 노란색으로 지정된 12개 Target을 예측하는 구매 의사결정용 대시보드입니다.

## Forecast targets
NMCL001, PAAAD00, AAMFI00, AAOTM00, PHASM05, AAWWK00, PHAOO00, BTNEA00, PHBIF00, PHAIL00, PHAIR00, PHAHF00

## Data
- Historical baseline: `data/prices_2020.csv` … `data/prices_2026.csv`
- Coverage: 2020-01-02 ~ 2026-10-02
- Source columns: 27 Platts series + AssessDate
- Google Sheet live DB: Apps Script `setupWorkbook()`으로 baseline을 materialize한 뒤 Admin에서 추가/수정

## Architecture
`Google Sheet prices` → `Apps Script Web App` → `GitHub Actions` → `Ensemble Forecast` → `GitHub Pages`

Forecast v1 combines:
- Trend / moving-average state
- Momentum
- Bollinger/RSI mean reversion
- Lagged cross-commodity driver correlations
- Volatility/regime-aware weights
- Multi-horizon probability bands
- Procurement signal + confidence

## One-time setup
1. Google Sheet에서 **Extensions → Apps Script**
2. `apps_script/Code.gs` 전체를 붙여넣기
3. Script Properties에 `ADMIN_PASSWORD`, `READ_TOKEN`, `GITHUB_TOKEN`, `GITHUB_REPO=jskimlam/Price-Forecast-GPT` 설정
4. `setupWorkbook()` 1회 실행 → 과거 데이터 및 메타 탭 생성
5. Web app 새 배포: Execute as **Me**, access **Anyone**
6. GitHub repo secrets: `PF_GAS_URL`, `PF_READ_TOKEN`
7. Settings → Pages → Source = **GitHub Actions**
8. Actions → `build-site` → Run workflow

`admin.html`에서는 Web App URL을 브라우저에 한 번 저장하고 이후 가격을 입력합니다.

> Forecasts are probabilistic decision-support estimates and should not be treated as guaranteed prices.
