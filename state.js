// ============ 配置常量 ============
window.WB = window.WB || {};

(function(WB) {
  // ---- 常量 ----
  WB.DAYS_7 = [
    {k:'mon', n:'周一'}, {k:'tue', n:'周二'}, {k:'wed', n:'周三'},
    {k:'thu', n:'周四'}, {k:'fri', n:'周五'}, {k:'sat', n:'周六'}, {k:'sun', n:'周日'}
  ];
  WB.STATUS = {
    todo:   {n:'待开始'},
    doing:  {n:'进行中'},
    done:   {n:'已完成'},
    blocked:{n:'阻塞'}
  };
  WB.STATUS_ORDER = ['todo','doing','done','blocked'];
  WB.DEFAULT_AI = {base:'https://opencode.ai/zen/v1', key:'', model:'deepseek-v4-flash-free'};
  WB.DEFAULT_REPORT_TEMPLATE = '请生成一份本周（{{week}}）工作周报，用 Markdown 格式输出。\n\n## 📊 任务统计\n\n| 状态 | 数量 |\n|------|------|\n| ✅ 已完成 | {{done}} |\n| 🔄 进行中 | {{doing}} |\n| 📋 待开始 | {{todo}} |\n| 🚫 阻塞 | {{blocked}} |\n| 📦 残留 | {{residual}} |\n\n## ✅ 本周完成\n\n按日期列出已完成的各项任务及关键成果。\n\n## 🔄 进行中\n\n列出仍在进行中的任务及当前进展。\n\n## 🚫 阻塞项\n\n列出所有阻塞任务及原因。\n\n## 📋 下周计划\n\n基于残留任务和未完成项给出下周安排建议。\n\n## 详细日志\n\n{{daySummary}}\n\n## 💡 总结建议\n\n用 2-3 句话总结本周工作亮点和改进方向。\n\n---\n*要求：语言简洁专业，表格对齐，不加 json 代码块*';

  // ---- 状态 ----
  WB.state = {
    tasks:         [],
    viewWeekStart: null,  // 由 init 设置
    editingId:     null,
    aiSettings:    { ...WB.DEFAULT_AI },
    autoStart:     false,
    weekMode:      5,
    zoomFactor:    1.0,
    aiWidth:       360,
    theme:         'emerald',
    chatHistory:   [],
    reportTemplate: ''
  };

  // ---- 撤销栈 ----
  WB._undoStack = [];
  WB._redoStack = [];
  WB._toolTags = [];

  // ---- 工具函数 ----
  // 应用外观主题（body[data-theme]，配合 index.html 中的主题变量集）
  WB.applyTheme = function(t) {
    var themes = ['emerald', 'sky', 'lingdong'];
    document.body.setAttribute('data-theme', themes.indexOf(t) >= 0 ? t : 'emerald');
  };

  WB.getDays = function() {
    var w = WB.state.weekMode;
    return w === 7 ? WB.DAYS_7 : WB.DAYS_7.slice(0,5);
  };

  WB.getMonday = function(d) {
    var x = new Date(d);
    var day = x.getDay();
    var diff = day === 0 ? -6 : 1-day;
    x.setDate(x.getDate() + diff);
    x.setHours(0,0,0,0);
    return x;
  };

  WB.weekKey = function(d) {
    return WB.fmt(WB.getMonday(d));
  };

  WB.fmt = function(d) {
    var y = d.getFullYear(),
        m = String(d.getMonth()+1).padStart(2,'0'),
        da = String(d.getDate()).padStart(2,'0');
    return y + '-' + m + '-' + da;
  };

  WB.addDays = function(d, n) {
    var x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  WB.uid = function() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2,5);
  };

  WB.esc = function(s) {
    return (s||'').replace(/[<>&"]/g, function(c) {
      return {'<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;'}[c];
    });
  };

  WB.timeToMin = function(t) {
    if (!t) return -1;
    var p = t.split(':');
    return parseInt(p[0]||0)*60 + parseInt(p[1]||0);
  };

  WB.hl = function(s, q) {
    if (!s || !q) return s;
    var ls = s.toLowerCase();
    var out = '', i = 0, k = ls.indexOf(q);
    while (k >= 0) {
      out += s.slice(i,k) + '<mark>' + s.slice(k, k+q.length) + '</mark>';
      i = k + q.length;
      k = ls.indexOf(q, i);
    }
    return out + s.slice(i);
  };

  WB.isoWeek = function(d) {
    var x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var day = x.getUTCDay() || 7;
    x.setUTCDate(x.getUTCDate() + 4 - day);
    var ys = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
    return Math.ceil((((x - ys) / 864e5) + 1) / 7);
  };

  // ============ 撤销 / 重做 ============
  // 快照同时记录 tasks 与当前查看周，撤销跨周操作后视图能一起恢复
  WB.saveSnapshot = function() {
    WB._undoStack.push({
      tasks: JSON.parse(JSON.stringify(WB.state.tasks)),
      viewWeekStart: WB.state.viewWeekStart ? new Date(WB.state.viewWeekStart.getTime()) : null
    });
    if (WB._undoStack.length > 20) WB._undoStack.shift();
    WB._redoStack = [];
  };

  WB._snapCurrent = function() {
    return {
      tasks: JSON.parse(JSON.stringify(WB.state.tasks)),
      viewWeekStart: WB.state.viewWeekStart ? new Date(WB.state.viewWeekStart.getTime()) : null
    };
  };

  WB._restoreSnapshot = function(snap) {
    if (!snap) return;
    WB.state.tasks = snap.tasks;
    if (snap.viewWeekStart) WB.state.viewWeekStart = snap.viewWeekStart;
  };

  WB.undo = function() {
    var prev = WB._undoStack.pop();
    if (prev) {
      WB._redoStack.push(WB._snapCurrent());
      WB._restoreSnapshot(prev);
      WB.save();
      WB.render();
      if (WB.pushSysMsg) WB.pushSysMsg('↩️ 已撤销');
    } else {
      if (WB.pushSysMsg) WB.pushSysMsg('没有可撤销的操作');
    }
  };

  WB.redo = function() {
    var next = WB._redoStack.pop();
    if (next) {
      WB._undoStack.push(WB._snapCurrent());
      WB._restoreSnapshot(next);
      WB.save();
      WB.render();
      if (WB.pushSysMsg) WB.pushSysMsg('↪️ 已重做');
    } else {
      if (WB.pushSysMsg) WB.pushSysMsg('没有可重做的操作');
    }
  };

})(window.WB);
