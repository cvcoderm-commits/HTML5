/* =========================================================================
   J.A.R.V.I.S. AI OPERATING SYSTEM — CORE ENGINE
   ========================================================================= */
'use strict';

/* ---------- Secure-context check ---------- */
/* Browsers block camera (getUserMedia) and, in some browsers, speech recognition
   on pages opened directly from disk (file://). They require a "secure context":
   http://localhost, or any https:// origin. We warn the user instead of failing silently. */
function checkSecureContext(){
  const isFileProtocol = location.protocol === 'file:';
  const isSecure = window.isSecureContext;
  if(isFileProtocol || !isSecure){
    setTimeout(()=>{
      toast('Setup Required', 'Camera & mic need a local server, not a double-clicked file. Run: python3 server.py — see README.', '⚠️');
    }, 2500);
  }
}

/* ---------- Settings / Storage ---------- */
const DEFAULTS = {
  apiKey:'', accent:'#00e5ff', theme:'dark', animSpeed:1, particleDensity:1,
  gestureSensitivity:0.7, speechRate:1, speechPitch:1, speechVoice:'', language:'en-US',
  micEnabled:true, camEnabled:true, soundVolume:0.4, wakeWord:'hey jarvis'
};
function loadArr(key, fallback){
  try{ const v = localStorage.getItem(key); return v? JSON.parse(v) : fallback; }catch(e){ return fallback; }
}
let settings = {...DEFAULTS, ...(loadArr('jarvis_settings', {}))};
let chatHistory = loadArr('jarvis_chat', []);
let notesData = loadArr('jarvis_notes', []);
let todoData = loadArr('jarvis_todo', []);
let recentCommands = loadArr('jarvis_recent', []);

function saveSettings(){ localStorage.setItem('jarvis_settings', JSON.stringify(settings)); applySettings(); }
function saveChat(){ localStorage.setItem('jarvis_chat', JSON.stringify(chatHistory.slice(-200))); }
function saveNotes(){ localStorage.setItem('jarvis_notes', JSON.stringify(notesData)); }
function saveTodo(){ localStorage.setItem('jarvis_todo', JSON.stringify(todoData)); }
function saveRecent(){ localStorage.setItem('jarvis_recent', JSON.stringify(recentCommands.slice(-12))); }

function applySettings(){
  const r = document.documentElement.style;
  r.setProperty('--accent', settings.accent);
  r.setProperty('--anim-speed', settings.animSpeed);
  r.setProperty('--particle-density', settings.particleDensity);
  document.body.style.filter = settings.theme==='light' ? 'invert(1) hue-rotate(180deg)' : 'none';
}
applySettings();

/* ---------- Sound Effects (WebAudio synthesized, no external files) ---------- */
const Sound = (()=>{
  let ctx;
  function ensure(){ if(!ctx) ctx = new (window.AudioContext||window.webkitAudioContext)(); return ctx; }
  function tone(freq, dur, type='sine', vol=1, sweep=null){
    if(settings.soundVolume<=0) return;
    try{
      const c = ensure(); const o = c.createOscillator(); const g = c.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.value = settings.soundVolume * vol;
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g); g.connect(c.destination);
      if(sweep) o.frequency.exponentialRampToValueAtTime(sweep, c.currentTime+dur);
      o.start(); o.stop(c.currentTime+dur);
    }catch(e){}
  }
  return {
    hover:()=>tone(1200,.04,'sine',.15),
    click:()=>tone(700,.06,'triangle',.3,900),
    open:()=>tone(400,.18,'sine',.3,900),
    close:()=>tone(700,.15,'sine',.25,300),
    notify:()=>{tone(880,.1,'sine',.3); setTimeout(()=>tone(1320,.12,'sine',.25),90);},
    startup:()=>{tone(220,.3,'sine',.3,880); setTimeout(()=>tone(1100,.4,'sine',.25),200);},
    voice:()=>tone(1000,.08,'sine',.25,1400),
    gesture:()=>tone(600,.07,'square',.15,1000),
    thinking:()=>tone(500,.05,'sine',.1),
    type:()=>tone(1800,.02,'square',.05),
    error:()=>tone(200,.2,'sawtooth',.25)
  };
})();

/* ---------- Toast notifications ---------- */
function toast(title, msg, icon='ℹ️', type='info'){
  const stack = document.getElementById('toast-stack');
  const el = document.createElement('div');
  el.className = 'toast glass glow-border';
  el.innerHTML = `<span class="t-ico">${icon}</span><div class="t-body"><b>${title}</b><span>${msg}</span></div>`;
  stack.appendChild(el);
  Sound.notify();
  addNotifCenter(title, msg, icon);
  setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>el.remove(),400); }, 4500);
}
function addNotifCenter(title, msg, icon){
  const c = document.getElementById('notif-center');
  if(c.querySelector('.empty-hint')) c.innerHTML='';
  const d = document.createElement('div');
  d.style.cssText='padding:6px 0; border-bottom:1px dashed rgba(255,255,255,.06);';
  d.innerHTML = `<b style="color:var(--accent);">${icon} ${title}</b><br>${msg}`;
  c.prepend(d);
  while(c.children.length>8) c.removeChild(c.lastChild);
}

/* =========================================================================
   BACKGROUND PARTICLE SYSTEM (Canvas)
   ========================================================================= */
const bgCanvas = document.getElementById('bg-canvas');
const pCanvas = document.getElementById('particle-canvas');
const bgCtx = bgCanvas.getContext('2d');
const pCtx = pCanvas.getContext('2d');
let W,H;
function resizeCanvases(){
  W = window.innerWidth; H = window.innerHeight;
  [bgCanvas,pCanvas].forEach(c=>{ c.width=W; c.height=H; });
}
resizeCanvases();
window.addEventListener('resize', resizeCanvases);

let particles = [];
function initParticles(){
  const count = Math.floor(70 * settings.particleDensity);
  particles = Array.from({length:count}, ()=>({
    x:Math.random()*W, y:Math.random()*H,
    r:Math.random()*1.8+.4,
    vx:(Math.random()-.5)*.25, vy:(Math.random()-.5)*.25,
    hue: Math.random()>.5? '0,229,255' : '124,77,255',
    a: Math.random()*.6+.2
  }));
}
initParticles();

let mouseX=W/2, mouseY=H/2;
window.addEventListener('mousemove', e=>{ mouseX=e.clientX; mouseY=e.clientY; });

function animateParticles(){
  pCtx.clearRect(0,0,W,H);
  particles.forEach(p=>{
    p.x += p.vx; p.y += p.vy;
    const dx = mouseX-p.x, dy = mouseY-p.y, dist = Math.hypot(dx,dy);
    if(dist<120){ p.x -= dx/dist*.6; p.y -= dy/dist*.6; }
    if(p.x<0) p.x=W; if(p.x>W) p.x=0; if(p.y<0) p.y=H; if(p.y>H) p.y=0;
    pCtx.beginPath();
    pCtx.arc(p.x,p.y,p.r,0,Math.PI*2);
    pCtx.fillStyle = `rgba(${p.hue},${p.a})`;
    pCtx.shadowBlur = 6; pCtx.shadowColor = `rgba(${p.hue},1)`;
    pCtx.fill();
  });
  for(let i=0;i<particles.length;i++){
    for(let j=i+1;j<particles.length;j++){
      const a=particles[i], b=particles[j];
      const d = Math.hypot(a.x-b.x, a.y-b.y);
      if(d<95){
        pCtx.strokeStyle = `rgba(0,229,255,${(1-d/95)*.12})`;
        pCtx.lineWidth=1;
        pCtx.beginPath(); pCtx.moveTo(a.x,a.y); pCtx.lineTo(b.x,b.y); pCtx.stroke();
      }
    }
  }
  requestAnimationFrame(animateParticles);
}
animateParticles();

/* =========================================================================
   BOOT SEQUENCE
   ========================================================================= */
