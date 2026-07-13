// Can the TV render the FULL game view from a snapshot — board, scoreboard,
// question — with no G, no click handlers, and no answer?
const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const s=html.indexOf('<script>')+8, e=html.lastIndexOf('</script>');
let code=html.slice(s,e).replace(/^\s*init\(\);\s*$/m,'');
code+=`;globalThis.__api={get G(){return G;},publicState,buildPTable,buildBoard,renderBoard};`;

// A DOM that RECORDS what got built, so we can inspect the TV's output
const built={tiles:[],handlers:0,heads:[]};
function el(id){
  const e={id,style:new Proxy({},{get:()=>'',set:()=>true}),
    classList:{_s:new Set(),add(...c){c.forEach(x=>this._s.add(x));},remove(){},toggle(){},contains(c){return this._s.has(c);}},
    dataset:{},value:'',textContent:'',innerHTML:'',children:[],
    appendChild(ch){ this.children.push(ch);
      if(ch.className&&ch.className.includes('q-tile')) built.tiles.push(ch);
      if(ch.className==='cat-head') built.heads.push(ch.textContent);
      if(ch.onclick) built.handlers++; },
    addEventListener(){},querySelector(){return el();},querySelectorAll(){return [];},focus(){},remove(){}};
  Object.defineProperty(e,'onclick',{set(v){ if(v) built.handlers++; },get(){return null;},configurable:true});
  return e;
}
const sb={document:{getElementById:el,querySelector:()=>el(),querySelectorAll:()=>[],createElement:()=>el(),addEventListener(){},body:el(),head:el()},
 window:{addEventListener(){},speechSynthesis:{cancel(){}},history:{pushState(){}}},navigator:{},
 localStorage:{getItem:()=>null,setItem(){},removeItem(){}},speechSynthesis:{cancel(){}},
 setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},
 fetch:async()=>({ok:false,json:async()=>({})}),console:{log(){},warn(){},error(){}},
 JSON,Date,Set,Map,Math,Array,Object,String,Number,Boolean,RegExp,Promise,Error,isNaN,parseInt,parseFloat,encodeURIComponent,Intl};
sb.globalThis=sb; vm.createContext(sb); vm.runInContext(code,sb);
const api=sb.__api, G=api.G;

G.players=['Papa','Lili','Matix']; G.scores=[900,400,650];
G.categories=['History','Science','Sports']; G.numCats=3; G.numQ=5;
G.turnOrder=[0,1,2]; G.turnPos=1; G.nextPickerIdx=1; G.numActivePlayers=3;
G.judgeMode='human'; G.hjJudgeIdx=-1;
G.used={'0-0':true,'1-1':true}; G.blocked={'2-4':true};
G.curCat=0; G.curQ=2; G.curPts=300;
G.answererIdx=1; G.wrongPlayers=[]; G.stealMode=false;
G.streak=[3,0,0]; G.pickedThisRound=[0]; G.phase='reading';
G.attempts=[]; G.qData={'0-2':{question:'Who painted the Mona Lisa?',answer:'Leonardo da Vinci'}};

// ── Over the wire ──
const wire = JSON.parse(JSON.stringify(api.publicState()));

console.log('WIRE PAYLOAD: '+JSON.stringify(wire).length+' bytes');
console.log('  contains answer? '+(JSON.stringify(wire).includes('Leonardo')?'✗ LEAK':'✓ no'));
console.log('  question text   : '+JSON.stringify(wire.currentQuestion.text));

// ── TV builds the board from the snapshot, NON-interactive ──
built.tiles=[];built.handlers=0;built.heads=[];
api.buildBoard(wire, false);
console.log('\nTV BOARD (from snapshot, non-interactive):');
console.log('  category headers : '+JSON.stringify(built.heads));
console.log('  tiles built      : '+built.tiles.length+' (expect '+(wire.numCats*wire.numQ)+')');
console.log('  click handlers   : '+built.handlers+' '+(built.handlers===0?'✓ none — TV is display-only':'✗ TV is clickable!'));

// ── Phone builds the same board, interactive ──
built.tiles=[];built.handlers=0;
api.buildBoard(G, true);
console.log('\nPHONE BOARD (interactive):');
console.log('  click handlers   : '+built.handlers+' '+(built.handlers>0?'✓ tiles are clickable':'✗ not clickable!'));

const tvBoard = (function(){ built.tiles=[];built.handlers=0; api.buildBoard(wire,false); return built.handlers===0; })();
const scoreboard = api.buildPTable(wire.answererIdx, wire);
const pass = !JSON.stringify(wire).includes('Leonardo') && tvBoard &&
             scoreboard.includes('Papa') && scoreboard.includes('900');
console.log('\n'+(pass?'✓✓ PASS — TV renders the full view from the wire, display-only, no answer':'✗✗ FAIL'));
process.exit(pass?0:1);
