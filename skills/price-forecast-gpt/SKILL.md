---
name: price-forecast-gpt
display_name: 가격예측 프로젝트
description: Petrochemical price forecasting dashboard, model, backtest, admin workflow, capture/share and Android APK maintenance skill.
version: 1.1
updated: 2026-11-04
triggers:
  - 가격예측 업데이트해
  - 가격예측업데이트해
  - 가격예측 업데이트해줘
  - 가격 예측 업데이트해
  - 가격업데이트해
  - 가격 업데이트해
  - /가격예측업데이트
  - 가격예측 스킬
  - Price Forecast GPT
  - 가격예측 프로젝트
  - PETROCHEM FORECAST ENGINE
---

# 가격예측 프로젝트 스킬

## 1. 목적
석유화학 및 원료 가격의 기술적·통계적 전망을 생성하고, 웹 대시보드·관리자 입력·백테스트·캡쳐 공유·Android APK까지 일관되게 유지한다.

핵심 원칙:
- 현재가, 기술적 추세, 앙상블 예측을 서로 구분한다.
- 상승/하락 확률은 방향 확률이며 특정 목표가격 도달확률과 동일하게 취급하지 않는다.
- Technical State와 Forecast Bias가 다를 수 있으며, 이 경우 반드시 전망 해설에서 이유를 설명한다.
- Backtest는 과거 재현 성능 검증이며 미래 적중확률이 아니다.
- UI는 PlattsAI 계열의 딥네이비 리서치 대시보드 스타일을 유지한다.
- 모바일, Galaxy S, Fold 7/8 커버·펼침 화면을 우선 고려한다.

## 2. 저장소 및 배포
- GitHub: jskimlam/Price-Forecast-GPT
- Pages: https://jskimlam.github.io/Price-Forecast-GPT/
- Forecast workflow: .github/workflows/forecast.yml
- Android workflow: .github/workflows/build-android-apk.yml
- Android package: com.jskim.petrochemforecast
- App name: Petrochem Forecast
- APK는 GitHub Pages를 감싸는 경량 WebView 구조이며 웹 UI 수정은 기존 APK에도 자동 반영된다.
- Android PNG 저장/공유는 JavaScript ↔ AndroidBridge 네이티브 브리지로 처리한다.

절대 저장하지 말 것:
- GitHub PAT
- Apps Script API key
- 세션 비밀키
- 기타 인증 토큰/비밀번호

## 3. 데이터 구조
Google Sheet DB:
- prices
- variables
- targets
- forecast_history
- actual_vs_forecast
- model_score
- settings

주요 타깃:
- NMCL001 WTI NYMEX
- PAAAD00 Naphtha CFR Japan
- AAMFI00 Styrene CFR China
- AAOTM00 Ethylene CFR NE Asia
- PHASM05 Benzene FOB Korea
- AAWWK00 Propylene CFR China
- PHAOO00 ACN CFR FE Asia Weekly
- AAWWL00 Butadiene CFR China
- PHBIF00 PP Injection CFR FE Asia
- PHAIL00 PS GP CFR China Weekly
- PHAIR00 HIPS CFR China Weekly
- PHAHF00 ABS Injection CFR China Weekly

가격이 새로 평가되지 않은 Driver는 마지막 관측값을 forward-fill할 수 있으나, staleness/unchanged 비중을 신뢰도에 반영한다. 선형보간으로 새 가격을 만들어내지 않는다.

## 4. 예측 엔진
주요 파일:
- src/forecast_engine.py
- src/chart_data.py
- src/backtest.py

기간:
- Daily: 1D / 3D / 5D / 10D / 20D
- Weekly: 1W / 2W / 4W / 8W

앙상블 구성:
- Trend
- Momentum
- Mean Reversion
- Drivers

Driver는 lagged correlation/impact 기반이며 인과관계로 표현하지 않는다.

Forecast 중심가격은 이동평균선 단순 연장이 아니라 다음 구조의 앙상블 결과다:
현재가 → Trend + Momentum + Mean Reversion + Driver 가중점수 → 변동성/기간 반영 → 기간별 중심가격 및 80% 범위.

Regime별 가중치는 forecast_engine.py를 단일 진실원천으로 사용한다.

