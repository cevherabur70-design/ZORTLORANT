import * as THREE from 'three';
import { GLTFLoader } from './vendor/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from './vendor/jsm/utils/SkeletonUtils.js';
import { EYE, HEIGHT, RADIUS, ROUND, ARMOR, WEAPONS, AGENTS, TEAMS, MAP, MAP_LIST, MAP_NAMES, slotOf } from './shared.js';
import { buildGun, buildHands, loadWeaponGLBs, GUN_IDS, GRIP , applySkin, SKINS } from './weapons.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angLerp = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };

// ================= Ağ =================
let lanList = [];
let ws, myId = null, room = null, inGame = false;
const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2600); }

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => { send({ t: 'hello', name: getName() }); setConn('● Sunucu hazır', 'ok'); };
  ws.onmessage = (e) => handle(JSON.parse(e.data));
  ws.onclose = () => { setConn('Sunucuyla bağlantı yok — start.bat çalışıyor mu?', 'bad'); toast('Sunucuyla bağlantı koptu. Sayfayı yenile.'); };
  ws.onerror = () => setConn('Sunucuya ulaşılamadı — start.bat çalışıyor mu?', 'bad');
}
function setConn(t, cls) { const e = $('#conn'); if (e) { e.textContent = t; e.className = 'conn ' + cls; } }
const ready = () => { if (ws && ws.readyState === 1) return true; toast('Sunucuya bağlı değilsin. start.bat ile sunucuyu başlat ve http://localhost:3000 adresinden aç.'); return false; };
const getName = () => ($('#name').value.trim() || 'Oyuncu').slice(0, 14);

function handle(m) {
  switch (m.t) {
    case 'welcome': myId = m.id; lanList = m.lan || []; MAP.apply(m.map); { const mn = $('#mapName'); if (mn) mn.textContent = 'Harita: ' + MAP.name; } break;
    case 'map': MAP.apply(m.map); { const mn = $('#mapName'); if (mn) mn.textContent = 'Harita: ' + MAP.name; } if (inGame) buildMap(); break;
    case 'err': toast(m.msg); break;
    case 'rooms': renderRooms(m.rooms); break;
    case 'left': if (inGame) leaveGame(); room = null; showScreen('menu'); break;
    case 'room': onRoom(m); break;
    case 'phase': onPhase(m); break;
    case 'snap': onSnap(m); break;
    case 'shot': onShot(m); break;
    case 'hit': onHit(m); break;
    case 'kill': onKill(m); break;
    case 'fx': onFx(m); break;
    case 'abil': onAbility(m); break;
    case 'drops': onDrops(m.d); break;
    case 'reveal': { const t = performance.now() + m.dur; for (const id of m.ids) { const p = players.get(id); if (p) p.revealUntil = t; } break; }
    case 'flashed': { me.flash = Math.max(me.flash, m.dur); $('#flashFx').style.transition = 'none'; $('#flashFx').style.opacity = 1; setTimeout(() => { $('#flashFx').style.transition = `opacity ${m.dur}s ease-in`; $('#flashFx').style.opacity = 0; }, 350); break; }
  }
}

// ================= Menü =================
const saved = { name: localStorage.getItem('zl_name') || '', sens: localStorage.getItem('zl_sens') || '1' };
$('#name').value = saved.name; $('#sens').value = saved.sens; $('#sensOut').textContent = (+saved.sens).toFixed(1);
$('#name').addEventListener('change', () => { localStorage.setItem('zl_name', getName()); send({ t: 'hello', name: getName() }); });
$('#sens').addEventListener('input', (e) => { $('#sensOut').textContent = (+e.target.value).toFixed(1); localStorage.setItem('zl_sens', e.target.value); });

// ================= Ayarlar: nişangah, FOV, ses, görünüm, tuş atama =================
const DEF_BINDS = { inspect: 'KeyF', crouch: 'KeyC', drop: 'KeyG', reload: 'KeyR', abilE: 'KeyE', abilQ: 'KeyQ', buy: 'KeyB', walk: 'ShiftLeft', jump: 'Space' };
const BIND_NAMES = { inspect: 'Silahı incele', crouch: 'Eğil', drop: 'Silah at / al', reload: 'Şarjör', abilE: 'Yetenek 1', abilQ: 'Yetenek 2', buy: 'Satın alma', walk: 'Yavaş yürü', jump: 'Zıpla' };
const loadJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch { return {}; } };
const cfg = Object.assign({ chColor: '#ffffff', chLen: 8, chThick: 2, chGap: 5, chDot: true, fov: 80, vol: 0.8, minimap: true, bob: true, full: true, adsToggle: false, adsSens: 1 }, loadJSON('zl_cfg'));
const binds = Object.assign({}, DEF_BINDS, loadJSON('zl_binds'));
const KEYNAME = (c) => ({ ControlLeft: 'Sol Ctrl', ControlRight: 'Sağ Ctrl', ShiftLeft: 'Sol Shift', ShiftRight: 'Sağ Shift', Space: 'Boşluk', AltLeft: 'Alt', CapsLock: 'Caps' }[c] || String(c).replace(/^Key|^Digit/, ''));
const skinOf = (id) => localStorage.getItem('zl_skin_' + id) || 'default';
function applyCfg() {
  const R = document.documentElement.style;
  R.setProperty('--chc', cfg.chColor); R.setProperty('--sightc', /^#f{6}$/i.test(cfg.chColor) ? '#ff4655' : cfg.chColor); R.setProperty('--chl', cfg.chLen + 'px'); R.setProperty('--cht', cfg.chThick + 'px'); R.setProperty('--chg', cfg.chGap + 'px'); R.setProperty('--chdot', cfg.chDot ? 'block' : 'none');
  localStorage.setItem('zl_cfg', JSON.stringify(cfg));
}
function applyBindLabels() { $('#abE kbd').textContent = KEYNAME(binds.abilE); $('#abQ kbd').textContent = KEYNAME(binds.abilQ); }
let rebinding = null;
function renderBinds() {
  const L = $('#bindList'); L.innerHTML = '';
  for (const [k, n] of Object.entries(BIND_NAMES)) {
    L.append(el('span', '', n));
    const b = el('button', rebinding === k ? 'wait' : '', rebinding === k ? 'Tuşa bas…' : KEYNAME(binds[k]));
    b.onclick = () => { rebinding = k; renderBinds(); }; L.append(b);
  }
}
addEventListener('keydown', (e) => {
  if (!rebinding) return; e.preventDefault(); e.stopImmediatePropagation();
  if (e.code !== 'Escape') { for (const k in binds) if (binds[k] === e.code && k !== rebinding) binds[k] = binds[rebinding]; binds[rebinding] = e.code; localStorage.setItem('zl_binds', JSON.stringify(binds)); }
  rebinding = null; renderBinds(); applyBindLabels();
}, true);
{
  const range = (id, key, out, fmt = (v) => v) => { const i = $(id); i.value = cfg[key]; $(out).textContent = fmt(cfg[key]); i.addEventListener('input', () => { cfg[key] = +i.value; $(out).textContent = fmt(cfg[key]); applyCfg(); if (key === 'vol') sound.setVol(cfg.vol); }); };
  range('#setFov', 'fov', '#fovOut'); range('#setVol', 'vol', '#volOut', (v) => Math.round(v * 100));
  range('#chLen', 'chLen', '#chLenOut'); range('#chThick', 'chThick', '#chThickOut'); range('#chGap', 'chGap', '#chGapOut');
  const check = (id, key) => { const i = $(id); i.checked = !!cfg[key]; i.addEventListener('change', () => { cfg[key] = i.checked; applyCfg(); }); };
  check('#chDot', 'chDot'); check('#setAdsToggle', 'adsToggle'); range('#setAdsSens', 'adsSens', '#adsSensOut', (v) => (+v).toFixed(2)); check('#setMinimap', 'minimap'); check('#setBob', 'bob'); check('#setFull', 'full');
  $('#chColor').value = cfg.chColor; $('#chColor').addEventListener('input', (e) => { cfg.chColor = e.target.value; applyCfg(); });
  $('#bindReset').onclick = () => { Object.assign(binds, DEF_BINDS); localStorage.removeItem('zl_binds'); renderBinds(); applyBindLabels(); };
  applyCfg(); renderBinds(); applyBindLabels();
}
function closeSettings() { $('#pane-settings').append($('#settingsCard')); $('#setClose').classList.add('hidden'); $('#setOverlay').classList.add('hidden'); rebinding = null; renderBinds(); }
$('#ingameSet').addEventListener('mousedown', (e) => { e.stopPropagation(); $('#setOverlay .setBox').append($('#settingsCard')); $('#setClose').classList.remove('hidden'); $('#setOverlay').classList.remove('hidden'); });
$('#setClose').addEventListener('click', closeSettings);
$('#setOverlay').addEventListener('mousedown', (e) => e.stopPropagation());

const LEVEL_TR = { easy: 'Kolay', normal: 'Orta', hard: 'Zor' };
let botLevel = localStorage.getItem('zl_level') || 'normal';
let botMode = +(localStorage.getItem('zl_mode') || 3);
let agentPick = localStorage.getItem('zl_agent'); if (!AGENTS[agentPick]) agentPick = 'soldier';
let weaponPick = localStorage.getItem('zl_weapon'); if (!WEAPONS[weaponPick]) weaponPick = 'vandal';

function statBars(w, full = true) {
  const bar = (label, v, max, txt) => `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${Math.min(100, v / max * 100)}%"></i></div><output>${txt}</output></div>`;
  let h = bar('Hasar', w.dmg * (w.pellets > 1 ? Math.min(w.pellets, 6) : 1), 150, w.pellets > 1 ? `${w.dmg}×${w.pellets}` : w.dmg) + bar('Atış hızı', w.rpm, 800, w.rpm) + bar('Menzil', w.range, 200, w.range + ' m');
  if (full) h += bar('Şarjör', w.mag, 50, w.mag) + bar('Doldurma', 3.5 - w.reload, 2.5, w.reload + ' sn') + bar('Fiyat', w.price, 4700, w.price ? w.price : 'ücretsiz');
  return h;
}
function paintQueue() {
  document.querySelectorAll('#botMode button').forEach((b) => b.classList.toggle('on', +b.dataset.mode === botMode));
  document.querySelectorAll('#menuLevel button').forEach((b) => b.classList.toggle('on', b.dataset.level === botLevel));
  $('#playSub').textContent = `${LEVEL_TR[botLevel]} · ${botMode}v${botMode} · yalnızca botlar`;
}
function renderAgentInfo() {
  const a = AGENTS[agentPick], ab = a.abilities;
  $('#agentInfo').innerHTML = `<span class="role">${a.roleEn}</span> <b>${a.name}</b> — ${a.role}` +
    `<div class="abRow"><kbd>E</kbd><span><b>${ab.e.name}</b> · ${ab.e.desc}</span></div><div class="abRow"><kbd>Q</kbd><span><b>${ab.q.name}</b> · ${ab.q.desc}</span></div>`;
}
function renderWeaponMini() { $('#weaponMini').innerHTML = statBars(WEAPONS[weaponPick], false); }
function initSelects() {
  const as = $('#agentSel'), ws = $('#weaponSel');
  for (const [id, a] of Object.entries(AGENTS)) as.append(new Option(`${a.name} — ${a.roleEn}`, id));
  for (const [id, w] of Object.entries(WEAPONS).filter(([, x]) => !x.melee)) ws.append(new Option(`${w.name} — ${w.type}`, id));
  as.value = agentPick; ws.value = weaponPick;
  as.onchange = () => { agentPick = as.value; localStorage.setItem('zl_agent', agentPick); renderAgentInfo(); setHero(); sound.ui('click'); };
  ws.onchange = () => { weaponPick = ws.value; localStorage.setItem('zl_weapon', weaponPick); renderWeaponMini(); setHero(); sound.ui('click'); };
  renderAgentInfo(); renderWeaponMini();
}
document.querySelectorAll('#botMode button').forEach((b) => b.onclick = () => { botMode = +b.dataset.mode; localStorage.setItem('zl_mode', botMode); paintQueue(); sound.ui('click'); });
document.querySelectorAll('#menuLevel button').forEach((b) => b.onclick = () => { botLevel = b.dataset.level; localStorage.setItem('zl_level', botLevel); paintQueue(); sound.ui('click'); });
paintQueue();
let mapPick = localStorage.getItem('zl_map'); if (!MAP_LIST.includes(mapPick)) mapPick = 'random';
const fillMapSel = (s) => { s.append(new Option('Rastgele', 'random')); for (const id of MAP_LIST) s.append(new Option(MAP_NAMES[id], id)); };
fillMapSel($('#mapSel')); $('#mapSel').value = mapPick;
$('#mapSel').onchange = () => { mapPick = $('#mapSel').value; localStorage.setItem('zl_map', mapPick); sound.ui('click'); };
$('#playBots').onclick = () => {
  if (!ready()) return; sound.ui('play');
  send({ t: 'hello', name: getName() });
  send({ t: 'create', solo: true, mode: botMode, level: botLevel, agent: agentPick, weapon: weaponPick, map: mapPick });
  const b = $('#playBots'); b.disabled = true; setTimeout(() => { b.disabled = false; }, 2500);
};
document.querySelectorAll('.tab').forEach((b) => b.onclick = () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('hidden', p.id !== 'pane-' + b.dataset.pane));
  $('#queue').classList.toggle('hidden', b.dataset.pane !== 'play');
  menuView(b.dataset.pane); sound.ui('click');
});
// menü sesleri: üzerine gelince ufak tık, ilk tıklamada ses motoru açılır
addEventListener('pointerdown', () => sound.unlock(), { once: true });
$('#menu').addEventListener('mouseover', (e) => { const t = e.target.closest('button,select'); if (t && !t.contains(e.relatedTarget)) sound.ui('hover'); });
$('#quitBtn').addEventListener('mousedown', (e) => e.stopPropagation());
$('#quitBtn').onclick = () => { send({ t: 'leave' }); };

