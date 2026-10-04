try{
const DB=window.DB||{items:[]};
const good=(DB.items||[]).filter(function(x){return !x.error});
let current=(good.find(function(x){return x.code==="AAMFI00"})||good[0]||{}).code;
let priceChart,rsiChart,macdChart,probChart;
const state={range:"3M",ma5:true,ma20:true,ma60:true,ma120:true,boll:true,forecast:true};

const HAS_CHART = typeof window.Chart !== "undefined";
if(HAS_CHART){
  Chart.defaults.color="#8aa2b8";
  Chart.defaults.borderColor="rgba(42,76,103,.22)";
  Chart.defaults.font.family='Inter,Pretendard,"Noto Sans KR",system-ui,-apple-system,sans-serif';
}

function el(id){return document.getElementById(id)}
function fmt(x){const n=Number(x);return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:n>=1000?1:2}):"—"}
function cls(b){return b==="BULLISH"?"up":b==="BEARISH"?"dn":"flat"}
function shortDate(s){const d=new Date(String(s)+"T00:00:00");return (d.getMonth()+1)+"/"+d.getDate()}
function rangeBars(freq,r){
  if(r==="ALL")return 9999;
  const d={D:{"1M":22,"3M":66,"6M":132,"1Y":260},W:{"1M":4,"3M":13,"6M":26,"1Y":52}};
  return (d[freq]||d.D)[r]||66;
}
function priceUnit(x){return ((x.currency||"")+"/"+(x.unit||"")).replace(/\/$/,"")}

