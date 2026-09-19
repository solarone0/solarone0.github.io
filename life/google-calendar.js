'use strict';
// Tokens and Google event contents live only in memory, outside workspace backups.
const lifeGoogle = (() => {
  const storageKey='life-google-settings-v1';
  const readScopes=['openid','email','https://www.googleapis.com/auth/calendar.calendarlist.readonly','https://www.googleapis.com/auth/calendar.events.readonly'];
  const writeScope='https://www.googleapis.com/auth/calendar.app.created';
  const marker='life-workspace-calendar-v1';
  let settings={clientId:''};
  try { const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');settings.clientId=typeof saved.clientId==='string'?saved.clientId:''; } catch {}
  let access='',expires=0,epoch=0,oauth,scriptPromise,connecting=false,writing=false,writeEnabled=false;
  let calendars=[],selected=new Set(),events=[],range='',loading='',failed='',message='',writeMessage='',targetId='',writeTimer,writeQueued=false;
  const connected=()=>!!access&&Date.now()<expires;
  const repaint=()=>{if(typeof state!=='undefined'&&state&&view==='calendar')render();};
  function reset(){epoch++;access='';expires=0;connecting=false;writeEnabled=false;writeQueued=false;clearTimeout(writeTimer);calendars=[];selected.clear();events=[];range='';loading='';failed='';targetId='';message='';writeMessage='';}
  function expire(){reset();message='구글 연결이 만료됐어. 다시 연결해줘.';repaint();}
  async function request(path,method='GET',body,etag){
    if(!connected()){expire();throw Error('구글에 다시 연결해줘.');}
    const session=epoch,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try {
      const response=await fetch('https://www.googleapis.com/calendar/v3'+path,{method,headers:{Authorization:'Bearer '+access,...(body?{'Content-Type':'application/json'}:{}),...(etag?{'If-Match':etag}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal,cache:'no-store'});
      if(session!==epoch)throw Error('구글 연결이 바뀌었어.');
      if(response.status===401){expire();throw Error('구글 연결이 만료됐어. 다시 연결해줘.');}
      if(!response.ok){const error=Error(response.status===403?'구글 캘린더 권한과 API 사용 설정을 확인해줘.':response.status===412?'구글에서 일정이 바뀌었어. 다시 동기화해줘.':response.status===429?'구글 요청이 많아. 잠시 후 다시 시도해줘.':`구글 캘린더 요청에 실패했어. (${response.status})`);error.status=response.status;throw error;}
      return response.status===204?null:await response.json();
    } finally {clearTimeout(timeout);}
  }
  async function list(path,params={}){
    let items=[],pageToken='';const seen=new Set();
    do {
      const query=new URLSearchParams({...params,...(pageToken?{pageToken}:{})});
      const result=await request(path+'?'+query);
      items.push(...(result.items||[]));pageToken=result.nextPageToken||'';
      if(pageToken&&(seen.has(pageToken)||seen.size>=100))throw Error('구글 일정 전체를 불러오지 못했어. 다시 시도해줘.');
      seen.add(pageToken);
    } while(pageToken);
    return items;
  }
  function loadScript(){
    if(location.protocol==='http:')document.querySelector('meta[name="referrer"]').content='no-referrer-when-downgrade';
    if(window.google?.accounts?.oauth2)return Promise.resolve();
    if(scriptPromise)return scriptPromise;
    scriptPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
      const timeout=setTimeout(()=>{script.remove();scriptPromise=null;reject(Error('구글 로그인 로딩이 지연돼. 다시 시도해줘.'));},20000);
      script.onload=()=>{clearTimeout(timeout);resolve();};
      script.onerror=()=>{clearTimeout(timeout);script.remove();scriptPromise=null;reject(Error('구글 로그인 화면을 불러오지 못했어. 연결을 확인해줘.'));};
      document.head.append(script);
    });
    return scriptPromise;
  }
  function openSettings(){
    const signedIn=webHosted&&window.lifeDrive?.ready();
    $('#google-client-id').value=signedIn?lifeDrive.clientId():settings.clientId;$('#google-client-id').readOnly=!!signedIn;$('#google-auth-error').textContent='';$('#google-origin').textContent=location.origin;
    $('#google-modal').showModal();const button=$('#google-connect');button.disabled=true;button.textContent='구글 로그인 준비 중';
    loadScript().then(()=>{button.disabled=false;button.textContent='구글 계정 연결';}).catch(error=>{$('#google-auth-error').textContent=error.message;button.textContent='다시 열어서 시도해줘';});
  }
  function authorize(withWrite=false){
    if(connecting||writing)return;
    const clientId=(webHosted&&window.lifeDrive?.ready()?lifeDrive.clientId():withWrite?settings.clientId:$('#google-client-id').value).trim();
    if(!/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)){$('#google-auth-error').textContent='구글 OAuth 클라이언트 ID를 입력해줘.';return;}
    if(!window.google?.accounts?.oauth2){openSettings();return;}
    settings.clientId=clientId;try{localStorage.setItem(storageKey,JSON.stringify(settings));}catch{}
    const oldAccount=withWrite?calendars.find(c=>c.primary)?.id:'';
    reset();connecting=true;message='구글 계정을 연결하는 중';const session=epoch;
    oauth=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:[...readScopes,...(withWrite?[writeScope]:[])].join(' '),include_granted_scopes:false,
      callback:async response=>{
        if(session!==epoch)return;
        connecting=false;
        if(response.error||!response.access_token){message='구글 연결을 승인하지 않았어. 다시 연결할 수 있어.';$('#google-auth-error').textContent=message;repaint();return;}
        if(!google.accounts.oauth2.hasGrantedAllScopes(response,...readScopes,...(withWrite?[writeScope]:[]))){message='요청한 캘린더 권한을 모두 허용해줘.';$('#google-auth-error').textContent=message;repaint();return;}
        access=response.access_token;expires=Date.now()+Math.max(0,Number(response.expires_in||0)-30)*1000;
        try {
          if(webHosted&&window.lifeDrive?.ready()){
            const identity=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+access},cache:'no-store'});
            if(!identity.ok||((await identity.json()).sub)!==lifeDrive.userId())throw Error('Life에 로그인한 구글 계정과 같은 계정을 선택해줘.');
          }
          const loaded=await list('/users/me/calendarList',{maxResults:'250',minAccessRole:'reader'});
          if(session!==epoch)return;
          calendars=loaded.filter(c=>!c.deleted);selected=new Set(calendars.filter(c=>c.primary).map(c=>c.id));
          const account=calendars.find(c=>c.primary)?.id;
          writeEnabled=withWrite&&!!account&&account===oldAccount;
          message=withWrite&&!writeEnabled?'계정이 바뀌었어. 확인 후 Life 할 일 보내기를 다시 눌러줘.':'구글 캘린더를 연결했어.';
          $('#google-modal').close();repaint();
          if(writeEnabled)await syncTasks();
        } catch(error){message=error.message;$('#google-auth-error').textContent=message;repaint();}
      },error_callback:()=>{if(session!==epoch)return;connecting=false;message='로그인 창이 닫혔거나 차단됐어. 다시 연결해줘.';$('#google-auth-error').textContent=message;repaint();}
    });
    oauth.requestAccessToken({prompt:withWrite?'consent':'select_account'});repaint();
  }
  function panel(){
    const active=connected(),account=calendars.find(c=>c.primary);
    return `<section class="surface google-panel" aria-label="구글 캘린더 연동"><div class="google-panel-head"><div><h2><i class="google-dot"></i>구글 캘린더</h2><p>${esc(active?(account?.summary||account?.id||'연결됨'):'내 구글 일정과 Life 할 일을 함께 확인해.')}</p></div><div class="google-actions">${active?`<button class="button button-ghost" data-google-action="refresh" ${loading?'disabled':''}>새로고침</button><button class="button button-ghost" data-google-action="disconnect">연결 해제</button>`:`<button class="button button-ghost" data-google-action="connect" ${connecting?'disabled':''}>${connecting?'연결 중':'구글 연결하기'}</button>`}</div></div>${active?`<div class="google-calendar-list">${calendars.map(c=>`<label><input type="checkbox" data-google-calendar="${esc(c.id)}" ${selected.has(c.id)?'checked':''}>${esc(c.summaryOverride||c.summary||c.id)}</label>`).join('')}</div><div class="google-export"><div><strong>Life 할 일 보내기</strong><p>마감일이 있는 할 일을 별도 Life 캘린더에 반영해. 앱이 열린 동안 변경을 반영해.</p><p>제목·날짜는 Life에서 수정해. 삭제한 할 일의 구글 일정은 유지돼.</p></div><button class="button button-ghost" data-google-action="${writeEnabled?'sync':'enable-write'}" ${writing?'disabled':''}>${writing?'반영 중':writeEnabled?'지금 반영':'보내기 켜기'}</button>${writeEnabled?'<button class="text-button" data-google-action="disable-write">자동 반영 끄기</button>':''}</div><p class="google-write-status" role="status">${esc(writeMessage)}</p>`:''}<p class="google-status" role="status">${esc(message||'연결 후 표시할 캘린더를 선택할 수 있어.')}</p></section>`;
  }
  function bounds(){const b=periodBounds(calendarLayout,calendarDate),start=calendarLayout==='month'?periodBounds('week',b.start).start:b.start;return {start,end:calendarLayout==='month'?offset(start,42):offset(b.end,1)};}
  function rangeKey(){const b=bounds();return b.start+'|'+b.end+'|'+[...selected].sort().join('|');}
  async function ensure(force=false){
    if(!connected()||view!=='calendar')return;
    const key=rangeKey();if(loading===key||(!force&&(range===key||failed===key)))return;
    const session=epoch,b=bounds();loading=key;failed='';events=[];range='';message='구글 일정을 불러오는 중';repaint();
    try {
      const result=await Promise.all([...selected].map(async id=>{
        const calendar=calendars.find(c=>c.id===id);
        const items=await list('/calendars/'+encodeURIComponent(id)+'/events',{singleEvents:'true',orderBy:'startTime',showDeleted:'false',maxResults:'2500',timeMin:new Date(b.start+'T00:00:00').toISOString(),timeMax:new Date(b.end+'T00:00:00').toISOString(),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone});
        return items.filter(e=>e.status!=='cancelled'&&!e.attendees?.some(a=>a.self&&a.responseStatus==='declined')).map(e=>({...e,calendarId:id,calendarName:calendar?.summary||id}));
      }));
      if(session!==epoch||loading!==key)return;
      events=result.flat();range=key;message=selected.size?`구글 일정 ${events.length}개 · ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}에 확인`:'표시할 캘린더를 선택해줘.';
    } catch(error){if(session!==epoch||loading!==key)return;failed=key;message=error.name==='AbortError'?'구글 일정 조회 시간이 초과됐어. 새로고침해줘.':error.message;}
    finally {if(session===epoch&&loading===key){loading='';repaint();}}
  }
  function onDay(event,day){
    if(event.start?.date)return event.start.date<=day&&(event.end?.date||offset(event.start.date,1))>day;
    const start=Date.parse(event.start?.dateTime),end=Date.parse(event.end?.dateTime),a=new Date(day+'T00:00:00').getTime(),b=new Date(offset(day,1)+'T00:00:00').getTime();
    return Number.isFinite(start)&&start<b&&(Number.isFinite(end)&&end>start?end>a:start>=a);
  }
  function visible(day){return connected()&&range===rangeKey()?events.filter(e=>onDay(e,day)&&!(e.extendedProperties?.private?.lifeApp===marker&&state.tasks.some(t=>t.id===e.extendedProperties.private.lifeTask&&t.due===day))):[];}
  function timeLabel(e){return e.start?.date?'종일':new Date(e.start.dateTime).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});}
  function safeLink(value){try{const url=new URL(value);return url.protocol==='https:'&&['calendar.google.com','www.google.com'].includes(url.hostname)?url.href:'';}catch{return '';}}
  function eventButton(e){const href=safeLink(e.htmlLink),title=e.summary||'(제목 없음)';return `<${href?'a':'span'} class="calendar-event event-google" ${href?`href="${esc(href)}" target="_blank" rel="noopener noreferrer"`:''} title="${esc(e.calendarName+' · '+title)}"><span>${esc(timeLabel(e))}</span> ${esc(title)}</${href?'a':'span'}>`;}
  function dayList(day){const items=visible(day);return items.length?`<div class="google-day-events"><h3>구글 일정 ${items.length}개</h3>${items.map(eventButton).join('')}</div>`:'';}
  function pathFor(id){return '/calendars/'+encodeURIComponent(id)+'/events';}
  async function eventId(task){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(marker+':'+task.id));return 'life'+[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
  function taskBody(task){return {summary:(complete(task)?'✓ ':'')+task.title,start:{date:task.due},end:{date:offset(task.due,1)},transparency:'transparent',extendedProperties:{private:{lifeApp:marker,lifeTask:task.id}},description:'Life에서 보낸 할 일이야. 제목과 마감일은 Life에서 수정해줘.',reminders:{useDefault:false}};}
  async function syncTasks(){
    if(writing||!writeEnabled||!connected())return;
    writing=true;writeQueued=false;clearTimeout(writeTimer);const session=epoch;writeMessage='Life 할 일을 구글에 반영하는 중';repaint();
    try {
      if(!targetId){
        const found=calendars.filter(c=>c.description===marker&&c.accessRole==='owner');
        if(found.length>1)throw Error('Life 캘린더가 여러 개 있어. 구글에서 중복 캘린더를 확인해줘.');
        if(found.length)targetId=found[0].id;
        else {
          const calendar=await request('/calendars','POST',{summary:'Life',description:marker,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone});
          if(session!==epoch)return;
          targetId=calendar.id;calendars.push({...calendar,accessRole:'owner'});repaint();
        }
      }
      const endpoint=pathFor(targetId),known=await list(endpoint,{privateExtendedProperty:'lifeApp='+marker,maxResults:'2500',showDeleted:'false'});
      let changed=0,skipped=0;
      for(const task of state.tasks.map(t=>({...t}))){
        if(session!==epoch||!writeEnabled)return;
        if(!validDate(task.due))continue;
        const existing=known.find(e=>e.extendedProperties?.private?.lifeTask===task.id);
        if(!existing&&complete(task))continue;
        // User-created attendees or recurrence are never overwritten by this personal mirror.
        if(existing&&(existing.attendees?.length||existing.recurrence||!existing.start?.date||!existing.end?.date)){skipped++;continue;}
        const body=taskBody(task);
        if(existing&&existing.summary===body.summary&&existing.start?.date===task.due&&existing.end?.date===body.end.date)continue;
        if(existing)await request(endpoint+'/'+encodeURIComponent(existing.id),'PATCH',{summary:body.summary,start:body.start,end:body.end},existing.etag);
        else {
          try {await request(endpoint,'POST',{id:await eventId(task),...body});}
          catch(error){if(error.status===409){skipped++;continue;}throw error;}
        }
        changed++;
      }
      if(session!==epoch)return;
      const retained=known.filter(e=>!state.tasks.some(t=>t.id===e.extendedProperties?.private?.lifeTask&&validDate(t.due))).length;
      writeMessage=`Life 할 일 ${changed}개 반영 완료${skipped?` · 확인이 필요한 일정 ${skipped}개 건너뜀`:''}${retained?` · 삭제되거나 날짜 없는 할 일의 구글 일정 ${retained}개는 유지`:''}`;
      range='';failed='';
    } catch(error){if(session===epoch)writeMessage=error.name==='AbortError'?'일부 반영됐을 수 있어. 지금 반영을 눌러 이어서 진행해줘.':error.message;}
    finally {writing=false;if(session===epoch){if(writeQueued)queue();repaint();}}
  }
  function queue(){if(!writeEnabled||!connected())return;writeQueued=true;clearTimeout(writeTimer);writeTimer=setTimeout(syncTasks,1500);}
  function disconnect(revoke=true){const previous=access;reset();if(revoke&&previous&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(previous,()=>{});repaint();}
  document.addEventListener('click',event=>{
    const action=event.target.closest('[data-google-action]')?.dataset.googleAction;
    if(action==='connect')openSettings();
    if(action==='refresh'){range='';failed='';ensure(true);}
    if(action==='disconnect')disconnect();
    if(action==='enable-write')authorize(true);
    if(action==='sync')syncTasks();
    if(action==='disable-write'){writeEnabled=false;clearTimeout(writeTimer);message='Life 할 일 자동 반영을 껐어.';repaint();}
  });
  document.addEventListener('change',event=>{if(event.target.dataset.googleCalendar!==undefined){const id=event.target.dataset.googleCalendar;if(event.target.checked)selected.add(id);else selected.delete(id);range='';failed='';events=[];ensure();}});
  document.addEventListener('submit',event=>{if(event.target.id==='google-auth-form'){event.preventDefault();authorize();}});
  setInterval(()=>{if(access&&!connected()){expire();return;}if(document.visibilityState==='visible'){if(view==='calendar')ensure(true);if(writeEnabled)syncTasks();}},60000);
  return {panel,ensure,visible,eventButton,dayList,queue,disconnect,onDay,safeLink};
})();