const bootMessages = [
  'Initializing Neural Core…',
  'Loading AI Engine…',
  'Connecting Gemini…',
  'Loading Voice Recognition…',
  'Loading Gesture Recognition…',
  'Loading Camera…',
  'Checking System Status…',
  'Welcome Back, Commander…',
  'System Online.'
];
function runBootSequence(){
  const log = document.getElementById('boot-log');
  const progress = document.getElementById('boot-progress');
  Sound.startup();
  let i=0;
  function step(){
    if(i>=bootMessages.length){
      setTimeout(()=>{
        document.getElementById('boot-screen').classList.add('hide');
        setTimeout(()=>{
          document.getElementById('boot-screen').style.display='none';
          document.getElementById('app').classList.add('visible');
          initApp();
        },900);
      }, 500);
      return;
    }
    const line = document.createElement('div');
    line.innerHTML = `<span class="tick">[${(i+1).toString().padStart(2,'0')}]</span> ${bootMessages[i]}`;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
    progress.style.width = `${Math.round(((i+1)/bootMessages.length)*100)}%`;
    if(i%2===0) Sound.thinking();
    i++;
    setTimeout(step, 430);
  }
  step();
}
window.addEventListener('load', ()=> setTimeout(runBootSequence, 400));

/* =========================================================================
   CLOCK / TOPBAR STATUS
   ========================================================================= */
function updateClock(){
  const now = new Date();
  document.getElementById('clock-time').textContent = now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  document.getElementById('clock-date').textContent = now.toLocaleDateString([], {weekday:'short', month:'short', day:'numeric', year:'numeric'});
}
setInterval(updateClock, 1000); updateClock();

function setPill(id, ok, warn=false){
  const el = document.getElementById(id);
  el.classList.remove('ok','bad','warn');
  el.classList.add(ok? 'ok' : (warn?'warn':'bad'));
}
function updateNetStatus(){
  const online = navigator.onLine;
  setPill('pill-net', online);
  document.getElementById('pill-net').querySelector('span:last-child').textContent = online? 'Online':'Offline';
}
window.addEventListener('online', ()=>{ updateNetStatus(); toast('Network','Connection restored','🌐'); });
window.addEventListener('offline', ()=>{ updateNetStatus(); toast('Network','Connection lost','⚠️'); });
updateNetStatus();

function updateGeminiPill(){
  setPill('pill-gemini', !!settings.apiKey);
  document.getElementById('pill-gemini').querySelector('span:last-child').textContent = settings.apiKey? 'Gemini':'No Key';
}
updateGeminiPill();

function updateBattery(){
  if(navigator.getBattery){
    navigator.getBattery().then(b=>{
      const pct = Math.round(b.level*100);
      document.getElementById('batt-text').textContent = pct+'%'+(b.charging?' ⚡':'');
      setPill('pill-batt', pct>20, pct<=20);
      b.onlevelchange = updateBattery;
    });
  } else {
    document.getElementById('batt-text').textContent = 'N/A';
  }
}
updateBattery();

// ----- Early state declarations (must exist before any startup code uses them) -----
let aiState = 'idle';
let recognition = null;
let isListening = false;

setPill('pill-mic', false);
setPill('pill-cam', false);

let fps=60, frames=0, lastFpsTime=performance.now();
function fpsLoop(){
  frames++;
  const now = performance.now();
  if(now-lastFpsTime>=1000){
    fps = frames; frames=0; lastFpsTime=now;
    document.getElementById('fps-val').textContent = fps;
    document.getElementById('fps-bar').style.width = Math.min(100,(fps/60)*100)+'%';
  }
  requestAnimationFrame(fpsLoop);
}
fpsLoop();

function simulateVitals(){
  const cpu = Math.round(18 + Math.random()*35 + (aiState==='thinking'?25:0));
  const ram = Math.round(35 + Math.random()*20);
  document.getElementById('cpu-val').textContent = cpu+'%';
  document.getElementById('cpu-bar').style.width = cpu+'%';
  document.getElementById('ram-val').textContent = ram+'%';
  document.getElementById('ram-bar').style.width = ram+'%';
}
setInterval(simulateVitals, 1800); simulateVitals();

async function loadWeather(){
  try{
    const pos = await new Promise((res,rej)=>{
      if(!navigator.geolocation) return rej();
      navigator.geolocation.getCurrentPosition(res, rej, {timeout:4000});
    }).catch(()=>null);
    const lat = pos? pos.coords.latitude : 21.17, lon = pos? pos.coords.longitude : 72.83;
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
    const d = await r.json();
    if(d.current_weather){
      document.getElementById('weather-temp').textContent = Math.round(d.current_weather.temperature)+'°';
      document.getElementById('weather-desc').textContent = weatherCodeDesc(d.current_weather.weathercode);
    }
  }catch(e){ /* keep default */ }
}
function weatherCodeDesc(code){
  const map = {0:'Clear Sky',1:'Mostly Clear',2:'Partly Cloudy',3:'Overcast',45:'Fog',51:'Drizzle',61:'Rain',71:'Snow',80:'Showers',95:'Thunderstorm'};
  return map[code] || 'Conditions Nominal';
}
loadWeather();

/* =========================================================================
   AI CORE — Visual state machine (idle / listening / thinking / speaking)
   ========================================================================= */
let coreRotation = 0;
function setAiState(state, subtext){
  aiState = state;
  const statusText = document.getElementById('ai-status-text');
  const statusSub = document.getElementById('ai-status-sub');
  const map = {
    idle:{txt:'SYSTEM IDLE', color:'var(--accent)'},
    listening:{txt:'LISTENING…', color:'#00ffa3'},
    thinking:{txt:'PROCESSING…', color:'#7c4dff'},
    speaking:{txt:'RESPONDING…', color:'#00e5ff'},
    error:{txt:'ERROR', color:'#ff3860'}
  };
  const cfg = map[state] || map.idle;
  statusText.textContent = cfg.txt;
  statusText.style.color = cfg.color;
  if(subtext) statusSub.textContent = subtext;
}
setAiState('idle');

function animateCore(){
  coreRotation += aiState==='thinking'? 1.4 : aiState==='speaking'? 1.0 : 0.3;
  document.getElementById('ring2').setAttribute('transform', `rotate(${coreRotation} 150 150)`);
  document.getElementById('ring3').setAttribute('transform', `rotate(${-coreRotation*1.4} 150 150)`);
  const scale = aiState==='speaking'? 1+Math.sin(Date.now()/120)*0.06 : aiState==='listening'? 1+Math.sin(Date.now()/200)*0.04 : 1+Math.sin(Date.now()/900)*0.02;
  document.getElementById('core-center').setAttribute('r', 46*scale);
  requestAnimationFrame(animateCore);
}
animateCore();

const waveEl = document.getElementById('voice-wave');
for(let i=0;i<24;i++){
  const s = document.createElement('span');
  s.style.height='6px'; s.style.animationDelay=(i*0.04)+'s'; s.style.animationDuration=(0.5+Math.random()*0.6)+'s';
  waveEl.appendChild(s);
}
function setWaveActive(active){ waveEl.classList.toggle('active', active); }

/* =========================================================================
   WINDOW MANAGER
   ========================================================================= */
let zTop = 100;
let openWindows = {};
let winPosCounter = 0;