## 5. Technical State
기술상태는 별도로 계산한다.
주요 입력:
- 가격 vs MA5
- MA5 vs MA20
- MA20 vs MA60
- MA60 vs MA120
- RSI(14)
- MACD Histogram
- Bollinger 위치

Technical score:
- 내부 -1~+1
- UI에서는 -100~+100으로 표시
- BULLISH / NEUTRAL / BEARISH 판정

중요:
Technical State는 "현재 추세 상태"이고 Forecast Score는 "앞으로의 기대경로"다.
둘이 충돌하면 이를 숨기지 말고 전망 해설에서 원인을 설명한다.

예:
- 기술 BEARISH
- Mean Reversion 강한 플러스
- Forecast NEUTRAL 또는 소폭 상승
→ "약세 추세 속 평균회귀 반등 시도"
→ 상승 추세 전환으로 표현하지 않는다.

## 6. Forecast Score Board
기존 Technical Signal Board + Model Contribution은 사용하지 않는다.
통합된 Forecast Score Board를 사용한다.

표시:
1. 기술 추세 점수: -100~+100
2. 종합 예측 점수: -100~+100
3. Trend 기여도
4. Momentum 기여도
5. Mean Reversion 기여도
6. Drivers 기여도
7. 신호 일치/차이 여부
8. 최종 해석 문구

색상 원칙:
- 상승/양의 방향: 빨강
- 하락/음의 방향: 파랑
- 중립: 회색/슬레이트

## 7. 전망 해설
전망 해설은 숫자 나열이 아니라 판단 이유를 설명한다.

필수 구조:
- 한 줄 최종 해석
- 현재 기술상태
- 모델 전망
- 기술상태와 모델전망이 다를 경우 충돌 이유
- 상승 확인 조건
- 하락 지속 / 반등 무효 조건
- 핵심 Driver
- 데이터 신뢰도 / staleness / 동일가 비중
- 가격 시나리오 Base / Bull / Bear
- 상승 근거 / 하락·리스크 근거

예측과 기술상태가 충돌할 때:
- BEARISH + 중심가격 상승 → "기술 약세 · 평균회귀 반등 시도"
- BULLISH + 중심가격 하락 → "상승 추세 · 단기 조정 가능"

## 8. 가격 차트
메인 차트:
- Actual
- MA5 / MA20 / MA60 / MA120
- Bollinger Band
- Forecast center
- 80% forecast fan
- Resistance / Support
- Forecast split marker

예측가격 표는 그래프를 가리지 않는다.
반드시 차트 박스 맨 아래 별도 정보영역에 배치한다.

예측가격 색:
- Forecast > Current → 빨강
- Forecast < Current → 파랑
- Forecast == Current → 회색
Android WebView에서도 확실히 적용되도록 필요 시 inline color 사용.

상단 범례는 모바일에서도 읽기 쉽게 충분한 폰트/선 샘플 크기를 유지한다.

## 9. RSI / MACD
RSI:
- 70 이상 과열
- 30 이하 과매도
- 중립 구간을 시각적으로 구분

MACD:
- MACD / Signal / Histogram
- 상승전환 / 하락전환 / 하락약화 / 상승약화 등의 해석 문구 제공
- 단순 색상만 보여주지 말고 의미 설명을 함께 표시

## 10. Backtest Track Record
역할:
현재 방향을 예측하는 보드가 아니라 모델 품질검사 보드다.
과거 각 시점으로 돌아가 당시 데이터만으로 모델을 다시 실행하고 이후 실제값과 비교하는 walk-forward 검증이다.

Daily:
- 기본 검증 horizon 5D
- ±0.5% 이내를 보합으로 판정

Weekly:
- 기본 검증 horizon 2W
- ±1.0% 이내를 보합으로 판정

지표:
- Direction Accuracy: 과거 상승/보합/하락 방향 적중률. 미래 적중확률이 아님.
- Model Skill: Direction Accuracy + MAE + Brier 기반 내부 0~100 성능점수. 확률이 아님.
- MAE: 예상 중심가격과 실제가격 평균 절대오차율. 낮을수록 좋음.
- Samples: walk-forward 검증 사례 수.

표본 경고:
- <8: 검증 부족 / 강한 경고
- 8~14: 참고 수준
- 충분한 표본에서도 과거 성능은 미래를 보장하지 않음

