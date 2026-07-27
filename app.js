
// ============ 配置 ============
const DAYS_7=[{k:'mon',n:'周一'},{k:'tue',n:'周二'},{k:'wed',n:'周三'},{k:'thu',n:'周四'},{k:'fri',n:'周五'},{k:'sat',n:'周六'},{k:'sun',n:'周日'}];
function getDays(){const w=weekMode;return w===7?DAYS_7:DAYS_7.slice(0,5);}
const STATUS={todo:{n:'待开始',c:'st-todo'},doing:{n:'进行中',c:'st-doing'},done:{n:'已完成',c:'st-done'},blocked:{n:'阻塞',c:'st-blocked'}};
const STATUS_ORDER=['todo','doing','done','blocked'];

// ============ 状态 ============
let tasks=[];
let viewWeekStart=getMonday(new Date());
let editingId=null;
const DEFAULT_AI={base:'https://opencode.ai/zen/v1',key:'',model:'deepseek-v4-flash-free'};
let aiSettings={...DEFAULT_AI};
let autoStart=false;
let weekMode=5;
let chatHistory=[];

// ============ 工具 ============
function getMonday(d){const x=new Date(d);const day=x.getDay();const diff=day===0?-6:1-day;x.setDate(x.getDate()+diff);x.setHours(0,0,0,0);return x}
function weekKey(d){return fmt(getMonday(d))}
function fmt(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),da=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${da}`}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function uid(){return 't'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)}
function esc(s){return (s||'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]))}
function hl(s,q){if(!s||!q)return s;const ls=s.toLowerCase();let out='',i=0,k=ls.indexOf(q);while(k>=0){out+=s.slice(i,k)+'<mark>'+s.slice(k,k+q.length)+'</mark>';i=k+q.length;k=ls.indexOf(q,i)}return out+s.slice(i)}

// ============ 存储 ============
function load(){try{tasks=JSON.parse(localStorage.getItem('ww_tasks')||'[]')}catch(e){tasks=[]}try{aiSettings={...DEFAULT_AI,...JSON.parse(localStorage.getItem('ww_ai')||'{}')}}catch(e){aiSettings={...DEFAULT_AI}}try{const cfg=JSON.parse(localStorage.getItem('ww_cfg')||'{}');autoStart=!!cfg.autoStart;weekMode=cfg.weekMode||5}catch(e){autoStart=false;weekMode=5}try{chatHistory=JSON.parse(localStorage.getItem('ww_chat')||'[]').slice(-30)}catch(e){chatHistory=[]}}
function save(){localStorage.setItem('ww_tasks',JSON.stringify(tasks));localStorage.setItem('ww_ai',JSON.stringify(aiSettings));localStorage.setItem('ww_cfg',JSON.stringify({autoStart,weekMode}));localStorage.setItem('ww_chat',JSON.stringify(chatHistory.slice(-30)))}

// ============ 渲染看板 ============
function render(){
  const wk=weekKey(viewWeekStart);
  const board=document.getElementById('board');
  const sq=document.getElementById('search-input');
  const q=sq?(sq.value.trim().toLowerCase()):'';
  const match=(t)=>!q||t.content.toLowerCase().includes(q)||(t.people||[]).some(p=>p.toLowerCase().includes(q));
  let html='';
  const todayKey=['sun','mon','tue','wed','thu','fri','sat'][new Date().getDay()];
  const isThisWeek=weekKey(new Date())===wk;
  const days=getDays();

  days.forEach(d=>{
    const list=tasks.filter(t=>t.weekKey===wk&&t.day===d.k&&match(t)).sort((a,b)=>(a.order||a.createdAt)-(b.order||b.createdAt));
    const todayCls=isThisWeek&&d.k===todayKey?' col-today':'';
    html+=colHtml(d.n,list,d.k,false,q,todayCls);
  });
  // 残留列
  const res=tasks.filter(t=>t.day===null&&t.status!=='done'&&t.weekKey<=wk&&match(t)).sort((a,b)=>(a.order||a.createdAt)-(b.order||b.createdAt));
  html+=colHtml('残留任务',res,null,true,q);

  board.innerHTML=html;
  board.style.gridTemplateColumns='repeat('+(days.length+1)+',minmax(0,1fr))';

  // 今日日程
  const todayBar=document.getElementById('today-bar');
  if(todayBar){
    const now=new Date();
    const todayKey=['sun','mon','tue','wed','thu','fri','sat'][now.getDay()];
    const todayWeek=weekKey(now);
    const todayTasks=tasks.filter(t=>t.weekKey===todayWeek&&t.day===todayKey&&t.status!=='done');
    if(todayTasks.length){
      const dayName=['日','一','二','三','四','五','六'][now.getDay()];
      const stColorMap={'todo':'#8a8f99','doing':'#3370ff','done':'#2ea121','blocked':'#f53f3f'};
      let items=todayTasks.map(t=>
        `<span class="today-item"><span class="t-status" style="background:${stColorMap[t.status]||'#8a8f99'}"></span>${esc(t.content)}</span>`
      ).join('');
      todayBar.innerHTML=`<span class="today-label">📅 今天 (周${dayName})：</span>${items}`;
      todayBar.classList.add('show');
    }else{
      todayBar.classList.remove('show');
    }
  }

  // 绑定拖拽 & 点击
  document.querySelectorAll('.col-body').forEach(body=>{
    const day=body.dataset.day;
    body.addEventListener('dragover',e=>{
      e.preventDefault();body.classList.add('drag-over');
      // 找插入位置——在哪个卡片之前
      document.querySelectorAll('.insert-before').forEach(el=>el.classList.remove('insert-before'));
      const cards=body.querySelectorAll('.task:not(.dragging)');
      for(const card of cards){
        const r=card.getBoundingClientRect();
        if(e.clientY<r.top+r.height/2){card.classList.add('insert-before');break}
      }
    });
    body.addEventListener('dragleave',()=>{
      body.classList.remove('drag-over');
      body.querySelectorAll('.insert-before').forEach(el=>el.classList.remove('insert-before'));
    });
    body.addEventListener('drop',e=>{
      e.preventDefault();body.classList.remove('drag-over');
      const id=e.dataTransfer.getData('text/plain');
      const beforeEl=body.querySelector('.insert-before');
      const beforeId=beforeEl?beforeEl.dataset.id:null;
      body.querySelectorAll('.insert-before').forEach(el=>el.classList.remove('insert-before'));
      moveTask(id,day||null,beforeId)
    });
  });
  document.querySelectorAll('.task').forEach(t=>{
    t.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',t.dataset.id);t.classList.add('dragging')});
    t.addEventListener('dragend',()=>{document.querySelectorAll('.dragging,.insert-before').forEach(el=>el.classList.remove('dragging','insert-before'))});
  });

  // 顶栏
  const end=addDays(viewWeekStart,weekMode===7?6:4);
  const isThis=weekKey(new Date())===wk;
  document.getElementById('week-label').textContent=isThis?'本周':(wk>weekKey(new Date())?'未来周':'过往周');
  document.getElementById('week-range').textContent=`${viewWeekStart.getMonth()+1}/${viewWeekStart.getDate()} - ${end.getMonth()+1}/${end.getDate()}`;
}

function colHtml(name,list,day,isRes,q,extraCls){
  const body=list.map(t=>taskHtml(t,q)).join('')||'';
  return `<div class="col ${isRes?'residual':''}${extraCls||''}">
    <div class="col-head"><span>${name}</span><span class="count">${list.length}</span></div>
    <div class="col-body" data-day="${day||''}">${body}
      <button class="add-btn" data-action="add" data-day="${day||''}">+ 添加</button>
    </div>
  </div>`;
}

function taskHtml(t,q){
  const st=STATUS[t.status]||STATUS.todo;
  const people=(t.people||[]).map(p=>`<span class="chip">${esc(p)}</span>`).join('');
  const resTag=t.day===null?`<span class="t-tag">残留</span>`:'';
  const remindTag=t.remindAt?`<span class="t-remind">⏰ ${t.remindAt}</span>`:'';
  const repeatIcon=t.repeat?`<span class="t-repeat">↻ ${{'daily':'每日',mon:'每周一',tue:'每周二',wed:'每周三',thu:'每周四',fri:'每周五'}[t.repeat]||t.repeat}</span>`:'';
  const notesIcon=t.notes?`<span class="t-notes-icon">📎</span>`:'';
  return `<div class="task ${t.status==='done'?'done':''}" draggable="true" data-id="${t.id}" style="border-left-color:${stColor(t.status)}" data-action="edit" data-task-id="${t.id}">
    <button class="del" data-action="delete" data-task-id="${t.id}">✕</button>
    ${resTag}
    <div class="t-content">${hl(esc(t.content),q)}${notesIcon}</div>
    ${people?`<div class="t-people">${people}</div>`:''}
    ${repeatIcon?`<div class="t-repeat-row">${repeatIcon}</div>`:''}
    ${remindTag?`<div class="t-remind-row">${remindTag}</div>`:''}
    <div class="t-foot">
      <button class="status-badge ${st.c}" data-action="status" data-task-id="${t.id}">${st.n}</button>
    </div>
  </div>`;
}
function stColor(s){return {todo:'#8a8f99',doing:'#3370ff',done:'#2ea121',blocked:'#f53f3f'}[s]||'#8a8f99'}

// ============ 操作 ============
function moveTask(id,day,beforeId){
  const t=tasks.find(x=>x.id===id);if(!t)return;
  saveSnapshot();
  const changedCol=(t.day!==day);
  if(day&&changedCol)t.weekKey=weekKey(viewWeekStart);
  t.day=day;
  // 同列排序：收集该列可见的任务（含不同 weekKey 的残留）重新编号
  const colTasks=(day
    ? tasks.filter(x=>x.weekKey===t.weekKey&&x.day===day&&x.id!==id)
    : tasks.filter(x=>x.day===null&&x.status!=='done'&&x.weekKey<=weekKey(viewWeekStart)&&x.id!==id)
  ).sort((a,b)=>(a.order||a.createdAt)-(b.order||b.createdAt));
  const idx=beforeId?colTasks.findIndex(x=>x.id===beforeId):-1;
  if(idx>=0)colTasks.splice(idx,0,t);else colTasks.push(t);
  colTasks.forEach((x,i)=>{x.order=(i+1)*10});
  save();render();
}
function cycleStatus(id){
  const t=tasks.find(x=>x.id===id);if(!t)return;
  saveSnapshot();
  t.status=STATUS_ORDER[(STATUS_ORDER.indexOf(t.status)+1)%STATUS_ORDER.length];
  save();render();
}
function changeWeek(d){viewWeekStart=getMonday(addDays(viewWeekStart,d*7));render()}

function carryOverToNextWeek(){
  const wk=weekKey(viewWeekStart);
  const undone=tasks.filter(t=>t.weekKey===wk&&t.status!=='done');
  if(!confirm(`确认进入下周？\n\n本周未完成任务 ${undone.length} 个将自动滚入下周「残留任务」。`))return;
  saveSnapshot();
  const nk=weekKey(addDays(viewWeekStart,7));
  let n=0;
  tasks.forEach(t=>{if(t.weekKey===wk&&t.status!=='done'){t.weekKey=nk;t.day=null;n++}});
  save();
  viewWeekStart=getMonday(addDays(viewWeekStart,7));
  render();
  pushSysMsg(n?`已将 ${n} 个未完成任务滚入下周「残留任务」`:'本周任务已全部完成 🎉');
}

// ============ 任务弹窗 ============
function openTaskModal(day,id){
  editingId=id||null;
  document.getElementById('task-title').textContent=id?'编辑任务':'新建任务';
  document.getElementById('task-del').style.display=id?'block':'none';
  if(id){
    const t=tasks.find(x=>x.id===id);
    if(!t){
      // 任务可能已被 AI 删除，回退为新建模式
      editingId=null;
      document.getElementById('task-title').textContent='新建任务';
      document.getElementById('task-del').style.display='none';
      document.getElementById('f-content').value='';
      document.getElementById('f-day').value=day||'';
      document.getElementById('f-status').value='todo';
      document.getElementById('f-people').value='';
      document.getElementById('f-remind').value='';
      document.getElementById('f-repeat').value='';
      document.getElementById('f-notes').value='';
      pushSysMsg('⚠️ 该任务已不存在，已切换为新建模式');
    }else{
      document.getElementById('f-content').value=t.content;
      document.getElementById('f-day').value=t.day||'';
      document.getElementById('f-status').value=t.status;
      document.getElementById('f-people').value=(t.people||[]).join(', ');
      document.getElementById('f-remind').value=t.remindAt||'';
      document.getElementById('f-repeat').value=t.repeat||'';
      document.getElementById('f-notes').value=t.notes||'';
    }
  }else{
    document.getElementById('f-content').value='';
    document.getElementById('f-day').value=day||'';
    document.getElementById('f-status').value='todo';
    document.getElementById('f-people').value='';
    document.getElementById('f-remind').value='';
    document.getElementById('f-repeat').value='';
    document.getElementById('f-notes').value='';
  }
  document.getElementById('task-overlay').classList.add('show');
  setTimeout(()=>document.getElementById('f-content').focus(),80);
}
function closeTaskModal(){document.getElementById('task-overlay').classList.remove('show')}
function saveTask(){
  saveSnapshot();
  const content=document.getElementById('f-content').value.trim();
  if(!content){alert('请输入任务内容');return}
  const day=document.getElementById('f-day').value||null;
  const status=document.getElementById('f-status').value;
  const people=document.getElementById('f-people').value.split(/[,，]/).map(s=>s.trim()).filter(Boolean);
  const notes=document.getElementById('f-notes').value.trim()||null;
  const remindAt=document.getElementById('f-remind').value||null;
  const repeat=document.getElementById('f-repeat').value||null;
  if(editingId){
    const t=tasks.find(x=>x.id===editingId);
    Object.assign(t,{content,day,status,people,remindAt,repeat,notes});
    if(day)t.weekKey=weekKey(viewWeekStart);
  }else{
    tasks.push({id:uid(),content,day,status,people,remindAt,repeat,notes,order:Date.now(),weekKey:weekKey(viewWeekStart),createdAt:Date.now()});
  }
  save();closeTaskModal();render();
}
function deleteTask(id){const t=tasks.find(x=>x.id===id);if(!t)return;if(!confirm('确定删除该任务？'))return;saveSnapshot();tasks=tasks.filter(t=>t.id!==id);save();render()}
function deleteCurrent(){if(editingId)deleteTask(editingId);closeTaskModal()}

// ============ 设置 ============
async function openSettings(){
  document.getElementById('s-base').value=aiSettings.base||'';
  document.getElementById('s-key').value=aiSettings.key||'';
  document.getElementById('s-model').value=aiSettings.model||'deepseek-v4-flash-free';
  let on=autoStart;
  if(window.electronAPI){try{on=await window.electronAPI.getAutoStart()}catch(e){}}
  document.getElementById('s-autostart').checked=on;
  document.getElementById('s-weekmode').value=String(weekMode);
  document.getElementById('set-overlay').classList.add('show');
}
function closeSettings(){document.getElementById('set-overlay').classList.remove('show')}
function openAbout(){document.getElementById('about-overlay').classList.add('show')}
function closeAbout(){document.getElementById('about-overlay').classList.remove('show')}
async function saveSettings(){
  aiSettings={base:document.getElementById('s-base').value.trim(),key:document.getElementById('s-key').value.trim(),model:document.getElementById('s-model').value.trim()||'deepseek-v4-flash-free'};
  const want=document.getElementById('s-autostart').checked;
  if(window.electronAPI){try{await window.electronAPI.setAutoStart(want)}catch(e){}}
  autoStart=want;
  const newWeek=parseInt(document.getElementById('s-weekmode').value)||5;
  if(newWeek!==weekMode){weekMode=newWeek;render()}
  save();
  closeSettings();
  pushSysMsg('设置已保存'+(want?'，已开启开机自启动':''));
}

// ============ 导入导出 ============
function exportData(){const b=new Blob([JSON.stringify(tasks,null,2)],{type:'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=`工作安排_${fmt(new Date())}.json`;a.click();URL.revokeObjectURL(u)}
function importData(){const i=document.createElement('input');i.type='file';i.accept='.json';i.onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{
  let parsed;
  try{parsed=JSON.parse(ev.target.result)}catch(_){alert('文件格式不正确：不是有效的 JSON');return}
  if(!Array.isArray(parsed)){alert('文件格式不正确：应为任务数组');return}
  // 校验并补全必要字段
  const wk=weekKey(viewWeekStart);
  const cleaned=parsed.filter(t=>t&&typeof t==='object'&&typeof t.content==='string').map(t=>({
    id:String(t.id||uid()),
    content:String(t.content),
    people:Array.isArray(t.people)?t.people.map(String).filter(x=>x):[],
    status:['todo','doing','done','blocked'].includes(t.status)?t.status:'todo',
    day:getDays().map(d=>d.k).includes(t.day)?t.day:null,
    weekKey:t.weekKey||wk,
    order:Number(t.order)||Date.now(),
    createdAt:Number(t.createdAt)||Date.now(),
    remindAt:t.remindAt||null,
    repeat:t.repeat||null,
    notes:t.notes||null
  }));
  if(cleaned.length===0){alert('文件中没有有效任务');return}
  tasks=cleaned;save();render();pushSysMsg('导入成功，共 '+cleaned.length+' 项任务');
};r.onerror=()=>alert('读取文件失败');r.readAsText(f);i.click()}}

// ============ AI 对话 ============
function mdToHtml(s,showOps){
  if(!s)return '';
  // 先提取代码块，避免被转义破坏
  const blocks=[];
  s=s.replace(/```(\w*)\n?([\s\S]*?)```/g,(_,lang,code)=>{
    const idx=blocks.length;
    blocks.push({lang,code:code.trim()});
    return '@@CODE'+idx+'@@';
  });
  // 再提取 JSON 操作块（用于显示按钮）
  const ops=[];
  s=s.replace(/```json\s*(\[\s*\{[\s\S]*?\}\s*\])\s*```/g,(_,json)=>{
    try{
      const parsed=JSON.parse(json);
      if(Array.isArray(parsed)){ops.push(...parsed);return ''}
    }catch(e){}
    return _;
  });
  s=s.replace(/```json\s*(\{[\s\S]*?\})\s*```/g,(_,json)=>{
    try{
      const parsed=JSON.parse(json);
      if(parsed.operations&&Array.isArray(parsed.operations)){ops.push(...parsed.operations);return ''}
    }catch(e){}
    return _;
  });
  // 剩余 ```json 块也尝试提取
  s=s.replace(/```json[\s\S]*?```/g,'');
  // 转义 HTML
  s=s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  // 还原代码块
  s=s.replace(/@@CODE(\d+)@@/g,(_,idx)=>{
    const b=blocks[+idx];
    return '<pre><code'+(b.lang?' class="lang-'+b.lang+'"':'')+'>'+b.code+'</code></pre>';
  });
  // 行内代码
  s=s.replace(/`([^`]+)`/g,'<code>$1</code>');
  // 表格
  s=s.replace(/^\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/gm,(_,h,b)=>{
    const hs=h.split('|').map(x=>x.trim()).filter(Boolean);
    const rows=b.trim().split('\n').map(r=>r.split('|').map(x=>x.trim()).filter(Boolean));
    let tbl='<table><thead><tr>'+hs.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>';
    rows.forEach(r=>{tbl+='<tr>'+r.map(x=>'<td>'+x+'</td>').join('')+'</tr>'});
    return tbl+'</tbody></table>';
  });
  // 粗体
  s=s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  // 斜体
  s=s.replace(/\*(.+?)\*/g,'<em>$1</em>');
  // 列表
  s=s.replace(/(^|\n)((?:- .+(?:\n|$))+)/g,(m,pre,block)=>{
    const items=block.trim().split('\n').map(x=>'<li>'+x.replace(/^- /,'')+'</li>').join('');
    return pre+'@@UL@@'+items+'@@/UL@@';
  });
  s=s.replace(/(^|\n)((?:\d+\. .+(?:\n|$))+)/g,(m,pre,block)=>{
    const items=block.trim().split('\n').map(x=>'<li>'+x.replace(/^\d+\. /,'')+'</li>').join('');
    return pre+'@@OL@@'+items+'@@/OL@@';
  });
  s=s.replace(/@@UL@@([\s\S]*?)@@\/UL@@/g,'<ul>$1</ul>');
  s=s.replace(/@@OL@@([\s\S]*?)@@\/OL@@/g,'<ol>$1</ol>');
  // 链接
  s=s.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(m,text,url)=>{
    const safe=url.startsWith('http://')||url.startsWith('https://');
    return safe?'<a href="'+url+'" target="_blank" rel="noopener">'+text+'</a>':text+'（'+url+'）'
  });
  // 换行
  s=s.replace(/\n/g,'<br>');
  s=s.replace(/(<ul>|<ol>)<br>/g,'$1').replace(/<br>(<\/ul>|<\/ol>)/g,'$1');
  // 如果开启了操作按钮模式，且在最终回复中检测到有效操作，生成执行按钮
  if(showOps&&ops.length){
    s+='<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">';
    s+='<button class="ops-btn" data-ops=\''+esc(JSON.stringify(ops))+'\' style="background:var(--primary);color:#fff;border:none;padding:7px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">✅ 执行 '+ops.length+' 项操作</button>';
    s+='<span style="font-size:12px;color:var(--text2);align-self:center">点击后对看板生效</span>';
    s+='</div>';
  }
  return s;
}
function extractOpsFromHtml(html){try{const m=html.match(/data-ops='([^']+)'/);return m?JSON.parse(m[1]):[]}catch(e){return[]}}
function pushMsg(role,text){const c=document.getElementById('chat');const d=document.createElement('div');d.className='msg '+role;if(role==='ai')d.innerHTML=mdToHtml(text,true);else d.textContent=text;c.appendChild(d);c.scrollTop=c.scrollHeight;return d}
function pushSysMsg(text){const c=document.getElementById('chat');const d=document.createElement('div');d.className='msg sys';d.innerHTML=mdToHtml(text);c.appendChild(d);c.scrollTop=c.scrollHeight}
function clearChat(){chatHistory=[];document.getElementById('chat').innerHTML='';pushSysMsg('已新建对话');save()}
function restoreChat(){const el=document.getElementById('chat');if(!el)return;el.innerHTML='';chatHistory.forEach(m=>{const d=document.createElement('div');d.className='msg '+(m.role==='user'?'user':m.role==='assistant'?'ai':'sys');if(m.role==='user')d.textContent=m.content||'';else d.innerHTML=mdToHtml(m.content||'');el.appendChild(d)});el.scrollTop=el.scrollHeight}

// 统一 AI 调用入口：优先走 Electron 主进程（无跨域），否则浏览器直接 fetch 兜底
async function callAI(payload){
  if(window.electronAPI && window.electronAPI.callAI){
    return window.electronAPI.callAI(payload);
  }
  // 浏览器/非 Electron 环境回退：用浏览器 fetch 直连（依赖接口允许跨域）
  const base=(payload.base||'https://opencode.ai/zen/v1').replace(/\/$/,'');
  // opencode.ai 等接口无需 Key；仅当 key 非空时才带 Authorization 头
  const headers={'Content-Type':'application/json'};
  if(payload.key && payload.key.trim()) headers['Authorization']='Bearer '+payload.key.trim();
  const resp=await fetch(base+'/chat/completions',{
    method:'POST',
    headers,
    body:JSON.stringify({model:payload.model,messages:payload.messages,temperature:0.2,...(payload.tools?{tools:payload.tools}:{})})
  });
  const data=await resp.json();
  if(!resp.ok)throw new Error(data.error?.message||'API 请求失败');
  return data;
}

function stripJsonBlock(s){return (s||'').replace(/```json[\s\S]*?```/g,'').trim()}
let _toolTags=[];
function addToolTag(s){const d=document.createElement('div');d.className='msg tool-tag';d.textContent=s;document.getElementById('chat').appendChild(d);d.scrollIntoView();_toolTags.push(d)}
function removeToolTags(){_toolTags.forEach(d=>d.remove());_toolTags=[]}
function buildPrompt(){
  const wk=weekKey(viewWeekStart);
  const now=new Date();
  const dayNames=['日','一','二','三','四','五','六'];
  const nowStr=`${fmt(now)} (周${dayNames[now.getDay()]}) ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  return `你是"本周工作安排"应用的智能助手。当前时间：${nowStr}。当前查看的周（周一日期）是 ${wk}。

当前看板上的任务数据（JSON）：
${getVisibleTasksJSON()}

可用 day：mon(周一) tue(周二) wed(周三) thu(周四) fri(周五) sat(周六) sun(周日)，null（残留/未排期）。当前设置为 ${weekMode} 天工作周。

当用户增删改任务时，在回复末尾附加 \`\`\`json 代码块，包含 operations 数组：
- {"action":"add","content":"...","people":["..."],"status":"todo|doing|done|blocked","day":"mon"|...|null,"repeat?":"daily|mon|tue|wed|thu|fri","remindAt?":"HH:MM","notes?":"..."}
- {"action":"move","taskId":"...","day":"mon"|...|null}
- {"action":"edit","taskId":"...","content?":"...","people?":[...],"day?":"...","repeat?":"...","remindAt?":"HH:MM或null","notes?":"..."}
- {"action":"status","taskId":"...","status":"done"}
- {"action":"delete","taskId":"..."}
- {"action":"carryover"}

规则：
1. taskId 必须使用上面 JSON 中真实存在的 id，不要编造。
2. 新增任务由系统生成 id，你不必提供。
3. 直接执行，禁止追问。不知道的就用常识推断（没说日期就今天，没状态就 todo）。
4. 用中文简洁回复，不加表情符号。
5. 用户说"这个/那个/它"等代词时，根据聊天历史判断是哪个任务，不要猜错。
6. 当有多个任务名称相似时（如"外部账户管理系统sow"和"会议室mcpserver的sow"），务必通过完整任务内容精确匹配，不能混淆。用户说的"那个sow"是指他刚提到的那个任务，不是别的。
7. 用户说"提醒我"或"到时提醒"时，通过 remindAt 字段设置提醒时间（格式 HH:MM，如14:25）。应用支持到点弹出系统通知。不要说你做不到，直接用 edit 设置 remindAt 即可。`;
}
async function sendChat(){
  const el=document.getElementById('ai-text');
  const text=el.value.trim();
  if(!text)return;
  el.value='';pushMsg('user',text);
  chatHistory.push({role:'user',content:text});
  const sendBtn=document.getElementById('ai-send');
  sendBtn.disabled=true;
  addToolTag('📋 获取看板数据...');
  // 给每条用户消息附加当前日期，方便 AI 理解"今天/明天/周三"等相对日期
  const now=new Date();
  const dayNames=['日','一','二','三','四','五','六'];
  const dateTag=`[当前日期：${fmt(now)} 周${dayNames[now.getDay()]}]`;
  const userMsg=dateTag+' '+text;
  const messages=[{role:'system',content:buildPrompt()},...chatHistory.filter(m=>m.role==='user'||m.role==='assistant').slice(-5).map(m=>({role:m.role==='user'?'user':'assistant',content:m.content})),{role:'user',content:userMsg}];
  const payload={base:aiSettings.base,key:aiSettings.key,model:aiSettings.model,messages};

  // 流式路径：Electron 主进程
  if(window.electronAPI && window.electronAPI.callAIStream){
    const aiBubble=document.createElement('div');aiBubble.className='msg ai';
    let rawContent='';
    let typing=document.createElement('div');typing.className='typing';typing.innerHTML='<span></span><span></span><span></span>';
    let finished=false;
    const cleanup=()=>{
      if(typing&&typing.parentNode)typing.remove();typing=null;
      window.electronAPI.removeAIListeners();
    };
    window.electronAPI.onAIChunk((c)=>{
      if(finished)return;
      if(c===null)return;
      if(!typing.parentNode){document.getElementById('chat').appendChild(aiBubble);aiBubble.appendChild(typing);removeToolTags()}
      rawContent+=c;
      const displayContent=rawContent.replace(/```json[\s\S]*?```/g,'').trim();
      if(displayContent){
        aiBubble.innerHTML=mdToHtml(displayContent);
        if(typing)aiBubble.appendChild(typing);
      }
      const chat=document.getElementById('chat');chat.scrollTop=chat.scrollHeight;
    });
    window.electronAPI.onAIEnd((r)=>{
      if(finished)return;finished=true;cleanup();
      const reply=r.fullContent||rawContent||'(无回复)';
      if(!aiBubble.parentNode){document.getElementById('chat').appendChild(aiBubble)}
      // 最终显示清理 JSON 后的干净回复
      const clean=stripJsonBlock(reply);
      aiBubble.innerHTML=mdToHtml(clean,true);
      chatHistory.push({role:'assistant',content:reply});
      removeToolTags();
      sendBtn.disabled=false;
    });
    window.electronAPI.onAIError((e)=>{
      if(finished)return;finished=true;cleanup();
      removeToolTags();
      pushMsg('ai','⚠️ '+(e||'流式请求失败')+(/invalid api key|401|unauthorized|api.?key/i.test(e||'')?' —— 请点击 ⚙ 填入正确的 API Key':''));
      sendBtn.disabled=false;
    });
    try{
      await window.electronAPI.callAIStream(payload);
    }catch(e){
      if(!finished){finished=true;cleanup();removeToolTags();
        pushMsg('ai','⚠️ '+(e.message||e)+(/invalid api key|401|unauthorized|api.?key/i.test(e.message||'')?' —— 请点击 ⚙ 填入正确的 API Key':''));
        sendBtn.disabled=false;
      }
    }
    return;
  }

  // 降级回退：非流式
  try{
    const data=await callAI(payload);
    removeToolTags();
    const reply=data.choices?.[0]?.message?.content||'(无回复)';
    const aiBubble=document.createElement('div');aiBubble.className='msg ai';
    document.getElementById('chat').appendChild(aiBubble);
    aiBubble.innerHTML=mdToHtml(stripJsonBlock(reply));
    chatHistory.push({role:'assistant',content:reply});
    const ops=extractOps(reply);
    if(ops.length){const n=applyOps(ops);if(n)pushSysMsg('AI 已调整 '+n+' 项任务');}
  }catch(err){
    removeToolTags();
    pushMsg('ai','⚠️ '+err.message+(/invalid api key|401|unauthorized|api.?key/i.test(err.message)?' —— 请点击 ⚙ 填入正确的 API Key':''));
  }finally{sendBtn.disabled=false}
}