function marketCard(x){
  const t=(x.technicalState||{}).label||"NEUTRAL";
  return '<div class="mcard '+(x.code===current?'active':'')+'" data-code="'+x.code+'">'+
    '<div class="mname">'+x.label+'</div>'+
    '<div class="mrow"><div class="mprice">'+fmt(x.last)+'</div><div class="bias '+cls(x.bias)+'">'+x.bias+'</div></div>'+
    '<div class="mrow"><span style="font-size:8px;color:#6f8aa2">'+x.code+'</span><span class="bias '+cls(t)+'">TECH '+t+'</span></div></div>';
}
function renderMarket(){
  el("market").innerHTML=good.map(marketCard).join("");
  el("market").querySelectorAll(".mcard").forEach(function(node){
    node.onclick=function(){current=node.dataset.code;render()}
  });
}
function ds(label,data,color,opts){
  opts=opts||{};
  return Object.assign({label:label,data:data,borderColor:color,backgroundColor:color,borderWidth:opts.borderWidth==null?1.5:opts.borderWidth,
    pointRadius:opts.pointRadius==null?0:opts.pointRadius,pointHoverRadius:opts.pointHoverRadius==null?3:opts.pointHoverRadius,
    tension:opts.tension==null ? 0.18 : opts.tension,spanGaps:true},opts);
}
function finite(list){return list.flat().filter(function(v){return Number.isFinite(v)})}
function yRange(vals){
  if(!vals.length)return{};
  const lo=Math.min.apply(null,vals),hi=Math.max.apply(null,vals),span=Math.max(hi-lo,Math.abs(hi)*.03,1);
  return {min:lo-span*.10,max:hi+span*.10};
}
const splitPlugin={id:"forecastSplit",afterDraw:function(chart,args,opts){
  if(opts==null||opts.index==null)return;
  const x=chart.scales.x.getPixelForValue(opts.index),ctx=chart.ctx,a=chart.chartArea;
  ctx.save();ctx.strokeStyle="rgba(53,194,255,.55)";ctx.setLineDash([5,5]);ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(x,a.top);ctx.lineTo(x,a.bottom);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle="#6f9fbd";ctx.font="9px system-ui";ctx.fillText("FORECAST →",Math.min(x+7,a.right-64),a.top+12);ctx.restore();
}};
const probabilityLabels={
  id:"probabilityLabels",
  afterDatasetsDraw:function(chart,args,opts){
    if(!opts||!opts.enabled)return;
    const ctx=chart.ctx;
    ctx.save();
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    chart.data.datasets.forEach(function(dataset,di){
      const meta=chart.getDatasetMeta(di);
      meta.data.forEach(function(bar,idx){
        const raw=Number(dataset.data[idx]);
        if(!Number.isFinite(raw)||raw<=0)return;
        const p=bar.getProps(["x","y","base"],true);
        const cy=(p.y+p.base)/2;
        ctx.font=(raw<10?"800 9px system-ui":"900 10px system-ui");
        ctx.fillStyle="#ffffff";
        ctx.fillText(Math.round(raw)+"%",p.x,cy);
      });
    });
    ctx.restore();
  }
};
const forecastPriceLabels={
  id:"forecastPriceLabels",
  afterDatasetsDraw:function(chart,args,opts){
    if(!opts||!opts.enabled)return;
    const di=chart.data.datasets.findIndex(function(d){return d.label==="Forecast"});
    if(di<0)return;
    const ds=chart.data.datasets[di],meta=chart.getDatasetMeta(di),ctx=chart.ctx,start=opts.startIndex||0;
    ctx.save();
    ctx.font="900 10px system-ui";
    ctx.textAlign="center";
    ctx.textBaseline="bottom";
    meta.data.forEach(function(pt,idx){
      if(idx<start)return;
      const value=Number(ds.data[idx]);
      if(!Number.isFinite(value))return;
      const pos=pt.getProps(["x","y"],true);
      const text=fmt(value);
      const w=ctx.measureText(text).width+10;
      const h=18;
      let x=pos.x-w/2,y=pos.y-27;
      if(y<chart.chartArea.top+4)y=pos.y+12;
      if(x<chart.chartArea.left)x=chart.chartArea.left;
      if(x+w>chart.chartArea.right)x=chart.chartArea.right-w;
      ctx.fillStyle="rgba(255,255,255,.96)";
      ctx.strokeStyle="#e53935";
      ctx.lineWidth=1;
      ctx.beginPath();
      ctx.roundRect(x,y,w,h,5);
      ctx.fill();ctx.stroke();
      ctx.fillStyle="#b91c1c";
      ctx.fillText(text,x+w/2,y+h-4);
    });
    ctx.restore();
  }
};
if(HAS_CHART) Chart.register(splitPlugin,probabilityLabels,forecastPriceLabels);

