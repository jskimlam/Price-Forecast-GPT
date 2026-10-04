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
    payload["generatedBy"]="Price-Forecast-GPT Ensemble v1.2"
    return payload