// ============ 周报 ============
function generateReport(){
  const wk=weekKey(viewWeekStart);
  const end=addDays(viewWeekStart,weekMode===7?6:4);
  const weekStr=`${viewWeekStart.getMonth()+1}/${viewWeekStart.getDate()} - ${end.getMonth()+1}/${end.getDate()}`;
  const all=tasks.filter(t=>t.weekKey===wk);
  const done=all.filter(t=>t.status==='done');
  const doing=all.filter(t=>t.status==='doing');
  const todo=all.filter(t=>t.status==='todo');
  const blocked=all.filter(t=>t.status==='blocked');
  const residual=tasks.filter(t=>t.weekKey<=wk&&t.day===null&&t.status!=='done');
  const byDay={mon:'周一',tue:'周二',wed:'周三',thu:'周四',fri:'周五',sat:'周六',sun:'周日'};
  let daySummary='';
  const days=getDays();
  days.forEach(d=>{
    const list=all.filter(t=>t.day===d.k);
    if(list.length)daySummary+=`${byDay[d.k]||d.k}：${list.map(t=>t.content+(t.status!=='todo'?'('+STATUS[t.status].n+')':'')).join('、')}\n`;
  });
  const text=`请帮我生成一份本周（${weekStr}）的工作周报，按日期列出已完成和进行中的任务，最后给出总结和建议。\n\n任务统计：\n- 已完成：${done.length}项\n- 进行中：${doing.length}项\n- 待开始：${todo.length}项\n- 阻塞：${blocked.length}项\n- 残留任务：${residual.length}项\n\n详细任务：\n${daySummary||'（本周暂无任务安排）'}\n\n要求：用中文简洁格式，分「本周完成」「进行中」「下周计划」三段，不加json。`;
  // 弹出编辑框，用户可修改提示词
  document.getElementById('report-text').value=text;
  document.getElementById('report-overlay').classList.add('show');
  setTimeout(()=>document.getElementById('report-text').focus(),80);
}
function sendReport(){
  const text=document.getElementById('report-text').value.trim();
  if(!text)return;
  document.getElementById('report-overlay').classList.remove('show');
  const el=document.getElementById('ai-text');
  el.value=text;
  sendChat();
}

