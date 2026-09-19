'use strict';
// A browser-only Google sign-in and Drive appDataFolder store for the public Life site.
// A short-lived token stays in this tab's sessionStorage, never in backups or localStorage.
const lifeDrive=(()=>{
  const clientKey='life-google-settings-v1',metaKey='life-drive-sync-v1',stateKey='life-workspace-v1';
  const defaultClientId='984113599913-gkhf7ovuae617ne0nlk3dc3l8fce4a4g.apps.googleusercontent.com';
  const sessionKey='life-google-session-v1',driveScope='https://www.googleapis.com/auth/drive.appdata';
  const scope='openid https://www.googleapis.com/auth/userinfo.email '+driveScope,filename='life-workspace-v1.json';
  let token='',expires=0,user=null,client='',file=null,version=null,pending=false,conflict=false,busy=false,ready=false,timer,serial=0,sdkPromise;
  let stored={};try{stored=JSON.parse(localStorage.getItem(metaKey)||'{}')||{};}catch{}
  let authBusy=false,authError='',restoreStarted=false;
  function savedClient(){try{return JSON.parse(localStorage.getItem(clientKey)||'{}').clientId||defaultClientId;}catch{return defaultClientId;}}
  function showAuthError(message){authError=message;const el=document.querySelector('#drive-login-error');if(el)el.textContent=message;else toast(message,true);}
  function saveSession(){try{sessionStorage.setItem(sessionKey,JSON.stringify({token,expires,client,sub:user.sub}));}catch{}}
  const connected=()=>!!token&&Date.now()<expires;
  const remember=()=>{stored={sub:user?.sub||stored.sub,fileId:file?.id||null,version,pending};try{localStorage.setItem(metaKey,JSON.stringify(stored));}catch{}}
  const status=(msg,kind='synced')=>{syncInfo={state:kind,message:msg};const el=document.querySelector('#sync-now');if(el)el.textContent=msg;};
  function gate(){const saved=savedClient();
    return `<section class="surface web-welcome google-welcome"><span class="brand-mark">${icon('check')}</span><span class="eyebrow">나의 하루</span><h1>구글 계정으로 시작하기</h1><p>내 목표와 핵심 결과, 일감을 이어서 관리해.</p><form id="drive-login-form"><details class="auth-help" ${saved?'':'open'}><summary>구글 연결 설정</summary><label class="field"><span>구글 OAuth 클라이언트 ID</span><input name="clientId" value="${esc(saved)}" autocomplete="off" spellcheck="false" required placeholder="…apps.googleusercontent.com"></label></details><button class="button button-primary" type="submit" disabled>${authBusy?'로그인 확인 중':'구글 로그인 준비 중'}</button></form><p id="drive-login-error" class="auth-error" role="alert">${esc(authError)}</p><details class="auth-help"><summary>처음 연결하거나 403 오류가 날 때</summary><p>Google Cloud에서 Drive API를 사용 설정해. OAuth 앱이 테스트 상태라면 Google Auth Platform → 대상 → 테스트 사용자에 로그인할 이메일을 추가해.</p><a href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noopener noreferrer">구글 앱 대상 설정</a></details><small>이 탭에서는 로그인 유효시간 동안 새로고침해도 이어서 사용할 수 있어.</small></section>`;}
  function migrationPanel(){return !file&&!pending&&!conflict&&!state.tasks.length&&!state.projects.length&&!state.goals.length?'<section class="surface legacy-import"><div><strong>이전에 GitHub에 기록했어?</strong><p>GitHub 토큰으로 한 번 가져와 구글 드라이브에 옮길 수 있어.</p></div><button class="button button-ghost" id="legacy-import-open">이전 기록 가져오기</button></section>':'';}
  async function loadSdk(){if(window.google?.accounts?.oauth2)return;
    if(!sdkPromise)sdkPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;const timeout=setTimeout(()=>{s.remove();sdkPromise=null;reject(Error('구글 로그인 로딩 시간이 초과됐어.'));},20000);s.onload=()=>{clearTimeout(timeout);resolve();};s.onerror=()=>{clearTimeout(timeout);sdkPromise=null;reject(Error('구글 로그인 화면을 불러오지 못했어.'));};document.head.append(s);});
    await sdkPromise;
  }
  function preload(){restore();loadSdk().then(()=>{const button=document.querySelector('#drive-login-form button');if(button){button.disabled=authBusy;button.textContent=authBusy?'로그인 확인 중':'구글 로그인';}}).catch(e=>showAuthError(e.message));}
  async function api(path,method='GET',body,contentType='application/json'){
    if(!connected()){status('구글 로그인이 만료됐어 · 다시 로그인해줘','error');throw Error('구글 로그인이 만료됐어. 다시 로그인해줘.');}
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),18000),session=serial;
    try{const r=await fetch('https://www.googleapis.com'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':contentType}:{})},...(body?{body}:{}),cache:'no-store',signal:controller.signal});
      if(session!==serial)throw Error('로그인이 바뀌었어. 다시 시도해줘.');
      if(!r.ok){if(r.status===401){expires=0;sessionStorage.removeItem(sessionKey);}const error=Error(r.status===401?'구글 연결이 만료됐어. 저장 상태를 눌러 다시 연결해줘.':r.status===403?'구글 로그인은 됐지만 Drive에 접근할 수 없어. 같은 OAuth 프로젝트에서 Google Drive API를 켜고 앱 데이터 권한을 허용해줘.':`구글 드라이브 요청에 실패했어. (${r.status})`);error.status=r.status;throw error;}
      return r;
    }finally{clearTimeout(timeout);}
  }
  async function getMeta(id){return (await api('/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,name,version')).json();}
  async function discover(){
    const params=new URLSearchParams({spaces:'appDataFolder',q:`name = '${filename}' and trashed = false`,fields:'nextPageToken,files(id,name,version)',pageSize:'100'});
    const found=[];let next='';const seen=new Set();
    do{if(next)params.set('pageToken',next);const result=await(await api('/drive/v3/files?'+params)).json();found.push(...(result.files||[]));next=result.nextPageToken||'';if(next&&(seen.has(next)||seen.size>100))throw Error('Drive 기록 목록을 모두 불러오지 못했어.');seen.add(next);}while(next);
    if(found.length>1)throw Error('Drive에 Life 기록이 여러 개 있어. 자동 저장을 멈췄어.');
    return found[0]||null;
  }
  async function read(){return file?validate(await(await api('/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media')).json()):empty();}
  async function finishLogin(expectedSub=''){
    const r=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(18000)});
    if(!r.ok){const e=Error('구글 계정을 확인하지 못했어. 다시 연결해줘.');e.status=r.status;throw e;}
    const identity=await r.json();if(!identity.sub||!identity.email_verified)throw Error('인증된 구글 이메일을 확인하지 못했어.');
    if(expectedSub&&identity.sub!==expectedSub)throw Error('로그인한 계정이 바뀌었어. 로그아웃한 뒤 다시 연결해줘.');user=identity;
    const remote=await discover();file=remote;version=remote?.version||null;
    if(stored.pending&&stored.sub===user.sub&&stored.version===version&&stored.fileId===(file?.id||null)){
      const cached=localStorage.getItem(stateKey);if(cached){state=validate(JSON.parse(cached));pending=true;}else{state=await read();pending=false;}
    }else if(stored.pending&&stored.sub===user.sub){
      conflict=true;pending=true;state=validate(JSON.parse(localStorage.getItem(stateKey)));status('다른 기기에서 기록이 바뀌었어 · 눌러서 해결하기','conflict');
    }else{state=await read();pending=false;}
    ready=true;authError='';try{localStorage.setItem(stateKey,JSON.stringify(state));}catch{}
    saveSession();remember();document.querySelector('#profile-summary').textContent=user.email;
    if(!conflict)status(file?'구글 드라이브에서 기록을 불러왔어':'구글 드라이브 연결 완료 · 아직 저장된 기록이 없어');
    render();if(pending&&!conflict)flush();
    if(!file&&!pending&&webCredential&&!webMeta.pending)migrateGithub(webCredential).catch(e=>toast('기존 GitHub 기록은 자동으로 옮기지 못했어: '+e.message,true));
  }
  async function restore(){
    if(restoreStarted)return;restoreStarted=true;let saved;try{saved=JSON.parse(sessionStorage.getItem(sessionKey)||'null');}catch{}
    if(!saved||typeof saved.token!=='string'||saved.expires<=Date.now()||!saved.sub||saved.client!==savedClient()){sessionStorage.removeItem(sessionKey);return;}
    authBusy=true;token=saved.token;expires=saved.expires;client=saved.client;serial++;
    try{await finishLogin(saved.sub);}catch(e){token='';user=null;ready=false;if(e.status===401)sessionStorage.removeItem(sessionKey);showAuthError(e.message);}
    finally{authBusy=false;const button=document.querySelector('#drive-login-form button');if(button){button.disabled=false;button.textContent='구글 로그인';}}
  }
  async function login(clientId){
    if(authBusy)return;
    clientId=clientId.trim();if(!/^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId))throw Error('구글 OAuth 클라이언트 ID를 확인해줘.');
    await loadSdk();const oauth=google.accounts.oauth2,expectedSub=ready?user?.sub||'':'';
    try{localStorage.setItem(clientKey,JSON.stringify({clientId}));}catch{}
    authBusy=true;authError='';const button=document.querySelector('#drive-login-form button');if(button){button.disabled=true;button.textContent='로그인 확인 중';}
    oauth.initTokenClient({client_id:clientId,scope,include_granted_scopes:false,callback:async response=>{
      if(response.error||!response.access_token||!oauth.hasGrantedAllScopes(response,driveScope)){authBusy=false;showAuthError('구글 로그인을 완료하고 Drive 앱 데이터 권한을 허용해줘.');preload();return;}
      token=response.access_token;expires=Date.now()+Math.max(0,Number(response.expires_in||0)-30)*1000;client=clientId;serial++;conflict=false;
      try{
        await finishLogin(expectedSub);
      }catch(e){token='';sessionStorage.removeItem(sessionKey);showAuthError(e.message);}
      finally{authBusy=false;preload();}
    },error_callback:()=>{authBusy=false;showAuthError('로그인 창이 닫혔거나 차단됐어. 다시 시도해줘.');preload();}}).requestAccessToken({prompt:expectedSub?'':'select_account',...(expectedSub?{hint:expectedSub}:{})});
  }
  function queue(){pending=true;remember();if(!connected()){status('이 브라우저에 저장됨 · 구글 재로그인 필요','error');return;}status('구글 드라이브에 저장 중','pending');clearTimeout(timer);timer=setTimeout(flush,900);}
  async function flush(){if(busy||!ready||!pending||conflict||!connected())return;busy=true;const snapshot=JSON.stringify(state),session=serial,previous=version;
    try{
      if(new TextEncoder().encode(snapshot).length>4_000_000)throw Error('기록이 커서 자동 저장을 멈췄어. 백업을 내려받아줘.');
      const latest=await discover();if((latest?.id||null)!==(file?.id||null)||(latest?.version||null)!==previous){conflict=true;status('다른 기기에서 기록이 바뀌었어 · 눌러서 해결하기','conflict');return;}
      if(file){
        const result=await api('/upload/drive/v3/files/'+encodeURIComponent(file.id)+'?uploadType=media&fields=id,version','PATCH',snapshot);
        file=await result.json();
      }else{
        const boundary='life_'+crypto.randomUUID().replaceAll('-','');
        const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name:filename,parents:['appDataFolder'],mimeType:'application/json'})}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${snapshot}\r\n--${boundary}--`;
        const result=await api('/upload/drive/v3/files?uploadType=multipart&fields=id,version','POST',body,'multipart/related; boundary='+boundary);file=await result.json();
      }
      if(session!==serial)return;version=file.version;pending=JSON.stringify(state)!==snapshot;remember();status(pending?'구글 드라이브에 저장 중':'구글 드라이브 저장 완료',pending?'pending':'synced');if(pending)timer=setTimeout(flush,900);
    }catch(e){if(session===serial)status(e.name==='AbortError'?'연결이 지연되고 있어. 기록은 이 브라우저에 남아 있어.':e.message,'error');}
    finally{busy=false;}
  }
  async function action(){if(!connected()){await login(client||savedClient());return;}if(conflict){if(!confirm('이 브라우저 기록을 백업하고 구글 드라이브의 최신 기록을 불러올까?'))return;exportData();const latest=await discover();file=latest;version=latest?.version||null;state=await read();pending=false;conflict=false;remember();localStorage.setItem(stateKey,JSON.stringify(state));render();status('구글 드라이브의 최신 기록을 불러왔어');return;}if(pending){await flush();return;}const latest=await discover();if((latest?.id||null)!==(file?.id||null)||(latest?.version||null)!==version){file=latest;version=latest?.version||null;state=await read();localStorage.setItem(stateKey,JSON.stringify(state));render();}status('구글 드라이브에서 최신 기록을 확인했어');}
  function logout(){if(pending&&!confirm('저장되지 않은 변경이 있어. 백업한 뒤 로그아웃할까?'))return; if(pending)exportData();const old=token;serial++;clearTimeout(timer);token='';expires=0;user=null;file=null;version=null;pending=false;conflict=false;ready=false;stored={};authError='';localStorage.removeItem(stateKey);localStorage.removeItem(metaKey);sessionStorage.removeItem(sessionKey);sessionStorage.removeItem(webStorageKey);webCredential='';state=empty();document.querySelector('#profile-summary').textContent='오늘에 집중하는 중';lifeGoogle.disconnect(false);if(old&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(old,()=>{});render();}
  async function migrateGithub(githubToken){if(!connected()||!ready)throw Error('먼저 구글로 로그인해줘.');if(file||state.tasks.length||state.projects.length||state.goals.length)throw Error('구글 기록이 이미 있어. 먼저 백업과 저장 상태를 확인해줘.');const before=webCredential;webCredential=githubToken;
    try{await webPrivate();const raw=await webRequest(webEndpoint);if(!raw)throw Error('GitHub에 이전 기록 파일이 없어.');state=decodeWebState(raw);persist();render();await flush();if(pending)throw Error('구글 드라이브 저장 상태를 확인해줘.');webCredential='';sessionStorage.removeItem(webStorageKey);status('이전 기록을 구글 드라이브로 옮겼어');}
    catch(e){webCredential=before;throw e;}
  }
  document.addEventListener('submit',e=>{if(e.target.id==='drive-login-form'){e.preventDefault();const input=e.target.elements.clientId;document.querySelector('#drive-login-error').textContent='';login(input.value).catch(err=>document.querySelector('#drive-login-error').textContent=err.message);}});
  setInterval(()=>{if(ready&&pending&&!conflict&&connected())flush();if(ready&&token&&!connected()){status('구글 저장 연결 갱신하기 · 작업 내용은 이 브라우저에 있어','error');sessionStorage.removeItem(sessionKey);}},30000);
  return {gate,migrationPanel,preload,login,queue,flush,action,logout,migrateGithub,connected,ready:()=>ready,userId:()=>user?.sub||'',email:()=>user?.email||'',clientId:()=>client};
})();
