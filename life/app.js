'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const statuses = ['Not Started', 'In Progress', 'Blocked', 'Done'];
const statusNames = ['시작 전', '진행 중', '막힘', '완료'];
const priorityNames = {High:'높음', Medium:'보통', Low:'낮음'};
const key = 'life-workspace-v1';
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today = () => iso(new Date());
const offset = (day, n) => { const d = new Date(day+'T12:00:00'); d.setDate(d.getDate()+n); return iso(d); };
const delta = day => day ? Math.round((Date.parse(day+'T00:00:00Z')-Date.parse(today()+'T00:00:00Z'))/86400000) : null;
const week = () => { const d = new Date(); return Array.from({length:7}, (_,i) => offset(today(), i-(d.getDay()+6)%7)); };
let state, view = 'today', filter = 'active', layout = 'list', projectFilter = '', search = '', selectedId = '', token = '', localServer = false, github = {}, saving = Promise.resolve();
let calendarDate=today(), calendarLayout='month', goalDate=today(), goalPeriod='month';
let grassYear=new Date().getFullYear(), grassHabit='', grassDate=today();
let syncInfo={state:'pending',message:'저장 상태 확인 중'},syncBusy=false;
const collapsedTasks=new Set(Array.isArray(listPrefs.collapsed)?listPrefs.collapsed:[]);
const empty = () => ({version:1, coreValue:'나에게 중요한 일부터', projects:[], tasks:[], habits:[], goals:[]});
const projectOf = t => state.projects.find(p=>p.id===t.project) || {id:'',name:'미분류',color:'#8b95a1'};
const taskOf = id => state.tasks.find(t=>t.id===id);
const complete = t => t.status === 'Done';
const options = (values, labels, value) => values.map((v,i)=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(labels[i])}</option>`).join('');
function toast(message, error = false) { const n = document.createElement('div'); n.className='toast'+(error?' error':''); n.textContent=message; $('#toast-region').append(n); setTimeout(()=>n.remove(),4500); }
function validate(s) {
  if (!s || s.version!==1 || !['tasks','projects','habits'].every(k=>Array.isArray(s[k]))) throw Error('앱 백업 파일을 선택해줘.');
  for (const k of ['tasks','projects','habits']) {
    if (s[k].length>10000 || new Set(s[k].map(x=>x.id)).size!==s[k].length) throw Error('중복 식별자 또는 너무 많은 항목이 있어.');
    for(const x of s[k]) if(!x || typeof x.id!=='string' || typeof x[k==='tasks'?'title':'name']!=='string') throw Error('백업 항목 형식이 올바르지 않아.');
  }
  for (const t of s.tasks) if(!statuses.includes(t.status) || !priorityNames[t.priority] || (t.due && !/^\d{4}-\d{2}-\d{2}$/.test(t.due))) throw Error('할 일 상태나 날짜가 올바르지 않아.');
  for (const p of s.projects) { if(!/^#[0-9a-f]{6}$/i.test(p.color)) p.color='#3182f6'; p.priority ||= 'Medium'; if(!priorityNames[p.priority])throw Error('프로젝트 우선순위를 확인해줘.'); }
  for(const item of [...s.projects,...s.tasks]){item.type ||= '일반';if(typeof item.type!=='string'||item.type.length>40)throw Error('유형은 40자 이내로 입력해줘.');}
  for (const h of s.habits) { h.entries ||= {}; if(typeof h.entries!=='object' || Array.isArray(h.entries)) throw Error('습관 기록 형식이 올바르지 않아.'); for(const [day,v] of Object.entries(h.entries))if((!validDate(day)&&day!=='Avg')||!Number.isFinite(v)||v<0||v>100)throw Error('습관 달성률을 확인해줘.'); h.counts ??= {}; if(typeof h.counts!=='object'||h.counts===null||Array.isArray(h.counts)||Object.entries(h.counts).some(([day,v])=>!validDate(day)||!Number.isInteger(v)||v<0||v>9999))throw Error('습관 횟수를 확인해줘.'); h.weeklyTarget ??= 7; if(!Number.isInteger(h.weeklyTarget)||h.weeklyTarget<1||h.weeklyTarget>7)throw Error('습관 주간 목표를 확인해줘.'); }
  s.goals ??= [];
  if(!Array.isArray(s.goals)||s.goals.length>10000||new Set(s.goals.map(g=>g.id)).size!==s.goals.length)throw Error('목표 데이터 형식이 올바르지 않아.');
  for(const g of s.goals)if(!g||typeof g.id!=='string'||typeof g.title!=='string'||!['month','week','day'].includes(g.period)||!validDate(g.start)||!Number.isFinite(g.target)||g.target<=0||!Number.isFinite(g.current)||g.current<0||typeof g.unit!=='string')throw Error('목표의 날짜나 달성량이 올바르지 않아.');
  if(s.github?.owner==='solarone0'&&s.github.repo==='life-workspace')s.github.repo='life';
  for(const t of s.tasks)if(t.github?.owner==='solarone0'&&t.github.repo==='life-workspace')t.github.repo='life';
  for(const t of s.tasks){t.parentId ||= '';let node=t,depth=0;const seen=new Set([t.id]);while(node.parentId){node=s.tasks.find(p=>p.id===node.parentId);if(!node||seen.has(node.id)||++depth>5)throw Error('상위·하위 일감 연결을 확인해줘.');seen.add(node.id);}}
  return s;
}
function persist() {
  state.updatedAt=new Date().toISOString();
  if(localServer)syncInfo={...syncInfo,state:'pending',message:'변경 내용 저장 중'};
  const body=JSON.stringify(state);
  try { localStorage.setItem(key,body); } catch { toast('브라우저 저장 공간이 부족해. 백업을 내려받아줘.',true); }
  if(webHosted){queueWebSave();return;}
  if(localServer) saving=saving.catch(()=>{}).then(async()=>{const r=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body,keepalive:new Blob([body]).size<60000}); if(!r.ok)throw Error('로컬 파일 저장 실패');}).catch(e=>toast(e.message,true));
}
function statusPill(t) { return `<span class="status-pill status-${t.status.replaceAll(' ','-')}">${statusNames[statuses.indexOf(t.status)]}</span>`; }
function duePill(t) { const n=delta(t.due); const label=n===null?'날짜 없음':n===0?'오늘':n===1?'내일':n<0?`${-n}일 지남`:`${Number(t.due.slice(5,7))}.${Number(t.due.slice(8))}`; return `<span class="due-pill ${!complete(t)&&n!==null?(n<0?'overdue':n<=2?'soon':''):''}">${esc(label)}</span>`; }
function check(t) { return `<button class="task-check" data-check="${esc(t.id)}" aria-label="${esc(t.title)} ${complete(t)?'완료 취소':'완료'}" aria-pressed="${complete(t)}">${icon('check')}</button>`; }
function taskRow(t) { const p=projectOf(t); return `<div class="task-row ${complete(t)?'done':''}" data-task="${esc(t.id)}" tabindex="0" role="button" aria-label="${esc(t.title)} 상세">${check(t)}<div class="task-main"><span class="task-title">${esc(t.title)}</span>${taskFamilyHint(t)}<div class="task-meta"><span>${esc(p.name)}</span><span class="dot"></span><span>${statusNames[statuses.indexOf(t.status)]}</span></div></div><div class="task-side"><i class="priority-dot priority-${t.priority}" title="${priorityNames[t.priority]}"></i>${duePill(t)}</div></div>`; }
function head(eyebrow,title,description,tools='') { return `<div class="page-head"><div><span class="eyebrow">${eyebrow}</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${tools}</div>`; }
function emptyView(title,copy,button='') { return `<div class="empty-state"><div class="empty-icon">${icon('check')}</div><h3>${esc(title)}</h3><p>${esc(copy)}</p>${button}</div>`; }
function projectCard(p,large=false) {
  const tasks=state.tasks.filter(t=>t.project===p.id), done=tasks.filter(complete).length, progress=tasks.length?Math.round(done/tasks.length*100):0;
  return `<article class="${large?'surface project-overview-card':'project-card'}" style="--project-color:${p.color}" data-project="${esc(p.id)}" data-letter="${esc(p.name[0])}" role="button" tabindex="0"><div class="project-card-top"><span class="project-icon">${esc(p.name[0])}</span><span class="due-pill">${tasks.length?'할 일 '+tasks.length+'개':'아이디어'}</span></div><${large?'h2':'h3'}>${esc(p.name)}</${large?'h2':'h3'}><p>${esc(p.notes || (tasks.length?`${done}개 완료 · ${tasks.length-done}개 남음`:'첫 할 일을 추가해봐'))}</p><div class="progress-track"><i style="width:${progress}%"></i></div><div class="project-progress-label"><span>${done} / ${tasks.length} 완료</span><strong>${progress}%</strong></div></article>`;
}
function renderToday() {
  const active=state.tasks.filter(t=>!complete(t)), done=state.tasks.filter(complete).length, progress=state.tasks.length?Math.round(done/state.tasks.length*100):0;
  const focus=[...active].sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999') || (a.status==='In Progress'?-1:1)).slice(0,5);
  const due=active.filter(t=>t.due&&delta(t.due)<=0).length;
  return head('오늘의 기록','오늘도, 중요한 일부터',due?`오늘까지 챙길 일 ${due}개가 있어. 하나씩 마무리해보자.`:'다음 할 일을 살펴보고, 나만의 속도로 이어가자.')+
  `<div class="today-grid"><section class="surface focus-card"><div class="section-head"><div><h2>먼저 챙길 일</h2><p>마감이 가까운 순서로 모았어</p></div><button class="text-button" data-view="tasks">모두 보기 ${icon('chevron')}</button></div><div class="focus-list">${focus.map(taskRow).join('')||emptyView('할 일을 모두 마쳤어','새로운 계획을 추가해봐.')}</div></section><div class="stats-column"><section class="surface progress-card"><div><small>전체 할 일 완료율</small><strong>${progress}%</strong><p>${state.tasks.length}개 중 ${done}개 완료<br>조금씩 쌓이고 있어</p></div><div class="progress-ring" style="--progress:${progress}%"><span>${done}/${state.tasks.length}</span></div></section><div class="mini-stat-grid"><section class="surface mini-stat"><small>진행 중</small><strong>${active.filter(t=>t.status==='In Progress').length}<em>개</em></strong></section><section class="surface mini-stat"><small>남은 할 일</small><strong>${active.length}<em>개</em></strong></section></div></div></div><section class="surface project-strip"><div class="section-head"><h2>내 프로젝트</h2><button class="text-button" data-view="projects">모두 보기 ${icon('chevron')}</button></div><div class="project-cards">${state.projects.slice(0,2).map(p=>projectCard(p)).join('')||emptyView('첫 프로젝트를 시작해봐','목표를 작은 할 일로 나눠보자.')}</div></section><section class="surface project-strip"><div class="section-head"><div><h2>오늘의 습관</h2><p>기록은 언제든 다시 바꿀 수 있어</p></div><button class="text-button" data-view="habits">주간 기록 ${icon('chevron')}</button></div><div class="today-habits">${state.habits.map(h=>`<button class="habit-today ${(h.entries[today()]||0)===100?'checked':''}" data-habit="${esc(h.id)}" data-day="${today()}" aria-pressed="${(h.entries[today()]||0)===100}">${icon('check')}<span>${esc(h.name)}</span><small>${esc(h.goal)}</small></button>`).join('')}</div></section>`;
}
function renderHabits() {
  const days=week(), checked=state.habits.filter(h=>(h.entries[today()]||0)===100).length;
  return head('습관','작은 습관이 만드는 변화','날짜를 누르면 완료를 기록해. 미래 날짜는 기록할 수 없어.','<button class="button button-ghost" id="add-habit">'+icon('plus')+'습관 추가</button>')+`<div class="habit-summary"><section class="surface habit-week-card"><div class="section-head"><div><h2>이번 주 기록</h2><p>${days[0]} — ${days[6]}</p></div></div><div class="week-progress">${days.map((d,i)=>`<div class="day-cell ${d===today()?'today':''}"><span>${'월화수목금토일'[i]}</span><b>${Number(d.slice(-2))}</b></div>`).join('')}</div></section><section class="surface habit-score"><div><span class="score">${checked}<small> / ${state.habits.length}</small></span><p>오늘 완료한 습관</p></div></section></div><section class="surface habit-list">${state.habits.map(h=>`<div class="habit-row"><div class="habit-name"><strong>${esc(h.name)}</strong><small>${esc(h.goal)}</small></div><span class="category-pill">${esc(h.category)}</span><div class="habit-dots">${days.map(d=>`<button class="habit-dot ${(h.entries[d]||0)===100?'checked':''}" data-habit="${esc(h.id)}" data-day="${d}" ${d>today()?'disabled':''} aria-label="${esc(h.name)} ${d}" aria-pressed="${(h.entries[d]||0)===100}" title="${d} · ${h.entries[d]||0}%">${(h.entries[d]||0)>0&&(h.entries[d]||0)<100?esc(h.entries[d])+'%':icon('check')}</button>`).join('')}</div><span class="streak">주 ${days.filter(d=>(h.entries[d]||0)===100).length}회</span></div>`).join('')}</section>`;
}
function render() {
  $('#core-value').textContent=webHosted&&!webCredential?'나에게 중요한 일부터':state.coreValue||'나에게 중요한 일부터';
  if(webHosted&&!webCredential){$('#view-root').innerHTML=webGate();$('#quick-add').disabled=true;$('#global-search').disabled=true;for(const id of ['nav-today-count','nav-task-count','nav-project-count','nav-habit-count'])$('#'+id).textContent='';return;}
  $('#quick-add').disabled=false;$('#global-search').disabled=false;
  $('#view-root').innerHTML=(view==='today'?renderToday()+renderTodayGoals():view==='projects'?renderProjects():view==='habits'?renderHabitGarden():view==='calendar'?renderCalendar():view==='goals'?renderGoals():renderTasks())+`<footer class="data-footer"><button class="sync-status" id="sync-now">${localServer?'저장 상태 확인 중':'이 브라우저에 저장'}</button><div><button id="export-data">백업 내보내기</button><button id="import-data">백업 가져오기</button></div></footer>`;
  $$('[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view===view));
  $('#nav-today-count').textContent=state.tasks.filter(t=>!complete(t)&&t.due&&delta(t.due)<=0).length;
  $('#nav-task-count').textContent=state.tasks.filter(t=>!complete(t)).length;
  $('#nav-project-count').textContent=state.projects.length; $('#nav-habit-count').textContent=state.habits.length;
  $('#github-title').textContent='깃허브 저장소';
  $('#github-title').title=github.repo?`${github.owner}/${github.repo}`:'solarone0/life';
  $('#github-subtitle').textContent=github.repo?'이슈 가져오기 · 연결 설정':'이슈와 할 일 연결';
  $('#today-label').textContent=new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date());
  if(view==='habits')requestAnimationFrame(scrollGardenToDate);
  const syncButton=$('#sync-now');if(syncButton)syncButton.textContent=(localServer||webHosted)?syncInfo.message:'이 브라우저에 저장';
  if(webHosted)$('#view-root .data-footer>div').insertAdjacentHTML('beforeend','<button id="web-disconnect">연결 해제</button>');
}
function navigate(v) { view=v; projectFilter=''; closeDrawer(); closeSidebar(); render(); }
function openTaskForm(parentId='') { $('#task-form').reset(); $('#task-parent').innerHTML='<option value="">없음</option>'+options(state.tasks.filter(t=>taskDepth(t)<5).map(t=>t.id),state.tasks.filter(t=>taskDepth(t)<5).map(t=>t.title),parentId); $('#task-project-select').innerHTML='<option value="">미분류</option>'+options(state.projects.map(p=>p.id),state.projects.map(p=>p.name),taskOf(parentId)?.project||projectFilter); $('#task-modal').showModal(); }
function closeDrawer() { $('#task-drawer').classList.remove('open'); $('#task-drawer').setAttribute('aria-hidden','true'); selectedId=''; }
function openDrawer(id) {
  const t=taskOf(id); if(!t)return; selectedId=id;
  $('#drawer-content').innerHTML=`<label class="field"><span>할 일</span><input id="edit-title" value="${esc(t.title)}" maxlength="100" /></label><span class="drawer-project">${esc(projectOf(t).name)}</span><div class="drawer-fields"><label class="drawer-field"><span>상태</span><select data-edit="status">${options(statuses,statusNames,t.status)}</select></label><label class="drawer-field"><span>프로젝트</span><select data-edit="project"><option value="">미분류</option>${options(state.projects.map(p=>p.id),state.projects.map(p=>p.name),t.project)}</select></label><label class="drawer-field"><span>유형</span><select data-edit="type">${typeOptions(typeOf(t))}</select></label><label class="drawer-field"><span>우선순위</span><select data-edit="priority">${options(Object.keys(priorityNames),Object.values(priorityNames),t.priority)}</select></label><label class="drawer-field"><span>마감일</span><input type="date" data-edit="due" value="${esc(t.due)}" /></label></div><div class="drawer-notes"><h3>메모</h3><textarea id="edit-notes" placeholder="필요한 내용을 적어줘">${esc(t.notes)}</textarea></div><div class="drawer-actions">${t.github?`<a class="github-link" href="https://github.com/${esc(t.github.owner)}/${esc(t.github.repo)}/issues/${Number(t.github.number)}" target="_blank" rel="noopener noreferrer">${icon('github')}이슈 #${Number(t.github.number)} 열기</a><button class="button button-dark" id="push-issue">깃허브에 변경 내용 보내기</button>`:'<button class="button button-dark" id="push-issue">'+icon('github')+'깃허브 이슈로 보내기</button>'}<button class="button button-danger" id="delete-task">할 일 삭제</button><small class="source-note">${esc(t.source||'직접 추가한 할 일')}</small></div>`;
  $('#task-drawer').classList.add('open'); $('#task-drawer').setAttribute('aria-hidden','false'); $('#drawer-close').focus();
  $('#drawer-content .drawer-notes').insertAdjacentHTML('afterend',renderTaskFamily(t));
  const source=$('#drawer-content .source-note');if(source)source.textContent=t.source?.startsWith('Project.xlsx')?'엑셀에서 가져온 할 일':t.github?'깃허브에서 가져온 할 일':'직접 추가한 할 일';
}
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebar-backdrop').classList.remove('open'); }
function updateTask(id,patch) { const task=taskOf(id);if(!task)return;const before={...task};Object.assign(task,patch,{updatedAt:new Date().toISOString()});try{validate(state);}catch(e){Object.assign(task,before);toast(e.message,true);return;}persist();render();if(selectedId)openDrawer(selectedId); }
async function api(path,method='GET',body) {
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),20000);
  try {
    const url=localServer&&!token?'/api/github':'https://api.github.com'+path;
    const opts=localServer&&!token?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path,method,body})}:{method,headers:{Accept:'application/vnd.github+json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})};
    const r=await fetch(url,{...opts,signal:controller.signal}); const data=await r.json(); if(!r.ok)throw Error(r.status===401?'깃허브 인증을 확인해줘.':r.status===404?'저장소 이름이나 접근 권한을 확인해줘.':r.status===403||r.status===429?'깃허브 권한 또는 요청 한도를 확인해줘.':data.error||`깃허브 요청 실패 (${r.status})`); return data;
  } finally {clearTimeout(timer);}
}
async function connectGitHub(form) {
  const f=new FormData(form), owner=f.get('owner').trim(), repo=f.get('repo').trim();
  if(!/^[A-Za-z0-9-]+$/.test(owner)||!/^[A-Za-z0-9_.-]+$/.test(repo))throw Error('계정과 저장소 이름을 확인해줘.');
  token=f.get('token').trim(); const base=`/repos/${owner}/${repo}`; await api(base);
  const issues=[]; for(let page=1;page<=100;page++){ const rows=await api(`${base}/issues?state=all&per_page=100&page=${page}`); issues.push(...rows.filter(i=>!i.pull_request)); if(rows.length<100)break; if(page===100)throw Error('이슈가 10,000개를 초과했어. 범위를 줄여줘.'); }
  github={owner,repo}; localStorage.setItem('life-github',JSON.stringify(github));
  let added=0; for(const issue of issues){
    if(state.tasks.some(t=>t.github?.owner===owner&&t.github?.repo===repo&&t.github?.number===issue.number))continue;
    let p=state.projects.find(p=>p.id===`gh-${owner}-${repo}`); if(!p){p={id:`gh-${owner}-${repo}`,name:repo,color:'#333d4b',notes:'깃허브 이슈'};state.projects.push(p);}
    state.tasks.push({id:crypto.randomUUID(),title:issue.title,project:p.id,priority:'Medium',status:issue.state==='closed'?'Done':'Not Started',due:'',notes:issue.body||'',github:{owner,repo,number:issue.number},source:'깃허브 이슈',updatedAt:issue.updated_at});added++;
  }
  persist(); render(); $('#github-modal').close(); toast(`${owner}/${repo} 연결 · 새 이슈 ${added}개 가져왔어. 기존 할 일은 유지했어.`);
}
async function pushIssue() {
  const t=taskOf(selectedId); if(!t)return;
  if(!github.repo&&!t.github){openGitHub();return;}
  const target=t.github||github, method=t.github?'PATCH':'POST';
  if(!confirm(`${target.owner}/${target.repo}에 '${t.title}'${t.github?' 변경 내용을 보낼까?':' 이슈를 만들까?'}`))return;
  const button=$('#push-issue'); button.disabled=true;
  try { const body={title:t.title,body:t.notes||'',...(t.github?{state:complete(t)?'closed':'open'}:{})}; const issue=await api(`/repos/${target.owner}/${target.repo}/issues${t.github?'/'+t.github.number:''}`,method,body);
    t.github={owner:target.owner,repo:target.repo,number:issue.number};persist();
    if(method==='POST'&&complete(t))await api(`/repos/${target.owner}/${target.repo}/issues/${issue.number}`,'PATCH',{state:'closed'});
    openDrawer(t.id);toast('깃허브에 저장했어.');
  } catch(e){toast(e.message,true);button.disabled=false;}
}
function openGitHub(){if(webHosted&&!webCredential){openWebAuth();return;}const f=$('#github-form');f.elements.owner.value=github.owner||'solarone0';f.elements.repo.value=github.repo||'life';f.elements.token.value=token;$('#github-modal').showModal();}
function exportData(){const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`life-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function importData(){const input=document.createElement('input');input.type='file';input.accept='.json';input.onchange=async()=>{try{const file=input.files[0];if(file.size>10000000)throw Error('10MB 이하 백업을 선택해줘.');const next=validate(JSON.parse(await file.text()));if(!confirm(`현재 데이터를 백업하고 프로젝트 ${next.projects.length}개, 할 일 ${next.tasks.length}개로 복원할까?`))return;exportData();state=next;persist();render();toast('백업을 복원했어.');}catch(e){toast(e.message,true);}};input.click();}
function validDate(day){if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;const d=new Date(day+'T12:00:00');return !Number.isNaN(d.getTime())&&iso(d)===day;}
function taskDepth(t){let depth=0;while(t?.parentId&&depth<6){depth++;t=taskOf(t.parentId);}return depth;}
function descendants(id){const result=[];const visit=parent=>{for(const t of state.tasks.filter(t=>t.parentId===parent)){if(result.includes(t))continue;result.push(t);visit(t.id);}};visit(id);return result;}
function taskFamilyHint(t){const children=state.tasks.filter(c=>c.parentId===t.id),parent=taskOf(t.parentId);return `${parent?`<small class="parent-hint">상위 · ${esc(parent.title)}</small>`:''}${children.length?`<small class="child-count">하위 ${children.filter(complete).length} / ${children.length} 완료</small>`:''}`;}
function orderedTasks(tasks){const result=[],included=new Set(tasks.map(t=>t.id));function walk(parent){for(const t of sortedItems(state.tasks.filter(t=>(t.parentId||'')===parent),taskSort)){if(included.has(t.id))result.push(t);if(layout!=='list'||!collapsedTasks.has(t.id)||search||!included.has(t.id))walk(t.id);}}walk('');return result;}
function renderTaskFamily(t){
  const blocked=new Set([t.id,...descendants(t.id).map(x=>x.id)]),parents=state.tasks.filter(p=>!blocked.has(p.id)&&taskDepth(p)<5),children=state.tasks.filter(c=>c.parentId===t.id);
  return `<section class="task-family"><label class="field"><span>상위 일감</span><select data-edit="parentId"><option value="">없음</option>${options(parents.map(p=>p.id),parents.map(p=>p.title),t.parentId)}</select></label>${t.parentId?`<button class="text-button" data-task="${esc(t.parentId)}">상위 일감 열기 ${icon('chevron')}</button>`:''}<div class="section-head"><div><h2>하위 일감 <small>${children.filter(complete).length}/${children.length}</small></h2><p>완료 상태는 일감별로 관리해.</p></div>${taskDepth(t)<5?`<button class="text-button" data-add-child="${esc(t.id)}">${icon('plus')} 추가</button>`:''}</div>${children.map(c=>`<div class="family-child ${complete(c)?'done':''}">${check(c)}<button class="family-title" data-task="${esc(c.id)}">${esc(c.title)}</button>${statusPill(c)}</div>`).join('')||'<p class="goal-context">필요한 단계를 하위 일감으로 나눠봐.</p>'}</section>`;
}
async function refreshSync(){if(!localServer||syncBusy)return;syncBusy=true;try{const r=await fetch('/api/sync');if(r.ok){syncInfo=await r.json();const b=$('#sync-now');if(b){b.textContent=syncInfo.message;b.title='눌러서 다시 저장하기';}}}catch{}finally{syncBusy=false;}}
setInterval(refreshSync,3000);
function scrollGardenToDate(){const wrap=$('.grass-scroll'),cell=$('.grass-cell[aria-pressed="true"]');if(wrap&&cell&&wrap.scrollWidth>wrap.clientWidth)wrap.scrollLeft+=cell.getBoundingClientRect().left-wrap.getBoundingClientRect().left-wrap.clientWidth/2;}
window.addEventListener('resize',()=>requestAnimationFrame(()=>requestAnimationFrame(scrollGardenToDate)));
function periodBounds(period,day){
  const d=new Date(day+'T12:00:00');
  if(period==='month'){const start=day.slice(0,7)+'-01';d.setMonth(d.getMonth()+1,0);return {start,end:iso(d)};}
  if(period==='week'){const start=offset(day,-(d.getDay()+6)%7);return {start,end:offset(start,6)};}
  return {start:day,end:day};
}
function movePeriod(period,day,direction){
  if(period==='month'){const d=new Date(day+'T12:00:00');d.setDate(1);d.setMonth(d.getMonth()+direction);return iso(d);}
  return offset(day,direction*(period==='week'?7:1));
}
function rangeLabel(period,day){const b=periodBounds(period,day);return period==='month'?`${Number(day.slice(0,4))}년 ${Number(day.slice(5,7))}월`:period==='week'?`${b.start} — ${b.end}`:day;}
const periodNames={month:'월간',week:'주간',day:'일간'};
function goalsOn(day){return state.goals.filter(g=>{const b=periodBounds(g.period,g.start);return b.start<=day&&day<=b.end;});}
function goalCard(g,compact=false){
  const pct=Math.min(100,Math.round(g.current/g.target*100)),done=g.current>=g.target;
  return `<article class="goal-card ${compact?'compact':''} ${done?'achieved':''}"><div class="goal-card-header"><span class="goal-kind">${periodNames[g.period]}</span><button class="text-button" data-goal-edit="${esc(g.id)}" aria-label="${esc(g.title)} 수정">수정 ${icon('chevron')}</button></div><h3>${esc(g.title)}</h3><p class="goal-context">${esc(g.project?projectOf(g).name:rangeLabel(g.period,g.start))}</p><div class="goal-numbers"><strong>${g.current.toLocaleString('ko-KR')}<small> / ${g.target.toLocaleString('ko-KR')} ${esc(g.unit)}</small></strong><span>${pct}%</span></div><div class="progress-track" style="--project-color:${done?'#00a878':'#3182f6'}"><i style="width:${pct}%"></i></div><div class="goal-actions"><span>${done?'목표를 달성했어':periodBounds(g.period,g.start).end<today()?'기간이 끝났어':'차근차근 이어가자'}</span><button class="button button-ghost" data-goal-progress="${esc(g.id)}">달성량 기록</button></div></article>`;
}
function periodToolbar(kind,period,day){return `<div class="period-toolbar"><div class="segmented" role="group" aria-label="${kind==='calendar'?'캘린더 보기':'목표 기간'}">${Object.entries(periodNames).map(([id,label])=>`<button class="${period===id?'active':''}" data-${kind}-period="${id}" aria-pressed="${period===id}">${label}</button>`).join('')}</div><div class="period-controls"><button class="icon-button" data-${kind}-move="-1" aria-label="이전 기간">‹</button><label><span class="sr-only">${kind==='calendar'?'캘린더':'목표'} 기준 날짜</span><input type="date" id="${kind}-date" value="${day}" /></label><button class="icon-button" data-${kind}-move="1" aria-label="다음 기간">›</button><button class="button button-ghost" data-${kind}-today="true">오늘</button></div></div>`;}
function renderGoals(){
  const b=periodBounds(goalPeriod,goalDate),goals=state.goals.filter(g=>g.period===goalPeriod&&periodBounds(g.period,g.start).start===b.start),achieved=goals.filter(g=>g.current>=g.target).length;
  return head('목표','이번 기간에 이루고 싶은 것','월간·주간·일간 목표를 정하고, 달성량을 기록해봐.','<button class="button button-primary" id="add-goal">'+icon('plus')+'목표 추가</button>')+periodToolbar('goal',goalPeriod,goalDate)+`<div class="section-head"><div><h2>${rangeLabel(goalPeriod,goalDate)}</h2><p>${goals.length}개 목표 · ${achieved}개 달성</p></div></div><section class="goals-grid">${goals.map(g=>goalCard(g)).join('')||`<div class="surface goals-empty">${emptyView('아직 정한 목표가 없어','작은 목표 하나부터 시작해봐.','<button class="button button-primary" id="empty-add-goal">첫 목표 설정</button>')}</div>`}</section>`;
}
function renderTodayGoals(){const goals=goalsOn(today());return `<section class="surface project-strip"><div class="section-head"><div><h2>지금의 목표</h2><p>오늘에 해당하는 월간·주간·일간 목표</p></div><button class="text-button" data-view="goals">목표 관리 ${icon('chevron')}</button></div><div class="goals-grid">${goals.map(g=>goalCard(g,true)).join('')||'<p class="goal-context">아직 설정한 목표가 없어. 목표 메뉴에서 추가해봐.</p>'}</div></section>`;}
function calendarEvents(day){
  return state.tasks.filter(t=>t.due===day).map(t=>({id:t.id,title:t.title,kind:'task',done:complete(t),color:projectOf(t).color})).concat(state.goals.filter(g=>periodBounds(g.period,g.start).end===day).map(g=>({id:g.id,title:g.title,kind:'goal',done:g.current>=g.target,color:'#7867e6'})));
}
function eventButton(ev){return `<button class="calendar-event ${ev.done?'event-done':''} ${ev.kind==='goal'?'event-goal':''}" style="--event-color:${ev.color}" data-${ev.kind==='task'?'task':'goal-edit'}="${esc(ev.id)}" title="${esc(ev.title)}">${ev.kind==='goal'?'목표 · ':''}${esc(ev.title)}</button>`;}
function renderCalendar(){
  const b=periodBounds(calendarLayout,calendarDate);let days;
  if(calendarLayout==='month'){const first=periodBounds('week',b.start).start;days=Array.from({length:42},(_,i)=>offset(first,i));}
  else if(calendarLayout==='week')days=Array.from({length:7},(_,i)=>offset(b.start,i));
  else days=[calendarDate];
  const dated=state.tasks.filter(t=>t.due===calendarDate),goals=goalsOn(calendarDate),undated=state.tasks.filter(t=>!t.due&&!complete(t));
  const grid=calendarLayout==='month'?`<div class="surface calendar-month"><div class="calendar-weekdays">${[...'월화수목금토일'].map(n=>`<span>${n}</span>`).join('')}</div><div class="calendar-grid">${days.map(day=>{const events=calendarEvents(day);return `<div class="calendar-cell ${day.slice(0,7)!==calendarDate.slice(0,7)?'outside':''} ${day===calendarDate?'selected':''} ${day===today()?'is-today':''}"><button class="calendar-day" data-calendar-day="${day}" aria-label="${day} 일정 ${events.length}개" aria-pressed="${day===calendarDate}">${Number(day.slice(-2))}</button><div class="calendar-cell-events">${events.slice(0,3).map(eventButton).join('')}${events.length>3?`<button class="calendar-more" data-calendar-day="${day}">+${events.length-3}개 더 보기</button>`:''}</div></div>`;}).join('')}</div></div>`:
    `<div class="calendar-agenda ${calendarLayout==='week'?'week-agenda':''}">${days.map(day=>`<section class="surface agenda-day ${day===today()?'is-today':''}"><button class="agenda-date" data-calendar-day="${day}">${day.slice(5).replace('-','.')} <span>${'일월화수목금토'[new Date(day+'T12:00:00').getDay()]}</span></button><div class="agenda-events">${calendarEvents(day).map(eventButton).join('')||'<p class="goal-context">일정 없음</p>'}</div><button class="text-button" data-calendar-add="${day}">${icon('plus')} 할 일</button></section>`).join('')}</div>`;
  return head('일정','일정을 한눈에','할 일의 마감일과 목표 기간의 마지막 날을 표시해.','<button class="button button-primary" id="calendar-quick-add">'+icon('plus')+'할 일 추가</button>')+periodToolbar('calendar',calendarLayout,calendarDate)+`<div class="section-head"><h2>${rangeLabel(calendarLayout,calendarDate)}</h2><span class="calendar-legend"><i></i>할 일 <i class="goal-legend"></i>목표</span></div>`+grid+`<section class="surface project-strip selected-day"><div class="section-head"><div><h2>${calendarDate} 일정</h2><p>할 일 ${dated.length}개 · 진행 기간에 해당하는 목표 ${goals.length}개</p></div><button class="text-button" data-calendar-goal="${calendarDate}">일간 목표 추가 ${icon('plus')}</button></div><div class="focus-list">${dated.map(taskRow).join('')||'<p class="goal-context">이날 마감인 할 일은 없어.</p>'}</div>${goals.length?`<div class="goals-grid">${goals.map(g=>goalCard(g,true)).join('')}</div>`:''}</section>${undated.length?`<section class="surface project-strip"><div class="section-head"><div><h2>날짜를 정하지 않은 할 일</h2><p>상세 화면에서 마감일을 정하면 캘린더에 표시돼.</p></div></div>${undated.map(taskRow).join('')}</section>`:''}`;
}
function updateGoalRange(){const f=$('#goal-form'),day=f.elements.date.value;$('#goal-period-label').textContent=validDate(day)?'목표 기간: '+rangeLabel(f.elements.period.value,day):'기준 날짜를 선택해줘.';}
function openGoal(id='',progressOnly=false){
  const g=state.goals.find(g=>g.id===id),f=$('#goal-form');f.reset();
  f.elements.id.value=g?.id||'';f.elements.title.value=g?.title||'';f.elements.period.value=g?.period||goalPeriod;f.elements.date.value=g?.start||goalDate;f.elements.target.value=g?.target??1;f.elements.current.value=g?.current??0;f.elements.unit.value=g?.unit||'회';f.elements.notes.value=g?.notes||'';
  $('#goal-project').innerHTML='<option value="">연결 없음</option>'+options(state.projects.map(p=>p.id),state.projects.map(p=>p.name),g?.project||'');
  $('#goal-modal-title').textContent=g?(progressOnly?'달성량 기록':'목표 수정'):'목표 추가';$('#delete-goal').hidden=!g;updateGoalRange();$('#goal-modal').showModal();f.elements[progressOnly?'current':'title'].focus();
}
$('#goal-form').addEventListener('change',updateGoalRange);
$('#goal-form').addEventListener('submit',e=>{
  e.preventDefault();const f=new FormData(e.target),day=f.get('date'),period=f.get('period'),title=f.get('title').trim(),unit=f.get('unit').trim(),target=Number(f.get('target')),current=Number(f.get('current'));
  if(!title||!unit||!validDate(day)||!Number.isFinite(target)||target<=0||!Number.isFinite(current)||current<0){toast('목표, 날짜와 달성량을 확인해줘.',true);return;}
  const goal={id:f.get('id')||crypto.randomUUID(),title,period,start:periodBounds(period,day).start,target,current,unit,project:f.get('project'),notes:f.get('notes'),updatedAt:new Date().toISOString()};
  const index=state.goals.findIndex(g=>g.id===goal.id);if(index<0)state.goals.push(goal);else state.goals[index]=goal;
  goalPeriod=period;goalDate=day;persist();$('#goal-modal').close();render();toast('목표를 저장했어.');
});
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.addChild){openTaskForm(d.addChild);return;}
  if(b.id==='web-connect'){openWebAuth();return;}
  if(b.id==='web-disconnect'){disconnectWeb();return;}
  if(b.id==='sync-now'){if(webHosted){webSyncAction();return;}if(!localServer){toast('이 브라우저에 기록을 저장하고 있어.');return;}fetch('/api/sync',{method:'POST'}).then(refreshSync).catch(()=>toast('연결을 확인해줘.',true));return;}
  if(d.grassHabit!==undefined){grassHabit=d.grassHabit;render();return;}
  if(d.grassDay){grassDate=d.grassDay;render();return;}
  if(d.grassYear){grassYear+=Number(d.grassYear);grassDate=grassYear===new Date().getFullYear()?today():`${grassYear}-01-01`;render();return;}
  if(d.goalEdit!==undefined)return openGoal(d.goalEdit);
  if(d.goalProgress)return openGoal(d.goalProgress,true);
  if(['add-goal','empty-add-goal'].includes(b.id))return openGoal();
  if(b.id==='delete-goal'){const id=$('#goal-form').elements.id.value;if(confirm('이 목표와 달성 기록을 삭제할까?')){state.goals=state.goals.filter(g=>g.id!==id);persist();$('#goal-modal').close();render();}return;}
  if(d.calendarGoal){goalDate=d.calendarGoal;goalPeriod='day';openGoal();return;}
  if(d.calendarAdd||b.id==='calendar-quick-add'){openTaskForm();$('#task-form').elements.due.value=d.calendarAdd||calendarDate;return;}
  if(d.calendarDay){calendarDate=d.calendarDay;render();return;}
  if(d.calendarPeriod){calendarLayout=d.calendarPeriod;render();return;}
  if(d.calendarMove){calendarDate=movePeriod(calendarLayout,calendarDate,Number(d.calendarMove));render();return;}
  if(d.calendarToday){calendarDate=today();render();return;}
  if(d.goalPeriod){goalPeriod=d.goalPeriod;render();return;}
  if(d.goalMove){goalDate=movePeriod(goalPeriod,goalDate,Number(d.goalMove));render();return;}
  if(d.goalToday){goalDate=today();render();}
});
document.addEventListener('change',e=>{if(e.target.id==='calendar-date'&&validDate(e.target.value)){calendarDate=e.target.value;render();}if(e.target.id==='goal-date'&&validDate(e.target.value)){goalDate=e.target.value;render();}});
document.addEventListener('change',e=>{if(e.target.dataset.grassRecord&&grassDate<=today()){const h=state.habits.find(h=>h.id===e.target.dataset.grassRecord);const value=Number(e.target.value);if(!Number.isFinite(value)||value<0||value>100)return;h.entries[grassDate]=value;h.counts||={};h.counts[grassDate]=value>0?Math.max(1,habitCount(h,grassDate)):0;persist();render();}});
document.addEventListener('click',e=>{
  if(e.target.closest('input,select,textarea'))return;
  const b=e.target.closest('button,a,[data-task],[data-project]');if(!b)return;
  if(b.dataset.taskToggle){const id=b.dataset.taskToggle;if(collapsedTasks.has(id))collapsedTasks.delete(id);else collapsedTasks.add(id);rememberLists();render();return;}
  if(b.classList.contains('table-more')&&!b.dataset.addChild&&!b.dataset.deleteTask&&!b.dataset.deleteProject)return openDrawer(b.closest('[data-task]').dataset.task);
  if(b.dataset.check){e.stopPropagation();const t=taskOf(b.dataset.check);updateTask(t.id,{status:complete(t)?'Not Started':'Done'});return;}
  if(b.dataset.view)return navigate(b.dataset.view);
  if(b.dataset.task)return openDrawer(b.dataset.task);
  if(b.dataset.project){projectFilter=b.dataset.project;view='tasks';filter='all';render();return;}
  if(b.dataset.filter){filter=b.dataset.filter;render();return;}
  if(b.dataset.layout){layout=b.dataset.layout;render();return;}
  if(b.dataset.habit){const h=state.habits.find(h=>h.id===b.dataset.habit);toggleHabit(h,b.dataset.day);return;}
  if(b.classList.contains('modal-close')){b.closest('dialog').close();return;}
  switch(b.id){case'quick-add':openTaskForm();break;case'github-open':openGitHub();break;case'github-disconnect':github={};token='';localStorage.removeItem('life-github');$('#github-form').reset();$('#github-modal').close();render();toast('연결을 해제했어. 가져온 할 일은 유지돼.');break;
    case'drawer-close':case'drawer-backdrop':closeDrawer();break;case'menu-button':$('#sidebar').classList.add('open');$('#sidebar-backdrop').classList.add('open');break;case'sidebar-close':case'sidebar-backdrop':closeSidebar();break;
    case'delete-task':if(confirm('이 할 일을 삭제할까? 하위 일감은 독립된 할 일로 유지돼.')){for(const child of state.tasks.filter(t=>t.parentId===selectedId))child.parentId='';state.tasks=state.tasks.filter(t=>t.id!==selectedId);closeDrawer();persist();render();}break;
    case'push-issue':pushIssue();break;case'export-data':exportData();break;case'import-data':importData();break;case'add-project':editProject();break;case'edit-project':editProject(projectFilter);break;
    case'add-habit':openHabit();break;
  }
});
document.addEventListener('change',e=>{if(e.target.id==='project-filter'){projectFilter=e.target.value;render();}else if(e.target.dataset.edit&&selectedId)updateTask(selectedId,{[e.target.dataset.edit]:e.target.value});else if(e.target.id==='edit-title'&&selectedId){if(!e.target.value.trim()){e.target.value=taskOf(selectedId).title;return;}updateTask(selectedId,{title:e.target.value.trim()});}else if(e.target.id==='edit-notes'&&selectedId)updateTask(selectedId,{notes:e.target.value});});
$('#task-form').addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);const title=f.get('title').trim();if(!title)return;state.tasks.push({id:crypto.randomUUID(),title,type:f.get('type').trim()||'일반',parentId:f.get('parentId')||'',project:f.get('project'),priority:f.get('priority'),status:f.get('status'),due:f.get('due'),notes:f.get('notes'),updatedAt:new Date().toISOString()});persist();$('#task-modal').close();render();if(selectedId)openDrawer(selectedId);toast('할 일을 추가했어.');});
$('#github-form').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await connectGitHub(e.target);}catch(err){toast(err.message,true);}finally{b.disabled=false;}});
$('#web-auth-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;const previous=webCredential;webCredential=e.target.elements.accessToken.value.trim();$('#web-auth-error').textContent='';
  try{const loaded=await loadWebState();if(loaded)state=loaded;else{const cached=localStorage.getItem(key);if(cached)state=validate(JSON.parse(cached));}sessionStorage.setItem(webStorageKey,webCredential);token=webCredential;localStorage.setItem(key,JSON.stringify(state));e.target.reset();$('#web-auth-modal').close();render();if(webMeta.pending&&webReady)flushWebState();}
  catch(err){webCredential=previous;$('#web-auth-error').textContent=err.name==='AbortError'?'연결 시간이 초과됐어. 다시 시도해줘.':err.message;}
  finally{button.disabled=false;}
});
$('#global-search').addEventListener('input',e=>{search=e.target.value;view='tasks';filter='all';render();});
document.addEventListener('keydown',e=>{const editing=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName);if(e.key==='Escape'){closeDrawer();closeSidebar();}if(e.key==='/'&&!editing){e.preventDefault();$('#global-search').focus();}if(e.key==='Enter'&&e.target.matches('[data-task],[data-project]')){e.preventDefault();e.target.click();}});
document.addEventListener('dragstart',e=>{const card=e.target.closest('[draggable]');if(card)e.dataTransfer.setData('text/plain',card.dataset.task);});
document.addEventListener('dragover',e=>{if(e.target.closest('[data-drop]'))e.preventDefault();});
document.addEventListener('drop',e=>{const col=e.target.closest('[data-drop]'),id=e.dataTransfer.getData('text/plain');if(col&&taskOf(id)){e.preventDefault();updateTask(id,{status:col.dataset.drop});}});
window.addEventListener('storage',e=>{if(e.key===key&&e.newValue){try{state=validate(JSON.parse(e.newValue));render();if(selectedId)openDrawer(selectedId);}catch{toast('다른 탭의 데이터를 읽지 못했어.',true);}}});
(async()=>{
  try{github=JSON.parse(localStorage.getItem('life-github')||'{}');}catch{}
  if(github.owner==='solarone0'&&github.repo==='life-workspace'){github.repo='life';localStorage.setItem('life-github',JSON.stringify(github));}
  let cached;
  try{cached=validate(JSON.parse(localStorage.getItem(key)));}catch{}
  if(webHosted){
    state=webCredential?(cached||empty()):empty();
    if(webCredential){token=webCredential;try{const loaded=await loadWebState();if(loaded){state=loaded;localStorage.setItem(key,JSON.stringify(state));}}catch(e){webStatus(e.name==='AbortError'?'연결이 지연돼. 기존 기록을 보여줄게.':e.message,'error');}}
    render();if(webCredential&&webMeta.pending&&webReady)flushWebState();return;
  }
  try{const r=await fetch('/api/state');if(r.ok&&r.headers.get('content-type')?.includes('application/json')){state=validate(await r.json());localServer=true;}}catch{}
  if(cached&&(!state||(cached.updatedAt||'')>(state.updatedAt||''))){state=cached;if(localServer)persist();}
  state ||= empty();render();refreshSync();if(!state.tasks.length&&!state.projects.length)toast('백업을 가져오거나 첫 프로젝트를 추가해봐.');
})();