function getVisibleTasksJSON(){
  const wk=weekKey(viewWeekStart);
  const visible=tasks.filter(t=>(t.weekKey===wk&&t.day!==null)||(t.day===null&&t.status!=='done'&&t.weekKey<=wk))
    .map(t=>({id:t.id,content:t.content,people:t.people,status:t.status,day:t.day,weekKey:t.weekKey,remindAt:t.remindAt||null,repeat:t.repeat||null,notes:t.notes||null}));
  return JSON.stringify(visible,null,2);
}

function extractOps(reply){
  const m=reply.match(/```json\s*([\s\S]*?)```/);
  if(!m)return [];
  try{
    const obj=JSON.parse(m[1]);
    if(Array.isArray(obj.operations))return obj.operations;
    if(Array.isArray(obj))return obj;
  }catch(e){}
  return [];
}

function applyOps(ops){
  const wk=weekKey(viewWeekStart);
  saveSnapshot();
  let n=0;
  ops.forEach(op=>{
    if(op.action==='add'){
      tasks.push({id:uid(),content:op.content,people:op.people||[],status:op.status||'todo',day:op.day??null,remindAt:op.remindAt||null,repeat:op.repeat||null,notes:op.notes||null,order:Date.now(),weekKey:wk,createdAt:Date.now()});n++;
    }else if(op.action==='move'){
      const t=tasks.find(x=>x.id===op.taskId);if(t){if(op.day)t.weekKey=wk;t.day=op.day??null;t.order=Date.now();n++}
    }else if(op.action==='edit'){
      const t=tasks.find(x=>x.id===op.taskId);if(t){if(op.content!=null)t.content=op.content;if(op.people!=null)t.people=op.people;if(op.day!==undefined){if(op.day)t.weekKey=wk;t.day=op.day??null}if(op.remindAt!==undefined)t.remindAt=op.remindAt||null;if(op.repeat!==undefined)t.repeat=op.repeat||null;if(op.notes!==undefined)t.notes=op.notes||null;t.order=Date.now();n++}
    }else if(op.action==='status'){
      const t=tasks.find(x=>x.id===op.taskId);if(t){t.status=op.status;n++}
    }else if(op.action==='delete'){
      const before=tasks.length;tasks=tasks.filter(x=>x.id!==op.taskId);if(tasks.length<before)n++
    }else if(op.action==='carryover'){
      const nk=weekKey(addDays(viewWeekStart,7));
      tasks.forEach(t=>{if(t.weekKey===wk&&t.status!=='done'){t.weekKey=nk;t.day=null;n++}});
      viewWeekStart=addDays(viewWeekStart,7);
    }
  });
  if(n)save();
  render();
  return n;
}