function createWindow(id, title, icon, contentHTML, opts={}){
  if(openWindows[id]){
    const w = openWindows[id];
    w.el.classList.remove('minimized');
    focusWindow(id);
    return w;
  }
  const layer = document.getElementById('windows-layer');
  const el = document.createElement('div');
  el.className = 'win glass glow-border';
  const offset = (winPosCounter++ % 6) * 26;
  const width = opts.width || 460, height = opts.height || 420;
  el.style.width = width+'px';
  el.style.height = height+'px';
  el.style.left = (Math.min(window.innerWidth-width-40, 340+offset))+'px';
  el.style.top = (90+offset)+'px';
  el.style.zIndex = ++zTop;
  el.innerHTML = `
    <div class="win-titlebar">
      <div class="win-title">${icon} ${title}</div>
      <div class="win-controls">
        <button class="min" title="Minimize"></button>
        <button class="max" title="Maximize"></button>
        <button class="close" title="Close"></button>
      </div>
    </div>
    <div class="win-body">${contentHTML}</div>
  `;
  layer.appendChild(el);
  makeDraggable(el, el.querySelector('.win-titlebar'));
  el.addEventListener('mousedown', ()=>focusWindow(id));

  el.querySelector('.close').addEventListener('click', (e)=>{ e.stopPropagation(); closeWindow(id); });
  el.querySelector('.min').addEventListener('click', (e)=>{ e.stopPropagation(); el.classList.add('minimized'); Sound.close(); });
  let maximized=false, prevRect=null;
  el.querySelector('.max').addEventListener('click', (e)=>{
    e.stopPropagation();
    if(!maximized){
      prevRect = {left:el.style.left, top:el.style.top, width:el.style.width, height:el.style.height};
      el.style.left='70px'; el.style.top='66px';
      el.style.width=(window.innerWidth-140)+'px'; el.style.height=(window.innerHeight-160)+'px';
      maximized=true;
    } else {
      Object.assign(el.style, prevRect);
      maximized=false;
    }
  });

  Sound.open();
  openWindows[id] = {el, opts};
  focusWindow(id);
  if(opts.onOpen) opts.onOpen(el);
  return openWindows[id];
}
function closeWindow(id){
  const w = openWindows[id];
  if(!w) return;
  if(w.opts.onClose) w.opts.onClose();
  w.el.remove();
  delete openWindows[id];
  Sound.close();
}
function focusWindow(id){
  const w = openWindows[id];
  if(!w) return;
  w.el.style.zIndex = ++zTop;
}
function makeDraggable(el, handle){
  let sx,sy,ox,oy,dragging=false;
  handle.addEventListener('mousedown', e=>{
    if(e.target.tagName==='BUTTON') return;
    dragging = true; sx=e.clientX; sy=e.clientY;
    ox = el.offsetLeft; oy = el.offsetTop;
    el.style.zIndex = ++zTop;
    document.body.style.userSelect='none';
  });
  window.addEventListener('mousemove', e=>{
    if(!dragging) return;
    let nx = ox + (e.clientX-sx), ny = oy + (e.clientY-sy);
    nx = Math.max(-40, Math.min(window.innerWidth-80, nx));
    ny = Math.max(50, Math.min(window.innerHeight-40, ny));
    el.style.left = nx+'px'; el.style.top = ny+'px';
  });
  window.addEventListener('mouseup', ()=>{ dragging=false; document.body.style.userSelect=''; });
  handle.addEventListener('touchstart', e=>{
    const t=e.touches[0]; dragging=true; sx=t.clientX; sy=t.clientY; ox=el.offsetLeft; oy=el.offsetTop; el.style.zIndex=++zTop;
  }, {passive:true});
  window.addEventListener('touchmove', e=>{
    if(!dragging) return;
    const t=e.touches[0];
    el.style.left = (ox+(t.clientX-sx))+'px'; el.style.top=(oy+(t.clientY-sy))+'px';
  }, {passive:true});
  window.addEventListener('touchend', ()=>dragging=false);
}

document.querySelectorAll('[data-open]').forEach(btn=>{
  btn.addEventListener('mouseenter', Sound.hover);
  btn.addEventListener('click', (e)=>{
    Sound.click(); spawnRipple(e);
    openApp(btn.dataset.open);
  });
});
function spawnRipple(e){
  const target = e.currentTarget;
  const r = document.createElement('span');
  r.className='ripple';
  const rect = target.getBoundingClientRect();
  r.style.left=(e.clientX-rect.left)+'px'; r.style.top=(e.clientY-rect.top)+'px';
  target.style.position='relative'; target.appendChild(r);
  setTimeout(()=>r.remove(),650);
}

function openApp(name){
  switch(name){
    case 'chat': return openChatWindow();
    case 'camera': return openCameraWindow();
    case 'calculator': return openCalculatorWindow();
    case 'notes': return openNotesWindow();
    case 'terminal': return openTerminalWindow();
    case 'code': return openCodeWindow();
    case 'music': return openMusicWindow();
    case 'todo': return openTodoWindow();
    case 'settings': return openSettingsWindow();
    case 'weather': return openWeatherWindow();
    case 'calendar': return openCalendarWindow();
    case 'stopwatch': return openStopwatchWindow();
    case 'pomodoro': return openPomodoroWindow();
    case 'colorpicker': return openColorPickerWindow();
    case 'unitconverter': return openUnitConverterWindow();
    case 'qr': return openQRWindow();
    case 'password': return openPasswordWindow();
    case 'browser': return openBrowserWindow();
  }
}

/* =========================================================================
   GEMINI API INTEGRATION
   ========================================================================= */
async function callGemini(promptText, history=[]){
  if(!settings.apiKey){
    toast('Gemini API','No API key set. Open Settings to add one.','🔑');
    throw new Error('NO_KEY');
  }
  const model = 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.apiKey}`;
  const contents = [
    ...history.slice(-16).map(m=>({ role: m.role==='user'?'user':'model', parts:[{text:m.text}] })),
    { role:'user', parts:[{text:promptText}] }
  ];
  const res = await fetch(url, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ contents, generationConfig:{ temperature:0.8, maxOutputTokens:2048 } })
  });
  if(!res.ok){
    const errText = await res.text();
    throw new Error('API_ERROR: '+errText.slice(0,200));
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p=>p.text).join('') || '(No response)';
  return text;
}

function typeText(el, fullText, speed=8){
  return new Promise(resolve=>{
    let i=0;
    const raw = fullText;
    function step(){
      i += Math.max(1, Math.floor(speed*settings.animSpeed));
      el.innerHTML = renderMarkdown(raw.slice(0,i));
      attachCodeCopyButtons(el);
      if(Math.random()<0.15) Sound.type();
      if(i<raw.length){ requestAnimationFrame(step); }
      else { el.innerHTML = renderMarkdown(raw); attachCodeCopyButtons(el); resolve(); }
    }
    step();
  });
}
function renderMarkdown(text){
  try{ return marked.parse(text, {breaks:true}); }
  catch(e){ return text.replace(/</g,'&lt;'); }
}
function attachCodeCopyButtons(container){
  container.querySelectorAll('pre').forEach(pre=>{
    if(pre.querySelector('.copy-btn')) return;
    try{ hljs.highlightElement(pre.querySelector('code')||pre); }catch(e){}
    const btn = document.createElement('button');
    btn.className='btn copy-btn'; btn.textContent='Copy';
    btn.onclick = ()=>{ navigator.clipboard.writeText(pre.innerText); btn.textContent='Copied!'; setTimeout(()=>btn.textContent='Copy',1200); };
    pre.style.position='relative'; pre.appendChild(btn);
  });
}

/* =========================================================================
   CHAT WINDOW
   ========================================================================= */
let chatAbort = false;
function openChatWindow(){
  const html = `
    <div style="display:flex; flex-direction:column; height:100%;">
      <div class="chat-scroll" id="chat-scroll"></div>
      <div class="chat-input-row">
        <textarea id="chat-input" rows="1" placeholder="Message Jarvis…"></textarea>
        <button class="btn primary" id="chat-send">Send</button>
        <button class="btn danger" id="chat-stop" style="display:none;">Stop</button>
      </div>
      <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap;">
        <button class="btn" id="chat-clear" style="font-size:11px; padding:6px 10px;">🗑 Clear</button>
        <button class="btn" id="chat-export" style="font-size:11px; padding:6px 10px;">⬇ Export</button>
        <button class="btn" id="chat-regen" style="font-size:11px; padding:6px 10px;">🔄 Regenerate</button>
      </div>
    </div>`;
  const w = createWindow('chat','AI Chat','💬', html, {width:480, height:560});
  const scroll = w.el.querySelector('#chat-scroll');
  renderChatHistory(scroll);

  const input = w.el.querySelector('#chat-input');
  const sendBtn = w.el.querySelector('#chat-send');
  const stopBtn = w.el.querySelector('#chat-stop');

  function send(){
    const text = input.value.trim();
    if(!text) return;
    input.value='';
    pushChatMessage('user', text, scroll);
    logCommand('Chat: '+text);
    askGeminiInChat(text, scroll, sendBtn, stopBtn);
  }
  sendBtn.onclick = send;
  input.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(); } });
  stopBtn.onclick = ()=>{ chatAbort = true; };
  w.el.querySelector('#chat-clear').onclick = ()=>{ chatHistory=[]; saveChat(); scroll.innerHTML=''; toast('Chat','History cleared','🗑'); };
  w.el.querySelector('#chat-export').onclick = ()=>{
    const blob = new Blob([chatHistory.map(m=>`[${m.role.toUpperCase()}] ${m.text}`).join('\n\n')], {type:'text/plain'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='jarvis-chat.txt'; a.click();
  };
  w.el.querySelector('#chat-regen').onclick = ()=>{
    const lastUser = [...chatHistory].reverse().find(m=>m.role==='user');
    if(lastUser) askGeminiInChat(lastUser.text, scroll, sendBtn, stopBtn, true);
  };
}
function renderChatHistory(scroll){
  scroll.innerHTML='';
  chatHistory.forEach(m=>{
    const div = document.createElement('div');
    div.className = 'msg '+(m.role==='user'?'user':'ai');
    div.innerHTML = renderMarkdown(m.text) + `<div class="msg-meta">${m.role==='user'?'You':'Jarvis'} · ${new Date(m.time||Date.now()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>`;
    scroll.appendChild(div);
    attachCodeCopyButtons(div);
  });
  scroll.scrollTop = scroll.scrollHeight;
}
function pushChatMessage(role, text, scroll){
  chatHistory.push({role, text, time:Date.now()}); saveChat();
  const div = document.createElement('div');
  div.className='msg '+(role==='user'?'user':'ai');
  div.innerHTML = renderMarkdown(text) + `<div class="msg-meta">${role==='user'?'You':'Jarvis'} · now</div>`;
  scroll.appendChild(div);
  scroll.scrollTop = scroll.scrollHeight;
  attachCodeCopyButtons(div);
  return div;
}
async function askGeminiInChat(text, scroll, sendBtn, stopBtn, isRegen=false){
  chatAbort = false;
  setAiState('thinking','Contacting Gemini core…');
  sendBtn.style.display='none'; stopBtn.style.display='inline-flex';
  const typingDiv = document.createElement('div');
  typingDiv.className='msg ai';
  typingDiv.innerHTML = `<div class="typing-dots"><span></span><span></span><span></span></div>`;
  scroll.appendChild(typingDiv); scroll.scrollTop = scroll.scrollHeight;
  try{
    const reply = await callGemini(text, chatHistory.slice(0,-1));
    if(chatAbort){ typingDiv.remove(); sendBtn.style.display='inline-flex'; stopBtn.style.display='none'; setAiState('idle'); return; }
    typingDiv.remove();
    setAiState('speaking','Delivering response…');
    chatHistory.push({role:'ai', text:reply, time:Date.now()});
    saveChat();
    const div = document.createElement('div');
    div.className='msg ai';
    scroll.appendChild(div);
    await typeText(div, reply, 6);
    const meta = document.createElement('div');
    meta.className='msg-meta'; meta.textContent='Jarvis · now';
    div.appendChild(meta);
    scroll.scrollTop = scroll.scrollHeight;
    speak(stripMarkdown(reply).slice(0,600));
  }catch(err){
    typingDiv.remove();
    pushChatMessage('ai', '⚠️ '+(err.message==='NO_KEY'? 'Please add your Gemini API key in Settings.' : 'Error contacting Gemini: '+err.message), scroll);
    Sound.error();
    setAiState('error');
  } finally {
    sendBtn.style.display='inline-flex'; stopBtn.style.display='none';
    setTimeout(()=>setAiState('idle'), 800);
  }
}
function stripMarkdown(t){ return t.replace(/[`*_#>\-]/g,'').replace(/\n+/g,'. '); }

async function quickAsk(text){
  logCommand('Ask: '+text);
  if(!openWindows['chat']) openChatWindow();
  const scroll = openWindows['chat'].el.querySelector('#chat-scroll');
  const sendBtn = openWindows['chat'].el.querySelector('#chat-send');
  const stopBtn = openWindows['chat'].el.querySelector('#chat-stop');
  pushChatMessage('user', text, scroll);
  await askGeminiInChat(text, scroll, sendBtn, stopBtn);
}

/* =========================================================================
   VOICE ASSISTANT — Web Speech API
   ========================================================================= */

function initSpeechRecognition(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ toast('Voice','Speech recognition not supported in this browser','⚠️'); return; }
  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = settings.language;

  recognition.onresult = (e)=>{
    let final='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      if(e.results[i].isFinal) final += e.results[i][0].transcript;
    }
    if(final) handleVoiceInput(final.trim().toLowerCase());
  };
  recognition.onerror = (e)=>{ if(e.error!=='no-speech') console.warn('Speech error', e.error); };
  recognition.onend = ()=>{ if(isListening){ try{ recognition.start(); }catch(e){} } };
}
function startListening(){
  if(!recognition) initSpeechRecognition();
  if(!recognition) return;
  isListening = true;
  try{ recognition.start(); }catch(e){}
  setPill('pill-mic', true);
  document.getElementById('mic-btn').classList.add('listening');
  setWaveActive(true);
  setAiState('listening','Awaiting your command…');
}
function stopListening(){
  isListening = false;
  if(recognition){ try{ recognition.stop(); }catch(e){} }
  setPill('pill-mic', false);
  document.getElementById('mic-btn').classList.remove('listening');
  setWaveActive(false);
  setAiState('idle');
}
document.getElementById('mic-btn').addEventListener('click', ()=>{
  Sound.voice();
  isListening ? stopListening() : startListening();
});