function chartData(x){
  const hist=(x.history||[]).slice(-rangeBars(x.freq,state.range));
  const future=state.forecast?(x.horizons||[]):[];
  const labels=hist.map(function(r){return shortDate(r.date)}).concat(future.map(function(h){return shortDate(h.date||h.label)}));
  const n=hist.length,ext=function(a){return a.concat(Array(future.length).fill(null))};
  const last=hist.length?hist[hist.length-1].price:null,pad=Array(Math.max(0,n-1)).fill(null);
  return {hist:hist,future:future,labels:labels,n:n,
    actual:ext(hist.map(function(r){return r.price})),
    ma5:ext(hist.map(function(r){return r.ma5})),
    ma20:ext(hist.map(function(r){return r.ma20})),
    ma60:ext(hist.map(function(r){return r.ma60})),
    ma120:ext(hist.map(function(r){return r.ma120})),
    bbU:ext(hist.map(function(r){return r.bbUpper})),
    bbL:ext(hist.map(function(r){return r.bbLower})),
    fc:state.forecast?pad.concat([last],future.map(function(h){return h.center})):[],
    fh:state.forecast?pad.concat([last],future.map(function(h){return h.hi80})):[],
    fl:state.forecast?pad.concat([last],future.map(function(h){return h.lo80})):[]
  };
}
function drawPrice(x){
  const d=chartData(x);
  if(priceChart)priceChart.destroy();
  const sets=[ds("Actual Price",d.actual,"#111827",{borderWidth:3.2,pointHoverRadius:5,order:3})];
  if(state.boll){
    sets.push(ds("Bollinger Upper",d.bbU,"#64748b",{borderWidth:1.8,order:8}));
    sets.push(ds("Bollinger Lower",d.bbL,"#64748b",{borderWidth:1.8,fill:"-1",backgroundColor:"rgba(100,116,139,.16)",order:9}));
  }
  if(state.ma5)sets.push(ds("MA5",d.ma5,"#00a676",{borderWidth:2.6,order:5}));
  if(state.ma20)sets.push(ds("MA20",d.ma20,"#f59e0b",{borderWidth:2.6,order:5}));
  if(state.ma60)sets.push(ds("MA60",d.ma60,"#7c3aed",{borderWidth:2.6,order:5}));
  if(state.ma120)sets.push(ds("MA120",d.ma120,"#2563eb",{borderWidth:2.6,order:5}));
  if(state.forecast&&d.future.length){
    sets.push(ds("80% High",d.fh,"rgba(229,57,53,.34)",{borderWidth:1.2,borderDash:[5,4],order:10}));
    sets.push(ds("80% Low",d.fl,"rgba(229,57,53,.34)",{borderWidth:1.2,borderDash:[5,4],fill:"-1",backgroundColor:"rgba(229,57,53,.10)",order:11}));
    sets.push(ds("Forecast",d.fc,"#e53935",{borderWidth:3.4,borderDash:[8,4],pointRadius:function(c){return c.dataIndex>=d.n?4:0},pointHoverRadius:6,order:1}));
  }
  const bounds=yRange(finite(sets.map(function(s){return s.data}))),tickLimit=window.innerWidth<700?6:10;
  priceChart=new Chart(el("priceChart"),{type:"line",data:{labels:d.labels,datasets:sets},options:{
    responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},animation:{duration:250},
    plugins:{
      legend:{position:"top",align:"start",labels:{color:"#263746",boxWidth:22,boxHeight:4,padding:14,font:{size:10,weight:"700"}}},
      tooltip:{backgroundColor:"#071827",borderColor:"#26516f",borderWidth:1,titleColor:"#dff4ff",bodyColor:"#c4d7e7",
        callbacks:{label:function(c){return c.dataset.label+": "+fmt(c.parsed.y)}}},
      forecastSplit:{index:Math.max(0,d.n-1)},forecastPriceLabels:{enabled:state.forecast,startIndex:d.n}
    },
    scales:{
      x:{grid:{display:false},ticks:{maxTicksLimit:tickLimit,color:"#4b5d6c",font:{size:10,weight:"600"},maxRotation:0}},
      y:{position:"right",min:bounds.min,max:bounds.max,grid:{color:"rgba(100,116,139,.18)"},ticks:{color:"#334155",font:{size:10,weight:"600"},callback:function(v){return fmt(v)}}}
    }
  }});
  drawRsi(d.hist);drawMacd(d.hist);
}
function drawRsi(hist){
  if(rsiChart)rsiChart.destroy();
  const labels=hist.map(function(r){return shortDate(r.date)}),r=hist.map(function(v){return v.rsi});
  rsiChart=new Chart(el("rsiChart"),{type:"line",data:{labels:labels,datasets:[
    ds("RSI",r,"#35c2ff",{borderWidth:1.7}),
    ds("70",labels.map(function(){return 70}),"rgba(255,100,118,.55)",{borderWidth:1,borderDash:[4,4]}),
    ds("50",labels.map(function(){return 50}),"rgba(245,195,90,.28)",{borderWidth:1,borderDash:[3,5]}),
    ds("30",labels.map(function(){return 30}),"rgba(61,220,151,.55)",{borderWidth:1,borderDash:[4,4]})
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
    plugins:{legend:{display:false}},scales:{x:{display:false},y:{position:"right",min:0,max:100,ticks:{stepSize:25,color:"#475569",font:{size:8}},grid:{color:"rgba(100,116,139,.18)"}}}
  }});
  const v=hist.length?hist[hist.length-1].rsi:null;
  const prev=hist.length>1?hist[hist.length-2].rsi:null;
  let label="■ 중립",kind="neutral",guide="RSI 45~55는 방향성이 뚜렷하지 않은 중립 구간입니다.";
  if(v!=null){
    if(v>=70){label="▼ 과열 경계";kind="bear";guide="RSI가 70 이상입니다. 상승 추세는 강하지만 단기 과열로 조정·차익실현 가능성을 함께 봅니다.";}
    else if(v<=30){label="▲ 반등 가능";kind="bull";guide="RSI가 30 이하 과매도 구간입니다. 하락 압력은 강했지만 기술적 반등 가능성이 커지는 구간입니다.";}
    else if(v>=55){label=(prev!=null&&v<prev)?"▲ 상승 둔화":"▲ 상승 우위";kind="bull";guide=(prev!=null&&v<prev)?"RSI는 55 이상이지만 직전보다 낮아져 상승 모멘텀이 둔화되고 있습니다.":"RSI가 55 이상으로 상승 모멘텀이 우세합니다. 70 접근 시 과열 여부를 확인합니다.";}
    else if(v<=45){label=(prev!=null&&v>prev)?"▲ 약세 완화":"▼ 하락 우위";kind=(prev!=null&&v>prev)?"bull":"bear";guide=(prev!=null&&v>prev)?"RSI는 45 이하이지만 직전보다 회복해 하락 압력이 약해지는 모습입니다.":"RSI가 45 이하로 약세 모멘텀이 우세합니다. 30 접근 시 과매도 여부를 확인합니다.";}
  }
  el("rsiState").textContent=v==null?"":label+" "+v.toFixed(1);
  el("rsiState").className=kind==="bull"?"up":kind==="bear"?"dn":"flat";
  el("rsiGuideSignal").textContent=label;
  el("rsiGuideSignal").className="guideSignal "+kind;
  el("rsiGuideText").textContent=guide;
}
function drawMacd(hist){
  if(macdChart)macdChart.destroy();
  const labels=hist.map(function(r){return shortDate(r.date)}),macd=hist.map(function(v){return v.macd}),
    sig=hist.map(function(v){return v.macdSignal}),bar=hist.map(function(v){return v.macdHist});
  const colors=bar.map(function(v){return v==null?"rgba(0,0,0,0)":v>=0?"rgba(61,220,151,.55)":"rgba(255,100,118,.55)"});
  macdChart=new Chart(el("macdChart"),{type:"line",data:{labels:labels,datasets:[
    {type:"bar",label:"Histogram",data:bar,backgroundColor:colors,borderWidth:0,barPercentage:.75,categoryPercentage:.9,order:3},
    ds("MACD",macd,"#35c2ff",{borderWidth:1.5,order:1}),ds("Signal",sig,"#f5c35a",{borderWidth:1.3,order:2})
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:false}},
    scales:{x:{display:false},y:{position:"right",grid:{color:"rgba(100,116,139,.18)"},ticks:{color:"#475569",font:{size:8},callback:function(v){return Number(v).toFixed(1)}}}
  }}});
  const last=hist.length?hist[hist.length-1]:{},prev=hist.length>1?hist[hist.length-2]:{};
  const h=last.macdHist,macd=last.macd,sig=last.macdSignal,prevH=prev.macdHist;
  let label="■ 중립",kind="neutral",guide="MACD와 Signal선이 비슷하고 Histogram이 작으면 방향성이 약한 구간입니다.";
  if(h!=null&&macd!=null&&sig!=null){
    if(macd>sig&&h>0){
      if(prevH!=null&&h<prevH){label="▲ 상승 둔화";kind="bull";guide="MACD선이 Signal선 위지만 Histogram이 축소되고 있어 상승 추세는 유지되나 탄력이 약해지고 있습니다.";}
      else {label="▲ 상승 신호";kind="bull";guide="MACD선이 Signal선 위이고 양(+)의 Histogram이 확대되는 구간입니다. 상승 모멘텀이 강화되는 신호로 봅니다.";}
    }else if(macd<sig&&h<0){
      if(prevH!=null&&h>prevH){label="▲ 하락 약화";kind="bull";guide="MACD선은 Signal선 아래지만 음(-)의 Histogram이 축소되고 있어 하락 압력이 약해지고 반등 가능성이 커지는 구간입니다.";}
      else {label="▼ 하락 신호";kind="bear";guide="MACD선이 Signal선 아래이고 음(-)의 Histogram이 확대되는 구간입니다. 하락 모멘텀이 강화되는 신호로 봅니다.";}
    }else if(h>0){label="▲ 반등 시도";kind="bull";guide="Histogram이 양(+)으로 전환되어 상승 전환 가능성을 확인하는 단계입니다.";}
    else if(h<0){label="▼ 약세 전환";kind="bear";guide="Histogram이 음(-)으로 전환되어 단기 약세 가능성을 확인하는 단계입니다.";}
  }
  el("macdState").textContent=h==null?"":label+" "+(h>=0?"+":"")+h.toFixed(2);
  el("macdState").className=kind==="bull"?"up":kind==="bear"?"dn":"flat";
  el("macdGuideSignal").textContent=label;
  el("macdGuideSignal").className="guideSignal "+kind;
  el("macdGuideText").textContent=guide;
}
function flag(label,value,type){
  const txt=type==="bull"?"상승":type==="bear"?"하락":"중립";
  return '<div class="indicator"><span class="name">'+label+'</span><span class="value">'+value+'</span><span class="pill '+type+'">'+txt+'</span></div>';
}
function compare(a,b){return a==null||b==null?"neutral":a>b?"bull":a<b?"bear":"neutral"}
function renderSignals(x){
  const hist=x.history||[],h=hist.length?hist[hist.length-1]:{},rsi=h.rsi,bb=h.bbPos,mh=h.macdHist;
  const arr=[
    flag("가격 vs MA5",fmt(h.price)+" / "+fmt(h.ma5),compare(h.price,h.ma5)),
    flag("MA5 vs MA20",fmt(h.ma5)+" / "+fmt(h.ma20),compare(h.ma5,h.ma20)),
    flag("MA20 vs MA60",fmt(h.ma20)+" / "+fmt(h.ma60),compare(h.ma20,h.ma60)),
    flag("MA60 vs MA120",fmt(h.ma60)+" / "+fmt(h.ma120),compare(h.ma60,h.ma120)),
    flag("RSI(14)",rsi==null?"—":rsi.toFixed(1),rsi==null?"neutral":rsi>=50&&rsi<70?"bull":rsi<50&&rsi>30?"bear":"neutral"),
    flag("MACD Hist",mh==null?"—":mh.toFixed(2),mh==null?"neutral":mh>0?"bull":mh<0?"bear":"neutral"),
    flag("Bollinger 위치",bb==null?"—":(bb*100).toFixed(0)+"%",bb==null?"neutral":bb>.58?"bull":bb<.42?"bear":"neutral")
  ];
  el("indicatorList").innerHTML=arr.join("");
  const ts=x.technicalState||{label:"NEUTRAL",score:0};
  el("techComposite").textContent=ts.label;el("techComposite").className=cls(ts.label);
  el("techScore").textContent=(ts.score>=0?"+":"")+Number(ts.score||0).toFixed(2);
}
function horizonView(h){
  const vals=[["상승",h.up,"updom"],["보합",h.flat,"flatdom"],["하락",h.down,"dndom"]].sort(function(a,b){return b[1]-a[1]});
  return {name:vals[0][0],prob:vals[0][1],klass:vals[0][2]};
}
function renderHorizon(x){
  const hz=x.horizons||[];
  el("horizon").innerHTML=hz.map(function(h){
    const v=horizonView(h);
    return '<div class="hbox '+v.klass+'"><div class="t">'+h.label+' · '+(h.date||"")+'</div>'+
      '<div class="directionLine"><div class="target">'+fmt(h.center)+'</div><span class="directionBadge '+v.klass+'">'+v.name+' '+(v.prob*100).toFixed(0)+'%</span></div>'+
      '<div class="prob"><span class="up">상승 '+(h.up*100).toFixed(0)+'%</span><span class="flat">보합 '+(h.flat*100).toFixed(0)+'%</span><span class="dn">하락 '+(h.down*100).toFixed(0)+'%</span></div>'+
      '<div class="range80">80% 예상범위 '+fmt(h.lo80)+' – '+fmt(h.hi80)+'</div></div>';
  }).join("");
  if(hz.length){
    const ref=hz[Math.min(2,hz.length-1)],v=horizonView(ref);
    el("dominantOutlook").textContent=(ref.date||ref.label)+" · "+v.name+" "+(v.prob*100).toFixed(0)+"%";
  }
  drawProbability(x);
}
function drawProbability(x){
  if(!HAS_CHART)return;
  if(probChart)probChart.destroy();
  const hz=x.horizons||[];
  const labels=hz.map(function(h){return h.date?shortDate(h.date):h.label});
  probChart=new Chart(el("probChart"),{
    type:"bar",
    data:{labels:labels,datasets:[
      {label:"상승",data:hz.map(function(h){return h.up*100}),backgroundColor:"#e53935",borderWidth:0,stack:"prob"},
      {label:"보합",data:hz.map(function(h){return h.flat*100}),backgroundColor:"#7b8794",borderWidth:0,stack:"prob"},
      {label:"하락",data:hz.map(function(h){return h.down*100}),backgroundColor:"#1976d2",borderWidth:0,stack:"prob"}
    ]},
    options:{
      responsive:true,maintainAspectRatio:false,
      interaction:{mode:"index",intersect:false},
      plugins:{
        legend:{position:"top",align:"start",labels:{color:"#263746",boxWidth:14,boxHeight:14,padding:16,font:{size:10,weight:"700"}}},
        probabilityLabels:{enabled:true},tooltip:{backgroundColor:"#fff",titleColor:"#102638",bodyColor:"#102638",borderColor:"#cbd5e1",borderWidth:1,
          callbacks:{
            label:function(c){return c.dataset.label+" "+c.parsed.y.toFixed(1)+"%"},
            afterBody:function(items){const idx=items[0].dataIndex,h=hz[idx];return ["예상가격 "+fmt(h.center),"80% 범위 "+fmt(h.lo80)+" – "+fmt(h.hi80)];}
          }}
      },
      scales:{
        x:{stacked:true,grid:{display:false},ticks:{color:"#334155",font:{size:10,weight:"700"}}},
        y:{stacked:true,min:0,max:100,grid:{color:"rgba(100,116,139,.16)"},ticks:{color:"#475569",callback:function(v){return v+"%"}}}
      }
    }
  });
}
function renderSide(x){
  el("signal").textContent=x.procurementSignal;el("signal").className="signalBig "+cls(x.bias);el("confbar").style.width=x.confidence+"%";
  const hz=x.horizons||[],h=hz[Math.min(2,hz.length-1)];
  el("signalText").textContent=h?h.label+" 기준 상승 "+(h.up*100).toFixed(0)+"% · 보합 "+(h.flat*100).toFixed(0)+"% · 하락 "+(h.down*100).toFixed(0)+"%. 기술적 추세와 Driver 신호를 함께 반영.":"";
  el("contrib").innerHTML=(x.contributions||[]).map(function(v){
    const width=Math.min(50,Math.abs(v.value)),pos=v.value>=0?"left:50%;width:"+width+"%":"right:50%;width:"+width+"%";
    return '<div class="crow"><span>'+v.name+'</span><div class="track"><i style="'+pos+';background:'+(v.value>=0?'#3ddc97':'#ff6476')+'"></i></div><b class="'+(v.value>=0?'up':'dn')+'">'+(v.value>0?'+':'')+v.value+'</b></div>';
  }).join("");
  el("drivers").innerHTML=(x.drivers||[]).map(function(d){
    return '<div class="driver"><div><b>'+d.label+'</b><em>'+d.code+' · lag corr '+d.corr+'</em></div><b class="'+(d.impact>=0?'up':'dn')+'">'+(d.impact>0?'+':'')+d.impact+'%</b></div>';
  }).join("")||'<div class="desc">Driver data pending</div>';
  const bt=x.backtest||{};
  el("backtest").innerHTML=bt.sampleCount?
    '<div class="bt"><small>Direction Accuracy</small><b>'+bt.directionAccuracy+'%</b></div><div class="bt"><small>Model Skill</small><b>'+bt.skill+'</b></div>'+
    '<div class="bt"><small>MAE</small><b>'+bt.maePct+'%</b></div><div class="bt"><small>Samples</small><b>'+bt.sampleCount+'</b></div>':'<div class="desc">Backtest pending</div>';
  const st=x.staleness||{};
  el("fresh").textContent="Data freshness · "+(st.daysSinceAssessment==null?0:st.daysSinceAssessment)+"d since assessment · unchanged "+(st.unchangedPct20!==undefined?(st.unchangedPct20*100).toFixed(0):0)+"% of recent observations";
}
function render(){
  const x=good.find(function(z){return z.code===current})||good[0];if(!x)return;
  renderMarket();el("asof").textContent=DB.asOf||"";el("model").textContent=DB.generatedBy||"";
  el("code").textContent=x.code;el("title").textContent=x.label;
  el("meta").textContent=priceUnit(x)+" · "+(x.freq==="W"?"Weekly assessment":"Daily assessment")+" · Last assessment "+x.lastDate;
  el("last").textContent=fmt(x.last);
  const tech=(x.technicalState||{}).label||"NEUTRAL";
  el("technicalTrend").textContent=tech;el("technicalTrend").className=cls(tech);
  el("bias").textContent=x.bias;el("bias").className=cls(x.bias);el("confidence").textContent=x.confidence+"%";el("regime").textContent=x.regime;
  el("headlineBias").textContent=tech===x.bias?tech+" · CONFIRMED":"TECH "+tech+" / MODEL "+x.bias;
  renderSignals(x);renderHorizon(x);renderSide(x);
  if(HAS_CHART){
    try{ drawPrice(x); }
    catch(err){
      const box=el("runtimeError");
      if(box){box.style.display="block";box.textContent="Chart render error: "+(err&&err.message?err.message:String(err));}
    }
  }else{
    const box=el("runtimeError");
    if(box){box.style.display="block";box.textContent="Chart.js failed to load. Market data and forecast values are still available below.";}
  }
}
document.querySelectorAll(".ctl.range").forEach(function(b){b.onclick=function(){
  state.range=b.dataset.range;document.querySelectorAll(".ctl.range").forEach(function(x){x.classList.toggle("active",x.dataset.range===state.range)});render();
}});
document.querySelectorAll(".ctl.overlay").forEach(function(b){b.onclick=function(){
  const k=b.dataset.overlay;state[k]=!state[k];b.classList.toggle("active",state[k]);render();
}});
render();
}catch(err){
  const b=document.getElementById("runtimeError");
  if(b){b.style.display="block";b.textContent="Dashboard startup error: "+(err&&err.message?err.message:String(err));}
  console.error(err);
}