// ============ 撤销（全状态快照） ============
let undoStack=[];
function saveSnapshot(){undoStack.push(JSON.parse(JSON.stringify(tasks)));if(undoStack.length>20)undoStack.shift()}
function undo(){
  const prev=undoStack.pop();
  if(prev){tasks=prev;save();render();pushSysMsg('✅ 已撤销上一步操作')}
  else pushSysMsg('没有可撤销的操作');
}


// ============ 事件绑定 ============
function bindEvents(){
  // 顶栏按钮
  document.querySelectorAll('[data-nav]').forEach(btn=>{
    btn.addEventListener('click',()=>changeWeek(parseInt(btn.dataset.nav)));
  });
  document.getElementById('btn-export').addEventListener('click',exportData);
  document.getElementById('btn-import').addEventListener('click',importData);
  document.getElementById('btn-about').addEventListener('click',openAbout);
  document.getElementById('btn-newtask').addEventListener('click',()=>openTaskModal(null));
  document.getElementById('btn-nextweek').addEventListener('click',carryOverToNextWeek);
  document.getElementById('btn-report').addEventListener('click',generateReport);
  document.querySelector('[data-action="send-report"]').addEventListener('click',sendReport);
  document.querySelector('[data-close="report-modal"]').addEventListener('click',()=>document.getElementById('report-overlay').classList.remove('show'));

  // 搜索框
  const si=document.getElementById('search-input');
  let searchTimer;
  si.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(render,120)});
  si.addEventListener('keydown',e=>{if(e.key==='Escape'){clearTimeout(searchTimer);si.value='';render()}});

  // AI 对话
  document.getElementById('ai-newchat').addEventListener('click',clearChat);
  document.getElementById('ai-gear').addEventListener('click',openSettings);
  document.getElementById('ai-send').addEventListener('click',sendChat);
  document.getElementById('ai-text').addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat()}
  });

  // 任务弹窗
  document.getElementById('task-del').addEventListener('click',deleteCurrent);
  document.querySelectorAll('[data-close="task-modal"]').forEach(b=>b.addEventListener('click',closeTaskModal));
  document.querySelector('[data-action="save-task"]').addEventListener('click',saveTask);

  // 清空提醒时间
  const clearBtn=document.getElementById('f-remind-clear');
  if(clearBtn)clearBtn.addEventListener('click',()=>{document.getElementById('f-remind').value=''});

  // 设置弹窗
  document.querySelectorAll('[data-close="set-modal"]').forEach(b=>b.addEventListener('click',closeSettings));
  document.querySelector('[data-action="save-settings"]').addEventListener('click',saveSettings);

  // 检查更新
  const updateBtn=document.getElementById('btn-check-update');
  if(updateBtn)updateBtn.addEventListener('click',async ()=>{
    if(!window.electronAPI||!window.electronAPI.checkUpdate){pushSysMsg('⚠️ 非 Electron 环境，无法检查更新');return}
    const hint=document.getElementById('update-hint');
    hint.textContent='正在检查...';
    updateBtn.disabled=true;
    const info=await window.electronAPI.checkUpdate();
    if(!info.ok){
      hint.textContent=info.error||'检查失败';
      updateBtn.disabled=false;
      return;
    }
    hint.textContent='发现 '+info.version+'（'+Math.round(info.size/1048576)+'MB）— '+info.body.slice(0,80);
    updateBtn.textContent='⬇ 下载安装';
    updateBtn.onclick=async()=>{
      updateBtn.textContent='下载中...';
      updateBtn.disabled=true;
      const res=await window.electronAPI.downloadUpdate(info.downloadUrl);
      if(!res.ok){hint.textContent=res.error||'下载失败';updateBtn.disabled=false;return}
      window.electronAPI.onUpdateDownloaded((path)=>{
        hint.textContent='下载完成，启动安装...';
        window.electronAPI.installUpdate(path);
      });
    };
  });

  // 关于弹窗
  document.querySelector('[data-close="about-modal"]').addEventListener('click',closeAbout);
  // 关于弹窗 tab 切换
  document.querySelectorAll('.about-tab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.about-tab').forEach(b=>{b.style.borderBottomColor='transparent';b.style.color='var(--text2)';b.style.fontWeight='500'});
      btn.style.borderBottomColor='var(--primary)';btn.style.color='var(--primary)';btn.style.fontWeight='600';
      document.getElementById('about-features').style.display=btn.dataset.tab==='features'?'block':'none';
      document.getElementById('about-changelog').style.display=btn.dataset.tab==='changelog'?'block':'none';
    });
  });

  // 看板事件委托（任务卡点击/删除/状态切换/添加）
  document.getElementById('board').addEventListener('click',e=>{
    const target=e.target.closest('[data-action]');
    if(!target)return;
    const action=target.dataset.action;
    if(action==='add'){
      e.stopPropagation();
      openTaskModal(target.dataset.day||'');
    }else if(action==='edit'){
      openTaskModal(null,target.dataset.taskId);
    }else if(action==='delete'){
      e.stopPropagation();
      deleteTask(target.dataset.taskId);
    }else if(action==='status'){
      e.stopPropagation();
      cycleStatus(target.dataset.taskId);
    }
  });

  // 点遮罩关闭
  document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('show')}));

  // 全局快捷键
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){document.querySelectorAll('.overlay').forEach(o=>o.classList.remove('show'));return}
    if(e.ctrlKey||e.metaKey){
      if(e.key==='n'){e.preventDefault();openTaskModal(null)}
      else if(e.key==='f'){e.preventDefault();const el=document.getElementById('search-input');if(el){el.focus();el.select()}}
      else if(e.key==='z'){e.preventDefault();undo()}
    }
  });

  // 操作确认按钮（.ops-btn）
  document.addEventListener('click',e=>{
    const btn=e.target.closest('.ops-btn');
    if(!btn)return;
    const ops=extractOpsFromHtml(btn.outerHTML);
    if(ops.length){
      const n=applyOps(ops);
      btn.replaceWith(document.createTextNode('✅ 已执行'));
      if(n)pushSysMsg('✅ 已执行 '+n+' 项操作');
    }
  });
}