function showScreen(name) {
  $('#menu').classList.toggle('hidden', name !== 'menu');
  $('#game').classList.toggle('hidden', name !== 'game');
  $('#lobby').classList.toggle('hidden', name !== 'lobby');
  menuActive = name === 'menu';
}
function onRoom(m) {
  room = m;
  if (m.phase === 'lobby') {
    if (m.solo) { // botlara karşı maç bitti: odayı kapat, menüye dön
      if (inGame) { leaveGame(); send({ t: 'leave' }); showScreen('menu'); }
    } else { if (inGame) leaveGame(); $('#joinModal').classList.add('hidden'); showScreen('lobby'); renderLobby(); }
  } else if (!inGame) enterGame();
}
function renderRooms(list) {
  document.querySelectorAll('.roomList').forEach((ul) => { ul.innerHTML = '';
  if (!list.length) { ul.append(el('li', 'empty', 'Açık oda yok. Bir oda kur, kodu arkadaşlarına söyle.')); return; }
  for (const r of list) {
    const li = el('li', '', `<span><b>${r.code}</b> · ${r.mode}v${r.mode} · ${esc(r.host)}</span><span>${r.count}/${r.max}${r.bots ? ' +' + r.bots + ' bot' : ''} <button>Katıl</button></span>`);
    li.querySelector('button').onclick = () => joinRoom(r.code);
    ul.append(li);
  }
  });
}
let roomMode = 2;
const joinRoom = (code) => { if (!ready()) return; send({ t: 'hello', name: getName() }); send({ t: 'join', code, agent: agentPick, weapon: weaponPick }); };
document.querySelectorAll('#roomMode button').forEach((b) => { b.onclick = () => { roomMode = +b.dataset.mode; document.querySelectorAll('#roomMode button').forEach((x) => x.classList.toggle('on', x === b)); sound.ui('click'); }; });
document.querySelector('#roomMode button[data-mode="2"]').classList.add('on');
$('#createRoom').onclick = () => { if (!ready()) return; sound.ui('play'); send({ t: 'hello', name: getName() }); send({ t: 'create', mode: roomMode, agent: agentPick, weapon: weaponPick, map: mapPick }); };
$('#joinBtn').onclick = () => joinRoom($('#code').value);
// ana ekran: ODA KUR / ODAYA KATIL
$('#qCreate').onclick = () => { if (!ready()) return; sound.ui('play'); send({ t: 'hello', name: getName() }); send({ t: 'create', mode: botMode, agent: agentPick, weapon: weaponPick, map: mapPick }); };
$('#qJoin').onclick = () => { $('#joinModal').classList.remove('hidden'); $('#code2').value = ''; $('#code2').focus(); send({ t: 'list' }); sound.ui('click'); };
$('#joinClose').onclick = () => $('#joinModal').classList.add('hidden');
$('#joinModal').addEventListener('mousedown', (e) => { if (e.target.id === 'joinModal') $('#joinModal').classList.add('hidden'); });
$('#joinBtn2').onclick = () => joinRoom($('#code2').value);
$('#code2').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom($('#code2').value); if (e.key === 'Escape') $('#joinModal').classList.add('hidden'); });
$('#code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom($('#code').value); });
document.querySelectorAll('.botAdd').forEach((b) => b.onclick = () => send({ t: 'addBot', team: +b.dataset.team }));
document.querySelectorAll('.joinTeam').forEach((b) => b.onclick = () => send({ t: 'team', team: +b.dataset.team }));
document.querySelectorAll('#lobbyLevel button').forEach((b) => b.onclick = () => send({ t: 'level', level: b.dataset.level }));
$('#startBtn').onclick = () => send({ t: 'start' });
$('#leaveBtn').onclick = () => send({ t: 'leave' });
function renderLobby() {
  $('#lCode').textContent = room.code; $('#lMode').textContent = `${room.mode}v${room.mode}`; const isLocal = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  const ips = lanList.map((a) => 'http://' + a);
  $('#lUrl').textContent = isLocal ? (ips.join('  ·  ') || 'LAN adresi bulunamadı') : 'http://' + location.host;
  $('#lUrl').title = isLocal ? 'Bu pencereyi localhost ile açtın; arkadaşların bu LAN adresini açmalı.' : '';
  for (const t of [0, 1]) {
    const ul = $(`#team${t}`); ul.innerHTML = '';
    for (const p of room.players.filter((p) => p.team === t)) {
      const li = el('li', (p.id === myId ? 'me ' : '') + (p.bot ? 'bot' : ''), `<span>${esc(p.name)}${p.id === room.host ? ' ★' : ''}</span><small>${AGENTS[p.agent].name} · ${WEAPONS[p.pick || 'classic'].name}${p.bot && room.host === myId ? '<button class="rm" title="Botu çıkar">✕</button>' : ''}</small>`);
      const rm = li.querySelector('.rm'); if (rm) rm.onclick = () => send({ t: 'removeBot', id: p.id });
      ul.append(li);
    }
    for (let i = room.players.filter((p) => p.team === t).length; i < room.mode; i++) ul.append(el('li', '', '<small>boş slot</small>'));
  }
  const isHost = room.host === myId;
  document.querySelectorAll('.botAdd').forEach((b) => b.classList.toggle('hidden', !isHost));
  $('#lobbyLevel').classList.toggle('hidden', !isHost);
  document.querySelectorAll('#lobbyLevel button').forEach((b) => b.classList.toggle('on', b.dataset.level === room.level));
  $('#startBtn').classList.toggle('hidden', !isHost); $('#waitMsg').classList.toggle('hidden', isHost);
  const lm = $('#lobbyMap');
  if (!lm.options.length) { fillMapSel(lm); lm.onchange = () => send({ t: 'setMap', map: lm.value }); }
  lm.value = room.map || 'random'; lm.disabled = !isHost;
  $('#lobbyMapNote').textContent = isHost ? '' : '· ev sahibi seçer';
  const mine = room.players.find((p) => p.id === myId);
  if (mine) {
    const as = $('#lobbyAgent'), ws2 = $('#lobbyWeapon');
    if (!as.options.length) {
      for (const [id, a] of Object.entries(AGENTS)) as.append(new Option(`${a.name} — ${a.roleEn}`, id));
      for (const [id, w] of Object.entries(WEAPONS).filter(([, x]) => !x.melee)) ws2.append(new Option(`${w.name} — ${w.type}`, id));
      as.onchange = () => send({ t: 'agent', agent: as.value }); ws2.onchange = () => send({ t: 'pick', weapon: ws2.value });
    }
    as.value = mine.agent; ws2.value = mine.pick || 'classic';
    const a = AGENTS[mine.agent];
    $('#lobbyAgentInfo').innerHTML = `<span class="role">${a.roleEn}</span> <b>${a.name}</b><div class="abRow"><kbd>E</kbd><span><b>${a.abilities.e.name}</b> · ${a.abilities.e.desc}</span></div><div class="abRow"><kbd>Q</kbd><span><b>${a.abilities.q.name}</b> · ${a.abilities.q.desc}</span></div>`;
  }
}

// ================= Modeller =================
const loader = new GLTFLoader();
let bootN = 0; const bootTotal = Object.keys(AGENTS).length;
function bootStep() { bootN++; $('#bootFill').style.width = Math.min(100, 8 + bootN / bootTotal * 92) + '%'; }
function bootDone() { $('#bootTxt').textContent = 'Hazır'; setTimeout(() => $('#boot').classList.add('off'), 450); }
const models = {}; // agentId -> { scene, animations, scale, yOff }
async function loadModels() {
  loadWeaponGLBs(GLTFLoader).then((ids) => { if (ids.length) { console.log('Silah GLB:', ids.join(', ')); viewGunId = null; setViewGun(me.weapon); for (const p of players.values()) p.gunId = null; } });
  await Promise.all(Object.entries(AGENTS).map(([id, a]) => new Promise((res) => {
    loader.load(`models/${a.model}`, (g) => {
      g.scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; if (o.material) o.material.envMapIntensity = 0.6; } });
      const box = new THREE.Box3().setFromObject(g.scene);
      const h = box.max.y - box.min.y;
      const scale = HEIGHT / h;
      models[id] = { scene: g.scene, animations: g.animations, scale, yOff: -box.min.y * scale };
      bootStep(); res();
    }, undefined, () => { console.warn('Model yüklenemedi', a.model); bootStep(); res(); });
  })));
}
function findHandBone(obj, want) {
  let hand = null;
  if (want) { const w = THREE.PropertyBinding.sanitizeNodeName(want); obj.traverse((o) => { if (!hand && (o.name === want || o.name === w)) hand = o; }); }
  if (hand) return hand;
  const prefer = ['mixamorig:RightHand', 'RightHand', 'Hand.R', 'hand_r', 'Right_Hand', 'mixamorigRightHand'];
  obj.traverse((o) => {
    if (hand || !o.isBone && !o.isObject3D) return;
    const n = o.name || '';
    if (prefer.includes(n) || /right.?hand$/i.test(n) || n === 'Hand.R') hand = o;
  });
  if (!hand) obj.traverse((o) => { if (!hand && o.isBone && /hand/i.test(o.name) && /r/i.test(o.name)) hand = o; });
  return hand;
}

const GRIP_FWD = 0.05;
// Silahı karakterin eline kabzasından oturt (el kemiği yoksa göğüs hizasına)
function attachGun(av, gun) {
  const hand = av.userData.handBone, gm = av.userData.gripMat;
  if (hand && gm) {
    const g = GRIP[gun.userData.id] || [0, -0.1, 0.1];
    gm.clone().multiply(new THREE.Matrix4().makeTranslation(-g[0], -g[1], -g[2])).decompose(gun.position, gun.quaternion, gun.scale);
    hand.add(gun);
  } else {
    gun.rotation.y = Math.PI; gun.position.set(0.22, 1.12, 0.35); av.userData.facing.add(gun);
  }
}
function makeAvatar(agentId) {
  const def = models[agentId];
  const root = new THREE.Group();
  const facing = new THREE.Group(); root.add(facing);
  let mixer = null, actions = {}, handBone = null;
  if (def) {
    const m = cloneSkinned(def.scene);
    const skin = AGENTS[agentId].skin;
    if (skin) {
      const sc = new THREE.Color(skin);
      m.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material = o.material.clone();
          if (o.material.color) o.material.color.lerp(sc, 0.55);
          if (o.material.emissive) o.material.emissive.lerp(sc, 0.15);
        }
      });
    }
    m.scale.setScalar(def.scale); m.position.y = def.yOff;
    // Mixamo Soldier.glb varsayılan olarak +Z'ye bakıyor; diğerleri -Z.
    // Nöbet / Zehir arkası dönük kalmasın diye model bazlı düzeltme.
    const modelFile = (AGENTS[agentId].model || '').toLowerCase();
    if (AGENTS[agentId].flip ?? modelFile === 'soldier.glb') {
      m.rotation.y = Math.PI;
    }
    const hide = AGENTS[agentId].hide;
    if (hide) m.traverse((o) => { if (hide.includes(o.name)) o.visible = false; });
    const pivot = new THREE.Group(); pivot.add(m); facing.add(pivot);
    mixer = new THREE.AnimationMixer(m);
    const animMap = AGENTS[agentId].anim || { idle: 'Idle', run: 'Run' };
    for (const [k, name] of Object.entries(animMap)) {
      const clip = def.animations.find((c) => c.name === name || c.name.toLowerCase() === name.toLowerCase());
      if (clip) { actions[k] = mixer.clipAction(clip); actions[k].play(); actions[k].setEffectiveWeight(k === 'idle' ? 1 : 0); }
    }
    // Walk varsa yavaş koşuda kullan
    const walkClip = def.animations.find((c) => /walk/i.test(c.name));
    if (walkClip && !actions.walk) { actions.walk = mixer.clipAction(walkClip); actions.walk.play(); actions.walk.setEffectiveWeight(0); }
    handBone = findHandBone(m, AGENTS[agentId].hand);
    if (handBone) { // bekleme pozunda el kemiğine göre "namlu karakterin önüne baksın" dönüşümünü bir kez hesapla
      mixer.update(0); root.updateMatrixWorld(true);
      const hp = facing.worldToLocal(handBone.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(...(AGENTS[agentId].gripOff || [0, 0, GRIP_FWD])));
      const want = new THREE.Matrix4().compose(hp, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), new THREE.Vector3(1, 1, 1));
      root.userData.gripMat = handBone.matrixWorld.clone().invert().multiply(facing.matrixWorld).multiply(want);
    }
    root.userData.pivot = pivot;
    root.userData.handBone = handBone;
  } else {
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: AGENTS[agentId].color }));
    b.position.y = 0.9; const pivot = new THREE.Group(); pivot.add(b); facing.add(pivot); root.userData.pivot = pivot;
  }
  root.userData.facing = facing; root.userData.mixer = mixer; root.userData.actions = actions;
  return root;
}

// ================= Three.js sahne =================
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#b8c4ce'); scene.fog = new THREE.Fog('#b8c4ce', 48, 175);
const camera = new THREE.PerspectiveCamera(78, 1, 0.05, 250);
camera.rotation.order = 'YXZ'; scene.add(camera);
const hemi = new THREE.HemisphereLight(0xf0f4f8, 0x7a8896, 1.05); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 1.55); sun.position.set(22, 42, 14); scene.add(sun);
const fill = new THREE.DirectionalLight(0xa8c4e0, 0.35); fill.position.set(-18, 20, -10); scene.add(fill);
const muzzleLight = new THREE.PointLight(0xffb36b, 0, 7, 2); scene.add(muzzleLight);
for (const l of [hemi, sun, fill, muzzleLight]) l.layers.enableAll();
const world = new THREE.Group(); scene.add(world);
const dyn = new THREE.Group(); scene.add(dyn); // tracer, smoke vb.

// ---- doku üreticileri (canvas) ----
const canvasTex = (w, h, draw, rep) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); } return t;
};
const noise = (g, w, h, n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); } };
const TEX = {};
function texFloor() {
  return TEX.floor ||= canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c9c4b6'; g.fillRect(0, 0, w, h); noise(g, w, h, 500, 0.08);
    g.strokeStyle = '#a9a495'; g.lineWidth = 4; g.strokeRect(0, 0, w, h);
    g.strokeStyle = '#b6b1a2'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  }, [21, 13]);
}
function texWall(tint) {
  return TEX['wall' + tint] ||= canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = tint; g.fillRect(0, 0, w, h); noise(g, w, h, 260, 0.1);
    g.fillStyle = '#00000026'; g.fillRect(0, h - 20, w, 20); g.fillStyle = '#ffffff12'; g.fillRect(0, 0, w, 6);
    g.strokeStyle = '#00000030'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
  });
}
function texCrate() {
  return TEX.crate ||= canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#c98a3e'; g.fillRect(0, 0, w, h); noise(g, w, h, 300, 0.12);
    g.strokeStyle = '#7a4a1a'; g.lineWidth = 9; g.strokeRect(5, 5, w - 10, h - 10);
    g.lineWidth = 7; g.beginPath(); g.moveTo(8, 8); g.lineTo(w - 8, h - 8); g.moveTo(w - 8, 8); g.lineTo(8, h - 8); g.stroke();
    g.strokeStyle = '#e0a860'; g.lineWidth = 2; g.strokeRect(11, 11, w - 22, h - 22);
  });
}
function texHazard() {
  return TEX.hazard ||= canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#5c6677'; g.fillRect(0, 0, w, h); noise(g, w, h, 200, 0.1);
    g.fillStyle = '#ffd24a'; for (let i = -4; i < 8; i++) { g.beginPath(); g.moveTo(i * 24, h); g.lineTo(i * 24 + 12, h); g.lineTo(i * 24 + 52, h - 24); g.lineTo(i * 24 + 40, h - 24); g.fill(); }
    g.fillStyle = '#00000030'; g.fillRect(0, 0, w, 10);
  });
}
function texSite(letter, color) {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = color; g.lineWidth = 12; g.beginPath(); g.arc(128, 128, 112, 0, 7); g.stroke();
    g.fillStyle = color; g.font = '800 150px Bahnschrift, Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letter, 128, 136);
  });
}
function skyDome(c = ['#4f86c0', '#a9cbe3', '#f1e7cf', '#d6c7a8']) {
  const t = canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, c[0]); gr.addColorStop(.45, c[1]); gr.addColorStop(.62, c[2]); gr.addColorStop(1, c[3]); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const m = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 16), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10; return m;
}

