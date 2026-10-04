import json, os, shutil, urllib.parse, urllib.request
import pandas as pd
from .forecast_engine import ROOT, build_payload

def load_live():
    base=os.getenv("PF_GAS_URL","").strip()
    read_token=os.getenv("PF_READ_TOKEN","").strip()
    if not base or not read_token:
        return None
    query=urllib.parse.urlencode({"action":"data","token":read_token})
    url=base+("&" if "?" in base else "?")+query
    req=urllib.request.Request(url,headers={"User-Agent":"Price-Forecast-GPT/1.0"})
    with urllib.request.urlopen(req,timeout=30) as response:
        obj=json.loads(response.read().decode("utf-8"))
    rows=obj.get("prices") or []
    if not rows:
        return None
    df=pd.DataFrame(rows[1:],columns=rows[0])
    df["AssessDate"]=pd.to_datetime(df["AssessDate"])
    for c in df.columns[1:]:
        df[c]=pd.to_numeric(df[c],errors="coerce")
    return df

def main():
    site=ROOT/"site"; site.mkdir(exist_ok=True)
    try:
        df=load_live()
    except Exception as exc:
        print("Live sheet unavailable; fallback CSV:",exc)
        df=None
    payload=build_payload(df)
    tpl=(ROOT/"templates/index.html").read_text(encoding="utf-8")
    (site/"index.html").write_text(tpl.replace("__FORECAST_PAYLOAD__",json.dumps(payload,ensure_ascii=False)),encoding="utf-8")
    shutil.copy2(ROOT/"templates/admin.html",site/"admin.html")
    (site/".nojekyll").write_text("",encoding="utf-8")
    print("built",payload["asOf"],len(payload["items"]),"targets")

if __name__=="__main__":
    main()