Backtest 카드에는 반드시:
- "이 보드가 하는 일"
- 현재 검증상태
- 지표별 뜻
- 미래 적중확률이 아니라는 경고
를 표시한다.

## 11. Procurement Signal
Forecast 확률과 기술·Driver 신호를 구매 의사결정 관점에서 요약한다.
강한 표현은 신뢰도/표본이 충분할 때만 사용한다.

기술 BEARISH + 평균회귀 반등 시도처럼 신호 충돌 시:
- "반등 확인 후 분할 대응" 등 보수적 행동 문구 사용
- 이를 강한 상승전망/선매입 신호로 과장하지 않는다.

## 12. 캡쳐 모드
선택 품목별 공유용 화이트 리서치 카드 제공.

버튼:
- PNG 저장
- 공유
- 닫기

공유카드:
- 1080px 폭 고해상도
- 품목명 / 시장
- 종가 / 등락
- 단기·중기 전망
- 상승/보합/하락 확률바
- 기대 종가 / 80% 범위
- 최근 40봉 미니차트
- 가격대별 종가 확률 근사
- 기술요약
- 전망 해설
- 생성정보
- Produced by JS Kim with GPT

앱에서는 PNG 저장을 Pictures/PetrochemForecast에 저장하고 Android 공유창을 사용한다.

## 13. UI 원칙
- Deep navy shell
- White chart/analysis canvas
- Research-note / broker dashboard feel
- 과도한 장식보다 정보 밀도와 가독성 우선
- Desktop / Galaxy S / Fold cover / Fold unfolded 모두 반응형
- 모바일에서는 카드 압축보다 가로 스크롤이 더 읽기 좋으면 가로 스크롤 사용
- 오른쪽 패널 권장 순서:
  1. Procurement Signal
  2. Forecast Score Board
  3. 전망 해설
  4. Leading Drivers
  5. Backtest Track Record

## 14. Admin 입력 흐름
Admin에서 날짜와 가격 입력:
Admin → prices sheet → GitHub workflow dispatch → forecast rebuild → Pages deploy.

가능하면 새로 평가된 타깃과 핵심 Driver를 함께 입력한다.
타깃만 입력해도 기존 Driver last-known value를 사용할 수 있으나 staleness가 신뢰도에 반영된다.

## 15. 배포·수정 체크리스트
코드 수정 후 반드시:
1. templates/technical_dashboard.js 문법 검사
2. Forecast build 성공 확인
3. GitHub Pages deploy 성공 확인
4. Android 관련 변경이면 APK workflow 성공 확인
5. 모바일/Fold 레이아웃 확인
6. 웹과 APK의 색상·텍스트가 동일한지 확인
7. 기존 기능(캡쳐/공유/Admin 링크)이 깨지지 않았는지 확인

완료라고 말하기 전에 workflow success를 확인한다.

## 16. 사용자 요청 처리 규칙
사용자가 "가격예측 스킬로 수정" 또는 "가격예측 프로젝트 이어서"라고 하면:
- 먼저 현재 저장소 최신 상태를 확인한다.
- 이 SKILL.md를 작업 기준으로 사용한다.
- 현재 대시보드 구조와 모델 의미를 보존한다.
- 사용자가 UI 수정만 요청하면 모델 산식을 임의로 바꾸지 않는다.
- 사용자가 모델 판정 문제를 지적하면 시각적 설명 문제인지 산식 문제인지 먼저 분리해 검토한다.
- 모델 결과와 기술적 상태가 충돌해도 숨기지 않는다.
- 확률, 적중률, Backtest 성적을 서로 혼동하지 않는다.

## 17. 현재 보류된 모델 설계 이슈
기술 BEARISH인데 Mean Reversion 때문에 중심가격이 소폭 상승할 수 있다.
현재는 이를 "약세 추세 속 평균회귀 반등 시도"로 해설한다.

향후 사용자가 요청하면 검토할 수 있는 옵션:
- BEARISH 상태에서 반전 확인 전 Base Forecast 상승폭 제한
- Mean Reversion을 Base가 아니라 Rebound Scenario로 분리
- RSI/MACD/MA5 회복을 반전 확인 조건으로 사용

