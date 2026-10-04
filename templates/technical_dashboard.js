try{
const DB=window.DB||{items:[]};
const good=(DB.items||[]).filter(function(x){return !x.error});
let current=(good.find(function(x){return x.code==="AAMFI00"})||good[0]||{}).code;
let priceChart,rsiChart,macdChart,probChart,captureChart;
let captureAssetBlob=null,captureAssetPromise=null;
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
function prettyDate(s){
  const d=new Date(String(s)+"T00:00:00"),days=["일","월","화","수","목","금","토"];
  return (d.getMonth()+1)+"/"+d.getDate()+"("+days[d.getDay()]+")";
}
function capturePrice(x){
  const n=Number(x);return Number.isFinite(n)?n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):"—";
}
function normalCdf(z){
  const t=1/(1+0.2316419*Math.abs(z));
  const d=0.3989423*Math.exp(-z*z/2);
  let p=1-d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));
  return z>=0?p:1-p;
}
function levelProbability(h,level,above){
  if(!h||!Number.isFinite(Number(level)))return null;
  const center=Number(h.center),lo=Number(h.lo80),hi=Number(h.hi80);
  const sigma=(hi-lo)/(2*1.281551565545);
  if(!Number.isFinite(sigma)||sigma<=0)return null;
  const cdf=normalCdf((Number(level)-center)/sigma);
  return Math.max(0,Math.min(100,(above?1-cdf:cdf)*100));
}
function rangeBars(freq,r){
  if(r==="ALL")return 9999;
  const d={D:{"1M":22,"3M":66,"6M":132,"1Y":260},W:{"1M":4,"3M":13,"6M":26,"1Y":52}};
  return (d[freq]||d.D)[r]||66;
}
function priceUnit(x){return ((x.currency||"")+"/"+(x.unit||"")).replace(/\/$/,"")}
const PRODUCT_VIEW={
  NMCL001:{short:"WTI",market:"NYMEX"},
  PAAAD00:{short:"Naphtha",market:"CFR Japan"},
  AAMFI00:{short:"SM",market:"CFR China"},
  AAOTM00:{short:"Ethylene",market:"CFR NE Asia"},
  PHASM05:{short:"BZ",market:"FOB Korea"},
  AAWWK00:{short:"Propylene",market:"CFR China"},
  PHAOO00:{short:"ACN",market:"CFR FE Asia"},
  BTNEA00:{short:"BD",market:"CFR NE Asia"},
  PHBIF00:{short:"PP",market:"Inj · CFR FE Asia"},
  PHAIL00:{short:"PS",market:"GP · CFR China"},
  PHAIR00:{short:"HIPS",market:"CFR China"},
  PHAHF00:{short:"ABS",market:"Inj · CFR China"}
};
function productView(x){
  return PRODUCT_VIEW[x.code]||{short:(x.label||x.code).split(" ")[0],market:(x.label||"").replace((x.label||"").split(" ")[0],"").trim()};
}

