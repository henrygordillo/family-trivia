// The shared screen's scoreboard says things with weight rather than words:
// who still owes a pick is the card's opacity, not a chip. That only reads if
// the muting never touches the card that's actually playing.
const fs=require('fs');
let fail=0; const chk=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n); if(!c)fail++;};
const tv=fs.readFileSync('public/tv.html','utf8');
const css=tv.slice(0, tv.indexOf('</style>'));

chk('no seat numbers', !tv.includes('pnum'));
chk('no picked/owed chips', !tv.includes('picked this round</span>') && !tv.includes('chip owed'));
// Three states, told by SURFACE. Opacity is the wrong channel: fading the card
// takes the score with it, and the score is what you read from across the room.
const at=k=>css.indexOf('.pcard.'+k);
chk('both states are explicit, never an implicit default', at('pending')>0 && at('done')>0);
chk('states are assigned per player',
    /pickedThisRound\|\|\[\]\)\.includes\(i\)[\s\S]{0,160}done \? ' done' : ' pending'/.test(tv));
chk('no whole-card opacity fade', !/\.pcard\.(done|pending)\{[^}]*opacity/.test(css));

for(const k of ['pending','done']){
  const rule=css.slice(at(k), css.indexOf('}', at(k)));
  chk('.'+k+' differs by background', /background:/.test(rule));
  chk('.'+k+' differs by border',     /border-color:/.test(rule));
}
// Done and pending must not resolve to the same surface, or there are no states.
const bg=k=>(css.slice(at(k), css.indexOf('}', at(k))).match(/background:([^;]+)/)||[])[1];
chk('done and pending are visibly different', bg('done')!==bg('pending'));

// Cascade: the live states are declared after, so whoever is up wins regardless
// of whether they have already picked.
chk('live states override both', at('active')>at('done') && at('active')>at('pending')
    && at('steal')>at('done') && at('ondeck')>at('done'));
// ...and the score stays legible on a done card rather than vanishing.
// The LIFT belongs on pending, not the dimming on done. Recessing done made the
// leader — crown, top score and all — the deadest card on the screen.
{
  const val=(k,prop)=>{
    const r=css.slice(at(k), css.indexOf('}', at(k)));
    const m=r.match(new RegExp(prop+':rgba\\(255,255,255,(\\.\\d+)\\)'));
    return m?Number(m[1]):null;
  };
  chk('pending is brighter than done',
      val('pending','background') > val('done','background'));
  chk('done is not dimmer than a plain card', val('done','background') >= 0.03);
  chk('nothing recolours the name or score on a done card',
      !/\.pcard\.done \.(pname|pscore)\{/.test(css));
  const gap=val('pending','border-color') - val('done','border-color');
  chk('the two states are far enough apart to see ('+gap.toFixed(2)+')', gap>=0.3);
}

console.log(fail?('\n'+fail+' FAILED'):'\nscoreboard checks passed');
process.exit(fail?1:0);
