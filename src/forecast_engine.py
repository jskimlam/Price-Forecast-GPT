from __future__ import annotations
import json, math
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

HORIZONS = {
    "D": [("1D",1),("3D",3),("1W",5),("2W",10),("1M",20)],
    "W": [("1W",1),("2W",2),("1M",4),("2M",8),("3M",12)],
}

def norm_cdf(x):
    return 0.5*(1+math.erf(x/math.sqrt(2)))

def rsi(s: pd.Series, n=14):
    d=s.diff()
    up=d.clip(lower=0).ewm(alpha=1/n, adjust=False).mean()
    dn=(-d.clip(upper=0)).ewm(alpha=1/n, adjust=False).mean()
    rs=up/dn.replace(0,np.nan)
    return 100-(100/(1+rs))

def zclip(v, scale=1.0):
    if not np.isfinite(v): return 0.0
    return float(np.clip(v/scale, -2.5, 2.5)/2.5)

def load_variables():
    return json.loads((DATA/"variables.json").read_text(encoding="utf-8"))

def load_prices(path: Path|None=None):
    if path is not None:
        df=pd.read_csv(path)
    else:
        parts=sorted(DATA.glob("prices_20*.csv"))
        df=pd.concat([pd.read_csv(p) for p in parts], ignore_index=True)
    df["AssessDate"]=pd.to_datetime(df["AssessDate"])
    for c in df.columns[1:]:
        df[c]=pd.to_numeric(df[c], errors="coerce")
    return df.sort_values("AssessDate").drop_duplicates("AssessDate", keep="last").reset_index(drop=True)

def regime(series: pd.Series):
    s=series.dropna(); s=s[s>0]
    if len(s)<25: return "Insufficient"
    ret=np.log(s/s.shift(1)).dropna()
    v10=ret.tail(10).std(); v40=ret.tail(40).std() if len(ret)>=40 else ret.std()
    ma10=s.tail(10).mean(); ma30=s.tail(30).mean(); trend=(ma10/ma30-1) if ma30 else 0
    if v40 and v10>1.45*v40: return "High Volatility"
    if trend>0.025: return "Bull Trend"
    if trend<-0.025: return "Bear Trend"
    return "Range / Mean Reversion"

def technical_features(s: pd.Series):
    x=s.dropna(); x=x[x>0]
    if len(x)<30: raise ValueError("not enough history")
    ret=np.log(x/x.shift(1)).dropna()
    vol=max(float(ret.tail(min(40,len(ret))).std(ddof=1)),0.002)
    mom5=float(x.iloc[-1]/x.iloc[-6]-1) if len(x)>=6 else 0
    mom20=float(x.iloc[-1]/x.iloc[-21]-1) if len(x)>=21 else mom5
    ma10=float(x.tail(10).mean()); ma20=float(x.tail(20).mean()); ma60=float(x.tail(min(60,len(x))).mean())
    ma_gap=(ma10/ma20-1) if ma20 else 0; long_gap=(x.iloc[-1]/ma60-1) if ma60 else 0
    rr=float(rsi(x,14).iloc[-1]) if len(x)>15 else 50
    sd20=float(x.tail(20).std(ddof=0)); bb_z=(float(x.iloc[-1])-ma20)/(sd20 if sd20 else 1)
    slope=np.polyfit(np.arange(min(20,len(x))), x.tail(min(20,len(x))).to_numpy(),1)[0]/float(x.iloc[-1])
    momentum=0.45*zclip(mom5,vol*math.sqrt(5))+0.35*zclip(mom20,vol*math.sqrt(20))+0.20*zclip(ma_gap,vol*2)
    trend=0.55*zclip(slope,vol/8)+0.25*zclip(long_gap,vol*4)+0.20*zclip(ma_gap,vol*2)
    meanrev=-zclip(bb_z,1.6)*0.65-zclip((rr-50)/25,1)*0.35
    return {"vol":vol,"ma10":ma10,"ma20":ma20,"ma60":ma60,"rsi":rr,"bb_z":bb_z,
            "momentum_score":float(np.clip(momentum,-1,1)),"trend_score":float(np.clip(trend,-1,1)),
            "meanrev_score":float(np.clip(meanrev,-1,1))}