function handleVoiceInput(transcript){
  Sound.voice();
  if(transcript.includes(settings.wakeWord)){
    const cmd = transcript.replace(settings.wakeWord,'').trim();
    if(cmd) executeCommand(cmd);
    else { speak('Yes Commander, I am listening.'); toast('Voice','Wake word detected','🎙️'); }
  } else if(isListening) {
    executeCommand(transcript);
  }
}

let voicesList = [];
function loadVoices(){ voicesList = speechSynthesis.getVoices(); populateVoiceSelect(); }
speechSynthesis.onvoiceschanged = loadVoices; loadVoices();

function speak(text){
  if(!text) return;
  try{
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = settings.speechRate; u.pitch = settings.speechPitch;
    if(settings.speechVoice){
      const v = voicesList.find(v=>v.name===settings.speechVoice);
      if(v) u.voice = v;
    }
    u.onstart = ()=>{ setAiState('speaking'); };
    u.onend = ()=>{ setAiState('idle'); };
    speechSynthesis.speak(u);
  }catch(e){}
}

/* =========================================================================
   COMMAND PROCESSOR (voice + text unified)
   ========================================================================= */
function logCommand(text){
  recentCommands.unshift({text, time:Date.now()});
  saveRecent();
  renderRecentCommands();
}
function renderRecentCommands(){
  const el = document.getElementById('recent-commands');
  if(!recentCommands.length){ el.innerHTML='<div class="empty-hint" style="padding:6px 0;">No commands yet</div>'; return; }
  el.innerHTML = recentCommands.slice(0,8).map(c=>`<div>› ${escapeHtml(c.text)}</div>`).join('');
}
renderRecentCommands();
function escapeHtml(s){ return s.replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

async function executeCommand(raw){
  const cmd = raw.trim().toLowerCase();
  logCommand(raw);
  setAiState('thinking');

  if(cmd.includes('open calculator')){ openCalculatorWindow(); speak('Opening calculator.'); }
  else if(cmd.includes('open notes') || cmd.includes('create note')){ openNotesWindow(); speak('Notes ready.'); }
  else if(cmd.includes('open terminal')){ openTerminalWindow(); speak('Terminal online.'); }
  else if(cmd.includes('open camera') || cmd.includes('gesture')){ openCameraWindow(); speak('Activating camera.'); }
  else if(cmd.includes('open settings')){ openSettingsWindow(); speak('Settings open.'); }
  else if(cmd.includes('open music')){ openMusicWindow(); speak('Music player ready.'); }
  else if(cmd.includes('open chat')){ openChatWindow(); speak('Chat interface ready.'); }
  else if(cmd.includes('search google for')||cmd.startsWith('google ')){
    const q = cmd.replace('search google for','').replace('google','').trim();
    window.open('https://www.google.com/search?q='+encodeURIComponent(q),'_blank');
    speak('Searching Google for '+q);
  }
  else if(cmd.includes('search youtube for')||cmd.startsWith('youtube ')){
    const q = cmd.replace('search youtube for','').replace('youtube','').trim();
    window.open('https://www.youtube.com/results?search_query='+encodeURIComponent(q),'_blank');
    speak('Searching YouTube for '+q);
  }
  else if(cmd.includes('what time') || cmd.includes('current time')){
    const t = new Date().toLocaleTimeString();
    speak('The current time is '+t); toast('Time', t, '🕐');
  }
  else if(cmd.includes('joke')){
    const jokes = [
      "I told my computer I needed a break, and it said no problem, I will go to sleep.",
      "Why do programmers prefer dark mode? Because light attracts bugs.",
      "I would tell you a UDP joke, but you might not get it."
    ];
    const j = jokes[Math.floor(Math.random()*jokes.length)];
    speak(j); toast('Jarvis Humor', j, '😄');
  }
  else if(cmd.includes('read the page') || cmd.includes('read this page')){
    const text = document.body.innerText.slice(0,400);
    speak('Reading visible content. ' + text.slice(0,200));
  }
  else if(cmd.startsWith('ask ') || cmd.includes('gemini')){
    const q = raw.replace(/^ask/i,'').replace(/gemini/i,'').trim();
    await quickAsk(q || raw);
  }
  else {
    await quickAsk(raw);
  }
  setTimeout(()=>setAiState('idle'), 600);
}

const commandInput = document.getElementById('command-input');
commandInput.addEventListener('keydown', e=>{
  if(e.key==='Enter'){
    const val = commandInput.value.trim();
    if(val){ executeCommand(val); commandInput.value=''; }
  }
});
document.addEventListener('keydown', e=>{
  if(e.ctrlKey && e.code==='Space'){ e.preventDefault(); isListening? stopListening():startListening(); }
  if(e.key==='/' && document.activeElement.tagName!=='INPUT' && document.activeElement.tagName!=='TEXTAREA'){ e.preventDefault(); commandInput.focus(); }
});

/* =========================================================================
   HAND GESTURE RECOGNITION — MediaPipe Hands
   ========================================================================= */
let handsInstance=null, cameraInstance=null, gestureCamStream=null;
let gestureLockUntil=0;

function classifyGesture(landmarks){
  const tips=[8,12,16,20], pips=[6,10,14,18];
  let extended=0;
  tips.forEach((t,i)=>{ if(landmarks[t].y < landmarks[pips[i]].y) extended++; });
  const thumbTip=landmarks[4], wrist=landmarks[0];
  const thumbUp = thumbTip.y < wrist.y - 0.08 && extended<=1;
  const thumbDown = thumbTip.y > wrist.y + 0.12 && extended<=1;
  const pinchDist = Math.hypot(landmarks[4].x-landmarks[8].x, landmarks[4].y-landmarks[8].y);

  if(pinchDist < 0.045) return 'Pinch';
  if(extended===0 && !thumbUp && !thumbDown) return 'Closed Fist';
  if(extended===4) return 'Open Palm';
  if(thumbUp) return 'Thumbs Up';
  if(thumbDown) return 'Thumbs Down';
  if(extended===2 && landmarks[8].y<landmarks[6].y && landmarks[12].y<landmarks[10].y) return 'Victory Sign';
  if(extended===1 && landmarks[8].y<landmarks[6].y) return 'Pointing Finger';
  return 'Unknown';
}

function onGestureAction(gesture){
  const now = Date.now();
  if(now < gestureLockUntil) return;
  gestureLockUntil = now + 900;
  Sound.gesture();
  switch(gesture){
    case 'Open Palm': stopListening(); toast('Gesture','Open Palm → Listening Paused','🖐️'); break;
    case 'Closed Fist': startListening(); toast('Gesture','Closed Fist → Listening Started','✊'); break;
    case 'Thumbs Up': toast('Gesture','Thumbs Up → Confirmed','👍'); speak('Confirmed.'); break;
    case 'Thumbs Down': toast('Gesture','Thumbs Down → Cancelled','👎'); speak('Cancelled.'); break;
    case 'Victory Sign': toast('Gesture','Victory Sign detected','✌️'); break;
    case 'Pointing Finger': toast('Gesture','Pointing → Cursor Mode','☝️'); break;
    case 'Pinch': toast('Gesture','Pinch → Click','🤏'); break;
  }
}

async function openCameraWindow(){
  const html = `
    <div class="cam-wrap" id="cam-wrap">
      <video id="gesture-video" autoplay playsinline muted></video>
      <canvas id="gesture-canvas"></canvas>
      <div class="gesture-label">Gesture: <span id="gl-name">None</span></div>
      <div class="gesture-conf">Confidence: <span id="gl-conf">0%</span></div>
    </div>
    <div style="margin-top:10px; font-size:11px; color:var(--text-dim);">
      Supported: Open Palm (pause), Closed Fist (listen), Thumbs Up/Down, Victory, Pointing, Pinch (click).
    </div>`;
  const w = createWindow('camera','Camera & Gesture Control','📷', html, {width:480, height:440, onClose: stopGestureCamera});
  await startGestureCamera(w.el);
}

async function startGestureCamera(container){
  const video = container.querySelector('#gesture-video');
  const canvas = container.querySelector('#gesture-canvas');
  const ctx = canvas.getContext('2d');
  try{
    gestureCamStream = await navigator.mediaDevices.getUserMedia({video:{width:480,height:360}, audio:false});
    video.srcObject = gestureCamStream;
    setPill('pill-cam', true);
    document.getElementById('gesture-cam-status').textContent='Active';
    toast('Camera','Camera feed active','📷');
  }catch(e){
    toast('Camera','Camera access denied or unavailable','⚠️');
    return;
  }

  if(!handsInstance){
    handsInstance = new Hands({locateFile:(f)=>`https://unpkg.com/@mediapipe/hands@0.4.1675469240/${f}`});
    handsInstance.setOptions({maxNumHands:2, modelComplexity:1, minDetectionConfidence:settings.gestureSensitivity, minTrackingConfidence:0.5});
    handsInstance.onResults(onHandResults);
  }

  function onHandResults(results){
    canvas.width = video.videoWidth||480; canvas.height = video.videoHeight||360;
    ctx.save(); ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(results.image,0,0,canvas.width,canvas.height);
    if(results.multiHandLandmarks && results.multiHandLandmarks.length){
      results.multiHandLandmarks.forEach(lm=>{
        if(window.drawConnectors) drawConnectors(ctx, lm, Hands.HAND_CONNECTIONS, {color:'#00e5ff', lineWidth:2});
        if(window.drawLandmarks) drawLandmarks(ctx, lm, {color:'#7c4dff', lineWidth:1, radius:3});
      });
      const g = classifyGesture(results.multiHandLandmarks[0]);
      const conf = Math.round(70+Math.random()*28);
      const glName = container.querySelector('#gl-name'), glConf = container.querySelector('#gl-conf');
      if(glName){ glName.textContent = g; glConf.textContent = conf+'%'; }
      document.getElementById('gesture-name').textContent = g;
      document.getElementById('gesture-conf-txt').textContent = conf+'%';
      if(g!=='Unknown') onGestureAction(g);
    } else {
      const glName = container.querySelector('#gl-name');
      if(glName) glName.textContent='None';
    }
    ctx.restore();
  }

  if(cameraInstance) cameraInstance.stop();
  cameraInstance = new Camera(video, {
    onFrame: async ()=>{ await handsInstance.send({image:video}); },
    width:480, height:360
  });
  cameraInstance.start();
}
function stopGestureCamera(){
  if(gestureCamStream){ gestureCamStream.getTracks().forEach(t=>t.stop()); gestureCamStream=null; }
  if(cameraInstance){ cameraInstance.stop(); cameraInstance=null; }
  setPill('pill-cam', false);
  document.getElementById('gesture-cam-status').textContent='Off';
}

/* =========================================================================
   TERMINAL WINDOW
   ========================================================================= */
function openTerminalWindow(){
  const html = `
    <div class="term-body" id="term-body">
      <div class="term-line">J.A.R.V.I.S. Terminal v2.0 — type 'help' for commands.</div>
    </div>
    <div class="term-input-row" style="padding:8px 4px;">
      <span>jarvis&gt;</span><input id="term-input" autocomplete="off" spellcheck="false"/>
    </div>`;
  const w = createWindow('terminal','Terminal','⌨', html, {width:520, height:400});
  const body = w.el.querySelector('#term-body');
  const input = w.el.querySelector('#term-input');
  input.focus();
  input.addEventListener('keydown', e=>{
    if(e.key==='Enter'){
      const cmd = input.value.trim();
      printTerm(body, `<span style="color:var(--accent);">jarvis&gt;</span> ${escapeHtml(cmd)}`);
      runTerminalCommand(cmd, body);
      input.value='';
    }
  });
  w.el.addEventListener('click', ()=>input.focus());
}
function printTerm(body, html){
  const d = document.createElement('div'); d.className='term-line'; d.innerHTML = html; body.appendChild(d); body.scrollTop = body.scrollHeight;
}
function runTerminalCommand(cmd, body){
  const c = cmd.toLowerCase();
  if(c==='help'){
    printTerm(body, ['help','clear','system','weather','time','ai &lt;prompt&gt;','camera','notes','music','projects','calculator','settings','history','restart','about']
      .map(x=>'  '+x).join('\n'));
  }
  else if(c==='clear'){ body.innerHTML=''; }
  else if(c==='system'){ printTerm(body, `CPU: ${document.getElementById('cpu-val').textContent} | RAM: ${document.getElementById('ram-val').textContent} | FPS: ${document.getElementById('fps-val').textContent}`); }
  else if(c==='weather'){ printTerm(body, `${document.getElementById('weather-temp').textContent} ${document.getElementById('weather-desc').textContent}`); }
  else if(c==='time'){ printTerm(body, new Date().toString()); }
  else if(c.startsWith('ai ')){
    const q = cmd.slice(3);
    printTerm(body, '<i>Contacting Gemini…</i>');
    callGemini(q, chatHistory).then(r=>printTerm(body, stripMarkdown(r))).catch(e=>printTerm(body,'Error: '+e.message));
  }
  else if(c==='camera'){ openCameraWindow(); printTerm(body,'Launching camera module…'); }
  else if(c==='notes'){ openNotesWindow(); printTerm(body,'Notes module launched.'); }
  else if(c==='music'){ openMusicWindow(); printTerm(body,'Music player launched.'); }
  else if(c==='projects'){ printTerm(body,'No active projects registered.'); }
  else if(c==='calculator'){ openCalculatorWindow(); printTerm(body,'Calculator launched.'); }
  else if(c==='settings'){ openSettingsWindow(); printTerm(body,'Settings panel opened.'); }
  else if(c==='history'){ printTerm(body, recentCommands.slice(0,10).map(r=>r.text).join('\n') || 'No history.'); }
  else if(c==='restart'){ printTerm(body,'Restarting neural core…'); setTimeout(()=>location.reload(), 900); }
  else if(c==='about'){ printTerm(body,'J.A.R.V.I.S. AI Operating System v2.0 — Built with Gemini, MediaPipe & Web Speech API.'); }
  else if(c===''){}
  else { printTerm(body, `Unknown command: '${cmd}'. Type 'help'.`); }
}

/* =========================================================================
   CALCULATOR
   ========================================================================= */
function openCalculatorWindow(){
  const html = `
    <div class="calc-display" id="calc-display">0</div>
    <div class="calc-grid" id="calc-grid">
      ${['C','±','%','/','7','8','9','*','4','5','6','-','1','2','3','+','0','.','⌫','='].map(k=>{
        const cls = ['/','*','-','+'].includes(k)?'op':(k==='='?'eq':'');
        return `<button class="${cls}" data-k="${k}">${k}</button>`;
      }).join('')}
    </div>`;
  const w = createWindow('calculator','Calculator','🧮', html, {width:320, height:420});
  const display = w.el.querySelector('#calc-display');
  let expr='';
  w.el.querySelector('#calc-grid').addEventListener('click', e=>{
    const btn = e.target.closest('button'); if(!btn) return;
    const k = btn.dataset.k;
    if(k==='C'){ expr=''; }
    else if(k==='⌫'){ expr = expr.slice(0,-1); }
    else if(k==='±'){ expr = expr.startsWith('-')? expr.slice(1) : '-'+expr; }
    else if(k==='%'){ try{ expr = String(Function('"use strict";return ('+expr+')')()/100); }catch(e){} }
    else if(k==='='){
      try{ expr = String(Function('"use strict";return ('+expr+')')()); }
      catch(e){ expr='Error'; }
    }
    else { expr += k; }
    display.textContent = expr || '0';
  });
}

/* =========================================================================
   NOTES
   ========================================================================= */
function openNotesWindow(){
  const html = `
    <textarea id="note-input" placeholder="Write a note and press Add…" style="width:100%; height:70px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1); border-radius:8px; padding:8px; color:var(--text); resize:none;"></textarea>
    <button class="btn primary" id="note-add" style="margin-top:8px;">+ Add Note</button>
    <div class="notes-list" id="notes-list" style="margin-top:12px;"></div>`;
  const w = createWindow('notes','Notes','📝', html, {width:360, height:420});
  const list = w.el.querySelector('#notes-list');
  function render(){
    list.innerHTML = notesData.length? notesData.map((n,i)=>`<div class="note-item"><span>${escapeHtml(n.text)}</span><button data-i="${i}" class="btn icon-only" style="width:22px;height:22px;font-size:10px;">✕</button></div>`).join('') : '<div class="empty-hint">No notes yet</div>';
  }
  render();
  w.el.querySelector('#note-add').onclick = ()=>{
    const val = w.el.querySelector('#note-input').value.trim();
    if(!val) return;
    notesData.unshift({text:val, time:Date.now()}); saveNotes(); render();
    w.el.querySelector('#note-input').value='';
    toast('Notes','Note saved','📝');
  };
  list.addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    notesData.splice(+b.dataset.i,1); saveNotes(); render();
  });
}

