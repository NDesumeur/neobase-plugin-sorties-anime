// Le volet système de Sorties anime : ce que tu as regardé sur FRAnime, lu dans l'historique d'Opera GX et de Chrome (SQLite, avec le sqlite de Node)
// et dans celui de NeoDex. Seules les lignes franime.fr/anime/<slug>?s=<saison>&ep=<épisode> comptent ; résultat : [{slug, title, season, ep, last}], le plus récent d'abord.
const fs = require('fs'), path = require('path'), os = require('os');

const HISTORIES = () => [path.join(process.env.APPDATA || '', 'Opera Software', 'Opera GX Stable', 'Default', 'History'),
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data', 'Default', 'History')];

function rowsOf(rows) {
  const out = {};
  for (const { url, title, last } of rows) {  // last : en ms unix (SQLite convertit : les µs depuis 1601 de Chrome ne tiennent pas dans un nombre JS)
    const m = /^https:\/\/franime\.fr\/anime\/([^?#/]+)\?([^#]*)/.exec(url);
    if (!m) continue;
    const q = new URLSearchParams(m[2]), s = /^\d+$/.test(q.get('s') || '') ? +q.get('s') : 1;
    const t = /^https?:/.test(title || '') ? '' : title || '';  // NeoDex garde l'adresse comme titre tant que la page charge
    const e2 = /\bEP(\d+)/.exec(t);  // certains liens n'ont pas ep= : le titre de la page l'a
    const ep = /^\d+$/.test(q.get('ep') || '') ? +q.get('ep') : e2 ? +e2[1] : 0;
    const a = out[m[1]] ??= { slug: m[1], title: m[1], season: s, ep: 0, last: 0 };
    if (t && a.title === m[1]) a.title = t.split(/\s+S\d+\b/)[0].trim() || m[1];
    if (s > a.season || (s === a.season && ep > a.ep)) Object.assign(a, { season: s, ep });
    a.last = Math.max(a.last, last);
  }
  return Object.values(out).filter(a => a.ep).sort((a, b) => b.last - a.last);  // ép. 0 = page ouverte, rien de regardé
}

function read(files = HISTORIES(), neodex = '') {
  const { DatabaseSync } = require('node:sqlite');
  const rows = [];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const copy = path.join(os.tmpdir(), `neodex-history-${process.pid}-${rows.length}.db`);  // le navigateur verrouille son fichier
    fs.copyFileSync(f, copy);
    try {
      const db = new DatabaseSync(copy, { readOnly: true });
      try { rows.push(...db.prepare("select url, title, last_visit_time / 1000 - 11644473600000 as last from urls where url like 'https://franime.fr/anime/%'").all()); } finally { db.close(); }
    } finally { fs.rmSync(copy, { force: true }); }
  }
  try { for (const h of JSON.parse(fs.readFileSync(neodex, 'utf8'))) if (/^https:\/\/franime\.fr\/anime\//.test(h.url)) rows.push({ url: h.url, title: h.title, last: h.t }); } catch {}  // les onglets de NeoDex
  return rowsOf(rows);
}

module.exports = api => {
  const neodex = path.join(api.electron.app.getPath('userData'), 'history.json');
  api.ipcMain.handle('franime:read', () => read(HISTORIES(), neodex));
};
module.exports.read = read;  // pour test-main.js