def driver_signal(df: pd.DataFrame, target: str, variables: list, lookback=260):
    work=df.set_index("AssessDate"); y=work[target].ffill().where(lambda z:z>0); yret=np.log(y/y.shift(1))
    candidates=[]
    for meta in variables:
        c=meta["code"]
        if c==target or c not in work: continue
        x=work[c].ffill().where(lambda z:z>0); xret=np.log(x/x.shift(1))
        corr=xret.shift(1).tail(lookback).corr(yret.tail(lookback))
        if corr is None or not np.isfinite(corr): continue
        last=float(xret.iloc[-1]) if np.isfinite(xret.iloc[-1]) else 0
        recent=x.tail(12); stale=float((recent.diff().fillna(0)==0).mean())
        strength=abs(corr)*(1-0.55*stale)
        candidates.append((strength,corr,last,c,meta["label"],stale))
    candidates=sorted(candidates,reverse=True)[:6]
    denom=sum(max(a,0.02) for a,*_ in candidates) or 1
    score=sum(max(a,0.02)*np.tanh((corr*last)/0.012) for a,corr,last,*_ in candidates)/denom
    drivers=[{"code":c,"label":label,"corr":round(float(corr),3),"lastReturnPct":round(last*100,2),
              "stalePct":round(stale*100,1),"impact":round(float(corr*last*100),3)}
             for _,corr,last,c,label,stale in candidates]
    return float(np.clip(score,-1,1)),drivers

def forecast_one(df,meta,variables):
    code=meta["code"]; s=df[code]; x=s.dropna(); f=technical_features(s); dscore,drivers=driver_signal(df,code,variables); reg=regime(s)
    if "Trend" in reg: w={"trend":0.35,"driver":0.30,"momentum":0.25,"meanrev":0.10}
    elif "High" in reg: w={"trend":0.22,"driver":0.33,"momentum":0.20,"meanrev":0.25}
    else: w={"trend":0.20,"driver":0.32,"momentum":0.18,"meanrev":0.30}
    score=float(np.clip(w["trend"]*f["trend_score"]+w["driver"]*dscore+w["momentum"]*f["momentum_score"]+w["meanrev"]*f["meanrev_score"],-1,1))
    last=float(x.iloc[-1]); last_date=str(df.loc[s.last_valid_index(),"AssessDate"].date()); horizons=[]
    for label,h in HORIZONS[meta["freq"]]:
        drift=score*f["vol"]*math.sqrt(h)*0.80; sd=max(f["vol"]*math.sqrt(h),0.003); flat=min(0.03,0.004+0.0025*math.sqrt(h))
        p_up=1-norm_cdf((math.log(1+flat)-drift)/sd); p_dn=norm_cdf((math.log(1-flat)-drift)/sd); p_flat=max(0,1-p_up-p_dn)
        center=last*math.exp(drift); lo=last*math.exp(drift-1.28*sd); hi=last*math.exp(drift+1.28*sd)
        horizons.append({"label":label,"bars":h,"center":round(center,4),"lo80":round(lo,4),"hi80":round(hi,4),
                         "up":round(p_up,4),"flat":round(p_flat,4),"down":round(p_dn,4)})
    h0=horizons[2]; edge=max(h0["up"],h0["down"])-h0["flat"]
    confidence=int(round(np.clip(52+abs(score)*28+min(len(x),500)/500*12+max(edge,0)*10,45,94)))
    edge_ud=h0["up"]-h0["down"]
    signal="선매입 우위" if edge_ud>=0.16 else "분할 선매입" if edge_ud>=0.06 else "매입 지연 우위" if edge_ud<=-0.16 else "관망·분할 매입" if edge_ud<=-0.06 else "중립·분할 대응"
    bias="BULLISH" if score>0.14 else "BEARISH" if score<-0.14 else "NEUTRAL"
    contrib=[{"name":"Trend","value":round(w["trend"]*f["trend_score"]*100,1)},{"name":"Drivers","value":round(w["driver"]*dscore*100,1)},
             {"name":"Momentum","value":round(w["momentum"]*f["momentum_score"]*100,1)},{"name":"Mean Reversion","value":round(w["meanrev"]*f["meanrev_score"]*100,1)}]
    return {"code":code,"label":meta["label"],"group":meta["group"],"freq":meta["freq"],"unit":meta["unit"],"currency":meta["currency"],
            "last":last,"lastDate":last_date,"bias":bias,"score":round(score,4),"confidence":confidence,"regime":reg,
            "procurementSignal":signal,"horizons":horizons,"contributions":contrib,"drivers":drivers,
            "technicals":{"rsi":round(f["rsi"],1),"volPct":round(f["vol"]*100,2),"ma10":round(f["ma10"],4),
                          "ma20":round(f["ma20"],4),"ma60":round(f["ma60"],4),"bbZ":round(f["bb_z"],2)}}

def build_payload(df=None):
    df=load_prices() if df is None else df; variables=load_variables(); items=[]
    for t in [v for v in variables if v["target"]]:
        try: items.append(forecast_one(df,t,variables))
        except Exception as e: items.append({"code":t["code"],"label":t["label"],"error":str(e)})
    return {"asOf":str(df["AssessDate"].max().date()),"generatedBy":"Price-Forecast-GPT Ensemble v1","items":items,"variables":variables}