/* =========================================================================
   TODO LIST
   ========================================================================= */
function openTodoWindow(){
  const html = `
    <div style="display:flex; gap:8px;">
      <input id="todo-input" placeholder="New task…" style="flex:1; padding:9px 12px; border-radius:10px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1); color:var(--text);"/>
      <button class="btn primary" id="todo-add">Add</button>
    </div>
    <div id="todo-list" style="margin-top:12px; display:flex; flex-direction:column; gap:6px;"></div>`;
  const w = createWindow('todo','To-Do List','✅', html, {width:360, height:420});
  const list = w.el.querySelector('#todo-list');
  function render(){
    list.innerHTML = todoData.length? todoData.map((t,i)=>`
      <div class="note-item" style="align-items:center;">
        <span style="text-decoration:${t.done?'line-through':'none'}; opacity:${t.done?0.5:1}; cursor:pointer;" data-toggle="${i}">${escapeHtml(t.text)}</span>
        <button data-del="${i}" class="btn icon-only" style="width:22px;height:22px;font-size:10px;">✕</button>
      </div>`).join('') : '<div class="empty-hint">No tasks yet</div>';
  }
  render();
  w.el.querySelector('#todo-add').onclick = ()=>{
    const val = w.el.querySelector('#todo-input').value.trim(); if(!val) return;
    todoData.push({text:val, done:false}); saveTodo(); render();
    w.el.querySelector('#todo-input').value='';
  };
  list.addEventListener('click', e=>{
    if(e.target.dataset.toggle!==undefined && e.target.dataset.toggle!==''){
      todoData[+e.target.dataset.toggle].done = !todoData[+e.target.dataset.toggle].done; saveTodo(); render();
    }
    if(e.target.dataset.del!==undefined && e.target.dataset.del!==''){
      todoData.splice(+e.target.dataset.del,1); saveTodo(); render();
    }
  });
}

