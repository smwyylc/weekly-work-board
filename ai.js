// ============ AI & 设置 & 周报 ============
window.WB = window.WB || {};

(function(WB) {

  // ==================== 设置 ====================
  WB.openSettings = async function() {
    var ai = WB.state.aiSettings;
    var base = (ai.base||'').toLowerCase();
    var preset = (base.includes('opencode.ai') && !ai.key) ? 'opencode' : 'openai';
    document.getElementById('sPreset').value = preset;
    var advanced = document.getElementById('sAiAdvanced');
    advanced.style.display = (preset === 'openai') ? 'block' : 'none';
    document.getElementById('sBase').value = ai.base || '';
    document.getElementById('sKey').value = ai.key || '';
    document.getElementById('sModel').value = ai.model || 'gpt-4o';
    WB.updateAISummary();
    document.getElementById('sAutostart').checked = WB.state.autoStart;
    document.getElementById('sWeekmode').value = String(WB.state.weekMode);
    document.getElementById('setOverlay').classList.add('show');
  };

  WB.updateAISummary = function() {
    var el = document.getElementById('sAiSummary');
    if (!el) return;
    var preset = document.getElementById('sPreset').value;
    if (preset === 'opencode') el.textContent = 'opencode.ai（免费）';
    else {
      var b = document.getElementById('sBase').value || '默认';
      var m = document.getElementById('sModel').value || '默认';
      el.textContent = b + ' / ' + m;
    }
    WB.updateAiMeta();
  };

  WB.updateAiMeta = function() {
    var el = document.getElementById('aiMetaInfo');
    if (!el) return;
    var ai = WB.state.aiSettings;
    var base = (ai.base||'').replace(/^https?:\/\//,'').replace(/\/+$/,'');
    el.textContent = 'ⓘ ' + base + ' · ' + (ai.model||'default') + (ai.key ? ' · Key 已配置' : ' · 无需 Key');
    el.title = '接口: ' + (ai.base||'') + '\n模型: ' + (ai.model||'') + '\nKey: ' + (ai.key ? '已配置' : '未配置');
  };

  WB.closeSettings = function() {
    document.getElementById('setOverlay').classList.remove('show');
  };

  WB.openAbout = function() {
    document.getElementById('aboutOverlay').classList.add('show');
  };

  WB.closeAbout = function() {
    document.getElementById('aboutOverlay').classList.remove('show');
  };

  WB.saveSettings = async function() {
    var preset = document.getElementById('sPreset').value;
    if (preset === 'opencode') {
      WB.state.aiSettings = { base:'https://opencode.ai/zen/v1', key:'', model:'deepseek-v4-flash-free' };
    } else {
      WB.state.aiSettings = {
        base: document.getElementById('sBase').value.trim() || 'https://api.openai.com/v1',
        key: document.getElementById('sKey').value.trim(),
        model: document.getElementById('sModel').value.trim() || 'gpt-4o'
      };
    }
    var want = document.getElementById('sAutostart').checked;
    if (window.electronAPI) {
      try { await window.electronAPI.setAutoStart(want); } catch(e) { console.error('开机自启设置失败', e); }
    }
    WB.state.autoStart = want;
    var newWeek = parseInt(document.getElementById('sWeekmode').value) || 5;
    if (newWeek !== WB.state.weekMode) { WB.state.weekMode = newWeek; WB.render(); }
    WB.save();
    WB.closeSettings();
    if (WB.pushSysMsg) WB.pushSysMsg('✅ 设置已保存 — ' + (preset === 'opencode' ? 'opencode.ai（免费）' : WB.state.aiSettings.base));
  };

  // ==================== 导入导出 ====================
  WB.exportData = function() {
    var b = new Blob([JSON.stringify(WB.state.tasks, null, 2)], {type:'application/json'});
    var u = URL.createObjectURL(b);
    var a = document.createElement('a');
    a.href = u;
    a.download = '工作安排_' + WB.fmt(new Date()) + '.json';
    a.click();
    URL.revokeObjectURL(u);
  };

  // ==================== AI 对话 ====================
  WB.mdToHtml = function(s) {
    if (!s) return '';
    // 1) 移除 JSON 操作块（不在消息中显示）
    s = s.replace(/```json\s*(\[\s*\{[\s\S]*?\}\s*\])\s*```/g, '');
    s = s.replace(/```json\s*(\{[\s\S]*?\})\s*```/g, '');
    s = s.replace(/```json[\s\S]*?```/g, '');
    // 2) 提取非 JSON 围栏代码块
    var blocks = [];
    s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, function(_, lang, code) {
      var idx = blocks.length;
      blocks.push({lang: lang, code: code.trim()});
      return '@@FENCE' + idx + '@@';
    });
    // 3) 提取行内代码
    var inlines = [];
    s = s.replace(/`([^`]+)`/g, function(_, code) {
      var idx = inlines.length;
      inlines.push(code);
      return '@@ICODE' + idx + '@@';
    });
    // 4) 转义 HTML
    s = s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    // 5) 还原行内代码
    s = s.replace(/@@ICODE(\d+)@@/g, function(_, idx) { return '<code>' + WB.esc(inlines[+idx]) + '</code>'; });
    // 6) 还原围栏代码块
    s = s.replace(/@@FENCE(\d+)@@/g, function(_, idx) {
      var b = blocks[+idx];
      return '<pre><code' + (b.lang ? ' class="lang-' + WB.esc(b.lang) + '"' : '') + '>' + WB.esc(b.code) + '</code></pre>';
    });
    // 7) 标题（放在转义之后、粗体之前、换行之前）
    s = s.replace(/(^|\n)### (.+)/g, '$1<h4 style="font-size:13px;font-weight:700;margin:8px 0 3px">$2</h4>');
    s = s.replace(/(^|\n)## (.+)/g, '$1<h3 style="font-size:14px;font-weight:700;margin:10px 0 4px">$2</h3>');
    s = s.replace(/(^|\n)# (.+)/g, '$1<h2 style="font-size:15px;font-weight:700;margin:12px 0 5px">$2</h2>');
    // 8) 粗体
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // 9) 斜体
    s = s.replace(/(^|\s)\*([^*\n]+?)\*(\s|[.,;:!?，。；：！？\n]|$)/g, '$1<em>$2</em>$3');
    // 10) 表格
    s = s.replace(/^\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/gm, function(_, h, b) {
      var hs = h.split('|').map(function(x) { return x.trim(); }).filter(Boolean);
      var rows = b.trim().split('\n').map(function(r) { return r.split('|').map(function(x) { return x.trim(); }).filter(Boolean); });
      var tbl = '<table><thead><tr>' + hs.map(function(x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>';
      rows.forEach(function(r) { tbl += '<tr>' + r.map(function(x) { return '<td>' + x + '</td>'; }).join('') + '</tr>'; });
      return tbl + '</tbody></table>';
    });
    // 11) 无序列表
    s = s.replace(/(^|\n)((?:- .+(?:\n|$))+)/g, function(m, pre, block) {
      var items = block.trim().split('\n').map(function(x) { return '<li>' + x.replace(/^- /,'') + '</li>'; }).join('');
      return pre + '<ul>' + items + '</ul>';
    });
    // 12) 有序列表
    s = s.replace(/(^|\n)((?:\d+\. .+(?:\n|$))+)/g, function(m, pre, block) {
      var items = block.trim().split('\n').map(function(x) { return '<li>' + x.replace(/^\d+\. /,'') + '</li>'; }).join('');
      return pre + '<ol>' + items + '</ol>';
    });
    // 13) 链接
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(m, text, url) {
      var safe = url.startsWith('http://') || url.startsWith('https://');
      return safe ? '<a href="' + url + '" target="_blank" rel="noopener">' + text + '</a>' : text + '（' + url + '）';
    });
    // 14) 换行
    s = s.replace(/\n/g, '<br>');
    // 清理首尾多余空白/换行
    s = s.replace(/^(<br>)+/, '').replace(/(<br>)+$/, '');
    s = s.replace(/(<br>){3,}/g, '<br><br>');
    // 15) 操作按钮 — 已移至外部 aiOpsBar
    return s;
  };

  WB.showOpsBar = function(ops, summaries) {
    var bar = document.getElementById('aiOpsBar');
    if (!bar) return;
    var n = ops.length;
    var detail = '';
    if (summaries && summaries.length) {
      detail = '<div class="ops-detail">' + summaries.map(function(s) { return WB.esc(s); }).join(' · ') + '</div>';
    }
    bar.innerHTML = '<span class="ops-info">✅ 已执行 ' + n + ' 项操作</span>' + detail;
    bar.classList.add('show');
    clearTimeout(bar._timer);
    bar._timer = setTimeout(function() { bar.classList.remove('show'); }, 6000);
  };

  WB.extractOpsFromHtml = function(html) {
    try { var m = html.match(/data-ops='([^']+)'/); return m ? JSON.parse(m[1]) : []; } catch(e) { return []; }
  };

  WB.pushMsg = function(role, text) {
    var c = document.getElementById('aiBody');
    var d = document.createElement('div');
    d.className = 'msg ' + role;
    if (role === 'bot') d.innerHTML = WB.mdToHtml(text);
    else d.textContent = text;
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
    return d;
  };

  WB.pushSysMsg = function(text) {
    var c = document.getElementById('aiBody');
    var d = document.createElement('div');
    d.className = 'msg sys';
    d.innerHTML = WB.mdToHtml(text);
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
  };

  WB.clearChat = function() {
    WB.state.chatHistory = [];
    document.getElementById('aiBody').innerHTML = '';
    WB.pushSysMsg('已新建对话');
    WB.save();
  };

  WB.restoreChat = function() {
    var el = document.getElementById('aiBody');
    if (!el) return;
    el.innerHTML = '';
    WB.state.chatHistory.forEach(function(m) {
      var d = document.createElement('div');
      d.className = 'msg ' + (m.role === 'user' ? 'user' : m.role === 'assistant' ? 'bot' : 'sys');
      if (m.role === 'user') d.textContent = m.content || '';
      else d.innerHTML = WB.mdToHtml(m.content || '');
      el.appendChild(d);
    });
    el.scrollTop = el.scrollHeight;
  };

  // 统一 AI 调用入口
  WB.callAI = async function(payload) {
    if (window.electronAPI && window.electronAPI.callAI) {
      return window.electronAPI.callAI(payload);
    }
    var base = (payload.base||'https://opencode.ai/zen/v1').replace(/\/$/,'');
    var headers = {'Content-Type':'application/json'};
    if (payload.key && payload.key.trim()) headers['Authorization'] = 'Bearer ' + payload.key.trim();
    var resp = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        model: payload.model,
        messages: payload.messages,
        temperature: 0.2,
        ...(payload.tools ? {tools: payload.tools} : {})
      })
    });
    var data = await resp.json();
    if (!resp.ok) throw new Error((data.error && data.error.message) || 'API 请求失败');
    return data;
  };

  WB.stripJsonBlock = function(s) {
    var r = (s||'');
    r = r.replace(/```json[\s\S]*?```/g, '');
    r = r.replace(/\n?\s*\{\s*"operations"[\s\S]*?\}\s*/g, '');
    while (true) {
      var m = r.match(/\n?\s*\[\s*((?:\s*\{[^}]*\}\s*,?\s*)+)\]\s*/);
      if (!m) break;
      var inner = m[1];
      if (/["']action["']\s*:/.test(inner) || /["']operations["']\s*:/.test(inner)) {
        r = r.slice(0, m.index) + r.slice(m.index + m[0].length);
      } else break;
    }
    r = r.replace(/\n?\s*\{\s*["']action["']\s*:[\s\S]*?\}\s*/g, '');
    return r.trim();
  };

  WB.addToolTag = function(s) {
    var d = document.createElement('div');
    d.className = 'msg tool-tag';
    d.textContent = s;
    document.getElementById('aiBody').appendChild(d);
    d.scrollIntoView();
    WB._toolTags.push(d);
  };

  WB.removeToolTags = function() {
    WB._toolTags.forEach(function(d) { d.remove(); });
    WB._toolTags = [];
  };

  WB.buildPrompt = function() {
    var wk = WB.weekKey(WB.state.viewWeekStart);
    var now = new Date();
    var dayNames = ['日','一','二','三','四','五','六'];
    var nowStr = WB.fmt(now) + ' (周' + dayNames[now.getDay()] + ') ' +
      String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    return '你是"本周工作安排"应用的智能助手。当前时间：' + nowStr + '。当前查看的周（周一日期）是 ' + wk + '。\n\n' +
      '当前看板上的任务数据（JSON）：\n' + WB.getVisibleTasksJSON() + '\n\n' +
      '可用 day：mon(周一) tue(周二) wed(周三) thu(周四) fri(周五) sat(周六) sun(周日)，null（残留/未排期）。当前设置为 ' + WB.state.weekMode + ' 天工作周。\n\n' +
      '当用户增删改任务时，在回复末尾附加 ```json 代码块，包含 operations 数组：\n' +
      '- {"action":"add","content":"...","people":["..."],"status":"todo|doing|done|blocked","day":"mon"|...|null,"repeat?":"daily|mon|tue|wed|thu|fri","remindAt?":"HH:MM","notes?":"...","priority?":"low|normal|urgent"}\n' +
      '- {"action":"move","taskId":"...","day":"mon"|...|null}\n' +
      '- {"action":"edit","taskId":"...","content?":"...","people?":[...],"day?":"...","repeat?":"...","remindAt?":"HH:MM或null","notes?":"...","priority?":"low|normal|urgent"}\n' +
      '- {"action":"status","taskId":"...","status":"todo|doing|done|blocked","notes?":"状态变更原因（可选）"}\n' +
      '- {"action":"delete","taskId":"..."}\n' +
      '- {"action":"carryover"}\n\n' +
      '规则：\n' +
      '1. taskId 必须使用上面 JSON 中真实存在的 id，不要编造。\n' +
      '2. 新增任务由系统生成 id，你不必提供。\n' +
      '3. 直接执行，禁止追问。不知道的就用常识推断（没说日期就今天，没状态就 todo）。\n' +
      '4. 用中文简洁回复，不加表情符号。\n' +
      '5. 用户说"这个/那个/它"等代词时，根据聊天历史判断是哪个任务，不要猜错。\n' +
      '6. 当有多个任务名称相似时，务必通过完整任务内容精确匹配，不能混淆。\n' +
      '7. 用户说"提醒我"或"到时提醒"时，通过 remindAt 字段设置提醒时间（格式 HH:MM，如14:25）。本应用支持到点系统通知，直接设置即可，不要说做不到。\n' +
      '8. 【重要】JSON 操作块必须用 ```json 包裹，回复正文中绝对不要出现任何裸露的 JSON 数组或对象。\n' +
      '9. 优先级默认为一般（normal），除非用户明确说"加急""重要""优先""紧急"等，否则不要主动设置或修改 priority 字段。\n' +
      '10. 不要将已完成（status: done）的任务移入残留列（day: null）——已完成任务只留在原列中，残留列仅展示未完成的任务。';
  };

  WB.sendChat = async function() {
    var el = document.getElementById('aiInput');
    var text = el.value.trim();
    if (!text) return;
    el.value = '';
    WB.pushMsg('user', text);
    WB.state.chatHistory.push({role:'user', content:text});
    var sendBtn = document.getElementById('aiSend');
    sendBtn.disabled = true;
    var now = new Date();
    var dayNames = ['日','一','二','三','四','五','六'];
    var dateTag = '[当前日期：' + WB.fmt(now) + ' 周' + dayNames[now.getDay()] + ']';
    var userMsg = dateTag + ' ' + text;
    var messages = [
      {role:'system', content:WB.buildPrompt()}
    ].concat(
      WB.state.chatHistory.filter(function(m) { return m.role === 'user' || m.role === 'assistant'; }).slice(0, -1).slice(-5).map(function(m) {
        return {role: m.role === 'user' ? 'user' : 'assistant', content: m.content};
      }),
      [{role:'user', content:userMsg}]
    );
    var payload = {
      base: WB.state.aiSettings.base,
      key: WB.state.aiSettings.key,
      model: WB.state.aiSettings.model,
      messages: messages
    };

    // 流式路径：Electron 主进程
    if (window.electronAPI && window.electronAPI.callAIStream) {
      var aiBubble = document.createElement('div');
      aiBubble.className = 'msg bot';
      var rawContent = '';
      var typing = document.createElement('div');
      typing.className = 'typing';
      typing.innerHTML = '<span></span><span></span><span></span>';
      var finished = false;
      var cleanup = function() {
        if (typing && typing.parentNode) typing.remove();
        typing = null;
        window.electronAPI.removeAIListeners();
      };
      window.electronAPI.onAIChunk(function(c) {
        if (finished) return;
        if (c === null) return;
        if (!typing.parentNode) { document.getElementById('aiBody').appendChild(aiBubble); aiBubble.appendChild(typing); }
        rawContent += c;
        var displayContent = WB.stripJsonBlock(rawContent);
        if (displayContent) {
          aiBubble.innerHTML = WB.mdToHtml(displayContent);
          if (typing) aiBubble.appendChild(typing);
        }
        var chat = document.getElementById('aiBody');
        chat.scrollTop = chat.scrollHeight;
      });
      window.electronAPI.onAIEnd(function(r) {
        if (finished) return;
        finished = true;
        cleanup();
        var reply = r.fullContent || rawContent || '(无回复)';
        if (!aiBubble.parentNode) { document.getElementById('aiBody').appendChild(aiBubble); }
        aiBubble.innerHTML = WB.mdToHtml(reply);
        WB.state.chatHistory.push({role:'assistant', content:reply});
        WB.save();
        var ops = WB.extractOpsRaw(reply);
        if (ops.length) {
          var summaries = WB.execOpsWithDetail(ops);
          WB.showOpsBar(ops, summaries);
        }
        sendBtn.disabled = false;
      });
      window.electronAPI.onAIError(function(e) {
        if (finished) return;
        finished = true;
        cleanup();
        
        WB.pushMsg('ai', '⚠️ ' + (e||'流式请求失败') + (/invalid api key|401|unauthorized|api.?key/i.test(e||'') ? ' —— 请点击 ⚙ 填入正确的 API Key' : ''));
        sendBtn.disabled = false;
      });
      try {
        await window.electronAPI.callAIStream(payload);
      } catch(e) {
        if (!finished) {
          finished = true;
          cleanup();
          
          WB.pushMsg('ai', '⚠️ ' + (e.message||e) + (/invalid api key|401|unauthorized|api.?key/i.test(e.message||'') ? ' —— 请点击 ⚙ 填入正确的 API Key' : ''));
          sendBtn.disabled = false;
        }
      }
      return;
    }

    // 降级回退：非流式
    try {
      var data = await WB.callAI(payload);
      
      var reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '(无回复)';
      var aiBubble2 = document.createElement('div');
      aiBubble2.className = 'msg bot';
      document.getElementById('aiBody').appendChild(aiBubble2);
      aiBubble2.innerHTML = WB.mdToHtml(reply);
      WB.state.chatHistory.push({role:'assistant', content:reply});
      WB.save();
      var ops2 = WB.extractOpsRaw(reply);
      if (ops2.length) {
        var summaries2 = WB.execOpsWithDetail(ops2);
        WB.showOpsBar(ops2, summaries2);
      }
    } catch(err) {
      
      WB.pushMsg('ai', '⚠️ ' + err.message + (/invalid api key|401|unauthorized|api.?key/i.test(err.message) ? ' —— 请点击 ⚙ 填入正确的 API Key' : ''));
    } finally {
      sendBtn.disabled = false;
    }
  };

  // ==================== 周报 ====================
  WB.generateReport = function(customTemplate) {
    var wk = WB.weekKey(WB.state.viewWeekStart);
    var end = WB.addDays(WB.state.viewWeekStart, WB.state.weekMode === 7 ? 6 : 4);
    var weekStr = (WB.state.viewWeekStart.getMonth()+1) + '/' + WB.state.viewWeekStart.getDate() +
      ' - ' + (end.getMonth()+1) + '/' + end.getDate();
    var all = WB.state.tasks.filter(function(t) { return t.weekKey === wk; });
    var vars = {
      week: weekStr,
      done: String(all.filter(function(t) { return t.status === 'done'; }).length),
      doing: String(all.filter(function(t) { return t.status === 'doing'; }).length),
      todo: String(all.filter(function(t) { return t.status === 'todo'; }).length),
      blocked: String(all.filter(function(t) { return t.status === 'blocked'; }).length),
      residual: String(WB.state.tasks.filter(function(t) { return t.weekKey <= wk && t.day === null && t.status !== 'done'; }).length)
    };
    var byDay = {mon:'周一', tue:'周二', wed:'周三', thu:'周四', fri:'周五', sat:'周六', sun:'周日'};
    var daySummary = '';
    WB.getDays().forEach(function(d) {
      var list = all.filter(function(t) { return t.day === d.k; });
      if (list.length) {
        daySummary += byDay[d.k] || d.k;
        daySummary += '：' + list.map(function(t) { return t.content + (t.status !== 'todo' ? '(' + WB.STATUS[t.status].n + ')' : ''); }).join('、');
        daySummary += '\n';
      }
    });
    vars.daySummary = daySummary || '（本周暂无任务安排）';
    var tmpl = customTemplate || WB.state.reportTemplate || WB.DEFAULT_REPORT_TEMPLATE;
    return tmpl.replace(/\{\{(\w+)\}\}/g, function(_, k) {
      return vars[k] !== undefined ? vars[k] : '{{' + k + '}}';
    });
  };

  WB.saveTemplate = function() {
    WB.state.reportTemplate = document.getElementById('reportText').value.trim();
    WB.save();
    WB.pushSysMsg('💾 周报模板已保存');
  };

  WB.resetTemplate = function() {
    if (!confirm('确认恢复默认周报模板？当前模板内容将被覆盖。')) return;
    WB.state.reportTemplate = '';
    WB.save();
    document.getElementById('reportText').value = WB.DEFAULT_REPORT_TEMPLATE;
    WB.pushSysMsg('🔄 已恢复默认模板');
  };

  WB.openReportEditor = function() {
    document.getElementById('reportText').value = WB.state.reportTemplate || WB.DEFAULT_REPORT_TEMPLATE;
    document.getElementById('reportOverlay').classList.add('show');
    setTimeout(function() { document.getElementById('reportText').focus(); }, 80);
  };

  WB.sendReport = function() {
    var tmpl = document.getElementById('reportText') ? document.getElementById('reportText').value.trim() : undefined;
    var text = WB.generateReport(tmpl || undefined);
    var el = document.getElementById('aiInput');
    el.value = text;
    document.getElementById('reportOverlay').classList.remove('show');
    WB.sendChat();
  };

  WB.getVisibleTasksJSON = function() {
    var wk = WB.weekKey(WB.state.viewWeekStart);
    var visible = WB.state.tasks.filter(function(t) {
      return (t.weekKey === wk && t.day !== null) || (t.day === null && t.status !== 'done' && t.weekKey <= wk);
    }).map(function(t) {
      return {
        id: t.id, content: t.content, people: t.people, status: t.status,
        day: t.day, weekKey: t.weekKey, remindAt: t.remindAt || null,
        repeat: t.repeat || null, notes: t.notes || null, priority: t.priority || 'normal'
      };
    });
    return JSON.stringify(visible, null, 2);
  };

  WB.extractOpsRaw = function(reply) {
    if (!reply) return [];
    var m = reply.match(/```json\s*([\s\S]*?)```/);
    if (m) {
      try { var obj = JSON.parse(m[1]); if (Array.isArray(obj.operations)) return obj.operations; if (Array.isArray(obj)) return obj; } catch(e) {}
    }
    var m2 = reply.match(/\{\s*["']operations["']\s*:\s*\[([\s\S]*?)\]\s*\}/);
    if (m2) {
      try { var obj2 = JSON.parse(m2[0]); if (Array.isArray(obj2.operations)) return obj2.operations; } catch(e) {}
    }
    var m3 = reply.match(/\[\s*\{[^}]*["']action["'][\s\S]*?\}\s*\]/);
    if (m3) {
      try { var arr = JSON.parse(m3[0]); if (Array.isArray(arr)) return arr; } catch(e) {}
    }
    return [];
  };

  WB.execOpsWithDetail = function(ops) {
    var wk = WB.weekKey(WB.state.viewWeekStart);
    WB.saveSnapshot();
    var changed = false;
    var summaries = [];
    ops.forEach(function(op) {
      var s = '';
      if (op.action === 'add') {
        WB.state.tasks.push({
          id: WB.uid(), content: op.content, people: op.people||[], status: op.status||'todo',
          day: op.day || null, remindAt: op.remindAt||null,
          repeat: op.repeat||null, notes: op.notes||null, priority: op.priority||'normal',
          order: Date.now(), weekKey: wk, createdAt: Date.now()
        });
        s = '添加「' + (op.content||'').slice(0,30) + '」';
        changed = true;
      } else if (op.action === 'move') {
        var t = WB.state.tasks.find(function(x) { return x.id === op.taskId; });
        if (t && !(!op.day && t.status === 'done')) {
          var dst = op.day || '残留';
          t.day = op.day || null;
          if (op.day) t.weekKey = wk;
          t.order = Date.now();
          s = '移动「' + (t.content||'').slice(0,20) + '」→ ' + dst;
          changed = true;
        }
      } else if (op.action === 'edit') {
        var t2 = WB.state.tasks.find(function(x) { return x.id === op.taskId; });
        if (t2) {
          var parts = [];
          if (op.content != null) { t2.content = op.content; parts.push('内容'); }
          if (op.people != null) { t2.people = op.people; parts.push('人员'); }
          if (op.day !== undefined) { if (op.day) t2.weekKey = wk; t2.day = op.day || null; parts.push('移至' + (op.day || '残留')); }
          if (op.remindAt !== undefined) { t2.remindAt = op.remindAt || null; parts.push('提醒'); }
          if (op.repeat !== undefined) { t2.repeat = op.repeat || null; parts.push('重复'); }
          if (op.notes !== undefined) { t2.notes = op.notes || null; parts.push('备注'); }
          if (op.priority !== undefined) { t2.priority = op.priority; parts.push('优先级'); }
          t2.order = Date.now();
          s = '修改「' + (t2.content||'').slice(0,20) + '」' + (parts.length ? ' (' + parts.join('、') + ')' : '');
          changed = true;
        }
      } else if (op.action === 'status') {
        var t3 = WB.state.tasks.find(function(x) { return x.id === op.taskId; });
        if (t3 && t3.status !== op.status && !(t3.day === null && op.status === 'done')) {
          var oldS = (WB.STATUS[t3.status] && WB.STATUS[t3.status].n) || t3.status;
          t3.status = op.status;
          if (op.notes !== undefined) t3.notes = op.notes || null;
          var newS = (WB.STATUS[op.status] && WB.STATUS[op.status].n) || op.status;
          s = '「' + (t3.content||'').slice(0,20) + '」' + oldS + ' → ' + newS;
          changed = true;
        }
      } else if (op.action === 'delete') {
        var t4 = WB.state.tasks.find(function(x) { return x.id === op.taskId; });
        if (t4) {
          s = '删除「' + (t4.content||'').slice(0,20) + '」';
          WB.state.tasks = WB.state.tasks.filter(function(x) { return x.id !== op.taskId; });
          changed = true;
        }
      } else if (op.action === 'carryover') {
        var nk = WB.weekKey(WB.addDays(WB.state.viewWeekStart, 7));
        var c = 0;
        WB.state.tasks.forEach(function(t) {
          if (t.weekKey === wk && t.status !== 'done') { t.weekKey = nk; t.day = null; c++; }
        });
        WB.state.viewWeekStart = WB.addDays(WB.state.viewWeekStart, 7);
        s = '滚入下周 ' + c + ' 项';
        changed = true;
      }
      if (s) summaries.push(s);
    });
    if (changed) { WB.save(); WB.render(); }
    return summaries;
  };

})(window.WB);
