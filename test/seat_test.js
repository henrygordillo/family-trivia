// A personal screen remembers WHICH PLAYER it belongs to.
//
// It used to remember a POSITION in players[]. The turn shuffle reorders
// players[], and the rosterId guard didn't catch it because rosterId is built
// from a SORTED id list — same people, same signature, different order. So after
// a re-deal with shuffle on, "Me (Alec)" silently became someone else.
//
// The first case below is that exact failure. It must stay red against the old
// code and green against the new.
const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('public/join.html','utf8');
const s=html.indexOf('<script>')+8, e=html.lastIndexOf('</script>');
let code=html.slice(s,e);
code+=`;globalThis.__api={ render, askWho,
  get ME(){return ME;}, set ME(v){ME=v;},
  get meName(){return _meName;},
  get askedWho(){return _askedWho;}, set askedWho(v){_askedWho=v;},
  set CODE(v){CODE=v;}, get CODE(){return CODE;},
  set lastS(v){_lastS=v;},
  WATCHING };`;

// localStorage with a real backing map — the stub in connection_test returns null
// for everything, and the whole point here is what persists.
const store=new Map();
const localStorage={
  getItem:k=>store.has(k)?store.get(k):null,
  setItem:(k,v)=>store.set(k,String(v)),
  removeItem:k=>store.delete(k),
};

const el=()=>({style:new Proxy({},{get:()=>'',set:()=>true}),
  classList:{add(){},remove(){},toggle(){},contains(){return false;}},
  dataset:{},value:'',textContent:'',innerHTML:'',appendChild(){},addEventListener(){},
  querySelector(){return el();},querySelectorAll(){return [];},focus(){},remove(){},onclick:null});

const sb={
  document:{ getElementById:el, querySelector:el, querySelectorAll:()=>[], createElement:el,
    addEventListener(){}, body:el(), head:el(), visibilityState:'visible' },
  window:{addEventListener(){},history:{pushState(){}},location:{origin:'http://x',search:''}},
  navigator:{}, localStorage,
  EventSource: function(){ this.readyState=1; this.addEventListener=()=>{}; this.close=()=>{}; },
  setTimeout:()=>0, clearTimeout(){}, setInterval:()=>1, clearInterval(){},
  fetch: async()=>({ok:true,status:200,json:async()=>({})}),
  console:{log(){},warn(){},error(){}},
  URLSearchParams,URL, location:{origin:'http://x',search:'',protocol:'http:',host:'x'},
  JSON,Date,Set,Map,Math,Array,Object,String,Number,Boolean,RegExp,Promise,Error,
  isNaN,parseInt,parseFloat,encodeURIComponent,Intl};
sb.globalThis=sb; vm.createContext(sb); vm.runInContext(code,sb);
const api=sb.__api;

let fail=0; const chk=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n); if(!c)fail++;};

const idC='11111111-1111-1111-1111-111111111111';   // Ceci
const idA='22222222-2222-2222-2222-222222222222';   // Alec
const idG='33333333-3333-3333-3333-333333333333';   // Gabo

// rosterId is a SORTED join of ids — identical for the same people in any order.
const rosterIdOf = ids => ids.slice().sort().join('|');

function snapshot(players, playerIds, seq){
  return { seq, active:true, players, playerIds,
    rosterId:rosterIdOf(playerIds),
    scores:players.map(()=>0), streak:players.map(()=>0),
    categories:['History','Science','Sports'], numCats:3, numQ:5,
    used:{}, blocked:{}, turnOrder:players.map((_,i)=>i), turnPos:0,
    nextPickerIdx:0, pickedThisRound:[], attempts:[],
    phase:'pick', judgeMode:'human', gameMode:'normal',
    roundNumber:1, roundQuestionCount:0, currentQuestion:null };
}
function fresh(){ store.clear(); api.CODE='1234'; api.ME=null; api.askedWho=false; }

// ── 1. THE BUG ────────────────────────────────────────────────────────────
// Same people, shuffle on, so players[] is reordered and rosterId is unchanged.
fresh();
api.render(snapshot(['Ceci','Alec','Gabo'], [idC,idA,idG], 1));
api.ME=1; vm.runInContext(`ME=1;`, sb);                 // tapped "Alec"
sb.localStorage.setItem('ftn_me_1234', JSON.stringify({v:2, id:idA}));

api.render(snapshot(['Gabo','Ceci','Alec'], [idG,idC,idA], 2));
chk('shuffle: index follows the person, not the position  (ME='+api.ME+')', api.ME===2);
chk('shuffle: the name shown is still Alec  (_meName='+api.meName+')', api.meName==='Alec');

// ── 2. That person isn't in this game ─────────────────────────────────────
fresh();
sb.localStorage.setItem('ftn_me_1234', JSON.stringify({v:2, id:idA}));
api.render(snapshot(['Ceci','Gabo'], [idC,idG], 3));
chk('absent player: seat cleared', sb.localStorage.getItem('ftn_me_1234')===null);
chk('absent player: asks again',   api.ME===null);

// ── 3. "I'm just watching" survives a shuffle ─────────────────────────────
fresh();
sb.localStorage.setItem('ftn_me_1234', JSON.stringify({v:2, watching:true}));
api.render(snapshot(['Ceci','Alec','Gabo'], [idC,idA,idG], 4));
chk('watching: holds the sentinel', api.ME===api.WATCHING);
api.render(snapshot(['Gabo','Alec','Ceci'], [idG,idA,idC], 5));
chk('watching: survives a reorder', api.ME===api.WATCHING);
chk('watching: never resolves to a player', api.meName===null);

// ── 4. A legacy bare index is discarded, not reinterpreted ────────────────
// It's the stale value that caused the bug and there's no way to tell who it meant.
fresh();
sb.localStorage.setItem('ftn_me_1234', '1');
api.render(snapshot(['Gabo','Ceci','Alec'], [idG,idC,idA], 6));
chk('legacy "1": discarded', sb.localStorage.getItem('ftn_me_1234')===null);
chk('legacy "1": not read as index 1 (would be Ceci)', api.ME===null && api.meName!=='Ceci');

console.log(fail?('\n'+fail+' FAILED'):'\nseat checks passed');
process.exit(fail?1:0);
