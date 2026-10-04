try{
const DB=window.DB||{items:[]};
const good=(DB.items||[]).filter(function(x){return !x.error});
let current=(good.find(function(x){return x.code==="AAMFI00"})||good[0]||{}).code;
let priceChart,rsiChart,macdChart;
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
if(HAS_CHART) Chart.register(splitPlugin);

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
  const sets=[ds("Actual",d.actual,"#eef7ff",{borderWidth:2.2,pointHoverRadius:4,order:3})];
  if(state.boll){
    sets.push(ds("Bollinger Upper",d.bbU,"rgba(92,148,190,.40)",{borderWidth:1,order:8}));
    sets.push(ds("Bollinger Lower",d.bbL,"rgba(92,148,190,.40)",{borderWidth:1,fill:"-1",backgroundColor:"rgba(64,126,170,.08)",order:9}));
  }
  if(state.ma5)sets.push(ds("MA5",d.ma5,"#3ddc97",{borderWidth:1.3,order:5}));
  if(state.ma20)sets.push(ds("MA20",d.ma20,"#f5c35a",{borderWidth:1.4,order:5}));
  if(state.ma60)sets.push(ds("MA60",d.ma60,"#b38cff",{borderWidth:1.5,order:5}));
  if(state.ma120)sets.push(ds("MA120",d.ma120,"#ff9f43",{borderWidth:1.5,order:5}));
  if(state.forecast&&d.future.length){
    sets.push(ds("80% High",d.fh,"rgba(53,194,255,.28)",{borderWidth:1,borderDash:[5,4],order:10}));
    sets.push(ds("80% Low",d.fl,"rgba(53,194,255,.28)",{borderWidth:1,borderDash:[5,4],fill:"-1",backgroundColor:"rgba(53,194,255,.10)",order:11}));
    sets.push(ds("Forecast",d.fc,"#35c2ff",{borderWidth:3,borderDash:[7,4],pointRadius:function(c){return c.dataIndex>=d.n?3:0},pointHoverRadius:5,order:1}));
  }
  const bounds=yRange(finite(sets.map(function(s){return s.data}))),tickLimit=window.innerWidth<700?6:10;
  priceChart=new Chart(el("priceChart"),{type:"line",data:{labels:d.labels,datasets:sets},options:{
    responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},animation:{duration:250},
    plugins:{
      legend:{position:"top",align:"start",labels:{boxWidth:15,boxHeight:2,font:{size:9}}},
      tooltip:{backgroundColor:"#071827",borderColor:"#26516f",borderWidth:1,titleColor:"#dff4ff",bodyColor:"#c4d7e7",
        callbacks:{label:function(c){return c.dataset.label+": "+fmt(c.parsed.y)}}},
      forecastSplit:{index:Math.max(0,d.n-1)}
    },
    scales:{
      x:{grid:{display:false},ticks:{maxTicksLimit:tickLimit,color:"#69849b",font:{size:9},maxRotation:0}},
      y:{position:"right",min:bounds.min,max:bounds.max,grid:{color:"rgba(42,76,103,.22)"},ticks:{color:"#7895ac",font:{size:9},callback:function(v){return fmt(v)}}}
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
    plugins:{legend:{display:false}},scales:{x:{display:false},y:{position:"right",min:0,max:100,ticks:{stepSize:25,font:{size:8}},grid:{color:"rgba(42,76,103,.18)"}}}
  }});
  const v=hist.length?hist[hist.length-1].rsi:null;
  el("rsiState").textContent=v==null?"":v>=70?"과매수 "+v.toFixed(1):v<=30?"과매도 "+v.toFixed(1):v>=50?"상승 모멘텀 "+v.toFixed(1):"약세 모멘텀 "+v.toFixed(1);
  el("rsiState").className=v>=70?"dn":v<=30?"up":v>=50?"up":"dn";
}
function drawMacd(hist){
  if(macdChart)macdChart.destroy();
  const labels=hist.map(function(r){return shortDate(r.date)}),macd=hist.map(function(v){return v.macd}),
    sig=hist.map(function(v){return v.macdSignal}),bar=hist.map(function(v){return v.macdHist});
  const colors=bar.map(function(v){return v==null?"rgba(0,0,0,0)":v>=0?"rgba(61,220,151,.55)":"rgba(255,100,118,.55)"});
  macdChart=new Chart(el("macdChart"),{data:{labels:labels,datasets:[
    {type:"bar",label:"Histogram",data:bar,backgroundColor:colors,borderWidth:0,barPercentage:.75,categoryPercentage:.9,order:3},
    ds("MACD",macd,"#35c2ff",{borderWidth:1.5,order:1}),ds("Signal",sig,"#f5c35a",{borderWidth:1.3,order:2})
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:false}},
    scales:{x:{display:false},y:{position:"right",grid:{color:"rgba(42,76,103,.18)"},ticks:{font:{size:8},callback:function(v){return Number(v).toFixed(1)}}}
  }}});
  const h=hist.length?hist[hist.length-1].macdHist:null;
  el("macdState").textContent=h==null?"":h>0?"상승 압력 +"+h.toFixed(2):"하락 압력 "+h.toFixed(2);
  el("macdState").className=h>0?"up":h<0?"dn":"flat";
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
function renderHorizon(x){
  el("horizon").innerHTML=(x.horizons||[]).map(function(h){
    return '<div class="hbox"><div class="t">'+h.label+' Forecast · '+(h.date||"")+'</div><div class="target">'+fmt(h.center)+'</div>'+
      '<div class="prob"><span class="up">▲ '+(h.up*100).toFixed(0)+'%</span><span class="flat">● '+(h.flat*100).toFixed(0)+'%</span><span class="dn">▼ '+(h.down*100).toFixed(0)+'%</span></div>'+
      '<div class="range80">80% '+fmt(h.lo80)+' – '+fmt(h.hi80)+'</div></div>';
  }).join("");
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
