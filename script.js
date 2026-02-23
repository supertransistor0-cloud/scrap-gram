// ================== 1. КОНФИГУРАЦИЯ ==================
const GITHUB_TOKEN = 'ghp_' + 'i4hNk7dBCCqfdy8bhsefv4lIF6HVIE3hsj6S';
const GIST_ID = '71fe47697f83edc73e946df249bd25ed';
const AUTH_FILE = '__users_db__.txt';
const PUBLIC_ROOMS = [
 { id: 'lobby', name: 'Главный Холл', icon: 'fa-solid fa-ghost', color: 'card-blue', seed: 'public_lobby_1337' },
 { id: 'offtop', name: 'Оффтоп / Флуд', icon: 'fa-solid fa-mug-hot', color: 'card-pink', seed: 'offtop_vibes_99' },
 { id: 'dev-zone', name: 'Разработка', icon: 'fa-solid fa-code', color: 'card-purple', seed: 'dev_secret_key_88' },
 { id: 'crypto', name: 'Крипто-Чат', icon: 'fa-solid fa-bitcoin-sign', color: 'card-orange', seed: 'crypto_anon_99' }
];


// Глобальные переменные
let currentUser = null;
let activeRoom = null;
let refreshInterval = null;
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// ================== 2. АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ ==================

async function handleAuth() {
 const nick = document.getElementById('nick-input').value.trim();
 const pass = document.getElementById('pass-input').value.trim();

 if (!nick || !pass) return alert("Введите ник и пароль!");
 const passHash = CryptoJS.SHA256(pass).toString();
 showStatus("Проверка аккаунта...");

 try {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}?t=${Date.now()}`, {
   headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
  });
  const gist = await res.json();
  const dbContent = gist.files[AUTH_FILE]?.content || "";
  
  const users = {};
  dbContent.split('\n').forEach(line => {
   const [u, h] = line.split(':');
   if (u) users[u] = h;
  });

  if (users[nick]) {
   if (users[nick] === passHash) {
    loginSuccess(nick);
   } else {
    alert("Этот ник занят. Неверный пароль!");
   }
  } else {
   if (confirm(`Ник ${nick} свободен. Зарегистрировать?`)) {
    const newDb = dbContent + (dbContent ? "\n" : "") + `${nick}:${passHash}`;
    await updateGistFile(AUTH_FILE, newDb);
    loginSuccess(nick);
   }
  }
 } catch (e) {
  alert("Ошибка базы Gist. Проверьте Token и ID.");
 } finally {
  hideStatus();
 }
}

function loginSuccess(nick) {
 currentUser = nick;
 localStorage.setItem('aether_active_user', nick);
 
 const authScr = document.getElementById('scr-auth');
 const appScr = document.getElementById('scr-app');

 // Убираем экран входа полностью
 authScr.classList.remove('active');
 authScr.style.display = 'none'; 

 // Показываем основное приложение
 appScr.classList.add('active');
 appScr.style.display = 'flex';

 // Обновляем данные в шапке
 document.getElementById('hdr-nick').innerText = nick;
 document.getElementById('hdr-av').innerText = nick.charAt(0);
 
 saveLocalProfile(nick);
 renderProfiles();
}


// ================== 3. РАБОТА С СООБЩЕНИЯМИ (GIST) ==================

async function loadMessages() {
 if (!activeRoom) return;
 const fileName = `${activeRoom.id}.txt`;
 try {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}?t=${Date.now()}`, {
   headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
  });
  const gist = await res.json();
  const content = gist.files[fileName]?.content || "";
  const lines = content.split('\n').filter(l => l.trim());

  const messages = [];
  lines.forEach(line => {
   try {
    const bytes = CryptoJS.AES.decrypt(line, activeRoom.seed);
    const dec = bytes.toString(CryptoJS.enc.Utf8);
    if (dec) messages.push(JSON.parse(dec));
   } catch(e){}
  });

  messages.sort((a, b) => a.time - b.time);
  renderChatUI(messages);
 } catch (e) { console.error("Load error", e); }
}

async function postEncryptedMessage(encryptedText) {
 if (!activeRoom) return;
 const fileName = `${activeRoom.id}.txt`;
 try {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
   headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
  });
  const gist = await res.json();
  const old = gist.files[fileName]?.content || "";
  const updated = old + (old ? "\n" : "") + encryptedText;
  await updateGistFile(fileName, updated);
  loadMessages();
 } catch (e) { alert("Ошибка отправки"); }
}

