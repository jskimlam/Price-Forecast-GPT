import json, os, shutil, urllib.parse, urllib.request
import pandas as pd
from .forecast_engine import ROOT, build_payload, load_variables
from .backtest import run_backtest

APPS_SCRIPT_URL = os.getenv("APPS_SCRIPT_URL", "https://script.google.com/macros/s/AKfycbxT7FlpEtmYYHReyeFI4KTJtoQGEG70mgJ-ihnbda3PaMsktsI9s0TQfrfXuWekputWwA/exec").strip()
API_KEY = os.getenv("APPS_SCRIPT_API_KEY", "").strip()

def get_json(api, **params):
    if not API_KEY:
        raise RuntimeError("APPS_SCRIPT_API_KEY secret is missing")
    q={"api":api,"key":API_KEY}; q.update(params)
    url=APPS_SCRIPT_URL+("&" if "?" in APPS_SCRIPT_URL else "?")+urllib.parse.urlencode(q)
    req=urllib.request.Request(url,headers={"User-Agent":"Price-Forecast-GPT/1.1"})
    with urllib.request.urlopen(req,timeout=60) as response:
        obj=json.loads(response.read().decode("utf-8"))
    if obj.get("ok") is False:
        raise RuntimeError(obj.get("error") or f"Apps Script {api} failed")
    return obj

def post_json(action, rows):
    if not API_KEY:
        return None
    body=json.dumps({"api_key":API_KEY,"action":action,"rows":rows},ensure_ascii=False).encode("utf-8")
    req=urllib.request.Request(
        APPS_SCRIPT_URL,data=body,
        headers={"Content-Type":"application/json","User-Agent":"Price-Forecast-GPT/1.1"},
        method="POST"
    )
    with urllib.request.urlopen(req,timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))

def load_live():
    obj=get_json("prices",limit=0)
    rows=obj.get("rows") or []
    if not rows:
        raise RuntimeError("No rows returned from Apps Script")
    return pd.DataFrame(rows).rename(columns={"date":"AssessDate"})

def history_rows(payload):
    out=[]
    now=pd.Timestamp.now("UTC").isoformat()
    run_id=f"{payload['asOf']}-ensemble-v1.1"
    for item in payload["items"]:
        if item.get("error"):
            continue
        for h in item["horizons"]:
            out.append({
                "generated_at":now,"as_of_date":payload["asOf"],"code":item["code"],"label":item["label"],
                "horizon":h["label"],"current_price":item["last"],"forecast_price":h["center"],
                "low_80":h["lo80"],"high_80":h["hi80"],"prob_up":h["up"],"prob_flat":h["flat"],"prob_down":h["down"],
                "confidence":item["confidence"],"signal":item["procurementSignal"],
                "model_version":"ensemble-v1.1","run_id":run_id
            })
    return out

def score_rows(payload):
    now=pd.Timestamp.now("UTC").isoformat(); out=[]
    for item in payload["items"]:
        bt=item.get("backtest") or {}
        if item.get("error") or not bt.get("sampleCount"):
            continue
        out.append({
            "updated_at":now,"code":item["code"],"horizon":"MEDIUM","sample_count":bt.get("sampleCount"),
            "direction_accuracy":bt.get("directionAccuracy"),"mae":bt.get("maePct"),
            "brier_score":bt.get("brier"),"skill_score":bt.get("skill"),
            "model_version":"ensemble-v1.1","note":"walk-forward, no-lookahead"
        })
    return out

def main():
    site=ROOT/"site"; site.mkdir(exist_ok=True)
    df=load_live()
    variables=load_variables()
    bt=run_backtest(pd.DataFrame(df),variables)
    payload=build_payload(df,variables=variables,backtest=bt)

    tpl=(ROOT/"templates/index.html").read_text(encoding="utf-8")
    (site/"index.html").write_text(
        tpl.replace("__FORECAST_PAYLOAD__",json.dumps(payload,ensure_ascii=False)),
        encoding="utf-8"
    )
    shutil.copy2(ROOT/"templates/admin.html",site/"admin.html")
    (site/".nojekyll").write_text("",encoding="utf-8")

    try:
        post_json("append_forecasts",history_rows(payload))
        post_json("replace_scores",score_rows(payload))
    except Exception as exc:
        print("Sheet writeback warning:",exc)

    print("built",payload["asOf"],len(payload["items"]),"targets")

if __name__=="__main__":
    main()
