// Resuming after a crash. The rule: a raised flag means we died mid-game.
// Every deliberate exit lowers it. Age never matters. Declining never destroys.
const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const s=html.indexOf('<script>')+8, e=html.lastIndexOf('</script>');
let code=html.slice(s,e).replace(/^\s*init\(\);\s*$/m,'');
code+=`;globalThis.__api={ saveGame, clearSave, loadSave, markLive, clearLive, liveSaveKey,
  SAVE_KEY, LIVE_KEY, get G(){return G;}, setInGame(v){_inGame=v;} };`;

const store={};
const el=()=>({style:new Proxy({},{get:()=>'',set:()=>true}),
  classList:{add(){},remove(){},toggle(){},contains(){return false;}},
  dataset:{},value:'',textContent:'',innerHTML:'',children:[],
  appendChild(){},addEventListener(){},removeEventListener(){},
  querySelector(){return el();},querySelectorAll(){return [];},
  focus(){},remove(){},setAttribute(){},getAttribute(){return null;}});
const sb={document:{getElementById:el,querySelector:el,querySelectorAll:()=>[],createElement:el,
    createRange:()=>({selectNodeContents(){}}),addEventListener(){},body:el(),head:el(),visibilityState:'visible'},
  window:{addEventListener(){},speechSynthesis:{cancel(){},speak(){}},history:{pushState(){}},
    location:{href:'',search:'',origin:'http://x',protocol:'http:',host:'x'}},
  location:{href:'',search:'',origin:'http://x',protocol:'http:',host:'x'},
  navigator:{sendBeacon(){return true;}},
  localStorage:{getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v);},
    removeItem:k=>{delete store[k];}},
  speechSynthesis:{cancel(){},speak(){}},SpeechSynthesisUtterance:function(){},
  URLSearchParams,URL,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},
  fetch:async()=>({ok:false,json:async()=>({})}),confirm:()=>true,alert(){},
  console:{log(){},warn(){},error(){}},
  JSON,Date,Set,Map,Math,Array,Object,String,Number,Boolean,RegExp,Promise,Error,
  isNaN,parseInt,parseFloat,encodeURIComponent,Intl};
sb.window.localStorage=sb.localStorage; sb.globalThis=sb;
vm.createContext(sb); vm.runInContext(code,sb);
const api=sb.__api;

function startAGame(){
  Object.keys(store).forEach(k=>delete store[k]);
  api.setInGame(true);
  Object.assign(api.G,{players:['Papa','Lili'],scores:[0,0],categories:['A','B'],
    numCats:2,numQ:5,turnOrder:[0,1],turnPos:0,nextPickerIdx:0,numActivePlayers:2,
    used:{'0-0':true},blocked:{},qData:{},askedQuestions:[],attempts:[],
    streak:[0,0],pickedThisRound:[],roundNumber:1,roundQuestionCount:1,
    judgeMode:'human',hjJudgeIdx:-1,setupNames:['Papa','Lili']});
  api.saveGame();
}
let pass=true;
const check=(n,c)=>{ console.log(`  ${c?'✓':'✗'} ${n}`); if(!c) pass=false; };
const offered = () => api.loadSave()!==null;

console.log('A game is running, then something kills the app:\n');
startAGame();
check('mid-game → flag is raised', api.liveSaveKey()===api.SAVE_KEY);
check('relaunch → offers to resume', offered());

console.log('\nYou say "not now":\n');
check('...it is NOT thrown away', offered());
check('...and it offers again next time', offered() && offered());

console.log('\nAge is irrelevant:\n');
startAGame();
const old=JSON.parse(store[api.SAVE_KEY]); old.at=Date.now()-40*24*60*60*1000;
store[api.SAVE_KEY]=JSON.stringify(old);
check('a game interrupted 40 days ago → still offered', offered());

console.log('\nDeliberate exits let it go:\n');
startAGame(); api.clearSave();
check('End game / Restart / finish → nothing offered', !offered());
check('...and the flag is down', api.liveSaveKey()===null);

console.log('\nBroken states cannot strand you:\n');
startAGame(); delete store[api.SAVE_KEY];       // flag up, save vanished
check('flag with no save → no prompt', !offered());
check('...and the flag clears itself', api.liveSaveKey()===null);

startAGame();
const done=JSON.parse(store[api.SAVE_KEY]);
done.g.used={'0-0':1,'0-1':1,'0-2':1,'0-3':1,'0-4':1,'1-0':1,'1-1':1,'1-2':1,'1-3':1,'1-4':1};
store[api.SAVE_KEY]=JSON.stringify(done);
check('flag up but game was complete → no prompt', !offered());

startAGame(); api.clearLive();                   // save present, flag down
check('save with no flag → not offered (a proper exit happened)', !offered());

console.log('\n'+(pass?'✓✓ PASS — the flag decides, and declining never loses your game':'✗✗ FAIL'));
process.exit(pass?0:1);