async function updateGistFile(name, content) {
 await fetch(`https://api.github.com/gists/${GIST_ID}`, {
  method: 'PATCH',
  headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ files: { [name]: { content: content } } })
 });
}

// ================== 4. МЕДИА (ГОЛОС И ФАЙЛЫ) ==================

async function toggleRecording() {
 const btn = document.getElementById('voice-btn');
 if (!isRecording) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  audioChunks = [];
  mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
  mediaRecorder.onstop = async () => {
   const blob = new Blob(audioChunks, { type: 'audio/webm' });
   await processAndSendFile(new File([blob], `voice_${Date.now()}.webm`, {type:'audio/webm'}));
  };
  mediaRecorder.start();
  isRecording = true;
  btn.style.color = 'red';
 } else {
  mediaRecorder.stop();
  isRecording = false;
  btn.style.color = '';
 }
}

document.getElementById('file-inp')?.addEventListener('change', async (e) => {
 const file = e.target.files[0];
 if (file) await processAndSendFile(file);
});

async function processAndSendFile(file) {
 if (file.size > 2 * 1024 * 1024) return alert("Файл слишком большой (макс 2MB)");
 showStatus("Шифрование файла...");
 const base64 = await new Promise(r => {
  const reader = new FileReader();
  reader.onload = () => r(reader.result.split(',')[1]);
  reader.readAsDataURL(file);
 });
 const msg = { type:'file', user:currentUser, name:file.name, mime:file.type, data:base64, time:Date.now() };
 const enc = CryptoJS.AES.encrypt(JSON.stringify(msg), activeRoom.seed).toString();
 await postEncryptedMessage(enc);
 hideStatus();
}

// ================== 5. UI И ОТРИСОВКА ==================

function renderChatUI(messages) {
 const box = document.getElementById('msg-box');
 if (box.dataset.count == messages.length) return;
 box.dataset.count = messages.length;
 box.innerHTML = '';
 
 messages.forEach(msg => {
  const isMe = msg.user === currentUser;
  const bubble = document.createElement('div');
  bubble.className = `bubble ${isMe ? 'me' : 'ot'}`;
  
  let content = `<b>${msg.user}</b><br>`;
  
  if (msg.type === 'file') {
   const url = `data:${msg.mime};base64,${msg.data}`;
   if (msg.mime.startsWith('image/')) content += `<img src="${url}" style="max-width:100%; border-radius:10px;">`;
   else if (msg.mime.startsWith('audio/')) content += `<audio src="${url}" controls style="width:100%"></audio>`;
   else content += `<a href="${url}" download="${msg.name}" style="color:cyan">📎 ${msg.name}</a>`;
  } else {
   content += `<span>${msg.text}</span>`;
  }
  
  bubble.innerHTML = content + `<div style="font-size:8px; opacity:0.5; text-align:right">${new Date(msg.time).toLocaleTimeString()}</div>`;
  box.appendChild(bubble);
 });
 box.scrollTop = box.scrollHeight;
}

function sendMessage() {
 const inp = document.getElementById('msg-inp');
 if (!inp.value.trim() || !activeRoom) return;
 const msg = { type:'text', user:currentUser, text:inp.value.trim(), time:Date.now() };
 const enc = CryptoJS.AES.encrypt(JSON.stringify(msg), activeRoom.seed).toString();
 postEncryptedMessage(enc);
 inp.value = '';
}

// ================== 6. НАВИГАЦИЯ И ИНИЦИАЛИЗАЦИЯ ==================

function switchView(id, el) {
 document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
 document.getElementById('view-' + id).classList.add('active');
 document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
 if (el) el.classList.add('active');
}

function joinRoomAction() {
 const rid = document.getElementById('j-rid').value.trim();
 const seed = document.getElementById('j-seed').value.trim();
 if (!rid || !seed) return;
 activeRoom = { id: rid, seed: seed };
 
 document.getElementById('chat-closed').style.display = 'none';
 document.getElementById('chat-active').style.display = 'flex';
 document.getElementById('active-room-name').innerText = '#' + rid;
 
 closeModal('mod-join');
 switchView('chat', document.querySelectorAll('.nav-item')[1]);
 
 const activity = document.getElementById('room-list');
 activity.innerHTML = `<div class="room-card active"><b># ${rid}</b><span>Сессия активна</span></div>`;
 
 if (refreshInterval) clearInterval(refreshInterval);
 loadMessages();
 refreshInterval = setInterval(loadMessages, 5000);
}

