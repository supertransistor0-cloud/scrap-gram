// 1. Расширенный список серверов. 
// Если один не отвечает, Gun переключится на другой.
const peers = [
  'https://gun-manhattan.herokuapp.com/gun',
  'https://relay.peer.ooo/gun',
  'https://gun-us.herokuapp.com/gun',
  'https://peer.wall.org'
];

const gun = Gun({
  peers: peers,
  localStorage: true, // Включаем кэширование в браузере
  radisk: true        // Позволяет хранить данные локально более эффективно
});

let currentUser = localStorage.getItem('ae_v6_active') || null;
let activeRoom = { id: null, key: null, node: null };
const seenIds = new Set();
const indexNode = gun.get('aether_v6_public_index');

window.onload = () => {
  if (currentUser) selectProfile(currentUser);
  renderProfiles();
  listenPublic();
};

// --- МЕНЕДЖЕР ПРОФИЛЕЙ ---
function renderProfiles() {
  const accs = JSON.parse(localStorage.getItem('ae_v6_accs') || '[]');
  const list = document.getElementById('profiles-grid');
  if(!list) return;
  list.innerHTML = accs.map(a => `
    <div class="p-card" onclick="selectProfile('${a}')">
      <div class="p-avatar">${a[0].toUpperCase()}</div>
      <b>${a}</b>
    </div>
  `).join('');
}

function addProfile() {
  const input = document.getElementById('nick-input');
  const nick = input.value.trim();
  if (!nick) return;
  let accs = JSON.parse(localStorage.getItem('ae_v6_accs') || '[]');
  if (!accs.includes(nick)) accs.push(nick);
  localStorage.setItem('ae_v6_accs', JSON.stringify(accs));
  input.value = '';
  selectProfile(nick);
}

function selectProfile(nick) {
  currentUser = nick;
  localStorage.setItem('ae_v6_active', nick);
  document.getElementById('hdr-nick').innerText = nick;
  document.getElementById('hdr-av').innerText = nick[0].toUpperCase();
  document.getElementById('scr-auth').classList.remove('active');
  document.getElementById('scr-app').classList.add('active');
}

function toProfiles() {
  document.getElementById('scr-app').classList.remove('active');
  document.getElementById('scr-auth').classList.add('active');
  renderProfiles();
}

// --- НАВИГАЦИЯ ---
function switchView(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('view-' + id);
  if(target) target.classList.add('active');
  
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');
}

// --- ЧАТ И КОМНАТЫ ---
function listenPublic() {
  // .once() принудительно опрашивает сеть на наличие старых данных
  indexNode.map().once((data, id) => {
    renderRoomCard(data, id);
  });
  // .on() следит за появлением новых в реальном времени
  indexNode.map().on((data, id) => {
    renderRoomCard(data, id);
  });
}

function renderRoomCard(data, id) {
  if (!data || !data.name) return;
  const feed = document.getElementById('public-feed');
  if (!document.getElementById('rc-' + id)) {
    const div = document.createElement('div');
    div.id = 'rc-' + id;
    div.className = 'p-card'; 
    div.style.marginBottom = '12px';
    div.innerHTML = `<b>#${data.name}</b><br><small style="color:var(--text-dim)">Публичное пространство</small>`;
    div.onclick = () => connectRoom(data.name, 'public_key');
    feed.appendChild(div);
  }
}

function createRoom() {
  const idInp = document.getElementById('c-rid');
  const id = idInp.value.trim().toLowerCase();
  const isPriv = document.querySelector('input[name="rt"]:checked').value === 'priv';
  const seed = document.getElementById('c-seed').value.trim();
  
  if (!id) return;

  // Если комната публичная, сохраняем её в индекс
  if (!isPriv) {
    indexNode.get(id).put({ name: id });
  }
  
  const key = isPriv ? CryptoJS.SHA256(seed).toString() : 'public_key';
  connectRoom(id, key);
  closeModal('mod-create');
  idInp.value = '';
}

function joinRoom() {
  const id = document.getElementById('j-rid').value.trim().toLowerCase();
  const seed = document.getElementById('j-seed').value.trim();
  if (!id) return;
  connectRoom(id, seed ? CryptoJS.SHA256(seed).toString() : 'public_key');
  closeModal('mod-join');
}

function connectRoom(id, key) {
  // Останавливаем прослушивание старой комнаты, если она была
  if(activeRoom.node) activeRoom.node.off();

  activeRoom = { id, key, node: gun.get('ae_v6_r_' + id) };
  seenIds.clear();
  
  document.getElementById('msg-box').innerHTML = '';
  document.getElementById('chat-closed').style.display = 'none';
  document.getElementById('chat-active').style.display = 'flex';
  document.getElementById('active-room-name').innerText = '#' + id;
  
  // Переход в интерфейс чата
  switchView('chat', document.querySelectorAll('.nav-item')[1]);

  // Загружаем историю и слушаем новые сообщения
  activeRoom.node.map().on((enc, mid) => {
    if (!enc || seenIds.has(mid)) return;
    try {
      const bytes = CryptoJS.AES.decrypt(enc, activeRoom.key);
      const dec = bytes.toString(CryptoJS.enc.Utf8);
      if (!dec) return;
      
      const m = JSON.parse(dec);
      seenIds.add(mid);
      renderMsg(m);
    } catch(e) {
      console.warn("Ошибка декодирования (возможно, неверный ключ)");
    }
  });
}

function sendMsg() {
  const inp = document.getElementById('msg-inp');
  const val = inp.value.trim();
  if (!val || !activeRoom.node) return;
  
  const p = JSON.stringify({ u: currentUser, t: val, ts: Date.now() });
  const encrypted = CryptoJS.AES.encrypt(p, activeRoom.key).toString();
  
  // Используем .set() для создания уникального ID сообщения в списке
  activeRoom.node.set(encrypted);
  inp.value = '';
}

function renderMsg(m) {
  const flow = document.getElementById('msg-box');
  const div = document.createElement('div');
  div.className = `bubble ${m.u === currentUser ? 'me' : 'ot'}`;
  div.innerHTML = `<small style="font-size:10px;opacity:0.6">${m.u}</small><br>${m.t}`;
  flow.appendChild(div);
  // Автопрокрутка вниз
  flow.scrollTo({ top: flow.scrollHeight, behavior: 'smooth' });
}

// --- ХЕЛПЕРЫ ---
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function toggleSeed(s) { document.getElementById('c-seed').parentElement.style.display = s ? 'block' : 'none'; }
function exitChat() { 
    document.getElementById('chat-active').style.display = 'none'; 
    document.getElementById('chat-closed').style.display = 'flex'; 
    if(activeRoom.node) activeRoom.node.off();
}

function refreshChat(btn) {
  const icon = btn.querySelector('i');
  if(icon) icon.style.animation = "spin 0.6s linear";
  setTimeout(() => { if(icon) icon.style.animation = ""; }, 600);
  
  if(activeRoom.id) connectRoom(activeRoom.id, activeRoom.key);
}
