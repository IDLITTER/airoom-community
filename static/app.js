'use strict';
const $=id=>document.getElementById(id);
const S={data:null,room:null,view:'home',scene:'office',project:'daily',roomHash:'',sideHash:'',actorHash:'',summary:false,offline:false,mode:'discussion',quotaSeenKey:null,quotaSeenAt:0,quotaBaseAge:0};
const terminal=new Set(['completed','partial','failed','cancelled','interrupted']);
const actor=id=>S.data?.actors.find(a=>a.id===id);
const loungeIds=()=>S.data?.settings.team_topic_ids||[S.data?.settings.team_room_id].filter(Boolean);
const isLounge=id=>loungeIds().includes(id);
const topicRooms=()=>isLounge(S.room?.room.id)?S.data.team_topics||[]:S.data.rooms.filter(r=>r.kind==='team'&&r.project_id===S.project&&!isLounge(r.id));
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sprite=a=>`portrait-${['gpt','gemini','deepseek','claude','summary'].includes(a.id)?a.id:'summary'}`;
const avatar=a=>`<span class="mini-avatar ${sprite(a)}" aria-hidden="true"></span>`;
const stateLabel=a=>a.state==='working'?'工作中':a.state==='queued'?'等待调度':a.state==='error'?'上次调用失败':'空闲中';
function quotaHTML(){return '';}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4500);}
async function api(path,options={}){
  const headers={...options.headers};let body=options.body;
  if(body&&!(body instanceof FormData)){headers['Content-Type']='application/json';body=JSON.stringify(body);}
  const response=await fetch(path,{...options,headers,body,credentials:'same-origin'});
  const data=await response.json();
  if(!response.ok){if(response.status===401&&path!='/api/login')showLogin();throw Error(data.error||`请求失败 (${response.status})`);}
  return data;
}
function markdown(text){
  let value=escape(text);const blocks=[];
  value=value.replace(/```[^\n]*\n([\s\S]*?)```/g,(_,code)=>{blocks.push('<pre><code>'+code+'</code></pre>');return `\u0001${blocks.length-1}\u0001`;});
  value=value.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/^#{1,4}\s+(.+)$/gm,'<strong>$1</strong>').replace(/\n/g,'<br>');
  return value.replace(/\u0001(\d+)\u0001/g,(_,n)=>blocks[Number(n)]);
}
function when(value){
  const d=new Date(value);if(!Number.isFinite(d.getTime()))return value||'';
  const options={timeZone:'Asia/Shanghai'};const day=x=>new Intl.DateTimeFormat('en-CA',{...options,year:'numeric',month:'2-digit',day:'2-digit'}).format(x);
  const date=day(d),today=day(new Date()),yesterday=day(new Date(Date.now()-86400000));
  const label=date===today?'今天':date===yesterday?'昨天':date;
  return label+' '+new Intl.DateTimeFormat('zh-CN',{...options,hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
}
function elapsed(value){const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));return seconds>=60?`${Math.floor(seconds/60)}分${seconds%60}秒`:`${seconds}秒`;}
function showLogin(){$('app').hidden=true;$('login-screen').hidden=false;S.data=null;}
function closeSidebar(){$('sidebar').classList.remove('open');}
function showFullDiscussion(){S.summary=false;document.body.classList.remove('summary-only');$('summary-toggle').textContent='查看汇总';}
function setView(view){
  S.view=view;closeSidebar();
  $('sidebar-content').scrollTop=0;
  ['home','scene','chat','project','settings'].forEach(x=>$(x+'-view').hidden=x!==view);
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('selected',x.dataset.view==='home'&&view==='home'||x.dataset.view==='office'&&view==='scene'&&S.scene==='office'||x.dataset.view==='house'&&view==='scene'&&S.scene==='home'));
  $('team-room').classList.toggle('selected',view==='chat'&&isLounge(S.room?.room.id));
  if(view==='project')renderProject();
  if(view==='settings')renderSettings();
  if(view==='scene')renderScene();
  if(view!=='chat'){S.summary=false;document.body.classList.remove('summary-only');}
  window.scrollTo({top:0,behavior:'instant'});
}
function renderActors(){
  $('team-count').textContent=`${S.data.actors.length} 位伙伴`;
  const hash=JSON.stringify([S.data.actors,S.data.quotas]);if(hash===S.actorHash)return;S.actorHash=hash;
  $('team-list').innerHTML=S.data.actors.map(a=>`<button class="team-person actor-${a.id}" data-solo="${a.id}" title="${escape(a.name+' · '+a.role)}">${avatar(a)}<span class="person-details"><span class="person-name">${escape(a.name)}</span><span class="person-state">${stateLabel(a)}</span>${quotaHTML(a.id,true)}</span><span class="person-state-dot ${a.state}" aria-hidden="true"></span></button>`).join('');
  $('character-cards').innerHTML=S.data.actors.map(a=>`<button class="character-card" data-solo="${a.id}" aria-label="与${escape(a.name)}单独聊天"><div class="card-portrait"><div class="portrait-sprite ${sprite(a)}"></div></div><div class="card-info"><h2>${escape(a.name)}</h2><div class="card-model">${escape(a.model)}</div><span class="status-tag ${a.state}">● ${stateLabel(a)}</span><p>${escape(a.role)}</p></div></button>`).join('');
  $('scene-member-strip').innerHTML=S.data.actors.map(a=>`<button class="scene-member" data-solo="${a.id}">${avatar(a)}<span><b>${escape(a.name)}</b><small>${stateLabel(a)} · ${escape(a.role)}</small></span></button>`).join('');
  renderScene();
}
function renderSidebar(){
  const hash=JSON.stringify([S.data.projects,S.data.rooms,S.project,S.room?.room.id,loungeIds()]);if(hash===S.sideHash)return;S.sideHash=hash;
  $('project-list').innerHTML=S.data.projects.map(p=>`<button class="project-item ${p.id===S.project?'selected':''}" data-project="${p.id}">▱ ${escape(p.name)}</button>`).join('');
  const rooms=S.data.rooms.filter(r=>!isLounge(r.id)&&r.project_id===S.project);
  $('room-list').innerHTML=rooms.length?rooms.map(r=>{const a=actor(JSON.parse(r.members)[0]);return `<button class="room-link ${r.id===S.room?.room.id?'selected':''}" data-room="${r.id}" title="${escape(r.title)}">${a?avatar(a):'<span class="room-symbol">♧</span>'}<span class="room-link-text"><strong>${escape(r.title)}</strong><small>${r.kind==='team'?'团队讨论':'单独会话'} · ${when(r.updated)}</small></span></button>`;}).join(''):'<div class="muted empty-room-list">还没有会话，邀请一位伙伴开始吧。</div>';
}
function renderProject(){
  const project=S.data.projects.find(p=>p.id===S.project);if(!project)return;
  const rooms=S.data.rooms.filter(r=>r.project_id===S.project&&!isLounge(r.id));
  $('project-title').textContent=project.name;
  $('project-description').textContent=`${rooms.length} 个会话 · 在这里继续项目讨论，或开始新任务`;
  $('project-room-grid').innerHTML=rooms.length?rooms.map(r=>{
    const busy=S.data.jobs.some(j=>j.room_id===r.id);
    const names=JSON.parse(r.members).map(id=>actor(id)?.name||id).join('、');
    return `<button class="project-room-card" data-room="${r.id}"><span class="eyebrow">${r.kind==='solo'?'单独聊天':'团队讨论'}${busy?' · 进行中':''}</span><h2>${escape(r.title)}</h2><p>${escape(names)}</p><small>${when(r.updated)}</small><span class="project-card-arrow">进入会话 →</span></button>`;
  }).join(''):'<div class="project-empty"><h2>这个项目还没有会话</h2><p>点击“新建项目讨论”，或选择一位伙伴开始。</p></div>';
  $('project-partners').innerHTML=S.data.actors.map(a=>`<button class="soft-button" data-solo="${a.id}">${avatar(a)}与 ${escape(a.name)} 聊聊</button>`).join('');
}
function openProject(id){
  if(!S.data.projects.some(p=>p.id===id))throw Error('项目不存在');
  S.project=id;S.room=null;S.sideHash='';setView('project');renderSidebar();
}
function renderScene(){
  if(!S.data)return;
  const office=S.scene==='office';
  $('virtual-room').dataset.scene=S.scene;
  $('scene-title').textContent=office?'我们的办公室':'我们的虚拟小家';
  $('scene-kicker').textContent=office?'专注与协作':'休息与陪伴';
  $('scene-subtitle').textContent=office?'点击伙伴单独聊天，点击圆桌一起讨论。':'点一位伙伴聊一会儿，或在客厅邀请大家。';
  $('scene-background').src=office?'/static/assets/office.png':'/static/assets/home.png';
  $('scene-background').alt=office?'温暖的虚拟办公室':'温暖的虚拟小家';
  $('scene-office').classList.toggle('selected',office);$('scene-home').classList.toggle('selected',!office);
  $('scene-actors').innerHTML=S.data.actors.map((a,i)=>{
    const busy=a.state==='working'||a.state==='queued';
    return `<button class="scene-person actor-${a.id} ${busy?'working':''}" data-solo="${a.id}" aria-label="${escape(a.name)}，${stateLabel(a)}，单独聊天"><span class="portrait-sprite ${sprite(a)}"></span><span class="scene-name">${escape(a.name)} <span>· ${a.state==='error'?'上次调用失败':busy?stateLabel(a):'休息中'}</span></span></button>`;
  }).join('');
  const busy=S.data.actors.filter(a=>a.state==='working'||a.state==='queued');
  $('scene-state').textContent=busy.length?busy.map(a=>a.name).join('、')+' 正在处理任务':'大家暂时都在休息';
  $('meeting-hotspot').innerHTML=office?'♧ 团队讨论<span>请大家一起来</span>':'♧ 客厅聊聊<span>请大家一起来</span>';
}
function activeJob(){return S.room?.jobs.find(j=>!terminal.has(j.status));}
function renderRoom(){
  if(!S.room)return;const {room,messages,jobs,attachments}=S.room;
  $('chat-title').textContent=isLounge(room.id)?'团队聊天室':room.title;
  $('chat-project').textContent=S.data.projects.find(p=>p.id===room.project_id)?.name||'项目';
  const members=[...room.members,...(room.kind==='team'?['summary']:[])].map(actor).filter(Boolean);
  $('chat-member-list').innerHTML=members.map(a=>`<button class="member-chip plain" data-mention="${escape(a.name)}">${escape(a.name)} · ${escape(a.role)}</button>`).join('');
  $('chat-member-list').hidden=room.kind==='team';
  const job=activeJob();
  const chat=job?.mode==='chat';const interject=chat&&!job.meta?.closing;
  const mode=job?job.mode:S.mode;
  const lounge=isLounge(room.id);
  $('chat-project').textContent=lounge?'工作室 · 固定聊天室':S.data.projects.find(p=>p.id===room.project_id)?.name||'项目';
  $('rename-room').disabled=lounge;
  $('chat-description').textContent=room.kind==='solo'?'与你选择的伙伴独立聊天，消息和资料保存在当前会话。':'闲聊时大家自由接话、追问，聊到自然告一段落；开会围绕议题轮流发言，复核后汇总收尾。随时可以插话。';
  $('topic-manage').hidden=room.kind!=='team';$('topic-new').hidden=room.kind!=='team';
  $('topic-new').disabled=!!job;
  $('topic-select').hidden=room.kind!=='team';$('topic-selector-label').hidden=room.kind!=='team';
  const topics=topicRooms();const topicHash=JSON.stringify([topics.map(x=>[x.id,x.title]),room.id]);
  if($('topic-select').dataset.hash!==topicHash){$('topic-select').innerHTML=topics.map(x=>`<option value="${x.id}" ${x.id===room.id?'selected':''}>${x.id===room.id?'当前 · ':''}${escape(x.title==='团队聊天室'?'日常闲聊':x.title)}</option>`).join('');$('topic-select').dataset.hash=topicHash;}
  const compact=S.room.context||{};
  $('compact-context').disabled=!!job||(compact.new_messages||0)<6;
  $('compact-context').title=job?'请先结束当前讨论':(compact.new_messages||0)<6?'至少需要6条新的已完成消息再压缩':compact.compressed_at?'上次压缩：'+when(compact.compressed_at)+'；原始记录保留':'生成摘要，保留原始记录；会消耗一次 总结助理 AI 模型调用';
  $('discussion-panel').hidden=room.kind!=='team';
  $('discussion-label').textContent=job?.mode==='compact'?'压缩上下文中':job?.meta?.paused?'接话已暂停':mode==='chat'?'自由讨论'+(job?'中':''):'团队会议'+(job?'中':'');
  $('discussion-calls').textContent='已调用 '+(S.room.call_count||0)+' 次';
  $('message-input').placeholder=room.kind==='solo'?'说说你的问题…':mode==='chat'?'说点什么… @ 可指定优先接话者':'写下会议主题、目标和要求…';
  $('chat-mode-bar').hidden=room.kind!=='team';
  $('mode-chat').classList.toggle('selected',mode==='chat');$('mode-meeting').classList.toggle('selected',mode==='discussion');
  $('mode-chat').disabled=!!job;$('mode-meeting').disabled=!!job;
  $('compose-hint').textContent=room.kind==='solo'?'与你选择的角色独立聊天':mode==='chat'?'可随时插话 · @ 指定优先接话 · 每段最多12次发言':'独立分析 → 一轮复核 → 汇总';
  $('chat-speakers').hidden=room.kind!=='team';
  if(room.kind==='team'){$('chat-speakers').innerHTML=[...new Set([...room.members,'summary'])].map(id=>{const a=actor(id);const speaking=chat&&job.meta?.current_speaker===id||messages.some(m=>m.actor===id&&m.status==='working');return `<button type="button" class="speaker-chip actor-${id} ${speaking?'speaking':''}" data-mention="${escape(a.name)}" title="${escape(a.name+' · '+a.role+' · 点击 @ 该成员')}">${avatar(a)}<span>${escape(a.name)}<small>${speaking?'发言中':'在场'}</small></span></button>`;}).join('');}
  $('pause-chat').hidden=!interject;$('finish-chat').hidden=!interject;
  $('pause-chat').textContent=job?.meta?.paused?'恢复接话':'暂停接话';
  $('job-progress').hidden=!job;
  if(job){$('job-phase').textContent=job.phase;$('job-elapsed').textContent='已用 '+elapsed(job.created);}
  $('send-message').disabled=!!job&&!interject;$('upload-open').disabled=!!job;
  $('send-message').textContent=interject?'插话 ↑':job?'正在处理…':room.kind==='solo'?'发送 ↑':mode==='chat'?'开始聊天 ↑':'开始会议 ↑';
  const hash=JSON.stringify([messages,attachments]);
  if(hash===S.roomHash)return;S.roomHash=hash;
  $('messages').innerHTML=messages.length?messages.map(m=>{
    const a=actor(m.actor);const isUser=m.actor==='user';const name=isUser?'你':a?.name||'系统';
    const picture=a?avatar(a):`<span class="text-avatar">${isUser?'你':'·'}</span>`;
    const pending=m.status==='working'||m.status==='queued';
    let content=m.content?markdown(m.content):pending?`<div class="waiting-text"><span></span>${m.status==='queued'?'等待调度':'等待模型返回首个数据块'} · ${elapsed(m.created)}</div>`:'任务已结束。';
    const meta=m.meta||{};const usage=meta.usage||{};
    const foot=[meta.seconds!==undefined?`用时 ${meta.seconds}s`:'',usage.input_tokens?`输入 ${usage.input_tokens.toLocaleString()} tokens`:'',usage.output_tokens?`输出 ${usage.output_tokens.toLocaleString()} tokens`:'',pending&&meta.activity?escape(meta.activity):''].filter(Boolean).join(' · ');
    return `<article class="message actor-${escape(m.actor)} ${isUser?'user':''} ${m.status} ${m.phase==='最终汇总'?'final-summary':''}">${picture}<div class="message-box"><div class="message-meta"><b>${escape(name)}</b><span>${when(m.created)}</span>${!isUser?`<span class="phase-badge">${escape(m.phase)}</span>`:''}${m.model?`<span class="actual-model">${escape(m.model)}</span>`:''}</div><div class="message-content">${content}</div>${foot?`<div class="message-footer">${foot}</div>`:''}</div></article>`;
  }).join(''):`<div class="empty-chat"><div class="empty-symbol">✦</div><h2>${room.kind==='solo'?'我们聊点什么？':mode==='chat'?'大家都在，随时开聊':'今天一起讨论什么？'}</h2><p>${room.kind==='solo'?'这个会话只由你选择的伙伴回答。':mode==='chat'?'直接发消息，大家会接话。这里会保留聊天记录；需要认真讨论时，可以切换到“开会”。':'各位伙伴会独立分析、相互复核，由 总结助理 AI 汇总。你也可以 @某个成员，让它单独回应。'}</p></div>`;
  $('attachment-list').innerHTML=attachments.map(f=>`<span class="file-chip"><a href="/api/attachments/${f.id}" target="_blank" rel="noopener">▱ ${escape(f.name)}</a><button data-remove-file="${f.id}" aria-label="移除${escape(f.name)}" ${job?'disabled':''}>×</button></span>`).join('');
  if(S.summary&&!messages.some(m=>m.phase==='最终汇总')){S.summary=false;document.body.classList.remove('summary-only');$('summary-toggle').textContent='查看汇总';}
}
function renderSettings(){
  if(!S.data)return;
  $('actor-settings').innerHTML=S.data.actors.map(a=>`<form class="actor-setting" data-actor-settings="${a.id}"><div class="actor-setting-heading">${avatar(a)}<div><b>${escape(a.label)}</b><small>${escape(a.model)} · ${escape(a.provider)}</small></div></div><div id="settings-quota-${a.id}">${quotaHTML(a.id)}</div><label>伙伴名字<input name="name" maxlength="24" value="${escape(a.name)}"></label><label>表达方式<textarea name="tone" maxlength="300" rows="3">${escape(a.tone)}</textarea></label><label>聊天活跃度<select name="activity_level">${[['quiet','安静'],['normal','普通'],['lively','活泼']].map(([v,label])=>`<option value="${v}" ${(a.activity_level||'normal')===v?'selected':''}>${label}</option>`).join('')}</select></label><button class="soft-button" type="submit">保存设置</button></form>`).join('');
}
async function refreshState(){
  S.data=await api('/api/state');S.scene=S.data.settings.scene;
  if(S.data.quotas?.queried_at!==S.quotaSeenKey){S.quotaSeenKey=S.data.quotas?.queried_at;S.quotaSeenAt=performance.now();const age=(Date.parse(S.data.time)-Date.parse(S.quotaSeenKey))/1000;S.quotaBaseAge=Number.isFinite(age)?Math.max(0,age):0;}
  $('connection-dot').classList.add('connected');$('connection-text').textContent='AI 工作室已连接';
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',hour:'numeric',hour12:false}).format(new Date()));
  $('greeting').textContent=hour<6?'夜深了 · 慢慢聊':hour<12?'上午好 · 开始新的一天':hour<18?'下午好 · 一起完成今天的事':'晚上好 · 欢迎来到工作室';
  renderActors();renderSidebar();if(S.view==='scene')renderScene();if(S.view==='project')renderProject();
  if(S.view==='settings')for(const a of S.data.actors){const panel=$('settings-quota-'+a.id);if(panel)panel.innerHTML=quotaHTML(a.id);}
}
async function openRoom(id){
  S.room=await api('/api/rooms/'+id);if(!isLounge(id))S.project=S.room.room.project_id;S.roomHash='';S.summary=false;
  S.mode=isLounge(id)?'chat':'discussion';
  document.body.classList.remove('summary-only');$('summary-toggle').textContent='查看汇总';setView('chat');renderRoom();renderSidebar();
}
let loungeOpening=null;
async function openTeamRoom(topicId){
  if(loungeOpening)return loungeOpening;
  loungeOpening=(async()=>{const room=await api('/api/team-room/open',{method:'POST',body:typeof topicId==='string'?{topic_id:topicId}:{}});await refreshState();await openRoom(room.id);$('message-input').focus();})();
  try{await loungeOpening;}finally{loungeOpening=null;}
}
async function solo(id){
  const room=S.data.rooms.find(r=>r.kind==='solo'&&r.project_id===S.project&&JSON.parse(r.members)[0]===id);
  if(room){await openRoom(room.id);return;}
  const created=await api('/api/rooms',{method:'POST',body:{kind:'solo',project_id:S.project,members:[id]}});await refreshState();await openRoom(created.id);
}
function teamDialog(){
  $('room-project').innerHTML=S.data.projects.map(p=>`<option value="${p.id}" ${p.id===S.project?'selected':''}>${escape(p.name)}</option>`).join('');
  $('room-title').value='';$('room-dialog').showModal();
}
async function scene(mode){const target=mode==='house'?'home':mode;await api('/api/settings',{method:'PATCH',body:{scene:target}});S.scene=target;setView('scene');renderScene();}
function handle(action){return async event=>{try{await action(event);}catch(error){toast(error.message);}};}
$('login-form').addEventListener('submit',async event=>{event.preventDefault();$('login-error').textContent='';try{await api('/api/login',{method:'POST',body:{code:$('login-code').value}});$('login-code').value='';await boot();}catch(error){$('login-error').textContent=error.message;}});
$('brand-home').addEventListener('click',()=>setView('home'));
document.querySelectorAll('.nav-item').forEach(button=>button.addEventListener('click',handle(async()=>{const view=button.dataset.view;if(view==='home')setView('home');else await scene(view==='office'?'office':'home');})));
document.querySelectorAll('[data-go]').forEach(button=>button.addEventListener('click',handle(()=>scene(button.dataset.go))));
$('scene-office').addEventListener('click',handle(()=>scene('office')));$('scene-home').addEventListener('click',handle(()=>scene('home')));
['invite-all','team-room','meeting-hotspot'].forEach(id=>$(id).addEventListener('click',handle(openTeamRoom)));
['new-room','project-new-room'].forEach(id=>$(id).addEventListener('click',teamDialog));
$('settings-open').addEventListener('click',()=>setView('settings'));
$('mobile-menu').addEventListener('click',()=>$('sidebar').classList.toggle('open'));
$('add-project').addEventListener('click',()=>$('project-dialog').showModal());
document.body.addEventListener('click',handle(async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.solo){await solo(button.dataset.solo);return;}
  if(button.dataset.room){await openRoom(button.dataset.room);return;}
  if(button.dataset.project){openProject(button.dataset.project);return;}
  if(button.dataset.topicOpen){$('topic-manage-dialog').close();if(isLounge(button.dataset.topicOpen))await openTeamRoom(button.dataset.topicOpen);else await openRoom(button.dataset.topicOpen);return;}
  if(button.dataset.topicRename){S.renameTarget=button.dataset.topicRename;$('rename-title').value=topicRooms().find(x=>x.id===S.renameTarget)?.title||'';$('rename-dialog').showModal();return;}
  if(button.dataset.close){$(button.dataset.close).close();return;}
  if(button.dataset.mention){$('message-input').value+=`@${button.dataset.mention} `;$('message-input').focus();return;}
  if(button.dataset.removeFile){await api('/api/attachments/'+button.dataset.removeFile,{method:'DELETE'});S.room=await api('/api/rooms/'+S.room.room.id);renderRoom();}
}));
$('room-form').addEventListener('submit',handle(async event=>{
  event.preventDefault();const members=Array.from(event.target.querySelectorAll('input[name=member]:checked')).map(x=>x.value);
  if(!members.length){toast('至少邀请一位伙伴');return;}
  const room=await api('/api/rooms',{method:'POST',body:{kind:'team',title:$('room-title').value,project_id:$('room-project').value,members}});
  $('room-dialog').close();await refreshState();await openRoom(room.id);$('message-input').focus();
}));
$('project-form').addEventListener('submit',handle(async event=>{event.preventDefault();const project=await api('/api/projects',{method:'POST',body:{name:$('project-name').value}});$('project-name').value='';$('project-dialog').close();await refreshState();openProject(project.id);toast('项目已创建');}));
$('rename-room').addEventListener('click',()=>{S.renameTarget=S.room.room.id;$('rename-title').value=S.room.room.title;$('rename-dialog').showModal();});
$('rename-form').addEventListener('submit',handle(async event=>{event.preventDefault();const id=S.renameTarget||S.room.room.id;await api('/api/rooms/'+id,{method:'PATCH',body:{title:$('rename-title').value}});$('rename-dialog').close();S.renameTarget=null;await refreshState();if(S.room.room.id===id)await openRoom(id);if($('topic-manage-dialog').open)renderTopicManagement();renderRoom();}));
function renderTopicManagement(){$('topic-manage-list').innerHTML=topicRooms().map(x=>`<div class="topic-management-row"><span><b>${escape(x.title==='团队聊天室'?'日常闲聊':x.title)}</b><small>${when(x.updated)}</small></span><button class="soft-button" data-topic-open="${x.id}">进入</button><button class="plain" data-topic-rename="${x.id}">改名</button></div>`).join('');}
$('topic-manage').addEventListener('click',()=>{renderTopicManagement();$('topic-manage-dialog').showModal();});
$('topic-select').addEventListener('change',handle(async event=>{if(isLounge(event.target.value))await openTeamRoom(event.target.value);else await openRoom(event.target.value);}));
$('topic-new').addEventListener('click',()=>{$('topic-title').value='';$('topic-dialog').showModal();});
$('topic-form').addEventListener('submit',handle(async event=>{event.preventDefault();const body={title:$('topic-title').value};const lounge=isLounge(S.room.room.id);const room=await api(lounge?'/api/team-room/topics':'/api/rooms',{method:'POST',body:lounge?body:{...body,kind:'team',project_id:S.project,members:S.room.room.members}});$('topic-dialog').close();await refreshState();await openRoom(room.id);}));
$('compact-context').addEventListener('click',()=>$('compact-dialog').showModal());
$('compact-confirm').addEventListener('click',handle(async()=>{await api('/api/rooms/'+S.room.room.id+'/jobs',{method:'POST',body:{mode:'compact'}});$('compact-dialog').close();showFullDiscussion();S.room=await api('/api/rooms/'+S.room.room.id);renderRoom();await refreshState();}));
$('message-form').addEventListener('submit',handle(async event=>{
  event.preventDefault();const text=$('message-input').value.trim();if(!text)return;
  $('send-message').disabled=true;
  try{const job=activeJob();if(job?.mode==='chat')await api('/api/jobs/'+job.id+'/chat-control',{method:'POST',body:{action:'interject',text}});else await api('/api/rooms/'+S.room.room.id+'/jobs',{method:'POST',body:{text,mode:S.room.room.kind==='solo'?'discussion':S.mode}});showFullDiscussion();$('message-input').value='';S.room=await api('/api/rooms/'+S.room.room.id);renderRoom();await refreshState();}
  finally{renderRoom();}
}));
$('message-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();$('message-form').requestSubmit();}});
$('stop-job').addEventListener('click',handle(async()=>{const job=activeJob();if(job){await api('/api/jobs/'+job.id+'/stop',{method:'POST',body:{}});toast('停止请求已发送');}}));
$('summary-toggle').addEventListener('click',()=>{
  if(!S.room.messages.some(m=>m.phase==='最终汇总')){toast('还没有最终汇总，讨论结束后会显示');return;}
  S.summary=!S.summary;document.body.classList.toggle('summary-only',S.summary);$('summary-toggle').textContent=S.summary?'返回完整讨论':'查看汇总';
});
$('export-room').addEventListener('click',()=>{if(S.room)window.location.href='/api/rooms/'+S.room.room.id+'/export';});
$('upload-open').addEventListener('click',()=>$('upload-file').click());
$('upload-file').addEventListener('change',handle(async()=>{const file=$('upload-file').files[0];if(!file||!S.room)return;const form=new FormData();form.append('file',file);await api('/api/rooms/'+S.room.room.id+'/attachments',{method:'POST',body:form});$('upload-file').value='';S.room=await api('/api/rooms/'+S.room.room.id);renderRoom();toast('资料已添加');}));
$('actor-settings').addEventListener('submit',handle(async event=>{event.preventDefault();const form=event.target;await api('/api/settings',{method:'PATCH',body:{actors:[{id:form.dataset.actorSettings,name:form.elements.name.value,tone:form.elements.tone.value,activity_level:form.elements.activity_level.value}]}});await refreshState();toast('伙伴设置已保存');}));
$('mode-chat').addEventListener('click',()=>{S.mode='chat';S.roomHash='';renderRoom();});$('mode-meeting').addEventListener('click',()=>{S.mode='discussion';S.roomHash='';renderRoom();});
async function chatAction(action){const job=activeJob();if(!job)return;await api('/api/jobs/'+job.id+'/chat-control',{method:'POST',body:{action}});S.room=await api('/api/rooms/'+S.room.room.id);renderRoom();}
$('pause-chat').addEventListener('click',handle(()=>chatAction(activeJob()?.meta?.paused?'resume':'pause')));
$('finish-chat').addEventListener('click',handle(()=>chatAction('finish')));
$('logout').addEventListener('click',handle(async()=>{await api('/api/logout',{method:'POST',body:{}});showLogin();}));
async function poll(){
  if(!S.data)return;
  try{await refreshState();if(S.view==='chat'&&S.room){const id=S.room.room.id;const next=await api('/api/rooms/'+id);if(S.room?.room.id===id){S.room=next;renderRoom();}}S.offline=false;}
  catch(error){$('connection-dot').classList.remove('connected');$('connection-text').textContent='连接暂时中断';if(!S.offline){toast('暂时无法连接工作室，正在等待恢复');S.offline=true;}}
}
async function boot(){
  try{const auth=await api('/api/auth');if(!auth.authenticated){showLogin();return;}await refreshState();$('login-screen').hidden=true;$('app').hidden=false;setView('home');}
  catch(error){showLogin();$('login-error').textContent=error.message;}
}
boot();setInterval(poll,2500);