이 규칙은 아직 강제 적용된 모델 제약이 아니므로 사용자 승인 없이 산식을 바꾸지 않는다.

## 18. 데일리 가격 업데이트 전용 실행 규약 (2026-11-04 추가)

### 18.1. 호출 규칙 / 새 채팅
다음 요청은 사용자의 **Price-Forecast-GPT 가격 반영 작업 지시**로 해석한다:
- "가격예측 업데이트해", "가격예측업데이트해", "가격예측 업데이트해줘", "가격 예측 업데이트해"
- "가격업데이트해", "가격 업데이트해" (석유화학·WTI 가격표 또는 프로젝트 맥락이 있을 때)
- "/가격예측업데이트" (문서상 별칭; ChatGPT 앱의 내장 슬래시 명령어로 등록됐다는 의미는 아님)

이 지시는 **질문에 대한 가격 전망을 쓰는 것**이 아니라, 실제 연결된 원본 DB와 GitHub를 읽고 필요한 변경·검증·배포를 수행하는 작업이다. 프로젝트 상태를 반드시 신규 조회한다. 예전 채팅에서의 최신일·값·SHA·실행 상태를 신뢰하지 않는다. 새 가격표가 제공되지 않았으면 우선 연결된 원본 DB가 예측 배포 기준일보다 최신인지 점검하고, 미반영된 확정 데이터가 있을 때만 배포한다. 확정 가격 없이 가상의 숫자를 생성하지 않는다.

스킬 파일은 GitHub에 저장된 **운영 지침**이지 ChatGPT 계정에 전역 설치된 자동 명령어가 아니다. 새 대화에서 이 저장소·스킬을 조회할 수 있는 연결/권한이 필요하다. 연결이 없으면 실행된 척하지 않는다.

### 18.2. 대상 시스템과 데이터 흐름
1. 비공개 원본: 연결된 Google Sheets `Price-Forecast-GPT_DB` → `prices` (메타데이터 1~5행, 6행부터 날짜 역순).
2. WTI터미널: `jskimlam/WTI-Research-Terminal` → `data/wti-settlement.csv` (`date,settlement_usd_bbl`, 날짜 오름차순).
3. 예측 엔진: `jskimlam/Price-Forecast-GPT` → `data/refresh-request.json` 메타데이터 변경 → `.github/workflows/forecast.yml` → GitHub Pages.
4. 확인 사이트: https://jskimlam.github.io/WTI-Research-Terminal/ 및 https://jskimlam.github.io/Price-Forecast-GPT/

**비공개 Google Sheets ID, API 키, 토큰, Platts/ICIS 원시 31열 가격, 상용 시계열을 공개 GitHub 문서·마커·로그에 복제하지 않는다.** 가격 입력은 비공개 Google Sheets에서만 한다. 공개 WTI CSV는 사용자가 공개 게시를 승인할 권리가 있는 종가 자료만 반영한다.

### 18.3. 31열 코드 순서 (A열은 AssessDate)
```text
B NMCL001   C PAAAD00   D AAMFL00   E PHACB00   F AAMFI00
G STYFC00   H AAOTU00   I AAOQP00   J AAIKW00   K AAOTM00
L PHASM05   M AAOAX00   N AAKYD00   O AAWWK00   P PHASO05
Q PHAOO00   R AAWWM00   S AAWWL00   T BTNEA00   U AAWWU00
V AAVCC00   W AAVCA00   X PCACG00   Y PHBIF00   Z PHAIL00
AA PHAIR00  AB PHAHF00  AC AAUNF04  AD PHAOI00  AE PHAOK00
AF PHAOM00
```
입력표의 지표명보다 **코드**를 우선하며 시트 1행의 실제 31개 헤더와 정합성을 대조한다. 사용자가 24개 열까지만 제공해도 나머지 지표를 0이나 전일가로 채우지 않는다. 공란·전각 공백·빈 평가값은 `null`/실제 빈 셀로 유지한다. 수치 단위를 USD/mt, USD/bbl, USC/lb, USC/gal, CNY/mt 등 **해당 코드 원단위 그대로** 보존하고 환산·반올림하지 않는다.

