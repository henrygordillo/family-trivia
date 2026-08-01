// Re-deal budget, the answered-question lock, and the splash event.
const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const s=html.indexOf('<script>')+8, e=html.lastIndexOf('</script>');
let code=html.slice(s,e).replace(/^\s*init\(\);\s*$/m,'');
code+=`;globalThis.__api={get G(){return G;},publicState,redealState,dealAgain,
  markBoardPlayed,syncDealAgainBtn,_leaveBoard,
  get inGame(){return _inGame;}, set inGame(v){_inGame=v;},
  get used(){return _redealsUsed;}, set used(v){_redealsUsed=v;},
  get answered(){return _answeredThisBoard;}, set answered(v){_answeredThisBoard=v;},
  get recorded(){return _gameRecorded;}, set recorded(v){_gameRecorded=v;},
  get splash(){return _splash;}, showSplash, LIMIT:REDEAL_LIMIT};`;
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
// Out of re-deals is a live rule (grey it); answered is permanent (remove it).
api.syncDealAgainBtn();
chk('button removed once a question is answered', btn.style.display==='none');
api.answered=false; api.used=2; api.syncDealAgainBtn();
chk('but only greyed when merely out of re-deals', btn.style.display==='' && btn.disabled===true);

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

// A re-deal must NOT tell the room the game ended — that dropped the shared screen
// back to "waiting for the host" for the second the new board took to load.
api.inGame=true;
api._leaveBoard(true);
chk('re-deal keeps the game live', api.inGame===true);
chk('...and the wire still says active', api.publicState().active===true);
api.inGame=true;
api._leaveBoard();
chk('a real exit still ends it', api.inGame===false);
// The message must carry BOTH lines — the headline and the budget — or the room
// learns that categories changed without learning how much rope is left.
api.used=0; api.answered=false;
const allHtml=['tv.html','join.html','index.html']
  .map(f=>fs.readFileSync('public/'+f,'utf8')).join('');
chk('all three screens centre the card', (allHtml.match(/id="splashWrap"/g)||[]).length===3);
chk('all three read title and line',     (allHtml.match(/splashTitle/g)||[]).length>=6);
chk('host announces to itself',          allHtml.includes('showSplash(_splash)'));

// Setup and board must offer the SAME two doors in the same shape — one pattern,
// two moments. Four .boardlink buttons total: two on setup, two on the board.
const idx=fs.readFileSync('public/index.html','utf8');
chk('four paired connect buttons', (idx.match(/class="boardlink"/g)||[]).length===4);
chk('setup pair wired',  idx.includes("getElementById('tvBtn')") && idx.includes("getElementById('addScreenBtn')"));
chk('board pair wired',  idx.includes("getElementById('joinBtnBoard')") && idx.includes("getElementById('addScreenBtnBoard')"));
chk('old setup strip gone', !idx.includes('tvBtnLabel') && !idx.includes('joinQr'));
chk('both places report attached screens', (idx.match(/joinWatchers/g)||[]).length>=2);

// A mis-tapped tile must always be escapable — the host decides, including
// mid-steal. And backing out must un-mark the pick, or the picks-this-round
// indicator shows a turn nobody took.
chk('back-out is a real button, not 20% grey', /\.back-btn\{flex:0 0 auto;background:var\(--card2\)/.test(idx));
// It must be ABOVE the fold. Buried at the bottom of the question screen it was
// ~6000 chars of markup down and nobody ever found it.
{
  const i=idx.indexOf('id="backBtn"');
  const q=idx.lastIndexOf('<div id="qscreen" class="screen">', i);
  chk('back-out sits in the question header, not the basement', i-q < 800);
}
chk('back-out survives a steal', !/showSteal[\s\S]{0,320}backBtn[\s\S]{0,80}display='none'/.test(idx));
chk('back-out un-marks the pick', /function backToBoard\(\)[\s\S]{0,700}pickedThisRound=G\.pickedThisRound\.filter/.test(idx));

console.log(fail?('\n'+fail+' FAILED'):'\nall re-deal checks passed');
process.exit(fail?1:0);