// ---- Haven C-Site: sıvalı duvarlar, ahşap kirişler, kiremit çatılar, taş zemin ----
function texStone() {
  return TEX.stone ||= canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#cfc7b4'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = 196 + Math.random() * 24; g.fillStyle = `rgb(${v},${v - 6},${v - 22})`; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60); }
    noise(g, w, h, 500, 0.07); g.strokeStyle = '#9d957f'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
  });
}
function texGrass() {
  return TEX.grass ||= canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#6f9b5a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 380; i++) { g.fillStyle = Math.random() < .5 ? '#5f8a4c' : '#82ad69'; g.fillRect(Math.random() * w, Math.random() * h, 2, 4 + Math.random() * 4); }
  });
}
function texPlaster(tint, accent = '#ff4655', post = '#6b5440') {
  return TEX['pl' + tint + accent + post] ||= canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = tint; g.fillRect(0, 0, w, h); noise(g, w, h, 320, 0.06);
    g.fillStyle = post; g.fillRect(0, 0, 7, h); g.fillRect(w - 7, 0, 7, h);            // dikmeler
    g.fillStyle = '#00000022'; g.fillRect(0, h - 22, w, 22);                               // taş etek
    g.fillStyle = accent + '55'; g.fillRect(0, 10, w, 4);                                   // ince renkli şerit
  });
}
function texWood() {
  return TEX.wood ||= canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#7b4f2e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? '#6a4226' : '#8a5c37'; g.fillRect(0, i * 7, w, 3); }
    noise(g, w, h, 100, 0.12);
  });
}
const flat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .85, flatShading: true, ...o });
function lowTree(x, z, s = 1, cols = ['#4f9462', '#3f7a52'], trunk = '#5a3f2a') {
  const g = new THREE.Group();
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(.18 * s, .26 * s, 1.6 * s, 6), flat(trunk)); tr.position.y = .8 * s; g.add(tr);
  [[2.1, 2.6, 1.9], [1.6, 2.2, 3.1], [1.0, 1.8, 4.1]].forEach(([r, h, y], i) => { const c = new THREE.Mesh(new THREE.ConeGeometry(r * s, h * s, 6), flat(cols[i % 2 ? 0 : 1])); c.position.y = y * s; g.add(c); });
  g.position.set(x, 0, z); return g;
}
function lantern(x, z, h = 3) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.CylinderGeometry(.05, .06, h, 6), flat('#3a2a20')); p.position.y = h / 2; g.add(p);
  const l = new THREE.Mesh(new THREE.SphereGeometry(.26, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffb86b' })); l.position.y = h + .1; l.scale.y = 1.25; g.add(l);
  g.position.set(x, 0, z); return g;
}

// ---- Harita temaları: her haritanın kendi zemini, duvar rengi, gökyüzü, ağaçları ----
const THEMES = {
  haven:  { sky: ['#4f86c0', '#a9cbe3', '#f1e7cf', '#d6c7a8'], fog: '#b8c4ce', sun: '#fff0d8', sunI: 1.55, hemi: 1.05, floor: '#cfc7b4', line: '#9d957f', tiles: 4, ts: 1.1, wall: '#e6dcc8', house: '#eadfc9', outer: '#cdbfa4', post: '#6b5440', accent: '#ff4655', cap: '#4a2f22', roof: '#a8452f', win: '#ffcf8a', plate: '#b9ae98', site: 'C', mountain: '#7f9db5', outside: '#8aa86a', tree: 'pine', grass: true, flags: true, rock: '#9a9384', top: 'bush' },
  bind:   { sky: ['#d9813a', '#f0bf7a', '#f7e2b5', '#d7b98a'], fog: '#e3c597', sun: '#ffe0b0', sunI: 1.7, hemi: 1.0, floor: '#dcbf8f', line: '#c29f6c', tiles: 2, ts: 1.6, wall: '#d99a63', house: '#cf8a55', outer: '#c78a5a', post: '#7b4a2a', accent: '#2fb3a5', cap: '#6b3a1e', roof: '#2fb3a5', win: '#2a1a10', plate: '#c9a46f', site: 'A', mountain: '#b67f52', outside: '#d8b483', tree: 'palm', grass: false, flags: true, rock: '#b08a5e', top: 'bush', flatRoof: true },
  split:  { sky: ['#17152f', '#3f3170', '#c0648c', '#4a3d5c'], fog: '#4f4866', sun: '#d8c8ff', sunI: 0.9, hemi: 0.8, floor: '#7d838c', line: '#5b6069', tiles: 3, ts: 2.2, wall: '#6c7a8c', house: '#4d5a6b', outer: '#55606e', post: '#2c3440', accent: '#ff3fd0', cap: '#1f2630', roof: '#2b3340', win: '#53e3ff', plate: '#5e646d', site: 'B', mountain: '#2a2644', outside: '#2a2b33', tree: 'none', grass: false, flags: false, rock: '#5e646d', top: 'bush', flatRoof: true },
  ascent: { sky: ['#3d7fd6', '#9fc8f0', '#e9f2fa', '#cdd8de'], fog: '#c6d8e6', sun: '#fff6e6', sunI: 1.6, hemi: 1.1, floor: '#bdb3a2', line: '#8f8676', tiles: 6, ts: 0.7, wall: '#efe3c8', house: '#e8c99a', outer: '#d9c9a8', post: '#8a6a4a', accent: '#3b7dd8', cap: '#5a4636', roof: '#b5532f', win: '#2d4f7a', plate: '#a9a090', site: 'A', mountain: '#8aa6bf', outside: '#a9b48c', tree: 'cypress', grass: true, flags: false, rock: '#a39a8a', top: 'water' },
  breeze: { sky: ['#1f94d6', '#87d3f2', '#eaf8fc', '#bfe6ee'], fog: '#cbeaf2', sun: '#fffbea', sunI: 1.8, hemi: 1.15, floor: '#efdfba', line: '#d8c497', tiles: 2, ts: 1.8, wall: '#f4f1e8', house: '#e8e2d2', outer: '#e2dccb', post: '#3aa6a6', accent: '#1fc2c2', cap: '#2f7f86', roof: '#2fa3a3', win: '#1a4d5a', plate: '#d8c9a2', site: 'B', mountain: '#4fa38a', outside: '#2fa6c9', tree: 'palm', grass: false, flags: true, rock: '#c9b895', top: 'deck' },
  lotus:  { sky: ['#5b8a6b', '#a6c49d', '#e0e8cc', '#9db08a'], fog: '#9fb394', sun: '#fff0c8', sunI: 1.3, hemi: 1.0, floor: '#8f9877', line: '#6e765a', tiles: 3, ts: 1.4, wall: '#9b8f78', house: '#857a64', outer: '#7d735f', post: '#4a4232', accent: '#e0a52b', cap: '#3e3a2c', roof: '#5c6b3a', win: '#e0a52b', plate: '#7f8466', site: 'C', mountain: '#4f7a55', outside: '#4f6e45', tree: 'jungle', grass: true, flags: false, rock: '#7c7b6c', top: 'gold' },
  icebox: { sky: ['#7ea6c8', '#c3d7e7', '#eef4f8', '#d9e4ec'], fog: '#dbe6ee', sun: '#f4f8ff', sunI: 1.5, hemi: 1.15, floor: '#e9eff3', line: '#c5d2db', tiles: 2, ts: 3, wall: '#cfdbe6', house: '#b8c8d8', outer: '#aebfcf', post: '#5a6d80', accent: '#ff8a1a', cap: '#4a5a6a', roof: '#5a6d80', win: '#ffd28a', plate: '#c9d4dc', site: 'B', mountain: '#eef3f7', outside: '#eef3f7', tree: 'snow', grass: false, flags: false, rock: '#aab6bf', top: 'bush', flatRoof: true },
};
const theme = () => (!MAP.custom && THEMES[MAP.id]) || THEMES.haven;
function texFloorT(T) {
  return TEX['fl' + T.floor] ||= canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = T.floor; g.fillRect(0, 0, w, h);
    const n = T.tiles, s = w / n, base = new THREE.Color(T.floor);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const c = base.clone().offsetHSL(0, 0, (Math.random() - .5) * .07); g.fillStyle = '#' + c.getHexString(); g.fillRect(x * s + 2, y * s + 2, s - 4, s - 4); }
    noise(g, w, h, 600, 0.07); g.strokeStyle = T.line; g.lineWidth = 3;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
  }, [1, 1]);
}
function texContainer(c) {
  return TEX['ct' + c] ||= canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = c; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) { g.fillStyle = '#00000026'; g.fillRect(x, 0, 3, h); g.fillStyle = '#ffffff14'; g.fillRect(x + 4, 0, 2, h); }
    noise(g, w, h, 200, 0.08); g.strokeStyle = '#00000055'; g.lineWidth = 6; g.strokeRect(0, 0, w, h);
  });
}
function palmTree(x, z, s = 1) {
  const g = new THREE.Group(); let px = 0, py = 0;
  for (let i = 0; i < 6; i++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(.15 * s, .2 * s, .82 * s, 6), flat(i % 2 ? '#8a6a45' : '#7a5c3a')); px += .05 * s * i; seg.position.set(px, py + .41 * s, 0); seg.rotation.z = -.05 * i; g.add(seg); py += .78 * s; }
  for (let i = 0; i < 7; i++) {
    const pv = new THREE.Group(); pv.position.set(px, py, 0); pv.rotation.y = i / 7 * Math.PI * 2;
    const lf = new THREE.Mesh(new THREE.ConeGeometry(.34 * s, 2.5 * s, 4), flat(i % 2 ? '#3f9a4f' : '#2f7d3f')); lf.scale.set(1, 1, .3); lf.rotation.z = -(Math.PI / 2 + .35); lf.position.set(1.15 * s, -.4 * s, 0); pv.add(lf); g.add(pv);
  }
  g.position.set(x, 0, z); return g;
}
function makeTree(kind, x, z, s = 1) {
  if (kind === 'palm') return palmTree(x, z, s);
  if (kind === 'snow') return lowTree(x, z, s, ['#e9f0f4', '#c9d9e3'], '#4a3a2c');
  const g = new THREE.Group(); g.position.set(x, 0, z);
  if (kind === 'cypress') {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(.14 * s, .2 * s, 1.2 * s, 6), flat('#5a3f2a')); tr.position.y = .6 * s; g.add(tr);
    const c = new THREE.Mesh(new THREE.ConeGeometry(.9 * s, 5.2 * s, 7), flat('#3c6b3f')); c.position.y = 3.6 * s; g.add(c); return g;
  }
  if (kind === 'jungle') {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(.2 * s, .32 * s, 3 * s, 6), flat('#5b4630')); tr.position.y = 1.5 * s; g.add(tr);
    for (const [dx, dy, dz, r] of [[0, 3.4, 0, 1.6], [.9, 3, .4, 1.1], [-.8, 3.1, -.5, 1.2], [.2, 4.1, -.3, 1]]) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 0), flat(dx > 0 ? '#3f7a3a' : '#2f6a34')); b.position.set(dx * s, dy * s, dz * s); g.add(b); }
    return g;
  }
  if (kind === 'none') { // şehir: neon sokak lambası
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.08, .1, 4.2 * s, 6), flat('#2a2f38')); p.position.y = 2.1 * s; g.add(p);
    const l = new THREE.Mesh(new THREE.BoxGeometry(.9, .14, .3), new THREE.MeshBasicMaterial({ color: '#53e3ff' })); l.position.set(.35, 4.2 * s, 0); g.add(l); return g;
  }
  return lowTree(x, z, s);
}
// Çarpışma kutusu olan özel nesneler (görünüm kutuyla aynı yerde → içinden geçilmez, görünmez duvar olmaz)
function addSpecial(b, T) {
  const hs = Math.abs(Math.round(b.x * 7.3 + b.z * 3.1));
  if (b.k === 'container') {
    const pal = ['#c0392b', '#2c6fbb', '#e0a526', '#2f8f5b', '#d35400', '#7d3c98'], n = b.h > 3 ? 2 : 1, hh = b.h / n;
    for (let i = 0; i < n; i++) {
      const tx = texContainer(pal[(hs + i * 3) % pal.length]).clone(); tx.needsUpdate = true; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(Math.max(1, Math.round(Math.max(b.w, b.d) / 2.6)), 1);
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, hh, b.d), new THREE.MeshStandardMaterial({ map: tx, roughness: .7, metalness: .3 })); m.position.set(b.x, hh * (i + .5), b.z); world.add(m);
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: .5 })); l.position.copy(m.position); world.add(l);
    }
    if (T.tree === 'snow') { const sn = new THREE.Mesh(new THREE.BoxGeometry(b.w + .05, .12, b.d + .05), flat('#f4f8fb')); sn.position.set(b.x, b.h + .06, b.z); world.add(sn); }
    return true;
  }
  if (b.k === 'barrel') {
    const r = Math.min(b.w, b.d) / 2, g = new THREE.Group();
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, b.h, 12), flat(MAP.id === 'icebox' ? '#2c6fbb' : '#7b4f2e')); c.position.y = b.h / 2; g.add(c);
    for (const y of [.22, .78]) { const rr = new THREE.Mesh(new THREE.CylinderGeometry(r + .02, r + .02, .07, 12), flat('#2b2b2b')); rr.position.y = b.h * y; g.add(rr); }
    g.position.set(b.x, 0, b.z); world.add(g); return true;
  }
  if (b.k === 'tree') { world.add(makeTree(T.tree, b.x, b.z, b.h / 4.5)); return true; }
  if (b.k === 'rock') { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(.5, 0), flat(T.rock)); m.scale.set(b.w * 1.05, b.h * 1.6, b.d * 1.05); m.position.set(b.x, b.h * .45, b.z); m.rotation.y = hs; world.add(m); return true; }
  if (b.k === 'planter') {
    const t = texFloorT(T).clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(b.w / 3, Math.max(.3, b.h / 3));
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), new THREE.MeshStandardMaterial({ map: t, roughness: .95 })); m.position.set(b.x, b.h / 2, b.z); world.add(m);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(b.w + .16, .14, b.d + .16), flat(T.cap)); rim.position.set(b.x, b.h - .07, b.z); world.add(rim);
    const top = T.top === 'water' ? new THREE.MeshStandardMaterial({ color: '#4aa8d8', roughness: .15, metalness: .2 }) : T.top === 'deck' ? new THREE.MeshStandardMaterial({ map: texWood(), roughness: .8 }) : null;
    if (top) { const p = new THREE.Mesh(new THREE.PlaneGeometry(b.w - .5, b.d - .5), top); p.rotation.x = -Math.PI / 2; p.position.set(b.x, b.h + .01, b.z); world.add(p); }
    else { const r = new THREE.Mesh(new THREE.RingGeometry(Math.min(b.w, b.d) * .22, Math.min(b.w, b.d) * .32, 6), new THREE.MeshBasicMaterial({ color: T.accent, side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2; r.position.set(b.x, b.h + .015, b.z); world.add(r); }
    return true;
  }
  return false;
}

let customMapRoot = null;
function addProceduralMap() {
  const hx = MAP.halfX, hz = MAP.halfZ, T = theme();
  // zemin
  const st = texFloorT(T), rp = (T.ts || 1.1) * T.tiles; st.repeat.set(hx * 2 / rp, hz * 2 / rp);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2, hz * 2), new THREE.MeshStandardMaterial({ map: st, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; world.add(floor);
  // kenar koridorlarında çim şeritleri (harita boyutuna göre)
  const gr = texGrass(); gr.repeat.set(10, 1.2);
  const grassW = hx * 0.6, grassD = Math.min(5.4, hz * 0.2);
  if (T.grass) for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(grassW, grassD), new THREE.MeshStandardMaterial({ map: gr, roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.position.set(sx * hx * 0.4, 0.012, sz * (hz - grassD * 0.5 - 0.5)); world.add(m);
  }
  // takım bölgeleri
  for (const [tm, x] of [[0, -hx + 6.5], [1, hx - 6.5]]) {
    const z = new THREE.Mesh(new THREE.PlaneGeometry(13, hz * 2), new THREE.MeshBasicMaterial({ color: TEAMS[tm].color, transparent: true, opacity: 0.2 }));
    z.rotation.x = -Math.PI / 2; z.position.set(x, 0.02, 0); world.add(z);
  }
  // C-Site işareti
  const site = new THREE.Mesh(new THREE.PlaneGeometry(15, 15), new THREE.MeshBasicMaterial({ map: texSite(T.site, T.accent), transparent: true, depthWrite: false, opacity: .9 }));
  site.rotation.x = -Math.PI / 2; site.position.set(0, 0.075, 0); site.renderOrder = 2; world.add(site);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.6, .06, 8), flat(T.plate)); plate.position.y = .03; plate.rotation.y = Math.PI / 8; world.add(plate); plate.renderOrder = -1;

  // kutular
  const edge = new THREE.LineBasicMaterial({ color: 0x2a2018, transparent: true, opacity: .55 });
  const wood = texWood();
  for (const b of MAP.boxes) {
    if (addSpecial(b, T)) continue;
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
    let mt;
    const rep = (tx) => { tx = tx.clone(); tx.needsUpdate = true; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(Math.max(1, Math.round(Math.max(b.w, b.d) / 3)), Math.max(1, Math.round(b.h / 3))); return tx; };
    if (b.k === 'crate' || b.k === 'stack') { const tx = texCrate().clone(); tx.needsUpdate = true; mt = new THREE.MeshStandardMaterial({ map: tx, roughness: .9 }); }
    else if (b.k === 'pillar') { const tx = wood.clone(); tx.needsUpdate = true; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(1, 4); mt = new THREE.MeshStandardMaterial({ map: tx, roughness: .8 }); }
    else mt = new THREE.MeshStandardMaterial({ map: rep(texPlaster(b.k === 'outer' ? T.outer : b.k === 'house' ? T.house : T.wall, T.accent, T.post)), roughness: .95 });
    const m = new THREE.Mesh(geo, mt); m.position.set(b.x, b.h / 2, b.z); world.add(m);
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edge); l.position.copy(m.position); world.add(l);
    if (b.k === 'wall' || b.k === 'outer' || b.k === 'house') {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(b.w + .3, .2, b.d + .3), flat(T.cap)); cap.position.set(b.x, b.h + .1, b.z); world.add(cap);   // koyu ahşap saçak
      const band = new THREE.Mesh(new THREE.BoxGeometry(b.w + .08, .2, b.d + .08), new THREE.MeshBasicMaterial({ color: T.accent })); band.position.set(b.x, b.h - .45, b.z); world.add(band);
    }
    if (b.k === 'house') { // çatı + pencereler
      if (T.flatRoof) { const ac = new THREE.Mesh(new THREE.BoxGeometry(Math.min(2, b.w * .3), .8, Math.min(1.6, b.d * .3)), flat(T.roof)); ac.position.set(b.x + b.w * .2, b.h + .6, b.z - b.d * .15); world.add(ac); }
      else {
        const rf = new THREE.Mesh(new THREE.ConeGeometry(1, 2.2, 4), flat(T.roof)); rf.scale.set(b.w * .8, 1, b.d * .8); rf.rotation.y = Math.PI / 4; rf.position.set(b.x, b.h + .2 + 1.1, b.z); world.add(rf);
        const fin = new THREE.Mesh(new THREE.OctahedronGeometry(.3), flat('#e6b84a', { metalness: .6 })); fin.position.set(b.x, b.h + 2.6, b.z); world.add(fin);
      }
      for (const sz of [-1, 1]) for (const wx of [-b.w * .25, b.w * .25]) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), new THREE.MeshBasicMaterial({ color: T.win })); win.position.set(b.x + wx, b.h * .55, b.z + sz * (b.d / 2 + .02)); if (sz < 0) win.rotation.y = Math.PI; world.add(win);
      }
    }
    if (b.k === 'pillar') { // kırmızı başlık + taş kaide
      const cap = new THREE.Mesh(new THREE.BoxGeometry(b.w + .5, .3, b.d + .5), flat(T.accent)); cap.position.set(b.x, b.h + .15, b.z); world.add(cap);
      const base = new THREE.Mesh(new THREE.BoxGeometry(b.w + .35, .4, b.d + .35), flat('#8d8573')); base.position.set(b.x, .2, b.z); world.add(base);
    }
    if (b.k === 'stack') { // site ortasındaki "C kutusu": üstte iki kasa + fener
      for (const [dx, dz, s, ry] of [[-.9, -.6, 1.3, .3], [1.0, .7, 1.0, -.4]]) {
        const sm = new THREE.Mesh(new THREE.BoxGeometry(s, s * .9, s), new THREE.MeshStandardMaterial({ map: texCrate(), roughness: .9 })); sm.position.set(b.x + dx, b.h + s * .45, b.z + dz); sm.rotation.y = ry; world.add(sm);
      }
    }
    if (b.k === 'crate' && b.h < 1.5) {
      const sm = new THREE.Mesh(new THREE.BoxGeometry(b.w * .45, .45, b.d * .45), new THREE.MeshStandardMaterial({ map: texCrate(), roughness: .9 }));
      sm.position.set(b.x + b.w * .12, b.h + .22, b.z - b.d * .1); sm.rotation.y = (b.x * 7 + b.z * 3) % 1; world.add(sm);
    }
  }
  // doğma odası kapılarına torii benzeri kapı (yalnızca Haven'ın duvar düzenine uyar)
  if (MAP.id === 'haven') for (const sx of [-1, 1]) {
    const gx = sx * 31, beamMat = flat('#c23a3a');
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, .45, 13.4), beamMat); top.position.set(gx, 5.7, 0); world.add(top);
    const top2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, .3, 12), flat('#3a2418')); top2.position.set(gx, 5.25, 0); world.add(top2);
    for (const sz of [-1, 1]) { world.add(lantern(gx + sx * 0.2, sz * 6.9, 3.2)); }
  }
  // dış çevre: zemin, ağaçlar veya şehir silueti (oyun alanının dışında, çarpışmasız)
  const og = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: T.outside, roughness: 1 })); og.rotation.x = -Math.PI / 2; og.position.y = -0.03; world.add(og);
  if (T.tree !== 'none') {
    for (let i = 0; i <= 12; i++) for (const s of [-1, 1]) world.add(makeTree(T.tree, -hx + (i / 12) * hx * 2 + ((i * 37) % 5 - 2), s * (hz + 4 + (i % 3) * 2.5), 1 + (i % 4) * 0.15));
    for (let i = 0; i <= 6; i++) for (const s of [-1, 1]) world.add(makeTree(T.tree, s * (hx + 5 + (i % 2) * 3), -hz + (i / 6) * hz * 2, 1.1));
  } else for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2, d = Math.max(hx, hz) + 14 + (i % 4) * 6, w = 6 + (i * 7 % 5), h = 12 + (i * 13 % 22);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), flat('#232436')); m.position.set(Math.cos(a) * d * 1.1, h / 2, Math.sin(a) * d * 0.8); world.add(m);
    for (const f of [.45, .7]) { const st = new THREE.Mesh(new THREE.BoxGeometry(w + .1, .25, w + .1), new THREE.MeshBasicMaterial({ color: (i + (f > .5 ? 1 : 0)) % 2 ? T.accent : T.win })); st.position.set(m.position.x, h * f, m.position.z); world.add(st); }
  }
  // uzakta dağ silueti (low-poly)
  const mtMat = flat(T.mountain);
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2, d = 95 + (i % 3) * 14, h = 26 + (i * 37 % 30);
    const m = new THREE.Mesh(new THREE.ConeGeometry(22 + (i * 13 % 14), h, 5), mtMat); m.position.set(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d); world.add(m);
  }
  addProps();
}


