// Does publicState() ever leak an answer? This is the one thing that would kill
// Big Screen Mode, so it gets its own test.
const { playGame } = require('./harness.js');
const fs=require('fs'), vm=require('vm');

// Load the app and drive it to a state where a question is open, with a known answer.
const html=fs.readFileSync('index.html','utf8');
const s=html.indexOf('<script>')+8, e=html.lastIndexOf('</script>');
let code=html.slice(s,e).replace(/^\s*init\(\);\s*$/m,'');
code+=`;globalThis.__api={get G(){return G;}, publicState, STATE_PUBLIC, STATE_PRIVATE};`;

const el=()=>({style:new Proxy({},{get:()=>'' ,set:()=>true}),classList:{add(){},remove(){},toggle(){},contains(){return false;}},dataset:{},value:'',textContent:'',innerHTML:'',appendChild(){},addEventListener(){},querySelector(){return el();},querySelectorAll(){return [];},focus(){},remove(){}});
const sb={document:{getElementById:el,querySelector:el,querySelectorAll:()=>[],createElement:el,addEventListener(){},body:el(),head:el()},
  window:{addEventListener(){},speechSynthesis:{cancel(){}},history:{pushState(){}}},
  navigator:{},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  speechSynthesis:{cancel(){}},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},
  fetch:async()=>({ok:false,json:async()=>({})}),console:{log(){},warn(){},error(){}},
  JSON,Date,Set,Map,Math,Array,Object,String,Number,Boolean,RegExp,Promise,Error,isNaN,parseInt,parseFloat,encodeURIComponent,Intl};
sb.globalThis=sb;
vm.createContext(sb); vm.runInContext(code,sb);
const api=sb.__api, G=api.G;

const SECRET='ELEPHANT_SECRET_ANSWER';
const SECRET_EXP='SECRET_EXPLANATION_TEXT';

G.players=['A','B']; G.scores=[0,0]; G.categories=['Cat0','Cat1'];
G.numCats=2; G.numQ=5; G.turnOrder=[0,1]; G.turnPos=0;
G.used={}; G.blocked={}; G.streak=[0,0]; G.pickedThisRound=[];
G.curCat=0; G.curQ=2; G.curPts=300;
G.qData={'0-2':{question:'What animal is this?', answer:SECRET, explanation:SECRET_EXP}};
G.askedQuestions=[{q:'Old question',a:'OLD_SECRET_ANSWER'}];

function scan(label, phase){
  G.phase=phase;
  const pub=api.publicState();
  const json=JSON.stringify(pub);
  const leaks=[];
  if(json.includes(SECRET) && phase!=='reveal') leaks.push('ANSWER');
  if(json.includes(SECRET_EXP)) leaks.push('EXPLANATION');
  if(json.includes('OLD_SECRET_ANSWER')) leaks.push('PAST ANSWERS');
  if(json.includes('qData')) leaks.push('qData object');
  console.log(`  phase="${phase}"  ${leaks.length?'✗ LEAKS: '+leaks.join(', '):'✓ clean'}`);
  return leaks.length===0;
}

console.log('Question is open. Answer = "'+SECRET+'". Can the TV see it?\n');
let ok=true;
['pick','reading','answering','steal'].forEach(p=>{ ok = scan('',p) && ok; });

console.log('\nAfter the judge reveals:');
G.phase='reveal';
const pub=api.publicState();
const revealed = pub.revealedAnswer===SECRET;
console.log(`  revealedAnswer = ${JSON.stringify(pub.revealedAnswer)}  ${revealed?'✓ (correct — reveal is intentional)':'✗ not surfaced'}`);
console.log(`  explanation still hidden: ${!JSON.stringify(pub).includes(SECRET_EXP)?'✓':'✗'}`);

console.log('\nThe TV sees the question text: '+JSON.stringify(pub.currentQuestion.text));
console.log('\n'+(ok&&revealed ? '✓✓ PASS — answers never reach the TV before reveal' : '✗✗ FAIL'));
process.exit(ok&&revealed?0:1);