### 18.4. 단일 호출 작업 절차
1. **원본 확인:** Google Sheets 메타데이터로 실제 `prices` sheetId와 헤더를 얻고 최근 날짜·대상 셀을 읽는다. GitHub의 WTI CSV, 예측 마커의 SHA와 마지막 평가일도 읽는다. 누락 날짜·기존 중복·과거 보정 필요 여부를 판별한다.
2. **날짜 확인:** 표의 `AssessDate`를 사용한다. `#######` 같은 표시 오류는 날짜 미확정으로 간주한다. 사용자가 이미 언급한 일자·현재 평가 흐름으로 **유일하게 확인되는 경우에만** 추정 날짜를 명시하고, 그렇지 않으면 필요한 날짜 하나를 묻는다. 휴장일·발표일과 평가일을 혼동하지 않는다.
3. **가격 검증:** 각 행은 날짜+31 코드에 매핑. 동일 날짜가 있으면 중복 행 삽입 대신 누락·정정된 셀만 수정한다. 동일 값은 변경 생략. 이전 확정 이력과 타 품목 값 보존. 한 날짜의 전체 31코드를 입력 표와 **셀별 재조회 비교**한다.
4. **WTI:** `NMCL001`(NYMEX Light Sweet Crude Settlement Mo01)만 WTI터미널 CSV의 해당 거래일 가격으로 사용한다. `PCACG00`(WTI Cushing Mo01)는 **별도 지표**이며 차이를 임의로 강제로 같게 하지 않는다. 사용자 제공 `PCACG00`이 공란이면 빈칸 유지. 확정 종가가 바뀌면 CSV의 **그 날짜 한 행만 정정**, 미존재 최신일이면 한 행 추가. 월물 롤오버·장중 가격 혼동에 유의한다. CSV 정렬·중복 없음·기존 이력 보존·마지막 행을 검증한다.
5. **예측 트리거:** 비공개 DB 저장·재조회 검증이 끝난 **뒤** `data/refresh-request.json`의 `request_id`를 새 값으로, `as_of_date`, `source_rows`, 실제 신규/정정 평가 건수와 미평가 코드 등 **메타데이터만** 갱신하여 푸시한다. 이 파일 변경은 `forecast.yml`을 실행한다. 모델의 수식이나 UI는 가격 입력만으로 임의 변경하지 않는다.
6. **배포 검증:** WTI터미널과 예측모델 GitHub Actions를 각각 확인. 커밋 SHA에 대응하는 실행의 `status=completed` + `conclusion=success`, build·Pages deploy 성공을 구분한다. 예측 로그의 `Source assessment rows: ... latest: YYYY-MM-DD`가 목표 날짜인지 확인. 이력이 같고 변동이 없으면 쓸데없는 재배포는 생략한다.
7. **사용자 보고:** (a) 적용 날짜 (b) 입력·정정 건수/미평가 건수 (c) WTI 종가 및 별도 Cushing 평가 여부 (d) DB/WTI/예측모델 각각 성공 여부 (e) 사이트 및 Actions 링크 (f) 부분 실패/보정 예정값을 짧게 정리한다. 재조회 및 배포 성공 없이 "완료"라고 말하지 않는다.

### 18.5. 실패·충돌 대응
- Google Sheets 일부 항목 저장 실패 시 **그 셀을 정확히 명시**한다. 입력값을 누락·직전가·추정가로 대체하거나 검증 성공이라 표시하지 않는다. 데이터 불완전 상태에서 예측모델 재계산은 원칙적으로 보류하고, 사용자가 부분 반영을 명시적으로 원하는 경우에만 제한사항을 밝혀 실행한다.
- 원본 DB와 WTI CSV가 충돌하거나 최신 날짜가 다르면 두 저장소를 다시 읽고 **원본 데이터 우선**, 추정 합치기 금지. 다른 작업자가 최신 자료를 반영했을 수 있으므로 새 날짜를 무조건 삽입하지 않는다.
- 연결 안전 검사, 인증, SHA 충돌, Pages 작업 실패 시 안전 검사를 우회하지 않는다. 성공한 단계·미완료 단계를 나눠 보고하고, 일관성 회복 가능한 정상 경로만 사용한다.
- 이 스킬을 **읽는 것**, `SKILL.md`를 수정하는 것만으로 일일 자동 실행이 설정되지 않는다. 사용자의 명시적 요청 시 해당 대화에서 수행한다.