// ---- ek modeller: bayrak ipleri, taş fenerler, varil, bank, bonsai, duvar flamaları ----
// Tüm konumlar MAP.halfX / halfZ'ye göre ölçeklenir; böylece Bind/Split'te de kaybolmaz.
function addProps() {
  const hx = MAP.halfX, hz = MAP.halfZ, T = theme();
  const sx = (v) => (v / 44) * hx; // Haven referans halfX=44
  const sz = (v) => (v / 28) * hz; // Haven referans halfZ=28

  // dua bayrakları: koridorlar ve site üzerinde gerilmiş renkli üçgen flamalar
  if (T.flags) {
  const cols = ['#ff4655', '#f5f0e6', '#53e3c4', '#ffd24a', '#4f86c0'];
  const strings = [
    [-sx(28), -sz(6.6), sx(28), -sz(6.6)],
    [-sx(28), sz(6.6), sx(28), sz(6.6)],
    [-sx(26), -sz(25), sx(26), -sz(25)],
    [-sx(26), sz(25), sx(26), sz(25)],
    [-sx(6.6), -sz(26), -sx(6.6), sz(26)],
    [sx(6.6), -sz(26), sx(6.6), sz(26)],
  ];
  const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-.28, 0, 0, .28, 0, 0, 0, -.55, 0], 3)); tri.computeVertexNormals();
  const total = strings.length * 26, inst = new THREE.InstancedMesh(tri, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), total);
  const dm = new THREE.Object3D(), cc = new THREE.Color(); let n = 0;
  const lineMat = new THREE.LineBasicMaterial({ color: 0x3a2a20 });
  for (const [x1, z1, x2, z2] of strings) {
    const pts = []; const hgt = 6.2;
    for (let i = 0; i <= 26; i++) { const t = i / 26, sag = Math.sin(t * Math.PI) * -.7; pts.push(new THREE.Vector3(x1 + (x2 - x1) * t, hgt + sag, z1 + (z2 - z1) * t)); }
    world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
    for (let i = 0; i < 26 && n < total; i++) {
      const p = pts[i]; dm.position.set(p.x, p.y - .02, p.z); dm.rotation.set(0, Math.abs(x2 - x1) > Math.abs(z2 - z1) ? 0 : Math.PI / 2, 0); dm.updateMatrix(); inst.setMatrixAt(n, dm.matrix);
      inst.setColorAt(n, cc.set(cols[(i + n) % cols.length])); n++;
    }
  }
  world.add(inst);
  }

  // duvar flamaları (dış duvarların iç yüzü)
  const bt = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = T.accent; g.fillRect(0, 0, w, h); g.fillStyle = '#0f1923'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
    g.fillStyle = '#ece8e1'; g.beginPath(); g.moveTo(w / 2, 70); g.lineTo(w - 22, 128); g.lineTo(w / 2, 186); g.lineTo(22, 128); g.closePath(); g.fill();
    g.fillStyle = T.accent; g.beginPath(); g.moveTo(w / 2, 98); g.lineTo(w - 48, 128); g.lineTo(w / 2, 158); g.lineTo(48, 128); g.closePath(); g.fill();
  });
  const bm = new THREE.MeshBasicMaterial({ map: bt, side: THREE.DoubleSide });
  for (const x of [-sx(30), -sx(15), 0, sx(15), sx(30)]) for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2), bm); b.position.set(x, 3.4, s * (hz - .01)); b.rotation.y = s > 0 ? Math.PI : 0; world.add(b);
  }
  for (const z of [-sz(14), sz(14)]) for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2), bm); b.position.set(s * (hx - .01), 3.4, z); b.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; world.add(b);
  }

}

function buildMap() {
  world.clear(); customMapRoot = null;
  const T = theme();
  if (world.userData.sky) scene.remove(world.userData.sky);
  world.userData.sky = skyDome(T.sky); scene.add(world.userData.sky);
  scene.background.set(T.fog); scene.fog.color.set(T.fog); sun.color.set(T.sun); sun.intensity = T.sunI; hemi.intensity = T.hemi;
  if (MAP.custom) {
    // harita GLB'si: görünüm dosyadan, çarpışma sunucudaki kutulardan
    new GLTFLoader().load(MAP.custom.file, (g) => {
      const root = g.scene; root.rotation.y = MAP.custom.rotY || 0; root.scale.setScalar(MAP.custom.scale);
      root.position.set(...MAP.custom.offset);
      root.traverse((o) => { if (o.isMesh) { o.frustumCulled = true; const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { m.side = THREE.DoubleSide; if (m.map) m.map.anisotropy = 4; }); } });
      world.add(root); customMapRoot = root;
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(MAP.halfX * 4, MAP.halfZ * 4), new THREE.MeshStandardMaterial({ color: '#8d8a80', roughness: 1 })); gl.rotation.x = -Math.PI / 2; gl.position.y = -0.02; world.add(gl);
    }, undefined, () => { console.warn('Harita GLB yüklenemedi, varsayılan harita çiziliyor'); addProceduralMap(); });
  } else addProceduralMap();
}

// ================= Silah modelleri: bkz. weapons.js =================
const flashTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, '#fff'); r.addColorStop(.3, '#ffd27a'); r.addColorStop(1, '#ff7a1a00'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
// silah/kollar ayrı kamerayla (layer 1) çizilir: duvara girmez, FOV sabit kalır
const vmCam = new THREE.PerspectiveCamera(68, 1, 0.01, 10); vmCam.layers.set(1); scene.add(vmCam);
const view = new THREE.Group(); vmCam.add(view); view.position.set(0.24, -0.22, -0.5);
let viewGun = null, viewGunId = null, viewHands = null;
const muzzleFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
muzzleFlash.scale.setScalar(0.35); muzzleFlash.visible = false; muzzleFlash.layers.set(1); view.add(muzzleFlash);
const va = { draw: 1, swing: 0, heavy: false, side: 1, inspect: 0, reload: 0, reloadDur: 1.5, ads: 0, zoomIdx: 0, mx: 0, my: 0, sx: 0, sy: 0, roll: 0, land: 0, kickR: 1.5, step: 0 }; // görünüm animasyonları
let viewAgent = null;
function setViewGun(id) {
  const agent = playerInfo(myId)?.agent || 'soldier';
  if (viewGunId === id && viewAgent === agent) return; viewGunId = id; viewAgent = agent; va.draw = 0; va.inspect = 0; va.swing = 0; va.reload = 0; me.ads = false;
  if (viewGun) view.remove(viewGun); if (viewHands) view.remove(viewHands);
  const ag = AGENTS[agent];
  viewGun = applySkin(buildGun(id), skinOf(id)); viewHands = buildHands(id, { accent: ag?.color }); view.add(viewGun, viewHands);
  for (const o of [viewGun, viewHands]) o.traverse((c) => { c.layers.set(1); c.frustumCulled = false; });
  const box = new THREE.Box3().setFromObject(viewGun);
  viewGun.userData.top = box.max.y;
  { const P = ADS_P[id] || ADS_P.classic, s = findSight(viewGun); viewGun.userData.ads = { y: -s.y - 0.003, z: -P.d - s.z }; $('#sight').innerHTML = RETICLES[P.ret] || ''; va.zoomIdx = 0; }
  muzzleFlash.position.set(0, 0.02, viewGun.userData.muzzle - 0.05);
}

// ================= Durum =================
const me = { x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0, pitch: 0, onGround: true, alive: true, hp: 100, armor: 0, weapon: 'classic', ammo: 12, reloading: false,
  credits: 0, cd: { e: 0, q: 0 }, dashT: 0, dashX: 0, dashZ: 0, hasteUntil: 0, flash: 0, recoil: 0, kick: 0, nextFire: 0 };
const players = new Map(); // id -> kayıt
let phase = 'lobby', phaseEndAt = 0, round = 0, score = [0, 0];
let rmbHeld = false;
let locked = false, buyOpen = false, firing = false, fireQueued = false, heavyQueued = false, spectateIdx = 0;
const keys = {};
let smokes = [], tracers = [], walls = [], fires = [], decals = [], parts = [];
const dropObjs = new Map();

function playerInfo(id) { return room?.players.find((p) => p.id === id); }
function ensurePlayer(id) {
  let p = players.get(id); if (p) return p;
  const info = playerInfo(id); if (!info) return null;
  p = { id, team: info.team, agent: info.agent, name: info.name, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, yaw: 0, pitch: 0, alive: true, hp: 100, armor: 0, w: 'classic', k: 0, d: 0, cr: 0, speed: 0, deadT: 0, init: false };
  const av = makeAvatar(p.agent); p.obj = av; p.gunId = null;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 28), new THREE.MeshBasicMaterial({ color: TEAMS[p.team].color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; av.add(ring);
  if (p.team === TEAMS_MY()) av.add(makeNameSprite(info.name, TEAMS[p.team].color));
  scene.add(av); players.set(id, p); return p;
}
const TEAMS_MY = () => playerInfo(myId)?.team;
function makeNameSprite(name, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.font = '700 30px Bahnschrift, Arial Narrow, sans-serif'; g.textAlign = 'center'; g.lineWidth = 6; g.strokeStyle = '#000c'; g.strokeText(name, 128, 42); g.fillStyle = color; g.fillText(name, 128, 42);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.4, 1); s.position.y = 2.25; s.renderOrder = 10; return s;
}
function clearPlayers() { for (const p of players.values()) scene.remove(p.obj); players.clear(); }

// ================= Oyuna giriş / çıkış =================
let started = false;
async function enterGame() {
  inGame = true; showScreen('game'); $('#killfeed').innerHTML = ''; $('#matchEnd').classList.add('hidden');
  if (!started) { started = true; resize(); requestAnimationFrame(loop); }
  buildMap();
  clearPlayers(); setViewGun('classic'); renderBuy();
}
function leaveGame() {
  inGame = false; if (document.pointerLockElement) document.exitPointerLock();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); clearPlayers(); clearFx(); onDrops([]); closeSettings(); $('#matchEnd').classList.add('hidden'); $('#deathCard').classList.add('hidden'); buyOpen = false; $('#buy').classList.add('hidden'); phase = 'lobby';
}
function clearFx() { for (const s of smokes) dyn.remove(s.mesh); smokes = []; while (walls.length) removeWall(walls.length - 1); while (fires.length) removeFire(fires.length - 1); for (const d of decals) dyn.remove(d); decals = []; for (const q of parts) dyn.remove(q.m); parts = []; }

function onPhase(m) {
  phase = m.phase; round = m.round; score = m.score; phaseEndAt = performance.now() + m.remain;
  if (m.clear) clearFx();
  if (m.spawn) {
    Object.assign(me, { x: m.spawn.x, y: 0, z: m.spawn.z, vx: 0, vz: 0, vy: 0, yaw: m.spawn.yaw, pitch: 0, alive: true, hp: 100, dashT: 0, hasteUntil: 0, flash: 0, deathCam: null, punch: 0, recoil: 0, recoilYaw: 0, spray: 0 }); $('#deathCard').classList.add('hidden');
    for (const p of players.values()) { p.alive = true; p.deadT = 0; p.init = false; }
    $('#flashFx').style.opacity = 0;
  }
  if (m.phase === 'buy') { roundKills = 0; openBuy(true); banner(`Raunt ${m.round}`, 'Satın alma fazı'); }
  else if (m.phase === 'live') { closeBuy(); banner('Başla!', '', 1100); }
  else if (m.phase === 'roundEnd' || m.phase === 'matchEnd') {
    const mine = TEAMS_MY();
    const won = m.winner === mine;
    if (m.phase === 'matchEnd' && m.stats) showMatchEnd(m.stats, won);
    else if (m.phase === 'matchEnd') banner(won ? 'MAÇI KAZANDIN' : 'MAÇI KAYBETTİN', `${score[0]} – ${score[1]} · Ana menüye dönülüyor…`, 7000, won ? 'win' : 'lose');
    else banner(won ? 'RAUNT SENİN' : 'RAUNT RAKİBİN', m.reason, 4200, won ? 'win' : 'lose');
  }
  updateTop();
}
let bannerT; function banner(t, sub = '', ms = 2600, kind = '') {
  const b = $('#banner'); b.innerHTML = `${esc(t)}${sub ? `<small>${esc(sub)}</small>` : ''}`; b.className = 'on ' + kind; clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('on'), ms);
}

function onSnap(m) {
  for (const s of m.ps) {
    if (s.id === myId) {
      me.hp = s.hp; me.armor = s.ar; if (performance.now() > (me.slotLock || 0)) { me.weapon = s.w; me.ammo = s.am; } me.primary = s.p1; me.secondary = s.p2; me.reloading = !!s.rl; me.credits = s.cr; me.cd.e = s.cde; me.cd.q = s.cdq; me.alive = !!s.a;
      me.k = s.k; me.d = s.d;
      continue;
    }
    const p = ensurePlayer(s.id); if (!p) continue;
    const t = performance.now(); const dt = Math.max(0.03, (t - (p.lastSnap || t - 60)) / 1000);
    if (p.init) p.speed = p.speed * 0.6 + Math.hypot(s.x - p.x, s.z - p.z) / dt * 0.4;
    p.lastSnap = t;
    Object.assign(p, { crouch: !!s.c, x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch, hp: s.hp, armor: s.ar, w: s.w, k: s.k, d: s.d, cr: s.cr });
    if (p.alive && !s.a) p.deadT = 0.001;
    if (!p.alive && s.a) { p.deadT = 0; }
    p.alive = !!s.a;
    if (!p.init) { p.rx = s.x; p.ry = s.y; p.rz = s.z; p.ryaw = s.yaw; p.init = true; }
  }
  me.snapAll = m.ps; updateHud(); updateTop();
}

// ================= HUD =================
function updateTop() {
  $('#sc0').textContent = score[0]; $('#sc1').textContent = score[1];
  const all = [{ id: myId, team: TEAMS_MY(), alive: me.alive }, ...[...players.values()]];
  for (const t of [0, 1]) {
    const mode = room?.mode || 1; const alive = all.filter((p) => p.team === t && p.alive).length;
    const pips = $(`#alive${t}`); pips.innerHTML = ''; for (let i = 0; i < mode; i++) pips.append(el('i', i < alive ? 'on' : ''));
  }
  $('#roundInfo').textContent = `Raunt ${round} · ilk ${ROUND.wins} raunt kazanan`;
}
function updateHud() {
  $('#hp').textContent = Math.max(0, me.hp); $('#hp').style.color = me.hp <= 30 ? '#ff4655' : ''; $('#hpBar').style.width = clamp(me.hp, 0, 100) + '%';
  $('#botsLbl').textContent = room && room.solo ? 'KALAN BOT' : 'KALAN RAKİP';
  const mineT = TEAMS_MY(); $('#botsLeft').textContent = [...players.values()].filter((p) => p.team !== mineT && p.alive).length;
  $('#armor').textContent = me.armor > 0 ? `zırh ${Math.round(me.armor)}` : '';
  const w = WEAPONS[me.weapon]; $('#wname').textContent = w.name;
  $('#ammo').textContent = w.melee ? '—' : me.reloading ? 'şarjör…' : `${me.ammo} / ${w.mag}`;
  $('#slots').innerHTML = [[1, me.primary], [2, me.secondary], [3, 'knife']].map(([n, id]) => `<li class="${id && id === me.weapon ? 'on' : ''}${id ? '' : ' empty'}"><span>${id ? WEAPONS[id].name : '—'}</span><kbd>${n}</kbd></li>`).join('');
  $('#credits').textContent = `${me.credits} KREDİ`;
  const a = AGENTS[playerInfo(myId)?.agent || 'soldier'];
  for (const k of ['e', 'q']) {
    const box = $(k === 'e' ? '#abE' : '#abQ'); const ab = a.abilities[k]; const cd = me.cd[k];
    box.querySelector('span').textContent = ab.name; box.classList.toggle('cool', cd > 0);
    box.querySelector('i').style.transform = `scaleY(${clamp(cd / ab.cd, 0, 1)})`;
  }
  setViewGun(me.weapon);
  $('#buyCredits').textContent = `${me.credits} kredi`; refreshBuy();
}
setInterval(() => {
  if (!inGame) return;
  const s = Math.max(0, Math.ceil((phaseEndAt - performance.now()) / 1000));
  $('#timer').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}, 200);

function renderBuy() {
  const g = $('#buyGrid'); g.innerHTML = ''; let n = 1;
  for (const [id, w] of Object.entries(WEAPONS).filter(([, x]) => !x.melee)) {
    const b = el('button', 'item', `<b><span>${n <= 9 ? n + '. ' : ''}${w.name}</span><span>${w.price}</span></b><small>${w.type} · ${w.dmg}${w.pellets > 1 ? '×' + w.pellets : ''} hasar · ${w.mag} mermi</small>`);
    b.dataset.item = id; b.onclick = () => send({ t: 'buy', item: id }); g.append(b); n++;
  }
  const a = el('button', 'item', `<b><span>${n <= 9 ? n + '. ' : ''}Zırh</span><span>${ARMOR.price}</span></b><small>Hasarın yarısını ${ARMOR.amount} puana kadar emer</small>`);
  a.dataset.item = 'armor'; a.onclick = () => send({ t: 'buy', item: 'armor' }); g.append(a);
}
function refreshBuy() {
  document.querySelectorAll('.item').forEach((b) => {
    const id = b.dataset.item; const price = id === 'armor' ? ARMOR.price : WEAPONS[id].price;
    b.disabled = me.credits < price || phase !== 'buy' || (id === 'armor' && me.armor >= ARMOR.amount);
    b.classList.toggle('own', me.primary === id || me.secondary === id);
  });
}
function openBuy(auto) { if (phase !== 'buy') return; buyOpen = true; $('#buy').classList.remove('hidden'); if (document.pointerLockElement) document.exitPointerLock(); refreshBuy(); }
function closeBuy() { buyOpen = false; $('#buy').classList.add('hidden'); updateLockHint(); }
function updateLockHint() { $('#lockHint').classList.toggle('hidden', !inGame || locked || buyOpen || !$('#board').classList.contains('hidden')); }
function renderBoard() {
  const b = $('#board'); b.innerHTML = '';
  const rows = [{ id: myId, k: me.k || 0, d: me.d || 0, cr: me.credits, alive: me.alive, team: TEAMS_MY() }, ...[...players.values()]];
  for (const t of [0, 1]) {
    const col = el('div'); col.innerHTML = `<h4 style="color:${TEAMS[t].color}">${TEAMS[t].name} · ${score[t]}</h4>`;
    const tb = el('table', '', '<tr><th>Oyuncu</th><th>Ajan</th><th>K</th><th>D</th><th>Kredi</th></tr>');
    for (const p of rows.filter((p) => p.team === t)) {
      const info = playerInfo(p.id); const tr = el('tr', `${p.id === myId ? 'me' : ''} ${p.alive ? '' : 'dead'}`,
        `<td>${esc(info?.name || '?')}</td><td>${AGENTS[info?.agent]?.name || ''}</td><td>${p.k || 0}</td><td>${p.d || 0}</td><td>${p.id === myId || t === TEAMS_MY() ? (p.id === myId ? me.credits : p.cr) : '—'}</td>`);
      tb.append(tr);
    }
    col.append(tb); b.append(col);
  }
}

