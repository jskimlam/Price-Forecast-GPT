from __future__ import annotations
import json, math
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

HORIZONS = {
    "D": [("1D",1),("3D",3),("5D",5),("10D",10),("20D",20)],
    "W": [("1W",1),("2W",2),("4W",4),("8W",8)],
}
FLAT_BAND = {"D": 0.005, "W": 0.010}

def norm_cdf(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))

def rsi(s: pd.Series, n=14):
    d = s.diff()
    up = d.clip(lower=0).ewm(alpha=1/n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1/n, adjust=False).mean()
    rs = up / dn.replace(0, np.nan)
    return 100 - (100 / (1 + rs))

def zclip(v, scale=1.0):
    if not np.isfinite(v) or not np.isfinite(scale) or scale == 0:
        return 0.0
    return float(np.clip(v / scale, -2.5, 2.5) / 2.5)

def load_variables():
    return json.loads((DATA / "variables.json").read_text(encoding="utf-8"))

def normalize_prices(df: pd.DataFrame):
    df = df.copy()
    if "AssessDate" not in df.columns and "date" in df.columns:
        df = df.rename(columns={"date":"AssessDate"})
    df["AssessDate"] = pd.to_datetime(df["AssessDate"], errors="coerce")
    df = df.dropna(subset=["AssessDate"])
    for c in df.columns:
        if c != "AssessDate":
            df[c] = pd.to_numeric(df[c], errors="coerce")
    return df.sort_values("AssessDate").drop_duplicates("AssessDate", keep="last").reset_index(drop=True)

def observed_series(df: pd.DataFrame, code: str):
    x = df[["AssessDate", code]].dropna().copy()
    x = x[x[code] > 0]
    return x.set_index("AssessDate")[code]

def regime(s: pd.Series):
    x = s.dropna(); x = x[x > 0]
    if len(x) < 25:
        return "Insufficient"
    ret = np.log(x / x.shift(1)).dropna()
    v10 = ret.tail(10).std(); v40 = ret.tail(min(40, len(ret))).std()
    ma10 = x.tail(10).mean(); ma30 = x.tail(30).mean()
    trend = (ma10 / ma30 - 1) if ma30 else 0
    if np.isfinite(v10) and np.isfinite(v40) and v40 > 0 and v10 > 1.45 * v40:
        return "High Volatility"
    if trend > 0.025:
        return "Bull Trend"
    if trend < -0.025:
        return "Bear Trend"
    return "Range / Mean Reversion"

def technical_features(s: pd.Series):
    x = s.dropna(); x = x[x > 0]
    if len(x) < 30:
        raise ValueError("not enough history")
    ret = np.log(x / x.shift(1)).dropna()
    vol = max(float(ret.tail(min(40, len(ret))).std(ddof=1)), 0.002)
    mom5 = float(x.iloc[-1] / x.iloc[-6] - 1) if len(x) >= 6 else 0
    mom20 = float(x.iloc[-1] / x.iloc[-21] - 1) if len(x) >= 21 else mom5
    ma10 = float(x.tail(10).mean()); ma20 = float(x.tail(20).mean()); ma60 = float(x.tail(min(60, len(x))).mean())
    ma_gap = ma10 / ma20 - 1 if ma20 else 0
    long_gap = x.iloc[-1] / ma60 - 1 if ma60 else 0
    rr = float(rsi(x, 14).iloc[-1]) if len(x) > 15 else 50
    sd20 = float(x.tail(20).std(ddof=0)); bb_z = (float(x.iloc[-1]) - ma20) / (sd20 if sd20 else 1)
    n = min(20, len(x)); slope = np.polyfit(np.arange(n), x.tail(n).to_numpy(), 1)[0] / float(x.iloc[-1])
    momentum = 0.45*zclip(mom5, vol*math.sqrt(5)) + 0.35*zclip(mom20, vol*math.sqrt(20)) + 0.20*zclip(ma_gap, vol*2)
    trend = 0.55*zclip(slope, vol/8) + 0.25*zclip(long_gap, vol*4) + 0.20*zclip(ma_gap, vol*2)
    meanrev = -zclip(bb_z, 1.6)*0.65 - zclip((rr-50)/25, 1)*0.35
    return {
        "vol":vol,"ma10":ma10,"ma20":ma20,"ma60":ma60,"rsi":rr,"bb_z":bb_z,
        "momentum_score":float(np.clip(momentum,-1,1)),
        "trend_score":float(np.clip(trend,-1,1)),
        "meanrev_score":float(np.clip(meanrev,-1,1)),
    }

