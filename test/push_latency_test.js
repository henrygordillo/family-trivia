// Every beat the room is meant to SEE must push. Without this the shared screen
// only caught up on the 8s heartbeat, so a wrong answer, a steal or the Next
// button could sit several seconds behind the table.
const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const s=html.indexOf('<script>')+8, e=html.lastIndexOf('</script>');
let code=html.slice(s,e).replace(/^\s*init\(\);\s*$/m,'');
code+=`;globalThis.__api={get G(){return G;},publicState,resolveAnswer,refreshBoard,
  goToAnswer,doSteal,noSteal,showFinalReveal,startTimer,
  set timerOn(v){timerOn=v;}, get timerOn(){return timerOn;}};`;

let pushes=0;
const el=()=>({style:new Proxy({},{get:()=>'',set:()=>true}),
  classList:{add(){},remove(){},toggle(){},contains(){return false;}},
  dataset:{},value:'',textContent:'',innerHTML:'',children:[],
  appendChild(){},addEventListener(){},querySelector(){return el();},
  querySelectorAll(){return [];},focus(){},remove(){}});
const sb={document:{getElementById:el,querySelector:el,querySelectorAll:()=>[],
  createElement:el,addEventListener(){},body:el(),head:el(),visibilityState:'visible'},
 window:{addEventListener(){},speechSynthesis:{cancel(){}},history:{pushState(){}}},navigator:{},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},speechSynthesis:{cancel(){}},
 setTimeout:(f)=>{ try{f();}catch(e){} return 0; },clearTimeout(){},
 setInterval:()=>0,clearInterval(){},
 fetch:async(u)=>{ if(/\/state$/.test(String(u))) pushes++; return {ok:true,json:async()=>({})}; },
 console:{log(){},warn(){},error(){}},
 JSON,Date,Set,Map,Math,Array,Object,String,Number,Boolean,RegExp,Promise,Error,
 isNaN,parseInt,parseFloat,encodeURIComponent,Intl,location:{host:'x',origin:'http://x'}};
sb.globalThis=sb; vm.createContext(sb); vm.runInContext(code,sb);
const api=sb.__api, G=api.G;

let fail=0; const chk=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n); if(!c)fail++;};

// Source-level: the beats that mutate visible state must call pushToTV.
const src=html;
const fnPushes=(name)=>{
  const i=src.indexOf('function '+name+'(');
  if(i<0) return false;
  // read to the next top-level function declaration
  const j=src.indexOf('\nfunction ', i+1);
  return src.slice(i, j<0?i+3000:j).includes('pushToTV');
};
for(const f of ['resolveAnswer','refreshBoard','goToAnswer','doSteal','noSteal','showFinalReveal']){
  chk(f+'() tells the room', fnPushes(f));
}

// The killer: these beats must NOT depend on startTimer to push, because
// startTimer returns immediately when the timer setting is off.
{
  const i=src.indexOf('function startTimer(');
  const body=src.slice(i, i+400);
  chk('startTimer still bails early when the timer is off', /if\(!timerOn\) return;/.test(body));
  const ga=src.slice(src.indexOf('function goToAnswer('), src.indexOf('function goToAnswer(')+1400);
  const ds=src.slice(src.indexOf('function doSteal('),   src.indexOf('function doSteal(')+1600);
  const after=(t)=>t.slice(t.lastIndexOf('startTimer('));
  chk('goToAnswer pushes independently of startTimer', after(ga).includes('pushToTV'));
  chk('doSteal pushes independently of startTimer',    after(ds).includes('pushToTV'));
}
// show() sets _inGame, which drives publicState().active — the flag deciding
// whether the other screens display a board at all. A transition that doesn't
// push can strand the room on the wrong screen entirely (the retire-tile path
// did exactly that: show('board') with no push).
chk('show() tells the room', fnPushes('show'));

// Systemic sweep: nothing may mutate a PUBLISHED field without some path to a
// push. Helpers are fine if every caller pushes — this walks the call graph.
{
  const js=src.slice(src.indexOf('<script>')+8, src.lastIndexOf('</script>'));
  const fns={};
  for(const m of js.matchAll(/^(?:async )?function ([A-Za-z_$][\w$]*)\s*\(/gm)){
    const after=js.slice(m.index+m[0].length);
    const nxt=after.search(/^(?:async )?function /m);
    fns[m[1]]=js.slice(m.index, m.index+m[0].length+(nxt<0?after.length:nxt));
  }
  const pub=js.match(/const STATE_PUBLIC = \[([\s\S]*?)\];/)[1];
  const fields=new Set([...pub.matchAll(/'(\w+)'/g)].map(m=>m[1]).concat(['speak','timer']));
  const MUT=/\bG\.(\w+)\s*(?:=(?!=)|\+=|-=|\+\+|--|\.push\(|\.splice\()/g;
  const reaches=(n,seen=new Set(),d=0)=>{
    if(seen.has(n)||d>4) return false;
    seen.add(n);
    const b=fns[n]||'';
    if(b.includes('pushToTV')) return true;
    for(const c of new Set([...b.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1])))
      if(c!==n && fns[c] && reaches(c,seen,d+1)) return true;
    return false;
  };
  // A helper is fine if EVERY caller pushes — or is itself covered the same way.
  // advanceTurnPos is the case that needs the recursion: it's called by
  // autoRotateJudge, which doesn't push, but autoRotateJudge only ever runs
  // inside resolveAnswer and noSteal, which do.
  const callersPush=(t,seen=new Set())=>{
    if(seen.has(t)) return true;
    seen.add(t);
    const callers=Object.entries(fns)
      .filter(([n,b])=>n!==t && new RegExp('\\b'+t+'\\s*\\(').test(b));
    if(!callers.length) return false;
    return callers.every(([n,b])=>b.includes('pushToTV') || callersPush(n,seen));
  };
  const orphans=Object.entries(fns).filter(([n,b])=>{
    const muts=[...b.matchAll(MUT)].map(m=>m[1]).filter(f=>fields.has(f));
    return muts.length && !reaches(n) && !callersPush(n);
  }).map(([n])=>n).filter(n=>!['pickJudge'].includes(n));   // setup-screen only, pre-game
  chk('no function mutates published state with no route to a push'
      +(orphans.length?' — '+JSON.stringify(orphans):''), orphans.length===0);
}

console.log(fail?('\n'+fail+' FAILED'):'\nevery beat reaches the room');
process.exit(fail?1:0);
