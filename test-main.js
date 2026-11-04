// test de main.js : un faux historique Chrome et un faux historique NeoDex (ELECTRON_RUN_AS_NODE=1 electron test-main.js, ou node 22+)
const assert = require('assert'), path = require('path'), os = require('os'), fs = require('fs');
const { read } = require('./main');
const { DatabaseSync } = require('node:sqlite');
const f = path.join(os.tmpdir(), 'neodex-fake-history.db'), nd = path.join(os.tmpdir(), 'neodex-fake-history.json'); fs.rmSync(f, { force: true });
const db = new DatabaseSync(f);
db.exec('create table urls (url text, title text, last_visit_time integer)');
const t = ms => (ms + 11644473600000) * 1000;
const ins = db.prepare('insert into urls values (?, ?, ?)');
ins.run('https://franime.fr/anime/frieren?s=1&ep=3', 'Frieren S1 EP3', t(1000));
ins.run('https://franime.fr/anime/frieren?s=2&ep=1', 'Frieren S2 EP1', t(3000));
ins.run('https://franime.fr/anime/blue-box?s=1', 'Blue Box S1 EP7', t(2000));
ins.run('https://franime.fr/anime/rien?s=1', 'Rien S1', t(5000));
ins.run('https://example.org/', 'x', t(9000));
db.close();
// NeoDex : l'adresse sert de titre tant que la page charge, puis le vrai titre arrive
fs.writeFileSync(nd, JSON.stringify([{ url: 'https://franime.fr/anime/ao-ashi?s=2&ep=5', title: 'https://franime.fr/anime/ao-ashi?s=2&ep=5', t: 6000 }, { url: 'https://franime.fr/anime/ao-ashi?s=2&ep=5', title: 'Ao ashi S2 EP5 VOSTFR', t: 5500 }, { url: 'https://example.org/', title: 'x', t: 1 }]));
const r = read([f, path.join(os.tmpdir(), 'absent.db')], nd);
assert.deepStrictEqual(r, [{ slug: 'ao-ashi', title: 'Ao ashi', season: 2, ep: 5, last: 6000 }, { slug: 'frieren', title: 'Frieren', season: 2, ep: 1, last: 3000 }, { slug: 'blue-box', title: 'Blue Box', season: 1, ep: 7, last: 2000 }]);
fs.rmSync(f); fs.rmSync(nd); console.log('OK franime');
