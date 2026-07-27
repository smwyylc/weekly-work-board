// ============ 看板渲染 & 操作 ============
window.WB = window.WB || {};

(function(WB) {

  // ==================== 渲染 ====================
  WB.render = function() {
    var wk = WB.weekKey(WB.state.viewWeekStart);
    var board = document.getElementById('board');
    var sq = document.getElementById('searchInput');
    var q = sq ? (sq.value.trim().toLowerCase()) : '';
    var match = function(t) {
      return !q || t.content.toLowerCase().includes(q) || (t.people||[]).some(function(p) { return p.toLowerCase().includes(q); });
    };
    var priOrder = {urgent:0, normal:1, low:2};
    var sortTasks = function(a, b) {
      var ao = a.order || a.createdAt || 0, bo = b.order || b.createdAt || 0;
      if (ao !== bo) return ao - bo;
      var pa = priOrder[a.priority] || 1, pb = priOrder[b.priority] || 1;
      return pa - pb;
    };
    var html = '';
    var todayKey = ['sun','mon','tue','wed','thu','fri','sat'][new Date().getDay()];
    var isThisWeek = WB.weekKey(new Date()) === wk;
    var days = WB.getDays();

    days.forEach(function(d) {
      var list = WB.state.tasks.filter(function(t) {
        return t.weekKey === wk && t.day === d.k && match(t);
      }).sort(sortTasks);
      var todayCls = isThisWeek && d.k === todayKey ? ' col-today' : '';
      html += WB.colHtml(d.n, list, d.k, false, q, todayCls);
    });

    // 残留列
    var res = WB.state.tasks.filter(function(t) {
      return t.day === null && t.status !== 'done' && t.weekKey <= wk && match(t);
    }).sort(sortTasks);
    html += WB.colHtml('残留任务', res, null, true, q);

    board.innerHTML = html;
    board.style.gridTemplateColumns = 'repeat(' + (days.length+1) + ',minmax(0,1fr))';

    if (board._rendered) {
      board.querySelectorAll('.col, .card').forEach(function(el) { el.style.animation = 'none'; });
    } else {
      board.querySelectorAll('.col').forEach(function(el, i) { el.style.animationDelay = (i*55) + 'ms'; });
      board._rendered = true;
    }

    // 今日日程
    var todayBar = document.getElementById('todayBar');
    if (todayBar) {
      var now = new Date();
      var tKey = ['sun','mon','tue','wed','thu','fri','sat'][now.getDay()];
      var tWeek = WB.weekKey(now);
      var todayTasks = WB.state.tasks.filter(function(t) {
        return t.weekKey === tWeek && t.day === tKey && t.status !== 'done';
      });
      if (todayTasks.length) {
        var dayName = ['日','一','二','三','四','五','六'][now.getDay()];
        var items = todayTasks.map(function(t) { return WB.esc(t.content); }).join('、');
        todayBar.innerHTML = '<span class="tk">TODAY · 周' + dayName + '</span><span class="tn">' + items + '</span>';
        todayBar.style.display = 'flex';
      } else {
        todayBar.style.display = 'none';
      }
    }

    // 顶栏
    var end = WB.addDays(WB.state.viewWeekStart, WB.state.weekMode === 7 ? 6 : 4);
    var isThis = WB.weekKey(new Date()) === wk;
    document.getElementById('weekLabel').textContent = isThis ? '本周' : (wk > WB.weekKey(new Date()) ? '未来周' : '过往周');
    document.getElementById('weekRange').textContent =
      (WB.state.viewWeekStart.getMonth()+1) + '/' + WB.state.viewWeekStart.getDate() +
      ' - ' + (end.getMonth()+1) + '/' + end.getDate();
    var tag = document.getElementById('weekTag');
    if (tag) tag.textContent = 'W' + WB.isoWeek(WB.state.viewWeekStart);
  };

  WB.colHtml = function(name, list, day, isRes, q, extraCls) {
    var body = list.map(function(t) { return WB.taskHtml(t, q); }).join('') || '';
    var todayKey = ['sun','mon','tue','wed','thu','fri','sat'][new Date().getDay()];
    var todayDot = (day === todayKey) ? '<span class="today-dot"></span>' : '';
    return '<div class="col ' + (isRes ? 'residue' : '') + (extraCls||'') + '">' +
      '<div class="col-head"><span class="dname">' + todayDot + name + '</span><span class="count">' + list.length + '</span></div>' +
      '<div class="cards" data-day="' + (day||'') + '">' + body + '</div>' +
      '<button class="addrow" data-action="add" data-day="' + (day||'') + '">＋ 添加任务</button>' +
      '</div>';
  };

  WB.taskHtml = function(t, q) {
    var st = WB.STATUS[t.status] || WB.STATUS.todo;
    var stMap = {todo:'todo', doing:'doing', done:'done', blocked:'block'};
    var stKey = stMap[t.status] || 'todo';
    var people = (t.people||[]).map(function(p) {
      return '<span class="who"><span class="av">' + WB.esc((p||'?').charAt(0)) + '</span>' + WB.esc(p) + '</span>';
    }).join('');
    var resTag = t.day === null ? '<span class="res-tag">残留</span>' : '';
    var remindTag = t.remindAt ? '<span class="tag-pill">⏰ ' + t.remindAt + '</span>' : '';
    var repeatIcon = t.repeat ? '<span class="tag-pill">↻ ' + t.repeat.split(',').map(function(r) {
      return ({'daily':'每日', mon:'周一', tue:'周二', wed:'周三', thu:'周四', fri:'周五'}[r.trim()] || r.trim());
    }).join('·') + '</span>' : '';
    var priMap = {urgent:'↑ 紧急', low:'↓ 低'};
    var priTag = t.priority && t.priority !== 'normal' ? '<span class="tag-pill tag-pri">' + priMap[t.priority] + '</span>' : '';
    var tags = [repeatIcon, remindTag, priTag].filter(Boolean).join('');
    return '<div class="card ' + (t.status === 'done' ? 'done' : '') + '" draggable="true" data-id="' + t.id + '" data-action="edit" data-task-id="' + t.id + '">' +
      '<button class="del" data-action="delete" data-task-id="' + t.id + '" title="删除">×</button>' +
      resTag +
      '<div class="title">' + WB.hl(WB.esc(t.content), q) + '</div>' +
      (people ? '<div class="meta">' + people + '</div>' : '') +
      (tags ? '<div class="tags-row">' + tags + '</div>' : '') +
      '<div class="foot">' +
      '<span class="status" data-s="' + stKey + '" data-action="status" data-task-id="' + t.id + '">' +
      '<span class="sd"></span>' + st.n +
      '</span>' +
      '</div></div>';
  };

  // ==================== 看板操作 ====================
  WB.moveTask = function(id, day, beforeId) {
    var t = WB.state.tasks.find(function(x) { return x.id === id; });
    if (!t) return;
    // 已完成的任务不允许移入残留列（残留列仅展示未完成任务）
    if (!day && t.status === 'done') {
      if (WB.pushSysMsg) WB.pushSysMsg('⚠️ 已完成的任务不能移入残留列（残留列仅展示未完成任务）');
      WB.render();
      return;
    }
    WB.saveSnapshot();
    var changedCol = (t.day !== day);
    if (day && changedCol) t.weekKey = WB.weekKey(WB.state.viewWeekStart);
    t.day = day || null;
    var colTasks = (day
      ? WB.state.tasks.filter(function(x) { return x.weekKey === t.weekKey && x.day === day && x.id !== id; })
      : WB.state.tasks.filter(function(x) { return x.day === null && x.status !== 'done' && x.weekKey <= WB.weekKey(WB.state.viewWeekStart) && x.id !== id; })
    ).sort(function(a, b) { return (a.order||a.createdAt) - (b.order||b.createdAt); });
    var idx = beforeId ? colTasks.findIndex(function(x) { return x.id === beforeId; }) : -1;
    if (idx >= 0) colTasks.splice(idx, 0, t); else colTasks.push(t);
    colTasks.forEach(function(x, i) { x.order = (i+1)*10; });
    WB.save();
    WB.render();
  };

  WB.cycleStatus = function(id) {
    var t = WB.state.tasks.find(function(x) { return x.id === id; });
    if (!t) return;
    WB.saveSnapshot();
    t.status = WB.STATUS_ORDER[(WB.STATUS_ORDER.indexOf(t.status)+1) % WB.STATUS_ORDER.length];
    // 残留列中的任务不允许标记为已完成，自动跳过 done → 下一状态
    if (t.day === null && t.status === 'done') {
      t.status = WB.STATUS_ORDER[(WB.STATUS_ORDER.indexOf(t.status)+1) % WB.STATUS_ORDER.length];
    }
    WB.save();
    WB.render();
  };

  WB.changeWeek = function(d) {
    WB.state.viewWeekStart = WB.getMonday(WB.addDays(WB.state.viewWeekStart, d*7));
    WB.render();
  };

  WB.carryOverToNextWeek = function() {
    var wk = WB.weekKey(WB.state.viewWeekStart);
    var undone = WB.state.tasks.filter(function(t) { return t.weekKey === wk && t.status !== 'done'; });
    if (!confirm('确认进入下周？\n\n本周未完成任务 ' + undone.length + ' 个将自动滚入下周「残留任务」。')) return;
    WB.saveSnapshot();
    var nk = WB.weekKey(WB.addDays(WB.state.viewWeekStart, 7));
    var n = 0;
    WB.state.tasks.forEach(function(t) {
      if (t.weekKey === wk && t.status !== 'done') { t.weekKey = nk; t.day = null; n++; }
    });
    WB.save();
    WB.state.viewWeekStart = WB.getMonday(WB.addDays(WB.state.viewWeekStart, 7));
    WB.render();
    if (WB.pushSysMsg) WB.pushSysMsg(n ? '已将 ' + n + ' 个未完成任务滚入下周「残留任务」' : '本周任务已全部完成 🎉');
  };

  // ==================== 任务弹窗 ====================
  WB.openTaskModal = function(day, id) {
    // 根据 weekMode 动态设置所属日选项
    var days = WB.getDays();
    var dayKeys = days.map(function(d) { return d.k; });
    var fDay = document.getElementById('fDay');
    fDay.innerHTML = days.map(function(d) {
      return '<option value="' + d.k + '">' + d.n + '</option>';
    }).join('') + '<option value="">残留（未排期）</option>';
    WB.state.editingId = id || null;
    document.getElementById('taskTitle').textContent = id ? '编辑任务' : '新建任务';
    document.getElementById('taskDel').style.display = id ? 'block' : 'none';
    if (id) {
      var t = WB.state.tasks.find(function(x) { return x.id === id; });
      if (!t) {
        WB.state.editingId = null;
        document.getElementById('taskTitle').textContent = '新建任务';
        document.getElementById('taskDel').style.display = 'none';
        WB._fillForm(day || '');
        if (WB.pushSysMsg) WB.pushSysMsg('⚠️ 该任务已不存在，已切换为新建模式');
      } else {
        document.getElementById('fContent').value = t.content;
        var td = t.day || '';
        if (td && dayKeys.indexOf(td) < 0) td = '';
        document.getElementById('fDay').value = td;
        document.getElementById('fStatus').value = t.status;
        document.getElementById('fPeople').value = (t.people||[]).join(', ');
        document.getElementById('fRemind').value = t.remindAt || '';
        setRepeatChecks(t.repeat || '');
        document.getElementById('fNotes').value = t.notes || '';
        document.getElementById('fPriority').value = t.priority || 'normal';
      }
    } else {
      WB._fillForm(day || '');
    }
    document.getElementById('taskOverlay').classList.add('show');
    setTimeout(function() { document.getElementById('fContent').focus(); }, 80);
  };

  WB._fillForm = function(day) {
    document.getElementById('fContent').value = '';
    document.getElementById('fDay').value = day || '';
    document.getElementById('fStatus').value = 'todo';
    document.getElementById('fPeople').value = '';
    document.getElementById('fRemind').value = '';
    setRepeatChecks('');
    document.getElementById('fNotes').value = '';
    document.getElementById('fPriority').value = 'normal';
  };

  function setRepeatChecks(vals) {
    var arr = (vals || '').split(',').map(function(s){return s.trim();}).filter(Boolean);
    var checks = document.querySelectorAll('#fRepeatGroup input[type=checkbox]');
    checks.forEach(function(cb) { cb.checked = arr.indexOf(cb.value) >= 0; });
  }
  function getRepeatChecks() {
    var vals = [];
    var checks = document.querySelectorAll('#fRepeatGroup input[type=checkbox]:checked');
    checks.forEach(function(cb) { vals.push(cb.value); });
    return vals.join(',');
  }

  WB.closeTaskModal = function() {
    var content = document.getElementById('fContent').value.trim();
    if (content) WB.saveTaskData();
    document.getElementById('taskOverlay').classList.remove('show');
  };

  WB.saveTaskData = function() {
    WB.saveSnapshot();
    var content = document.getElementById('fContent').value.trim();
    if (!content) return;
    var day = document.getElementById('fDay').value || null;
    var status = document.getElementById('fStatus').value;
    var people = document.getElementById('fPeople').value.split(/[,，]/).map(function(s) { return s.trim(); }).filter(Boolean);
    var notes = document.getElementById('fNotes').value.trim() || null;
    var remindAt = document.getElementById('fRemind').value || null;
    var repeat = getRepeatChecks() || null;
    var priority = document.getElementById('fPriority').value || 'normal';
    if (WB.state.editingId) {
      var t = WB.state.tasks.find(function(x) { return x.id === WB.state.editingId; });
      if (t) {
        // 残留列中不允许标记为已完成
        if (!day && status === 'done') {
          if (WB.pushSysMsg) WB.pushSysMsg('⚠️ 残留列中的任务不能标记为已完成，请先将其排入具体日期');
          return;
        }
        t.content = content; t.day = day; t.status = status; t.people = people;
        t.remindAt = remindAt; t.repeat = repeat; t.notes = notes; t.priority = priority;
        if (day) t.weekKey = WB.weekKey(WB.state.viewWeekStart);
      }
    } else {
      // 新增任务时，残留列也不允许直接创建为已完成
      if (!day && status === 'done') {
        if (WB.pushSysMsg) WB.pushSysMsg('⚠️ 残留列中的任务不能标记为已完成，请先将其排入具体日期');
        return;
      }
      WB.state.tasks.push({
        id: WB.uid(), content: content, day: day, status: status, people: people,
        remindAt: remindAt, repeat: repeat, notes: notes, priority: priority,
        order: Date.now(), weekKey: WB.weekKey(WB.state.viewWeekStart), createdAt: Date.now()
      });
    }
    WB.save();
    WB.render();
  };

  WB.saveTask = function() { WB.saveTaskData(); WB.closeTaskModal(); };

  WB.deleteTask = function(id) {
    var t = WB.state.tasks.find(function(x) { return x.id === id; });
    if (!t) return;
    if (!confirm('确定删除该任务？')) return;
    WB.saveSnapshot();
    WB.state.tasks = WB.state.tasks.filter(function(x) { return x.id !== id; });
    WB.save();
    WB.render();
  };

  WB.deleteCurrent = function() {
    if (WB.state.editingId) WB.deleteTask(WB.state.editingId);
    WB.closeTaskModal();
  };

  // ==================== 任务提醒 & 例行检查 ====================
  WB.initReminder = function() {
    setInterval(function() {
      var now = new Date();
      var curMin = now.getHours()*60 + now.getMinutes();
      var todayKey = ['sun','mon','tue','wed','thu','fri','sat'][now.getDay()];
      var wk = WB.weekKey(now);
      WB.state.tasks.forEach(function(t) {
        if (!t.remindAt) return;
        var rMin = WB.timeToMin(t.remindAt);
        if (rMin >= 0 && rMin <= curMin && curMin < rMin+2 && t.day === todayKey && t.weekKey === wk) {
          if (t.status !== 'done' && !t._reminded) {
            t._reminded = true;
            if (window.electronAPI && window.electronAPI.showNotification) {
              window.electronAPI.showNotification({title:'🔔 任务提醒', body:t.content}).catch(function(e) { console.error('通知发送失败', e); });
            }
            WB.showReminderToast(t.content, t.remindAt);
          }
        } else {
          if (t._reminded) t._reminded = false;
        }
      });
      WB.processRecurring();
    }, 60000);
  };

  WB.processRecurring = function() {
    var wk = WB.weekKey(new Date());
    var today = new Date();
    var todayKey = ['sun','mon','tue','wed','thu','fri','sat'][today.getDay()];
    var dayMap = {mon:1, tue:2, wed:3, thu:4, fri:5, sat:6, sun:7};
    var changed = false;
    WB.state.tasks.forEach(function(t) {
      if (!t.repeat || t.day === null) return;
      if (t.weekKey !== wk) return;
      var taskDayIdx = dayMap[t.day] || 0;
      var todayIdx = dayMap[todayKey] || 0;
      if (t.status !== 'done' && todayIdx > taskDayIdx && t.day !== todayKey) {
        t.status = 'done';
        changed = true;
      }
      if (t.status === 'done' && !t._nextCreated) {
        var origRepeat = t.repeat;
        var created = false;
        var repeatRules = origRepeat.split(',').map(function(s){return s.trim();}).filter(Boolean);
        var bestDate = null, bestDay = null;

        repeatRules.forEach(function(rule) {
          if (rule === 'daily') {
            var next = new Date(today);
            for (var i = 0; i < 7; i++) {
              next.setDate(next.getDate() + 1);
              var nk = ['sun','mon','tue','wed','thu','fri','sat'][next.getDay()];
              if (nk !== 'sat' && nk !== 'sun') {
                if (!bestDate || next < bestDate) { bestDate = new Date(next); bestDay = nk; }
                break;
              }
            }
          } else if (dayMap[rule]) {
            var targetDay = dayMap[rule];
            var d = (targetDay - today.getDay() + 7) % 7;
            if (d === 0) d = 7;
            var nextWeek = new Date(today);
            nextWeek.setDate(nextWeek.getDate() + d);
            if (!bestDate || nextWeek < bestDate) { bestDate = new Date(nextWeek); bestDay = rule; }
          }
        });

        if (bestDate) {
          WB.state.tasks.push({
            id: WB.uid(), content: t.content, people: t.people ? [...t.people] : [],
            status: 'todo', day: bestDay, remindAt: t.remindAt, repeat: origRepeat,
            order: Date.now(), weekKey: WB.weekKey(bestDate), createdAt: Date.now()
          });
          changed = true;
          created = true;
        }
        if (created) t.repeat = null;
        t._nextCreated = true;
      }
    });
    if (changed) WB.save();
  };

  WB.showReminderToast = function(content, time) {
    var el = document.getElementById('reminder-toast');
    if (!el) return;
    el.querySelector('.rt-content').textContent = content;
    el.querySelector('.rt-time').textContent = time;
    el.classList.add('show');
    el.style.display = 'flex';
    clearTimeout(el._timer);
    el._timer = setTimeout(function() {
      el.classList.remove('show');
      setTimeout(function() { el.style.display = 'none'; }, 300);
    }, 6000);
    if (el._clickHandler) el.removeEventListener('click', el._clickHandler);
    el._clickHandler = function() {
      clearTimeout(el._timer);
      el.classList.remove('show');
      setTimeout(function() { el.style.display = 'none'; }, 300);
    };
    el.addEventListener('click', el._clickHandler);
  };

})(window.WB);
