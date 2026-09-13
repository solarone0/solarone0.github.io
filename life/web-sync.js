'use strict';
// This module contains no credentials or personal records. Only the browser contacts GitHub.
const webHosted=!['127.0.0.1','localhost'].includes(location.hostname);
const webStorageKey='life-web-session-v1',webMetaKey='life-web-sync-v1';
const webRepo='solarone0/life',webEndpoint='/repos/'+webRepo+'/contents/workspace/state.json';
let webCredential='',webMeta={sha:null,pending:false},webTimer,webBusy=false,webReady=false;
if(webHosted){try{webCredential=sessionStorage.getItem(webStorageKey)||'';webMeta=JSON.parse(localStorage.getItem(webMetaKey)||'null')||webMeta;}catch{}}
function webStatus(message,stateName='synced'){syncInfo={state:stateName,message};const el=document.querySelector('#sync-now');if(el)el.textContent=message;}
function webRemember(){localStorage.setItem(webMetaKey,JSON.stringify(webMeta));}
async function webRequest(endpoint,method='GET',body){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
  try{
    const r=await fetch('https://api.github.com'+endpoint,{method,headers:{Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2026-03-10',Authorization:'Bearer '+webCredential},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal,cache:'no-store'});
    if(r.status===404&&method==='GET'&&endpoint===webEndpoint)return null;
    if(!r.ok){const error=new Error(r.status===401?'접근 토큰을 다시 확인해줘.':r.status===403?'저장소 내용의 읽기·쓰기 권한이나 요청 한도를 확인해줘.':r.status===404?'비공개 저장소 접근 권한을 확인해줘.':r.status===409?'다른 기기에서 기록이 바뀌었어. 다시 불러와줘.':`연결하지 못했어. 잠시 후 다시 시도해줘. (${r.status})`);error.status=r.status;throw error;}
    return await r.json();
  }finally{clearTimeout(timer);}
}
function decodeWebState(file){const binary=atob(file.content.replace(/\s/g,''));return validate(JSON.parse(new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)))));}
async function webPrivate(){const repo=await webRequest('/repos/'+webRepo);if(!repo.private)throw Error('기록은 비공개 저장소에만 저장할 수 있어.');}
async function loadWebState(){
  webStatus('깃허브에서 기록을 불러오는 중','pending');await webPrivate();const file=await webRequest(webEndpoint);
  if(webMeta.pending&&webMeta.sha!==(file?.sha||null)){webReady=false;webStatus('기록이 충돌했어 · 눌러서 해결하기','conflict');return null;}
  webReady=true;
  if(webMeta.pending){webStatus('이 브라우저의 변경 내용을 저장할게','pending');return null;}
  const loaded=file?decodeWebState(file):empty();webMeta.sha=file?.sha||null;webRemember();webStatus('깃허브에서 불러왔어');return loaded;
}
function queueWebSave(){
  webMeta.pending=true;webRemember();
  if(!webCredential){webStatus('이 브라우저에 저장됨 · 깃허브 연결 필요','local');return;}
  webStatus('깃허브에 저장 중','pending');clearTimeout(webTimer);webTimer=setTimeout(flushWebState,900);
}
async function flushWebState(){
  if(webBusy||!webCredential||!webReady||!webMeta.pending)return;
  webBusy=true;const snapshot=JSON.stringify(state),sha=webMeta.sha;
  try{
    await webPrivate();const current=await webRequest(webEndpoint);
    if((current?.sha||null)!==sha){webReady=false;webStatus('기록이 충돌했어 · 눌러서 해결하기','conflict');return;}
    const bytes=new TextEncoder().encode(snapshot);if(bytes.length>900000)throw Error('기록이 커서 자동 저장을 멈췄어. 백업을 내려받아줘.');
    let binary='';for(let i=0;i<bytes.length;i++)binary+=String.fromCharCode(bytes[i]);
    const saved=await webRequest(webEndpoint,'PUT',{message:'웹에서 일정과 기록 저장',content:btoa(binary),...(sha?{sha}:{})});
    webMeta.sha=saved.content.sha;webMeta.pending=JSON.stringify(state)!==snapshot;webRemember();
    webStatus(webMeta.pending?'깃허브에 저장 중':'깃허브 저장 완료',webMeta.pending?'pending':'synced');
    if(webMeta.pending)webTimer=setTimeout(flushWebState,900);
  }catch(e){webStatus(e.name==='AbortError'?'연결이 지연되고 있어. 기록은 이 브라우저에 남아 있어.':e.message,'error');}
  finally{webBusy=false;}
}
function openWebAuth(){document.querySelector('#web-auth-error').textContent='';document.querySelector('#web-auth-modal').showModal();}
function webGate(){return `<section class="surface web-welcome"><span class="brand-mark">${icon('check')}</span><span class="eyebrow">나의 하루</span><h1>내 기록, 어디서든 이어서</h1><p>할 일과 목표, 꾸준히 쌓아온 습관을<br>비공개 깃허브 저장소에서 불러와.</p><button class="button button-primary" id="web-connect">깃허브 연결하기</button><small>개인 기록은 연결한 사람에게만 보여.</small></section>`;}
async function webSyncAction(){
  if(!webCredential){openWebAuth();return;}
  if(syncInfo.state==='conflict'){
    if(!confirm('이 브라우저 기록을 백업한 뒤 깃허브의 최신 기록을 불러올까?'))return;
    exportData();webMeta.pending=false;webRemember();
    try{const loaded=await loadWebState();if(loaded){state=loaded;localStorage.setItem(key,JSON.stringify(state));render();}}catch(e){webStatus(e.message,'error');}
    return;
  }
  if(webMeta.pending){if(!webReady){try{await loadWebState();}catch(e){webStatus(e.message,'error');return;}}await flushWebState();}
  else{try{const loaded=await loadWebState();if(loaded){state=loaded;localStorage.setItem(key,JSON.stringify(state));render();}}catch(e){webStatus(e.message,'error');}}
}
function disconnectWeb(){
  if(webBusy){toast('저장이 끝난 뒤 연결을 해제해줘.');return;}
  if(webMeta.pending&&!confirm('아직 깃허브에 저장되지 않은 변경이 있어. 백업한 뒤 연결을 해제할까?'))return;
  if(webMeta.pending)exportData();
  clearTimeout(webTimer);webCredential='';token='';webReady=false;sessionStorage.removeItem(webStorageKey);localStorage.removeItem(key);localStorage.removeItem(webMetaKey);webMeta={sha:null,pending:false};state=empty();render();
}
window.addEventListener('online',()=>{if(webHosted&&webMeta.pending)webSyncAction();});
setInterval(()=>{if(webHosted&&webCredential&&webMeta.pending&&syncInfo.state!=='conflict')flushWebState();},30000);
