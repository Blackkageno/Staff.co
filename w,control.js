// ── CONFIG ──
const STORAGE_KEY = 'lug_master_storage';
const REQ_KEY = 'lug_requests';
const PIN_KEY = 'lug_pin';
const DEFAULT_PIN = '5460';
const SYNC_CHANNEL = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lugares-sync') : null;

// ── STORAGE HELPERS ──
let firebaseRequests = [];
function getData(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}catch{return{}}}
function saveData(d){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(d));
  if(SYNC_CHANNEL){
    SYNC_CHANNEL.postMessage({type:'workspace-updated', storageKey:STORAGE_KEY, payload:d});
  }
}
function getRequests(){
  // Use Firebase data if available, fallback to localStorage
  if(firebaseRequests && firebaseRequests.length > 0) return firebaseRequests;
  try{return JSON.parse(localStorage.getItem(REQ_KEY)||'[]')}catch{return[]}
}
function saveRequests(r){localStorage.setItem(REQ_KEY,JSON.stringify(r))}
function getPin(){return localStorage.getItem(PIN_KEY)||DEFAULT_PIN}

// ── FIREBASE SYNC ──
function watchFirebaseRequests(){
  if(typeof db === 'undefined' || !db.ref) return;
  db.ref('requests').orderByChild('time').limitToLast(100).on('value', snap => {
    const raw = snap.val();
    firebaseRequests = [];
    if(raw){
      firebaseRequests = Object.keys(raw).map(key => ({id: raw[key].id || Date.now(), ...raw[key]}));
      firebaseRequests.sort((a,b)=>b.id - a.id);
    }
    saveRequests(firebaseRequests);
    if(currentPanel === 'requests') renderRequests();
    refreshDash();
    refreshUnread();
  }, err => console.warn('Firebase requests sync failed', err));
}

function handleWorkerMessage(event){
  if(!event.data || typeof event.data !== 'object') return;
  if(event.data.type === 'portal-opened'){
    console.log('Worker panel received portal-opened:', event.data);
  }
}

function initWindowBridge(){
  window.addEventListener('message', handleWorkerMessage);
  if(window.opener){
    window.opener.postMessage({type:'worker-ready'}, '*');
  }
}

// ── LOCK SCREEN ──
let pinEntry='';
function pinKey(k){
  if(pinEntry.length>=4)return;
  pinEntry+=k;
  updateDots();
  if(pinEntry.length===4)setTimeout(checkPin,120);
}
function pinClear(){pinEntry='';updateDots();document.getElementById('lockError').textContent=''}
function pinBack(){pinEntry=pinEntry.slice(0,-1);updateDots()}
function updateDots(){
  for(let i=0;i<4;i++)document.getElementById('d'+i).classList.toggle('filled',i<pinEntry.length);
}
function checkPin(){
  if(pinEntry===getPin()){
    document.getElementById('lockScreen').style.display='none';
    document.getElementById('app').style.display='block';
    refreshDash();
    refreshUnread();
  } else {
    document.getElementById('lockError').textContent='Incorrect PIN. Try again.';
    document.getElementById('lockScreen').classList.add('shake');
    setTimeout(()=>document.getElementById('lockScreen').classList.remove('shake'),350);
    pinEntry='';updateDots();
  }
}

// ── SIDEBAR ──
let currentPanel='dashboard';
function showPanel(id){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(b=>b.classList.remove('active'));
  const p=document.getElementById(id+'Panel');
  if(p)p.classList.add('active');
  const sb=document.getElementById('sb-'+id);
  if(sb)sb.classList.add('active');
  currentPanel=id;
  document.getElementById('dashboardPanel').style.display = id==='dashboard'?'block':'none';
  document.getElementById('backBtn').style.display = id==='dashboard'?'none':'block';
  if(id==='requests')renderRequests();
  if(id==='services')renderLists();
  if(id==='staff')renderLists();
  if(id==='executive')renderLists();
  if(id==='projects')renderLists();
  if(id==='dashboard'){document.getElementById('dashboardPanel').classList.add('active');refreshDash();}
  closeSidebar();
}
function goBack(){showPanel('dashboard')}
function openSidebar(){document.getElementById('sidebar').classList.add('open');document.getElementById('overlay').classList.add('open')}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('overlay').classList.remove('open')}