function saveLocalProfile(n) {
 let p = JSON.parse(localStorage.getItem('aether_profiles') || '[]');
 if (!p.includes(n)) p.push(n);
 localStorage.setItem('aether_profiles', JSON.stringify(p));
}

function renderProfiles() {
 const grid = document.getElementById('profiles-grid');
 const p = JSON.parse(localStorage.getItem('aether_profiles') || '[]');
 grid.innerHTML = '';
 p.forEach(name => {
  grid.innerHTML += `<div class="p-card" onclick="document.getElementById('nick-input').value='${name}'">
   <div class="av">${name[0]}</div><b>${name}</b>
  </div>`;
 });
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function showStatus(t) { const s = document.getElementById('upload-status'); s.innerText = t; s.style.display = 'block'; }
function hideStatus() { document.getElementById('upload-status').style.display = 'none'; }

document.addEventListener('DOMContentLoaded', () => {
 renderProfiles();
 const pGrid = document.getElementById('public-rooms-grid');
 PUBLIC_ROOMS.forEach(r => {
  pGrid.innerHTML += `<div class="room-cool-card ${r.color}" onclick="enterPub('${r.id}','${r.seed}')">
   <i class="${r.icon}"></i><b>${r.name}</b>
  </div>`;
 });
});

function enterPub(id, seed) {
 document.getElementById('j-rid').value = id;
 document.getElementById('j-seed').value = seed;
 joinRoomAction();
}

function toProfiles() {
 if (confirm("Выйти из аккаунта?")) {
  location.reload();
 }
}
let authMode = 'login'; // Режим по умолчанию

function setAuthMode(mode, el) {
 authMode = mode;
 // Визуал вкладок
 document.querySelectorAll('.a-tab').forEach(t => t.classList.remove('active'));
 el.classList.add('active');
 
 // Текст кнопки и описания
 const btn = document.getElementById('auth-main-btn');
 const desc = document.getElementById('auth-desc');
 
 if (mode === 'login') {
 btn.innerText = "Войти в аккаунт";
 desc.innerText = "Введите данные для доступа к профилю";
 } else {
 btn.innerText = "Создать аккаунт";
 desc.innerText = "Ваш ник будет забронирован в базе Gist";
 }
}

// Измененная функция handleAuth
async function handleAuth() {
 const nick = document.getElementById('nick-input').value.trim();
 const pass = document.getElementById('pass-input').value.trim();

 if (!nick || !pass) return alert("Заполните поля!");
 const passHash = CryptoJS.SHA256(pass).toString();
 showStatus("Связь с сервером...");

 try {
 const res = await fetch(`https://api.github.com/gists/${GIST_ID}?t=${Date.now()}`, {
  headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
 });
 const gist = await res.json();
 const dbContent = gist.files[AUTH_FILE]?.content || "";
 
 const users = {};
 dbContent.split('\n').forEach(line => {
  const [u, h] = line.split(':');
  if (u) users[u] = h;
 });

 if (authMode === 'login') {
  // Логика входа
  if (users[nick] && users[nick] === passHash) {
  loginSuccess(nick);
  } else {
  alert("Ошибка: Ник не найден или неверный пароль.");
  }
 } else {
  // Логика регистрации
  if (users[nick]) {
  alert("Этот ник уже занят!");
  } else {
  const newDb = dbContent + (dbContent ? "\n" : "") + `${nick}:${passHash}`;
  await updateGistFile(AUTH_FILE, newDb);
  loginSuccess(nick);
  alert("Регистрация успешна!");
  }
 }
 } catch (e) {
 alert("Ошибка базы данных.");
 } finally {
 hideStatus();
 }
}
function scrollToBottom() {
 const box = document.getElementById('msg-box');
 // Прокручиваем к самому низу, учитывая наш padding
 box.scrollTo({
  top: box.scrollHeight,
  behavior: 'smooth'
 });
}