// ================= Olaylar =================
function onShot(m) {
  const p = m.id === myId ? null : players.get(m.id);
  const origin = new THREE.Vector3(...m.o);
  if (m.id === myId) {
    const from = view.localToWorld(new THREE.Vector3(0, 0.02, viewGun ? viewGun.userData.muzzle : -.4));
    for (const t of m.tr) addTracer(from, new THREE.Vector3(t[0], t[1], t[2]), t[3]);
  } else {
    if (p) { const g = WEAPONS[m.w]; origin.x += -Math.sin(p.yaw) * 0.6; origin.z += -Math.cos(p.yaw) * 0.6; origin.y -= 0.2; p.shootT = 0.06; }
    for (const t of m.tr) addTracer(origin, new THREE.Vector3(t[0], t[1], t[2]), t[3]);
    const d = Math.hypot(origin.x - me.x, origin.z - me.z);
    sound.shot(m.w, clamp(1 - d / 60, 0.05, 0.8));
  }
  for (const t of m.tr) if (!t[3]) addImpact(t[0], t[1], t[2]);
}
function addTracer(a, b, hit) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: hit ? 0xff6050 : 0xffe9a8, transparent: true, opacity: 0.85 }));
  dyn.add(line); tracers.push({ line, t: 0.09 });
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), new THREE.MeshBasicMaterial({ color: hit ? 0xff4030 : 0xffd27a }));
  spark.position.copy(b); dyn.add(spark); tracers.push({ line: spark, t: 0.12 });
}
function onHit(m) {
  if (m.v !== myId) bloodFx(m);
  if (m.a === myId) {
    const h = $('#hitmarker'); h.className = m.head ? 'on head' : 'on'; setTimeout(() => h.className = '', 90); sound.tick(m.head);
  }
  if (m.v === myId) {
    const d = $('#dmgFx'); d.style.transition = 'none'; d.style.opacity = 1; requestAnimationFrame(() => { d.style.transition = 'opacity .6s'; d.style.opacity = 0; });
    me.kick = 0.05; me.punch = Math.min(0.06, (me.punch || 0) + 0.025); sound.hurt();
  }
}
function onKill(m) {
  const ki = playerInfo(m.k), vi = playerInfo(m.v);
  const li = el('li', m.k === myId ? 'mine' : '', `<b style="color:${TEAMS[ki?.team ?? 0].color}">${esc(ki?.name || '?')}</b> · ${m.head ? '✦ ' : ''}${WEAPONS[m.w]?.name || ({ blast: 'Şok Dalgası', molly: 'Molotof' }[m.w] || m.w)} · <b style="color:${TEAMS[vi?.team ?? 0].color}">${esc(vi?.name || '?')}</b>`);
  $('#killfeed').prepend(li); setTimeout(() => li.remove(), 5500);
  if (m.k === myId && m.v !== myId) killConfirm(m.head);
  if (m.v === myId) { me.alive = false; spectateIdx = 0; me.ads = false; if (m.k !== myId) { me.deathCam = { id: m.k, t: 3.2 }; showDeathCard(m); } }
  const p = players.get(m.v); if (p) { p.alive = false; p.deadT = p.deadT || 0.001; }
}
function onFx(m) {
  if (m.type === 'smoke') {
    const grp = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(2.4 + Math.random() * 1.2, 16, 12), new THREE.MeshBasicMaterial({ color: '#cfd5db', transparent: true, opacity: 0.93, depthWrite: false }));
      s.position.set((Math.random() - .5) * 3, 1.6 + Math.random() * 1.8, (Math.random() - .5) * 3); grp.add(s);
    }
    grp.position.set(m.x, 0, m.z); dyn.add(grp); smokes.push({ mesh: grp, t: m.dur / 1000, max: m.dur / 1000 });
  } else if (m.type === 'flash') {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 }));
    s.position.set(m.x, m.y, m.z); dyn.add(s); tracers.push({ line: s, t: 0.35, grow: 8 }); sound.pop();
  } else if (m.type === 'blast') {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.6, 40), new THREE.MeshBasicMaterial({ color: 0xe8d34a, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    r.rotation.x = -Math.PI / 2; r.position.set(m.x, m.y + 0.1, m.z); dyn.add(r); tracers.push({ line: r, t: 0.5, grow: 12 }); sound.pop();
  } else if (m.type === 'recon') {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.7, 48), new THREE.MeshBasicMaterial({ color: 0x53e3c4, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false }));
    r.rotation.x = -Math.PI / 2; r.position.set(m.x, m.y + 0.15, m.z); dyn.add(r); tracers.push({ line: r, t: 0.9, grow: 45 }); sound.pop();
  } else if (m.type === 'wall') {
    const mine = m.team === TEAMS_MY(), col = mine ? '#5fb4ff' : '#ff6b6b';
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(m.w, m.h, m.d), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, transparent: true, opacity: 0.55, roughness: 0.3 }));
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: col })));
    mesh.position.set(m.x, 0, m.z); mesh.scale.y = 0.01; dyn.add(mesh);
    const box = { x: m.x, z: m.z, w: m.w, d: m.d, h: m.h, tmp: true }; MAP.boxes.push(box); walls.push({ mesh, box, t: m.dur / 1000 }); sound.pop();
  } else if (m.type === 'molly') {
    const g = new THREE.Group(); g.position.set(m.x, groundAt(m.x, m.z, 3) + 0.03, m.z);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(m.rad, 28), new THREE.MeshBasicMaterial({ color: '#2a0f05', transparent: true, opacity: 0.7, depthWrite: false })); disc.rotation.x = -Math.PI / 2; g.add(disc);
    const fl = [];
    for (let i = 0; i < 28; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: i % 3 ? 0xff7a1a : 0xffc04a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * m.rad * 0.9; sp.position.set(Math.cos(a) * rr, 0.35, Math.sin(a) * rr); sp.userData.ph = Math.random() * 6; g.add(sp); fl.push(sp);
    }
    dyn.add(g); fires.push({ g, fl, t: m.dur / 1000, x: m.x, z: m.z, rad: m.rad }); sound.pop();
  }
}
function onAbility(m) {
  if (m.id === 'dash') {
    let dx = -Math.sin(me.yaw), dz = -Math.cos(me.yaw);
    const mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), mz = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
    if (mx || mz) { dx = mx * Math.cos(me.yaw) + mz * Math.sin(me.yaw); dz = -mx * Math.sin(me.yaw) + mz * Math.cos(me.yaw); const l = Math.hypot(dx, dz); dx /= l; dz /= l; }
    me.dashT = 0.22; me.dashX = dx; me.dashZ = dz;
  } else if (m.id === 'haste') me.hasteUntil = performance.now() + 5000;
  sound.pop();
}

// ================= Ses =================
const sound = (() => {
  let ac; const ctx = () => ac || (ac = new (window.AudioContext || window.webkitAudioContext)());
  const noiseBuf = () => { const a = ctx(); const b = a.createBuffer(1, a.sampleRate * 0.3, a.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; };
  let nb, master; const out = () => { const a = ctx(); if (!master) { master = a.createGain(); master.gain.value = cfg.vol; master.connect(a.destination); } return master; };
  function tone(f0, f1, dur, vol, type = 'square') { try { const a = ctx(), o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f0, a.currentTime); o.frequency.exponentialRampToValueAtTime(f1, a.currentTime + dur); g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur); o.connect(g).connect(out()); o.start(); o.stop(a.currentTime + dur); } catch {} }
  function noise(dur, vol, hp) { try { const a = ctx(); nb = nb || noiseBuf(); const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter(); s.buffer = nb; f.type = 'highpass'; f.frequency.value = hp; g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur); s.connect(f).connect(g).connect(out()); s.start(); s.stop(a.currentTime + dur); } catch {} }
  return {
    unlock() { try { ctx().resume(); } catch {} },
    setVol(v) { if (master) master.gain.value = v; },
    shot(w, v = 0.5) { if (w === 'knife') { noise(0.13, 0.14 * v, 2600); tone(900, 300, 0.1, 0.03 * v, 'sine'); return; } const big = (w === 'operator' || w === 'marshal') ? 1.6 : (w === 'bucky' || w === 'judge') ? 1.3 : (w === 'vandal' || w === 'phantom' || w === 'ares') ? 1.1 : 0.8; noise(0.14 * big, 0.22 * v, (w === 'operator' || w === 'marshal') ? 200 : 700); tone(220 * (2 - big / 1.6), 50, 0.12, 0.12 * v, 'sawtooth'); },
    tick(head) { tone(head ? 1500 : 900, head ? 1100 : 700, 0.07, 0.1, 'sine'); },
    hurt() { tone(120, 60, 0.18, 0.18, 'sawtooth'); },
    kill(n, head) { const b = 520 + Math.min(n, 5) * 110; tone(b, b * 1.5, 0.09, 0.09, 'square'); setTimeout(() => tone(b * 1.5, b * 2, 0.12, 0.07, 'sine'), 70); if (head) setTimeout(() => tone(1800, 1400, 0.1, 0.05, 'sine'), 140); },
    step(v = 0.5, pan = 0) { try { const a = ctx(); if (a.state !== 'running') return; nb = nb || noiseBuf(); const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter(), pn = a.createStereoPanner(); s.buffer = nb; s.playbackRate.value = 0.7 + Math.random() * 0.3; f.type = 'lowpass'; f.frequency.value = 650 + Math.random() * 200; pn.pan.value = pan; g.gain.setValueAtTime(0.32 * v, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.11); s.connect(f).connect(g).connect(pn).connect(out()); s.start(); s.stop(a.currentTime + 0.12); } catch {} },
    ads(on, big) { noise(0.07, big ? 0.05 : 0.03, 2600); tone(on ? 380 : 520, on ? 640 : 300, big ? 0.1 : 0.06, big ? 0.03 : 0.018, 'sine'); },
    zoom() { tone(900, 1250, 0.045, 0.03, 'sine'); noise(0.03, 0.03, 4000); },
    inspect() { noise(0.05, 0.04, 3000); setTimeout(() => noise(0.04, 0.035, 3500), 120); },
    pop() { noise(0.25, 0.2, 300); tone(300, 90, 0.2, 0.1); },
    ui(k) { if (!ac || ac.state !== 'running') return; if (k === 'hover') tone(1300, 1500, 0.035, 0.025, 'sine'); else if (k === 'play') { tone(300, 900, 0.18, 0.07, 'square'); noise(0.2, 0.08, 1500); } else tone(520, 880, 0.07, 0.05, 'square'); },
  };
})();

// ================= Giriş =================
addEventListener('keydown', (e) => {
  if (!inGame) return;
  if (e.ctrlKey || e.code.startsWith('Control')) e.preventDefault();
  if (e.code === 'Tab') { e.preventDefault(); renderBoard(); $('#board').classList.remove('hidden'); updateLockHint(); return; }
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === binds.buy && phase === 'buy') { buyOpen ? closeBuy() : openBuy(); }
  if (buyOpen && /^Digit[1-9]$/.test(e.code)) { const items = [...document.querySelectorAll('.item')]; const it = items[+e.code.slice(5) - 1]; if (it && !it.disabled) it.click(); }
  if (!buyOpen && /^Digit[123]$/.test(e.code)) switchSlot(+e.code.slice(5));
  if (e.code === binds.drop && me.alive && (phase === 'live' || phase === 'buy')) send({ t: 'drop' });
  if (e.code === binds.inspect && me.alive && !va.swing && !me.reloading && !va.inspect && va.draw >= 1) { va.inspect = 0.001; me.ads = false; }
  if (!locked || !me.alive || phase !== 'live') return;
  if (e.code === binds.reload) send({ t: 'reload' });
  if (e.code === binds.abilE) send({ t: 'ability', slot: 'e' });
  if (e.code === binds.abilQ) send({ t: 'ability', slot: 'q' });
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Tab') { $('#board').classList.add('hidden'); updateLockHint(); } });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; firing = false; rmbHeld = false; me.ads = false; });
canvas.addEventListener('mousedown', (e) => {
  sound.unlock();
  if (!locked && !buyOpen) { lockGame(); return; }
  if (e.button === 0) { firing = true; fireQueued = true; if (!me.alive) spectateIdx++; }
  if (e.button === 2) { if (me.weapon === 'knife') heavyQueued = true; else { rmbHeld = true; if (me.alive && !me.reloading && !buyOpen) { me.ads = cfg.adsToggle ? !me.ads : true; va.inspect = 0; } } }
});
// slot değiştirme: 1 ana silah, 2 tabanca, 3 karambit · fare tekerleği ile sırayla
function switchSlot(n) {
  if (!me.alive || (phase !== 'live' && phase !== 'buy')) return;
  const id = n === 1 ? me.primary : n === 2 ? me.secondary : 'knife';
  if (!id || id === me.weapon) return;
  send({ t: 'slot', s: n }); me.weapon = id; me.reloading = false; me.slotLock = performance.now() + 250; me.nextFire = performance.now() + 400;
  setViewGun(id); updateHud(); sound.ui('click');
}
addEventListener('wheel', (e) => {
  if (!inGame || !locked || buyOpen) return;
  if (zoomScope(e.deltaY > 0 ? -1 : 1)) return; // dürbündeyken tekerlek yakınlaştırır
  const order = [1, 2, 3].filter((n) => n === 3 || (n === 1 ? me.primary : me.secondary));
  let i = order.indexOf(slotOf(me.weapon)); i = (i + (e.deltaY > 0 ? 1 : -1) + order.length) % order.length; switchSlot(order[i]);
}, { passive: true });
addEventListener('mouseup', (e) => { if (e.button === 0) firing = false; if (e.button === 2) { rmbHeld = false; if (!cfg.adsToggle) me.ads = false; } });
// Ctrl+W sekmeyi kapatmasın: tam ekranda tarayıcı bu tuşları oyuna bırakır (Keyboard Lock); ayrıca maçta çıkmadan önce onay sorulur
function lockGame() {
  if (cfg.full && !document.fullscreenElement && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().then(() => navigator.keyboard?.lock?.(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyT', 'KeyN', 'KeyR', 'KeyQ', 'ControlLeft', 'ControlRight', 'Tab']).catch(() => {})).catch(() => {});
  }
  canvas.requestPointerLock();
}
addEventListener('beforeunload', (e) => { if (inGame) { e.preventDefault(); e.returnValue = ''; } });
$('#lockHint').addEventListener('mousedown', () => { sound.unlock(); lockGame(); });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (locked && buyOpen && phase !== 'buy') closeBuy(); if (locked && buyOpen) closeBuy(); updateLockHint(); });
addEventListener('mousemove', (e) => {
  if (!locked || !inGame) return;
  const s = 0.0022 * +$('#sens').value * (camera.fov / cfg.fov) * (1 + (cfg.adsSens - 1) * easeS(va.ads));
  va.mx += e.movementX; va.my += e.movementY;
  me.yaw -= e.movementX * s; me.pitch = clamp(me.pitch - e.movementY * s, -1.5, 1.5);
});
addEventListener('contextmenu', (e) => e.preventDefault());

// ================= Hareket ve çarpışma =================
function groundAt(x, z, y) {
  let g = 0;
  for (const b of MAP.boxes) {
    if (Math.abs(x - b.x) < b.w / 2 + 0.15 && Math.abs(z - b.z) < b.d / 2 + 0.15 && b.h <= y + 0.4 && b.h > g) g = b.h;
  }
  return g;
}
function pushOut() {
  for (let it = 0; it < 2; it++) for (const b of MAP.boxes) {
    if (me.y >= b.h - 0.35) continue;
    const cx = clamp(me.x, b.x - b.w / 2, b.x + b.w / 2), cz = clamp(me.z, b.z - b.d / 2, b.z + b.d / 2);
    let dx = me.x - cx, dz = me.z - cz; const d2 = dx * dx + dz * dz;
    if (d2 >= RADIUS * RADIUS) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (RADIUS - d) / d; me.x += dx * k; me.z += dz * k; }
    else { // merkez kutunun içinde: en yakın kenara it
      const ox = b.w / 2 - Math.abs(me.x - b.x), oz = b.d / 2 - Math.abs(me.z - b.z);
      if (ox < oz) me.x += Math.sign(me.x - b.x || 1) * (ox + RADIUS); else me.z += Math.sign(me.z - b.z || 1) * (oz + RADIUS);
    }
  }
  me.x = clamp(me.x, -MAP.halfX + RADIUS, MAP.halfX - RADIUS); me.z = clamp(me.z, -MAP.halfZ + RADIUS, MAP.halfZ - RADIUS);
}
function stepMe(dt) {
  const canMove = me.alive && phase === 'live';
  if (me.flash > 0) me.flash -= dt;
  me.crouch = !!keys[binds.crouch] && me.alive;
  if (canMove) {
    const walk = keys[binds.walk] || keys.ShiftRight;
    const hasteMul = performance.now() < me.hasteUntil ? 1.4 : 1;
    const speed = (me.crouch ? 2.6 : walk ? 3.2 : 6.2) * hasteMul * (me.weapon === 'knife' ? 1.12 : 1) * (1 - (1 - (ADS_P[me.weapon]?.spd ?? 1)) * easeS(va.ads));
    const mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), mz = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
    const l = Math.hypot(mx, mz) || 1;
    const wx = (mx * Math.cos(me.yaw) + mz * Math.sin(me.yaw)) / l, wz = (-mx * Math.sin(me.yaw) + mz * Math.cos(me.yaw)) / l;
    const k = Math.min(1, (me.onGround ? 14 : 2.5) * dt);
    me.vx += (wx * speed - me.vx) * k; me.vz += (wz * speed - me.vz) * k;
    if (me.dashT > 0) { me.dashT -= dt; me.vx = me.dashX * 26; me.vz = me.dashZ * 26; }
    if (keys[binds.jump] && me.onGround) { me.vy = 7.6; me.onGround = false; }
  } else { me.vx *= 0.8; me.vz *= 0.8; }
  if (phase === 'buy') { me.vx = me.vz = 0; }
  // eksen ayrımlı hareket
  me.x += me.vx * dt; pushOut(); me.z += me.vz * dt; pushOut();
  me.vy -= 22 * dt; me.y += me.vy * dt;
  const g = groundAt(me.x, me.z, me.y);
  if (me.y <= g) { me.y = g; me.vy = 0; me.onGround = true; } else me.onGround = me.y - g < 0.02 && me.vy <= 0;
  me.crouchK = (me.crouchK || 0) + ((me.crouch ? 1 : 0) - (me.crouchK || 0)) * Math.min(1, dt * 12);
}
function tryShoot() {
  if (!locked || !me.alive || phase !== 'live' || buyOpen) return;
  const w = WEAPONS[me.weapon], now = performance.now();
  if (w.melee) { // karambit: sol tık kesik, sağ tık ağır darbe
    if ((!firing && !fireQueued && !heavyQueued) || now < me.nextFire) return;
    const heavy = heavyQueued; fireQueued = heavyQueued = false; me.nextFire = now + 60000 / (heavy ? w.heavyRpm : w.rpm);
    const d = new THREE.Vector3(); camera.getWorldDirection(d);
    send({ t: 'shoot', dx: d.x, dy: d.y, dz: d.z, alt: heavy ? 1 : 0 });
    va.inspect = 0; va.swing = 0.001; va.heavy = heavy; va.side = -va.side; sound.shot('knife', 0.8);
    return;
  }
  if (!firing && !fireQueued) return;
  if (!w.auto && !fireQueued) return;
  if (now < me.nextFire || me.reloading || me.ammo <= 0) { fireQueued = false; if (me.ammo <= 0 && firing && !me.reloading) send({ t: 'reload' }); return; }
  fireQueued = false; me.nextFire = now + 60000 / w.rpm;
  const d = new THREE.Vector3(); camera.getWorldDirection(d);
  send({ t: 'shoot', dx: d.x, dy: d.y, dz: d.z, ads: va.ads > 0.7 ? 1 : 0 });
  va.inspect = 0;
  me.ammo--; me.spray = now - (me.lastShotT || 0) < 60000 / w.rpm + 160 ? (me.spray || 0) + 1 : 0; me.lastShotT = now; { const [ky, kp] = sprayKick(me.weapon, me.spray), ar = 1 - 0.25 * easeS(va.ads); me.recoil += kp * ar; me.recoilYaw = (me.recoilYaw || 0) + ky * ar; } me.kick = 0.06;
  va.kickR = SNIPERS.has(me.weapon) ? 2.6 : w.pellets > 1 ? 2.2 : slotOf(me.weapon) === 2 ? 1.9 : 1.1;
  if (SNIPERS.has(me.weapon) || w.pellets > 1) me.kick = 0.09;
  muzzleFlash.visible = true; muzzleFlash.material.rotation = Math.random() * 6; setTimeout(() => muzzleFlash.visible = false, 45);
  muzzleLight.position.copy(view.localToWorld(new THREE.Vector3(0, 0.03, viewGun ? viewGun.userData.muzzle : -.4))); muzzleLight.intensity = 6;
  spawnShell(w.pellets > 1);
  sound.shot(me.weapon, 0.9);
}

