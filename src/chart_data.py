from __future__ import annotations
import math
import numpy as np
import pandas as pd

def _num(v):
    return None if pd.isna(v) or not np.isfinite(v) else round(float(v), 4)

def _observed(df: pd.DataFrame, code: str) -> pd.Series:
    x=df[["AssessDate",code]].copy()
    x["AssessDate"]=pd.to_datetime(x["AssessDate"],errors="coerce")
    x[code]=pd.to_numeric(x[code],errors="coerce")
    x=x.dropna()
    x=x[x[code]>0].sort_values("AssessDate").drop_duplicates("AssessDate",keep="last")
    return x.set_index("AssessDate")[code]

def _rsi(s: pd.Series,n=14):
    d=s.diff()
    up=d.clip(lower=0).ewm(alpha=1/n,adjust=False).mean()
    dn=(-d.clip(upper=0)).ewm(alpha=1/n,adjust=False).mean()
    rs=up/dn.replace(0,np.nan)
    return 100-(100/(1+rs))

def _forecast_date(last_date,freq,bars):
    d=pd.Timestamp(last_date)
    if freq=="W":
        return str((d+pd.Timedelta(days=7*bars)).date())
    return str((d+pd.offsets.BDay(bars)).date())

def _technical_state(row):
    votes=[]
    p=row["price"]
    for key in ["ma5","ma20","ma60","ma120"]:
        v=row.get(key)
        if v is not None:
            votes.append(1 if p>v else -1)
    r=row.get("rsi")
    if r is not None:
        votes.append(1 if 50<r<70 else -1 if 30<r<50 else 0)
    mh=row.get("macdHist")
    if mh is not None:
        votes.append(1 if mh>0 else -1 if mh<0 else 0)
    bz=row.get("bbPos")
    if bz is not None:
        votes.append(1 if bz>0.55 else -1 if bz<0.45 else 0)
    score=sum(votes)/(len(votes) or 1)
    label="BULLISH" if score>=0.28 else "BEARISH" if score<=-0.28 else "NEUTRAL"
    return label,round(score,3)

def _level_above(last, candidates, fallback):
    vals=[float(v) for v in candidates if v is not None and np.isfinite(v) and float(v)>last]
    return min(vals) if vals else last*(1+fallback)

def _level_below(last, candidates, fallback):
    vals=[float(v) for v in candidates if v is not None and np.isfinite(v) and float(v)<last]
    return max(vals) if vals else last*(1-fallback)

def _fmt_price(v):
    if v is None or not np.isfinite(v):
        return "—"
    return f"{float(v):,.1f}" if abs(float(v))>=100 else f"{float(v):,.2f}"