// ── DASHBOARD ──
function refreshDash(){
  const d=getData();const r=getRequests();
  document.getElementById('dReq').textContent=r.length;
  document.getElementById('dSvc').textContent=(d.services||[]).length;
  document.getElementById('dPrj').textContent=(d.projects||[]).length;
  document.getElementById('dStf').textContent=(d.staff||[]).length;
  document.getElementById('dExc').textContent=(d.executives||[]).length;
  const recent=r.slice(0,5);
  const el=document.getElementById('recentActivity');
  if(!recent.length){el.innerHTML='<div style="color:var(--text3);font-family:\'IBM Plex Mono\',monospace;font-size:13px;padding:20px 0">No requests yet.</div>';return}
  el.innerHTML=recent.map(r=>`<div class="activity-item"><div class="activity-dot" style="background:${r.read?'var(--text3)':'var(--accent2)'}"></div><div><strong style="color:var(--text)">${r.name}</strong> — ${r.service} <span style="color:var(--text3);font-size:12px">(${r.time})</span></div></div>`).join('');
}
function refreshUnread(){
  const r=getRequests();
  const u=r.filter(x=>!x.read).length;
  const b=document.getElementById('unreadBadge');
  if(u>0){b.textContent=u;b.style.display='flex'}else{b.style.display='none'}
}

