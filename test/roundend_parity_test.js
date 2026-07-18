// The TV and the phone must report the SAME round-end numbers. Layout may differ;
// the facts may not. This feeds one state to both and compares what they render.
const fs=require('fs'), vm=require('vm');

function load(file, expose){
  const html=fs.readFileSync(file,'utf8');
  const s=html.indexOf('<script>')+8, e=html.lastIndexOf('</script>');
  let code=html.slice(s,e).replace(/^\s*init\(\);\s*$/m,'');
  code+=expose;
  const sinks={};
  const el=(id)=>{
    const o={id,style:new Proxy({},{get:()=>'',set:()=>true}),
      classList:{add(){},remove(){},toggle(){},contains(){return false;}},
      dataset:{},value:'',children:[],textContent:'',
      get innerHTML(){return this._h||'';}, set innerHTML(v){ this._h=v; if(id) sinks[id]=v; },
      appendChild(){},addEventListener(){},removeEventListener(){},
      querySelector(sel){ return el(id+sel); },querySelectorAll(){return [];},
      focus(){},remove(){},setAttribute(){},getAttribute(){return null;},offsetWidth:0};
    return o;
  };
  const sb={document:{getElementById:el,querySelector:()=>el(),querySelectorAll:()=>[],
      createElement:()=>el(),addEventListener(){},body:el('body'),head:el('head'),visibilityState:'visible'},
    window:{addEventListener(){},speechSynthesis:{cancel(){},speak(){}},history:{pushState(){}},
      location:{origin:'http://x',search:'',host:'x',protocol:'http:'}},
    location:{origin:'http://x',search:'',host:'x',protocol:'http:'},
    navigator:{}, localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    speechSynthesis:{cancel(){},speak(){}}, SpeechSynthesisUtterance:function(){},
    EventSource:function(){this.addEventListener=()=>{};this.close=()=>{};},
    URLSearchParams,URL,
    setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval:()=>0,
    requestAnimationFrame:()=>0,cancelAnimationFrame(){},
    fetch:async()=>({ok:false,json:async()=>({})}),
    console:{log(){},warn(){},error(){}},
    JSON,Date,Set,Map,Math,Array,Object,String,Number,Boolean,RegExp,Promise,Error,
    isNaN,parseInt,parseFloat,encodeURIComponent,Intl};
  sb.globalThis=sb; vm.createContext(sb); vm.runInContext(code,sb);
  return {api:sb.__api, sinks};
}

// One shared game state
const S={
  active:true, seq:9, phase:'reveal',
  players:['Papa','Lili','Matix'], scores:[900,400,650],
  categories:['History','Science'], numCats:2, numQ:5,
  turnOrder:[0,1,2], turnPos:1, nextPickerIdx:1, numActivePlayers:3,
  used:{'0-0':true}, blocked:{}, streak:[2,0,-1], pickedThisRound:[0,1,2],
  judgeMode:'human', roundNumber:2, roundQuestionCount:3,
  roundEnded:{round:1, at:Date.now()},
  lastResult:{player:'Papa', correct:true, steal:false, pts:300},
  revealedAnswer:'Leonardo da Vinci',
  attempts:[
    {player:'Papa', type:'main',  correct:true,  pts:300},
    {player:'Papa', type:'main',  correct:false, pts:0},
    {player:'Papa', type:'steal', correct:true,  pts:150},
    {player:'Lili', type:'main',  correct:true,  pts:400},
    {player:'Lili', type:'steal', correct:false, pts:0},
    {player:'Matix',type:'main',  correct:true,  pts:650},
  ],
  currentQuestion:null, timer:null, generating:null, speak:null,
};

const tv   = load('tv.html',   `;globalThis.__api={renderRoundEnd};`);
const join = load('join.html', `;globalThis.__api={render, set ME(v){ME=v;}, set askedWho(v){_askedWho=v;}};`);

tv.api.renderRoundEnd(S);
join.api.askedWho=true; join.api.ME=0;
join.api.render(S);

const tvHtml   = tv.sinks['roundTable']||'';
const joinHtml = join.sinks['rtable']||'';

// Pull the facts out of each rendering — visible TEXT only, so table attributes
// like colspan="3" aren't mistaken for game figures.
const text = h => h.replace(/<[^>]*>/g,' ');
const nums = h => (text(h).match(/\d+/g)||[]).map(Number);
const has  = (h,s) => h.includes(s);

let pass=true;
const check=(name,cond)=>{ console.log(`  ${cond?'✓':'✗'} ${name}`); if(!cond) pass=false; };

console.log('Same state → same round-end facts on both screens:\n');
console.log(`  TV   table: ${tvHtml.length} chars`);
console.log(`  Phone card: ${joinHtml.length} chars\n`);

// Papa: own 1/2 = 50%, 300 pts; steal 1/1 = 100%, 150 pts; total 900
[['Papa',900],['Lili',400],['Matix',650]].forEach(([n,score])=>{
  check(`${n} appears on both`, has(tvHtml,n) && has(joinHtml,n));
  check(`${n} total ${score} on both`, has(tvHtml,String(score)) && has(joinHtml,String(score)));
});
check('Papa own-pick rate 50% on both',   has(tvHtml,'50%')  && has(joinHtml,'50%'));
check('Papa steal rate 100% on both',     has(tvHtml,'100%') && has(joinHtml,'100%'));
check('Papa steal points 150 on both',    has(tvHtml,'150')  && has(joinHtml,'150'));
check('leader crown on both',             has(tvHtml,'👑')   && has(joinHtml,'👑'));

// Every number the TV reports must also appear on the phone
const tvSet=new Set(nums(tvHtml)), joinSet=new Set(nums(joinHtml));
const missing=[...tvSet].filter(n=>!joinSet.has(n));
check(`no TV figure missing from the phone${missing.length?' (missing: '+missing.join(',')+')':''}`, missing.length===0);

console.log('\n'+(pass?'✓✓ PASS — the phone reports everything the big screen does':'✗✗ FAIL'));
process.exit(pass?0:1);
