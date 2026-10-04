---
name: price-forecast-gpt
display_name: 가격예측 프로젝트
description: Petrochemical price forecasting dashboard, model, backtest, admin workflow, capture/share and Android APK maintenance skill.
version: 1.0
updated: 2026-10-04
triggers:
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
- BTNEA00 Butadiene CFR NE Asia
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
