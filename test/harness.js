// ═══════════════════════════════════════════════════════════════════════════
// Family Trivia — game-logic harness.
//
// Loads the REAL script out of index.html (not a reimplementation) behind DOM
// stubs, then plays complete games deterministically. Produces a fingerprint of
// every game's outcome so a refactor can be diffed against a baseline.
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const vm = require('vm');

// ── Deterministic RNG, so every run is byte-identical ──────────────────────
function mulberry32(a){
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

// ── Minimal DOM so the real code can run ──────────────────────────────────
function makeEl(){
  const el={
    style:new Proxy({},{get:()=>'',set:()=>true}),
    classList:{ _s:new Set(),
      add(...c){c.forEach(x=>this._s.add(x));},
      remove(...c){c.forEach(x=>this._s.delete(x));},
      toggle(c,on){ if(on===undefined){ this._s.has(c)?this._s.delete(c):this._s.add(c); } else { on?this._s.add(c):this._s.delete(c); } },
      contains(c){return this._s.has(c);} },
    dataset:{}, children:[], value:'', textContent:'', innerHTML:'',
    appendChild(){}, removeChild(){}, addEventListener(){}, removeEventListener(){},
    querySelector(){return makeEl();}, querySelectorAll(){return [makeEl()];},
    getContext(){return null;}, focus(){}, blur(){}, click(){}, remove(){},
    setAttribute(){}, getAttribute(){return null;}, scrollIntoView(){},
  };
  return el;
}

function buildSandbox(seed){
  const rnd = mulberry32(seed);
  const store = {};
  const doc = {
    getElementById(){ return makeEl(); },
    querySelector(){ return makeEl(); },
    querySelectorAll(){ return []; },
    createElement(){ return makeEl(); },
    createRange(){ return {selectNodeContents(){}}; },
    addEventListener(){}, body:makeEl(), head:makeEl(),
  };
  const sandbox = {
    document: doc,
    window: { addEventListener(){}, speechSynthesis:{cancel(){},speak(){}},
              getSelection(){return{removeAllRanges(){},addRange(){}};},
              history:{pushState(){}}, location:{href:''} },
    navigator: { clipboard:{writeText:async()=>{}}, mediaDevices:{} },
    localStorage: {
      getItem:k=>(k in store?store[k]:null),
      setItem:(k,v)=>{store[k]=String(v);},
      removeItem:k=>{delete store[k];},
    },
    speechSynthesis:{cancel(){},speak(){}},
    SpeechSynthesisUtterance: function(){},
    setTimeout:(fn)=>{ return 0; },          // never fire async timers in the sim
    clearTimeout(){}, setInterval(){return 0;}, clearInterval(){},
    fetch: async()=>({ ok:false, json:async()=>({}) }),   // offline: code must fall back
    console: { log(){}, warn(){}, error(){} },
    Math: Object.create(Math),
    JSON, Date, Set, Map, Array, Object, String, Number, Boolean, RegExp,
    Promise, Error, isNaN, parseInt, parseFloat, encodeURIComponent, Intl,
  };
  sandbox.Math.random = rnd;                  // deterministic shuffles
  sandbox.window.localStorage = sandbox.localStorage;
  sandbox.globalThis = sandbox;
  return sandbox;
}

// ── Pull the real script out of the HTML ──────────────────────────────────
function loadGame(file, seed){
  const html = fs.readFileSync(file,'utf8');
  const s = html.indexOf('<script>')+8;
  const e = html.lastIndexOf('</script>');
  let code = html.slice(s,e);
  // The app auto-runs init() on load; that's all DOM wiring we don't need.
  code = code.replace(/^\s*init\(\);\s*$/m, '');
  // `let`/`const` don't become globals in a VM context, so surface the bits we drive.
  code += `
    ;(function(){
      globalThis.__api = {
        get G(){ return G; },
        set G(v){ G = v; },
        PTS: (typeof PTS!=='undefined'?PTS:[100,200,300,400,500]),
        resolveAnswer, advanceTurnPos, currentPickerIdx, findStealIdx, markUsed,
        getEffectivePicker: (typeof getEffectivePicker!=='undefined'?getEffectivePicker:null),
      };
    })();
  `;
  const sandbox = buildSandbox(seed);
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, {timeout:10000});
  return sandbox.__api;
}

