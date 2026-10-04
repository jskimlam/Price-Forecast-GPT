from __future__ import annotations
import numpy as np
from .forecast_engine import observed_series, forecast_one

def _direction(x, band):
    return 1 if x > band else -1 if x < -band else 0

def backtest_target(df, meta, variables, max_samples=28):
    code = meta["code"]
    obs = observed_series(df, code)
    if len(obs) < 80:
        return {"sampleCount":0,"directionAccuracy":None,"maePct":None,"brier":None,"skill":None}

    h = 5 if meta["freq"] == "D" else 2
    band = 0.005 if meta["freq"] == "D" else 0.010
    idx = list(obs.index)
    candidates = range(max(35, len(idx)-max_samples-h), len(idx)-h)

    hits=[]; maes=[]; briers=[]
    for pos in candidates:
        cutoff = idx[pos]
        hist = df[df["AssessDate"] <= cutoff].copy()
        try:
            fc = forecast_one(hist, meta, variables)
        except Exception:
            continue

        hz = min(fc["horizons"], key=lambda z:abs(z["bars"]-h))
        actual0 = float(obs.iloc[pos]); actual1 = float(obs.iloc[pos+h])
        ret = actual1/actual0-1

        pred_dir = 1 if hz["up"] > max(hz["flat"],hz["down"]) else -1 if hz["down"] > max(hz["flat"],hz["up"]) else 0
        act_dir = _direction(ret, band)
        hits.append(1 if pred_dir == act_dir else 0)
        maes.append(abs(hz["center"]-actual1)/actual1)

        outcome = [1,0,0] if act_dir==1 else [0,1,0] if act_dir==0 else [0,0,1]
        prob = [hz["up"],hz["flat"],hz["down"]]
        briers.append(sum((p-o)**2 for p,o in zip(prob,outcome))/3)

    if not hits:
        return {"sampleCount":0,"directionAccuracy":None,"maePct":None,"brier":None,"skill":None}

    acc=float(np.mean(hits)); mae=float(np.mean(maes)); brier=float(np.mean(briers))
    skill=float(np.clip(50 + (acc-1/3)*60 - mae*120 - brier*25,0,100))
    return {
        "sampleCount":len(hits),
        "directionAccuracy":round(acc*100,1),
        "maePct":round(mae*100,2),
        "brier":round(brier,4),
        "skill":round(skill,1)
    }

def run_backtest(df, variables):
    out={}
    for meta in [v for v in variables if v.get("target")]:
        try:
            out[meta["code"]]=backtest_target(df,meta,variables)
        except Exception as e:
            out[meta["code"]]={"sampleCount":0,"error":str(e)}
    return out