def staleness_features(df: pd.DataFrame, code: str):
    obs = observed_series(df, code)
    if obs.empty:
        return {"daysSinceAssessment":999,"unchangedStreak":0,"unchangedPct20":1.0}
    max_date = pd.Timestamp(df["AssessDate"].max())
    days = int((max_date - pd.Timestamp(obs.index[-1])).days)
    vals = obs.tail(20).to_numpy()
    unchanged_pct = float(np.mean(np.diff(vals) == 0)) if len(vals) > 1 else 0.0
    streak = 0
    for i in range(len(vals)-1, 0, -1):
        if vals[i] == vals[i-1]: streak += 1
        else: break
    return {"daysSinceAssessment":days,"unchangedStreak":streak,"unchangedPct20":unchanged_pct}

def driver_signal(df: pd.DataFrame, target: str, variables: list, lookback=120):
    work = df.set_index("AssessDate").sort_index()
    y = observed_series(df, target)
    if len(y) < 20:
        return 0.0, []
    target_dates = y.index
    yret = np.log(y / y.shift(1))
    candidates = []
    for meta in variables:
        c = meta["code"]
        if c == target or c not in work.columns:
            continue
        raw = work[c].where(work[c] > 0)
        aligned = raw.reindex(target_dates, method="ffill")
        xret = np.log(aligned / aligned.shift(1))
        pair = pd.concat([xret.shift(1), yret], axis=1).dropna().tail(lookback)
        if len(pair) < 15:
            continue
        corr = pair.iloc[:,0].corr(pair.iloc[:,1])
        if corr is None or not np.isfinite(corr):
            continue
        last_ret = float(xret.iloc[-1]) if np.isfinite(xret.iloc[-1]) else 0.0
        raw_tail = raw.dropna().tail(20)
        stale_pct = float((raw_tail.diff().fillna(0) == 0).mean()) if len(raw_tail) else 1.0
        strength = abs(corr) * (1 - 0.45*stale_pct)
        impact = corr * last_ret
        candidates.append((strength, corr, last_ret, impact, c, meta["label"], stale_pct))
    candidates = sorted(candidates, key=lambda z:z[0], reverse=True)[:6]
    denom = sum(max(a,0.02) for a,*_ in candidates) or 1
    score = sum(max(a,0.02) * np.tanh(impact/0.012) for a,_,_,impact,*_ in candidates) / denom
    drivers = [{
        "code":c,"label":label,"corr":round(float(corr),3),
        "lastReturnPct":round(last_ret*100,2),"stalePct":round(stale_pct*100,1),
        "impact":round(float(impact*100),3)
    } for _,corr,last_ret,impact,c,label,stale_pct in candidates]
    return float(np.clip(score,-1,1)), drivers

