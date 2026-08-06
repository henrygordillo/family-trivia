// The roster row used to stack three tap targets inside a card that was itself a
// tap target: select (whole card), lifetime stats (~16px pill) and edit (~21px
// pencil). Aiming for a small one and hitting "select" was the normal outcome.
const fs=require('fs');
let fail=0; const chk=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n); if(!c)fail++;};
const idx=fs.readFileSync('index.html','utf8');
const css=idx.slice(0, idx.indexOf('</style>'));

// Selection needs a control you can see — nothing used to indicate the card was tappable.
chk('selection has a visible control', /\.roster-player \.rp-box\{/.test(css));
chk('the box fills when selected', /\.roster-player\.selected \.rp-box\{background:var\(--teal\)/.test(css));
chk('the row still toggles', /class="roster-player\$\{sel\?' selected':''\}" onclick="togglePlayerSelect/.test(idx));

// Both secondary actions must clear the 44px comfortable minimum.
for(const [sel,label] of [['.rp-btn','edit'],['.rp-lt','lifetime']]){
  const i=css.indexOf(sel+'{');
  const rule=css.slice(i, css.indexOf('}', i));
  const w=Number((rule.match(/min-width:(\d+)px/)||[])[1]);
  const h=Number((rule.match(/min-height:(\d+)px/)||[])[1]);
  chk(label+' target is at least 44px ('+w+'x'+h+')', w>=44 && h>=44);
}

// Both must stop the row's toggle, or tapping them also selects the player.
chk('edit does not also select', /openEditPlayer[\s\S]{0,40}/.test(idx)
    && /event\.stopPropagation\(\);openEditPlayer/.test(idx));
chk('lifetime does not also select', /event\.stopPropagation\(\);openLifetimeStats/.test(idx));

// The lifetime column is held open with no stats, so rows don't jump.
chk('lifetime column reserved when empty', /class="rp-lt none"/.test(idx));
chk('...and says so', /no games<br>yet/.test(idx));

// Email identified a record, not a person.
chk('email dropped from the row', !/rp-full">\$\{[^}]*\}\s*·\s*\$\{p\.email\}/.test(idx)
    && !idx.includes('} · ${p.email}'));

// House style: no native blocking dialogs.
{
  const js=idx.slice(idx.indexOf('<script>')+8, idx.lastIndexOf('</script>'));
  chk('no native alert()', (js.match(/(?<![\w.])alert\(/g)||[]).length===0);
}
console.log(fail?('\n'+fail+' FAILED'):'\nroster checks passed');
process.exit(fail?1:0);
