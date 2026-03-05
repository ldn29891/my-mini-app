import { useState, useMemo, useEffect, useRef, useCallback, useContext, createContext } from "react";

/* ═══════════════════════════════════════════════════════════════════
   CHOREBOARD — Family Chore Tracker
   ═══════════════════════════════════════════════════════════════════ */

const GFONTS = `@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Quicksand:wght@500;600;700&display=swap');`;

const G = {
  bg:"#ffffff", surface:"#f0fdf4", border:"#bbf7d0",
  green1:"#15803d", green2:"#22c55e", green3:"#4ade80", green4:"#86efac", green5:"#dcfce7",
  text:"#166534",
};

const ROYGBIV = [
  {name:"Red",val:"#ef4444"},{name:"Orange",val:"#f97316"},
  {name:"Yellow",val:"#eab308"},{name:"Lime",val:"#84cc16"},
  {name:"Green",val:"#22c55e"},{name:"Teal",val:"#14b8a6"},
  {name:"Blue",val:"#3b82f6"},{name:"Indigo",val:"#6366f1"},
  {name:"Violet",val:"#8b5cf6"},{name:"Pink",val:"#ec4899"},
  {name:"Rose",val:"#f43f5e"},{name:"Cyan",val:"#06b6d4"},
];

const KID_AVATARS = ["🦁","🐼","🦊","🐸","🦋","🐯","🐨","🦄","🐙","🦀","🐬","🦅"];

const DEFAULT_TEMPLATES = [
  {id:"t1",name:"Make Bed",pts:5,emoji:"🛏️"},
  {id:"t2",name:"Wash Dishes",pts:10,emoji:"🍽️"},
  {id:"t3",name:"Vacuum Room",pts:15,emoji:"🧹"},
  {id:"t4",name:"Take Out Trash",pts:10,emoji:"🗑️"},
  {id:"t5",name:"Feed Pet",pts:8,emoji:"🐾"},
  {id:"t6",name:"Do Laundry",pts:20,emoji:"👕"},
  {id:"t7",name:"Clean Bathroom",pts:20,emoji:"🚿"},
  {id:"t8",name:"Set Table",pts:5,emoji:"🍴"},
  {id:"t9",name:"Water Plants",pts:7,emoji:"🌿"},
  {id:"t10",name:"Read 30 min",pts:12,emoji:"📚"},
  {id:"t11",name:"Tidy Room",pts:8,emoji:"🧺"},
  {id:"t12",name:"Sweep Floor",pts:9,emoji:"🫧"},
];

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/* ── Date helpers ─────────────────────────────────────────────────── */
function dateKey(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function fmtDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
}
function isTodayDate(d) { return dateKey(d) === dateKey(new Date()); }
function getToday() { const t = new Date(); t.setHours(0,0,0,0); return t; }

/* ── Audio ────────────────────────────────────────────────────────── */
function playCheer() {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    [523,659,784,1047,784,1047,1319].forEach((freq,i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = "sine";
      const t = ctx.currentTime + i*0.12;
      gain.gain.setValueAtTime(0,t);
      gain.gain.linearRampToValueAtTime(0.28,t+0.04);
      gain.gain.exponentialRampToValueAtTime(0.001,t+0.22);
      osc.start(t); osc.stop(t+0.25);
    });
  } catch(e) {}
}
// Returns a stop() function; rings for up to 10 seconds with repeated tolls
function playBell() {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const nodes = [];
    // Ring every ~1.6s for 10 seconds → ~6 tolls
    const tollTimes = [0, 1.6, 3.2, 4.8, 6.4, 8.0, 9.6];
    tollTimes.forEach(t => {
      if (t > 10) return;
      [[880, 0.42, 1.5], [1760, 0.18, 0.9], [1320, 0.1, 1.1]].forEach(([freq, vol, dur]) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = "sine";
        const st = ctx.currentTime + t;
        gain.gain.setValueAtTime(vol, st);
        gain.gain.exponentialRampToValueAtTime(0.001, st + dur);
        osc.start(st); osc.stop(st + dur + 0.05);
        nodes.push({ osc, gain });
      });
    });
    const stopFn = () => {
      try {
        nodes.forEach(({ gain }) => {
          gain.gain.cancelScheduledValues(ctx.currentTime);
          gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        });
        setTimeout(() => { try { ctx.close(); } catch(e){} }, 200);
      } catch(e) {}
    };
    return stopFn;
  } catch(e) { return ()=>{}; }
}
function playReward() {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    [392,494,587,740,880,1047].forEach((freq,i) => {
      const osc=ctx.createOscillator(), gain=ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type="triangle"; osc.frequency.value=freq;
      const t=ctx.currentTime+i*0.09;
      gain.gain.setValueAtTime(0.22,t);
      gain.gain.exponentialRampToValueAtTime(0.001,t+0.35);
      osc.start(t); osc.stop(t+0.38);
    });
  } catch(e) {}
}

/* ── Global Timer Context ─────────────────────────────────────────── */
const TimerCtx = createContext(null);
function TimerProvider({ children }) {
  const [totalSecs,setTotalSecs] = useState(10*60);
  const [remaining,setRemaining] = useState(null);
  const [running,setRunning]     = useState(false);
  const [finished,setFinished]   = useState(false);
  const [bellRinging,setBellRinging] = useState(false);
  const ivRef = useRef(null);
  const bellFired = useRef(false);
  const bellStopFn = useRef(null);     // holds the stop() from playBell()
  const bellAutoStop = useRef(null);   // holds auto-stop timeout id

  const stopBell = useCallback(()=>{
    if (bellStopFn.current) { bellStopFn.current(); bellStopFn.current=null; }
    if (bellAutoStop.current) { clearTimeout(bellAutoStop.current); bellAutoStop.current=null; }
    setBellRinging(false);
  },[]);

  const fireBell = useCallback(()=>{
    const stop = playBell();
    bellStopFn.current = stop;
    setBellRinging(true);
    bellAutoStop.current = setTimeout(()=>{
      stop(); bellStopFn.current=null; bellAutoStop.current=null; setBellRinging(false);
    }, 10200); // auto-stop after ~10 seconds
  },[]);

  const stop = useCallback(()=>{ clearInterval(ivRef.current); setRunning(false); },[]);
  const start = useCallback((secsOverride)=>{
    clearInterval(ivRef.current);
    stopBell();
    const secs = secsOverride!==undefined ? secsOverride : (remaining!==null ? remaining : totalSecs);
    if (secs<=0) return;
    bellFired.current=false; setFinished(false); setRunning(true); setRemaining(secs);
    ivRef.current=setInterval(()=>{
      setRemaining(r=>{
        if (r<=1){ clearInterval(ivRef.current); setRunning(false); setFinished(true);
          if (!bellFired.current){ bellFired.current=true; fireBell(); } return 0; }
        return r-1;
      });
    },1000);
  },[remaining,totalSecs,stopBell,fireBell]);
  const reset = useCallback(()=>{ stop(); stopBell(); setRemaining(null); setFinished(false); bellFired.current=false; },[stop,stopBell]);
  const setPreset = useCallback((mins)=>{ stop(); stopBell(); const s=mins*60; setTotalSecs(s); setRemaining(s); setFinished(false); bellFired.current=false; },[stop,stopBell]);
  const applyCustom = useCallback((mins,secs)=>{ const s=Math.max(1,mins*60+secs); stop(); stopBell(); setTotalSecs(s); setRemaining(s); setFinished(false); bellFired.current=false; },[stop,stopBell]);
  useEffect(()=>()=>{ clearInterval(ivRef.current); stopBell(); },[stopBell]);

  const disp = remaining!==null ? remaining : totalSecs;
  const pct  = totalSecs>0 ? ((remaining!==null?remaining:totalSecs)/totalSecs)*100 : 100;

  return (
    <TimerCtx.Provider value={{disp,pct,running,finished,remaining,totalSecs,bellRinging,start,stop,reset,setPreset,applyCustom,stopBell}}>
      {children}
    </TimerCtx.Provider>
  );
}

/* ── I-MR calc ────────────────────────────────────────────────────── */
function calcIMR(data) {
  if (!data||data.length<2) return null;
  const E2=2.66, D4=3.267;
  const xbar=data.reduce((a,b)=>a+b,0)/data.length;
  const mrs=data.slice(1).map((v,i)=>Math.abs(v-data[i]));
  const mrbar=mrs.length?mrs.reduce((a,b)=>a+b,0)/mrs.length:0;
  return {data,mrs,xbar,mrbar,UCL_I:xbar+E2*mrbar,LCL_I:Math.max(0,xbar-E2*mrbar),UCL_MR:D4*mrbar};
}

/* ── SVG MiniChart ────────────────────────────────────────────────── */
function MiniChart({vals,ucl,cl,lcl,color,labels,dotColors}) {
  const W=460,H=94,PL=36,PR=44,PT=8,PB=labels?22:14,IW=W-PL-PR,IH=H-PT-PB;
  const allV=[...vals,ucl,cl,...(lcl>0?[lcl]:[])];
  const hi=Math.max(...allV)*1.15||1;
  const sy=v=>PT+IH*(1-Math.min(v,hi)/hi);
  const sx=(i,n)=>PL+(n>1?i/(n-1)*IW:IW/2);
  const n=vals.length;
  const pts=vals.map((v,i)=>`${sx(i,n)},${sy(v)}`).join(" ");
  const viols=vals.map(v=>v>ucl||(lcl>0&&v<lcl));
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{background:G.surface,borderRadius:10,display:"block"}}>
      <line x1={PL} y1={sy(ucl)} x2={W-PR} y2={sy(ucl)} stroke="#ef4444" strokeDasharray="5,3" strokeWidth={1.3}/>
      <text x={W-PR+3} y={sy(ucl)+4} fontSize={8} fill="#ef4444" fontFamily="Quicksand" fontWeight="700">UCL</text>
      <line x1={PL} y1={sy(cl)} x2={W-PR} y2={sy(cl)} stroke={color} strokeDasharray="7,4" strokeWidth={1.5}/>
      <text x={W-PR+3} y={sy(cl)+4} fontSize={8} fill={color} fontFamily="Quicksand" fontWeight="700">CL</text>
      {lcl>0&&<>
        <line x1={PL} y1={sy(lcl)} x2={W-PR} y2={sy(lcl)} stroke="#ef4444" strokeDasharray="5,3" strokeWidth={1.3}/>
        <text x={W-PR+3} y={sy(lcl)+4} fontSize={8} fill="#ef4444" fontFamily="Quicksand" fontWeight="700">LCL</text>
      </>}
      <polygon points={`${PL},${sy(ucl)} ${W-PR},${sy(ucl)} ${W-PR},${sy(lcl>0?lcl:0)} ${PL},${sy(lcl>0?lcl:0)}`} fill={color} opacity={0.06}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round"/>
      {vals.map((v,i)=>{
        const dc = dotColors?.[i]||color;
        return <circle key={i} cx={sx(i,n)} cy={sy(v)} r={viols[i]?5.5:3.5} fill={viols[i]?"#ef4444":dc} stroke="white" strokeWidth={1.5}/>;
      })}
      {labels&&vals.map((v,i)=>(
        <text key={`l${i}`} x={sx(i,n)} y={H-5} fontSize={7} fill={dotColors?.[i]||G.green4} textAnchor="middle" fontFamily="Quicksand">{labels[i]}</text>
      ))}
      <text x={PL-3} y={sy(hi)+4} fontSize={7} fill={G.green4} textAnchor="end" fontFamily="Quicksand">{Math.round(hi)}</text>
    </svg>
  );
}