def forecast_one(df, meta, variables):
    code = meta["code"]
    obs = observed_series(df, code)
    f = technical_features(obs)
    dscore, drivers = driver_signal(df, code, variables)
    reg = regime(obs)
    stale = staleness_features(df, code)

    if "Trend" in reg:
        w = {"trend":0.35,"driver":0.30,"momentum":0.25,"meanrev":0.10}
    elif "High" in reg:
        w = {"trend":0.22,"driver":0.33,"momentum":0.20,"meanrev":0.25}
    else:
        w = {"trend":0.20,"driver":0.32,"momentum":0.18,"meanrev":0.30}

    score = float(np.clip(
        w["trend"]*f["trend_score"] + w["driver"]*dscore +
        w["momentum"]*f["momentum_score"] + w["meanrev"]*f["meanrev_score"], -1, 1
    ))
    last = float(obs.iloc[-1]); last_date = str(pd.Timestamp(obs.index[-1]).date())
    horizons = []
    flat0 = FLAT_BAND[meta["freq"]]
    for label,h in HORIZONS[meta["freq"]]:
        drift = score * f["vol"] * math.sqrt(h) * 0.80
        sd = max(f["vol"] * math.sqrt(h), 0.003 if meta["freq"]=="D" else 0.006)
        flat = min(flat0 * (1 + 0.22*math.sqrt(max(h-1,0))), 0.035)
        p_up = 1 - norm_cdf((math.log(1+flat)-drift)/sd)
        p_dn = norm_cdf((math.log(max(1-flat,0.001))-drift)/sd)
        p_flat = max(0.0, 1-p_up-p_dn)
        total = p_up+p_flat+p_dn
        p_up,p_flat,p_dn = p_up/total,p_flat/total,p_dn/total
        center = last*math.exp(drift); lo = last*math.exp(drift-1.28*sd); hi = last*math.exp(drift+1.28*sd)
        horizons.append({"label":label,"bars":h,"center":round(center,4),"lo80":round(lo,4),"hi80":round(hi,4),
                         "up":round(p_up,4),"flat":round(p_flat,4),"down":round(p_dn,4),"flatBandPct":round(flat*100,2)})

    ref_idx = min(2, len(horizons)-1); h0 = horizons[ref_idx]
    edge = max(h0["up"],h0["down"]) - h0["flat"]
    data_depth = min(len(obs),500)/500
    stale_penalty = min(stale["daysSinceAssessment"]*2.5 + stale["unchangedPct20"]*10, 20)
    confidence = int(round(np.clip(52 + abs(score)*26 + data_depth*12 + max(edge,0)*10 - stale_penalty, 40, 94)))
    edge_ud = h0["up"] - h0["down"]
    signal = "선매입 우위" if edge_ud>=0.16 else "분할 선매입" if edge_ud>=0.06 else "매입 지연 우위" if edge_ud<=-0.16 else "관망·분할 매입" if edge_ud<=-0.06 else "중립·분할 대응"
    bias = "BULLISH" if score>0.14 else "BEARISH" if score<-0.14 else "NEUTRAL"
    contrib = [
        {"name":"Trend","value":round(w["trend"]*f["trend_score"]*100,1)},
        {"name":"Drivers","value":round(w["driver"]*dscore*100,1)},
        {"name":"Momentum","value":round(w["momentum"]*f["momentum_score"]*100,1)},
        {"name":"Mean Reversion","value":round(w["meanrev"]*f["meanrev_score"]*100,1)},
    ]
    return {
        "code":code,"label":meta["label"],"group":meta["group"],"freq":meta["freq"],"unit":meta["unit"],"currency":meta["currency"],
        "last":last,"lastDate":last_date,"bias":bias,"score":round(score,4),"confidence":confidence,"regime":reg,
        "procurementSignal":signal,"horizons":horizons,"contributions":contrib,"drivers":drivers,
        "staleness":stale,
        "technicals":{"rsi":round(f["rsi"],1),"volPct":round(f["vol"]*100,2),"ma10":round(f["ma10"],4),
                      "ma20":round(f["ma20"],4),"ma60":round(f["ma60"],4),"bbZ":round(f["bb_z"],2)}
    }

def build_payload(df: pd.DataFrame, variables=None, backtest=None):
    df = normalize_prices(df)
    variables = variables or load_variables()
    items = []
    for t in [v for v in variables if v.get("target")]:
        try:
            item = forecast_one(df,t,variables)
            if backtest and t["code"] in backtest:
                item["backtest"] = backtest[t["code"]]
            items.append(item)
        except Exception as e:
            items.append({"code":t["code"],"label":t["label"],"error":str(e)})
    return {"asOf":str(df["AssessDate"].max().date()),"generatedBy":"Price-Forecast-GPT Ensemble v1.1","items":items,"variables":variables}