// ── REQUESTS ──
function renderRequests(){
  const reqs=getRequests();
  const list=document.getElementById('reqList');
  const count=document.getElementById('reqCount');
  const unread=reqs.filter(r=>!r.read).length;
  count.textContent=`${reqs.length} total · ${unread} unread`;
  if(!reqs.length){list.innerHTML='<div class="req-empty">No requests yet. They will appear here when customers submit inquiries from the portal.</div>';return}
  list.innerHTML=reqs.map((r,i)=>`
    <div class="req-card ${r.read?'':'unread'}" id="rc${r.id}">
      <div class="req-card-head">
        <div class="req-name">${r.read?'':' <span class="unread-dot"></span>'}${r.name}</div>
        <div class="req-time">${r.time}</div>
      </div>
      <div class="req-contact">${r.contact}</div>
      <div><span class="req-service">${r.service}</span></div>
      ${r.message?`<div class="req-message">${escHtml(r.message)}</div>`:''}
      <div class="req-actions">
        ${!r.read?`<button class="btn-read" onclick="markRead(${r.id})">✓ Mark Read</button>`:'<span style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:var(--text3)">✓ Read</span>'}
        <button class="btn-wa-reply" onclick="waReply('${escAttr(r.name)}','${escAttr(r.contact)}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Reply
        </button>
        <button class="btn-del" onclick="deleteReq(${r.id})">Delete</button>
      </div>
    </div>`).join('');
  refreshUnread();
}
function markRead(id){
  const r=getRequests();
  const idx=r.findIndex(x=>x.id===id);
  if(idx>-1){r[idx].read=true;saveRequests(r);renderRequests();refreshDash()}
}
function deleteReq(id){
  const r=getRequests().filter(x=>x.id!==id);
  saveRequests(r);renderRequests();refreshDash();
}
function clearRequests(){
  if(confirm('Clear all requests? This cannot be undone.')){saveRequests([]);renderRequests();refreshDash()}
}
function waReply(name,contact){
  const num=contact.replace(/\D/g,'');
  const prefix=num.length===9?'254'+num:num.length===10?'254'+num.slice(1):num;
  const msg=`Hello ${name}, this is LUGARES Group regarding your recent inquiry. How can we assist you today?`;
  window.open(`https://wa.me/${prefix}?text=${encodeURIComponent(msg)}`,'_blank');
}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function escAttr(s){return String(s).replace(/'/g,"\\'")}

// ── SERVICES ──
function addService(){
  const name=document.getElementById('svcName').value.trim();
  if(!name){alert('Service name required');return}
  const d=getData();
  d.services=d.services||[];
  d.services.push({name,icon:document.getElementById('svcIcon').value||'⚙️',tag:document.getElementById('svcTag').value||'Service',desc:document.getElementById('svcDesc').value});
  saveData(d);
  ['svcName','svcIcon','svcTag','svcDesc'].forEach(id=>document.getElementById(id).value='');
  renderLists();
}

// ── PROJECTS ──
function addProject(){
  const name=document.getElementById('prjName').value.trim();
  if(!name){alert('Project name required');return}
  const d=getData();
  d.projects=d.projects||[];
  d.projects.push({name,status:document.getElementById('prjStatus').value,location:document.getElementById('prjLocation').value,category:document.getElementById('prjCat').value,desc:document.getElementById('prjDesc').value});
  saveData(d);
  ['prjName','prjLocation','prjCat','prjDesc'].forEach(id=>document.getElementById(id).value='');
  renderLists();
}

// ── STAFF ──
function addStaff(){
  const name=document.getElementById('stfName').value.trim();
  if(!name){alert('Name required');return}
  const d=getData();
  d.staff=d.staff||[];
  d.staff.push({name,role:document.getElementById('stfRole').value,dept:document.getElementById('stfDept').value});
  saveData(d);
  ['stfName','stfRole','stfDept'].forEach(id=>document.getElementById(id).value='');
  renderLists();
}

// ── EXECUTIVE ──
function addExec(){
  const name=document.getElementById('excName').value.trim();
  if(!name){alert('Name required');return}
  const d=getData();
  d.executives=d.executives||[];
  d.executives.push({name,role:document.getElementById('excRole').value,dept:document.getElementById('excDept').value});
  saveData(d);
  ['excName','excRole','excDept'].forEach(id=>document.getElementById(id).value='');
  renderLists();
}

// ── RENDER LIVE LISTS ──
function renderLists(){
  const d=getData();
  // Services
  const sl=document.getElementById('svcList');
  if(sl){const a=d.services||[];sl.innerHTML=a.length?`<div class="live-list-title">${a.length} custom service${a.length!==1?'s':''}</div>`+a.map((s,i)=>`<div class="live-item"><div class="live-item-info"><div class="live-item-name">${s.icon} ${s.name}</div><div class="live-item-sub">${s.tag}</div></div><button class="btn-remove" onclick="removeItem('services',${i})">Remove</button></div>`).join(''):'<div class="empty-list">No custom services yet.</div>'}
  // Projects
  const pl=document.getElementById('prjList');
  if(pl){const a=d.projects||[];pl.innerHTML=a.length?`<div class="live-list-title">${a.length} project${a.length!==1?'s':''}</div>`+a.map((p,i)=>`<div class="live-item"><div class="live-item-info"><div class="live-item-name">${p.name}</div><div class="live-item-sub">${p.status} · ${p.location||'–'}</div></div><button class="btn-remove" onclick="removeItem('projects',${i})">Remove</button></div>`).join(''):'<div class="empty-list">No projects added yet.</div>'}
  // Staff
  const stl=document.getElementById('stfList');
  if(stl){const a=d.staff||[];stl.innerHTML=a.length?`<div class="live-list-title">${a.length} staff member${a.length!==1?'s':''}</div>`+a.map((s,i)=>`<div class="live-item"><div class="live-item-info"><div class="live-item-name">${s.name}</div><div class="live-item-sub">${s.role||'–'}</div></div><button class="btn-remove" onclick="removeItem('staff',${i})">Remove</button></div>`).join(''):'<div class="empty-list">No staff added yet.</div>'}
  // Exec
  const el=document.getElementById('excList');
  if(el){const a=d.executives||[];el.innerHTML=a.length?`<div class="live-list-title">${a.length} executive${a.length!==1?'s':''}</div>`+a.map((e,i)=>`<div class="live-item"><div class="live-item-info"><div class="live-item-name">${e.name}</div><div class="live-item-sub">${e.role||'–'}</div></div><button class="btn-remove" onclick="removeItem('executives',${i})">Remove</button></div>`).join(''):'<div class="empty-list">No executives added yet.</div>'}
  refreshDash();
}
function removeItem(key,idx){
  const d=getData();
  if(d[key])d[key].splice(idx,1);
  saveData(d);renderLists();
}

// ── PUBLISH ──
function publishAll(){
  const t=document.getElementById('toast');
  t.style.display='block';
  setTimeout(()=>t.style.display='none',3000);
  const d=getData();
  saveData(d);
  if(window.opener){
    window.opener.postMessage({type:'worker-published', storageKey:STORAGE_KEY, payload:d}, '*');
  }
}

// ── CLEAR ALL ──
function clearAll(){
  if(confirm('Clear ALL portal data? Staff, services, projects, executives will be removed.')){
    saveData({});renderLists();refreshDash();showToast('All data cleared.');}
}
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.style.display='block';
  setTimeout(()=>{t.textContent='✓ Published to portal!';t.style.display='none'},2500);
}

// ── PIN MODAL ──
function openPinModal(){document.getElementById('pinModal').classList.add('open')}
function closePinModal(){document.getElementById('pinModal').classList.remove('open');['curPin','newPin','conPin'].forEach(id=>document.getElementById(id).value='');document.getElementById('pinModalErr').textContent=''}
function savePin(){
  const cur=document.getElementById('curPin').value;
  const nw=document.getElementById('newPin').value;
  const con=document.getElementById('conPin').value;
  const err=document.getElementById('pinModalErr');
  if(cur!==getPin()){err.textContent='Current PIN is incorrect.';return}
  if(nw.length!==4||!/^\d{4}$/.test(nw)){err.textContent='New PIN must be 4 digits.';return}
  if(nw!==con){err.textContent='PINs do not match.';return}
  localStorage.setItem(PIN_KEY,nw);
  closePinModal();showToast('PIN updated successfully!');
}

// ── INIT ──
refreshUnread();
initWindowBridge();
watchFirebaseRequests();
