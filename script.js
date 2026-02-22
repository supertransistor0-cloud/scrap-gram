// ================== КОНФИГ ==================
const GITHUB_TOKEN = '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';
const GIST_ID = 'd76afa557faac4b5616c6be215060a22';

let currentUser = null;
let activeRoom = null; // { id: 'room-name', seed: 'password' }
let refreshInterval = null;

// Аудио
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// ================== ПРОФИЛИ ==================
document.addEventListener('DOMContentLoaded', () => {
  renderProfiles();
  const saved = localStorage.getItem('aether_active_user');
  if (saved) selectProfile(saved);
});

function addProfile() {
  const nick = document.getElementById('nick-input').value.trim();
  if (!nick) return;
  let users = JSON.parse(localStorage.getItem('aether_users') || '[]');
  if (!users.includes(nick)) users.push(nick);
  localStorage.setItem('aether_users', JSON.stringify(users));
  document.getElementById('nick-input').value = '';
  renderProfiles();
}

function renderProfiles() {
  const grid = document.getElementById('profiles-grid');
  const users = JSON.parse(localStorage.getItem('aether_users') || '[]');
  grid.innerHTML = '';
  users.forEach(u => {
    grid.innerHTML += `<div class="p-card" onclick="selectProfile('${u}')"><div class="av">${u.charAt(0)}</div><b>${u}</b></div>`;
  });
}

function selectProfile(nick) {
  currentUser = nick;
  localStorage.setItem('aether_active_user', nick);
  document.getElementById('hdr-nick').innerText = nick;
  document.getElementById('hdr-av').innerText = nick.charAt(0);
  document.getElementById('scr-auth').classList.remove('active');
  document.getElementById('scr-app').classList.add('active');
}

function toProfiles() {
  document.getElementById('scr-app').classList.remove('active');
  document.getElementById('scr-auth').classList.add('active');
}

// ================== НАВИГАЦИЯ ==================
function switchView(viewId, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('view-' + viewId).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ================== ЛОГИКА КОМНАТ ==================
function joinRoomAction() {
  const rid = document.getElementById('j-rid').value.trim();
  const seed = document.getElementById('j-seed').value.trim();
  if (!rid || !seed) return alert('Заполните ID и Пароль');

  activeRoom = { id: rid, seed: seed };
  
  // Показываем чат в UI
  document.getElementById('chat-closed').style.display = 'none';
  document.getElementById('chat-active').style.display = 'flex';
  document.getElementById('active-room-name').innerText = '#' + rid;
  document.getElementById('msg-box').innerHTML = '';

  closeModal('mod-join');
  switchView('chat', document.querySelectorAll('.nav-item')[1]);

  // Обновляем список на главной
  updateRoomListUI();

  // Запускаем опрос Gist
  if (refreshInterval) clearInterval(refreshInterval);
  loadMessages();
  refreshInterval = setInterval(loadMessages, 5000);
}

function updateRoomListUI() {
  const list = document.getElementById('room-list');
  if (activeRoom) {
    list.innerHTML = `
      <div class="room-card active" onclick="switchView('chat', document.querySelectorAll('.nav-item')[1])">
        <div class="r-icon">#</div>
        <div class="r-info"><b>${activeRoom.id}</b><span>Нажмите, чтобы войти</span></div>
        <i class="fa-solid fa-chevron-right"></i>
      </div>
    `;
  }
}

// ================== ТВОЙ РАБОЧИЙ БЭКЕНД GIST ==================

async function loadMessages() {
  if (!activeRoom) return;
  const fileName = `${activeRoom.id}.txt`;
  const msgDiv = document.getElementById('msg-box');

  try {
    const response = await fetch(`https://api.github.com/gists/${GIST_ID}?t=${Date.now()}`, {
      headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
    });
    const data = await response.json();
    const content = data.files[fileName]?.content || '';
    const lines = content.split('\n').filter(l => l.trim() !== '');

    const messages = [];
    for (let line of lines) {
      try {
        const bytes = CryptoJS.AES.decrypt(line, activeRoom.seed);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
        if (decrypted) messages.push(JSON.parse(decrypted));
      } catch (e) {}
    }

    messages.sort((a, b) => (a.time || 0) - (b.time || 0));
    
    if (msgDiv.dataset.count == messages.length) return;
    msgDiv.dataset.count = messages.length;

    msgDiv.innerHTML = '';
    messages.forEach(msg => displayMessage(msg, msgDiv));
    msgDiv.scrollTop = msgDiv.scrollHeight;
  } catch (err) { console.error('Gist Error:', err); }
}

async function postEncryptedMessage(encryptedText) {
  if (!activeRoom) return;
  const fileName = `${activeRoom.id}.txt`;

  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
    });
    const gist = await res.json();
    const oldContent = gist.files[fileName]?.content || '';
    const newContent = oldContent ? `${oldContent}\n${encryptedText}` : encryptedText;

    await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { [fileName]: { content: newContent } } })
    });
    loadMessages();
  } catch (err) { alert('Ошибка API Gist'); }
}

// ================== МЕДИА И ОТПРАВКА ==================