function IMRPanel({data,color,title,labels,dotColors}) {
  const s=useMemo(()=>calcIMR(data),[data]);
  if (!s) return <div style={{color:G.green4,fontSize:12,padding:"10px 0",fontFamily:"Quicksand",fontWeight:600}}>Need ≥2 data points.</div>;
  return (
    <div>
      <div style={{fontSize:10,fontWeight:800,color:G.green1,letterSpacing:1,textTransform:"uppercase",marginBottom:3,fontFamily:"Quicksand"}}>I Chart — {title}</div>
      <MiniChart vals={s.data} ucl={s.UCL_I} cl={s.xbar} lcl={s.LCL_I} color={color} labels={labels} dotColors={dotColors}/>
      <div style={{fontSize:10,fontWeight:800,color:G.green1,letterSpacing:1,textTransform:"uppercase",margin:"8px 0 3px",fontFamily:"Quicksand"}}>MR Chart — {title}</div>
      <MiniChart vals={s.mrs} ucl={s.UCL_MR} cl={s.mrbar} lcl={0} color={color}/>
      <div style={{display:"flex",gap:7,marginTop:7,flexWrap:"wrap"}}>
        {[{l:"Avg",v:s.xbar},{l:"UCL",v:s.UCL_I},{l:"LCL",v:s.LCL_I},{l:"MR̄",v:s.mrbar}].map(x=>(
          <div key={x.l} style={{background:G.green5,borderRadius:8,padding:"2px 9px",fontSize:10,fontFamily:"Quicksand",fontWeight:700,color:G.green1}}>
            {x.l}: <span style={{color:G.green2}}>{x.v.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Daily Points I-MR: n points per day for n kids ──────────────── */
function DailyPointsChart({chores,kids}) {
  const [selected,setSelected] = useState("all");
  // Build per-kid per-day data
  const allDays = useMemo(()=>{
    const days = new Set(chores.filter(c=>c.status==="done").map(c=>c.dateKey));
    return [...days].sort();
  },[chores]);

  if (!allDays.length) return (
    <div style={{color:G.green4,fontSize:13,padding:"20px 0",fontFamily:"Quicksand",fontWeight:600,textAlign:"center"}}>
      No completed chores yet. Complete some chores to see daily points data.
    </div>
  );

  if (selected==="all") {
    // One data point per kid per day = n*days points total, interleaved by day
    const vals=[],labels=[],dotColors=[];
    allDays.forEach(dk=>{
      const d=new Date(dk);
      const dayLbl=`${d.getMonth()+1}/${d.getDate()}`;
      kids.forEach(kid=>{
        const pts=chores.filter(c=>c.status==="done"&&c.dateKey===dk&&c.kidIds.includes(kid.id)).reduce((s,c)=>s+c.pts,0);
        if (pts>0||allDays.length<4){ vals.push(pts); labels.push(`${kid.avatar}`); dotColors.push(kid.color); }
      });
    });
    return (
      <div>
        <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:12}}>
          <button style={{padding:"5px 12px",borderRadius:99,border:`2px solid ${selected==="all"?G.green2:G.border}`,background:selected==="all"?G.green5:"white",color:selected==="all"?G.green1:G.green4,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"Nunito"}} onClick={()=>setSelected("all")}>All Kids</button>
          {kids.map(k=><button key={k.id} style={{padding:"5px 12px",borderRadius:99,border:`2px solid ${selected===k.id?k.color:G.border}`,background:selected===k.id?k.color:G.surface,color:selected===k.id?"white":G.green1,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"Nunito"}} onClick={()=>setSelected(k.id)}>{k.avatar} {k.name}</button>)}
        </div>
        <div style={{fontSize:12,color:G.green4,fontFamily:"Quicksand",fontWeight:600,marginBottom:8}}>
          Each point = one kid's daily pts. {kids.length} points per day ({kids.map(k=>`${k.avatar}${k.name}`).join(", ")}). Color = kid.
        </div>
        {vals.length>=2
          ? <IMRPanel data={vals} color={G.green2} title={`All kids pts/day (${allDays.length} days × ${kids.length} kids)`} labels={labels} dotColors={dotColors}/>
          : <div style={{color:G.green4,fontSize:12,padding:"10px 0",fontFamily:"Quicksand"}}>Need ≥2 data points.</div>
        }
        <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
          {kids.map(k=><div key={k.id} style={{display:"flex",alignItems:"center",gap:4,background:k.color+"18",border:`1.5px solid ${k.color}44`,borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:700,color:k.color,fontFamily:"Quicksand"}}><span style={{width:8,height:8,borderRadius:"50%",background:k.color,display:"inline-block"}}/>{k.avatar} {k.name}</div>)}
        </div>
      </div>
    );
  }

  // Single kid view
  const kid = kids.find(k=>k.id===selected);
  if (!kid) return null;
  const vals=allDays.map(dk=>chores.filter(c=>c.status==="done"&&c.dateKey===dk&&c.kidIds.includes(kid.id)).reduce((s,c)=>s+c.pts,0));
  const labels=allDays.map(dk=>{ const d=new Date(dk); return `${d.getMonth()+1}/${d.getDate()}`; });
  return (
    <div>
      <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:12}}>
        <button style={{padding:"5px 12px",borderRadius:99,border:`2px solid ${G.border}`,background:"white",color:G.green4,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"Nunito"}} onClick={()=>setSelected("all")}>All Kids</button>
        {kids.map(k=><button key={k.id} style={{padding:"5px 12px",borderRadius:99,border:`2px solid ${selected===k.id?k.color:G.border}`,background:selected===k.id?k.color:G.surface,color:selected===k.id?"white":G.green1,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"Nunito"}} onClick={()=>setSelected(k.id)}>{k.avatar} {k.name}</button>)}
      </div>
      <IMRPanel data={vals.length>=2?vals:[0,0,0]} color={kid.color} title={`${kid.name} daily pts`} labels={labels}/>
    </div>
  );
}

/* ── Between-Chore Duration (per kid) ─────────────────────────────── */
function BetweenChoresChart({chores,kids}) {
  const [selected,setSelected]=useState(kids[0]?.id||"all");
  const fmtH=h=>h<1?`${Math.round(h*60)}m`:`${h.toFixed(1)}h`;

  const kidView=(kid)=>{
    const done=[...chores.filter(c=>c.status==="done"&&c.completedAt&&c.kidIds.includes(kid.id))].sort((a,b)=>a.completedAt-b.completedAt);
    if (done.length<3) return <div style={{color:G.green4,fontSize:13,padding:"12px 0",fontFamily:"Quicksand",fontWeight:600}}>Need ≥3 completed chores for {kid.name} to show gaps.</div>;
    const gaps=done.slice(1).map((c,i)=>({gapH:Math.max(0,(c.completedAt-done[i].completedAt)/3600000),emoji:c.emoji,name:c.name}));
    const vals=gaps.map(g=>g.gapH);
    const maxV=Math.max(...vals,0.1);
    return (
      <div>
        <IMRPanel data={vals.length>=2?vals:[0,0,0]} color={kid.color} title={`${kid.name} — between-chore gap (hrs)`} labels={gaps.map(g=>g.emoji)}/>
        <div style={{marginTop:14}}>
          {gaps.map((g,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
              <span style={{fontSize:15,width:22,textAlign:"center"}}>{g.emoji}</span>
              <div style={{flex:1,height:18,background:G.surface,borderRadius:99,border:`1.5px solid ${G.border}`,overflow:"hidden"}}>
                <div style={{width:`${Math.max(2,(g.gapH/maxV)*100)}%`,height:"100%",background:kid.color,borderRadius:99,minWidth:4}}/>
              </div>
              <span style={{fontSize:11,fontWeight:700,color:G.green1,fontFamily:"Quicksand",width:34,textAlign:"right",flexShrink:0}}>{fmtH(g.gapH)}</span>
              <span style={{fontSize:10,color:G.green4,fontFamily:"Quicksand",width:70,flexShrink:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{g.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:14}}>
        {kids.map(k=><button key={k.id} style={{padding:"5px 12px",borderRadius:99,border:`2px solid ${selected===k.id?k.color:G.border}`,background:selected===k.id?k.color:G.surface,color:selected===k.id?"white":G.green1,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"Nunito"}} onClick={()=>setSelected(k.id)}>{k.avatar} {k.name}</button>)}
      </div>
      {kids.filter(k=>k.id===selected).map(k=><div key={k.id}>{kidView(k)}</div>)}
    </div>
  );
}

/* ── Bottleneck Chart ─────────────────────────────────────────────── */
function BottleneckChart({chores,kids}) {
  const completed=chores.filter(c=>c.status==="done"&&c.startedAt&&c.completedAt);
  if (!completed.length) return <div style={{color:G.green4,fontSize:13,padding:"20px 0",fontFamily:"Quicksand",fontWeight:600,textAlign:"center"}}>No timing data yet.</div>;
  const withDur=completed.map(c=>({...c,durH:Math.max(0.05,(c.completedAt-c.startedAt)/3600000),kid:kids.find(k=>k.id===c.kidIds[0])})).filter(c=>c.kid);
  const perKid=kids.map(kid=>{
    const kc=withDur.filter(c=>c.kidIds.includes(kid.id));
    if (!kc.length) return null;
    return {label:`${kid.avatar} ${kid.name}`,avg:kc.reduce((s,c)=>s+c.durH,0)/kc.length,count:kc.length,color:kid.color};
  }).filter(Boolean).sort((a,b)=>b.avg-a.avg);
  const choreMap={};
  withDur.forEach(c=>{ if (!choreMap[c.name]) choreMap[c.name]={name:c.name,emoji:c.emoji,durs:[]}; choreMap[c.name].durs.push(c.durH); });
  const perChore=Object.values(choreMap).map(c=>({...c,avg:c.durs.reduce((a,b)=>a+b,0)/c.durs.length,count:c.durs.length})).sort((a,b)=>b.avg-a.avg);
  const maxAll=Math.max(...perKid.map(x=>x.avg),...perChore.map(x=>x.avg),0.1);
  const fmtDur=h=>h<1?`${Math.round(h*60)}m`:`${h.toFixed(1)}h`;
  const Bar=({label,avg,color,count})=>{
    const pct=Math.max(2,(avg/maxAll)*100),isHot=avg>(maxAll*0.65);
    return (
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
        <div style={{width:110,textAlign:"right",fontSize:12,fontWeight:700,color:G.text,fontFamily:"Quicksand",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flexShrink:0}}>{label}</div>
        <div style={{flex:1,position:"relative",height:22,background:G.surface,borderRadius:99,border:`1.5px solid ${G.border}`,overflow:"hidden"}}>
          <div style={{width:`${pct}%`,height:"100%",background:isHot?`linear-gradient(90deg,${color},#f59e0b)`:`linear-gradient(90deg,${color}99,${color})`,borderRadius:99,minWidth:6,transition:"width 0.5s"}}/>
          <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",fontSize:10,fontWeight:800,color:isHot?"#92400e":G.green1,fontFamily:"Quicksand"}}>{fmtDur(avg)}{isHot?" ⚠️":""}</span>
        </div>
        <div style={{width:38,fontSize:10,color:G.green4,fontFamily:"Quicksand",fontWeight:600,flexShrink:0}}>n={count}</div>
      </div>
    );
  };
  return (
    <div>
      <div style={{fontWeight:800,fontSize:13,color:G.green1,marginBottom:10,fontFamily:"Nunito"}}>⏱ By Kid</div>
      {perKid.map((x,i)=><Bar key={i} {...x}/>)}
      <div style={{fontWeight:800,fontSize:13,color:G.green1,margin:"18px 0 10px",fontFamily:"Nunito"}}>🔍 By Chore — Slowest First</div>
      {perChore.map((x,i)=><Bar key={i} label={`${x.emoji} ${x.name}`} avg={x.avg} color={G.green2} count={x.count}/>)}
    </div>
  );
}

/* ── Chore Timer ──────────────────────────────────────────────────── */
function ChoreTimer({startedAt,color}) {
  const [elapsed,setElapsed]=useState(startedAt?Math.floor((Date.now()-startedAt)/1000):0);
  useEffect(()=>{
    if (!startedAt) return;
    const iv=setInterval(()=>setElapsed(Math.floor((Date.now()-startedAt)/1000)),1000);
    return ()=>clearInterval(iv);
  },[startedAt]);
  const h=Math.floor(elapsed/3600),m=Math.floor((elapsed%3600)/60),s=elapsed%60;
  const fmt=h>0?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  const isLong=elapsed>1800;
  return (
    <div style={{display:"inline-flex",alignItems:"center",gap:4,background:isLong?"#fef9c3":"#f0fdf4",border:`1.5px solid ${isLong?"#fde047":G.border}`,borderRadius:99,padding:"2px 9px",fontSize:11,fontWeight:900,fontFamily:"monospace",color:isLong?"#854d0e":color,marginTop:4}}>
      <span style={{fontSize:9}}>{isLong?"⏰":"⏱"}</span>{fmt}
    </div>
  );
}

/* ── Countdown Widget ─────────────────────────────────────────────── */
function CountdownWidget({compact}) {
  const {disp,pct,running,finished,bellRinging,start,stop,reset,setPreset,applyCustom,stopBell}=useContext(TimerCtx);
  const [customMin,setCustomMin]=useState("10");
  const [customSec,setCustomSec]=useState("00");
  const h=Math.floor(disp/3600),m=Math.floor((disp%3600)/60),s=disp%60;
  const fmt=h>0?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  const circumference=2*Math.PI*44;
  const strokeDash=circumference*(pct/100);
  const ringColor=finished?"#ef4444":pct<20?"#f59e0b":G.green2;

  if (compact) return (
    <div style={{display:"flex",alignItems:"center",gap:5}}>
      {bellRinging&&(
        <button onClick={stopBell} style={{background:"#fef2f2",border:"2px solid #fca5a5",borderRadius:99,padding:"4px 10px",fontSize:12,fontWeight:900,cursor:"pointer",color:"#ef4444",fontFamily:"Nunito",animation:"pulse 0.5s ease-in-out infinite",display:"flex",alignItems:"center",gap:4}}>
          🔔 Stop Bell
        </button>
      )}
      <div style={{display:"flex",alignItems:"center",gap:7,background:bellRinging?"#fef2f2":finished?"#fef2f2":running?"#f0fdf4":"white",border:`2px solid ${bellRinging?"#fca5a5":finished?"#fca5a5":running?G.green3:G.border}`,borderRadius:13,padding:"5px 10px",cursor:"pointer"}} onClick={()=>bellRinging?stopBell():running?stop():start()}>
        <svg width="28" height="28" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke={G.border} strokeWidth="12"/>
          <circle cx="50" cy="50" r="44" fill="none" stroke={ringColor} strokeWidth="12" strokeDasharray={`${strokeDash} ${circumference}`} strokeLinecap="round" transform="rotate(-90 50 50)" style={{transition:"stroke-dasharray 0.9s linear,stroke 0.3s"}}/>
        </svg>
        <div>
          <div style={{fontFamily:"monospace",fontWeight:900,fontSize:finished?10:14,color:bellRinging?"#ef4444":finished?"#ef4444":running?G.green1:"#888",lineHeight:1}}>{bellRinging?"🔔 Ringing":finished?"Done!":fmt}</div>
          <div style={{fontSize:9,color:G.green4,fontFamily:"Quicksand",fontWeight:600}}>{bellRinging?"tap to stop":running?"pause":"start"}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{background:G.surface,border:`2px solid ${bellRinging?"#fca5a5":G.border}`,borderRadius:20,padding:20,marginBottom:20,transition:"border-color 0.3s"}}>
      <div style={{fontWeight:900,fontSize:16,color:G.green1,marginBottom:12,fontFamily:"Nunito",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        ⏳ Parent Countdown Timer
        {bellRinging&&(
          <button onClick={stopBell} style={{background:"#fef2f2",border:"2px solid #ef4444",borderRadius:99,padding:"5px 14px",fontSize:13,fontWeight:900,cursor:"pointer",color:"#ef4444",fontFamily:"Nunito",display:"flex",alignItems:"center",gap:6}}>
            🔔 Stop Bell
          </button>
        )}
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
        {[5,10,15,20,30,45,60].map(p=>(
          <button key={p} style={{padding:"4px 10px",borderRadius:99,border:`1.5px solid ${G.border}`,background:"white",color:G.green1,fontSize:11,fontWeight:800,cursor:"pointer",fontFamily:"Nunito"}} onClick={()=>setPreset(p)}>{p}m</button>
        ))}
      </div>
      <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:14}}>
        <input type="number" min="0" max="99" value={customMin} onChange={e=>setCustomMin(e.target.value)} style={{width:48,border:`2px solid ${G.border}`,borderRadius:8,padding:"4px 6px",fontSize:14,fontFamily:"Nunito",fontWeight:800,color:G.text,textAlign:"center",outline:"none"}}/>
        <span style={{fontWeight:900,color:G.green1,fontSize:16}}>:</span>
        <input type="number" min="0" max="59" value={customSec} onChange={e=>setCustomSec(e.target.value)} style={{width:48,border:`2px solid ${G.border}`,borderRadius:8,padding:"4px 6px",fontSize:14,fontFamily:"Nunito",fontWeight:800,color:G.text,textAlign:"center",outline:"none"}}/>
        <button onClick={()=>applyCustom(parseInt(customMin)||0,parseInt(customSec)||0)} style={{padding:"4px 10px",borderRadius:8,border:`1.5px solid ${G.green2}`,background:G.green5,color:G.green1,fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"Nunito"}}>Set</button>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:18}}>
        <div style={{position:"relative",width:96,height:96,flexShrink:0}}>
          <svg width="96" height="96" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" fill="none" stroke={G.border} strokeWidth="8"/>
            <circle cx="50" cy="50" r="44" fill="none" stroke={ringColor} strokeWidth="8" strokeDasharray={`${strokeDash} ${circumference}`} strokeLinecap="round" transform="rotate(-90 50 50)" style={{transition:"stroke-dasharray 0.9s linear,stroke 0.3s"}}/>
          </svg>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <span style={{fontFamily:"monospace",fontWeight:900,fontSize:bellRinging?11:finished?11:16,color:bellRinging?"#ef4444":finished?"#ef4444":G.green1,textAlign:"center"}}>{bellRinging?"🔔 Ringing!":finished?"🔔 Done!":fmt}</span>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,flex:1}}>
          {bellRinging
            ? <button onClick={stopBell} style={{padding:"8px 0",borderRadius:12,border:"none",background:"#ef4444",color:"white",fontWeight:900,fontSize:14,cursor:"pointer",fontFamily:"Nunito"}}>🔕 Stop Bell</button>
            : !running
              ? <button onClick={()=>start()} disabled={disp<=0} style={{padding:"8px 0",borderRadius:12,border:"none",background:G.green1,color:"white",fontWeight:900,fontSize:14,cursor:"pointer",fontFamily:"Nunito",opacity:disp<=0?0.4:1}}>▶ Start</button>
              : <button onClick={stop} style={{padding:"8px 0",borderRadius:12,border:"none",background:"#f59e0b",color:"white",fontWeight:900,fontSize:14,cursor:"pointer",fontFamily:"Nunito"}}>⏸ Pause</button>}
          <button onClick={reset} style={{padding:"8px 0",borderRadius:12,border:`1.5px solid ${G.border}`,background:"white",color:G.green1,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"Nunito"}}>↺ Reset</button>
        </div>
      </div>
    </div>
  );
}

/* ── Template Manager ─────────────────────────────────────────────── */
function TemplateManager({templates,setTemplates,onClose}) {
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState({name:"",pts:5,emoji:"⭐"});
  const [adding,setAdding]=useState(false);
  const ri={border:`1.5px solid ${G.border}`,borderRadius:8,padding:"4px 8px",fontSize:13,fontFamily:"Nunito",fontWeight:700,color:G.text,outline:"none"};
  const startEdit=t=>{ setEditing(t.id); setForm({name:t.name,pts:t.pts,emoji:t.emoji}); setAdding(false); };
  const saveEdit=()=>{ if (!form.name) return; setTemplates(p=>p.map(t=>t.id===editing?{...t,...form,pts:Number(form.pts)}:t)); setEditing(null); };
  const saveAdd=()=>{ if (!form.name) return; setTemplates(p=>[...p,{id:uid(),name:form.name,pts:Number(form.pts),emoji:form.emoji}]); setAdding(false); setForm({name:"",pts:5,emoji:"⭐"}); };
  return (
    <div>
      <div style={{fontWeight:900,fontSize:18,color:G.green1,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        🛠 Manage Quick Chores
        <button onClick={onClose} style={{background:G.green5,border:`1.5px solid ${G.border}`,borderRadius:99,padding:"4px 12px",fontSize:12,fontWeight:800,cursor:"pointer",color:G.green1,fontFamily:"Nunito"}}>← Back</button>
      </div>
      <div style={{maxHeight:340,overflowY:"auto",marginBottom:12}}>
        {templates.map(t=>(
          <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:`1px solid ${G.border}`}}>
            {editing===t.id
              ? <div style={{display:"flex",gap:5,flex:1,alignItems:"center",flexWrap:"wrap"}}>
                  <input style={{...ri,width:36}} value={form.emoji} onChange={e=>setForm(f=>({...f,emoji:e.target.value}))}/>
                  <input style={{...ri,flex:1,minWidth:90}} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
                  <input style={{...ri,width:46}} type="number" min={1} max={100} value={form.pts} onChange={e=>setForm(f=>({...f,pts:e.target.value}))}/>
                  <button onClick={saveEdit} style={{background:G.green1,color:"white",border:"none",borderRadius:8,padding:"4px 10px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"Nunito"}}>✓</button>
                  <button onClick={()=>setEditing(null)} style={{background:G.green5,border:`1.5px solid ${G.border}`,borderRadius:8,padding:"4px 10px",fontSize:12,fontWeight:800,cursor:"pointer",color:G.text,fontFamily:"Nunito"}}>✕</button>
                </div>
              : <>
                  <span style={{fontSize:18,width:26}}>{t.emoji}</span>
                  <span style={{flex:1,fontWeight:700,fontSize:13,color:G.text,fontFamily:"Quicksand"}}>{t.name}</span>
                  <span style={{background:G.green5,color:G.green1,fontWeight:900,fontSize:11,borderRadius:99,padding:"1px 8px"}}>⭐{t.pts}</span>
                  <button onClick={()=>startEdit(t)} style={{background:"white",border:`1.5px solid ${G.border}`,borderRadius:8,padding:"3px 7px",fontSize:11,fontWeight:800,cursor:"pointer",color:G.green1,fontFamily:"Nunito"}}>✏️</button>
                  <button onClick={()=>setTemplates(p=>p.filter(x=>x.id!==t.id))} style={{background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:8,padding:"3px 7px",fontSize:11,fontWeight:800,cursor:"pointer",color:"#ef4444",fontFamily:"Nunito"}}>🗑</button>
                </>}
          </div>
        ))}
      </div>
      {adding
        ? <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap",padding:"10px 0",borderTop:`1.5px dashed ${G.green3}`}}>
            <input style={{...ri,width:36}} value={form.emoji} onChange={e=>setForm(f=>({...f,emoji:e.target.value}))} placeholder="🎯"/>
            <input style={{...ri,flex:1,minWidth:90}} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Chore name"/>
            <input style={{...ri,width:46}} type="number" min={1} max={100} value={form.pts} onChange={e=>setForm(f=>({...f,pts:e.target.value}))}/>
            <button onClick={saveAdd} style={{background:G.green1,color:"white",border:"none",borderRadius:8,padding:"5px 11px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"Nunito"}}>Add ✓</button>
            <button onClick={()=>setAdding(false)} style={{background:G.green5,border:`1.5px solid ${G.border}`,borderRadius:8,padding:"5px 9px",fontSize:12,fontWeight:800,cursor:"pointer",color:G.text,fontFamily:"Nunito"}}>✕</button>
          </div>
        : <button onClick={()=>setAdding(true)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:12,border:`2px dashed ${G.green3}`,background:"white",color:G.green2,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"Nunito",marginTop:4}}>＋ Add Template</button>}
    </div>
  );
}

/* ── Reward System ────────────────────────────────────────────────── */
function RewardManager({rewards,setRewards,onClose}) {
  const [form,setForm]=useState({name:"",pts:50,emoji:"🎁",expireDays:""});
  const EMOJIS=["🎁","🍕","🎮","🎬","🛍️","🏖️","🎉","🍦","📱","🎨","⭐","🏆","🍿","🎯","🧁"];
  const save=()=>{
    if (!form.name||form.pts<1) return;
    setRewards(p=>[...p,{id:uid(),name:form.name,pts:Number(form.pts),emoji:form.emoji,expireDays:form.expireDays?Number(form.expireDays):null}]);
    setForm({name:"",pts:50,emoji:"🎁",expireDays:""});
  };
  const ri={border:`1.5px solid ${G.border}`,borderRadius:8,padding:"5px 8px",fontSize:13,fontFamily:"Nunito",fontWeight:700,color:G.text,outline:"none"};
  return (
    <div>
      <div style={{fontWeight:900,fontSize:18,color:G.green1,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        🏆 Manage Rewards
        <button onClick={onClose} style={{background:G.green5,border:`1.5px solid ${G.border}`,borderRadius:99,padding:"4px 12px",fontSize:12,fontWeight:800,cursor:"pointer",color:G.green1,fontFamily:"Nunito"}}>← Back</button>
      </div>
      <div style={{maxHeight:300,overflowY:"auto",marginBottom:12}}>
        {rewards.map(r=>(
          <div key={r.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:`1px solid ${G.border}`}}>
            <span style={{fontSize:20}}>{r.emoji}</span>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13,color:G.text,fontFamily:"Quicksand"}}>{r.name}</div>
              <div style={{display:"flex",gap:6,marginTop:2,flexWrap:"wrap"}}>
                <span style={{background:"#fef9c3",color:"#854d0e",fontWeight:900,fontSize:10,borderRadius:99,padding:"1px 7px"}}>⭐{r.pts} pts</span>
                {r.expireDays
                  ? <span style={{background:"#fef2f2",color:"#ef4444",fontWeight:700,fontSize:10,borderRadius:99,padding:"1px 7px"}}>⏳ expires in {r.expireDays}d</span>
                  : <span style={{background:G.green5,color:G.green1,fontWeight:700,fontSize:10,borderRadius:99,padding:"1px 7px"}}>🔄 no expiry</span>}
              </div>
            </div>
            <button onClick={()=>setRewards(p=>p.filter(x=>x.id!==r.id))} style={{background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:8,padding:"3px 7px",fontSize:11,fontWeight:800,cursor:"pointer",color:"#ef4444",fontFamily:"Nunito"}}>🗑</button>
          </div>
        ))}
        {!rewards.length&&<div style={{color:G.green4,fontSize:13,padding:"10px 0",fontFamily:"Quicksand",fontWeight:600}}>No rewards yet. Add some below!</div>}
      </div>
      <div style={{borderTop:`1.5px dashed ${G.green3}`,paddingTop:12}}>
        <div style={{fontSize:10,fontWeight:800,color:G.green4,letterSpacing:1,marginBottom:7}}>NEW REWARD</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
          {EMOJIS.map(e=><button key={e} onClick={()=>setForm(f=>({...f,emoji:e}))} style={{fontSize:17,background:form.emoji===e?G.green5:"white",border:`2px solid ${form.emoji===e?G.green2:G.border}`,borderRadius:8,width:35,height:35,cursor:"pointer"}}>{e}</button>)}
        </div>
        <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Reward name (e.g. Pizza Night)" style={{width:"100%",border:`2px solid ${G.border}`,borderRadius:10,padding:"7px 10px",fontSize:13,fontFamily:"Nunito",fontWeight:700,color:G.text,outline:"none",boxSizing:"border-box",marginBottom:8}}/>
        <div style={{display:"flex",gap:7,alignItems:"center",marginBottom:8}}>
          <span style={{fontSize:12,fontWeight:700,color:G.text,whiteSpace:"nowrap"}}>⭐ pts needed:</span>
          <input type="number" min={1} max={9999} value={form.pts} onChange={e=>setForm(f=>({...f,pts:e.target.value}))} style={{...ri,width:64,textAlign:"center"}}/>
        </div>
        <div style={{display:"flex",gap:7,alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:12,fontWeight:700,color:G.text,whiteSpace:"nowrap"}}>⏳ expires after:</span>
          <input type="number" min={1} max={365} value={form.expireDays} placeholder="days (optional)" onChange={e=>setForm(f=>({...f,expireDays:e.target.value}))} style={{...ri,flex:1,textAlign:"center"}}/>
          <span style={{fontSize:11,color:G.green4,fontFamily:"Quicksand",fontWeight:600,whiteSpace:"nowrap"}}>days (blank = none)</span>
        </div>
        <div style={{background:G.green5,borderRadius:10,padding:"8px 12px",marginBottom:12,fontSize:11,color:G.text,fontFamily:"Quicksand",fontWeight:600,lineHeight:1.6}}>
          💡 <b>Expiry:</b> if a redeemed reward isn't used within the set days, points must be accumulated again before it can be redeemed. <b>Chart points are never affected.</b>
        </div>
        <button onClick={save} style={{display:"block",width:"100%",padding:"8px 0",borderRadius:10,border:"none",background:G.green1,color:"white",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"Nunito"}}>Add Reward ✓</button>
      </div>
    </div>
  );
}

/* ── Reassign Modal (needs own hook scope) ────────────────────────── */
function ReassignModal({chore,kids,onSave,onClose,btn,G}) {
  const [sel,setSel]=useState(chore?[...chore.kidIds]:[]);
  if (!chore) return null;
  return <>
    <div style={{fontWeight:900,fontSize:18,color:G.green1,marginBottom:11}}>↔ Assign Chore</div>
    <div style={{background:G.green5,borderRadius:11,padding:"9px 13px",marginBottom:13,display:"flex",alignItems:"center",gap:7}}>
      <span style={{fontSize:20}}>{chore.emoji}</span>
      <div><div style={{fontWeight:800,color:G.green1,fontSize:13}}>{chore.name}</div><div style={{fontSize:11,color:G.green4,fontFamily:"Quicksand",fontWeight:600}}>⭐{chore.pts} pts</div></div>
    </div>
    <div style={{fontSize:10,fontWeight:800,color:G.green4,letterSpacing:1,marginBottom:7}}>ASSIGN TO (one or more)</div>
    {kids.map(k=>{
      const isSel=sel.includes(k.id);
      return (
        <button key={k.id} onClick={()=>setSel(s=>s.includes(k.id)?s.filter(x=>x!==k.id):[...s,k.id])}
          style={{display:"flex",alignItems:"center",gap:9,width:"100%",background:isSel?k.color+"18":"white",border:`2px solid ${isSel?k.color:G.border}`,borderRadius:11,padding:"9px 13px",marginBottom:7,cursor:"pointer",fontFamily:"Nunito",fontWeight:800,color:G.green1,fontSize:13,boxSizing:"border-box"}}>
          <span style={{fontSize:20}}>{k.avatar}</span><span style={{color:k.color}}>{k.name}</span>
          {isSel&&<span style={{marginLeft:"auto",fontSize:12,color:k.color}}>✓</span>}
        </button>
      );
    })}
    <div style={{display:"flex",gap:7,marginTop:3}}>
      <button style={{...btn(G.green4,G.green5),flex:1,padding:"9px 0",fontSize:13}} onClick={onClose}>Cancel</button>
      <button style={{...btn(G.green1),flex:1,padding:"9px 0",fontSize:13}} disabled={!sel.length} onClick={()=>onSave(chore.id,sel)}>Save ✓</button>
    </div>
  </>;
}

/* ── Seed data ────────────────────────────────────────────────────── */
const NOW=Date.now(), HR=3600000;
const INIT_KIDS=[
  {id:"k1",name:"Alex",  avatar:"🦁",color:"#ef4444"},
  {id:"k2",name:"Sam",   avatar:"🐼",color:"#3b82f6"},
  {id:"k3",name:"Jordan",avatar:"🦊",color:"#8b5cf6"},
];
const INIT_REWARDS=[
  {id:"r1",name:"Pizza Night",pts:50,emoji:"🍕",expireDays:7},
  {id:"r2",name:"Movie Night",pts:40,emoji:"🎬",expireDays:14},
  {id:"r3",name:"Extra Screen Time",pts:30,emoji:"🎮",expireDays:null},
  {id:"r4",name:"Choose Dinner",pts:25,emoji:"🍦",expireDays:null},
];
function makeC(id,name,pts,emoji,status,kidIds,dko,startH,doneH) {
  const today=getToday();
  const dk=dateKey(addDays(today,dko||0));
  return {id,name,pts,emoji,status,kidIds,dateKey:dk,
    startedAt:startH!=null?NOW-startH*HR:null,
    completedAt:doneH!=null?NOW-doneH*HR:null};
}
const INIT_CHORES=[
  makeC("c1","Make Bed",5,"🛏️","todo",["k1"],0,null,null),
  makeC("c2","Wash Dishes",10,"🍽️","todo",["k2"],0,null,null),
  makeC("c3","Vacuum Room",15,"🧹","inprogress",["k1"],0,2,null),
  makeC("c4","Feed Pet",8,"🐾","inprogress",["k3"],0,0.5,null),
  makeC("c5","Set Table",5,"🍴","done",["k2"],0,50,49),
  makeC("c6","Water Plants",7,"🌿","done",["k1"],-1,75,72),
  makeC("c7","Read 30 min",12,"📚","done",["k3"],-1,96.5,95),
  makeC("c8","Take Out Trash",10,"🗑️","done",["k1"],-2,121.5,120),
  makeC("c9","Do Laundry",20,"👕","done",["k2"],-2,148,144),
  makeC("c10","Clean Bathroom",20,"🚿","done",["k3"],-3,170.5,168),
  makeC("c11","Tidy Room",8,"🧺","done",["k1"],-3,193,192),
  makeC("c12","Sweep Floor",9,"🫧","done",["k2"],-4,217,216),
  makeC("c13","Make Bed",5,"🛏️","todo",["k1","k2"],1,null,null),
  makeC("c14","Read 30 min",12,"📚","todo",["k3"],2,null,null),
];

/* ══════════════════════════════════════════════════════════════════
   MAIN APP
   ══════════════════════════════════════════════════════════════════ */
function AppInner() {
  const [kids,setKids]           = useState(INIT_KIDS);
  const [chores,setChores]       = useState(INIT_CHORES);
  const [templates,setTemplates] = useState(DEFAULT_TEMPLATES);
  const [rewards,setRewards]     = useState(INIT_REWARDS);
  // redemptions: {id, kidId, rewardId, redeemedAt}
  const [redemptions,setRedemptions] = useState([]);

  const [view,setView]       = useState("kanban");
  const [chartTab,setChartTab] = useState("daily");
  const [filterKid,setFilterKid] = useState(null);
  const [dragId,setDragId]   = useState(null);
  const [modal,setModal]     = useState(null);
  const [confetti,setConfetti] = useState([]);
  const [selectedDate,setSelectedDate] = useState(new Date());

  // form states — batch chore assignment
  const EMPTY_CUSTOM = {name:"",pts:5,emoji:"⭐"};
  const [choreQueue,setChoreQueue]   = useState([]); // [{id,name,pts,emoji,kidIds:[]}]
  const [choreDateOffset,setChoreDateOffset] = useState(0);
  const [customChore,setCustomChore] = useState(EMPTY_CUSTOM);
  const [newKid,setNewKid]           = useState({name:"",avatar:"🦁",color:"#ef4444"});
  const [reassignId,setReassignId]   = useState(null);
  const [deleteKidId,setDeleteKidId] = useState(null);
  const [redeemKidId,setRedeemKidId] = useState(null);
  const [showDatePicker,setShowDatePicker] = useState(false);

  const todayDate = getToday();
  const selKey    = dateKey(selectedDate);
  const todayKey  = dateKey(todayDate);
  const isFuture  = selKey > todayKey;
  const isPast    = selKey < todayKey;

  const kidById  = id=>kids.find(k=>k.id===id);

  // Raw chart pts — NEVER decremented, used only for I-MR / bottleneck charts
  const totalPts = kidId=>chores
    .filter(c=>c.kidIds.includes(kidId)&&c.status==="done")
    .reduce((s,c)=>s+c.pts,0);

  // Total pts spent on redemptions for a kid
  const totalSpent = kidId=>redemptions
    .filter(r=>r.kidId===kidId)
    .reduce((s,r)=>{ const rw=rewards.find(x=>x.id===r.rewardId); return s+(rw?rw.pts:0); },0);

  // Spendable balance = earned − spent  (used for locking/unlocking rewards)
  const spendablePts = kidId=>Math.max(0, totalPts(kidId) - totalSpent(kidId));

  const redemptionCount = (kidId,rewardId)=>redemptions.filter(r=>r.kidId===kidId&&r.rewardId===rewardId).length;

  // For leaderboard display: show earned (chart) pts
  const earnedPts = kidId=>totalPts(kidId);

  // Reward status for a kid + reward:
  //   locked    — not enough spendable pts
  //   available — enough spendable pts, never redeemed or expiry cycle complete
  //   pending   — redeemed recently, within expiry window (locked from redeeming again)
  //   expired   — redeemed but expiry passed; must re-accumulate (pts since last redeem)
  const getRewardStatus = (kidId, reward) => {
    const balance = spendablePts(kidId);
    const kidReds = [...redemptions.filter(r=>r.kidId===kidId&&r.rewardId===reward.id)]
      .sort((a,b)=>b.redeemedAt-a.redeemedAt);
    const lastRed = kidReds[0];

    // Check expiry on last redemption (if any)
    const isExpired = lastRed && reward.expireDays
      ? Date.now() > lastRed.redeemedAt + reward.expireDays*86400000
      : false;

    // pts earned since last redemption (for re-accumulation progress display)
    const ptsAfterLastRed = lastRed
      ? chores.filter(c=>c.kidIds.includes(kidId)&&c.status==="done"&&c.completedAt&&c.completedAt>lastRed.redeemedAt)
              .reduce((s,c)=>s+c.pts,0)
      : totalPts(kidId);

    // If last redemption is still within expiry window → pending (locked)
    if (lastRed && !isExpired) {
      return { state:"pending", balance, canRedeem:false, lastRed, isExpired:false, ptsAfterLastRed };
    }

    // Expired: need to re-accumulate enough pts since last redemption
    if (isExpired) {
      const canRedeem = ptsAfterLastRed >= reward.pts;
      return { state: canRedeem?"available":"expired", balance, canRedeem, lastRed, isExpired:true, ptsAfterLastRed };
    }

    // Never redeemed or fully cycled — check spendable balance
    const canRedeem = balance >= reward.pts;
    return { state: canRedeem?"available":"locked", balance, canRedeem, lastRed:null, isExpired:false, ptsAfterLastRed };
  };

  const burst=useCallback(()=>{
    const p=Array.from({length:20},(_,i)=>({id:i,x:Math.random()*100,color:ROYGBIV[i%ROYGBIV.length].val,delay:Math.random()*0.3}));
    setConfetti(p); setTimeout(()=>setConfetti([]),2000);
  },[]);

  const moveChore=(choreId,newStatus)=>{
    const chore=chores.find(c=>c.id===choreId);
    if (!chore) return;
    // Block inprogress/done on strictly future dates
    if ((newStatus==="inprogress"||newStatus==="done")&&chore.dateKey>dateKey(getToday())) return;
    setChores(p=>p.map(c=>{
      if (c.id!==choreId) return c;
      const now=Date.now();
      if (newStatus==="done"){ playCheer(); burst(); }
      return {...c,status:newStatus,
        startedAt:newStatus==="inprogress"?now:c.startedAt,
        completedAt:newStatus==="done"?now:(newStatus!=="done"?null:c.completedAt)};
    }));
  };

  const navigateDate=useCallback(dir=>{setSelectedDate(d=>addDays(d,dir));},[]);

  const dayChores=useMemo(()=>{
    return chores.filter(c=>{
      const matchDate=c.dateKey===selKey;
      const matchKid=!filterKid||c.kidIds.includes(filterKid);
      return matchDate&&matchKid;
    });
  },[chores,selKey,filterKid]);

  const handleAddChores=()=>{
    const valid=choreQueue.filter(c=>c.kidIds&&c.kidIds.length>0);
    if (!valid.length) return;
    const dk=dateKey(addDays(todayDate,choreDateOffset));
    const newCards=[];
    valid.forEach(chore=>{
      chore.kidIds.forEach(kidId=>{
        newCards.push({id:uid(),name:chore.name,pts:Number(chore.pts),emoji:chore.emoji,
          status:"todo",kidIds:[kidId],dateKey:dk,startedAt:null,completedAt:null});
      });
    });
    setChores(p=>[...p,...newCards]);
    setModal(null);
    setChoreQueue([]); setChoreDateOffset(0); setCustomChore(EMPTY_CUSTOM);
  };
  const handleAddKid=()=>{
    if (!newKid.name.trim()) return;
    setKids(p=>[...p,{id:uid(),name:newKid.name.trim(),avatar:newKid.avatar,color:newKid.color}]);
    setModal(null); setNewKid({name:"",avatar:"🦁",color:"#ef4444"});
  };
  const handleDeleteKid=id=>{
    setKids(p=>p.filter(k=>k.id!==id));
    setChores(p=>p.map(c=>({...c,kidIds:c.kidIds.filter(k=>k!==id)})).filter(c=>c.kidIds.length>0));
    setRedemptions(p=>p.filter(r=>r.kidId!==id));
    if (filterKid===id) setFilterKid(null);
    setModal(null); setDeleteKidId(null);
  };
  const handleReassign=(choreId,newKidIds)=>{
    setChores(p=>p.map(c=>c.id===choreId?{...c,kidIds:newKidIds}:c));
    setModal(null); setReassignId(null);
  };
  const handleRedeem=(kidId,rewardId)=>{
    const reward=rewards.find(r=>r.id===rewardId);
    if (!reward) return;
    setRedemptions(p=>[...p,{id:uid(),kidId,rewardId,redeemedAt:Date.now()}]);
    playReward(); burst();
    // keep modal open so user sees updated reward state
  };

  const sorted=[...kids].sort((a,b)=>earnedPts(b.id)-earnedPts(a.id));

  // Style helpers
  const pill=(active,color)=>({display:"flex",alignItems:"center",gap:7,padding:"6px 13px",borderRadius:99,background:active?color:G.surface,border:`2px solid ${active?color:G.border}`,cursor:"pointer",fontFamily:"Nunito",fontWeight:800,fontSize:13,color:active?"white":G.green1,boxShadow:active?`0 3px 14px ${color}44`:"none",transition:"all 0.18s",whiteSpace:"nowrap"});
  const btn=(col,bg)=>({background:bg||col,color:bg?col:"white",border:`1.5px solid ${col}`,borderRadius:8,padding:"3px 9px",fontSize:11,fontWeight:800,cursor:"pointer",fontFamily:"Nunito"});
  const inp={width:"100%",border:`2px solid ${G.border}`,borderRadius:10,padding:"8px 11px",fontSize:14,fontFamily:"Nunito",fontWeight:700,color:G.text,outline:"none",boxSizing:"border-box",marginBottom:10};
  const card2={background:G.surface,border:`2px solid ${G.border}`,borderRadius:18,padding:18,marginBottom:16};
  const COLS=[
    {id:"todo",label:"To Do",emoji:"📋",accent:G.border},
    {id:"inprogress",label:"Doing",emoji:"⚡",accent:G.green3},
    {id:"done",label:"Done!",emoji:"🌟",accent:G.green2},
  ];

  return (
    <div style={{minHeight:"100vh",background:G.bg,fontFamily:"Nunito,sans-serif",position:"relative",overflow:"hidden"}}>
      <style>{GFONTS}</style>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.55}}@keyframes fall{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(105vh) rotate(760deg);opacity:0}}.tm-pulse{animation:pulse 2s ease-in-out infinite}`}</style>

      {/* Confetti */}
      {confetti.map(p=>(
        <div key={p.id} style={{position:"fixed",top:0,left:`${p.x}%`,width:10,height:10,borderRadius:2,background:p.color,zIndex:9999,animation:`fall 1.8s ${p.delay}s ease-in forwards`,pointerEvents:"none"}}/>
      ))}

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{background:`linear-gradient(135deg,${G.green1},${G.green2})`,padding:"12px 16px 10px",display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 4px 24px rgba(21,128,61,0.18)",gap:8,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:21,fontWeight:900,color:"white",letterSpacing:-0.5}}>🌱 ChoreBoard</div>
          <div style={{fontSize:9,color:"#bbf7d0",fontWeight:700,letterSpacing:1.5}}>FAMILY CHORE TRACKER</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
          <CountdownWidget compact/>
          <div style={{display:"flex",gap:5}}>
            {["kanban","charts"].map(v=>(
              <button key={v} style={{padding:"6px 13px",borderRadius:99,border:"2px solid",borderColor:view===v?"white":"rgba(255,255,255,0.4)",background:view===v?"white":"transparent",color:view===v?G.green1:"white",fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"Nunito"}} onClick={()=>setView(v)}>
                {v==="kanban"?"📋 Board":"📈 Charts"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Kids bar ───────────────────────────────────────── */}
      <div style={{display:"flex",gap:7,padding:"10px 14px 0",overflowX:"auto",flexWrap:"wrap",alignItems:"center"}}>
        <div style={pill(!filterKid,G.green2)} onClick={()=>setFilterKid(null)}>👨‍👩‍👧‍👦 All</div>
        {kids.map(k=>(
          <div key={k.id} style={pill(filterKid===k.id,k.color)} onClick={()=>setFilterKid(filterKid===k.id?null:k.id)}>
            {k.avatar} {k.name}
            {filterKid===k.id&&<span style={{background:"rgba(255,255,255,0.28)",borderRadius:99,padding:"1px 7px",fontSize:11,fontWeight:900}}>⭐{earnedPts(k.id)}</span>}
            <button style={{background:"rgba(0,0,0,0.12)",border:"none",borderRadius:99,width:15,height:15,fontSize:9,cursor:"pointer",color:"white",fontWeight:900,lineHeight:"15px",padding:0,marginLeft:2}}
              onClick={e=>{e.stopPropagation();setDeleteKidId(k.id);setModal("deleteKid");}}>✕</button>
          </div>
        ))}
        <button style={{...pill(false,G.green2),border:`2px dashed ${G.green3}`,color:G.green2,background:"white"}} onClick={()=>setModal("addKid")}>＋ Kid</button>
      </div>

      {/* ── Leaderboard (with reward badges) ──────────────── */}
      <div style={{display:"flex",gap:8,padding:"8px 14px 0",overflowX:"auto",alignItems:"stretch"}}>
        {sorted.map((k,i)=>{
          const ep=earnedPts(k.id);
          const sp=spendablePts(k.id);
          const kidRedems=redemptions.filter(r=>r.kidId===k.id);
          // next affordable reward = cheapest reward they can't yet afford with spendable pts
          const nextReward=rewards.filter(r=>r.pts>sp).sort((a,b)=>a.pts-b.pts)[0];
          const pctToNext=nextReward?Math.min(100,(sp/nextReward.pts)*100):100;
          return (
            <div key={k.id} style={{display:"flex",flexDirection:"column",gap:4,background:i===0?G.green5:G.surface,border:`1.5px solid ${G.border}`,borderRadius:14,padding:"7px 12px",whiteSpace:"nowrap",minWidth:140,cursor:"pointer"}}
              onClick={()=>{setRedeemKidId(k.id);setModal("redeem");}}>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontSize:12}}>{["🥇","🥈","🥉"][i]||"🏅"}</span>
                <span style={{fontWeight:800,fontSize:12,color:k.color}}>{k.avatar} {k.name}</span>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <span style={{fontWeight:900,fontSize:11,color:G.green2}}>⭐{ep} earned</span>
                <span style={{fontWeight:800,fontSize:11,color:"#f59e0b"}}>💰{sp} avail</span>
              </div>
              {/* Progress to next reward based on spendable */}
              {nextReward&&(
                <div>
                  <div style={{height:5,background:G.border,borderRadius:99,overflow:"hidden"}}>
                    <div style={{width:`${pctToNext}%`,height:"100%",background:k.color,borderRadius:99,transition:"width 0.5s"}}/>
                  </div>
                  <div style={{fontSize:9,color:G.green4,fontFamily:"Quicksand",fontWeight:600,marginTop:2}}>{nextReward.emoji} {nextReward.name} · {sp}/{nextReward.pts}</div>
                </div>
              )}
              {/* Redeemed badges */}
              {kidRedems.length>0&&(
                <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                  {kidRedems.slice(-4).map((r,ri)=>{
                    const rw=rewards.find(x=>x.id===r.rewardId);
                    return rw?<span key={ri} style={{fontSize:13}} title={rw.name}>{rw.emoji}</span>:null;
                  })}
                  {kidRedems.length>4&&<span style={{fontSize:10,color:G.green4,fontFamily:"Quicksand",fontWeight:700}}>+{kidRedems.length-4}</span>}
                </div>
              )}
              <div style={{fontSize:9,color:G.green4,fontFamily:"Quicksand",fontWeight:600}}>tap to redeem</div>
            </div>
          );
        })}
      </div>

      {/* ══ KANBAN ═════════════════════════════════════════ */}
      {view==="kanban"&&(
        <>
          {/* Date nav — arrows only, no swipe */}
          <div style={{display:"flex",alignItems:"center",gap:0,padding:"10px 14px 4px"}}>
            <button onClick={()=>navigateDate(-1)} style={{background:G.surface,border:`1.5px solid ${G.border}`,borderRadius:"10px 0 0 10px",padding:"7px 13px",fontSize:17,cursor:"pointer",color:G.green1,fontWeight:900,lineHeight:1,userSelect:"none"}}>‹</button>
            <div onClick={()=>setShowDatePicker(v=>!v)}
              style={{flex:1,maxWidth:280,background:isTodayDate(selectedDate)?G.green5:isFuture?"#eff6ff":"#fafafa",border:`1.5px solid ${isTodayDate(selectedDate)?G.green2:isFuture?"#93c5fd":G.border}`,borderLeft:"none",borderRight:"none",padding:"7px 12px",cursor:"pointer",textAlign:"center",fontWeight:800,fontSize:13,color:isTodayDate(selectedDate)?G.green1:isFuture?"#1d4ed8":"#555",fontFamily:"Nunito",userSelect:"none"}}>
              {isTodayDate(selectedDate)?"📅 Today — ":isFuture?"🗓 Future — ":"📖 Past — "}{fmtDate(selectedDate)}
              <span style={{fontSize:10,marginLeft:5,opacity:0.7}}>▾</span>
            </div>
            <button onClick={()=>navigateDate(1)} style={{background:G.surface,border:`1.5px solid ${G.border}`,borderRadius:"0 10px 10px 0",padding:"7px 13px",fontSize:17,cursor:"pointer",color:G.green1,fontWeight:900,lineHeight:1,userSelect:"none"}}>›</button>
            <button onClick={()=>{setSelectedDate(new Date());setShowDatePicker(false);}} style={{marginLeft:8,background:G.green1,color:"white",border:"none",borderRadius:9,padding:"7px 11px",fontSize:11,fontWeight:800,cursor:"pointer",fontFamily:"Nunito"}}>Today</button>
          </div>

          {/* Date picker */}
          {showDatePicker&&(
            <div style={{margin:"0 14px 0",background:"white",border:`2px solid ${G.border}`,borderRadius:13,padding:12,boxShadow:"0 4px 20px rgba(0,0,0,0.08)",position:"relative",zIndex:50}}>
              <div style={{fontWeight:800,fontSize:11,color:G.green1,marginBottom:8,fontFamily:"Nunito"}}>Jump to date</div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {Array.from({length:15},(_,i)=>i-7).map(offset=>{
                  const d=addDays(todayDate,offset);
                  const k=dateKey(d);
                  const has=chores.some(c=>c.dateKey===k);
                  const isSel=dateKey(selectedDate)===k;
                  const isFut=dateKey(d)>todayKey;
                  return (
                    <button key={offset} onClick={()=>{setSelectedDate(d);setShowDatePicker(false);}}
                      style={{padding:"4px 9px",borderRadius:9,border:`2px solid ${isSel?G.green2:has?G.green4:G.border}`,background:isSel?G.green2:has?G.green5:"white",color:isSel?"white":isFut?"#1d4ed8":G.green1,fontWeight:800,fontSize:10,cursor:"pointer",fontFamily:"Nunito",position:"relative"}}>
                      {offset===0?"Today":fmtDate(d).replace(/\w+,\s/,"")}
                      {has&&!isSel&&<span style={{position:"absolute",top:1,right:2,width:4,height:4,background:G.green3,borderRadius:"50%"}}/>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Future date notice */}
          {isFuture&&(
            <div style={{margin:"8px 14px 0",background:"#eff6ff",border:"1.5px solid #93c5fd",borderRadius:12,padding:"8px 14px",fontSize:12,color:"#1d4ed8",fontWeight:700,fontFamily:"Quicksand"}}>
              📅 Scheduling mode — chores added here are scheduled for {fmtDate(selectedDate)}. They cannot be started or completed until that day.
            </div>
          )}

          {/* Board */}
          <div style={{display:"flex",gap:13,padding:"10px 14px 80px",overflowX:"auto",alignItems:"flex-start"}}>
            {COLS.map(col=>{
              const cc=dayChores.filter(c=>c.status===col.id);
              return (
                <div key={col.id} style={{flex:"0 0 268px",background:G.surface,border:`2px solid ${col.accent}`,borderRadius:18,padding:11,minHeight:300}}
                  onDragOver={e=>e.preventDefault()}
                  onDrop={()=>{if(dragId){moveChore(dragId,col.id);setDragId(null);}}}>
                  <div style={{fontWeight:900,fontSize:14,color:G.green1,marginBottom:9,display:"flex",alignItems:"center",gap:6}}>
                    {col.emoji} {col.label}
                    <span style={{background:G.green5,borderRadius:99,padding:"1px 7px",fontSize:11,color:G.green2,fontWeight:800}}>{cc.length}</span>
                    {col.id==="done"&&<span style={{marginLeft:"auto",fontSize:11,color:G.green4,fontWeight:700}}>⭐{cc.reduce((s,c)=>s+c.pts,0)}</span>}
                  </div>
                  {cc.map(chore=>{
                    const assignedKids=chore.kidIds.map(id=>kidById(id)).filter(Boolean);
                    return (
                      <div key={chore.id}
                        style={{background:"white",borderRadius:11,border:`1.5px solid ${chore.status==="done"?"#86efac":"#e7f9ee"}`,padding:"9px 11px",marginBottom:8,cursor:isFuture&&col.id!=="todo"?"default":"grab",userSelect:"none",boxShadow:"0 1px 6px rgba(21,128,61,0.07)",opacity:chore.status==="done"?0.86:1}}
                        draggable={!isFuture} onDragStart={()=>!isFuture&&setDragId(chore.id)}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                          <span style={{fontSize:19}}>{chore.emoji}</span>
                          <span style={{background:G.green5,color:G.green1,fontWeight:900,fontSize:11,borderRadius:99,padding:"2px 8px"}}>⭐{chore.pts}</span>
                        </div>
                        <div style={{fontWeight:800,fontSize:13,color:G.text,marginTop:3}}>{chore.name}</div>
                        {chore.status==="inprogress"&&chore.startedAt&&(
                          <div className="tm-pulse"><ChoreTimer startedAt={chore.startedAt} color={assignedKids[0]?.color||G.green2}/></div>
                        )}
                        <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
                          {assignedKids.map(k=>(
                            <span key={k.id} style={{background:k.color+"22",color:k.color,fontWeight:800,fontSize:10,borderRadius:99,padding:"2px 6px",display:"inline-flex",alignItems:"center",gap:2}}>{k.avatar} {k.name}</span>
                          ))}
                          <button style={{...btn(G.green4,G.green5),marginLeft:"auto",fontSize:9,padding:"1px 6px"}} onClick={()=>{setReassignId(chore.id);setModal("reassign");}}>↔</button>
                        </div>
                        <div style={{display:"flex",gap:4,marginTop:7,flexWrap:"wrap"}}>
                          {chore.status!=="todo"&&<button style={btn(G.green4,G.green5)} onClick={()=>moveChore(chore.id,"todo")}>← To Do</button>}
                          {chore.status!=="inprogress"&&!isFuture&&<button style={btn(G.green2,G.green5)} onClick={()=>moveChore(chore.id,"inprogress")}>⚡ Doing</button>}
                          {chore.status!=="done"&&!isFuture&&<button style={btn(G.green1)} onClick={()=>moveChore(chore.id,"done")}>✅ Done</button>}
                          {isFuture&&chore.status==="todo"&&<span style={{fontSize:10,color:"#93c5fd",fontWeight:700,fontFamily:"Quicksand"}}>🗓 Scheduled</span>}
                        </div>
                      </div>
                    );
                  })}
                  {!cc.length&&<div style={{color:G.green4,fontSize:12,fontWeight:600,textAlign:"center",paddingTop:32,fontFamily:"Quicksand"}}>{isFuture?"Schedule here":"Drop here"}</div>}
                </div>
              );
            })}
          </div>
          <button style={{position:"fixed",bottom:22,right:22,background:G.green1,color:"white",border:"none",borderRadius:99,width:52,height:52,fontSize:25,cursor:"pointer",boxShadow:"0 4px 20px rgba(21,128,61,0.35)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:40}} onClick={()=>setModal("addChore")}>＋</button>
        </>
      )}

      {/* ══ CHARTS ═════════════════════════════════════════ */}
      {view==="charts"&&(
        <div style={{padding:"18px 16px 40px"}}>
          <div style={{fontWeight:900,fontSize:20,color:G.green1,marginBottom:4}}>📊 Parent Analytics</div>
          <CountdownWidget/>
          <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
            {[["daily","📅 Daily Pts"],["imr","📈 By Chore"],["between","⏳ Between Tasks"],["bottleneck","⏱ Bottleneck"]].map(([id,lbl])=>(
              <button key={id} style={{padding:"6px 13px",borderRadius:99,border:`2px solid ${chartTab===id?G.green2:G.border}`,background:chartTab===id?G.green5:"white",color:chartTab===id?G.green1:G.green4,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"Nunito"}} onClick={()=>setChartTab(id)}>{lbl}</button>
            ))}
          </div>

          {chartTab==="daily"&&(
            <div style={card2}>
              <div style={{fontWeight:900,fontSize:15,color:G.green1,marginBottom:6}}>📅 Daily Points I-MR</div>
              <div style={{fontSize:12,color:G.green4,fontFamily:"Quicksand",fontWeight:600,marginBottom:10}}>
                "All Kids" view shows <b>n separate data points per day</b> (one per kid), color-coded. Each kid's emoji is the point label.
              </div>
              <DailyPointsChart chores={chores} kids={kids}/>
            </div>
          )}

          {chartTab==="imr"&&(()=>{
            const getAllIMR=()=>[...chores.filter(c=>c.status==="done"&&c.completedAt)].sort((a,b)=>a.completedAt-b.completedAt).map(c=>c.pts);
            const getKidIMR=kid=>[...chores.filter(c=>c.kidIds.includes(kid)&&c.status==="done"&&c.completedAt)].sort((a,b)=>a.completedAt-b.completedAt).map(c=>c.pts);
            return (
              <div style={card2}>
                <div style={{fontWeight:900,fontSize:15,color:G.green1,marginBottom:10}}>📈 I-MR by Chore Completion Order</div>
                <div style={{fontWeight:800,fontSize:13,color:G.green1,marginBottom:8}}>All Kids Combined</div>
                <IMRPanel data={getAllIMR()} color={G.green2} title="All kids chronological"/>
                <div style={{marginTop:16,borderTop:`1.5px dashed ${G.border}`,paddingTop:14}}>
                  {kids.map(k=>{
                    const d=getKidIMR(k.id);
                    return (<div key={k.id} style={{marginBottom:14}}>
                      <div style={{fontWeight:800,fontSize:12,color:k.color,marginBottom:4}}>{k.avatar} {k.name} · ⭐{earnedPts(k.id)}</div>
                      <IMRPanel data={d.length>=2?d:[0,0,0]} color={k.color} title={k.name}/>
                    </div>);
                  })}
                </div>
              </div>
            );
          })()}

          {chartTab==="between"&&(
            <div style={card2}>
              <div style={{fontWeight:900,fontSize:15,color:G.green1,marginBottom:4}}>⏳ Time Between Tasks — Per Kid</div>
              <div style={{fontSize:12,color:G.green4,fontFamily:"Quicksand",fontWeight:600,marginBottom:12}}>Gap between consecutive completed chores for each kid.</div>
              <BetweenChoresChart chores={chores} kids={kids}/>
            </div>
          )}

          {chartTab==="bottleneck"&&(
            <div style={card2}>
              <div style={{fontWeight:900,fontSize:15,color:G.green1,marginBottom:4}}>⏱ Doing→Done Bottlenecks</div>
              <BottleneckChart chores={chores} kids={kids}/>
            </div>
          )}

          <div style={card2}>
            <div style={{fontWeight:800,fontSize:12,color:G.green1,marginBottom:6}}>📖 Chart Guide</div>
            <div style={{fontSize:11,color:G.text,fontFamily:"Quicksand",fontWeight:600,lineHeight:1.9}}>
              <b>Daily I-MR (All):</b> n points/day where n=number of kids, each colored by kid.<br/>
              <b>By Chore:</b> each chore completion = one data point in order.<br/>
              <b>Between Tasks:</b> gap between consecutive completions per kid.<br/>
              <span style={{color:"#ef4444"}}>● Red</span> = out-of-control. <span style={{color:G.green2}}>— Green dashes</span> = average.
            </div>
          </div>
        </div>
      )}

      {/* ══ MODALS ═════════════════════════════════════════ */}
      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.32)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:14}} onClick={()=>setModal(null)}>
          <div style={{background:"white",borderRadius:22,padding:24,width:"100%",maxWidth:400,boxShadow:"0 8px 40px rgba(21,128,61,0.2)",fontFamily:"Nunito",maxHeight:"92vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>

            {/* Add Chore — Batch with per-chore kid assignment */}
            {modal==="addChore"&&(()=>{
              const toggleTemplate=(t)=>{
                setChoreQueue(q=>{
                  const exists=q.find(x=>x.name===t.name);
                  return exists ? q.filter(x=>x.name!==t.name)
                    : [...q,{id:uid(),name:t.name,pts:t.pts,emoji:t.emoji,kidIds:[]}];
                });
              };
              const addCustom=()=>{
                if (!customChore.name.trim()) return;
                setChoreQueue(q=>[...q,{id:uid(),name:customChore.name.trim(),pts:Number(customChore.pts)||5,emoji:customChore.emoji||"⭐",kidIds:[]}]);
                setCustomChore(EMPTY_CUSTOM);
              };
              const removeFromQueue=(id)=>setChoreQueue(q=>q.filter(x=>x.id!==id));
              const toggleChoreKid=(choreId,kidId)=>setChoreQueue(q=>q.map(c=>{
                if (c.id!==choreId) return c;
                const has=c.kidIds.includes(kidId);
                return {...c,kidIds:has?c.kidIds.filter(x=>x!==kidId):[...c.kidIds,kidId]};
              }));
              const setAllKidsForAll=()=>setChoreQueue(q=>q.map(c=>({...c,kidIds:kids.map(k=>k.id)})));
              const clearAllKidsForAll=()=>setChoreQueue(q=>q.map(c=>({...c,kidIds:[]})));

              const totalCards=choreQueue.reduce((s,c)=>s+(c.kidIds?.length||0),0);
              const readyChores=choreQueue.filter(c=>c.kidIds?.length>0).length;

              return <>
                <div style={{fontWeight:900,fontSize:18,color:G.green1,marginBottom:11,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  ➕ Assign Chores
                  <div style={{display:"flex",gap:5}}>
                    <button style={{background:G.green5,border:`1.5px solid ${G.border}`,borderRadius:99,padding:"3px 8px",fontSize:10,fontWeight:800,cursor:"pointer",color:G.green1}} onClick={()=>setModal("manageTemplates")}>🛠</button>
                    <button style={{background:"#fef9c3",border:"1.5px solid #fde047",borderRadius:99,padding:"3px 8px",fontSize:10,fontWeight:800,cursor:"pointer",color:"#854d0e"}} onClick={()=>setModal("manageRewards")}>🏆</button>
                  </div>
                </div>

                {/* ── Step 1: Pick chores ── */}
                <div style={{fontSize:10,fontWeight:800,color:G.green4,letterSpacing:1,marginBottom:6}}>① PICK CHORES</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:9}}>
                  {templates.map(t=>{
                    const inQ=choreQueue.find(x=>x.name===t.name);
                    return (
                      <button key={t.id}
                        style={{background:inQ?G.green1:G.surface,border:`1.5px solid ${inQ?G.green1:G.border}`,borderRadius:99,padding:"4px 9px",fontSize:11,fontWeight:700,color:inQ?"white":G.green1,cursor:"pointer",fontFamily:"Nunito",display:"flex",alignItems:"center",gap:3,transition:"all 0.14s"}}
                        onClick={()=>toggleTemplate(t)}>
                        {inQ&&<span style={{fontSize:9}}>✓</span>}{t.emoji} {t.name} <span style={{fontSize:9,opacity:0.7}}>⭐{t.pts}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{display:"flex",gap:5,marginBottom:12,alignItems:"center"}}>
                  <input style={{...inp,width:40,marginBottom:0,textAlign:"center",padding:"6px 4px"}} placeholder="🎯" value={customChore.emoji} onChange={e=>setCustomChore(c=>({...c,emoji:e.target.value}))}/>
                  <input style={{...inp,flex:1,marginBottom:0}} placeholder="Custom chore…" value={customChore.name} onChange={e=>setCustomChore(c=>({...c,name:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addCustom()}/>
                  <input style={{...inp,width:48,marginBottom:0,textAlign:"center"}} type="number" min={1} max={100} value={customChore.pts} onChange={e=>setCustomChore(c=>({...c,pts:e.target.value}))}/>
                  <button onClick={addCustom} style={{background:G.green1,color:"white",border:"none",borderRadius:9,padding:"7px 10px",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"Nunito",flexShrink:0}}>＋</button>
                </div>

                {/* ── Step 2: Assignment matrix — chores × kids ── */}
                {choreQueue.length>0&&(<>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
                    <div style={{fontSize:10,fontWeight:800,color:G.green4,letterSpacing:1}}>② ASSIGN TO KIDS</div>
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={setAllKidsForAll} style={{fontSize:10,fontWeight:800,color:G.green1,background:G.green5,border:`1px solid ${G.border}`,borderRadius:99,padding:"2px 8px",cursor:"pointer",fontFamily:"Nunito"}}>✓ All</button>
                      <button onClick={clearAllKidsForAll} style={{fontSize:10,fontWeight:800,color:"#9ca3af",background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:99,padding:"2px 8px",cursor:"pointer",fontFamily:"Nunito"}}>✕ Clear</button>
                    </div>
                  </div>

                  {/* Matrix table */}
                  <div style={{overflowX:"auto",marginBottom:12}}>
                    <table style={{width:"100%",borderCollapse:"separate",borderSpacing:0}}>
                      <thead>
                        <tr>
                          {/* Chore label column header */}
                          <th style={{textAlign:"left",padding:"5px 8px 5px 0",fontSize:10,fontWeight:800,color:G.green4,fontFamily:"Quicksand",whiteSpace:"nowrap",minWidth:100}}></th>
                          {/* Kid column headers — each with "assign all" toggle */}
                          {kids.map(k=>{
                            const allAssigned=choreQueue.every(c=>c.kidIds.includes(k.id));
                            return (
                              <th key={k.id} style={{textAlign:"center",padding:"4px 6px",minWidth:60}}>
                                <button onClick={()=>{
                                  if (allAssigned) {
                                    setChoreQueue(q=>q.map(c=>({...c,kidIds:c.kidIds.filter(x=>x!==k.id)})));
                                  } else {
                                    setChoreQueue(q=>q.map(c=>c.kidIds.includes(k.id)?c:{...c,kidIds:[...c.kidIds,k.id]}));
                                  }
                                }} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:allAssigned?k.color:G.surface,border:`2px solid ${allAssigned?k.color:G.border}`,borderRadius:10,padding:"5px 7px",cursor:"pointer",fontFamily:"Nunito",transition:"all 0.13s",width:"100%"}}>
                                  <span style={{fontSize:18,lineHeight:1}}>{k.avatar}</span>
                                  <span style={{fontSize:9,fontWeight:800,color:allAssigned?"white":k.color,whiteSpace:"nowrap"}}>{k.name}</span>
                                  <span style={{fontSize:8,color:allAssigned?"rgba(255,255,255,0.8)":G.green4,fontFamily:"Quicksand",fontWeight:600}}>{allAssigned?"all ✓":"tap all"}</span>
                                </button>
                              </th>
                            );
                          })}
                          {/* Remove column */}
                          <th style={{width:24}}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {choreQueue.map((c,ci)=>(
                          <tr key={c.id} style={{background:ci%2===0?"white":G.surface}}>
                            {/* Chore name cell */}
                            <td style={{padding:"7px 8px 7px 0",fontSize:12,fontWeight:700,color:G.text,fontFamily:"Nunito",whiteSpace:"nowrap"}}>
                              <span style={{marginRight:5}}>{c.emoji}</span>{c.name}
                              <span style={{fontSize:9,color:G.green4,marginLeft:4}}>⭐{c.pts}</span>
                            </td>
                            {/* Kid checkboxes */}
                            {kids.map(k=>{
                              const sel=c.kidIds.includes(k.id);
                              return (
                                <td key={k.id} style={{textAlign:"center",padding:"7px 6px"}}>
                                  <button onClick={()=>toggleChoreKid(c.id,k.id)}
                                    style={{width:32,height:32,borderRadius:8,border:`2px solid ${sel?k.color:G.border}`,background:sel?k.color:"white",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",transition:"all 0.13s"}}>
                                    {sel
                                      ? <span style={{color:"white",fontSize:16,lineHeight:1}}>✓</span>
                                      : <span style={{color:G.border,fontSize:14,lineHeight:1}}>+</span>}
                                  </button>
                                </td>
                              );
                            })}
                            {/* Remove row */}
                            <td style={{textAlign:"center",padding:"7px 2px"}}>
                              <button onClick={()=>removeFromQueue(c.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#fca5a5",fontSize:14,padding:0,fontWeight:900,lineHeight:1}}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Per-chore card count summary */}
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12}}>
                    {choreQueue.map(c=>(
                      <div key={c.id} style={{fontSize:10,fontFamily:"Quicksand",fontWeight:700,color:c.kidIds.length>0?G.green1:"#9ca3af",background:c.kidIds.length>0?G.green5:"#f9fafb",border:`1px solid ${c.kidIds.length>0?G.border:"#e5e7eb"}`,borderRadius:99,padding:"2px 9px"}}>
                        {c.emoji} {c.kidIds.length>0?`→ ${c.kidIds.length} card${c.kidIds.length!==1?"s":""}`:` unassigned`}
                      </div>
                    ))}
                  </div>
                </>)}

                {/* ── Step 3: Schedule ── */}
                <div style={{fontSize:10,fontWeight:800,color:G.green4,letterSpacing:1,marginBottom:6}}>③ SCHEDULE FOR</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:13}}>
                  {[-1,0,1,2,3,4,5,6,7].map(offset=>(
                    <button key={offset} onClick={()=>setChoreDateOffset(offset)}
                      style={{padding:"4px 8px",borderRadius:9,border:`1.5px solid ${choreDateOffset===offset?G.green2:G.border}`,background:choreDateOffset===offset?G.green5:"white",color:choreDateOffset===offset?G.green1:G.text,fontWeight:800,fontSize:10,cursor:"pointer",fontFamily:"Nunito"}}>
                      {offset===-1?"Yesterday":offset===0?"Today":offset===1?"Tomorrow":fmtDate(addDays(todayDate,offset)).replace(/\w+,\s/,"")}
                    </button>
                  ))}
                </div>

                {/* Summary + submit */}
                <div style={{background:totalCards>0?"#fffbeb":G.surface,border:`1.5px solid ${totalCards>0?"#fde047":G.border}`,borderRadius:11,padding:"8px 12px",marginBottom:11,fontSize:11,fontFamily:"Quicksand",fontWeight:700,color:G.text}}>
                  {choreQueue.length===0
                    ? <span style={{color:G.green4}}>Pick at least one chore to get started.</span>
                    : totalCards>0
                      ? <>Will create <b style={{color:G.green1}}>{totalCards} card{totalCards!==1?"s":""}</b> — {readyChores} of {choreQueue.length} chore{choreQueue.length!==1?"s":""} assigned</>
                      : <span style={{color:"#f59e0b"}}>⚠️ Assign at least one kid to each chore.</span>}
                </div>
                <div style={{display:"flex",gap:7}}>
                  <button style={{...btn(G.green4,G.green5),flex:1,padding:"9px 0",fontSize:13}} onClick={()=>setModal(null)}>Cancel</button>
                  <button style={{...btn(G.green1),flex:2,padding:"9px 0",fontSize:13,opacity:totalCards>0?1:0.4,cursor:totalCards>0?"pointer":"not-allowed"}}
                    onClick={handleAddChores}>
                    ✅ Add {totalCards>0?`${totalCards} Card${totalCards!==1?"s":""}`:""}</button>
                </div>
              </>;
            })()}

            {/* Template Manager */}
            {modal==="manageTemplates"&&<TemplateManager templates={templates} setTemplates={setTemplates} onClose={()=>setModal("addChore")}/>}

            {/* Reward Manager */}
            {modal==="manageRewards"&&<RewardManager rewards={rewards} setRewards={setRewards} onClose={()=>setModal("addChore")}/>}

            {/* Add Kid */}
            {modal==="addKid"&&<>
              <div style={{fontWeight:900,fontSize:18,color:G.green1,marginBottom:11}}>👶 Add Kid</div>
              <input style={inp} placeholder="Kid's name…" value={newKid.name} onChange={e=>setNewKid(n=>({...n,name:e.target.value}))}/>
              <div style={{fontSize:10,fontWeight:800,color:G.green4,letterSpacing:1,marginBottom:6}}>AVATAR</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:11}}>
                {KID_AVATARS.map(a=><button key={a} onClick={()=>setNewKid(n=>({...n,avatar:a}))} style={{fontSize:21,background:newKid.avatar===a?G.green5:"white",border:`2px solid ${newKid.avatar===a?G.green2:G.border}`,borderRadius:9,width:38,height:38,cursor:"pointer"}}>{a}</button>)}
              </div>
              <div style={{fontSize:10,fontWeight:800,color:G.green4,letterSpacing:1,marginBottom:7}}>COLOR</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:13}}>
                {ROYGBIV.map(c=><button key={c.val} onClick={()=>setNewKid(n=>({...n,color:c.val}))} title={c.name} style={{width:28,height:28,borderRadius:99,background:c.val,border:`3px solid ${newKid.color===c.val?"#1e293b":"transparent"}`,cursor:"pointer"}}/>)}
              </div>
              <div style={{background:G.green5,borderRadius:11,padding:"9px 13px",marginBottom:13,display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:24}}>{newKid.avatar}</span>
                <span style={{fontWeight:800,color:newKid.color,fontSize:14}}>{newKid.name||"Preview"}</span>
                <span style={{marginLeft:"auto",fontSize:11,background:newKid.color+"22",color:newKid.color,borderRadius:99,padding:"2px 7px",fontWeight:700}}>⭐0 pts</span>
              </div>
              <div style={{display:"flex",gap:7}}>
                <button style={{...btn(G.green4,G.green5),flex:1,padding:"9px 0",fontSize:13}} onClick={()=>setModal(null)}>Cancel</button>
                <button style={{...btn(G.green1),flex:1,padding:"9px 0",fontSize:13}} onClick={handleAddKid}>Add Kid ✓</button>
              </div>
            </>}

            {/* Delete Kid */}
            {modal==="deleteKid"&&(()=>{
              const kid=kids.find(k=>k.id===deleteKidId);
              const n=chores.filter(c=>c.kidIds.includes(deleteKidId)).length;
              return kid&&<>
                <div style={{fontWeight:900,fontSize:18,color:G.green1,marginBottom:11}}>🗑 Remove Kid</div>
                <div style={{background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:11,padding:"11px 13px",marginBottom:13}}>
                  <div style={{fontWeight:800,fontSize:14,color:"#b91c1c"}}>Remove {kid.avatar} {kid.name}?</div>
                  <div style={{fontSize:12,color:"#ef4444",marginTop:3,fontFamily:"Quicksand",fontWeight:600}}>Affects {n} chore{n!==1?"s":""}.</div>
                </div>
                <div style={{display:"flex",gap:7}}>
                  <button style={{...btn(G.green4,G.green5),flex:1,padding:"9px 0",fontSize:13}} onClick={()=>{setModal(null);setDeleteKidId(null);}}>Cancel</button>
                  <button style={{background:"#ef4444",color:"white",border:"none",borderRadius:8,flex:1,padding:"9px 0",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"Nunito"}} onClick={()=>handleDeleteKid(deleteKidId)}>Remove ✓</button>
                </div>
              </>;
            })()}

            {/* Reassign */}
            {modal==="reassign"&&<ReassignModal
              chore={chores.find(c=>c.id===reassignId)}
              kids={kids}
              onSave={handleReassign}
              onClose={()=>setModal(null)}
              btn={btn}
              G={G}
            />}

            {/* Redeem Rewards */}
            {modal==="redeem"&&(()=>{
              const kid=kids.find(k=>k.id===redeemKidId);
              if (!kid) return null;
              const ep=earnedPts(kid.id);
              const sp=spendablePts(kid.id);
              const spent=totalSpent(kid.id);
              const kidRedems=redemptions.filter(r=>r.kidId===kid.id);
              return <>
                {/* Header */}
                <div style={{fontWeight:900,fontSize:18,color:G.green1,marginBottom:11,display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:26}}>{kid.avatar}</span>
                  <div>
                    <div style={{color:kid.color}}>{kid.name}'s Reward Shop</div>
                    <div style={{fontSize:11,color:G.green4,fontFamily:"Quicksand",fontWeight:600}}>⭐ {ep} earned (charts) · 💰 {sp} available · 🎁 {spent} spent</div>
                  </div>
                </div>

                {/* Balance bar */}
                <div style={{background:G.green5,borderRadius:12,padding:"10px 13px",marginBottom:13}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <span style={{fontSize:11,fontWeight:800,color:G.green1,fontFamily:"Quicksand"}}>💰 Spendable Balance</span>
                    <span style={{fontSize:13,fontWeight:900,color:sp>0?G.green1:"#ef4444",fontFamily:"Nunito"}}>
                      {sp} pts
                    </span>
                  </div>
                  <div style={{height:8,background:G.border,borderRadius:99,overflow:"hidden"}}>
                    <div style={{width:ep>0?`${Math.min(100,(sp/ep)*100)}%`:"0%",height:"100%",background:sp>0?kid.color:"#ef4444",borderRadius:99,transition:"width 0.5s"}}/>
                  </div>
                  <div style={{fontSize:10,color:G.green4,fontFamily:"Quicksand",fontWeight:600,marginTop:4}}>
                    Chart pts (⭐{ep}) are never deducted — only your spendable balance (💰{sp}) changes when you redeem.
                  </div>
                </div>

                <div style={{fontWeight:800,fontSize:13,color:G.green1,marginBottom:8}}>Rewards</div>
                {rewards.length===0&&<div style={{color:G.green4,fontSize:13,fontFamily:"Quicksand",padding:"8px 0"}}>No rewards set up yet. Ask a parent to add some!</div>}
                {[...rewards].sort((a,b)=>a.pts-b.pts).map(r=>{
                  const st=getRewardStatus(kid.id,r);
                  const count=redemptionCount(kid.id,r.id);

                  const stateCfg={
                    locked:    {bg:"#f9fafb",border:"#e5e7eb",icon:"🔒",btnBg:"#e5e7eb",btnColor:"#9ca3af",btnLabel:"🔒 Need more pts",locked:true},
                    available: {bg:"#fffbeb",border:"#fde047",icon:"🎁",btnBg:G.green1,btnColor:"white",btnLabel:"🎁 Redeem",locked:false},
                    pending:   {bg:"#f0fdf4",border:G.green3,icon:"✅",btnBg:"#e5e7eb",btnColor:"#9ca3af",btnLabel:"✅ Redeemed",locked:true},
                    expired:   {bg:"#fef2f2",border:"#fca5a5",icon:"⚠️",btnBg:st.canRedeem?G.green1:"#e5e7eb",btnColor:st.canRedeem?"white":"#9ca3af",btnLabel:st.canRedeem?"🔄 Re-Redeem":"🔒 Re-earn pts",locked:!st.canRedeem},
                  }[st.state];

                  return (
                    <div key={r.id} style={{background:stateCfg.bg,border:`2px solid ${stateCfg.border}`,borderRadius:13,padding:"10px 12px",marginBottom:8,opacity:st.state==="locked"?0.72:1,transition:"opacity 0.2s"}}>
                      <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                        <span style={{fontSize:22,marginTop:1}}>{r.emoji}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            <span style={{fontWeight:800,fontSize:13,color:G.text}}>{r.name}</span>
                            <span style={{fontSize:10,fontWeight:700}}>{stateCfg.icon}</span>
                          </div>
                          <div style={{display:"flex",gap:5,marginTop:3,flexWrap:"wrap"}}>
                            <span style={{background:"#fef9c3",color:"#854d0e",fontWeight:900,fontSize:10,borderRadius:99,padding:"1px 7px"}}>⭐{r.pts} pts</span>
                            {r.expireDays
                              ? <span style={{background:"#fef2f2",color:"#ef4444",fontWeight:700,fontSize:10,borderRadius:99,padding:"1px 7px"}}>⏳{r.expireDays}d expiry</span>
                              : <span style={{background:G.green5,color:G.green1,fontWeight:700,fontSize:10,borderRadius:99,padding:"1px 7px"}}>no expiry</span>}
                            {count>0&&<span style={{background:G.green5,color:G.green2,fontWeight:700,fontSize:10,borderRadius:99,padding:"1px 7px"}}>{count}× redeemed</span>}
                          </div>

                          {/* State detail lines */}
                          {st.state==="locked"&&(
                            <div style={{fontSize:10,color:"#9ca3af",fontFamily:"Quicksand",fontWeight:700,marginTop:4}}>
                              Need {r.pts - st.balance} more pts · you have 💰{st.balance}
                              <div style={{height:4,background:"#e5e7eb",borderRadius:99,marginTop:3,overflow:"hidden"}}>
                                <div style={{width:`${Math.min(100,(st.balance/r.pts)*100)}%`,height:"100%",background:"#d1d5db",borderRadius:99}}/>
                              </div>
                            </div>
                          )}
                          {st.state==="available"&&count===0&&(
                            <div style={{fontSize:10,color:G.green1,fontFamily:"Quicksand",fontWeight:700,marginTop:4}}>
                              ✓ You have 💰{st.balance} pts — ready to redeem!
                            </div>
                          )}
                          {st.state==="available"&&count>0&&(
                            <div style={{fontSize:10,color:G.green1,fontFamily:"Quicksand",fontWeight:700,marginTop:4}}>
                              ✓ Re-accumulation complete — ready again!
                            </div>
                          )}
                          {st.state==="pending"&&st.lastRed&&(
                            <div style={{fontSize:10,color:G.green1,fontFamily:"Quicksand",fontWeight:700,marginTop:4}}>
                              Redeemed {new Date(st.lastRed.redeemedAt).toLocaleDateString()}
                              {r.expireDays&&<span style={{color:"#854d0e"}}> · expires {new Date(st.lastRed.redeemedAt+r.expireDays*86400000).toLocaleDateString()}</span>}
                            </div>
                          )}
                          {st.state==="expired"&&(
                            <div style={{fontSize:10,color:"#ef4444",fontFamily:"Quicksand",fontWeight:700,marginTop:4}}>
                              Expired — re-earn pts since last redeem: {st.ptsAfterLastRed}/{r.pts}
                              <div style={{height:4,background:"#fecaca",borderRadius:99,marginTop:3,overflow:"hidden"}}>
                                <div style={{width:`${Math.min(100,(st.ptsAfterLastRed/r.pts)*100)}%`,height:"100%",background:"#ef4444",borderRadius:99}}/>
                              </div>
                            </div>
                          )}
                        </div>
                        <button onClick={()=>!stateCfg.locked&&handleRedeem(kid.id,r.id)}
                          style={{padding:"7px 10px",borderRadius:10,border:"none",background:stateCfg.btnBg,color:stateCfg.btnColor,fontWeight:800,fontSize:10,cursor:stateCfg.locked?"not-allowed":"pointer",fontFamily:"Nunito",whiteSpace:"nowrap",flexShrink:0,marginTop:2}}>
                          {stateCfg.btnLabel}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Redemption history */}
                {kidRedems.length>0&&(
                  <div style={{marginTop:12,borderTop:`1.5px dashed ${G.border}`,paddingTop:11}}>
                    <div style={{fontWeight:800,fontSize:12,color:G.green1,marginBottom:7}}>History</div>
                    {[...kidRedems].reverse().slice(0,8).map((rd,i)=>{
                      const rw=rewards.find(x=>x.id===rd.rewardId);
                      const isExp=rw?.expireDays ? Date.now()>rd.redeemedAt+rw.expireDays*86400000 : false;
                      return rw?<div key={i} style={{display:"flex",alignItems:"center",gap:7,marginBottom:5,fontSize:11,color:G.text,fontFamily:"Quicksand",fontWeight:600}}>
                        <span style={{fontSize:14}}>{rw.emoji}</span>
                        <span>{rw.name}</span>
                        <span style={{fontSize:10,color:"#f59e0b",fontWeight:800}}>−{rw.pts}pts</span>
                        {isExp&&<span style={{fontSize:9,background:"#fef2f2",color:"#ef4444",borderRadius:99,padding:"1px 5px",fontWeight:700}}>expired</span>}
                        <span style={{marginLeft:"auto",color:G.green4,fontSize:10}}>{new Date(rd.redeemedAt).toLocaleDateString()}</span>
                      </div>:null;
                    })}
                  </div>
                )}
                <button style={{...btn(G.green4,G.green5),width:"100%",padding:"9px 0",fontSize:13,marginTop:10,boxSizing:"border-box"}} onClick={()=>setModal(null)}>Close</button>
              </>;
            })()}

          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return <TimerProvider><AppInner/></TimerProvider>;
}