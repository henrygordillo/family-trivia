// A joined device belongs to ONE person, so it should talk to them: "You got it!"
// — while the same moment on someone else's phone stays third person.
const fs=require('fs'), vm=require('vm');

function loadJoin(){
  const html=fs.readFileSync('join.html','utf8');
  const s=html.indexOf('<script>')+8, e=html.lastIndexOf('</script>');
  let code=html.slice(s,e).replace(/^\s*init\(\);\s*$/m,'');
  code+=`;globalThis.__api={render, set ME(v){ME=v;}, set askedWho(v){_askedWho=v;}};`;
  const sinks={};
  const el=(id)=>({id,style:new Proxy({},{get:()=>'',set:()=>true}),
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    dataset:{},value:'',children:[],textContent:'',
    get innerHTML(){return this._h||'';}, set innerHTML(v){ this._h=v; if(id) sinks[id]=v; },
    appendChild(){},addEventListener(){},removeEventListener(){},
    querySelector(sel){return el(id+sel);},querySelectorAll(){return [];},
    focus(){},remove(){},setAttribute(){},getAttribute(){return null;},offsetWidth:0});
  const sb={document:{getElementById:el,querySelector:()=>el(),querySelectorAll:()=>[],
      createElement:()=>el(),addEventListener(){},body:el('body'),head:el('head'),visibilityState:'visible'},
    window:{addEventListener(){},speechSynthesis:{cancel(){}},history:{pushState(){}},
      location:{origin:'http://x',search:'',host:'x',protocol:'http:'}},
    location:{origin:'http://x',search:'',host:'x',protocol:'http:'},
    navigator:{}, localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    speechSynthesis:{cancel(){}}, EventSource:function(){this.addEventListener=()=>{};this.close=()=>{};},
    URLSearchParams,URL, setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval:()=>0,
    requestAnimationFrame:()=>0,cancelAnimationFrame(){},
    fetch:async()=>({ok:false,json:async()=>({})}), console:{log(){},warn(){},error(){}},
    JSON,Date,Set,Map,Math,Array,Object,String,Number,Boolean,RegExp,Promise,Error,
    isNaN,parseInt,parseFloat,encodeURIComponent,Intl};
  sb.globalThis=sb; vm.createContext(sb); vm.runInContext(code,sb);
  return {api:sb.__api, sinks};
}

const base={
  active:true, players:['Papa','Lili','Matix'], scores:[900,400,650],
  categories:['History','Science'], numCats:2, numQ:5,
  turnOrder:[0,1,2], turnPos:0, nextPickerIdx:0, numActivePlayers:3,
  used:{}, blocked:{}, streak:[0,0,0], pickedThisRound:[0], judgeMode:'human',
  roundNumber:1, roundQuestionCount:1, attempts:[],
  currentQuestion:{text:'Who painted the Mona Lisa?'}, timer:null, generating:null, speak:null,
};

let pass=true;
const check=(name,cond,got)=>{ console.log(`  ${cond?'✓':'✗'} ${name}${cond?'':'   got: '+got}`); if(!cond) pass=false; };

function say(me, state){
  const j=loadJoin();
  j.api.askedWho=true; j.api.ME=me;
  j.api.render(Object.assign({}, base, state, {seq:Math.random()}));
  return { res:(j.sinks['res']||''), table:(j.sinks['rtable']||'') };
}

console.log("Papa's phone vs Lili's phone, same moment:\n");

const correct={phase:'reveal', curCat:0, curQ:2, curPts:300, answererIdx:0,
  wrongPlayers:[], stealMode:false, lastResult:{player:'Papa',correct:true,steal:false,pts:300}};

let a=say(0, correct), b=say(1, correct);
check("Papa's phone: \"You got it!\"", a.res.includes('You got it'), a.res.slice(0,70));
check("Lili's phone: \"Papa got it\"", b.res.includes('Papa got it') && !b.res.includes('You got it'), b.res.slice(0,70));

const stolen=Object.assign({},correct,{lastResult:{player:'Papa',correct:true,steal:true,pts:150}});
a=say(0, stolen);
check("Papa's phone on a steal: \"You got it! — STOLEN!\"", a.res.includes('You got it') && a.res.includes('STOLEN'), a.res.slice(0,80));

const missed={phase:'answering', curCat:0, curQ:2, curPts:300, answererIdx:0,
  wrongPlayers:[0], stealMode:false, lastResult:{player:'Papa',correct:false,steal:false,pts:0}};
a=say(0, missed); b=say(1, missed);
check("Papa's phone: \"You missed\"", a.res.includes('You missed'), a.res.slice(0,70));
check("Lili's phone: \"Papa missed\"", b.res.includes('Papa missed') && !b.res.includes('You missed'), b.res.slice(0,70));

const nobody=Object.assign({},correct,{lastResult:{player:'Papa',correct:false,steal:false,pts:0}});
a=say(0, nobody);
check('nobody got it → stays impersonal on every phone', a.res.includes('Nobody got it'), a.res.slice(0,70));

console.log('\nRound-end verdict:\n');
const roundEnd={phase:'reveal', roundEnded:{round:1,at:Date.now()}, revealedAnswer:'Leonardo da Vinci',
  curCat:0, curQ:2, curPts:300, answererIdx:0, wrongPlayers:[], stealMode:false,
  lastResult:{player:'Papa',correct:true,steal:false,pts:300}};
a=say(0, roundEnd); b=say(1, roundEnd);
check("Papa's phone: \"You got it!\"", a.table.includes('You got it'), a.table.slice(0,90));
check("Lili's phone: \"Papa got it\"", b.table.includes('Papa got it') && !b.table.includes('You got it'), b.table.slice(0,90));

console.log('\nA spectator (not playing):\n');
const sp=say(-1, correct);
check('spectator sees third person', sp.res.includes('Papa got it') && !sp.res.includes('You got it'), sp.res.slice(0,70));

console.log('\n'+(pass?'✓✓ PASS — each device speaks to whoever is holding it':'✗✗ FAIL'));
process.exit(pass?0:1);
