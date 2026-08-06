// A bad question used to vanish on regen and leave no trace, so "about three bad
// ones in five or six games" could be felt but never counted or acted on.
const fs=require('fs');
let fail=0; const chk=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n); if(!c)fail++;};
const idx=fs.readFileSync('index.html','utf8');
const srv=fs.existsSync('server.js') ? fs.readFileSync('server.js','utf8')
        : fs.readFileSync('../server.js','utf8');

// The reason list replaces the old yes/no confirm, so it costs no extra tap.
chk('old blind confirm is gone', !idx.includes('regenYes'));
for(const r of ['wrong_answer','ambiguous','unclear','repeat']){
  chk('reason offered: '+r, idx.includes('data-r="'+r+'"'));
}
chk('and an escape hatch', idx.includes('data-r="other"'));

// Difficulty must NOT be a flag reason — it's measured from hit rates across
// hundreds of attempts, and one host's impression would only add noise.
chk('no subjective difficulty reason',
    !/data-r="(too_hard|too_easy|difficulty|wrong_level)"/.test(idx));

// Every reason must both record and replace.
chk('reasons record then regenerate',
    /flagQuestion\(b\.dataset\.r\);[\s\S]{0,80}regenQuestion\(\)/.test(idx));
chk('flagging never blocks the game', /fetch\(BACKEND\+'\/api\/flags'[\s\S]{0,700}\.catch\(\(\)=>\{\}\)/.test(idx));

// Regen is about the question, not about who judges the answer.
chk('regen available in AI mode too',
    !/regenBtn[\s\S]{0,120}judgeMode==='human'\?'block'/.test(idx));

// The reveal button had the same handler bound twice: open, then instantly shut.
chk('reveal handler bound exactly once',
    (idx.match(/getElementById\('revealBtnFoot'\)\.addEventListener/g)||[]).length===1);

// Server side: an unknown reason must not poison the tallies.
chk('server constrains the reason set', /FLAG_REASONS\s*=\s*\['wrong_answer','ambiguous','unclear','repeat','other'\]/.test(srv));
chk('unknown reasons fall back to other', /FLAG_REASONS\.includes\(reason\)\s*\?\s*reason\s*:\s*'other'/.test(srv));
chk('flags can be read back with tallies', /app\.get\('\/api\/flags'/.test(srv)
    && /byReason/.test(srv) && /byCatTier/.test(srv));

console.log(fail?('\n'+fail+' FAILED'):'\nflag checks passed');
process.exit(fail?1:0);