// ============ 初始化 ============
load();
restoreChat();

// 自动跨周
(function(){
  const lastWeek=localStorage.getItem('ww_week')||'';
  const curWeek=weekKey(new Date());
  if(curWeek>lastWeek&&lastWeek){
    const moved=tasks.filter(t=>t.weekKey<curWeek&&t.day!==null&&t.status!=='done');
    if(moved.length){
      moved.forEach(t=>{t.weekKey=curWeek;t.day=null});
      save();
      pushSysMsg('📅 检测到新周，已将 '+moved.length+' 项未完成任务自动汇入本周残留');
    }
  }
  localStorage.setItem('ww_week',curWeek);
})();
if(tasks.length===0){
  const wk=weekKey(new Date());
  tasks=[
    {id:uid(),content:'周一晨会同步本周目标',people:['团队'],status:'todo',day:'mon',weekKey:wk,createdAt:Date.now()},
    {id:uid(),content:'Q3 需求评审',people:['产品','张三'],status:'todo',day:'wed',weekKey:wk,createdAt:Date.now()+1},
    {id:uid(),content:'联调支付接口',people:['李四','后端'],status:'doing',day:'thu',weekKey:wk,createdAt:Date.now()+2},
    {id:uid(),content:'周报撰写',people:['我'],status:'todo',day:'fri',weekKey:wk,createdAt:Date.now()+3},
    {id:uid(),content:'客户合同待法务确认',people:['法务','王五'],status:'blocked',day:null,weekKey:wk,createdAt:Date.now()+4},
  ];
  save();
}
processRecurring();
bindEvents();
render();
initReminder();
if(window.electronAPI && autoStart){window.electronAPI.setAutoStart(true).catch(()=>{});}
pushSysMsg('💡 快捷键：Ctrl+N 新建  Ctrl+F 搜索  Ctrl+Z 撤销  ⇧Enter 换行');
pushSysMsg('💡 当前 AI 接口：'+aiSettings.base+'  模型：'+aiSettings.model+(aiSettings.key?' (已配置 Key)':' (无需 Key 即可使用)'));