// ================= Geri tepme deseni · darbe izleri · kan · yerdeki silahlar · mini harita · ölüm kamerası · maç sonu =================
// v: atış başı dikey tepme, h: yatay genlik, s: yatay salınımın başladığı atış
const SPRAY = {
  classic: { v: .016, h: .004, s: 3 }, ghost: { v: .015, h: .004, s: 3 }, sheriff: { v: .05, h: .01, s: 1 },
  spectre: { v: .009, h: .006, s: 5 }, phantom: { v: .011, h: .007, s: 6 }, vandal: { v: .013, h: .008, s: 5 }, ares: { v: .008, h: .009, s: 8 },
  bucky: { v: .05, h: 0, s: 9 }, judge: { v: .035, h: .006, s: 2 }, marshal: { v: .045, h: 0, s: 9 }, operator: { v: .06, h: 0, s: 9 },
};
function sprayKick(id, n) {
  const S = SPRAY[id] || { v: .015, h: .004, s: 4 };
  const v = S.v * (n < 8 ? 1 : 0.3);
  const h = n >= S.s ? S.h * Math.sign(Math.sin((n - S.s) * 0.55 + 0.6)) * (1 + (n % 3) * 0.2) : (Math.random() - .5) * S.h * .3;
  return [h, v];
}
const decalGeo = new THREE.CircleGeometry(0.04, 8), splatGeo = new THREE.CircleGeometry(0.22, 10), partGeo = new THREE.BoxGeometry(0.025, 0.025, 0.025);
const decalMat = new THREE.MeshBasicMaterial({ color: '#16120e', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
const splatMat = new THREE.MeshBasicMaterial({ color: '#6e0a0a', transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
const bloodMat = new THREE.MeshBasicMaterial({ color: '#a3121a' }), dustMat = new THREE.MeshBasicMaterial({ color: '#9a948a' });
const markTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.translate(32, 32); g.rotate(Math.PI / 4); g.shadowColor = '#ff4655'; g.shadowBlur = 12; g.fillStyle = '#ff4655'; g.fillRect(-13, -13, 26, 26); g.fillStyle = '#fff'; g.fillRect(-5, -5, 10, 10); return new THREE.CanvasTexture(c); })();
const pushDecal = (m) => { dyn.add(m); decals.push(m); if (decals.length > 90) dyn.remove(decals.shift()); };
function spawnPart(x, y, z, vx, vy, vz, mat, life) {
  const m = new THREE.Mesh(partGeo, mat); m.position.set(x, y, z); dyn.add(m);
  parts.push({ m, v: new THREE.Vector3(vx, vy, vz), t: life, max: life }); if (parts.length > 220) dyn.remove(parts.shift().m);
}
function surfaceNormal(x, y, z) {
  if (y < 0.04) return new THREE.Vector3(0, 1, 0);
  for (const b of MAP.boxes) {
    const ex = Math.abs(x - b.x) - b.w / 2, ez = Math.abs(z - b.z) - b.d / 2, ey = y - b.h;
    if (ex > .06 || ez > .06 || ey > .06) continue;
    if (Math.abs(ey) < .06 && ex < .02 && ez < .02) return new THREE.Vector3(0, 1, 0);
    if (Math.abs(ex) < .06 && ex >= ez - .001) return new THREE.Vector3(Math.sign(x - b.x) || 1, 0, 0);
    if (Math.abs(ez) < .06) return new THREE.Vector3(0, 0, Math.sign(z - b.z) || 1);
  }
  return null;
}
function addImpact(x, y, z) {
  const n = surfaceNormal(x, y, z); if (!n) return;
  const m = new THREE.Mesh(decalGeo, decalMat); m.position.set(x, y, z).addScaledVector(n, 0.004); m.lookAt(m.position.clone().add(n)); m.rotateZ(Math.random() * 6); pushDecal(m);
  for (let i = 0; i < 4; i++) spawnPart(x + n.x * .03, y + n.y * .03, z + n.z * .03, n.x * 1.5 + (Math.random() - .5) * 1.4, n.y * 1.5 + Math.random() * 1.2, n.z * 1.5 + (Math.random() - .5) * 1.4, dustMat, 0.4);
}
function bloodFx(m) {
  const p = players.get(m.v); if (!p || !p.init) return;
  const y = p.ry + (m.head ? 1.6 : 1.15) - (p.crouch ? 0.45 : 0);
  for (let i = 0; i < (m.head ? 14 : 8); i++) spawnPart(p.rx, y, p.rz, (Math.random() - .5) * 2.6, Math.random() * 2 + .5, (Math.random() - .5) * 2.6, bloodMat, 0.55);
  p.flinch = 1;
  if (Math.random() < 0.6) {
    const s = new THREE.Mesh(splatGeo, splatMat); s.rotation.x = -Math.PI / 2; s.rotation.z = Math.random() * 6; s.scale.setScalar(0.6 + Math.random() * 0.8);
    s.position.set(p.rx + (Math.random() - .5) * .8, groundAt(p.rx, p.rz, p.ry + .5) + 0.012, p.rz + (Math.random() - .5) * .8); pushDecal(s);
  }
}
function removeWall(i) { const w = walls[i]; dyn.remove(w.mesh); w.mesh.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); const j = MAP.boxes.indexOf(w.box); if (j >= 0) MAP.boxes.splice(j, 1); walls.splice(i, 1); }
function removeFire(i) { const f = fires[i]; dyn.remove(f.g); f.g.traverse((o) => { o.material?.dispose(); if (o.geometry && !o.isSprite) o.geometry.dispose(); }); fires.splice(i, 1); }
function onDrops(list) {
  const keep = new Set(list.map((d) => d.id));
  for (const [id, o] of dropObjs) if (!keep.has(id)) { dyn.remove(o.obj); dropObjs.delete(id); }
  for (const d of list) {
    if (dropObjs.has(d.id)) continue;
    const obj = new THREE.Group(), gun = buildGun(d.w); gun.rotation.z = Math.PI / 2; obj.add(gun);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.38, 24), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = -0.035; obj.add(ring);
    obj.position.set(d.x, groundAt(d.x, d.z, d.y + 0.5) + 0.05, d.z); obj.rotation.y = Math.random() * 6;
    dyn.add(obj); dropObjs.set(d.id, { obj, ring, ...d });
  }
}
function losClear(a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]); if (L < 0.01) return true;
  d[0] /= L; d[1] /= L; d[2] /= L;
  for (const bx of MAP.boxes) {
    const mn = [bx.x - bx.w / 2, 0, bx.z - bx.d / 2], mx = [bx.x + bx.w / 2, bx.h, bx.z + bx.d / 2];
    let t0 = 0, t1 = L, ok = true;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (a[i] < mn[i] || a[i] > mx[i]) { ok = false; break; } continue; }
      let u = (mn[i] - a[i]) / d[i], v = (mx[i] - a[i]) / d[i]; if (u > v) [u, v] = [v, u];
      t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) { ok = false; break; }
    }
    if (ok) return false;
  }
  return true;
}
let losAcc = 0, mmAcc = 0;
function drawMinimap(dt) {
  const cv = $('#minimap'); cv.style.display = cfg.minimap ? '' : 'none'; if (!cfg.minimap) return;
  mmAcc += dt; if (mmAcc < 0.05) return; mmAcc = 0;
  const c = cv.getContext('2d'), S = 2.6, R = 100, t = performance.now(), mine = TEAMS_MY();
  const cx = me.alive ? me.x : camera.position.x, cz = me.alive ? me.z : camera.position.z, yaw = me.alive ? me.yaw : camera.rotation.y;
  const W = (x, z) => [(x - cx) * S, (z - cz) * S];
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 200, 200);
  c.save(); c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.clip(); c.fillStyle = '#121821e6'; c.fillRect(0, 0, 200, 200);
  c.translate(R, R); c.rotate(yaw);
  c.strokeStyle = '#ffffff30'; c.lineWidth = 2; { const [x, z] = W(-MAP.halfX, -MAP.halfZ); c.strokeRect(x, z, MAP.halfX * 2 * S, MAP.halfZ * 2 * S); }
  for (const b of MAP.boxes) { const [x, z] = W(b.x - b.w / 2, b.z - b.d / 2); if (Math.abs(x) > 420 || Math.abs(z) > 420) continue; c.fillStyle = b.tmp ? '#5fb4ff' : b.h > 2 ? '#5b6676' : '#3a4350'; c.fillRect(x, z, b.w * S, b.d * S); }
  for (const sm of smokes) { const [x, z] = W(sm.mesh.position.x, sm.mesh.position.z); c.fillStyle = '#cfd5dbaa'; c.beginPath(); c.arc(x, z, 4 * S, 0, 7); c.fill(); }
  for (const f of fires) { const [x, z] = W(f.x, f.z); c.fillStyle = '#ff7a1a99'; c.beginPath(); c.arc(x, z, f.rad * S, 0, 7); c.fill(); }
  for (const d of dropObjs.values()) { const [x, z] = W(d.x, d.z); c.fillStyle = '#ffe08a'; c.fillRect(x - 2, z - 2, 4, 4); }
  for (const p of players.values()) {
    if (!p.init || !p.alive) continue;
    const mate = p.team === mine; if (!mate && !(p.revealUntil > t) && !(p.seenUntil > t)) continue;
    const [x, z] = W(p.rx, p.rz);
    c.fillStyle = mate ? '#53e3c4' : '#ff4655'; c.beginPath(); c.arc(x, z, 4.5, 0, 7); c.fill();
    c.strokeStyle = c.fillStyle; c.lineWidth = 2; c.beginPath(); c.moveTo(x, z); c.lineTo(x - Math.sin(p.ryaw) * 9, z - Math.cos(p.ryaw) * 9); c.stroke();
  }
  c.restore();
  c.fillStyle = '#ffffff18'; c.beginPath(); c.moveTo(R, R); c.arc(R, R, 70, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); c.closePath(); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(R, R - 7); c.lineTo(R + 5, R + 5); c.lineTo(R, R + 2); c.lineTo(R - 5, R + 5); c.closePath(); c.fill();
}
function updateWorldFx(dt) {
  const t = performance.now(), mine = TEAMS_MY();
  for (let i = walls.length - 1; i >= 0; i--) {
    const w = walls[i]; w.t -= dt; const k = Math.min(1, w.mesh.scale.y + dt * 6); w.mesh.scale.y = k; w.mesh.position.y = w.box.h / 2 * k;
    if (w.t < 0.4) w.mesh.material.opacity = 0.55 * Math.max(0, w.t / 0.4); if (w.t <= 0) removeWall(i);
  }
  for (let i = fires.length - 1; i >= 0; i--) {
    const f = fires[i]; f.t -= dt; const fade = clamp(f.t / 0.5, 0, 1);
    for (const sp of f.fl) { const q = Math.sin(t / 110 + sp.userData.ph); sp.scale.setScalar((0.8 + 0.4 * q) * fade); sp.position.y = 0.35 + 0.15 * q; }
    if (f.t <= 0) removeFire(i);
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i]; q.t -= dt; q.v.y -= 7 * dt; q.m.position.addScaledVector(q.v, dt);
    if (q.m.position.y < 0.01) { q.m.position.y = 0.01; q.v.set(0, 0, 0); }
    q.m.scale.setScalar(Math.max(0.05, q.t / q.max)); if (q.t <= 0) { dyn.remove(q.m); parts.splice(i, 1); }
  }
  let near = null, nd = 2.2;
  for (const d of dropObjs.values()) { d.ring.material.opacity = 0.35 + 0.25 * Math.sin(t / 250); const k = Math.hypot(d.x - me.x, d.z - me.z); if (me.alive && k < nd) { near = d; nd = k; } }
  const ph = $('#pickHint');
  if (near) { const has = slotOf(near.w) === 2 ? me.secondary : me.primary; ph.innerHTML = `<kbd>${KEYNAME(binds.drop)}</kbd> ${WEAPONS[near.w].name} ${has ? 'ile değiştir' : 'al'}`; }
  ph.classList.toggle('hidden', !near);
  losAcc += dt;
  if (losAcc > 0.2) {
    losAcc = 0; const eyes = [];
    if (me.alive) eyes.push([me.x, me.y + EYE, me.z]);
    for (const p of players.values()) if (p.alive && p.init && p.team === mine) eyes.push([p.rx, p.ry + EYE, p.rz]);
    for (const p of players.values()) {
      if (!p.alive || !p.init || p.team === mine) continue;
      const tg = [p.rx, p.ry + 1.3, p.rz];
      if (eyes.some((e) => Math.hypot(e[0] - tg[0], e[2] - tg[2]) < 60 && losClear(e, tg))) p.seenUntil = t + 500;
    }
  }
  for (const p of players.values()) {
    const show = p.alive && p.revealUntil > t;
    if (show && !p.mark) { p.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex, depthTest: false, transparent: true })); p.mark.scale.set(0.45, 0.45, 1); p.mark.position.y = 2.3; p.mark.renderOrder = 20; p.obj.add(p.mark); }
    if (p.mark) p.mark.visible = show;
  }
  drawMinimap(dt);
}
function showDeathCard(m) {
  const ki = playerInfo(m.k), ag = AGENTS[ki?.agent];
  const wn = WEAPONS[m.w]?.name || ({ blast: 'Şok Dalgası', molly: 'Molotof' }[m.w] || m.w);
  $('#deathCard').innerHTML = `<small>SENİ ÖLDÜREN</small><div><b style="color:${ag?.color || '#fff'}">${esc(ki?.name || '?')}</b> <span class="muted">${ag?.name || ''}</span></div>
    <div class="dcRow"><span>${esc(wn)}${m.head ? ' · KAFADAN' : ''}</span><span>Kalan can <span class="hpv">${m.khp ?? '?'}</span></span>${m.kar ? `<span>Zırh ${Math.round(m.kar)}</span>` : ''}</div>`;
  $('#deathCard').classList.remove('hidden');
}
function showMatchEnd(stats, won) {
  const rows = stats.map((s) => ({ ...s, info: playerInfo(s.id) })).sort((a, b) => b.k - a.k || b.dmg - a.dmg);
  const mvp = rows[0], ma = AGENTS[mvp?.info?.agent];
  $('#matchEnd').innerHTML = `<h1 class="${won ? 'win' : 'lose'}">${won ? 'ZAFER' : 'YENİLGİ'}</h1><div class="meScore">${score[0]} – ${score[1]}</div>
    ${mvp ? `<div class="mvp"><small>MAÇIN OYUNCUSU</small><b style="color:${ma?.color || '#fff'}">${esc(mvp.info?.name || '?')}</b><span>${ma?.name || ''} · ${mvp.k} leş · ${mvp.dmg} hasar</span></div>` : ''}
    <table><tr><th>Oyuncu</th><th>Ajan</th><th>K</th><th>D</th><th>K/D</th><th>Hasar</th><th>İsabet</th><th>Kafa</th></tr>
    ${rows.map((r) => `<tr class="${r.id === myId ? 'me' : ''}"><td style="border-left:3px solid ${TEAMS[r.info?.team ?? 0].color}">${esc(r.info?.name || '?')}</td><td>${AGENTS[r.info?.agent]?.name || ''}</td><td>${r.k}</td><td>${r.d}</td><td>${(r.k / Math.max(1, r.d)).toFixed(2)}</td><td>${r.dmg}</td><td>%${r.acc}</td><td>%${r.hs}</td></tr>`).join('')}</table>
    <small class="muted">Ana menüye dönülüyor…</small>`;
  $('#matchEnd').classList.remove('hidden');
}

