---
name: price-forecast-update
description: "가격예측업데이트해, 가격예측 업데이트해, 가격업데이트해: 비공개 석유화학 가격 DB의 날짜별 평가가격을 검증·반영하고 WTI터미널과 가격예측 대시보드를 재계산·배포하는 실무 스킬."
version: 1.2
updated: 2026-11-11
triggers:
  - 가격예측업데이트해
  - 가격예측 업데이트해
  - 가격예측 업데이트해줘
  - 가격 예측 업데이트해
  - 가격업데이트해
  - 가격 업데이트해
  - /가격예측업데이트
  - /price
---

# 가격예측 가격업데이트 스킬

> **Canonical source:** `skills/price-forecast-gpt/SKILL.md` in this repository, section **18. 데일리 가격 업데이트 전용 실행 규약**. Read that file *before any changes*. This small entry is for discoverability, not a second source of truth.

## User intent
If a user supplies a dated Platts/ICIS-style price table or says `/price` / `가격예측업데이트해` / `가격업데이트해` in the project context, interpret the request as an instruction to check the current private prices DB and perform the real forecast refresh, not simply summarize prices.

## Execution checklist
1. Read real source-of-truth state, do not reuse date, SHA, or data from old chats. Check the connected private `Price-Forecast-GPT_DB` / `prices`, actual code headers, dates and existing cells.
2. Align up to 31 assessed market codes; keep blank values **truly missing**. Never invent prices. Map dates and price corrections to their exact row/cell; prevent duplicate date entries. Preserve previous history.
3. Keep `NMCL001` NYMEX WTI and `PCACG00` WTI Cushing distinct. Update public WTI terminal CSV in `jskimlam/WTI-Research-Terminal` with confirmed/publication-eligible `NMCL001` only.
4. Re-read and validate the private Sheet. If a required assessed value fails to write, **report and normally stop before rebuilding** rather than silently forecasting with an incomplete row.
5. Change only metadata in `data/refresh-request.json` (no private licensed price content) to run `.github/workflows/forecast.yml`; preserve model and UI code.
6. Verify successful WTI deployment and forecast build + Pages deployment. Read forecast logs for the correct `latest: YYYY-MM-DD`. Report exact status with links and any incomplete cells.

## Scope and limits
- This is a GitHub-stored skill. It is **not** an automatically installed, account-wide ChatGPT command or a background schedule.
- Actions require GitHub and Google Drive connections and appropriate write permissions.
- Never put private Google Sheet IDs, secret tokens, Platts/ICIS proprietary multi-market history, or API keys into public git.
- For broader analysis, UI work, or debugging use the canonical skill, which has full model and UX rules.
