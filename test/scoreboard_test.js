// The shared screen's scoreboard says things with weight rather than words:
// who still owes a pick is the card's opacity, not a chip. That only reads if
// the muting never touches the card that's actually playing.
const fs=require('fs');
let fail=0; const chk=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n); if(!c)fail++;};
const tv=fs.readFileSync('public/tv.html','utf8');
const css=tv.slice(0, tv.indexOf('</style>'));

chk('no seat numbers', !tv.includes('pnum'));
chk('no picked/owed chips', !tv.includes('picked this round</span>') && !tv.includes('chip owed'));
chk('done state exists', /\.pcard\.done\{opacity:\.\d+/.test(css));
chk('done is applied from pickedThisRound', /pickedThisRound\|\|\[\]\)\.includes\(i\)[\s\S]{0,120}cls\+=' done'/.test(tv));

// Cascade: .done must be declared BEFORE the live states, and each live state
// must re-assert opacity:1 — otherwise the current picker dims mid-turn.
const at=k=>css.indexOf('.pcard.'+k);
chk('.done precedes the live states',
    at('done') < at('active') && at('done') < at('steal') && at('done') < at('ondeck'));
for(const k of ['active','steal','ondeck']){
  const rule=css.slice(at(k), css.indexOf('}', at(k)));
  chk('.'+k+' stays fully opaque', /opacity:1/.test(rule));
}

// The muting must be readable but not illegible from a sofa.
const op=Number((css.match(/\.pcard\.done\{opacity:(\.\d+)/)||[])[1]);
chk('muted cards are still readable ('+op+')', op>=0.3 && op<=0.6);

console.log(fail?('\n'+fail+' FAILED'):'\nscoreboard checks passed');
process.exit(fail?1:0);