function marketCard(x){
  const t=(x.technicalState||{}).label||"NEUTRAL",pv=productView(x);
  return '<div class="mcard '+(x.code===current?'active':'')+'" data-code="'+x.code+'">'+
    '<div class="mname">'+pv.short+'</div>'+
    '<div class="mregion">'+pv.market+'</div>'+
    '<div class="mcode">'+x.code+'</div>'+
    '<div class="mprice">'+fmt(x.last)+'</div>'+
    '<div class="mstatus"><span class="'+cls(x.bias)+'">예측 '+x.bias+'</span><span class="'+cls(t)+'">기술 '+t+'</span></div></div>';
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
  ctx.fillStyle="#335d78";ctx.font="900 13px system-ui";ctx.fillText("예측 →",Math.min(x+8,a.right-58),a.top+16);ctx.restore();
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
        ctx.font=(raw<10?"900 11px system-ui":"950 13px system-ui");
        ctx.fillStyle="#ffffff";
        ctx.strokeStyle="rgba(15,23,42,.48)";
        ctx.lineWidth=3;
        ctx.strokeText(Math.round(raw)+"%",p.x,cy);
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
    const di=chart.data.datasets.findIndex(function(d){return d.label==="예측"});
    if(di<0)return;
    const ds=chart.data.datasets[di],meta=chart.getDatasetMeta(di),ctx=chart.ctx,start=opts.startIndex||0;
    ctx.save();
    ctx.font="900 10px system-ui";
    ctx.textAlign="center";
    ctx.textBaseline="bottom";
    meta.data.forEach(function(pt,idx){
      if(idx<start)return;
      const raw=ds.data[idx];
      if(raw===null || raw===undefined || raw==="")return;
      const value=Number(raw);
      if(!Number.isFinite(value) || value===0)return;
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
const indicatorZones={
  id:"indicatorZones",
  beforeDatasetsDraw:function(chart,args,opts){
    if(!opts||!opts.mode)return;
    const ctx=chart.ctx,a=chart.chartArea,y=chart.scales.y;
    if(!a||!y)return;
    ctx.save();
    if(opts.mode==="rsi"){
      const y100=y.getPixelForValue(100),y70=y.getPixelForValue(70),y30=y.getPixelForValue(30),y0=y.getPixelForValue(0);
      ctx.fillStyle="rgba(239,68,68,.10)";ctx.fillRect(a.left,y100,a.right-a.left,y70-y100);
      ctx.fillStyle="rgba(100,116,139,.045)";ctx.fillRect(a.left,y70,a.right-a.left,y30-y70);
      ctx.fillStyle="rgba(37,99,235,.09)";ctx.fillRect(a.left,y30,a.right-a.left,y0-y30);
      ctx.fillStyle="#b91c1c";ctx.font="900 10px system-ui";ctx.textAlign="left";ctx.fillText("과열 70+",a.left+8,y100+14);
      ctx.fillStyle="#64748b";ctx.fillText("중립",a.left+8,y.getPixelForValue(50)-5);
      ctx.fillStyle="#155eab";ctx.fillText("냉각·과매도 30-",a.left+8,y30+15);
    }
    if(opts.mode==="macd"){
      const zero=y.getPixelForValue(0);
      ctx.fillStyle="rgba(239,68,68,.055)";ctx.fillRect(a.left,a.top,a.right-a.left,Math.max(0,zero-a.top));
      ctx.fillStyle="rgba(37,99,235,.055)";ctx.fillRect(a.left,zero,a.right-a.left,Math.max(0,a.bottom-zero));
      ctx.strokeStyle="rgba(51,65,85,.62)";ctx.lineWidth=1.2;ctx.setLineDash([4,4]);
      ctx.beginPath();ctx.moveTo(a.left,zero);ctx.lineTo(a.right,zero);ctx.stroke();ctx.setLineDash([]);
      ctx.font="900 10px system-ui";ctx.textAlign="left";
      ctx.fillStyle="#b91c1c";ctx.fillText("상승 우위 (+)",a.left+8,a.top+14);
      ctx.fillStyle="#155eab";ctx.fillText("하락 우위 (-)",a.left+8,a.bottom-8);
      ctx.fillStyle="#475569";ctx.textAlign="right";ctx.fillText("0 중립선",a.right-6,zero-5);
    }
    ctx.restore();
  }
};
const crossSignalLabels={
  id:"crossSignalLabels",
  afterDatasetsDraw:function(chart,args,opts){
    if(!opts||!opts.enabled||!Array.isArray(opts.signals))return;
    const ctx=chart.ctx,a=chart.chartArea,x=chart.scales.x,y=chart.scales.y;
    ctx.save();ctx.font="900 9px system-ui";ctx.textAlign="center";
    opts.signals.slice(-4).forEach(function(sig){
      const px=x.getPixelForValue(sig.index),py=y.getPixelForValue(sig.value);
      const up=sig.type==="bull";
      ctx.fillStyle=up?"#b91c1c":"#155eab";
      ctx.beginPath();
      if(up){ctx.moveTo(px,py-8);ctx.lineTo(px-5,py+1);ctx.lineTo(px+5,py+1);}
      else{ctx.moveTo(px,py+8);ctx.lineTo(px-5,py-1);ctx.lineTo(px+5,py-1);}
      ctx.closePath();ctx.fill();
      ctx.fillText(up?"상승전환":"하락전환",px,up?py-12:py+18);
    });
    ctx.restore();
  }
};
const forecastTable={
  id:"forecastTable",
  afterDraw:function(chart,args,opts){
    if(!opts||!opts.enabled||!Array.isArray(opts.rows)||!opts.rows.length)return;
    const ctx=chart.ctx,a=chart.chartArea;
    if(!a)return;
    const compact=(a.right-a.left)<620;
    const rowH=compact?19:22,headH=compact?25:29;
    const w=compact?176:218,h=headH+rowH*opts.rows.length+8;
    const x=a.right-w-8,y=a.top+8;
    ctx.save();
    ctx.shadowColor="rgba(15,23,42,.12)";ctx.shadowBlur=10;
    ctx.fillStyle="rgba(255,255,255,.94)";ctx.strokeStyle="#cbd5e1";ctx.lineWidth=1;
    ctx.beginPath();ctx.roundRect(x,y,w,h,8);ctx.fill();ctx.stroke();
    ctx.shadowBlur=0;
    ctx.fillStyle="#0f2740";ctx.font=(compact?"900 10px system-ui":"900 12px system-ui");
    ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText("예측 가격",x+10,y+headH/2);
    ctx.strokeStyle="#e2e8f0";ctx.beginPath();ctx.moveTo(x+8,y+headH);ctx.lineTo(x+w-8,y+headH);ctx.stroke();
    const c1=x+10,c2=x+(compact?65:82),c3=x+w-10;
    opts.rows.forEach(function(r,i){
      const yy=y+headH+rowH*i+rowH/2+2;
      ctx.font=(compact?"800 9px system-ui":"800 10px system-ui");
      ctx.textAlign="left";ctx.fillStyle="#64748b";ctx.fillText(r.label||"",c1,yy);
      ctx.fillStyle="#475569";ctx.fillText(r.date?shortDate(r.date):"",c2,yy);
      ctx.textAlign="right";ctx.fillStyle="#b91c1c";ctx.font=(compact?"950 10px system-ui":"950 11px system-ui");ctx.fillText(fmt(r.center),c3,yy);
      if(i<opts.rows.length-1){ctx.strokeStyle="rgba(226,232,240,.75)";ctx.beginPath();ctx.moveTo(x+8,yy+rowH/2);ctx.lineTo(x+w-8,yy+rowH/2);ctx.stroke();}
    });
    ctx.restore();
  }
};
if(HAS_CHART) Chart.register(splitPlugin,probabilityLabels,indicatorZones,crossSignalLabels,forecastTable);

function addBusinessDays(dateText,n){
  const d=new Date(String(dateText)+"T00:00:00");
  let added=0;
  while(added<n){
    d.setDate(d.getDate()+1);
    const day=d.getDay();
    if(day!==0&&day!==6)added++;
  }
  return (d.getMonth()+1)+"/"+d.getDate();
}
function chartData(x){
  const hist=(x.history||[]).slice(-rangeBars(x.freq,state.range));
  const horizons=state.forecast?(x.horizons||[]):[];
  const n=hist.length,last=hist.length?hist[hist.length-1].price:null;
  const histLabels=hist.map(function(r){return shortDate(r.date)});
  const maxBars=horizons.length?Math.max.apply(null,horizons.map(function(h){return Number(h.bars)||1})):0;
  const futureSlots=[];
  if(state.forecast&&maxBars>0){
    for(let b=1;b<=maxBars;b++){
      if(x.freq==="W"){
        const base=new Date(String(x.lastDate)+"T00:00:00");base.setDate(base.getDate()+7*b);
        futureSlots.push({bar:b,label:(base.getMonth()+1)+"/"+base.getDate()});
      }else{
        futureSlots.push({bar:b,label:addBusinessDays(x.lastDate,b)});
      }
    }
  }
  const labels=histLabels.concat(futureSlots.map(function(z){return z.label}));
  const totalFuture=futureSlots.length;
  const ext=function(a){return a.concat(Array(totalFuture).fill(null))};
  const base=Array(Math.max(0,n-1)).fill(null).concat([last],Array(totalFuture).fill(null));
  const fc=base.slice(),fh=base.slice(),fl=base.slice();
  horizons.forEach(function(h){
    const idx=n-1+(Number(h.bars)||1);
    if(idx<fc.length){fc[idx]=h.center;fh[idx]=h.hi80;fl[idx]=h.lo80;}
  });
  return {hist:hist,future:horizons,labels:labels,n:n,futureSlots:futureSlots,
    actual:ext(hist.map(function(r){return r.price})),
    ma5:ext(hist.map(function(r){return r.ma5})),
    ma20:ext(hist.map(function(r){return r.ma20})),
    ma60:ext(hist.map(function(r){return r.ma60})),
    ma120:ext(hist.map(function(r){return r.ma120})),
    bbU:ext(hist.map(function(r){return r.bbUpper})),
    bbL:ext(hist.map(function(r){return r.bbLower})),
    fc:state.forecast?fc:[],fh:state.forecast?fh:[],fl:state.forecast?fl:[]
  };
}
function drawPrice(x){
  const d=chartData(x);
  if(priceChart)priceChart.destroy();
  const sets=[ds("실가격",d.actual,"#0b0f19",{borderWidth:5.8,pointHoverRadius:7,order:3})];
  if(state.boll){
    sets.push(ds("볼린저 상단",d.bbU,"#64748b",{borderWidth:1.8,order:8}));
    sets.push(ds("볼린저 하단",d.bbL,"#64748b",{borderWidth:1.8,fill:"-1",backgroundColor:"rgba(100,116,139,.16)",order:9}));
  }
  if(state.ma5)sets.push(ds("MA5",d.ma5,"#00a676",{borderWidth:2.6,order:5}));
  if(state.ma20)sets.push(ds("MA20",d.ma20,"#f59e0b",{borderWidth:2.6,order:5}));
  if(state.ma60)sets.push(ds("MA60",d.ma60,"#7c3aed",{borderWidth:2.6,order:5}));
  if(state.ma120)sets.push(ds("MA120",d.ma120,"#2563eb",{borderWidth:2.6,order:5}));
  if(state.forecast&&d.future.length){
    sets.push(ds("예측범위 상단 80%",d.fh,"rgba(229,57,53,.34)",{borderWidth:1.2,borderDash:[5,4],order:10}));
    sets.push(ds("예측범위 하단 80%",d.fl,"rgba(229,57,53,.34)",{borderWidth:1.2,borderDash:[5,4],fill:"-1",backgroundColor:"rgba(229,57,53,.10)",order:11}));
    sets.push(ds("예측",d.fc,"#e53935",{borderWidth:4.2,borderDash:[8,4],pointRadius:function(c){return c.dataIndex>=d.n?4.5:0},pointHoverRadius:6,order:1}));
  }
  if(x.scenarios){
    const r=x.scenarios.bull&&Number(x.scenarios.bull.trigger),sp=x.scenarios.bear&&Number(x.scenarios.bear.trigger);
    if(Number.isFinite(r))sets.push(ds("저항선",d.labels.map(function(){return r}),"#dc2626",{borderWidth:1.4,borderDash:[3,5],pointRadius:0,order:12}));
    if(Number.isFinite(sp))sets.push(ds("지지선",d.labels.map(function(){return sp}),"#2563eb",{borderWidth:1.4,borderDash:[3,5],pointRadius:0,order:12}));
  }
  const bounds=yRange(finite(sets.map(function(s){return s.data}))),tickLimit=window.innerWidth<700?7:12;
  priceChart=new Chart(el("priceChart"),{type:"line",data:{labels:d.labels,datasets:sets},options:{
    responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},animation:{duration:250},
    plugins:{
      legend:{position:"top",align:"start",labels:{color:"#263746",boxWidth:22,boxHeight:4,padding:14,font:{size:11,weight:"700"}}},
      tooltip:{backgroundColor:"#071827",borderColor:"#26516f",borderWidth:1,titleColor:"#dff4ff",bodyColor:"#c4d7e7",
        callbacks:{label:function(c){return c.dataset.label+": "+fmt(c.parsed.y)}}},
      forecastSplit:{index:Math.max(0,d.n-1)}
    },
    scales:{
      x:{grid:{display:false},ticks:{maxTicksLimit:tickLimit,color:"#4b5d6c",font:{size:11,weight:"600"},maxRotation:0}},
      y:{position:"right",min:bounds.min,max:bounds.max,grid:{color:"rgba(100,116,139,.18)"},ticks:{color:"#334155",font:{size:10,weight:"600"},callback:function(v){return fmt(v)}}}
    }
  }});
  drawRsi(d.hist);drawMacd(d.hist);
}
function drawRsi(hist){
  if(rsiChart)rsiChart.destroy();
  const labels=hist.map(function(r){return shortDate(r.date)}),r=hist.map(function(v){return v.rsi});
  rsiChart=new Chart(el("rsiChart"),{type:"line",data:{labels:labels,datasets:[
    ds("RSI",r,"#0284c7",{borderWidth:2.4}),
    ds("70",labels.map(function(){return 70}),"rgba(255,100,118,.55)",{borderWidth:1,borderDash:[4,4]}),
    ds("50",labels.map(function(){return 50}),"rgba(245,195,90,.28)",{borderWidth:1,borderDash:[3,5]}),
    ds("30",labels.map(function(){return 30}),"rgba(61,220,151,.55)",{borderWidth:1,borderDash:[4,4]})
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
    plugins:{legend:{display:false},indicatorZones:{mode:"rsi"}},scales:{x:{display:false},y:{position:"right",min:0,max:100,ticks:{stepSize:25,color:"#475569",font:{size:8}},grid:{color:"rgba(100,116,139,.18)"}}}
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
    ds("MACD",macd,"#0284c7",{borderWidth:2.2,order:1}),ds("Signal",sig,"#f59e0b",{borderWidth:1.9,order:2})
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{
    legend:{display:false},
    indicatorZones:{mode:"macd"},
    crossSignalLabels:{enabled:true,signals:(function(){
      const out=[];
      for(let i=1;i<macd.length;i++){
        if(macd[i-1]==null||sig[i-1]==null||macd[i]==null||sig[i]==null)continue;
        const prevDiff=macd[i-1]-sig[i-1],nowDiff=macd[i]-sig[i];
        if(prevDiff<=0&&nowDiff>0)out.push({index:i,value:macd[i],type:"bull"});
        if(prevDiff>=0&&nowDiff<0)out.push({index:i,value:macd[i],type:"bear"});
      }
      return out;
    })()}
  },
    scales:{x:{display:false},y:{position:"right",grid:{color:"rgba(100,116,139,.18)"},ticks:{color:"#475569",font:{size:8},callback:function(v){return Number(v).toFixed(1)}}}
  }}});
  const last=hist.length?hist[hist.length-1]:{},prev=hist.length>1?hist[hist.length-2]:{};
  const h=last.macdHist,macdNow=last.macd,sigNow=last.macdSignal,prevH=prev.macdHist;
  let label="■ 중립",kind="neutral",guide="MACD와 Signal선이 비슷하고 Histogram이 작으면 방향성이 약한 구간입니다.";
  if(h!=null&&macdNow!=null&&sigNow!=null){
    if(macdNow>sigNow&&h>0){
      if(prevH!=null&&h<prevH){label="▲ 상승 둔화";kind="bull";guide="MACD선이 Signal선 위지만 Histogram이 축소되고 있어 상승 추세는 유지되나 탄력이 약해지고 있습니다.";}
      else {label="▲ 상승 신호";kind="bull";guide="MACD선이 Signal선 위이고 양(+)의 Histogram이 확대되는 구간입니다. 상승 모멘텀이 강화되는 신호로 봅니다.";}
    }else if(macdNow<sigNow&&h<0){
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
function renderForecastTableBelow(x){
  const box=el("forecastTableBelow");if(!box)return;
  const hz=x.horizons||[];
  if(!state.forecast||!hz.length){box.innerHTML="";box.style.display="none";return;}
  box.style.display="block";
  box.innerHTML='<div class="forecastTableBelowTitle">예측 가격 · 그래프 하단 정보</div><div class="forecastTableGrid">'+
    hz.map(function(h){return '<div class="forecastMiniCell"><small>'+h.label+' · '+(h.date?shortDate(h.date):"")+'</small><b>'+fmt(h.center)+'</b><span>80% '+fmt(h.lo80)+'–'+fmt(h.hi80)+'</span></div>';}).join("")+
    '</div>';
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

  const ex=x.outlookExplanation||{},sc=x.scenarios||{};
  el("outlookSummary").textContent=ex.summary||"현재 데이터 기준 전망 근거를 계산 중입니다.";
  const base=sc.base||{},bull=sc.bull||{},bear=sc.bear||{};
  el("scenarioGrid").innerHTML=
    '<div class="scenarioCard base"><small>BASE · '+(sc.reference||"")+'</small><b>'+fmt(base.target)+'</b><span>중심 시나리오 · 보합/중립 '+((Number(base.prob)||0)*100).toFixed(0)+'%</span></div>'+
    '<div class="scenarioCard bull"><small>BULL · 상방 돌파</small><b>'+fmt(bull.target)+'</b><span>'+fmt(bull.trigger)+' 돌파 시 · 상승 방향 '+((Number(bull.prob)||0)*100).toFixed(0)+'%</span></div>'+
    '<div class="scenarioCard bear"><small>BEAR · 지지 이탈</small><b>'+fmt(bear.target)+'</b><span>'+fmt(bear.trigger)+' 이탈 시 · 하락 방향 '+((Number(bear.prob)||0)*100).toFixed(0)+'%</span></div>';
  el("positiveFactors").innerHTML=(ex.positiveFactors||[]).map(function(v){return "<li>"+v+"</li>"}).join("")||"<li>뚜렷한 추가 상승 요인은 제한적</li>";
  el("negativeFactors").innerHTML=(ex.negativeFactors||[]).map(function(v){return "<li>"+v+"</li>"}).join("")||"<li>뚜렷한 추가 하락 요인은 제한적</li>";
  el("levelComment").textContent=ex.levelComment||"";
  el("scenarioNote").textContent=sc.note||"";
}
function render(){
  const x=good.find(function(z){return z.code===current})||good[0];if(!x)return;
  renderMarket();el("asof").textContent=DB.asOf||"";el("model").textContent=DB.generatedBy||"";
  const pv=productView(x);el("title").textContent=pv.short;el("code").textContent=pv.market+" · "+x.code;
  el("meta").textContent=priceUnit(x)+" · "+(x.freq==="W"?"주간 평가":"데일리 평가")+" · 최근 평가 "+x.lastDate;
  el("last").textContent=fmt(x.last);
  const tech=(x.technicalState||{}).label||"NEUTRAL";
  el("technicalTrend").textContent=tech;el("technicalTrend").className=cls(tech);
  el("bias").textContent=x.bias;el("bias").className=cls(x.bias);el("confidence").textContent=x.confidence+"%";el("regime").textContent=x.regime;
  el("headlineBias").textContent=tech===x.bias?"기술·예측 "+tech+" · 일치":"기술 "+tech+" / 예측 "+x.bias;
  renderSignals(x);renderHorizon(x);renderSide(x);renderForecastTableBelow(x);
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

function capturePair(x){
  const hz=x.horizons||[];if(!hz.length)return [];
  const first=hz[0];
  const target=x.freq==="W"?4:5;
  let second=hz.reduce(function(best,h){return Math.abs((Number(h.bars)||1)-target)<Math.abs((Number(best.bars)||1)-target)?h:best;},hz[0]);
  if(second===first&&hz.length>1)second=hz[Math.min(hz.length-1,2)];
  return [first,second];
}
function captureOutlookHtml(x,h,index){
  if(!h)return "";
  const up=Number(h.up||0)*100,flat=Number(h.flat||0)*100,down=Number(h.down||0)*100,diff=up-down;
  const title=x.freq==="W"?(index===0?"다음 평가 · "+h.label:(Number(h.bars)||1)+"주 뒤 · "+h.label):(index===0?"다음 거래일 · "+h.label:"1주 뒤 · "+h.label);
  const lead=diff>=0?"상승 확률이 하락보다 "+Math.abs(diff).toFixed(1)+"%p 높음":"하락 확률이 상승보다 "+Math.abs(diff).toFixed(1)+"%p 높음";
  const leadColor=diff>=0?"#e84949":"#2f7bd4";
  return '<section class="captureOutlook">'+
    '<div class="captureSectionTitle">'+title+' · '+prettyDate(h.date)+'</div>'+
    '<div class="captureProbBar"><div class="down" style="width:'+down+'%"></div><div class="flat" style="width:'+flat+'%"></div><div class="up" style="width:'+up+'%"></div></div>'+
    '<div class="captureProbLabels"><span class="down">▼ 하락 '+down.toFixed(1)+'%</span><span class="flat">보합 '+flat.toFixed(1)+'%</span><span class="up">▲ 상승 '+up.toFixed(1)+'%</span></div>'+
    '<div class="captureProbComment" style="color:'+leadColor+'">'+lead+'</div>'+
    '<div class="captureProbMeta">기대 종가 '+capturePrice(h.center)+' · 80% 예상범위 '+capturePrice(h.lo80)+'–'+capturePrice(h.hi80)+'</div>'+
  '</section>';
}
function captureLevelsHtml(x,h1,h2){
  const hist=x.history||[],last=hist.length?hist[hist.length-1]:{},sc=x.scenarios||{};
  const candidates=[
    {level:sc.bull&&Number(sc.bull.trigger),label:"저항선",above:true,dir:"up"},
    {level:Number(last.bbUpper),label:"볼린저 상단",above:true,dir:"up"},
    {level:sc.bear&&Number(sc.bear.trigger),label:"지지선",above:false,dir:"down"},
    {level:Number(last.ma20),label:"20일선",above:false,dir:"down"}
  ];
  const rows=[];const used=[];
  candidates.forEach(function(r){
    if(!Number.isFinite(r.level))return;
    if(used.some(function(v){return Math.abs(v-r.level)/Math.max(1,Math.abs(r.level))<0.002;}))return;
    used.push(r.level);rows.push(r);
  });
  return '<div class="head"></div><div class="head">'+(h1?h1.label:"")+'</div><div class="head">'+(h2?h2.label:"")+'</div>'+
    rows.map(function(r){
      const p1=levelProbability(h1,r.level,r.above),p2=levelProbability(h2,r.level,r.above);
      const arrow=r.above?"▲":"▼",verb=r.above?"넘어 마감":"깨고 마감";
      return '<div class="level '+r.dir+'">'+arrow+' '+capturePrice(r.level)+' '+r.label+' '+verb+'</div>'+
        '<div class="pct '+r.dir+'">'+(p1==null?"—":Math.round(p1)+"%")+'</div>'+
        '<div class="pct '+r.dir+'">'+(p2==null?"—":Math.round(p2)+"%")+'</div>';
    }).join("");
}
function drawCaptureChart(x,pair){
  if(!HAS_CHART)return;
  if(captureChart)captureChart.destroy();
  const hist=(x.history||[]).slice(-40),labels=hist.map(function(r){return shortDate(r.date)});
  const actual=hist.map(function(r){return r.price}),ma20=hist.map(function(r){return r.ma20});
  const future=pair.filter(Boolean),n=labels.length,last=actual[actual.length-1];
  future.forEach(function(h){labels.push(h.date?shortDate(h.date):h.label);});
  const pad=Array(Math.max(0,n-1)).fill(null);
  const fc=pad.concat([last],future.map(function(h){return h.center}));
  const hi=pad.concat([last],future.map(function(h){return h.hi80}));
  const lo=pad.concat([last],future.map(function(h){return h.lo80}));
  const ext=function(a){return a.concat(Array(future.length).fill(null));};
  captureChart=new Chart(el("captureChart"),{type:"line",data:{labels:labels,datasets:[
    {label:"종가",data:ext(actual),borderColor:"#5860ff",backgroundColor:"#5860ff",borderWidth:4,pointRadius:0,tension:.12,spanGaps:true},
    {label:"20일선",data:ext(ma20),borderColor:"#2877d6",backgroundColor:"#2877d6",borderWidth:1.8,pointRadius:0,tension:.12,spanGaps:true},
    {label:"예측 상단",data:hi,borderColor:"rgba(232,73,73,.35)",borderWidth:1,borderDash:[4,3],pointRadius:0,spanGaps:true},
    {label:"예측 하단",data:lo,borderColor:"rgba(47,123,212,.35)",borderWidth:1,borderDash:[4,3],pointRadius:0,fill:"-1",backgroundColor:"rgba(130,150,180,.12)",spanGaps:true},
    {label:"예측",data:fc,borderColor:"#e84949",backgroundColor:"#e84949",borderWidth:3,pointRadius:5,spanGaps:true}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{
    x:{grid:{display:false},ticks:{color:"#666",maxTicksLimit:7,font:{size:13}}},
    y:{position:"right",grid:{color:"rgba(100,116,139,.18)"},ticks:{color:"#666",font:{size:13}}}
  }}});
}
function fitCapturePreview(){
  const sheet=el("captureSheet"),wrap=el("captureScaleWrap"),preview=el("capturePreview");if(!sheet||!wrap||!preview)return;
  sheet.style.transform="none";
  const scale=Math.min(1,Math.max(.28,(preview.clientWidth-18)/1080));
  sheet.style.transformOrigin="top left";sheet.style.transform="scale("+scale+")";
  wrap.style.width=(1080*scale)+"px";wrap.style.height=(sheet.scrollHeight*scale)+"px";
}
function populateCapture(x){
  const pv=productView(x),hist=x.history||[],last=hist.length?hist[hist.length-1]:{},prev=hist.length>1?hist[hist.length-2]:null;
  const change=prev&&Number(prev.price)?((Number(x.last)/Number(prev.price)-1)*100):0,pair=capturePair(x),h1=pair[0],h2=pair[1];
  el("capTitle").textContent=pv.short+" ("+pv.market+") 기술적 분석";
  el("capSub").textContent=prettyDate(x.lastDate)+" 종가 "+capturePrice(x.last)+" ("+(change>=0?"+":"")+change.toFixed(2)+"%) · "+priceUnit(x);
  el("capOutlooks").innerHTML=captureOutlookHtml(x,h1,0)+captureOutlookHtml(x,h2,1);
  el("capLevels").innerHTML=captureLevelsHtml(x,h1,h2);
  const ma60=Number(last.ma60),above60=Number(x.last)>=ma60,rsi=Number(last.rsi),macd=Number(last.macd),sig=Number(last.macdSignal);
  el("capTech").textContent="지표: 60일선 "+(above60?"위":"아래")+" · RSI "+(Number.isFinite(rsi)?rsi.toFixed(0):"—")+" · MACD "+(Number.isFinite(macd)&&Number.isFinite(sig)?(macd>=sig?"시그널 위":"시그널 아래"):"—");
  const ex=x.outlookExplanation||{},sc=x.scenarios||{};
  el("capConclusion").textContent=ex.summary||("현재 "+((x.technicalState||{}).label||"NEUTRAL")+" 기술상태이며, 가까운 지지는 "+fmt(sc.bear&&sc.bear.trigger)+" / 저항은 "+fmt(sc.bull&&sc.bull.trigger)+"입니다.");
  el("capMetaFooter").textContent="데이터 평가가격 입력값 · "+(DB.generatedBy||"Price-Forecast-GPT")+" · 기준 "+x.lastDate+" · 생성 "+new Date().toLocaleString("ko-KR");
  drawCaptureChart(x,pair);
  requestAnimationFrame(function(){fitCapturePreview();});
}
function setCaptureReady(ready){
  const save=el("captureSaveBtn"),share=el("captureShareBtn");
  save.disabled=!ready;share.disabled=!ready;
  save.textContent=ready?"PNG 저장":"PNG 준비 중…";
  share.textContent=ready?"공유":"공유 준비 중…";
}
async function prepareCaptureAsset(){
  if(captureAssetPromise)return captureAssetPromise;
  captureAssetPromise=(async function(){
    const canvas=await makeCaptureCanvas();
    const blob=await new Promise(function(resolve){canvas.toBlob(resolve,"image/png");});
    if(!blob)throw new Error("PNG 생성에 실패했습니다.");
    captureAssetBlob=blob;setCaptureReady(true);return blob;
  })();
  try{return await captureAssetPromise;}catch(err){captureAssetPromise=null;setCaptureReady(false);throw err;}
}
function openCaptureMode(){
  const x=good.find(function(z){return z.code===current})||good[0];if(!x)return;
  captureAssetBlob=null;captureAssetPromise=null;setCaptureReady(false);
  populateCapture(x);el("captureModal").classList.add("open");el("captureModal").setAttribute("aria-hidden","false");document.body.style.overflow="hidden";
  setTimeout(function(){fitCapturePreview();prepareCaptureAsset().catch(captureError);},180);
}
function closeCaptureMode(){
  el("captureModal").classList.remove("open");el("captureModal").setAttribute("aria-hidden","true");document.body.style.overflow="";
}
async function makeCaptureCanvas(){
  if(typeof window.html2canvas!=="function")throw new Error("PNG 생성 모듈을 불러오지 못했습니다.");
  const sheet=el("captureSheet"),oldTransform=sheet.style.transform,oldOrigin=sheet.style.transformOrigin;
  sheet.style.transform="none";sheet.style.transformOrigin="top left";
  try{return await window.html2canvas(sheet,{scale:2,backgroundColor:"#ffffff",useCORS:true,logging:false,width:1080,windowWidth:1080});}
  finally{sheet.style.transform=oldTransform;sheet.style.transformOrigin=oldOrigin;}
}
function captureFilename(){
  const x=good.find(function(z){return z.code===current})||good[0],pv=productView(x);
  return (pv.short+"_"+pv.market+"_"+x.lastDate).replace(/[^A-Za-z0-9가-힣_-]+/g,"_")+".png";
}
function saveBlobAsFile(blob){
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.download=captureFilename();a.href=url;a.click();
  setTimeout(function(){URL.revokeObjectURL(url)},1200);
}
async function saveCapturePng(){
  const blob=captureAssetBlob||await prepareCaptureAsset();saveBlobAsFile(blob);
}
function shareCapturePng(){
  const blob=captureAssetBlob;if(!blob){captureError(new Error("공유 이미지를 준비 중입니다. 잠시 후 다시 눌러주세요."));return;}
  const file=new File([blob],captureFilename(),{type:"image/png"}),x=good.find(function(z){return z.code===current})||good[0],pv=productView(x);
  if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
    navigator.share({title:pv.short+" "+pv.market+" 전망",text:"PETROCHEM FORECAST ENGINE 공유카드",files:[file]}).catch(function(err){if(err&&err.name!=="AbortError")captureError(err);});return;
  }
  if(navigator.clipboard&&window.ClipboardItem){
    navigator.clipboard.write([new ClipboardItem({"image/png":blob})]).then(function(){alert("PNG를 클립보드에 복사했습니다.");}).catch(function(){saveBlobAsFile(blob);alert("공유 기능을 지원하지 않아 PNG로 저장했습니다.");});return;
  }
  saveBlobAsFile(blob);alert("이 브라우저는 파일 공유를 지원하지 않아 PNG로 저장했습니다.");
}
function captureError(err){alert("캡쳐 처리 중 오류: "+(err&&err.message?err.message:String(err)));}

document.querySelectorAll(".ctl.range").forEach(function(b){b.onclick=function(){
  state.range=b.dataset.range;document.querySelectorAll(".ctl.range").forEach(function(x){x.classList.toggle("active",x.dataset.range===state.range)});render();
}});
document.querySelectorAll(".ctl.overlay").forEach(function(b){b.onclick=function(){
  const k=b.dataset.overlay;state[k]=!state[k];b.classList.toggle("active",state[k]);render();
}});
el("captureModeBtn").onclick=openCaptureMode;
el("captureCloseBtn").onclick=closeCaptureMode;
el("captureSaveBtn").onclick=function(){saveCapturePng().catch(captureError);};
el("captureShareBtn").onclick=shareCapturePng;
el("captureModal").addEventListener("click",function(e){if(e.target===el("captureModal"))closeCaptureMode();});
window.addEventListener("resize",function(){if(el("captureModal").classList.contains("open"))fitCapturePreview();});
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&el("captureModal").classList.contains("open"))closeCaptureMode();});

render();
}catch(err){
  const b=document.getElementById("runtimeError");
  if(b){b.style.display="block";b.textContent="Dashboard startup error: "+(err&&err.message?err.message:String(err));}
  console.error(err);
}