// ================= Ana döngü =================
const clock = new THREE.Clock(); let sendAcc = 0, bob = 0;
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

function updateRemote(p, dt) {
  if (!p.init) return;
  const k = Math.min(1, 14 * dt);
  p.rx += (p.x - p.rx) * k; p.ry += (p.y - p.ry) * k; p.rz += (p.z - p.rz) * k; p.ryaw = angLerp(p.ryaw, p.yaw, k);
  const o = p.obj; o.position.set(p.rx, p.ry, p.rz);
  o.userData.facing.rotation.y = p.ryaw + Math.PI;
  o.visible = true;
  if (p.gunId !== p.w) {
    if (p.gun) {
      if (p.gun.parent) p.gun.parent.remove(p.gun);
    }
    p.gun = buildGun(p.w);
    attachGun(o, p.gun);
    p.gunId = p.w;
  }
  if (p.gun) p.gun.visible = p.alive;
  const pivot = o.userData.pivot;
  if (!p.alive) {
    p.deadT = Math.min(1, (p.deadT || 0.001) + dt * 3); pivot.rotation.x = -Math.PI / 2 * p.deadT; o.children.forEach((c) => { if (c.isSprite) c.visible = false; });
  } else { pivot.rotation.x = -(p.flinch || 0) * 0.2; p.flinch = Math.max(0, (p.flinch || 0) - dt * 6); p.ck = (p.ck || 0) + ((p.crouch ? 1 : 0) - (p.ck || 0)) * Math.min(1, dt * 10); pivot.scale.set(1, 1 - p.ck * 0.3, 1); o.children.forEach((c) => { if (c.isSprite) c.visible = true; }); }
  const a = o.userData.actions; const mixer = o.userData.mixer;
  if (mixer && p.alive) {
    const spd = p.speed || 0;
    const runW = clamp((spd - 2.2) / 4.5, 0, 1);
    const walkW = spd > 0.4 && runW < 0.9 ? clamp(spd / 3.5, 0, 1) * (1 - runW) : 0;
    const idleW = Math.max(0, 1 - runW - walkW);
    if (a.idle) a.idle.setEffectiveWeight(idleW);
    if (a.walk) a.walk.setEffectiveWeight(walkW);
    if (a.run) { a.run.setEffectiveWeight(runW); a.run.timeScale = clamp(spd / 6.5, 0.65, 1.5); }
    mixer.update(dt);
  }
}

// birinci şahıs: çekme, nişan alma (sağ tık), sway/yürüme, şarjör, kesik/ağır darbe, F ile inceleme
const SNIPERS = new Set(['operator', 'marshal']);
// sağ tık nişan: silah ortaya gelir, modelin kendi nişangahıyla hafif yakınlaştırma; keskin nişancıda tam dürbün
const adsKind = (id) => SNIPERS.has(id) ? 'sniper' : WEAPONS[id]?.pellets > 1 ? 'shotgun' : slotOf(id) === 2 ? 'pistol' : 'rifle';
// silah başına nişan profili — t: nişan alma süresi (sn) · fov: normal FOV çarpanı (küçük = daha yakın) · zoom: dürbün FOV kademeleri
// d: göz ile arka nişangah arası (m) · spd: nişanken hareket hızı çarpanı · ret: nişangah türü
const ADS_P = {
  classic: { t: .13, fov: .90, d: .27, spd: .92, ret: 'dot' },
  ghost:   { t: .13, fov: .90, d: .27, spd: .92, ret: 'dot' },
  sheriff: { t: .17, fov: .86, d: .27, spd: .90, ret: 'ring' },
  bucky:   { t: .20, fov: .93, d: .40, pose: .55, spd: .85, ret: 'bead' },
  judge:   { t: .20, fov: .93, d: .40, pose: .55, spd: .85, ret: 'bead' },
  spectre: { t: .15, fov: .80, d: .30, spd: .88, ret: 'dot' },
  phantom: { t: .18, fov: .74, d: .30, spd: .82, ret: 'holo' },
  vandal:  { t: .19, fov: .76, d: .30, spd: .82, ret: 'chev' },
  ares:    { t: .22, fov: .72, d: .30, spd: .78, ret: 'holo' },
  marshal: { t: .25, zoom: [34, 20], d: .26, spd: .60, ret: 'scope' },
  operator:{ t: .30, zoom: [30, 14], d: .26, spd: .50, ret: 'scope' },
};
ADS_P.knife = { t: .2, fov: 1, d: .3, spd: 1 };
const RETICLES = {
  dot: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="3" fill="currentColor"/></svg>',
  ring: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="12" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="32" cy="32" r="1.8" fill="currentColor"/></svg>',
  holo: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="17" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M32 12v5M32 47v5M12 32h5M47 32h5" stroke="currentColor" stroke-width="1.5"/><circle cx="32" cy="32" r="1.9" fill="currentColor"/></svg>',
  chev: '<svg viewBox="0 0 64 64"><path d="M32 32 41 47h-4.5L32 39.5 27.5 47H23Z" fill="currentColor"/><circle cx="32" cy="32" r="1.6" fill="currentColor"/></svg>',
  bead: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="32" cy="32" r="1.3" fill="currentColor"/></svg>',
};
// silah modelinin gerçek nişangah noktasını bul: gövdenin orta-arka bölümündeki en yüksek, merkez hattındaki nokta
function findSight(root) {
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), mm = new THREE.Matrix4(), v = new THREE.Vector3(), pts = [];
  let z0 = 1e9, z1 = -1e9;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.position) return;
    mm.multiplyMatrices(inv, o.matrixWorld); const a = o.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(mm); pts.push(v.x, v.y, v.z); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z); }
  });
  // yükseklik: gövde merkez hattındaki köşelerin %92'lik dilimi (tek bir ince çıkıntı silahı ekran dışına kaydırmasın) · uzaklık: arka uçtan sabit oranda içeri
  const L = z1 - z0, ys = [];
  for (let i = 0; i < pts.length; i += 3) {
    if (Math.abs(pts[i]) > 0.03 || pts[i + 2] < z0 + L * 0.05 || pts[i + 2] > z1 - L * 0.25) continue;
    ys.push(pts[i + 1]);
  }
  ys.sort((a, b) => a - b);
  return { y: ys.length ? clamp(ys[Math.floor(ys.length * 0.92)], 0.01, 0.14) : 0.06, z: z1 - L * 0.38 };
}
// dürbün: tekerlekle yakınlaştırma kademesi; kademe değiştiyse true döner
function zoomScope(dir) {
  const P = ADS_P[viewGunId]; if (!P?.zoom || va.ads < 0.6) return false;
  const n = clamp(va.zoomIdx + dir, 0, P.zoom.length - 1); if (n !== va.zoomIdx) { va.zoomIdx = n; sound.zoom(); }
  return true;
}
const easeS = (t) => t * t * (3 - 2 * t);
function keyed(K, t) {
  let i = 0; while (i < K.length - 2 && t > K[i + 1][0]) i++;
  const a = K[i], b = K[i + 1], u = easeS(clamp((t - a[0]) / (b[0] - a[0]), 0, 1));
  return a.map((v, j) => v + (b[j] - v) * u);
}
// [t, px, py, pz, rx, ry, rz]
const INSPECT_GUN = [[0, 0, 0, 0, 0, 0, 0], [.16, -.12, .05, .06, .12, .7, .5], [.42, -.13, .06, .07, .18, .8, .55], [.56, -.08, .06, .05, .3, -.3, -.75], [.8, -.07, .05, .04, .26, -.4, -.8], [1, 0, 0, 0, 0, 0, 0]];
const INSPECT_PISTOL = [[0, 0, 0, 0, 0, 0, 0], [.16, -.1, .05, .06, .1, 1.05, .35], [.42, -.11, .06, .06, .15, 1.15, .4], [.56, -.06, .05, .05, .3, -.55, -.85], [.8, -.05, .04, .04, .28, -.65, -.9], [1, 0, 0, 0, 0, 0, 0]];
const RELOAD_K = [[0, 0, 0, 0, 0, 0, 0], [.18, -.03, -.04, .03, .22, .18, .55], [.78, -.03, -.045, .03, .26, .18, .6], [.9, 0, .012, 0, -.06, 0, .05], [1, 0, 0, 0, 0, 0, 0]];
const shells = [], shellGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.024, 6), shellGeoBig = new THREE.CylinderGeometry(0.009, 0.009, 0.034, 8);
const shellMat = new THREE.MeshStandardMaterial({ color: '#d4a64a', metalness: 0.85, roughness: 0.3 }), shellMatRed = new THREE.MeshStandardMaterial({ color: '#b3302a', metalness: 0.3, roughness: 0.5 });
function spawnShell(big) {
  if (!viewGun) return;
  const m = new THREE.Mesh(big ? shellGeoBig : shellGeo, big ? shellMatRed : shellMat);
  m.position.copy(view.localToWorld(new THREE.Vector3(0.03, (viewGun.userData.top || 0.06) * 0.5, 0)));
  const r = new THREE.Vector3(Math.cos(me.yaw), 0, -Math.sin(me.yaw)), f = new THREE.Vector3(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
  const v = r.multiplyScalar(1.6 + Math.random() * 0.6).addScaledVector(f, -0.3 + Math.random() * 0.3); v.y = 1.5 + Math.random() * 0.6; v.x += me.vx; v.z += me.vz;
  m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  dyn.add(m); shells.push({ m, v, t: 1.6, bounced: 0, spin: 10 + Math.random() * 15 });
  if (shells.length > 40) { const o = shells.shift(); dyn.remove(o.m); }
}
function updateShells(dt) {
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i]; s.t -= dt; s.v.y -= 9.8 * dt; s.m.position.addScaledVector(s.v, dt);
    s.m.rotation.x += s.spin * dt; s.m.rotation.z += s.spin * 0.6 * dt;
    const g = groundAt(s.m.position.x, s.m.position.z, s.m.position.y);
    if (s.m.position.y < g + 0.006) { s.m.position.y = g + 0.006; if (s.bounced++ < 2) { s.v.y = Math.abs(s.v.y) * 0.35; s.v.x *= 0.5; s.v.z *= 0.5; s.spin *= 0.5; } else { s.v.set(0, 0, 0); s.spin = 0; } }
    if (s.t <= 0) { dyn.remove(s.m); shells.splice(i, 1); }
  }
}
let roundKills = 0, killTimer = 0;
function killConfirm(head) {
  roundKills++; sound.kill(roundKills, head);
  const k = $('#killIcon'); k.innerHTML = `<i></i><b>${roundKills > 1 ? '×' + roundKills : ''}</b>${head ? '<small>KAFA</small>' : ''}`;
  k.className = ''; void k.offsetWidth; k.className = 'on' + (head ? ' head' : ''); clearTimeout(killTimer); killTimer = setTimeout(() => k.className = '', 1400);
}
// dürbünde nefes ve el titremesi: Shift ile nefes tutulur (≈3 sn), bitince titreme artar. Kamera yönüne eklendiği için nişangah ile atış aynı yere gider.
const swayS = { x: 0, y: 0 };
function scopeSway(dt) {
  const P = ADS_P[viewGunId], sc = !!P?.zoom && va.ads > 0.5 && me.alive;
  if (me.breath === undefined) { me.breath = 1; me.winded = false; }
  const hold = sc && (keys[binds.walk] || keys.ShiftRight) && !me.winded && me.breath > 0;
  if (hold) { me.breath = Math.max(0, me.breath - dt / 3); if (me.breath <= 0) me.winded = true; }
  else { me.breath = Math.min(1, me.breath + dt / (sc ? 5 : 2.5)); if (me.winded && me.breath > 0.35) me.winded = false; }
  const bar = $('#scopeBreath');
  if (sc) {
    const t = performance.now() / 1000, mv = Math.hypot(me.vx, me.vz), amp = 0.0024 * easeS(va.ads) * (hold ? 0.12 : me.winded ? 1.7 : 1) * (1 + mv * 0.5) * (me.crouch ? 0.6 : 1);
    swayS.x = (Math.sin(t * 1.3) + Math.sin(t * 2.9 + 1)) * 0.5 * amp; swayS.y = (Math.sin(t * 1.7 + 2) + Math.sin(t * 3.3) * 0.6 + Math.sin(t * 0.9) * 0.7) * 0.4 * amp;
    bar.firstElementChild.style.setProperty('--bw', (me.breath * 100).toFixed(0) + '%'); bar.classList.toggle('low', me.winded);
    const zf = Math.tan(cfg.fov * Math.PI / 360) / Math.tan(P.zoom[va.zoomIdx || 0] * Math.PI / 360), txt = zf.toFixed(1).replace('.', ',') + '×';
    const zl = $('#scopeZoom'); if (zl.textContent !== txt) zl.textContent = txt;
  } else { swayS.x = swayS.y = 0; }
  return swayS;
}
function animView(dt) {
  const knife = viewGunId === 'knife', spin = viewGun?.userData.spin, ud = viewGun?.userData || {}, L = viewHands?.userData.left;
  va.draw = Math.min(1, va.draw + dt / (knife ? 0.55 : 0.4)); const de = 1 - Math.pow(1 - va.draw, 3);
  const adsOn = me.ads && !knife && !me.reloading && me.alive && va.draw > 0.6;
  const P = ADS_P[viewGunId] || ADS_P.classic, kind = adsKind(viewGunId);
  va.ads = clamp(va.ads + (adsOn ? 1 : -1) * dt / (adsOn ? P.t : P.t * 0.75), 0, 1); const A = easeS(va.ads), free = 1 - A * 0.85;
  if ((va.ads > 0.5) !== !!va.adsEng) { va.adsEng = va.ads > 0.5; sound.ads(va.adsEng, kind === 'sniper'); }
  const dk = Math.min(1, dt * 9);
  va.sx += (clamp(-va.mx * 0.0011, -0.1, 0.1) - va.sx) * dk; va.sy += (clamp(-va.my * 0.0011, -0.08, 0.08) - va.sy) * dk; va.mx = va.my = 0;
  const lat = me.vx * Math.cos(me.yaw) - me.vz * Math.sin(me.yaw), sp = Math.hypot(me.vx, me.vz), bm = Math.min(1, sp / 5);
  va.roll += (clamp(-lat * 0.012, -0.07, 0.07) - va.roll) * Math.min(1, dt * 6); va.land = Math.max(0, va.land - dt * 3.5);
  const tt = performance.now() / 1000;
  let px = 0.24, py = -0.22, pz = -0.5, rx = 0, ry = 0, rz = 0;
  if (knife) { const K = [0.18, -0.17, -0.45, 0.6, 0.7, -0.4]; px = K[0]; py = K[1]; pz = K[2]; rx = K[3]; ry = K[4]; rz = K[5]; }
  const bk = bm * (cfg.bob ? 1 : 0.2); px += Math.sin(bob) * 0.01 * bk; py += (Math.abs(Math.cos(bob)) * 0.01 - 0.005) * bk;
  py += Math.sin(tt * 1.7) * 0.0025; rx += Math.sin(tt * 1.7) * 0.006;
  if (!me.onGround) py += clamp(-me.vy * 0.004, -0.03, 0.03);
  py -= va.land * 0.05; rx += va.land * 0.1;
  if (A > 0) { const Ap = A * (P.pose ?? 1), ad = ud.ads || { y: -0.08, z: -0.42 }; px += (0 - px) * Ap; py += (ad.y - py) * Ap; pz += (ad.z - pz) * Ap; rx *= 1 - Ap; ry *= 1 - Ap; rz *= 1 - Ap; }
  ry += va.sx * free; rx += va.sy * free; rz += (va.roll + va.sx * 0.6) * free; px += va.sx * 0.04 * free; py += va.sy * 0.03 * free;
  py -= me.kick * 0.25 * (1 - A * 0.6); pz += me.kick * (1.1 - A * 0.5); rx += me.kick * va.kickR * (1 - A * 0.5);
  py -= (1 - de) * 0.2; rx -= (1 - de) * (knife ? 0.25 : 0.9);
  if (spin) spin.rotation.x = -(1 - de) * Math.PI * 2;
  if (L) L.position.set(0, 0, 0);
  if (va.swing > 0) {
    va.swing += dt / (va.heavy ? 0.55 : 0.3); const k = Math.sin(Math.min(1, va.swing) * Math.PI);
    if (va.heavy) { pz -= 0.24 * k; py += 0.05 * k; rx -= 0.9 * k; }
    else { px -= 0.2 * k * va.side; rz += 1.1 * k * va.side; ry += 0.5 * k * va.side; rx -= 0.3 * k; }
    if (va.swing >= 1) va.swing = 0;
  }
  if (va.reload > 0) {
    va.reload += dt / va.reloadDur; if (!me.reloading && va.reload < 0.85) va.reload = 0.85;
    const t = Math.min(1, va.reload), k = keyed(RELOAD_K, t);
    px += k[1]; py += k[2]; pz += k[3]; rx += k[4]; ry += k[5]; rz += k[6];
    const lk = t < 0.22 ? 0 : t < 0.38 ? easeS((t - 0.22) / 0.16) : t < 0.6 ? 1 : t < 0.76 ? 1 - easeS((t - 0.6) / 0.16) : 0;
    if (L) L.position.set(-0.02 * lk, -0.22 * lk, 0.1 * lk);
    if (va.reload >= 1) va.reload = 0;
  }
  if (va.inspect > 0) {
    if (knife) {
      va.inspect += dt / 2.2; const t = Math.min(1, va.inspect), k = Math.sin(t * Math.PI), u = clamp((t - 0.3) / 0.5, 0, 1);
      px -= 0.08 * k; py += 0.06 * k; ry -= 0.9 * k; rz += 0.4 * k;
      if (spin) spin.rotation.x = -Math.PI * 4 * u * u * (3 - 2 * u);
    } else {
      const pistol = slotOf(viewGunId) === 2; va.inspect += dt / (pistol ? 2.6 : 3.2);
      const t = Math.min(1, va.inspect), k = keyed(pistol ? INSPECT_PISTOL : INSPECT_GUN, t);
      px += k[1]; py += k[2]; pz += k[3]; rx += k[4]; ry += k[5]; rz += k[6];
      if (pistol && L) { const d = t < 0.1 ? easeS(t / 0.1) : t > 0.9 ? easeS((1 - t) / 0.1) : 1; L.position.set(-0.06 * d, -0.3 * d, 0.08 * d); }
      if ((t > 0.14 && t - dt / 3 <= 0.14) || (t > 0.54 && t - dt / 3 <= 0.54)) sound.inspect();
    }
    if (va.inspect >= 1) va.inspect = 0;
  }
  view.position.set(px, py, pz); view.rotation.set(rx, ry, rz);
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 120);
  // ekran katmanları: dürbün (keskin nişancı) · kırmızı nokta / holografik retikül (diğerleri) · kenar kararması
  const so = kind === 'sniper' ? clamp((va.ads - 0.55) / 0.35, 0, 1) : 0, scEl = $('#scope');
  view.visible = view.visible && !(kind === 'sniper' && va.ads > 0.85);
  $('#game').classList.toggle('scoped', so > 0.3); scEl.classList.toggle('hidden', so <= 0); if (so > 0) { scEl.style.setProperty('--so', so.toFixed(3)); scEl.style.setProperty('--ss', (1.2 - 0.2 * so).toFixed(3)); }
  const sightOn = kind !== 'sniper' && A > 0.5, sEl = $('#sight');
  sEl.classList.toggle('hidden', !sightOn); if (sightOn) sEl.style.opacity = clamp((A - 0.5) / 0.4, 0, 1).toFixed(2);
  $('#adsVig').style.opacity = kind === 'sniper' ? 0 : (A * 0.9).toFixed(2);
  $('#crosshair').style.visibility = A > 0.5 ? 'hidden' : '';
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!inGame) return;
  const wasAir = !me.onGround, fallV = me.vy;
  stepMe(dt); tryShoot();
  if (wasAir && me.onGround && fallV < -3) { va.land = clamp(-fallV / 12, 0.2, 1); sound.step(0.8); }
  if (me.reloading && !va.reload && viewGunId !== 'knife') { va.reload = 0.001; va.reloadDur = WEAPONS[me.weapon]?.reload || 1.5; va.inspect = 0; me.ads = false; }
  else if (rmbHeld && !cfg.adsToggle && !me.ads && !me.reloading && me.alive && locked && viewGunId !== 'knife' && !va.inspect) me.ads = true; // şarjör bitince sağ tık hâlâ basılıysa tekrar nişan al
  sendAcc += dt; if (sendAcc >= 0.05) { sendAcc = 0; if (me.alive) send({ t: 'state', x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch, c: me.crouch ? 1 : 0 }); }

  { const firingNow = performance.now() - (me.lastShotT || 0) < 220, rk = firingNow ? 1.2 : 4.5; me.recoil = Math.max(0, me.recoil - (firingNow ? 0 : dt * 0.18) - me.recoil * dt * rk); me.recoilYaw = (me.recoilYaw || 0) * Math.max(0, 1 - dt * rk); } me.kick = Math.max(0, me.kick - dt * 0.5); me.punch = Math.max(0, (me.punch || 0) - dt * 0.3);
  const sp = Math.hypot(me.vx, me.vz); bob += dt * sp * 1.7;
  const stepI = Math.floor(bob / Math.PI); if (stepI !== va.step) { va.step = stepI; if (me.alive && me.onGround && sp > 4.2) sound.step(0.45); }
  const gap = Math.round(Math.min(16, sp * 1.4 + me.recoil * 140 + (me.onGround ? 0 : 9))); if (gap !== va.gap) { va.gap = gap; $('#crosshair').style.setProperty('--g', gap + 'px'); }

  // kamera (hayattaysa kendi gözünden, ölüyse takım arkadaşından)
  let spec = null;
  if (!me.alive) {
    const mates = [...players.values()].filter((p) => p.alive && p.team === TEAMS_MY() && p.init);
    if (mates.length) spec = mates[((spectateIdx % mates.length) + mates.length) % mates.length];
  }
  $('#spectate').classList.toggle('hidden', me.alive); if (!me.alive) $('#spectate').textContent = spec ? `İzleniyor: ${playerInfo(spec.id)?.name} · tıkla: sonraki` : 'Takımın elendi';
  const dc = !me.alive && me.deathCam && me.deathCam.t > 0 ? me.deathCam : null;
  if (dc) { // ölüm kamerası: seni öldürene döner
    dc.t -= dt; const k = players.get(dc.id);
    camera.position.set(me.x, me.y + EYE + 0.3, me.z);
    if (k) { const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camera.position, new THREE.Vector3(k.rx, k.ry + 1.3, k.rz), camera.up)); camera.quaternion.slerp(q, Math.min(1, dt * 5)); }
    if (dc.t <= 0) $('#deathCard').classList.add('hidden');
  } else if (spec) { camera.position.set(spec.rx, spec.ry + EYE, spec.rz); camera.rotation.set(spec.pitch, spec.ryaw, 0); }
  else if (me.alive) { const sw = scopeSway(dt); camera.position.set(me.x, me.y + EYE - (me.crouchK || 0) * 0.55 + Math.sin(bob * 2) * 0.012 * (me.onGround ? 1 : 0), me.z); camera.rotation.set(clamp(me.pitch + me.recoil + (me.punch || 0) + sw.y, -1.55, 1.55), me.yaw + (me.recoilYaw || 0) + sw.x, 0); }
  else { camera.position.set(me.x, me.y + 2.2, me.z); camera.rotation.set(-0.5, me.yaw, 0); }
  view.visible = (me.alive || !!spec) && !dc;
  animView(dt);
  { const P = ADS_P[viewGunId] || ADS_P.classic, adsF = P.zoom ? P.zoom[va.zoomIdx || 0] : cfg.fov * P.fov, fov = (cfg.fov + (performance.now() < me.hasteUntil ? 6 : 0)) * (1 - easeS(va.ads)) + adsF * easeS(va.ads); if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 22)); camera.updateProjectionMatrix(); } }

  for (const p of players.values()) {
    updateRemote(p, dt); p.obj.userData.facing.visible = !(spec && spec === p);
    if (p.alive && p.init && p.speed > 4.2) { // uzak oyuncu ayak sesleri (yöne göre stereo)
      p.stepAcc = (p.stepAcc || 0) + p.speed * dt;
      if (p.stepAcc > 2.3) { p.stepAcc = 0; const dx = p.rx - camera.position.x, dz = p.rz - camera.position.z, d = Math.hypot(dx, dz); if (d < 30 && d > 0.5) sound.step(0.6 * (1 - d / 30) ** 1.5, clamp((dx * Math.cos(me.yaw) - dz * Math.sin(me.yaw)) / d, -1, 1)); }
    }
  }
  updateShells(dt); updateWorldFx(dt);

  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i]; t.t -= dt;
    if (t.grow) { t.line.scale.addScalar(t.grow * dt); if (t.line.material) t.line.material.opacity = Math.max(0, t.t * 2.5); }
    if (t.t <= 0) { dyn.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); tracers.splice(i, 1); }
  }
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i]; s.t -= dt;
    const f = Math.min(1, s.t / 1.5, (s.max - s.t) / 0.6); s.mesh.children.forEach((c) => { c.material.opacity = 0.93 * f; });
    if (s.t <= 0) { dyn.remove(s.mesh); smokes.splice(i, 1); }
  }
  camera.updateMatrixWorld(); vmCam.position.copy(camera.position); vmCam.quaternion.copy(camera.quaternion);
  const vf = 68 - easeS(va.ads) * 14; if (Math.abs(vmCam.fov - vf) > 0.05 || vmCam.aspect !== camera.aspect) { vmCam.fov = vf; vmCam.aspect = camera.aspect; vmCam.updateProjectionMatrix(); }
  renderer.autoClear = false; renderer.clear(); renderer.render(scene, camera);
  const bg = scene.background, fog = scene.fog; scene.background = null; scene.fog = null; renderer.clearDepth(); renderer.render(scene, vmCam); scene.background = bg; scene.fog = fog;
}

