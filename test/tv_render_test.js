// THE POINT OF THE REFACTOR:
// Can a renderer draw the scoreboard from a publicState() snapshot alone —
// with no access to G? If yes, the TV can render from what it receives.
const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const s=html.indexOf('<script>')+8, e=html.lastIndexOf('</script>');
let code=html.slice(s,e).replace(/^\s*init\(\);\s*$/m,'');
code+=`;globalThis.__api={get G(){return G;}, publicState, buildPTable};`;
const el=()=>({style:new Proxy({},{get:()=>'',set:()=>true}),classList:{add(){},remove(){},toggle(){},contains(){return false;}},dataset:{},value:'',textContent:'',innerHTML:'',appendChild(){},addEventListener(){},querySelector(){return el();},querySelectorAll(){return [];},focus(){},remove(){}});
const sb={document:{getElementById:el,querySelector:el,querySelectorAll:()=>[],createElement:el,addEventListener(){},body:el(),head:el()},
 window:{addEventListener(){},speechSynthesis:{cancel(){}},history:{pushState(){}}},navigator:{},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},speechSynthesis:{cancel(){}},
 setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},
 fetch:async()=>({ok:false,json:async()=>({})}),console:{log(){},warn(){},error(){}},
 JSON,Date,Set,Map,Math,Array,Object,String,Number,Boolean,RegExp,Promise,Error,isNaN,parseInt,parseFloat,encodeURIComponent,Intl};
sb.globalThis=sb; vm.createContext(sb); vm.runInContext(code,sb);
const api=sb.__api, G=api.G;

// A game in progress on the phone
G.players=['Papa','Lili','Matix']; G.scores=[900,400,650];
G.categories=['History','Science']; G.numCats=2; G.numQ=5;
G.turnOrder=[0,1,2]; G.turnPos=1; G.nextPickerIdx=1; G.numActivePlayers=3;
G.judgeMode='human'; G.hjJudgeIdx=-1;
G.used={'0-0':true}; G.blocked={};
G.curCat=0; G.curQ=2; G.curPts=300;
G.answererIdx=1; G.wrongPlayers=[]; G.stealMode=false;
G.streak=[3,-2,0]; G.pickedThisRound=[0]; G.phase='answering';
G.attempts=[{player:'Papa',correct:true},{player:'Papa',correct:true},{player:'Lili',correct:false}];
G.qData={'0-2':{question:'Who painted the Mona Lisa?',answer:'Leonardo da Vinci'}};

// 1) The phone renders from G (as it always has)
const fromG = api.buildPTable(G.answererIdx, G);

// 2) Serialise → send over the wire → TV receives ONLY this
const wire = JSON.parse(JSON.stringify(api.publicState()));

// 3) The TV renders from the snapshot alone — G is not available to it
const fromWire = api.buildPTable(wire.answererIdx, wire);

const strip = h => h.replace(/\s+/g,' ').trim();
const same = strip(fromG)===strip(fromWire);

console.log('Phone renders from G       : '+fromG.length+' chars');
console.log('TV renders from snapshot   : '+fromWire.length+' chars');
console.log('Identical output           : '+(same?'✓ YES':'✗ NO'));
console.log('\nSnapshot contains the answer: '+(JSON.stringify(wire).includes('Leonardo')?'✗ LEAK':'✓ no'));
console.log('TV can show the question    : '+JSON.stringify(wire.currentQuestion.text));

// Spot-check the rendered scoreboard actually has the right content
const checks=[['Papa',fromWire.includes('Papa')],['crown on leader',fromWire.includes('👑')],
  ['hot streak 🔥3',fromWire.includes('🔥3')],['cold streak 🧊2',fromWire.includes('🧊2')],
  ['scores',fromWire.includes('900')]];
console.log('\nTV scoreboard content:');
checks.forEach(([n,ok])=>console.log('  '+(ok?'✓':'✗')+' '+n));

const pass = same && !JSON.stringify(wire).includes('Leonardo') && checks.every(c=>c[1]);
console.log('\n'+(pass?'✓✓ PASS — the TV can render from the wire, with no answer leak':'✗✗ FAIL'));
process.exit(pass?0:1);