// ============ 任务提醒 & 例行检查 ============
function initReminder(){
  setInterval(()=>{
    const now=new Date();
    const hh=String(now.getHours()).padStart(2,'0');
    const mm=String(now.getMinutes()).padStart(2,'0');
    const curTime=hh+':'+mm;
    const todayKey=['sun','mon','tue','wed','thu','fri','sat'][now.getDay()];
    const wk=weekKey(now);
    tasks.forEach(t=>{
      if(t.remindAt===curTime && t.status!=='done' && t.day===todayKey && t.weekKey===wk && !t._reminded){
        t._reminded=true;
        if(window.electronAPI && window.electronAPI.showNotification){
          window.electronAPI.showNotification({title:'🔔 任务提醒',body:t.content}).catch(()=>{});
        }
        pushSysMsg('🔔 提醒：'+t.content+'（'+t.remindAt+'）');
      }
    });
    // 顺便处理例行任务（跨天场景）
    processRecurring();
  },60000); // 每60秒检查一次
}

// ============ 例行任务处理 ============
function processRecurring(){
  const wk=weekKey(viewWeekStart);
  const today=new Date();
  const todayKey=['sun','mon','tue','wed','thu','fri','sat'][today.getDay()];
  const dayMap={mon:1,tue:2,wed:3,thu:4,fri:5,sat:6,sun:7};
  let changed=false;
  tasks.forEach(t=>{
    if(!t.repeat || t.day===null)return;
    // 判断这个任务是否在本次查看的周内需要处理
    if(t.weekKey!==wk)return;
    // 如果任务安排在过去的日期（比如周五是今天，任务在周一且未完成），自动标记已完成并创建下个周期
    const taskDayIdx=dayMap[t.day]||0;
    const todayIdx=dayMap[todayKey]||0;
    if(t.status!=='done' && todayIdx>taskDayIdx && t.day!==todayKey){
      // 已过期的未完成任务→标记完成
      t.status='done';
      changed=true;
    }
    if(t.status==='done' && !t._nextCreated){
      // 已完成的例行任务→生成下次实例
      const origRepeat=t.repeat;
      t.repeat=null; // 先清空原任务repeat，防止崩溃导致重启后重复生成
      if(origRepeat==='daily'){
        // 每日：加到下一个工作日
        let next=new Date(today);
        for(let i=0;i<7;i++){
          next.setDate(next.getDate()+1);
          const nk=['sun','mon','tue','wed','thu','fri','sat'][next.getDay()];
          if(nk!=='sat'&&nk!=='sun'){ // 跳过周末
            tasks.push({id:uid(),content:t.content,people:[...t.people],status:'todo',day:nk,
              remindAt:t.remindAt,repeat:origRepeat,order:Date.now(),weekKey:weekKey(next),createdAt:Date.now()});
            changed=true;
            break;
          }
        }
      }else if(origRepeat==='mon'||origRepeat==='tue'||origRepeat==='wed'||origRepeat==='thu'||origRepeat==='fri'){
        // 每周某天：加到下周同一天
        const nextWeek=new Date(today);
        const targetDay=['sun','mon','tue','wed','thu','fri','sat'].indexOf(origRepeat);
        let d=(targetDay-nextWeek.getDay()+7)%7;
        if(d===0)d=7; // 如果今天就是目标天，跳到下周
        nextWeek.setDate(nextWeek.getDate()+d);
        tasks.push({id:uid(),content:t.content,people:[...t.people],status:'todo',day:origRepeat,
          remindAt:t.remindAt,repeat:origRepeat,order:Date.now(),weekKey:weekKey(nextWeek),createdAt:Date.now()});
        changed=true;
      }
      t._nextCreated=true;
    }
  });
  if(changed)save();
}