// ── Play one full game and fingerprint the outcome ─────────────────────────
function playGame(file, seed, opts){
  const sb = loadGame(file, seed);   // { G, PTS, resolveAnswer, ... }
  const G = sb.G;
  const rnd = mulberry32(seed ^ 0x9e3779b9);

  const nPlayers = opts.players;
  const nCats    = opts.cats;

  // Set up exactly as startGame() would, minus the network/DOM parts
  G.players    = Array.from({length:nPlayers},(_,i)=>'P'+i);
  G.scores     = G.players.map(()=>0);
  G.judgeMode  = 'human';
  G.hjJudgeIdx = -1;                       // no named judge (current design)
  G.numCats    = nCats;
  G.numQ       = 5;
  G.categories = Array.from({length:nCats},(_,i)=>'Cat'+i);
  G.turnOrder  = Array.from({length:nPlayers},(_,i)=>i);
  G.turnPos    = 0;
  G.nextPickerIdx = G.turnOrder[0];
  G.numActivePlayers = nPlayers;
  G.used = {}; G.qData = {}; G.askedQuestions = [];
  G.roundQuestionCount = 0;
  G.roundNumber = 1;
  G.streak = G.players.map(()=>0);
  G.pickedThisRound = [];
  G.attempts = [];

  // Blocked tiles — same rule the app uses
  G.blocked = {};
  const blockCount = (nCats*5) % nPlayers;
  if(blockCount>0){
    const cats  = Array.from({length:nCats},(_,i)=>i).sort(()=>rnd()-0.5);
    const tiers = [0,1,2,3,4].sort(()=>rnd()-0.5);
    for(let k=0;k<blockCount;k++) G.blocked[`${cats[k%cats.length]}-${tiers[k%tiers.length]}`]=true;
  }

  const PTS = sb.PTS || [100,200,300,400,500];
  const playable = [];
  for(let qi=0;qi<5;qi++) for(let ci=0;ci<nCats;ci++){
    const key=`${ci}-${qi}`;
    if(!G.blocked[key]) playable.push({ci,qi,key});
  }

  const log = [];
  let guard = 0;
  const total = playable.length;

  while(Object.keys(G.used).length < total && guard++ < 500){
    // Whoever's turn it is picks a random remaining tile
    const remaining = playable.filter(t=>!G.used[t.key]);
    if(!remaining.length) break;
    const t = remaining[Math.floor(rnd()*remaining.length)];

    const picker = sb.currentPickerIdx();
    G.curCat = t.ci; G.curQ = t.qi; G.curPts = PTS[t.qi];
    G.wrongPlayers = []; G.stealMode = false;
    G.answererIdx = picker;
    if(!G.pickedThisRound.includes(picker)) G.pickedThisRound.push(picker);

    // Main answer: correct 45% of the time (deterministic)
    let correct = rnd() < 0.45;
    sb.resolveAnswer(correct);
    log.push(`pick p${picker} ${t.key} ${correct?'OK':'X'} -> ${G.scores.join(',')}`);

    if(!correct){
      // Steal: the next eligible player may take it
      G.wrongPlayers.push(picker);
      const stealer = sb.findStealIdx();
      if(stealer>=0 && stealer!=null){
        G.stealMode = true;
        G.answererIdx = stealer;
        const sOK = rnd() < 0.35;
        sb.resolveAnswer(sOK);
        log.push(`  steal p${stealer} ${sOK?'OK':'X'} -> ${G.scores.join(',')}`);
      }
    }

    sb.markUsed();
    sb.advanceTurnPos();

    // Round boundary — mirrors showFinalReveal()
    if(G.numActivePlayers>0 && G.roundQuestionCount>0 &&
       G.roundQuestionCount % G.numActivePlayers === 0){
      G.roundNumber++;
      G.pickedThisRound = [];
    }
  }

  return {
    seed, players:nPlayers, cats:nCats,
    blocked: Object.keys(G.blocked).sort().join('|'),
    playable: total,
    used: Object.keys(G.used).length,
    finished: Object.keys(G.used).length === total,
    scores: G.scores.slice(),
    streak: (G.streak||[]).slice(),
    rounds: G.roundNumber,
    turnPos: G.turnPos,
    attempts: (G.attempts||[]).length,
    log,
  };
}

// ── Run the whole matrix of games ─────────────────────────────────────────
function runSuite(file){
  const results = [];
  const combos = [];
  for(let p=1;p<=5;p++) for(const c of [4,5,6]) combos.push({players:p,cats:c});
  combos.forEach(cmb=>{
    for(let seed=1;seed<=4;seed++){
      results.push(playGame(file, seed*1000+cmb.players*10+cmb.cats, cmb));
    }
  });
  return results;
}

// Fingerprint: everything that must not change across a refactor
function fingerprint(results){
  return results.map(r=>
    [r.players,r.cats,r.blocked,r.playable,r.used,r.finished,
     r.scores.join(','),r.streak.join(','),r.rounds,r.attempts,
     r.log.length].join(' | ')
  ).join('\n');
}

module.exports = { runSuite, fingerprint, playGame };

if(require.main === module){
  const file = process.argv[2] || 'index.html';
  const out  = process.argv[3];
  const res  = runSuite(file);
  const fp   = fingerprint(res);
  const fin  = res.filter(r=>r.finished).length;
  console.log(`games: ${res.length}   finished cleanly: ${fin}/${res.length}`);
  const bad = res.filter(r=>!r.finished);
  if(bad.length) bad.forEach(b=>console.log('  UNFINISHED:', b.players+'p', b.cats+'cat', b.used+'/'+b.playable));
  if(out){ fs.writeFileSync(out, fp); console.log(`fingerprint -> ${out} (${fp.split('\n').length} lines)`); }
}
