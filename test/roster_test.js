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
// The row still toggles — but a REMOVED row opens the editor instead, since that's
// where it gets put back, and selecting it would be meaningless.
chk('an active row toggles selection', /off\?`openEditPlayer\('\$\{p\.id\}'\)`:`togglePlayerSelect\('\$\{p\.id\}'\)`/.test(idx));
chk('a removed row opens the editor instead', /off\?`openEditPlayer/.test(idx));

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
// ── Off the roster, never deleted ──────────────────────────────────────────
// Attempts link to player_id and feed the lifetime stats AND the ruleset
// calibration, so removing a player must not take real answer data with them.
const srv=fs.existsSync('server.js') ? fs.readFileSync('server.js','utf8')
        : fs.readFileSync('../server.js','utf8');

chk('no delete endpoint exists', !/app\.delete\('\/api\/players/.test(srv));
chk('active flag drives the default list', /req\.query\.all !== '1'[\s\S]{0,60}eq\('active', true\)/.test(srv));
chk('removed players can be fetched on request', /\?all=1/.test(idx));
chk('a bare active toggle is accepted', /active !== undefined && first_name === undefined/.test(srv));
chk('removing also drops them from tonight\'s game', /if\(!active\)[\s\S]{0,180}selectedPlayers\.splice/.test(idx));
chk('an inactive player cannot be selected', /active===false\)\{ toast\(`\$\{p\.nickname\} is inactive`\)/.test(idx));
chk('removed rows look different', /\.roster-player\.off\{/.test(css));

// ── Two Johns are indistinguishable, so make them impossible ───────────────
// The roster shows the nickname and nothing else; no extra field helps, because
// none of it is on screen while picking.
chk('nickname clash blocked on create', /nameClash\('nickname', nickname\)/.test(srv));
chk('nickname clash blocked on edit', /nameClash\('nickname', nickname, req\.params\.id\)/.test(srv));
chk('email clash blocked too', /nameClash\('email', email\)/.test(srv));
chk('clash check is case-insensitive', /toLowerCase\(\) === v/.test(srv));
chk('clash check includes removed players',
    !/nameClash[\s\S]{0,400}eq\('active', true\)/.test(srv));
// Retiring a duplicate does NOT change its nickname, so a whole-table unique index
// can't be built while duplicates exist — and it would also stop you putting a
// removed player back under their own name. The index covers active rows; the app
// is the stricter gate, and reactivation is checked separately.
chk('reactivation is guarded against a name taken meanwhile',
    /if \(active\) \{[\s\S]{0,500}nk\.active\) return res\.status\(409\)/.test(srv));
chk('clash returns a sentence, not a Postgres error', /There's already a player called/.test(srv));

// ── Labels, not placeholders ───────────────────────────────────────────────
// A placeholder disappears the moment a field has a value, so an edit form full
// of real data showed "Alec / Gordillo / Alec" with nothing saying which was the
// first name and which the nickname.
{
  const labels=[...idx.matchAll(/<label class="flabel[^"]*" for="([^"]+)"/g)].map(m=>m[1]);
  const fields=['editFirstName','editLastName','editNickname',
                'newFirstName','newLastName','newNickname','newEmail'];
  for(const f of fields) chk('labelled: '+f, labels.includes(f));
  const inputs=new Set([...idx.matchAll(/<input id="([^"]+)"/g)].map(m=>m[1]));
  chk('no label points at a missing field', labels.every(l=>inputs.has(l)));
}

// ── One vocabulary ─────────────────────────────────────────────────────────
// The button said "take off the roster" while the state was called "removed" and
// the filter said something else again. Active / inactive, everywhere.
chk('edit button uses active/inactive', /Make \$\{p\.nickname\} (active again|inactive)/.test(idx));
chk('picker toggle uses active/inactive', /'Show active':'Show inactive'/.test(idx));
chk('no stray "off the roster" in the UI',
    !/(textContent|toast|innerHTML)[^;]*off the roster/.test(idx));
chk('no stray "removed" wording', !/>Removed</.test(idx) && !/Hide removed/.test(idx));

console.log(fail?('\n'+fail+' FAILED'):'\nroster checks passed');
process.exit(fail?1:0);