def _build_outlook(item, frame, s):
    last=float(s.iloc[-1])
    latest=frame.iloc[-1]
    freq=item.get("freq","D")
    ref_bars=5 if freq=="D" else 2
    horizons=item.get("horizons",[])
    ref=min(horizons,key=lambda h:abs(int(h.get("bars",1))-ref_bars)) if horizons else None
    if not ref:
        return

    recent=s.tail(20 if freq=="D" else 13)
    recent_high=float(recent.max())
    recent_low=float(recent.min())
    vol=max(float(item.get("technicals",{}).get("volPct") or 0)/100,0.004)
    bb_u=_num(latest.get("bbUpper"))
    bb_l=_num(latest.get("bbLower"))
    ma20=_num(latest.get("ma20"))
    ma60=_num(latest.get("ma60"))

    resistance1=_level_above(last,[bb_u,recent_high],max(vol*1.2,0.008))
    support1=_level_below(last,[bb_l,recent_low],max(vol*1.2,0.008))
    bull_target=max(float(ref["hi80"]),resistance1)
    bear_target=min(float(ref["lo80"]),support1)
    base_target=float(ref["center"])

    item["scenarios"]={
        "reference":ref.get("label"),
        "base":{"target":round(base_target,4),"prob":round(float(ref.get("flat",0)),4)},
        "bull":{"trigger":round(resistance1,4),"target":round(bull_target,4),"prob":round(float(ref.get("up",0)),4)},
        "bear":{"trigger":round(support1,4),"target":round(bear_target,4),"prob":round(float(ref.get("down",0)),4)},
        "note":"확률은 방향 시나리오 확률이며 특정 목표가의 정확한 도달확률과 동일하지 않습니다."
    }

    positives=[]
    negatives=[]
    tech=item.get("technicals",{})
    rsi_v=latest.get("rsi")
    macd_h=latest.get("macdHist")
    bb_pos=latest.get("bbPos")
    ma5=latest.get("ma5")

    if ma5 is not None and ma20 is not None:
        (positives if last>ma5>ma20 else negatives).append(
            f"가격·MA5·MA20 배열 {'상향' if last>ma5>ma20 else '비우호'}"
        )
    if ma20 is not None and ma60 is not None:
        (positives if ma20>ma60 else negatives).append(
            f"MA20이 MA60 {'상회' if ma20>ma60 else '하회'}"
        )
    if rsi_v is not None:
        if 55<=rsi_v<70: positives.append(f"RSI {rsi_v:.1f} 상승 모멘텀")
        elif rsi_v>=70: negatives.append(f"RSI {rsi_v:.1f} 과열권")
        elif rsi_v<=30: positives.append(f"RSI {rsi_v:.1f} 과매도 반등 여지")
        elif rsi_v<45: negatives.append(f"RSI {rsi_v:.1f} 약세권")
    if macd_h is not None:
        (positives if macd_h>0 else negatives).append(
            f"MACD Histogram {'양(+)' if macd_h>0 else '음(-)'} {macd_h:+.2f}"
        )
    if bb_pos is not None:
        if bb_pos>=0.85: negatives.append(f"Bollinger 상단 근접 {bb_pos*100:.0f}%")
        elif bb_pos<=0.15: positives.append(f"Bollinger 하단권 {bb_pos*100:.0f}% 반등 여지")

    drivers=item.get("drivers") or []
    pos_drivers=[d for d in drivers if float(d.get("impact") or 0)>0][:2]
    neg_drivers=[d for d in drivers if float(d.get("impact") or 0)<0][:2]
    positives.extend([f"{d.get('label')} +{abs(float(d.get('impact'))):.3f}% 영향" for d in pos_drivers])
    negatives.extend([f"{d.get('label')} -{abs(float(d.get('impact'))):.3f}% 영향" for d in neg_drivers])

    if not positives: positives=["뚜렷한 추가 상승 요인은 제한적"]
    if not negatives: negatives=["뚜렷한 추가 하락 요인은 제한적"]

    dominant=max([("상승",float(ref.get("up",0))),("보합",float(ref.get("flat",0))),("하락",float(ref.get("down",0)))],key=lambda z:z[1])
    tech=(item.get("technicalState") or {}).get("label","NEUTRAL")
    bias=item.get("bias","NEUTRAL")
    if tech=="BEARISH" and base_target>last and bias=="NEUTRAL":
        interpretation="기술 약세 · 평균회귀 반등 시도"
        item["procurementSignal"]="반등 확인 후 분할 대응"
    elif tech=="BULLISH" and base_target<last and bias=="NEUTRAL":
        interpretation="상승 추세 · 단기 조정 가능"
    elif tech=="BULLISH" and base_target>=last:
        interpretation="상승 추세 지속"
    elif tech=="BEARISH" and base_target<=last:
        interpretation="하락 추세 지속"
    else:
        interpretation="혼조 · 방향 확인 필요"
    item["forecastInterpretation"]=interpretation
    summary=(
        f"{interpretation}. {ref.get('label')} 기준 예상 중심가격 {_fmt_price(base_target)}. "
        f"{dominant[0]} 확률 {dominant[1]*100:.0f}%가 가장 높습니다. "
        f"상단은 {_fmt_price(resistance1)} 돌파 여부, 하단은 {_fmt_price(support1)} 지지 여부가 핵심입니다."
    )
    contrib_map={str(v.get("name")):float(v.get("value") or 0) for v in (item.get("contributions") or [])}
    mr=contrib_map.get("Mean Reversion",0.0)
    mom=contrib_map.get("Momentum",0.0)
    trend_c=contrib_map.get("Trend",0.0)
    drv=contrib_map.get("Drivers",0.0)

    direction="상승" if base_target>last else "하락" if base_target<last else "보합"
    conflict=(tech=="BEARISH" and base_target>last) or (tech=="BULLISH" and base_target<last)

    if conflict and tech=="BEARISH":
        conflict_text=(
            f"기술적 추세는 BEARISH지만 중심가격은 {direction}으로 계산됐습니다. "
            f"이는 추세 기여 {trend_c:+.1f}, 모멘텀 {mom:+.1f}보다 평균회귀 {mr:+.1f}"
            f"{'와 Driver '+format(drv,'+.1f') if abs(drv)>=0.1 else ''}가 반등 방향으로 작동했기 때문입니다. "
            "따라서 이를 추세 상승으로 해석하지 않고 '약세 추세 속 반등 시도'로 봅니다."
        )
    elif conflict and tech=="BULLISH":
        conflict_text=(
            f"기술적 추세는 BULLISH지만 중심가격은 {direction}으로 계산됐습니다. "
            f"추세 기여 {trend_c:+.1f}에도 평균회귀 {mr:+.1f}, 모멘텀 {mom:+.1f}"
            f"{' 및 Driver '+format(drv,'+.1f') if abs(drv)>=0.1 else ''}가 단기 조정 방향으로 작동했습니다. "
            "따라서 이를 추세 하락 전환이 아니라 '상승 추세 속 조정 가능성'으로 해석합니다."
        )
    else:
        conflict_text=(
            f"기술상태 {tech}와 모델 중심경로가 대체로 같은 방향입니다. "
            f"Trend {trend_c:+.1f}, Momentum {mom:+.1f}, Mean Reversion {mr:+.1f}, Drivers {drv:+.1f}의 종합 결과입니다."
        )

    ma5_val=_num(latest.get("ma5"))
    macd_hist=_num(latest.get("macdHist"))
    if tech=="BEARISH":
        up_confirm=(
            f"상승 확인은 가격이 MA5 {_fmt_price(ma5_val)} 회복, MACD Histogram의 음(-) 폭 축소/양(+) 전환, "
            f"저항 {_fmt_price(resistance1)} 돌파가 순차적으로 확인될 때 신뢰도가 높아집니다."
        )
        down_confirm=(
            f"반대로 지지 {_fmt_price(support1)} 이탈과 MACD 약세 확대가 이어지면 현재 반등 시나리오는 무효화되고 "
            f"{_fmt_price(bear_target)} 영역의 하방 시나리오가 우세해집니다."
        )
    elif tech=="BULLISH":
        up_confirm=(
            f"상승 지속은 MA5 {_fmt_price(ma5_val)} 위 유지, MACD 양(+) 흐름 유지, "
            f"저항 {_fmt_price(resistance1)} 돌파 시 확인 강도가 높아집니다."
        )
        down_confirm=(
            f"가격이 지지 {_fmt_price(support1)} 아래로 밀리고 MACD가 약세 전환하면 "
            f"{_fmt_price(bear_target)} 영역까지 단기 조정 가능성을 봅니다."
        )
    else:
        up_confirm=(
            f"중립 구간에서는 MA5 {_fmt_price(ma5_val)} 회복과 저항 {_fmt_price(resistance1)} 돌파가 상승 확인 조건입니다."
        )
        down_confirm=(
            f"지지 {_fmt_price(support1)} 이탈과 MACD 약세 확대가 동시에 나타나면 하락 시나리오 우선순위가 높아집니다."
        )

    st=item.get("staleness") or {}
    unchanged=float(st.get("unchangedPct20") or 0)*100
    days=int(st.get("daysSinceAssessment") or 0)
    bt=item.get("backtest") or {}
    sample=int(bt.get("sampleCount") or 0)
    accuracy=bt.get("directionAccuracy")
    if sample>0 and accuracy is not None:
        bt_horizon="5D" if freq=="D" else "2W"
        reliability=(
            f"모델 신뢰도 {item.get('confidence',0)}%. 최근 동일가 비중 {unchanged:.0f}%, 평가 지연 {days}일. "
            f"과거 {bt_horizon} 방향 적중률은 {accuracy}% ({sample}개 워크포워드 표본)이며, 이는 다음 전망이 맞을 미래 확률을 뜻하지 않습니다."
        )
    else:
        reliability=(
            f"모델 신뢰도 {item.get('confidence',0)}%. 최근 동일가 비중 {unchanged:.0f}%, 평가 지연 {days}일. "
            "백테스트 표본이 충분하지 않으면 방향확률을 강한 확신으로 해석하지 않습니다."
        )

    top_drivers=sorted((item.get("drivers") or []), key=lambda d:abs(float(d.get("impact") or 0)), reverse=True)[:3]
    driver_text=" · ".join([
        f"{d.get('label')} {(float(d.get('impact') or 0)):+.3f}%"
        for d in top_drivers
    ]) or "유의미한 선행 Driver 신호 제한적"

    item["outlookExplanation"]={
        "summary":summary,
        "technicalView":f"{tech} · 기술 추세 {(item.get('technicalState') or {}).get('score',0)*100:+.1f} / 100",
        "modelView":f"{bias} · 종합 예측 {float(item.get('score') or 0)*100:+.1f} / 100 · {ref.get('label')} 중심가 {_fmt_price(base_target)} ({direction}) · 상승 {float(ref.get('up',0))*100:.0f}% / 보합 {float(ref.get('flat',0))*100:.0f}% / 하락 {float(ref.get('down',0))*100:.0f}%",
        "hasConflict":bool(conflict),
        "conflictExplanation":conflict_text,
        "upConfirmation":up_confirm,
        "downConfirmation":down_confirm,
        "driverSummary":driver_text,
        "reliability":reliability,
        "positiveFactors":positives[:4],
        "negativeFactors":negatives[:4],
        "levelComment":(
            f"저항 {_fmt_price(resistance1)} 돌파 시 {_fmt_price(bull_target)} 영역까지 상방 여지가 있고, "
            f"지지 {_fmt_price(support1)} 이탈 시 {_fmt_price(bear_target)} 영역까지 하방 리스크를 봅니다."
        )
    }