/* =========================================================================
   MUSIC PLAYER
   ========================================================================= */
function openMusicWindow(){
  const html = `
    <div style="text-align:center; padding:20px 0;">
      <div style="width:120px;height:120px;border-radius:50%;margin:0 auto 16px;background:conic-gradient(var(--accent),var(--accent2),var(--accent3),var(--accent)); animation:spin 6s linear infinite; box-shadow:0 0 40px rgba(0,229,255,.4);"></div>
      <div id="music-title" style="font-family:'Orbitron'; font-size:14px;">Ambient Focus Loop</div>
      <div style="color:var(--text-dim); font-size:12px; margin-top:4px;">Jarvis Sound Engine</div>
      <div style="display:flex; gap:10px; justify-content:center; margin-top:20px;">
        <button class="btn icon-only" id="music-prev">⏮</button>
        <button class="btn icon-only primary" id="music-play">▶</button>
        <button class="btn icon-only" id="music-next">⏭</button>
      </div>
      <input type="range" id="music-vol" min="0" max="1" step="0.05" value="0.3" style="width:80%; margin-top:20px; accent-color:var(--accent);"/>
    </div>`;
  const w = createWindow('music','Music Player','🎵', html, {width:360, height:400});
  let playing=false, osc=null, ctx=null;
  const tracks=['Ambient Focus Loop','Neural Drift','Cyber Pulse'];
  let idx=0;
  w.el.querySelector('#music-play').onclick = (e)=>{
    playing=!playing;
    e.target.textContent = playing?'⏸':'▶';
    if(playing){
      ctx = ctx || new (window.AudioContext||window.webkitAudioContext)();
      osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.type='sine'; osc.frequency.value = 220+idx*40; g.gain.value = +w.el.querySelector('#music-vol').value*0.15;
      osc.connect(g); g.connect(ctx.destination); osc.start();
    } else if(osc){ osc.stop(); osc=null; }
  };
  w.el.querySelector('#music-next').onclick = ()=>{ idx=(idx+1)%tracks.length; w.el.querySelector('#music-title').textContent=tracks[idx]; };
  w.el.querySelector('#music-prev').onclick = ()=>{ idx=(idx-1+tracks.length)%tracks.length; w.el.querySelector('#music-title').textContent=tracks[idx]; };
}

