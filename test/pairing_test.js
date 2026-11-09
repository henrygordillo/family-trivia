// A family night should run on ONE number, and the number people read is the
// TV's. The host opens a room at launch so the join code is on the button from
// the start — so by the time a TV is connected, the host already holds a code.
// Dragging the TV to it (adopt) put two numbers in play on one evening.
//
// So where nothing is attached to the host's room yet, the HOST moves instead.
// Adopt stays for the case it was written for: a game already under way.
const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const s=html.indexOf('<script>')+8, e=html.lastIndexOf('</script>');
let code=html.slice(s,e).replace(/^\s*init\(\);\s*$/m,'');
code+=`;globalThis.__api={ connectTV, roomInfo, awaitAdopt,
  get TV_CODE(){return TV_CODE;}, set TV_CODE(v){TV_CODE=v;},
  set inGame(v){_inGame=v;} };`;

// ── the fake server ───────────────────────────────────────────────────────
let rooms={}, calls=[];
const el=()=>({style:new Proxy({},{get:()=>'',set:()=>true}),
  classList:{add(){},remove(){},toggle(){},contains(){return false;}},
  dataset:{},value:'',textContent:'',innerHTML:'',children:[],
  appendChild(){},addEventListener(){},querySelector(){return el();},
  querySelectorAll(){return [];},focus(){},remove(){},onclick:null});
const sb={
  document:{getElementById:el,querySelector:el,querySelectorAll:()=>[],createElement:el,
    addEventListener(){},body:el(),head:el(),visibilityState:'visible'},
  window:{addEventListener(){},speechSynthesis:{cancel(){}},history:{pushState(){}}},
  navigator:{}, localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  speechSynthesis:{cancel(){}},
  // real timers, so awaitAdopt's polling actually elapses
  setTimeout:(f,ms)=>setTimeout(f,ms), clearTimeout:c=>clearTimeout(c),
  setInterval:()=>1, clearInterval(){},
  fetch: async(u,opt)=>{
    const url=String(u); calls.push((opt&&opt.method||'GET')+' '+url);
    let m=url.match(/\/api\/room\/(\d{4})$/);
    if(m){ const r=rooms[m[1]];
      return r ? {ok:true,status:200,json:async()=>({code:m[1],...r})}
               : {ok:false,status:404,json:async()=>({})}; }
    m=url.match(/\/api\/room\/(\d{4})\/adopt$/);
    if(m) return {ok:true,status:200,json:async()=>({ok:true})};
    m=url.match(/\/api\/room\/(\d{4})\/close$/);
    if(m){ delete rooms[m[1]]; return {ok:true,status:200,json:async()=>({ok:true})}; }
    return {ok:true,status:200,json:async()=>({})};
  },
  console:{log(){},warn(){},error(){}},
  JSON,Date,Set,Map,Math,Array,Object,String,Number,Boolean,RegExp,Promise,Error,
  isNaN,parseInt,parseFloat,encodeURIComponent,Intl,
  location:{origin:'http://x',search:'',protocol:'http:',host:'x'}};
sb.globalThis=sb; vm.createContext(sb); vm.runInContext(code,sb);
const api=sb.__api;

let fail=0; const chk=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n); if(!c)fail++;};
const room=(shared,personal)=>({shared,personal,listeners:shared+personal,hasState:false,state:null});
function setup(hostRoom, tvRoom, inGame){
  rooms={}; calls=[];
  if(hostRoom) rooms['1111']=hostRoom;
  if(tvRoom)   rooms['2222']=tvRoom;
  api.TV_CODE='1111'; api.inGame=!!inGame;
}
const sent = re => calls.some(c=>re.test(c));

(async ()=>{

// ── 1. The normal case: TV connected during setup, nobody has joined ──────
setup(room(0,0), room(1,0), false);
let r = await api.connectTV('2222');
chk('empty room: host moves to the TV code', api.TV_CODE==='2222');
chk('empty room: reported as host-moved',    r.path==='host-moved');
chk('empty room: no adopt sent',             !sent(/adopt/));
chk('empty room: old room closed',           sent(/POST .*\/1111\/close/));
chk('empty room: claims no handshake',       r.confirmed===false);

// ── 2. A phone is already in the host's room — moving would strand it ─────
setup(room(0,1), room(1,0), false);
r = await api.connectTV('2222');
chk('occupied room: host keeps its code', api.TV_CODE==='1111');
chk('occupied room: adopt sent',          sent(/POST .*\/2222\/adopt/));
chk('occupied room: reported as adopt',   r.path==='adopt');

// ── 3. Mid-game: never move, whatever the counts say ──────────────────────
setup(room(0,0), room(1,0), true);
r = await api.connectTV('2222');
chk('mid-game: host keeps its code', api.TV_CODE==='1111');
chk('mid-game: adopt sent',          sent(/adopt/));

// ── 4. Nothing shared on that code — a blinked stream, not a verdict ──────
setup(room(0,0), room(0,0), false);
r = await api.connectTV('2222');
chk('no shared screen: refused',      r.ok===false);
chk('no shared screen: retryable',    r.retry===true);
chk('no shared screen: wording invites another go', /try again/i.test(r.err));
chk('no shared screen: host code untouched', api.TV_CODE==='1111');

// ── 5. Confirmation must be a DELTA ───────────────────────────────────────
// A TV was already attached to the host, so shared>=1 is true before the adopt
// and proves nothing. Only an increase counts.
setup(room(1,0), room(1,0), false);
const t0=Date.now();
r = await api.connectTV('2222');
chk('adopt: pre-existing shared screen does not satisfy it', r.confirmed===false);
chk('adopt: it waited rather than returning at once', Date.now()-t0 >= 3500);

// ── 6. …and it passes when the TV really arrives ──────────────────────────
setup(room(0,1), room(1,0), false);
setTimeout(()=>{ rooms['1111']=room(1,1); }, 700);   // TV shows up on our room
r = await api.connectTV('2222');
chk('adopt: confirmed once shared rises', r.confirmed===true);

// ── 7. The TV closing its old room is the other valid signal ──────────────
setup(room(0,1), room(1,0), false);
setTimeout(()=>{ delete rooms['2222']; }, 700);
r = await api.connectTV('2222');
chk('adopt: confirmed by the old room going away', r.confirmed===true);

// ── 8. The race: empty on the first look, occupied on the re-check ────────
setup(room(0,0), room(1,0), false);
let looks=0;
const realFetch=sb.fetch;
sb.fetch=async(u,o)=>{ const url=String(u);
  if(/\/api\/room\/1111$/.test(url)){ looks++;
    if(looks>=2) rooms['1111']=room(0,1); }      // a phone joined in the gap
  return realFetch(u,o); };
r = await api.connectTV('2222');
sb.fetch=realFetch;
chk('race: re-check catches the late joiner', api.TV_CODE==='1111');
chk('race: falls back to adopt',              r.path==='adopt');

console.log(fail?('\n'+fail+' FAILED'):'\npairing checks passed');
process.exit(fail?1:0);
})();
