# Repository agent guidance

This repository maintains the public Petrochemical Forecast dashboard, but its price-source Google Sheet is private.

## Canonical skill and update commands

When a user, including in a newly started chat, writes any of:

- `가격예측업데이트해`
- `가격예측 업데이트해`
- `가격예측 업데이트해줘`
- `가격 예측 업데이트해`
- `가격업데이트해` or `가격 업데이트해` in the petrochemical/WTI project context
- `/가격예측업데이트`
- `/price` (price-assessment update alias)

read and follow **`skills/price-forecast-gpt/SKILL.md`**, especially section **18 (데일리 가격 업데이트 전용 실행 규약)**. The short alias is an instruction in this repository, **not** a registered global ChatGPT slash command.

The focused discovery shim at `.agents/skills/price-forecast-update/SKILL.md` also points to that canonical procedure. Prefer the full canonical skill for project-wide work.

## Source-of-truth flow

1. Check the connected private Google Sheet `Price-Forecast-GPT_DB` / `prices`, using real sheet metadata, column-code headers, latest assessment dates, and existing row values. If prices are already up to date, do not duplicate dates.
2. Verify all 31 market price codes and explicit blanks by code and assessment date; preserve older prices, avoid invented/backfilled assessments.
3. For user-approved public WTI daily settlement records, update `jskimlam/WTI-Research-Terminal/data/wti-settlement.csv` for `NMCL001` only, preserving dated history. `PCACG00` is a different code and must not be equated to `NMCL001`.
4. Only once the private Sheet data is verified, update `data/refresh-request.json` with metadata (never licensed raw Platts/ICIS data) to trigger `.github/workflows/forecast.yml`.
5. Check each GitHub Actions build/deployment job has completed successfully and the forecast build log shows the expected latest date before claiming the update is done.

Do not rewrite forecasting algorithms or UI for a price-only update. Never commit access tokens, private Sheet IDs, licensed price tables, or sensitive source feeds to the public repository.

This guidance makes the procedure easy for repository-aware agents to discover; it does not install a global ChatGPT skill or create an unattended automation.
