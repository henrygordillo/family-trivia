// Re-deal budget, the answered-question lock, and the splash event.
const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const s=html.indexOf('<script>')+8, e=html.lastIndexOf('</script>');
let code=html.slice(s,e).replace(/^\s*init\(\);\s*$/m,'');
code+=`;globalThis.__api={get G(){return G;},publicState,redealState,dealAgain,
  markBoardPlayed,syncDealAgainBtn,
  get used(){return _redealsUsed;}, set used(v){_redealsUsed=v;},
  get answered(){return _answeredThisBoard;}, set answered(v){_answeredThisBoard=v;},
  get recorded(){return _gameRecorded;}, set recorded(v){_gameRecorded=v;},
  get splash(){return _splash;}, LIMIT:REDEAL_LIMIT};`;
const btn={textContent:'',disabled:false,style:{}};
function el(id){ if(id==='dealAgainBtn') return btn;
  return {id,style:new Proxy({},{get:()=>'',set:()=>true}),
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    dataset:{},value:'',textContent:'',innerHTML:'',children:[],
    appendChild(){},addEventListener(){},querySelector(){return el();},
    querySelectorAll(){return [];},focus(){},remove(){}};}
let gamePosts=0;
const sb={document:{getElementById:el,querySelector:()=>el(),querySelectorAll:()=>[],
  createElement:()=>el(),addEventListener(){},body:el(),head:el(),visibilityState:'visible'},
 window:{addEventListener(){},speechSynthesis:{cancel(){}},history:{pushState(){}}},navigator:{},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},speechSynthesis:{cancel(){}},
 setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},
 fetch:async(u)=>{ if(String(u).includes('/api/games')) gamePosts++;
   return {ok:true,json:async()=>({})}; },
 console:{log(){},warn(){},error(){}},
 JSON,Date,Set,Map,Math,Array,Object,String,Number,Boolean,RegExp,Promise,Error,
 isNaN,parseInt,parseFloat,encodeURIComponent,Intl,location:{host:'x',origin:'http://x'}};
sb.globalThis=sb; vm.createContext(sb); vm.runInContext(code,sb);
const api=sb.__api;

let fail=0; const chk=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n); if(!c)fail++;};

chk('limit is 2', api.LIMIT===2);

// fresh board
api.used=0; api.answered=false; api.recorded=false;
chk('re-deal allowed on a fresh board', api.redealState().ok);
chk('two left initially', api.redealState().left===2);

api.used=1;
chk('one left after first', api.redealState().left===1);
api.syncDealAgainBtn();
chk('button shows the count', btn.textContent.includes('1 left'));

api.used=2;
chk('blocked at the cap', !api.redealState().ok);
chk('reason is the cap', api.redealState().why==='No re-deals left');
api.syncDealAgainBtn();
chk('button greyed, not hidden', btn.disabled===true && btn.style.opacity==='.4');
chk('button states the reason', btn.textContent.includes('No re-deals left'));

// answered lock outranks the count
api.used=0; api.answered=true;
chk('answered board blocks re-deal even with budget', !api.redealState().ok);
chk('answered reason wins', api.redealState().why==='The game has started');

// game row written once, on first play only
api.answered=false; api.recorded=false; gamePosts=0;
api.G.categories=['A','B']; api.G.players=['p1','p2'];
api.markBoardPlayed();
chk('game recorded on first play', gamePosts===1);
api.markBoardPlayed(); api.markBoardPlayed();
chk('never recorded twice', gamePosts===1);
chk('board marked as played', api.answered===true);

// splash travels on the wire
api.answered=false; api.used=0;
const before=api.publicState().splash;
chk('no splash before a re-deal', before===null);
console.log(fail?('\n'+fail+' FAILED'):'\nall re-deal checks passed');
process.exit(fail?1:0);
