const gun = Gun(['https://gun-manhattan.herokuapp.com/gun', 'https://relay.peer.ooo/gun']);
let currentUser = localStorage.getItem('ae_v2_user') || null;
let activeRoom = { id: null, key: null, node: null };
const seen = new Set();

// Публичный индекс
const indexNode = gun.get('aether_v20_rooms');

window.onload = () => {
 if (currentUser) login(currentUser);
 renderAccounts();
 listenRooms();
};

// --- СИСТЕМА ПЕРЕКЛЮЧЕНИЯ АККАУНТОВ ---
function renderAccounts() {
 const accs = JSON.parse(localStorage.getItem('ae_v2_accs') || '[]');
 const container = document.getElementById('acc-switcher');
 container.innerHTML = accs.map(a => `
  <div class="user-chip" onclick="login('${a}')">
   <div class="av">${a[0].toUpperCase()}</div>
   <span>${a}</span>
  </div>
 `).join('');
}

function createAccount() {
 const nick = document.getElementById('input-nick').value.trim();
 if (!nick) return;
 let accs = JSON.parse(localStorage.getItem('ae_v2_accs') || '[]');
 if (!accs.includes(nick)) accs.push(nick);
 localStorage.setItem('ae_v2_accs', JSON.stringify(accs));
 login(nick);
}

function login(nick) {
 currentUser = nick;
 localStorage.setItem('ae_v2_user', nick);
 document.getElementById('header-name').innerText = nick;
 document.getElementById('header-av').innerText = nick[0].toUpperCase();
 document.getElementById('screen-auth').classList.remove('active');
 document.getElementById('screen-app').classList.add('active');
}

function logout() {
 localStorage.removeItem('ae_v2_user');
 location.reload();
}

// --- НАВИГАЦИЯ ---
function nav(pageId) {
 document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
 document.querySelector(`[data-page="${pageId}"]`).classList.add('active');
 
 document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
 const idx = pageId === 'home' ? 0 : pageId === 'chat' ? 1 : 2;
 document.querySelectorAll('.nav-item')[idx].classList.add('active');
}

// --- КОМНАТЫ ---
function listenRooms() {
 indexNode.map().on((data, id) => {
  if (!data) return;
  const feed = document.getElementById('public-rooms');
  if (!document.getElementById('rc-' + id)) {
   const div = document.createElement('div');
   div.id = 'rc-' + id;
   div.className = 'room-card';
   div.innerHTML = `<b>#${data.name}</b><br><small style="color:#8e8e93">Публичный канал</small>`;
   div.onclick = () => enterRoom(data.name, 'public_key');
   feed.appendChild(div);
  }
 });
}

function actionCreate() {
 const id = document.getElementById('c-id').value.trim();
 const isPriv = document.querySelector('input[name="ctype"]:checked').value === 'priv';
 const seed = document.getElementById('c-seed').value.trim();
 if (!id) return;

 if (!isPriv) indexNode.get(id).put({ name: id });
 enterRoom(id, isPriv ? CryptoJS.SHA256(seed).toString() : 'public_key');
 closeModal('modal-create');
}

function actionJoin() {
 const id = document.getElementById('j-id').value.trim();
 const seed = document.getElementById('j-seed').value.trim();
 if (!id) return;
 enterRoom(id, seed ? CryptoJS.SHA256(seed).toString() : 'public_key');
 closeModal('modal-join');
}

function enterRoom(id, key) {
 activeRoom = { id, key, node: gun.get('ae_v20_r_' + id) };
 seen.clear();
 document.getElementById('msg-container').innerHTML = '';
 document.getElementById('chat-closed').style.display = 'none';
 document.getElementById('chat-open').style.display = 'flex';
 document.getElementById('active-room-name').innerText = '#' + id;
 nav('chat');

 activeRoom.node.map().on((enc, mid) => {
  if (!enc || seen.has(mid)) return;
  try {
   const dec = CryptoJS.AES.decrypt(enc, activeRoom.key).toString(CryptoJS.enc.Utf8);
   if (!dec) return;
   const m = JSON.parse(dec);
   seen.add(mid);
   renderMsg(m);
  } catch(e) {}
 });
}

function sendMsg() {
 const inp = document.getElementById('msg-input');
 if (!inp.value.trim() || !activeRoom.node) return;
 const p = JSON.stringify({ u: currentUser, t: inp.value, ts: Date.now() });
 activeRoom.node.set(CryptoJS.AES.encrypt(p, activeRoom.key).toString());
 inp.value = '';
}

function renderMsg(m) {
 const container = document.getElementById('msg-container');
 const div = document.createElement('div');
 div.className = `bubble ${m.u === currentUser ? 'me' : 'ot'}`;
 div.innerHTML = `<small style="opacity:0.5;font-size:10px">${m.u}</small><br>${m.t}`;
 container.appendChild(div);
 container.scrollTop = container.scrollHeight;
}

function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeActiveChat() { 
 document.getElementById('chat-open').style.display = 'none'; 
 document.getElementById('chat-closed').style.display = 'flex'; 
}
