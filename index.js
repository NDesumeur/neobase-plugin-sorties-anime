// Sorties anime : ton système d'origine (code inchangé), livré en plugin, avec toutes les sorties jour par jour et l'emploi du temps.
// Ses données sont dans le dossier du plugin (sauvegardé et synchronisé par NeoDex) ; à la première ouverture il reprend tes animes suivis.
const HTML = "<div class=\"appWrap\">\n  <div class=\"agHead\"><span class=\"label\">Sorties anime</span><span class=\"hint\" id=\"anInfo\"></span><div class=\"agNav\"><button class=\"btn px\" id=\"anRefresh\">ACTUALISER</button></div></div>\n  <label class=\"anCheck\"><input type=\"checkbox\" id=\"anCal\"> Ajouter les sorties de mes animes à mon emploi du temps (mises à jour automatiquement)</label>\n  <div class=\"sxTabs\" id=\"anTabs\"></div>\n  <div id=\"anDayBox\">\n    <div class=\"anNav\"><button class=\"btn px\" id=\"anPrev\">‹</button><button class=\"btn px\" id=\"anToday\">AUJOURD'HUI</button><button class=\"btn px\" id=\"anNext\">›</button><b id=\"anDayLabel\"></b>\n      <select class=\"f\" id=\"anSort\"><option value=\"time\">Trier par heure</option><option value=\"pop\">Les plus populaires d'abord</option></select>\n      <label class=\"anCheck\"><input type=\"checkbox\" id=\"anMine\"> seulement mes animes</label></div>\n    <div id=\"anDayList\"></div>\n  </div>\n  <div id=\"anMineBox\"><div class=\"row\"><button class=\"btn main px\" id=\"anImport\"><span class=\"plus\">+</span>Importer une liste</button></div><div id=\"anList\"></div></div>\n  <div id=\"imModal\">\n  <div class=\"win px\" style=\"width:min(600px,92vw)\">\n    <div class=\"winHead\"><h2>IMPORTER UNE LISTE D'ANIMES</h2><button class=\"x\" id=\"imClose\" aria-label=\"Fermer\">X</button></div>\n    <div class=\"body\">\n      <div class=\"hint\"><b style=\"color:#fff\">Depuis FRAnime :</b> ouvre franime.fr/ma_liste dans Opera, ouvre la console (Ctrl+Maj+J), colle cette commande puis Entrée. Elle parcourt toutes les pages de ta liste toute seule (environ 3 s par page) et copie les liens de tes animes : reviens ici et colle-les (Ctrl+V).</div>\n      <div class=\"row\"><input class=\"f\" id=\"imCmd\" readonly style=\"flex:1;font-size:14px\" value=\"(async()=>{const s=new Set();for(let p=1;p<=60;p++){const f=document.createElement('iframe');f.style.cssText='position:fixed;left:-9999px;width:1280px;height:2000px';f.src='/ma_liste?page='+p;document.body.append(f);await new Promise(r=>f.onload=r);await new Promise(r=>setTimeout(r,2500));const n=s.size;[...f.contentDocument.querySelectorAll('a')].map(a=>a.href.split('?')[0]).filter(h=>h.includes('/anime/')).forEach(h=>s.add(h));f.remove();console.log('page '+p+' : '+s.size+' animes');if(s.size===n)break}const t=[...s].join('\\n');try{copy(t)}catch(e){console.log(t)}console.log('Fini : '+s.size+' animes copiés, colle-les dans NeoDex')})()\"><button class=\"btn px\" id=\"imCopy\">Copier la commande</button></div>\n      <div class=\"hint\">Sinon, colle simplement une liste de titres, un par ligne.</div>\n      <textarea class=\"f\" id=\"imText\" spellcheck=\"false\" placeholder=\"Frieren&#10;Blue Box&#10;Solo Leveling&#10;…\"></textarea>\n    </div>\n    <div class=\"winFoot\">\n      <button class=\"btn ghost px\" id=\"imCancel\" style=\"margin-left:auto\">Annuler</button>\n      <button class=\"btn main px\" id=\"imOk\">Importer</button>\n    </div>\n  </div>\n</div>\n</div>";
export default async function (ctx) {
  const view = ctx.view;
  if (!ctx.host) { view.textContent = "Ce plugin doit être approuvé par NeoDex pour s'ouvrir."; return; }
  const host = ctx.host, { el, toast, sfx, ask, newTab } = host, nbConfirm = host.confirm;
  const folder = ctx.folder, legacy = ctx.legacy || {};
  view.innerHTML = HTML;
  const $ = id => view.querySelector('#' + id) || document.getElementById(id);
  const doc = async n => { try { return await folder.read(n); } catch { return null; } };
  const pad = n => String(n).padStart(2, '0');
  function until(ms) {  // "dans 3 j 4 h", "dans 1 h 30", "en retard de 2 j"
    const late = ms < 0, m = Math.round(Math.abs(ms) / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    const s = d >= 7 ? d + ' j' : d >= 1 ? d + ' j' + (h % 24 ? ' ' + h % 24 + ' h' : '') : h >= 1 ? h + ' h' + (m % 60 ? ' ' + pad(m % 60) : '') : m + ' min';
    return (late ? 'en retard de ' : 'dans ') + s;
  }
  const api = async (n, data) => {  // « anime » vit dans le dossier du plugin (repris une fois de tes données d'avant) ; le reste passe par NeoDex
    if (n !== 'anime') return Promise.reject(new Error('inconnu : ' + n));
    if (data !== undefined) { await folder.write('anime', data); return true; }
    let v = await doc('anime');
    if (v == null && legacy.api) { v = await legacy.api('anime').catch(() => null); if (v != null) await folder.write('anime', v); }  // première ouverture : tu retrouves tes animes suivis
    return v;
  };
  // ---- ton code d'origine ----
let animeLoaded = false, anime = {watched: {}, ignored: [], deleted: [], cache: null}, animeBusy = false, showHidden = false, animeProgress = '';
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const saveAnime = () => api('anime', anime).catch(e => toast('Sauvegarde impossible : ' + e.message, true));
const animeReleases = () => (anime.cache?.items || []).filter(a => !anime.ignored.includes(a.slug));
const openFranime = a => {
  const url = anime.watched[a.slug]?.imported && !anime.watched[a.slug].franime ? a.url : 'https://franime.fr/anime/' + a.slug;
  window.neo ? newTab(url) : api('open', {target: url}).catch(e => toast(e.message, true));
};
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
const AQ = 'id format status siteUrl title{romaji english} nextAiringEpisode{episode airingAt} startDate{year month} coverImage{medium}';

// From the AniList search results for one watched anime, keep the entries of that franchise that are airing or announced
function pickReleases(w, media) {
  const key = norm(w.title).slice(0, 10), seen = new Set(), out = [];
  const live = m => ['TV', 'TV_SHORT', 'ONA', 'MOVIE'].includes(m.format) && ['RELEASING', 'NOT_YET_RELEASED'].includes(m.status);
  // imported lines can be noise, so their best match must really share the title
  const same = media.filter((m, i) => (i === 0 && !w.imported) || [m.title.romaji, m.title.english].some(t => norm(t).includes(key)));
  for (const m of same)
    for (const x of [m, ...m.relations.edges.filter(e => e.relationType === 'SEQUEL').map(e => e.node)])
      if (live(x) && !seen.has(x.id)) {
        seen.add(x.id);
        out.push({slug: w.slug, title: x.title.english || x.title.romaji, status: x.status, next: x.nextAiringEpisode, mid: x.id, cover: x.coverImage?.medium, start: x.startDate, url: x.siteUrl});
      }
  return out;
}

async function refreshAnime(force) {
  if (animeBusy || (!force && anime.cache && Date.now() - anime.cache.at < 3600000)) return;  // AniList at most once an hour
  animeBusy = true; renderAnime();
  try {
    const watched = Object.values(anime.watched).filter(w => !anime.ignored.includes(w.slug)), items = [], old = anime.cache?.items || [];
    const sleep = s => new Promise(ok => setTimeout(ok, s * 1000));
    let failed = 0;
    for (let i = 0; i < watched.length; i += 10) {  // 10 searches per AniList request
      const chunk = watched.slice(i, i + 10);
      animeProgress = Math.min(i + 10, watched.length) + '/' + watched.length; renderAnime();
      const query = '{' + chunk.map((w, j) => `a${j}:Page(perPage:5){media(search:${JSON.stringify(w.title)},type:ANIME,sort:SEARCH_MATCH){${AQ} relations{edges{relationType node{${AQ}}}}}}`).join(' ') + '}';
      try {
        let r;
        for (let tries = 0; ; tries++) {  // AniList allows ~30 requests/min: on 429 wait and retry
          r = await fetch('https://graphql.anilist.co', {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'}, body: JSON.stringify({query})});
          if (r.status !== 429 || tries >= 4) break;
          await sleep(+r.headers.get('Retry-After') || 60);
        }
        if (!r.ok) throw new Error('AniList a répondu ' + r.status);
        const data = (await r.json()).data || {};
        chunk.forEach((w, j) => items.push(...pickReleases(w, data['a' + j]?.media || [])));
      } catch (e) {  // keep the previous results of this chunk instead of losing them
        failed++; console.warn(e);
        const slugs = new Set(chunk.map(w => w.slug)); items.push(...old.filter(a => slugs.has(a.slug)));
      }
      if (i + 10 < watched.length) await sleep(2.2);
    }
    anime.cache = {at: Date.now(), items};
    if (failed) toast(failed + ' recherche(s) AniList ont échoué, nouvel essai dans une heure', true);
  } catch (e) { toast('Sorties anime indisponibles : ' + e.message, true); }
  finally { animeBusy = false; saveAnime(); animeAfter(); }
}

function animeUnfollow(slug) {  // ne plus suivre : retiré pour de bon
  const w = anime.watched[slug]; if (!w) return;
  anime.ignored = anime.ignored.filter(s => s !== slug); delete anime.watched[slug]; if (!anime.deleted.includes(slug)) anime.deleted.push(slug);
  if (anime.cache) anime.cache.items = anime.cache.items.filter(a => a.slug !== slug);
  saveAnime(); toast('« ' + w.title + ' » : tu ne le suis plus'); animeAfter();
}
function renderAnime() {
  const list = $('anList'), now = Date.now() / 1000, all = Object.values(anime.watched);
  const items = animeReleases().sort((a, b) => (a.next?.airingAt ?? 9e12) - (b.next?.airingAt ?? 9e12));
  const ago = anime.cache ? Math.round((Date.now() - anime.cache.at) / 60000) : null;
  $('anInfo').textContent = all.length + ' animes suivis · ' + (animeBusy ? 'mise à jour… ' + animeProgress : ago === null ? 'jamais mis à jour' : ago < 1 ? "mis à jour à l'instant" : 'mis à jour ' + until(-ago * 60000).replace('en retard de', 'il y a'));
  $('anRefresh').disabled = animeBusy;
  list.replaceChildren();
  const card = a => {
    const c = el('div', 'anCard'), w = anime.watched[a.slug], img = el('img', 'anPoster'), body = el('div', 'anBody'), meta = el('div', 'anMeta'), acts = el('div', 'anActs');
    img.src = a.cover || ''; img.alt = ''; img.loading = 'lazy'; img.onerror = () => img.classList.add('none'); if (!a.cover) img.classList.add('none');
    let when, badge;
    if (a.next) { const ms = (a.next.airingAt - now) * 1000; when = 'ÉPISODE ' + a.next.episode; badge = ms <= 0 ? el('span', 'badge now', 'sorti') : el('span', 'badge' + (ms < 86400000 ? ' soon' : ''), until(ms)); }
    else { when = a.status === 'NOT_YET_RELEASED' ? 'BIENTÔT' : 'EN COURS'; badge = el('span', 'badge', a.start?.year ? (a.start.month ? MONTHS[a.start.month - 1] + ' ' : '') + a.start.year : 'date inconnue'); }
    meta.append(el('span', 'anEp', when), badge);
    const open = el('button', 'btn main px', 'OUVRIR'), hide = el('button', 'btn ghost px', 'MASQUER'), stop = el('button', 'btn ghost px', 'NE PLUS SUIVRE');
    open.onclick = () => openFranime(a); hide.title = 'Le cacher de cette liste sans l\'oublier';
    hide.onclick = () => { anime.ignored.push(a.slug); saveAnime(); animeAfter(); };
    stop.onclick = async () => { if (await nbConfirm('Ne plus suivre « ' + a.title + ' » ?')) animeUnfollow(a.slug); };
    acts.append(open, hide, stop);
    body.append(el('b', 'anTitle', a.title), meta, el('small', 'anSrc', w?.imported ? (w.franime ? 'Dans ta liste FRAnime' : 'Ajouté par toi') : 'Vu sur FRAnime · saison ' + w?.season + ' · ép. ' + w?.ep), acts);
    c.append(img, body); return c;
  };
  const week = items.filter(a => a.next && a.next.airingAt - now < 7 * 86400), later = items.filter(a => !week.includes(a));
  const folded = k => { try { const v = localStorage.getItem('fold-' + k); return v ? v === '1' : k === 'later'; } catch { return k === 'later'; } };
  const group = (k, label, arr) => {
    if (!arr.length) return;
    const f = folded(k), h = el('button', 'anSec', (f ? '▸ ' : '▾ ') + label + ' (' + arr.length + ')');
    h.onclick = () => { try { localStorage.setItem('fold-' + k, f ? '0' : '1'); } catch {} renderAnime(); };
    list.append(h);
    if (!f) { const g = el('div', 'anGrid'); g.append(...arr.map(card)); list.append(g); }
  };
  group('week', 'CETTE SEMAINE', week);
  group('later', 'PLUS TARD ET ANNONCÉS', later);
  if (!items.length) list.append(el('div', 'hint', animeBusy ? 'Recherche des sorties…' : 'Aucune sortie prévue pour tes animes. Suis-en depuis « Jour par jour » avec « + SUIVRE », ou importe une liste.'));
  if (anime.ignored.length) {
    const tg = el('button', 'anSec', (showHidden ? '▾ ' : '▸ ') + 'MASQUÉS (' + anime.ignored.length + ')'); tg.id = 'anHidden';
    tg.onclick = () => { showHidden = !showHidden; renderAnime(); };
    list.append(tg);
    if (showHidden) anime.ignored.forEach(slug => {
      const r = el('div', 'titem'), b = el('button', 'btn ghost px', 'Réafficher'), del = el('button', 'btn del px', 'Supprimer');
      b.onclick = () => { anime.ignored = anime.ignored.filter(s => s !== slug); saveAnime(); animeAfter(); };
      del.onclick = async () => { if (await nbConfirm('Supprimer définitivement « ' + (anime.watched[slug]?.title || slug) + ' » de tes animes suivis ?')) animeUnfollow(slug); };
      r.append(el('span', 'tn', anime.watched[slug]?.title || slug), b, del); list.append(r);
    });
  }
}

// paste import: one title per line, or a whole copied page (non-title lines are filtered out, then by the AniList match)
function importList(text) {
  const junk = /^(épisode|episode|ep\.?|saison|season|vostfr|vf|voir|regarder|reprendre|suivant|précédent|accueil|calendrier|recherche|mon compte|ma liste|connexion|\d+\s*(min|h|ép|eps?))\b/i;
  const lines = [...new Set(text.split(/\r?\n/).map(s => s.replace(/\s+/g, ' ').trim()))]
    .filter(s => s.length >= 3 && s.length <= 120 && /[a-z]/i.test(s) && !junk.test(s) && !/^https?:/i.test(s));
  const known = new Set(Object.values(anime.watched).map(w => norm(w.title)));
  let n = 0;
  const add = (slug, title, franime) => {
    if (anime.watched[slug] || known.has(norm(title))) return;
    anime.deleted = anime.deleted.filter(s => s !== slug);  // importing it again on purpose undoes a deletion
    known.add(norm(title)); anime.watched[slug] = {slug, title, season: 1, ep: 0, last: Date.now(), imported: true, franime}; n++;
  };
  // franime.fr/anime/<slug> links (from the "Ma liste" page): the slug is the title, and keeps the FRAnime link working
  for (const [, slug] of text.matchAll(/franime\.fr\/anime\/([a-z0-9-]+)/gi)) add(slug, slug.replace(/-/g, ' '), true);
  for (const t of lines) add('import-' + norm(t), t, false);
  return n;
}
$('anImport').onclick = () => { $('imText').value = ''; $('imModal').classList.add('on'); $('imText').focus(); };
const closeIm = () => $('imModal').classList.remove('on');
$('imCancel').onclick = $('imClose').onclick = closeIm;
$('imModal').onclick = e => { if (e.target.id === 'imModal') closeIm(); };
$('imModal').onkeydown = e => { if (e.key === 'Escape') closeIm(); };
$('imOk').onclick = () => {
  const n = importList($('imText').value);
  closeIm(); toast(n + ' titre(s) ajouté(s), recherche des sorties…'); refreshAnime(true);
};
$('imCopy').onclick = () => navigator.clipboard.writeText($('imCmd').value).then(() => toast('Commande copiée'), () => { $('imCmd').select(); toast('Fais Ctrl+C pour copier', true); });
$('anRefresh').onclick = () => refreshAnime(true);
api('anime').then(d => { anime = {watched: {}, ignored: [], deleted: [], cache: null, ...d}; animeLoaded = true; animeAfter(); refreshAnime(); }).catch(e => toast('Sorties anime indisponibles : ' + e.message, true));
const anTimer = setInterval(refreshAnime, 15 * 60000);  // (arrêté quand le plugin est déchargé)

// ---- nouveautés : toutes les sorties, jour par jour, et le calendrier ----
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const toHM = mn => pad(Math.floor(mn / 60)) + ':' + pad(mn % 60);
let anView = 'day', anDay = new Date(), anBusy = false;
const dayCache = new Map();
// les épisodes à venir de tes animes (AniList donne le calendrier de plusieurs semaines) : relu au plus une fois par heure
async function loadUpcoming() {
  const mids = [...new Set(animeReleases().map(a => a.mid).filter(Boolean))];
  if (!mids.length) return [];
  if (anime.upcoming && Date.now() - anime.upcoming.at < 3600000 && anime.upcoming.mids === mids.join(',')) return anime.upcoming.items;
  const now = Math.floor(Date.now() / 1000), items = [];
  for (let i = 0; i < mids.length; i += 40) {
    const chunk = mids.slice(i, i + 40);
    const data = await aniFetch('query{Page(perPage:50){airingSchedules(mediaId_in:[' + chunk.join(',') + '],airingAt_greater:' + now + ',airingAt_lesser:' + (now + 45 * 86400) + ',sort:TIME){mediaId airingAt episode}}}');
    items.push(...data.Page.airingSchedules);
    if (i + 40 < mids.length) await new Promise(ok => setTimeout(ok, 2200));
  }
  anime.upcoming = {at: Date.now(), mids: mids.join(','), items}; saveAnime(); return items;
}
let calBusy = false;
async function syncCalendar() {  // les sorties de tes animes dans ton emploi du temps, remises à jour à chaque recherche (et jamais perdues)
  if (calBusy || !animeLoaded) return; calBusy = true;
  try {
    const on = anime.calendar !== false, rel = animeReleases();
    let evs = [];
    if (on) {
      const byMid = new Map(rel.filter(a => a.mid).map(a => [a.mid, a]));
      let up = []; try { up = await loadUpcoming(); } catch (e) { console.warn(e); }
      const make = (a, ep, at) => { const d = new Date(at * 1000), s = d.getHours() * 60 + d.getMinutes(); return {id: 'anime:' + a.slug + ':' + ep, kind: 'event', title: a.title + ' · ép. ' + ep, date: ymd(d), start: toHM(s), end: toHM(Math.min(1439, s + 25)), allDay: false, color: '#7ddc3c', place: 'Sortie anime'}; };
      const seen = new Set();  // un même anime suivi deux fois (nom FRAnime et « + SUIVRE ») : une seule sortie, d’après son identifiant AniList
      for (const u of up) { const a = byMid.get(u.mediaId); if (!a) continue; const e = make(a, u.episode, u.airingAt), k = a.mid + ":" + u.episode; if (!seen.has(k)) { seen.add(k); evs.push(e); } }
      for (const a of rel) if (a.next && a.next.airingAt * 1000 < Date.now() + 45 * 864e5) { const e = make(a, a.next.episode, a.next.airingAt), k = (a.mid || a.slug) + ":" + a.next.episode; if (!seen.has(k)) { seen.add(k); evs.push(e); } }  // le prochain épisode, même si AniList n'a pas (encore) tout le calendrier
    }
    host.agenda?.sync('anime', evs);
  } finally { calBusy = false; }
}
function animeAfter() { renderAnime(); syncCalendar(); if (anView === 'day') renderDay(); }
const aniFetch = async query => {
  for (let tries = 0; ; tries++) {
    const r = await fetch('https://graphql.anilist.co', {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'}, body: JSON.stringify({query})});
    if (r.status === 429 && tries < 4) { await new Promise(ok => setTimeout(ok, (+r.headers.get('Retry-After') || 30) * 1000)); continue; }
    if (!r.ok) throw new Error('AniList a répondu ' + r.status);
    return (await r.json()).data;
  }
};
async function loadDay(d) {  // toutes les sorties de ce jour (hors contenu adulte), pas seulement les tiennes
  const key = ymd(d), c = dayCache.get(key); if (c && Date.now() - c.at < 1800000) return c.items;
  const from = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000), items = [];
  for (let page = 1; page <= 8; page++) {
    const data = await aniFetch('query{Page(page:' + page + ',perPage:50){pageInfo{hasNextPage} airingSchedules(airingAt_greater:' + (from - 1) + ',airingAt_lesser:' + (from + 86400) + ',sort:TIME){airingAt episode media{id title{romaji english} siteUrl isAdult format popularity coverImage{medium}}}}}');
    items.push(...data.Page.airingSchedules.filter(s => !s.media.isAdult));
    if (!data.Page.pageInfo.hasNextPage) break;
    await new Promise(ok => setTimeout(ok, 1500));
  }
  dayCache.set(key, {at: Date.now(), items}); return items;
}
const mediaTitle = m => m.title.english || m.title.romaji;
const followSlug = m => { const keys = new Set([norm(m.title.english), norm(m.title.romaji)]); return Object.values(anime.watched).find(w => w.slug === 'al-' + m.id || keys.has(norm(w.title)))?.slug || null; };
const followed = m => { const k = new Set(Object.values(anime.watched).filter(w => !anime.ignored.includes(w.slug)).map(w => norm(w.title))); return !!anime.watched['al-' + m.id] || k.has(norm(m.title.english)) || k.has(norm(m.title.romaji)); };
async function renderDay() {
  const box = $('anDayList'), key = ymd(anDay), today = ymd(new Date());
  $('anDayLabel').textContent = (key === today ? 'Aujourd\'hui · ' : '') + anDay.toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'});
  if (anBusy) return; anBusy = true; box.replaceChildren(el('div', 'hint', 'Recherche des sorties de la journée…'));
  let items; try { items = await loadDay(anDay); } catch (e) { anBusy = false; return box.replaceChildren(el('div', 'hint', 'Sorties indisponibles : ' + e.message)); }
  anBusy = false; if (ymd(anDay) !== key) return renderDay();
  const mine = $('anMine').checked; let list = items.filter(s => !mine || followed(s.media));
  if ($('anSort').value === 'pop') list = list.slice().sort((a, b) => (b.media.popularity || 0) - (a.media.popularity || 0));
  box.replaceChildren(...(list.length ? list.map(s => {
    const m = s.media, r = el('div', 'titem'), t = new Date(s.airingAt * 1000), img = el('img', 'anCover'), fol = followed(m), b = el('button', 'btn ' + (fol ? 'ghost' : 'main') + ' px', fol ? '✓ SUIVI' : '+ SUIVRE'); if (fol) b.title = 'Clique pour ne plus le suivre';
    img.src = m.coverImage?.medium || ''; img.alt = ''; img.loading = 'lazy';
    b.onclick = e => { e.stopPropagation(); if (fol) { const slug = followSlug(m); if (slug) animeUnfollow(slug); return; } const slug = 'al-' + m.id; anime.deleted = anime.deleted.filter(x => x !== slug); anime.watched[slug] = {slug, title: mediaTitle(m), season: 1, ep: 0, last: Date.now(), imported: true, franime: false}; saveAnime(); toast('« ' + mediaTitle(m) + ' » ajouté à tes animes'); refreshAnime(true); renderDay(); };
    r.append(el('span', 'tt', toHM(t.getHours() * 60 + t.getMinutes())), img, el('span', 'tn', mediaTitle(m) + ' · ép. ' + s.episode), el('span', 'badge' + (t < new Date() ? ' now' : ''), t < new Date() ? 'sorti' : until(t - Date.now())), b);
    r.onclick = () => newTab(m.siteUrl); return r;
  }) : [el('div', 'hint', mine ? 'Aucun de tes animes ne sort ce jour-là.' : 'Aucune sortie ce jour-là.')]));
}
host.addStyle('.anGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px} .anCard{display:grid;grid-template-columns:80px 1fr;gap:12px;padding:10px;background:color-mix(in srgb,var(--line) 30%,var(--bg0));box-shadow:inset 0 0 0 2px var(--line2)} .anCard:hover{box-shadow:inset 0 0 0 2px var(--magenta)} .anPoster{width:80px;height:114px;object-fit:cover;background:#1a0a2e} .anPoster.none{visibility:hidden} .anBody{display:flex;flex-direction:column;gap:6px;min-width:0} .anTitle{font:12px var(--title);color:#fff;word-break:break-word} .anMeta{display:flex;gap:8px;align-items:center;flex-wrap:wrap} .anEp{font:9px var(--title);color:var(--lilac)} .anSrc{color:var(--muted);font-size:12px} .anActs{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto} .anActs .btn{height:32px;padding:0 10px;font:9px var(--title)} .anSec{all:unset;display:block;cursor:var(--cp,pointer);font:9px var(--title);letter-spacing:1.5px;color:var(--muted);margin:18px 0 8px} .anSec:hover{color:#fff} #anInfo{font-size:14px;color:var(--muted)} #imModal{position:fixed;inset:0;z-index:40;display:none;place-items:center;background:rgba(var(--d5),.72);backdrop-filter:blur(3px)} #imModal.on{display:grid} #imText{height:240px;resize:vertical;font-size:16px;line-height:1.4} .anNav{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0 12px} .anNav b{font:12px var(--title);color:var(--lilac);margin:0 8px;text-transform:capitalize} .anNav select{width:auto;min-width:200px} .anCheck{display:flex;gap:8px;align-items:center;color:var(--shell);font-size:14px;margin:6px 0} .anCover{width:34px;height:48px;object-fit:cover;margin:0 8px;flex:none}');
const anTabs = () => $('anTabs').replaceChildren(...[['day', 'Jour par jour'], ['mine', 'Mes animes']].map(([k, l]) => { const b = el('button', 'tab px' + (anView === k ? ' on' : ''), l); b.onclick = () => { anView = k; anTabs(); $('anDayBox').style.display = k === 'day' ? '' : 'none'; $('anMineBox').style.display = k === 'mine' ? '' : 'none'; if (k === 'day') renderDay(); }; return b; }));
anTabs(); $('anMineBox').style.display = 'none';
$('anPrev').onclick = () => { anDay = new Date(anDay.getFullYear(), anDay.getMonth(), anDay.getDate() - 1); renderDay(); };
$('anNext').onclick = () => { anDay = new Date(anDay.getFullYear(), anDay.getMonth(), anDay.getDate() + 1); renderDay(); };
$('anToday').onclick = () => { anDay = new Date(); renderDay(); };
$('anSort').onchange = $('anMine').onchange = () => renderDay();
$('anCal').onchange = () => { anime.calendar = $('anCal').checked; saveAnime(); syncCalendar(); toast(anime.calendar ? 'Les sorties de tes animes sont dans ton emploi du temps' : 'Les sorties de tes animes ne sont plus dans ton emploi du temps'); };
  $('anCal').checked = anime.calendar !== false;
  renderDay();
  const calTimer = setInterval(syncCalendar, 5 * 60000);  // ses événements ne disparaissent pas si l'emploi du temps est remplacé par une synchro
  host.hooks({ agendaChanged: () => syncCalendar() });
  ctx.onOpen(() => { renderAnime(); renderDay(); });
  ctx.onClose(() => { clearInterval(anTimer); clearInterval(calTimer); });
}
