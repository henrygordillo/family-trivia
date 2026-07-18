// The join page's connection state machine. This is the part that misbehaved, so
// it gets pinned down: ONLY a genuinely missing room may send a device home.
const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('join.html','utf8');
const s=html.indexOf('<script>')+8, e=html.lastIndexOf('</script>');
let code=html.slice(s,e);
code+=`;globalThis.__api={ tick, startClock, stopClock, backToConnect, listenStream,
  get CODE(){return CODE;}, set CODE(v){CODE=v;},
  get strikes(){return _strikes;}, set strikes(v){_strikes=v;},
  get stale(){return _stale;},
  set lastHeard(v){_lastHeard=v;}, get lastHeard(){return _lastHeard;},
  GONE_STRIKES, STALE_AFTER, GIVE_UP_AFTER, get seq(){return _seq;}, set seq(v){_seq=v;} };`;

let visibility='visible', wentHome=null, fetchMode='ok', polledState=null;
const el=()=>({style:new Proxy({},{get:()=>'',set:()=>true}),classList:{add(){},remove(){},toggle(){},contains(){return false;}},
  dataset:{},value:'',textContent:'',innerHTML:'',appendChild(){},addEventListener(){},
  querySelector(){return el();},querySelectorAll(){return [];},focus(){},remove(){},onclick:null});
const listeners={};
const sb={
  document:{ getElementById:el, querySelector:el, querySelectorAll:()=>[], createElement:el,
    addEventListener:(k,f)=>{ (listeners[k]=listeners[k]||[]).push(f); },
    body:el(), head:el(), get visibilityState(){ return visibility; } },
  window:{addEventListener(){},history:{pushState(){}},location:{origin:'http://x',search:''}},
  navigator:{}, localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  EventSource: function(){ this.readyState=1; this.addEventListener=()=>{}; this.close=()=>{this.readyState=2;}; },
  setTimeout:()=>0, clearTimeout(){}, setInterval:()=>1, clearInterval(){},
  fetch: async()=>{
    if(fetchMode==='ok')      return {ok:true, status:200, json:async()=>({code:'1234',listeners:1,state:polledState})};
    if(fetchMode==='404')     return {ok:false,status:404};
    if(fetchMode==='500')     return {ok:false,status:500};
    throw new Error('network down');           // 'offline'
  },
  console:{log(){},warn(){},error(){}},
  URLSearchParams,URL, location:{origin:'http://x',search:'',protocol:'http:',host:'x'},
  JSON,Date,Set,Map,Math,Array,Object,String,Number,Boolean,RegExp,Promise,Error,isNaN,parseInt,parseFloat,encodeURIComponent,Intl};
sb.globalThis=sb; vm.createContext(sb); vm.runInContext(code,sb);
const api=sb.__api;

// Watch for "went home"
const origBack=api.backToConnect;
sb.__api.backToConnect=(m)=>{ wentHome=m; };
vm.runInContext(`backToConnect = globalThis.__api.backToConnect;`, sb);

const reset=()=>{ wentHome=null; api.CODE='1234'; api.startClock(); api.lastHeard=Date.now(); };
const ticks=async n=>{ for(let i=0;i<n;i++) await api.tick(); };
let pass=true;
const check=(name,cond)=>{ console.log(`  ${cond?'✓':'✗'} ${name}`); if(!cond) pass=false; };

(async()=>{
console.log('Only a missing room may send a device home:\n');

reset(); fetchMode='ok';      await ticks(10);
check('room alive → stays put (10 ticks)', wentHome===null);

reset(); fetchMode='404';     await ticks(api.GONE_STRIKES);
check('room gone → waits, does NOT go home yet (judge may be resuming)', wentHome===null);

reset(); fetchMode='404';     await ticks(api.GONE_STRIKES+api.GIVE_UP_AFTER);
check('room still gone two minutes later → now it goes home', wentHome!==null);

reset(); fetchMode='404';     await ticks(api.GONE_STRIKES+2); fetchMode='ok'; await ticks(1);
check('judge resumed the same room → rejoins on its own', wentHome===null && api.strikes===0);

reset(); fetchMode='404';     await ticks(2); fetchMode='ok'; await ticks(1);
check('server restart, room came back → stays (self-heal)', wentHome===null && api.strikes===0);

reset(); fetchMode='offline'; await ticks(20);
check('phone offline → never sends itself home', wentHome===null);

reset(); fetchMode='500';     await ticks(20);
check('server erroring (500) → not treated as gone', wentHome===null);

console.log('\nSilence from the judge is a message, never an exit:\n');
reset(); fetchMode='ok'; api.lastHeard=Date.now()-(api.STALE_AFTER+60000);
await ticks(5);
check('long silence → shows "reconnecting"', api.stale===true);
check('long silence → but does NOT go home', wentHome===null);

console.log('\nWaking from a locked screen:\n');
reset(); fetchMode='ok';
visibility='hidden'; api.lastHeard=Date.now()-600000;   // frozen 10 min while asleep
await ticks(5);
check('asleep → stays quiet, no exit, no false alarm', wentHome===null && api.stale===false);
visibility='visible';
(listeners['visibilitychange']||[]).forEach(f=>f());    // wake up
await ticks(1);
check('woke up → clock reset, no spurious "lost the judge"', api.stale===false && wentHome===null);

console.log('\nThe stuck-on-waiting bug — stream dead, poll must save us:\n');
reset(); fetchMode='ok'; api.seq=0;
polledState={seq:5, active:true, players:['A','B'], numCats:2, numQ:5, used:{}, blocked:{},
             categories:['X','Y'], scores:[0,0], streak:[0,0], turnOrder:[0,1], nextPickerIdx:0,
             pickedThisRound:[], phase:'pick'};
await ticks(1);
check('game started while stream was dead → device catches up from the poll', api.seq===5);
check('...and does not go home over it', wentHome===null);

polledState=null;
console.log('\n'+(pass?'✓✓ PASS — one rule: only a missing room ends the session':'✗✗ FAIL'));
process.exit(pass?0:1);
})();
