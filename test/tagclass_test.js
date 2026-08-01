// The difficulty/judge tags have now collided twice with existing classes:
// once in index.html (.chip was the setup screen's category buttons — cream fill)
// and once in tv.html (.chip was the player cards' "picked this round" — the leaked
// nowrap and padding widened the cards and crushed the streak badge's row).
// Each screen's tag class must therefore be used by NOTHING ELSE on that screen.
const fs=require('fs');
let fail=0; const chk=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n); if(!c)fail++;};

const screens=[
  {file:'index.html', tag:'hchip'},
  {file:'tv.html',    tag:'gtag'},
  {file:'join.html',  tag:'chip'},   // scoped as `.setupline .chip`, nothing else uses it
];

for(const {file,tag} of screens){
  const src=fs.readFileSync('public/'+file,'utf8');
  // every place the class appears in markup or a template string
  const uses=[...src.matchAll(new RegExp('class="([^"]*\\b'+tag+'\\b[^"]*)"','g'))].map(m=>m[1]);
  const nonTag=uses.filter(u=>{
    const i=src.indexOf('class="'+u+'"');
    const ctx=src.slice(Math.max(0,i-260), i);
    return !/difficulty|judge|setupLine|hchips|boardSetupLine|trouble/i.test(ctx);
  });
  chk(file+': "'+tag+'" is used only by the setup tags'+(nonTag.length?' — also '+JSON.stringify(nonTag):''),
      nonTag.length===0);
  chk(file+': the tags actually render', new RegExp('class="'+tag+'( trouble)?">\\$\\{').test(src)
      || new RegExp('class="'+tag+'">').test(src));
}

// And the streak badge must survive: same thresholds and same values on all three,
// or the room and the host disagree about who is hot.
const all=['index.html','tv.html','join.html'].map(f=>fs.readFileSync('public/'+f,'utf8'));
chk('all three screens render a streak badge', all.every(s=>s.includes('\u{1F525}') && s.includes('\u{1F9CA}')));
chk('all three use the same +/-2 threshold',
    all.every(s=>/st\s*>=\s*2/.test(s) && /st\s*<=\s*-2/.test(s)));

console.log(fail?('\n'+fail+' FAILED'):'\nno tag-class collisions');
process.exit(fail?1:0);