/* =========================================================================
   CODE WORKSPACE (Monaco via CDN, loaded lazily)
   ========================================================================= */
let monacoLoaded=false;
function openCodeWindow(){
  const html = `
    <div style="display:flex; flex-direction:column; height:100%; gap:8px;">
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <button class="btn" data-lang="html" style="font-size:11px; padding:6px 10px;">HTML</button>
        <button class="btn" data-lang="css" style="font-size:11px; padding:6px 10px;">CSS</button>
        <button class="btn" data-lang="javascript" style="font-size:11px; padding:6px 10px;">JS</button>
        <button class="btn primary" id="code-run" style="font-size:11px; padding:6px 10px;">▶ Run</button>
        <button class="btn" id="code-explain" style="font-size:11px; padding:6px 10px;">✨ Explain</button>
        <button class="btn" id="code-debug" style="font-size:11px; padding:6px 10px;">🐞 Debug</button>
        <button class="btn" id="code-optimize" style="font-size:11px; padding:6px 10px;">⚡ Optimize</button>
      </div>
      <div id="monaco-container" style="flex:1; min-height:180px; border-radius:10px; overflow:hidden; border:1px solid rgba(255,255,255,.08);"></div>
      <iframe id="code-preview" style="height:120px; border-radius:10px; border:1px solid rgba(255,255,255,.08); background:#fff;"></iframe>
      <div id="code-ai-output" style="max-height:100px; overflow-y:auto; font-size:12px; color:var(--text-dim);"></div>
    </div>`;
  const w = createWindow('code','Code Workspace','🧑‍💻', html, {width:640, height:640});
  const container = w.el.querySelector('#monaco-container');
  const preview = w.el.querySelector('#code-preview');
  const aiOut = w.el.querySelector('#code-ai-output');
  let editor=null, currentLang='html';
  const templates = {
    html:'<!-- Write HTML here -->\n<h1>Hello, Jarvis!</h1>',
    css:'/* Write CSS here */\nh1{ color:#00e5ff; font-family:sans-serif; }',
    javascript:'// Write JS here\nconsole.log("Hello from Jarvis code workspace");'
  };

  function loadMonaco(cb){
    if(monacoLoaded){ cb(); return; }
    const loaderScript = document.createElement('script');
    loaderScript.src='https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js';
    loaderScript.onload = ()=>{
      require.config({ paths:{vs:'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs'} });
      require(['vs/editor/editor.main'], ()=>{ monacoLoaded=true; cb(); });
    };
    document.head.appendChild(loaderScript);
  }
  loadMonaco(()=>{
    editor = monaco.editor.create(container, { value: templates.html, language:'html', theme:'vs-dark', automaticLayout:true, fontSize:13, minimap:{enabled:false} });
  });

  w.el.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click', ()=>{
    currentLang = b.dataset.lang;
    if(editor){ monaco.editor.setModelLanguage(editor.getModel(), currentLang); editor.setValue(templates[currentLang]); }
  }));

  w.el.querySelector('#code-run').onclick = ()=>{
    const code = editor? editor.getValue() : '';
    const doc = currentLang==='html'? code : currentLang==='css'? `<style>${code}</style>` : `<script>${code}<\/script>`;
    preview.srcdoc = `<html><body>${doc}</body></html>`;
    Sound.click();
  };
  async function askCodeAI(action){
    const code = editor? editor.getValue() : '';
    aiOut.textContent = 'Thinking…';
    try{
      const prompt = `${action} the following ${currentLang} code. Be concise:\n\n${code}`;
      const r = await callGemini(prompt);
      aiOut.innerHTML = renderMarkdown(r);
      attachCodeCopyButtons(aiOut);
    }catch(e){ aiOut.textContent = 'Error: '+e.message; }
  }
  w.el.querySelector('#code-explain').onclick = ()=>askCodeAI('Explain');
  w.el.querySelector('#code-debug').onclick = ()=>askCodeAI('Find and fix bugs in');
  w.el.querySelector('#code-optimize').onclick = ()=>askCodeAI('Optimize');
}

/* =========================================================================
   SETTINGS WINDOW
   ========================================================================= */
function populateVoiceSelect(){
  const sel = document.getElementById('voice-select');
  if(!sel) return;
  sel.innerHTML = '<option value="">Default</option>' + voicesList.map(v=>`<option value="${v.name}" ${settings.speechVoice===v.name?'selected':''}>${v.name} (${v.lang})</option>`).join('');
}
function openSettingsWindow(){
  const colors = ['#00e5ff','#7c4dff','#00ffa3','#ff3860','#ffb800','#ff6ec7'];
  const html = `
    <div class="settings-grid">
      <div class="setting-group">
        <label>GEMINI API KEY</label>
        <input type="password" id="set-apikey" placeholder="Enter your Gemini API key" value="${settings.apiKey}"/>
        <div style="font-size:10px; color:var(--text-dim); margin-top:4px;">Get a free key at Google AI Studio. Stored locally only.</div>
      </div>
      <div class="setting-group">
        <label>ACCENT COLOR</label>
        <div class="color-swatches" id="color-swatches">
          ${colors.map(c=>`<div class="swatch ${settings.accent===c?'active':''}" data-color="${c}" style="background:${c}"></div>`).join('')}
        </div>
      </div>
      <div class="setting-group toggle-row">
        <label style="margin:0;">DARK / LIGHT THEME</label>
        <label class="switch"><input type="checkbox" id="set-theme" ${settings.theme==='light'?'checked':''}/><span class="slider-toggle"></span></label>
      </div>
      <div class="setting-group">
        <label>ANIMATION SPEED (${settings.animSpeed}x)</label>
        <input type="range" id="set-anim" min="0.3" max="2" step="0.1" value="${settings.animSpeed}"/>
      </div>
      <div class="setting-group">
        <label>PARTICLE DENSITY (${settings.particleDensity}x)</label>
        <input type="range" id="set-particles" min="0" max="2" step="0.1" value="${settings.particleDensity}"/>
      </div>
      <div class="setting-group">
        <label>GESTURE SENSITIVITY</label>
        <input type="range" id="set-gesture" min="0.3" max="0.95" step="0.05" value="${settings.gestureSensitivity}"/>
      </div>
      <div class="setting-group">
        <label>SPEECH RATE</label>
        <input type="range" id="set-rate" min="0.5" max="2" step="0.1" value="${settings.speechRate}"/>
      </div>
      <div class="setting-group">
        <label>SPEECH VOICE</label>
        <select id="voice-select"></select>
      </div>
      <div class="setting-group">
        <label>LANGUAGE</label>
        <select id="set-lang">
          <option value="en-US" ${settings.language==='en-US'?'selected':''}>English (US)</option>
          <option value="en-GB" ${settings.language==='en-GB'?'selected':''}>English (UK)</option>
          <option value="hi-IN" ${settings.language==='hi-IN'?'selected':''}>Hindi</option>
          <option value="es-ES" ${settings.language==='es-ES'?'selected':''}>Spanish</option>
        </select>
      </div>
      <div class="setting-group">
        <label>SOUND VOLUME</label>
        <input type="range" id="set-volume" min="0" max="1" step="0.05" value="${settings.soundVolume}"/>
      </div>
      <button class="btn primary" id="set-save">💾 Save Settings</button>
      <button class="btn danger" id="set-reset">Reset to Defaults</button>
    </div>`;
  const w = createWindow('settings','Settings','⚙', html, {width:400, height:640});
  populateVoiceSelect();

  w.el.querySelector('#color-swatches').addEventListener('click', e=>{
    const s = e.target.closest('.swatch'); if(!s) return;
    settings.accent = s.dataset.color; saveSettings();
    w.el.querySelectorAll('.swatch').forEach(x=>x.classList.remove('active'));
    s.classList.add('active');
  });
  w.el.querySelector('#set-save').onclick = ()=>{
    settings.apiKey = w.el.querySelector('#set-apikey').value.trim();
    settings.animSpeed = +w.el.querySelector('#set-anim').value;
    settings.particleDensity = +w.el.querySelector('#set-particles').value;
    settings.gestureSensitivity = +w.el.querySelector('#set-gesture').value;
    settings.speechRate = +w.el.querySelector('#set-rate').value;
    settings.speechVoice = w.el.querySelector('#voice-select').value;
    settings.language = w.el.querySelector('#set-lang').value;
    settings.soundVolume = +w.el.querySelector('#set-volume').value;
    settings.theme = w.el.querySelector('#set-theme').checked? 'light':'dark';
    saveSettings(); initParticles(); updateGeminiPill();
    if(recognition) recognition.lang = settings.language;
    toast('Settings','Preferences saved','⚙️');
  };
  w.el.querySelector('#set-reset').onclick = ()=>{
    settings = {...DEFAULTS}; saveSettings(); closeWindow('settings'); openSettingsWindow();
    toast('Settings','Reset to defaults','🔄');
  };
}