def attach_chart_data(payload,df,variables=None):
    work=df.copy()
    if "date" in work.columns and "AssessDate" not in work.columns:
        work=work.rename(columns={"date":"AssessDate"})
    work["AssessDate"]=pd.to_datetime(work["AssessDate"],errors="coerce")
    by_code={x.get("code"):x for x in (variables or payload.get("variables") or [])}

    for item in payload.get("items",[]):
        if item.get("error"):
            continue
        code=item["code"]
        if code not in work.columns:
            continue
        s=_observed(work,code)
        if len(s)<10:
            continue

        frame=pd.DataFrame({"price":s})
        for n in [5,20,60,120]:
            frame[f"ma{n}"]=s.rolling(n,min_periods=max(3,min(n,8))).mean()

        mid=s.rolling(20,min_periods=8).mean()
        sd=s.rolling(20,min_periods=8).std(ddof=0)
        frame["bbMid"]=mid
        frame["bbUpper"]=mid+2*sd
        frame["bbLower"]=mid-2*sd
        width=(frame["bbUpper"]-frame["bbLower"]).replace(0,np.nan)
        frame["bbPos"]=(s-frame["bbLower"])/width

        frame["rsi"]=_rsi(s,14)
        ema12=s.ewm(span=12,adjust=False).mean()
        ema26=s.ewm(span=26,adjust=False).mean()
        frame["macd"]=ema12-ema26
        frame["macdSignal"]=frame["macd"].ewm(span=9,adjust=False).mean()
        frame["macdHist"]=frame["macd"]-frame["macdSignal"]

        hist=[]
        for dt,row in frame.tail(320).iterrows():
            hist.append({
                "date":str(pd.Timestamp(dt).date()),
                "price":_num(row["price"]),
                "ma5":_num(row["ma5"]),
                "ma20":_num(row["ma20"]),
                "ma60":_num(row["ma60"]),
                "ma120":_num(row["ma120"]),
                "bbMid":_num(row["bbMid"]),
                "bbUpper":_num(row["bbUpper"]),
                "bbLower":_num(row["bbLower"]),
                "bbPos":_num(row["bbPos"]),
                "rsi":_num(row["rsi"]),
                "macd":_num(row["macd"]),
                "macdSignal":_num(row["macdSignal"]),
                "macdHist":_num(row["macdHist"]),
            })

        last=hist[-1]
        tech_label,tech_score=_technical_state(last)
        item["history"]=hist
        item["technicalState"]={"label":tech_label,"score":tech_score}
        freq=(by_code.get(code) or {}).get("freq",item.get("freq","D"))
        last_date=s.index[-1]
        for h in item.get("horizons",[]):
            h["date"]=_forecast_date(last_date,freq,int(h.get("bars",1)))

        item["technicals"].update({
            "ma5":last.get("ma5"),
            "ma120":last.get("ma120"),
            "macd":last.get("macd"),
            "macdSignal":last.get("macdSignal"),
            "macdHist":last.get("macdHist"),
            "bbUpper":last.get("bbUpper"),
            "bbLower":last.get("bbLower"),
        })
        _build_outlook(item,frame,s)
    payload["generatedBy"]="Price-Forecast-GPT Ensemble v1.3"
    return payload
