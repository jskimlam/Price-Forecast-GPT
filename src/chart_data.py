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
    summary=(
        f"{ref.get('label')} 기준 예상 중심가격 {_fmt_price(base_target)}. "
        f"{dominant[0]} 확률 {dominant[1]*100:.0f}%가 가장 높습니다. "
        f"상단은 {_fmt_price(resistance1)} 돌파 여부, 하단은 {_fmt_price(support1)} 지지 여부가 핵심입니다."
    )
    item["outlookExplanation"]={
        "summary":summary,
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
