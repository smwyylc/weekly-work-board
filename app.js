// ============ 入口：事件绑定 & 初始化 ============
window.WB = window.WB || {};

(function(WB) {

  // ==================== 事件绑定 ====================
  WB.bindEvents = function() {
    // 顶栏按钮
    document.querySelectorAll('[data-nav]').forEach(function(btn) {
      btn.addEventListener('click', function() { WB.changeWeek(parseInt(btn.dataset.nav)); });
    });
    document.getElementById('btnNewTask').addEventListener('click', function() { WB.openTaskModal(null); });
    document.getElementById('btnNextWeek').addEventListener('click', WB.carryOverToNextWeek);
    document.getElementById('btnReport').addEventListener('click', WB.openReportEditor);
    document.querySelector('[data-action="save-template"]').addEventListener('click', WB.saveTemplate);
    document.querySelector('[data-action="reset-template"]').addEventListener('click', WB.resetTemplate);
    document.querySelector('[data-action="send-report"]').addEventListener('click', WB.sendReport);

    // 搜索框
    var si = document.getElementById('searchInput');
    var searchTimer;
    si.addEventListener('input', function() {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(WB.render, 120);
    });
    si.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') { clearTimeout(searchTimer); si.value = ''; WB.render(); }
    });

    // AI 对话
    document.getElementById('newChat').addEventListener('click', WB.clearChat);
    document.getElementById('btnSettings').addEventListener('click', WB.openSettings);
    document.getElementById('aiSend').addEventListener('click', WB.sendChat);
    var aiInputEl = document.getElementById('aiInput');
    var aiSendEl = document.getElementById('aiSend');
    aiInputEl.addEventListener('input', function() {
      aiSendEl.disabled = !aiInputEl.value.trim();
    });
    aiInputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); WB.sendChat(); }
    });
    // AI 建议 chips 点击填入输入框
    document.querySelectorAll('.chip').forEach(function(ch) {
      ch.addEventListener('click', function() {
        var inp = document.getElementById('aiInput');
        inp.value = ch.dataset.prompt || ch.textContent.replace(/^→ /,'');
        inp.focus();
        inp.dispatchEvent(new Event('input'));
      });
    });

    // 任务弹窗
    document.getElementById('taskDel').addEventListener('click', WB.deleteCurrent);
    document.querySelectorAll('[data-close="task-modal"]').forEach(function(b) {
      b.addEventListener('click', WB.closeTaskModal);
    });
    document.querySelector('[data-action="save-task"]').addEventListener('click', WB.saveTask);

    // 更多选项折叠
    var toggleBtn = document.getElementById('taskToggleExtra');
    var extra = document.getElementById('taskExtra');
    if (toggleBtn && extra) {
      toggleBtn.addEventListener('click', function() {
        var show = extra.style.display !== 'block';
        extra.style.display = show ? 'block' : 'none';
        toggleBtn.textContent = show ? '📋 收起选项' : '📋 更多选项';
      });
    }

    // 清空提醒时间
    var clearBtn = document.getElementById('fRemindClear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() { document.getElementById('fRemind').value = ''; });
    }

    // 设置弹窗
    document.querySelectorAll('[data-close="set-modal"]').forEach(function(b) {
      b.addEventListener('click', WB.closeSettings);
    });
    document.querySelector('[data-action="save-settings"]').addEventListener('click', WB.saveSettings);
    var sExport = document.getElementById('sExport');
    if (sExport) {
      sExport.addEventListener('click', function() { WB.closeSettings(); setTimeout(WB.exportData, 100); });
    }
    var sAbout = document.getElementById('sAbout');
    if (sAbout) {
      sAbout.addEventListener('click', function() { WB.closeSettings(); setTimeout(WB.openAbout, 100); });
    }
    // AI 预设切换
    var sPreset = document.getElementById('sPreset');
    if (sPreset) {
      sPreset.addEventListener('change', function() {
        var advanced = document.getElementById('sAiAdvanced');
        if (!advanced) return;
        var show = this.value !== 'opencode';
        advanced.style.display = show ? 'block' : 'none';
        WB.updateAISummary();
      });
    }

    // 检查更新
    var updateBtn = document.getElementById('btnCheckUpdate');
    if (updateBtn) {
      updateBtn.addEventListener('click', async function() {
        if (!window.electronAPI || !window.electronAPI.checkUpdate) {
          if (WB.pushSysMsg) WB.pushSysMsg('⚠️ 非 Electron 环境，无法检查更新');
          return;
        }
        var hint = document.getElementById('updateHint');
        hint.textContent = '正在检查...';
        updateBtn.disabled = true;
        var info = await window.electronAPI.checkUpdate();
        if (!info.ok) {
          hint.textContent = info.noRelease ? '暂无发布版本（首次发布后可检查更新）' : (info.error || '检查失败');
          updateBtn.disabled = false;
          return;
        }
        // 版本比较（语义化数值比较，而非字符串比较）
        var cmp = function(a, b) {
          var pa = (a||'0.0.0').split('.').map(Number);
          var pb = (b||'0.0.0').split('.').map(Number);
          for (var i = 0; i < 3; i++) {
            var diff = (pa[i]||0) - (pb[i]||0);
            if (diff !== 0) return diff;
          }
          return 0;
        };
        if (cmp(info.localVersion, info.version) >= 0) {
          hint.textContent = '✅ 已是最新版本 v' + info.localVersion;
          updateBtn.disabled = false;
          return;
        }
        hint.textContent = '发现 v' + info.version + '（' + Math.round(info.size/1048576) + 'MB）— ' + info.body.slice(0,80);
        updateBtn.textContent = '⬇ 下载安装';
        updateBtn.onclick = async function() {
          updateBtn.textContent = '下载中...';
          updateBtn.disabled = true;
          var res = await window.electronAPI.downloadUpdate(info.downloadUrl);
          if (!res.ok) { hint.textContent = res.error || '下载失败'; updateBtn.disabled = false; return; }
          window.electronAPI.onUpdateDownloaded(function(path) {
            hint.textContent = '下载完成，启动安装...';
            window.electronAPI.installUpdate(path);
          });
        };
      });
    }

    // 关于弹窗
    var closeAboutBtn = document.querySelector('[data-close="about-modal"]');
    if (closeAboutBtn) closeAboutBtn.addEventListener('click', WB.closeAbout);
    // 关于弹窗 tab 切换
    document.querySelectorAll('.about-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.about-tab').forEach(function(b) {
          b.style.borderBottomColor = 'transparent';
          b.style.color = 'var(--muted)';
          b.style.fontWeight = '500';
        });
        btn.style.borderBottomColor = 'var(--accent)';
        btn.style.color = 'var(--accent)';
        btn.style.fontWeight = '600';
        document.getElementById('aboutFeatures').style.display = btn.dataset.tab === 'features' ? 'block' : 'none';
        document.getElementById('aboutChangelog').style.display = btn.dataset.tab === 'changelog' ? 'block' : 'none';
      });
    });

    // AI 面板宽度拖拽调整
    var resizeHandle = document.getElementById('aiResize');
    if (resizeHandle) {
      var bodyEl = document.querySelector('.body');
      var minW = 200, maxRatio = 0.5;
      var startX, startW;
      resizeHandle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        startX = e.clientX;
        startW = WB.state.aiWidth || 360;
        resizeHandle.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });
      document.addEventListener('mousemove', function(e) {
        if (!resizeHandle.classList.contains('active')) return;
        var dx = startX - e.clientX;
        var newW = Math.round(startW + dx);
        newW = Math.max(minW, Math.min(newW, Math.round(window.innerWidth * maxRatio)));
        WB.state.aiWidth = newW;
        bodyEl.style.setProperty('--ai-width', newW + 'px');
      });
      document.addEventListener('mouseup', function() {
        if (!resizeHandle.classList.contains('active')) return;
        resizeHandle.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        WB.save();
      });
    }
    var btnToggleAi = document.getElementById('btnToggleAi');
    if (btnToggleAi) {
      btnToggleAi.addEventListener('click', function() {
        var body = document.querySelector('.body');
        var ai = document.querySelector('.ai');
        if (!body || !ai) return;
        var collapsed = body.classList.toggle('ai-collapsed');
        btnToggleAi.textContent = '💬';
        btnToggleAi.title = collapsed ? '展开 AI 面板' : '收起 AI 面板';
      });
    }

    // 看板事件委托（任务卡点击/删除/状态切换/添加 + 拖拽）
    var boardEl = document.getElementById('board');

    boardEl.addEventListener('click', function(e) {
      var target = e.target.closest('[data-action]');
      if (!target) return;
      var action = target.dataset.action;
      if (action === 'add') {
        e.stopPropagation();
        WB.openTaskModal(target.dataset.day || '');
      } else if (action === 'edit') {
        WB.openTaskModal(null, target.dataset.taskId);
      } else if (action === 'delete') {
        e.stopPropagation();
        WB.deleteTask(target.dataset.taskId);
      } else if (action === 'status') {
        e.stopPropagation();
        WB.cycleStatus(target.dataset.taskId);
      }
    });

    // 拖拽事件委托（不再每次 render 重绑）
    boardEl.addEventListener('dragover', function(e) {
      var cards = e.target.closest('.cards');
      if (!cards) return;
      e.preventDefault();
      cards.classList.add('drag-over');
      cards.querySelectorAll('.insert-before').forEach(function(el) { el.classList.remove('insert-before'); });
      var cardsList = cards.querySelectorAll('.card:not(.dragging)');
      for (var ci = 0; ci < cardsList.length; ci++) {
        var r = cardsList[ci].getBoundingClientRect();
        if (e.clientY < r.top + r.height/2) { cardsList[ci].classList.add('insert-before'); break; }
      }
    });
    boardEl.addEventListener('dragleave', function(e) {
      var cards = e.target.closest('.cards');
      if (!cards) return;
      cards.classList.remove('drag-over');
      cards.querySelectorAll('.insert-before').forEach(function(el) { el.classList.remove('insert-before'); });
    });
    boardEl.addEventListener('drop', function(e) {
      var cards = e.target.closest('.cards');
      if (!cards) return;
      e.preventDefault();
      cards.classList.remove('drag-over');
      var id = e.dataTransfer.getData('text/plain');
      var beforeEl = cards.querySelector('.insert-before');
      var beforeId = beforeEl ? beforeEl.dataset.id : null;
      cards.querySelectorAll('.insert-before').forEach(function(el) { el.classList.remove('insert-before'); });
      WB.moveTask(id, cards.dataset.day || null, beforeId);
    });
    boardEl.addEventListener('dragstart', function(e) {
      var card = e.target.closest('.card');
      if (!card) return;
      e.dataTransfer.setData('text/plain', card.dataset.id);
      card.classList.add('dragging');
    });
    boardEl.addEventListener('dragend', function() {
      document.querySelectorAll('.dragging,.placeholder').forEach(function(el) {
        el.classList.remove('dragging');
        if (el.classList.contains('placeholder')) el.remove();
      });
    });

    // 点遮罩关闭
    document.querySelectorAll('.overlay').forEach(function(o) {
      o.addEventListener('click', function(e) {
        if (e.target !== o) return;
        if (o.id === 'taskOverlay') WB.closeTaskModal();
        else o.classList.remove('show');
      });
    });

    // 全局快捷键
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        var taskOv = document.getElementById('taskOverlay');
        if (taskOv && taskOv.classList.contains('show')) { WB.closeTaskModal(); return; }
        document.querySelectorAll('.overlay.show:not(#taskOverlay)').forEach(function(o) { o.classList.remove('show'); });
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'n') { e.preventDefault(); WB.openTaskModal(null); }
        else if (e.key === 'f') { e.preventDefault(); var el = document.getElementById('searchInput'); if (el) { el.focus(); el.select(); } }
        else if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); WB.undo(); }
        else if (e.key === 'z' && e.shiftKey) { e.preventDefault(); WB.redo(); }
        else if (e.key === 'y') { e.preventDefault(); WB.redo(); }
      }
    });

    // AI 操作栏按钮（外部 ops bar）
    var opsBar = document.getElementById('aiOpsBar');
    if (opsBar) {
      opsBar.addEventListener('click', function(e) {
        var btn = e.target.closest('.ops-btn');
        if (!btn) return;
        var ops = WB.extractOpsFromHtml(btn.outerHTML);
        if (ops.length) {
          WB.execOpsWithDetail(ops);
          WB.showOpsBar(ops, true);
        }
      });
    }
  };

  // ==================== 初始化 ====================
  (async function init() {
    await WB.load();
    // 恢复 AI 面板宽度
    var savedW = WB.state.aiWidth || 360;
    document.querySelector('.body').style.setProperty('--ai-width', savedW + 'px');
    WB.restoreChat();

    // 自动跨周
    (function() {
      var lastWeek = localStorage.getItem('ww_week') || '';
      var curWeek = WB.weekKey(new Date());
      if (curWeek > lastWeek && lastWeek) {
        var moved = WB.state.tasks.filter(function(t) {
          return t.weekKey < curWeek && t.day !== null && t.status !== 'done';
        });
        if (moved.length) {
          moved.forEach(function(t) { t.weekKey = curWeek; t.day = null; });
          WB.save();
          if (WB.pushSysMsg) WB.pushSysMsg('📅 检测到新周，已将 ' + moved.length + ' 项未完成任务自动汇入本周残留');
        }
      }
      localStorage.setItem('ww_week', curWeek);
    })();

    if (WB.state.tasks.length === 0) {
      var wk = WB.weekKey(new Date());
      WB.state.tasks = [
        {id:WB.uid(), content:'周一晨会同步本周目标', people:['团队'], status:'todo', day:'mon', weekKey:wk, createdAt:Date.now()},
        {id:WB.uid(), content:'Q3 需求评审', people:['产品','张三'], status:'todo', day:'wed', weekKey:wk, createdAt:Date.now()+1},
        {id:WB.uid(), content:'联调支付接口', people:['李四','后端'], status:'doing', day:'thu', weekKey:wk, createdAt:Date.now()+2},
        {id:WB.uid(), content:'周报撰写', people:['我'], status:'todo', day:'fri', weekKey:wk, createdAt:Date.now()+3},
        {id:WB.uid(), content:'客户合同待法务确认', people:['法务','王五'], status:'blocked', day:null, weekKey:wk, createdAt:Date.now()+4}
      ];
      WB.save();
    }

    WB.processRecurring();
    WB.bindEvents();
    WB.render();
    WB.initReminder();

    if (window.electronAPI && WB.state.autoStart) {
      window.electronAPI.setAutoStart(true).catch(function(e) { console.error('开机自启设置失败', e); });
    }

    if (WB.pushSysMsg) {
      WB.pushSysMsg('💡 快捷键：Ctrl+N 新建  Ctrl+F 搜索  Ctrl+Z 撤销  Ctrl+Shift+Z/Ctrl+Y 重做  ⇧Enter 换行');
      WB.pushSysMsg('💡 当前 AI 接口：' + WB.state.aiSettings.base + '  模型：' + WB.state.aiSettings.model + (WB.state.aiSettings.key ? ' (已配置 Key)' : ' (无需 Key 即可使用)'));
    }
    WB.updateAiMeta();
  })();

})(window.WB);