// ================= Ana menü 3B sahnesi =================
let menuActive = true, mn = null, menuPane = 'play', armId = localStorage.getItem('zl_arm') || 'vandal';
const dimModel = (root, k) => root.traverse((o) => { if (o.isMesh && o.material) { o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.color && m.color.multiplyScalar(k)); } });
function initMenu() {
  const canvas = $('#menuBg');
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const sc = new THREE.Scene(); sc.background = new THREE.Color('#0a1118'); sc.fog = new THREE.Fog('#0a1118', 12, 46);
  const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 90);
  sc.add(new THREE.HemisphereLight(0x8fa8c4, 0x101820, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 2.3); key.position.set(3, 6, 8); sc.add(key);
  const rimA = new THREE.DirectionalLight(0xff4655, 3.6); rimA.position.set(-6, 3, -4); sc.add(rimA);
  const rimB = new THREE.DirectionalLight(0x53e3c4, 2.6); rimB.position.set(9, 3, -3); sc.add(rimB);
  const grid = new THREE.GridHelper(80, 80, 0x22364a, 0x111c28); grid.position.y = 0.001; sc.add(grid);
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.18, 6), new THREE.MeshStandardMaterial({ color: '#16222d', roughness: .6, metalness: .4 })); stage.position.set(3.4, -0.09, 0); stage.rotation.y = Math.PI / 6; sc.add(stage);
  const ringA = new THREE.Mesh(new THREE.RingGeometry(3.1, 3.2, 6), new THREE.MeshBasicMaterial({ color: 0xff4655, side: THREE.DoubleSide })); ringA.rotation.x = -Math.PI / 2; ringA.position.set(3.4, 0.012, 0); sc.add(ringA);
  const ringB = new THREE.Mesh(new THREE.RingGeometry(2.5, 2.54, 6), new THREE.MeshBasicMaterial({ color: 0xece8e1, side: THREE.DoubleSide, transparent: true, opacity: .6 })); ringB.rotation.x = -Math.PI / 2; ringB.position.set(3.4, 0.014, 0); sc.add(ringB);
  // arka plan: Haven esintili siluet (pagoda + çatı) ve dönen kristal
  const city = new THREE.Group(); sc.add(city);
  const roof = new THREE.ConeGeometry(1, 1, 4);
  for (let i = 0; i < 18; i++) {
    const w = 1.6 + Math.random() * 2.4, h = 1.4 + Math.random() * 4.5, x = -14 + i * 2.1 + Math.random(), z = -13 - Math.random() * 9;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({ color: '#101b26', roughness: .9 })); b.position.set(x, h / 2, z); city.add(b);
    const rf = new THREE.Mesh(roof, new THREE.MeshStandardMaterial({ color: '#1a2735', roughness: .8 })); rf.scale.set(w * .85, 1.2, w * .85); rf.rotation.y = Math.PI / 4; rf.position.set(x, h + .6, z); city.add(rf);
    const e = new THREE.Mesh(new THREE.BoxGeometry(w + .04, .07, w + .04), new THREE.MeshBasicMaterial({ color: x < 3 ? 0xff4655 : 0x53e3c4 })); e.position.set(x, h, z); city.add(e);
  }
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(3.2, 0), new THREE.MeshBasicMaterial({ color: 0xff4655, wireframe: true, transparent: true, opacity: .45 })); crystal.position.set(3.4, 2.4, -3.6); crystal.scale.y = 1.5; sc.add(crystal);
  const crystal2 = new THREE.Mesh(new THREE.OctahedronGeometry(1.9, 0), new THREE.MeshBasicMaterial({ color: 0xece8e1, wireframe: true, transparent: true, opacity: .25 })); crystal2.position.copy(crystal.position); crystal2.scale.y = 1.5; sc.add(crystal2);
  const N = 240, pos = new Float32Array(N * 3), vel = [];
  for (let i = 0; i < N; i++) { pos[i * 3] = -8 + Math.random() * 20; pos[i * 3 + 1] = Math.random() * 7; pos[i * 3 + 2] = -6 + Math.random() * 12; vel.push(0.1 + Math.random() * 0.25); }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xff8a94, size: 0.05, transparent: true, opacity: .7, depthWrite: false })); sc.add(dust);
  const agents = new THREE.Group(); sc.add(agents);
  const arm = new THREE.Group(); arm.visible = false; sc.add(arm);
  mn = { r, sc, cam, agents, arm, dust, vel, ringA, ringB, crystal, crystal2, mx: 0, my: 0, t: 0, hero: null, side: [], pop: 0 };
  addEventListener('mousemove', (e) => { mn.mx = e.clientX / innerWidth - 0.5; mn.my = e.clientY / innerHeight - 0.5; });
  menuView(menuPane);
}
// seçili ajanı seçili silahla sahnenin ortasına koyar; diğer ikisi arkada loş durur
function setHero() {
  if (!mn || !models[agentPick]) return;
  mn.agents.clear(); mn.side = [];
  const prep = (av, x, z, yaw, gun, scale) => {
    av.position.set(x, 0, z); av.scale.setScalar(scale); av.userData.facing.rotation.y = yaw;
    attachGun(av, applySkin(buildGun(gun), skinOf(gun)));
    const a = av.userData.actions; if (a.idle) a.idle.setEffectiveWeight(1); if (a.run) a.run.setEffectiveWeight(0);
    av.userData.mixer?.setTime(Math.random() * 2); mn.agents.add(av); return av;
  };
  const others = Object.keys(AGENTS).filter((id) => id !== agentPick && models[id]);
  const slots = [[0.6, -2.2, -0.15, 'spectre'], [6.2, -2.2, -0.5, 'sheriff']];
  others.forEach((id, i) => { const s = slots[i]; if (!s) return; const av = prep(makeAvatar(id), s[0], s[1], s[2], s[3], 0.95); dimModel(av, 0.42); mn.side.push({ av, base: s[2], ph: i * 2 }); });
  const hero = prep(makeAvatar(agentPick), 3.4, 0.7, -0.1, weaponPick, 1.12); mn.hero = { av: hero, base: -0.1 }; mn.pop = 1;
  const col = new THREE.Color(AGENTS[agentPick].color); mn.ringB.material.color.copy(col);
}
function menuView(pane) {
  menuPane = pane; if (!mn) return;
  const arsenal = pane === 'arsenal';
  mn.agents.visible = !arsenal; mn.arm.visible = arsenal;
  if (arsenal) showArsenal(armId);
}
function showArsenal(id) {
  armId = id; localStorage.setItem('zl_arm', id);
  if (mn) {
    mn.arm.clear();
    const g = applySkin(buildGun(id), skinOf(id)), box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    const holder = new THREE.Group(); g.position.set(-c.x, -c.y, -c.z); holder.add(g);
    const k = 4.8 / Math.max(sz.z, sz.x, 0.3); holder.scale.setScalar(k); holder.position.set(3.4, 1.4, 0); holder.rotation.y = -1.2;
    mn.arm.add(holder); mn.arm.userData.holder = holder;
  }
  const list = $('#armList'); list.innerHTML = '';
  for (const wid of GUN_IDS) {
    const ww = WEAPONS[wid]; const b = el('button', wid === id ? 'on' : '', `<b>${ww.name}</b><small>${ww.type}</small>`);
    b.onclick = () => { showArsenal(wid); sound.ui('click'); }; list.append(b);
  }
  $('#armStats').innerHTML = statBars(WEAPONS[id]);
  const sr = $('#skinRow'); sr.innerHTML = '';
  for (const [sid, S] of Object.entries(SKINS)) {
    const b = el('button', skinOf(id) === sid ? 'on' : '', `<i style="background:${S.swatch}"></i>${S.name}`);
    b.onclick = () => { localStorage.setItem('zl_skin_' + id, sid); viewGunId = null; showArsenal(id); sound.ui('click'); }; sr.append(b);
  }
}
function renderMenu(dt) {
  const { r, sc, cam } = mn, cv = r.domElement, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.floor(w * r.getPixelRatio()) || cv.height !== Math.floor(h * r.getPixelRatio())) { r.setSize(w, h, false); cam.aspect = w / h; cam.setViewOffset(w, h, -w * (w > 1000 ? 0.18 : 0), 0, w, h); cam.updateProjectionMatrix(); }
  mn.t += dt;
  const tx = 1.8 + mn.mx * 1.4, ty = 1.55 - mn.my * 0.5;
  cam.position.x += (tx - cam.position.x) * Math.min(1, dt * 2.5); cam.position.y += (ty - cam.position.y) * Math.min(1, dt * 2.5); cam.position.z = 7.4;
  cam.lookAt(3.4, 1.1, 0);
  if (mn.hero) {
    const a = mn.hero.av; a.userData.mixer?.update(dt);
    a.userData.facing.rotation.y = mn.hero.base + Math.sin(mn.t * 0.6) * 0.12 + mn.mx * 0.5;
    mn.pop = Math.max(0, mn.pop - dt * 3); a.scale.setScalar(1.12 * (1 - 0.06 * mn.pop));
  }
  for (const s of mn.side) { s.av.userData.mixer?.update(dt); s.av.userData.facing.rotation.y = s.base + Math.sin(mn.t * 0.5 + s.ph) * 0.08; }
  const hd = mn.arm.userData.holder; if (hd && mn.arm.visible) { hd.rotation.y = -1.3 + Math.sin(mn.t * 0.7) * 0.65; hd.rotation.x = 0.08; hd.position.y = 1.4 + Math.sin(mn.t * 1.4) * 0.06; }
  mn.ringA.rotation.z += dt * 0.15; mn.ringB.rotation.z -= dt * 0.2;
  mn.crystal.rotation.y += dt * 0.35; mn.crystal2.rotation.y -= dt * 0.5; mn.crystal.position.y = 2.4 + Math.sin(mn.t) * 0.15; mn.crystal2.position.y = mn.crystal.position.y;
  const p = mn.dust.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) { let y = p.getY(i) + mn.vel[i] * dt; if (y > 7) y = 0; p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(mn.t + i) * dt * 0.05); }
  p.needsUpdate = true;
  r.render(sc, cam);
}

// ================= Başlat =================
(async () => {
  renderer.setSize(innerWidth, innerHeight, false);
  connect();
  initMenu();
  const menuClock = new THREE.Clock();
  const menuLoop = () => {
    requestAnimationFrame(menuLoop);
    const dt = Math.min(menuClock.getDelta(), 0.05);
    if (inGame) return;
    if (menuActive && mn) renderMenu(dt);
  };
  menuLoop();
  await loadModels();
  initSelects(); setHero();
  bootDone();
})();