async function sendMessage() {
  const inp = document.getElementById('msg-inp');
  const text = inp.value.trim();
  if (!text || !activeRoom) return;

  const msgObj = { type: 'text', user: currentUser, text: text, time: Date.now() };
  inp.value = '';
  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(msgObj), activeRoom.seed).toString();
  await postEncryptedMessage(encrypted);
}

document.getElementById('msg-inp').addEventListener('keypress', e => { if(e.key==='Enter') sendMessage(); });

async function toggleRecording() {
  const btn = document.getElementById('voice-btn');
  if (!isRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        await processAndSendFile(new File([blob], `voice.webm`, {type:'audio/webm'}));
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      isRecording = true;
      btn.style.color = '#ff3b30';
    } catch (err) { alert('Микрофон недоступен'); }
  } else {
    mediaRecorder.stop();
    isRecording = false;
    btn.style.color = '';
  }
}

document.getElementById('file-inp').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) await processAndSendFile(file);
  e.target.value = '';
});

async function processAndSendFile(file) {
  if (file.size > 5 * 1024 * 1024) return alert('Макс 5 МБ');
  document.getElementById('upload-status').style.display = 'block';
  try {
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(',')[1]);
      r.readAsDataURL(file);
    });
    const obj = { type: 'file', user: currentUser, name: file.name, mime: file.type, data: base64, time: Date.now() };
    const enc = CryptoJS.AES.encrypt(JSON.stringify(obj), activeRoom.seed).toString();
    await postEncryptedMessage(enc);
  } catch (err) { alert('Ошибка файла'); }
  document.getElementById('upload-status').style.display = 'none';
}

function displayMessage(msg, container) {
  const isMe = msg.user === currentUser;
  const bubble = document.createElement('div');
  bubble.className = `bubble ${isMe ? 'me' : 'ot'}`;
  
  if (!isMe) {
    const name = document.createElement('div');
    name.style = "font-size:10px; color:var(--blue); font-weight:800; margin-bottom:4px;";
    name.innerText = msg.user;
    bubble.appendChild(name);
  }

  if (msg.type === 'file') {
    const binary = atob(msg.data);
    const array = new Uint8Array(binary.length);
    for (let i=0; i<binary.length; i++) array[i] = binary.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([array], {type: msg.mime}));

    if (msg.mime.startsWith('image/')) {
      const img = document.createElement('img'); img.src = url; img.style="max-width:100%; border-radius:8px;";
      bubble.appendChild(img);
    } else if (msg.mime.startsWith('video/') || msg.mime.startsWith('audio/')) {
      const media = document.createElement(msg.mime.startsWith('video') ? 'video' : 'audio');
      media.src = url; media.controls = true; media.style="max-width:100%;";
      bubble.appendChild(media);
    } else {
      const link = document.createElement('a'); link.href = url; link.download = msg.name;
      link.innerText = "📎 " + msg.name; link.style="color:#fff; font-size:12px;";
      bubble.appendChild(link);
    }
  } else {
    const txt = document.createElement('span'); txt.innerText = msg.text || msg;
    bubble.appendChild(txt);
  }
  
  const time = document.createElement('div');
  time.style = "font-size:8px; opacity:0.5; text-align:right; margin-top:4px;";
  time.innerText = new Date(msg.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  bubble.appendChild(time);
  container.appendChild(bubble);
}

// 1. Список публичных комнат (видны всем)
const PUBLIC_ROOMS = [
 { id: 'lobby', name: 'Главный Холл', icon: 'fa-solid fa-ghost', color: 'card-blue', seed: 'public_lobby_1337' },
 { id: 'dev-zone', name: 'Разработка', icon: 'fa-solid fa-code', color: 'card-purple', seed: 'dev_secret_key_88' },
 { id: 'crypto', name: 'Крипто-Чат', icon: 'fa-solid fa-bitcoin-sign', color: 'card-orange', seed: 'crypto_anon_99' },
 { id: 'offtop', name: 'Флудилка', icon: 'fa-solid fa-fire', color: 'card-green', seed: 'offtop_pass_00' }
];
// 2. Функция отрисовки публичных карточек (вызови её в DOMContentLoaded)
function renderPublicRooms() {
 const grid = document.getElementById('public-rooms-grid');
 if (!grid) return;
 grid.innerHTML = '';
 
 PUBLIC_ROOMS.forEach(room => {
  const card = document.createElement('div');
  card.className = `room-cool-card ${room.color}`;
  card.onclick = () => enterPublicRoom(room.id, room.seed);
  card.innerHTML = `
   <i class="${room.icon}"></i>
   <b>${room.name}</b>
   <span>#${room.id}</span>
  `;
  grid.appendChild(card);
 });
}

// 3. Быстрый вход в публичную комнату
function enterPublicRoom(id, seed) {
 document.getElementById('j-rid').value = id;
 document.getElementById('j-seed').value = seed;
 joinRoomAction();
}

// 4. Не забудь вызвать отрисовку при загрузке страницы!
document.addEventListener('DOMContentLoaded', () => {
 renderPublicRooms(); // Добавь это
 renderProfiles();
 const saved = localStorage.getItem('aether_active_user');
 if (saved) selectProfile(saved);
});
