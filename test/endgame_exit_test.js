// Does endGame() actually switch to the setup screen, or throw before it?
const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
const s=html.indexOf('<script>')+8, e=html.lastIndexOf('</script>');
let code=html.slice(s,e).replace(/^\s*init\(\);\s*$/m,'');
// endGame now awaits a custom dialog instead of confirm(); auto-accept it.
code+=`;ask = async()=>true;`;
code+=`;globalThis.__api={ endGame,
  get G(){return G;}, set G(v){G=v;},
  setInGame(v){_inGame=v;}, get inGame(){return _inGame;},
  setTV(v){TV_CODE=v;}, get TV(){return TV_CODE;} };`;

const SCREENS=['setup','board','qscreen','end'];
const active=new Set();
const store={};
function mkEl(id){
  const isScreen=SCREENS.includes(id);
  const cls={_s:new Set(isScreen?['screen']:[]),
    add(...c){c.forEach(x=>this._s.add(x)); if(isScreen&&c.includes('active'))active.add(id);},
    remove(...c){c.forEach(x=>this._s.delete(x)); if(isScreen&&c.includes('active'))active.delete(id);},
    toggle(){}, contains(c){return this._s.has(c);}};
  return {id,classList:cls,style:new Proxy({},{get:()=>'',set:()=>true}),dataset:{},value:'',textContent:'',innerHTML:'',
    appendChild(){},addEventListener(){},removeEventListener(){},querySelector(){return mkEl('_');},querySelectorAll(){return [];},
    focus(){},remove(){},setAttribute(){},getAttribute(){return null;}};
}
const doc={
  getElementById:id=>mkEl(id),
  querySelector:()=>mkEl('_'),
  querySelectorAll:sel=> sel==='.screen' ? SCREENS.map(mkEl) : [],
  createElement:()=>mkEl('_'), createRange:()=>({selectNodeContents(){}}),
  addEventListener(){}, body:mkEl('body'), head:mkEl('head'),
};
const sb={document:doc,
  window:{addEventListener(){},speechSynthesis:{cancel(){},speak(){}},history:{pushState(){},replaceState(){}},location:{href:'',search:'',pathname:'/',origin:'http://x',protocol:'http:'}},
  navigator:{clipboard:{writeText:async()=>{}},sendBeacon(){return true;}},
  localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}},
  speechSynthesis:{cancel(){},speak(){}},SpeechSynthesisUtterance:function(){},
  setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},
  fetch:async()=>({ok:false,json:async()=>({})}),
  confirm:()=>true, alert:()=>{},
  console:{log(){},warn(){},error(){}},
  JSON,Date,Set,Map,Math,Array,Object,String,Number,Boolean,RegExp,Promise,Error,isNaN,parseInt,parseFloat,encodeURIComponent,Intl};
sb.window.localStorage=sb.localStorage; sb.window.confirm=sb.confirm; sb.globalThis=sb;
vm.createContext(sb); vm.runInContext(code,sb);
const api=sb.__api;

async function run(label, tvCode){
  active.clear(); active.add('board');            // pretend we're in a game on the board
  api.setInGame(true);
  api.setTV(tvCode);
  api.G = Object.assign(api.G||{}, {players:['A','B'],scores:[0,0],recording:false,numCats:2,numQ:5,blocked:{},used:{}});
  let threw=null;
  try{ await api.endGame(); }catch(err){ threw=err; }
  const onSetup = active.has('setup') && !active.has('board');
  console.log(`  ${label}: ${threw?('✗ THREW: '+threw.message):(onSetup?'✓ exited to setup':'✗ still on '+[...active].join(','))}  (inGame now=${api.inGame})`);
  return !threw && onSetup;
}
(async()=>{
  console.log('endGame() exit test:');
  const a=await run('no TV', null);
  const b=await run('with TV', '1234');
  process.exit(a&&b?0:1);
})();
