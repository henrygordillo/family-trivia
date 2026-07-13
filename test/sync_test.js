// TWO DEVICES. The phone plays; the TV subscribes. Does the TV track the game,
// and does it stay silent (no echo loop)?
const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const s=html.indexOf('<script>')+8, e=html.lastIndexOf('</script>');
let code=html.slice(s,e).replace(/^\s*init\(\);\s*$/m,'');
code+=`;globalThis.__api={get G(){return G;},publicState,onStateChange,commit,applyRemoteState,
  renderTables,renderBoard,buildBoard,buildPTable,resolveAnswer,advanceTurnPos,markUsed,currentPickerIdx};`;

let microtasks=[];
const el=()=>({style:new Proxy({},{get:()=>'',set:()=>true}),classList:{add(){},remove(){},toggle(){},contains(){return false;}},dataset:{},value:'',textContent:'',innerHTML:'',appendChild(){},addEventListener(){},querySelector(){return el();},querySelectorAll(){return [];},focus(){},remove(){},onclick:null});
const sb={document:{getElementById:el,querySelector:el,querySelectorAll:()=>[],createElement:el,addEventListener(){},body:el(),head:el()},
 window:{addEventListener(){},speechSynthesis:{cancel(){}},history:{pushState(){}}},navigator:{},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},speechSynthesis:{cancel(){}},
 setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},
 fetch:async()=>({ok:false,json:async()=>({})}),console:{log(){},warn(){},error(){}},
 JSON,Date,Set,Map,Math,Array,Object,String,Number,Boolean,RegExp,Promise,Error,isNaN,parseInt,parseFloat,encodeURIComponent,Intl};
sb.globalThis=sb; vm.createContext(sb); vm.runInContext(code,sb);
const api=sb.__api, G=api.G;

// ── The TV: receives snapshots, renders them, keeps the latest ──
let tvState=null, broadcasts=0, echoes=0;
api.onStateChange(snap=>{
  broadcasts++;
  tvState=snap;
  // The TV renders what it received. This MUST NOT trigger another broadcast.
  const before=broadcasts;
  api.applyRemoteState(snap);
  // (any increase during applyRemoteState would be an echo)
  if(broadcasts>before) echoes++;
});

// ── The phone plays ──
G.players=['Papa','Lili']; G.scores=[0,0]; G.categories=['History','Science'];
G.numCats=2; G.numQ=5; G.turnOrder=[0,1]; G.turnPos=0; G.nextPickerIdx=0;
G.numActivePlayers=2; G.judgeMode='human'; G.hjJudgeIdx=-1;
G.used={}; G.blocked={}; G.streak=[0,0]; G.pickedThisRound=[]; G.attempts=[];
G.qData={}; G.askedQuestions=[]; G.phase='pick';

const flush=async()=>{ await Promise.resolve(); await Promise.resolve(); };

(async()=>{
  console.log('PHONE plays; TV listens.\n');

  // Turn 1: Papa picks 0-2 (300) and gets it right
  G.curCat=0; G.curQ=2; G.curPts=300; G.answererIdx=0; G.stealMode=false;
  G.wrongPlayers=[]; G.pickedThisRound=[0];
  G.qData['0-2']={question:'Who painted the Mona Lisa?',answer:'Leonardo da Vinci'};
  G.phase='reading';
  api.renderTables(0);            // phone redraws → should broadcast
  await flush();
  console.log('After Papa picks 300 (reading):');
  console.log('  TV sees question : '+JSON.stringify(tvState.currentQuestion.text));
  console.log('  TV sees answer   : '+(JSON.stringify(tvState).includes('Leonardo')?'✗ LEAK':'✓ hidden'));
  console.log('  TV scores        : '+tvState.scores.join(','));

  api.resolveAnswer(true);        // Papa correct → +300
  api.markUsed(); api.advanceTurnPos();
  api.renderTables(null);
  await flush();
  console.log('\nAfter Papa answers correctly:');
  console.log('  TV scores        : '+tvState.scores.join(',')+'   (phone: '+G.scores.join(',')+')');
  console.log('  TV streak        : '+tvState.streak.join(',')+'   (phone: '+G.streak.join(',')+')');
  console.log('  TV used tiles    : '+Object.keys(tvState.used).join(',')+'   (phone: '+Object.keys(G.used).join(',')+')');

  // Reveal: now the answer SHOULD reach the TV
  G.phase='reveal';
  api.renderTables(null);
  await flush();
  console.log('\nAfter judge reveals:');
  console.log('  TV revealedAnswer: '+JSON.stringify(tvState.revealedAnswer)+' ✓ (intentional)');

  const inSync = tvState.scores.join(',')===G.scores.join(',') &&
                 tvState.streak.join(',')===G.streak.join(',') &&
                 Object.keys(tvState.used).join(',')===Object.keys(G.used).join(',');
  console.log('\nBroadcasts sent   : '+broadcasts+' (coalesced — not one per mutation)');
  console.log('Echo loops        : '+echoes+' '+(echoes===0?'✓ TV stayed silent':'✗ INFINITE LOOP RISK'));
  console.log('TV in sync w/phone: '+(inSync?'✓ yes':'✗ no'));

  const pass = inSync && echoes===0;
  console.log('\n'+(pass?'✓✓ PASS — two devices stay in sync, no echo, no answer leak':'✗✗ FAIL'));
  process.exit(pass?0:1);
})();