/* =========================================================================
   EXTRA MINI APPS
   ========================================================================= */
function openWeatherWindow(){
  createWindow('weather','Weather','🌦',
    `<div class="weather-hero"><div class="temp">${document.getElementById('weather-temp').textContent}</div><div class="desc">${document.getElementById('weather-desc').textContent}</div></div>`,
    {width:300, height:220});
}
function openCalendarWindow(){
  const now = new Date();
  const year=now.getFullYear(), month=now.getMonth();
  const first = new Date(year,month,1).getDay();
  const days = new Date(year,month+1,0).getDate();
  let cells='';
  for(let i=0;i<first;i++) cells+='<div></div>';
  for(let d=1;d<=days;d++) cells+=`<div style="padding:6px; text-align:center; border-radius:6px; ${d===now.getDate()?'background:var(--accent); color:#031014; font-weight:700;':''}">${d}</div>`;
  createWindow('calendar','Calendar','📅', `
    <div style="text-align:center; font-family:'Orbitron'; margin-bottom:10px;">${now.toLocaleDateString([],{month:'long',year:'numeric'})}</div>
    <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:4px; font-size:12px;">
      ${['S','M','T','W','T','F','S'].map(d=>`<div style="text-align:center; color:var(--text-dim);">${d}</div>`).join('')}
      ${cells}
    </div>`, {width:320, height:380});
}
function openStopwatchWindow(){
  const html = `<div style="text-align:center;">
    <div id="sw-display" style="font-family:'Orbitron'; font-size:38px; margin:20px 0;">00:00.00</div>
    <button class="btn primary" id="sw-start">Start</button>
    <button class="btn" id="sw-reset">Reset</button>
  </div>`;
  const w = createWindow('stopwatch','Stopwatch','⏱', html, {width:300, height:220});
  let t0=0, elapsed=0, timer=null, running=false;
  const disp = w.el.querySelector('#sw-display');
  function fmt(ms){ const m=Math.floor(ms/60000), s=Math.floor((ms%60000)/1000), cs=Math.floor((ms%1000)/10); return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`; }
  w.el.querySelector('#sw-start').onclick = (e)=>{
    running=!running; e.target.textContent = running?'Pause':'Start';
    if(running){ t0=Date.now()-elapsed; timer=setInterval(()=>{ elapsed=Date.now()-t0; disp.textContent=fmt(elapsed); },30); }
    else clearInterval(timer);
  };
  w.el.querySelector('#sw-reset').onclick = ()=>{ clearInterval(timer); running=false; elapsed=0; disp.textContent='00:00.00'; w.el.querySelector('#sw-start').textContent='Start'; };
}
function openPomodoroWindow(){
  const html = `<div style="text-align:center;">
    <div id="pomo-display" style="font-family:'Orbitron'; font-size:44px; margin:20px 0;">25:00</div>
    <button class="btn primary" id="pomo-start">Start Focus</button>
    <button class="btn" id="pomo-reset">Reset</button>
  </div>`;
  const w = createWindow('pomodoro','Pomodoro Timer','🍅', html, {width:300, height:220});
  let secs=25*60, timer=null, running=false;
  const disp = w.el.querySelector('#pomo-display');
  function fmt(s){ return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
  w.el.querySelector('#pomo-start').onclick = (e)=>{
    running=!running; e.target.textContent = running?'Pause':'Start Focus';
    if(running){ timer=setInterval(()=>{ secs--; disp.textContent=fmt(secs); if(secs<=0){ clearInterval(timer); speak('Focus session complete.'); toast('Pomodoro','Session complete!','🍅'); running=false; } },1000); }
    else clearInterval(timer);
  };
  w.el.querySelector('#pomo-reset').onclick = ()=>{ clearInterval(timer); running=false; secs=25*60; disp.textContent='25:00'; w.el.querySelector('#pomo-start').textContent='Start Focus'; };
}
function openColorPickerWindow(){
  const html = `<input type="color" id="cp-input" value="#00e5ff" style="width:100%; height:60px; border:none; border-radius:10px; background:transparent;"/>
    <div id="cp-hex" class="mono" style="text-align:center; margin-top:10px; font-size:16px;">#00E5FF</div>`;
  const w = createWindow('colorpicker','Color Picker','🎨', html, {width:280, height:200});
  w.el.querySelector('#cp-input').addEventListener('input', e=>{ w.el.querySelector('#cp-hex').textContent = e.target.value.toUpperCase(); });
}
function openUnitConverterWindow(){
  const html = `
    <div class="setting-group"><label>From (km)</label><input type="text" id="uc-from" value="1"/></div>
    <div class="setting-group"><label>To (miles)</label><input type="text" id="uc-to" readonly/></div>`;
  const w = createWindow('unitconverter','Unit Converter','📐', html, {width:300, height:220});
  const f = w.el.querySelector('#uc-from'), t = w.el.querySelector('#uc-to');
  function calc(){ t.value = (parseFloat(f.value||0)*0.621371).toFixed(3); }
  f.addEventListener('input', calc); calc();
}
function openQRWindow(){
  const html = `<div class="setting-group"><label>Text / URL</label><input type="text" id="qr-text" value="https://jarvis.ai"/></div>
    <div style="text-align:center; margin-top:12px;"><img id="qr-img" style="width:180px;height:180px; border-radius:10px; background:#fff; padding:8px;"/></div>`;
  const w = createWindow('qr','QR Generator','🔳', html, {width:300, height:340});
  const inp = w.el.querySelector('#qr-text'), img = w.el.querySelector('#qr-img');
  function update(){ img.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(inp.value)}`; }
  inp.addEventListener('input', update); update();
}
function openPasswordWindow(){
  const html = `
    <div id="pw-display" class="calc-display mono" style="font-size:16px;">–</div>
    <div class="setting-group"><label>Length: <span id="pw-len-val">16</span></label><input type="range" id="pw-len" min="6" max="32" value="16"/></div>
    <button class="btn primary" id="pw-gen" style="width:100%;">🎲 Generate</button>`;
  const w = createWindow('password','Password Generator','🔐', html, {width:320, height:260});
  const disp = w.el.querySelector('#pw-display');
  const len = w.el.querySelector('#pw-len'), lenVal = w.el.querySelector('#pw-len-val');
  len.addEventListener('input', ()=>lenVal.textContent=len.value);
  function gen(){
    const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let p=''; for(let i=0;i<+len.value;i++) p+=chars[Math.floor(Math.random()*chars.length)];
    disp.textContent=p;
  }
  w.el.querySelector('#pw-gen').onclick = gen; gen();
}
function openBrowserWindow(){
  const html = `
    <div style="display:flex; gap:6px; margin-bottom:8px;">
      <input id="br-url" type="text" value="https://www.wikipedia.org" style="flex:1; padding:8px; border-radius:8px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.1); color:var(--text);"/>
      <button class="btn primary" id="br-go">Go</button>
    </div>
    <iframe id="br-frame" src="https://www.wikipedia.org" style="width:100%; height:calc(100% - 46px); border-radius:8px; border:1px solid rgba(255,255,255,.1);"></iframe>`;
  const w = createWindow('browser','Browser','🌐', html, {width:560, height:480});
  w.el.querySelector('#br-go').onclick = ()=>{
    let u = w.el.querySelector('#br-url').value.trim();
    if(!/^https?:\/\//.test(u)) u='https://'+u;
    w.el.querySelector('#br-frame').src = u;
  };
}

/* =========================================================================
   INIT APP (post-boot)
   ========================================================================= */
function initApp(){
  toast('J.A.R.V.I.S.','All systems online, Commander.','🤖');
  speak('All systems online, Commander.');
  initSpeechRecognition();
  checkSecureContext();
  document.querySelectorAll('.btn, .dock-btn').forEach(el=>{
    el.addEventListener('mouseenter', ()=>{ if(Math.random()<0.5) Sound.hover(); });
  });
}
