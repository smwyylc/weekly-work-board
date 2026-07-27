// ============ 存储层 ============
window.WB = window.WB || {};

(function(WB) {

  WB.load = async function() {
    try {
      WB.state.tasks = JSON.parse(localStorage.getItem('ww_tasks')||'[]');
    } catch(e) { WB.state.tasks = []; }

    try {
      WB.state.aiSettings = { ...WB.DEFAULT_AI, ...JSON.parse(localStorage.getItem('ww_ai')||'{}') };
    } catch(e) { WB.state.aiSettings = { ...WB.DEFAULT_AI }; }

    // 从加密存储中恢复 API Key
    var encryptedKey = localStorage.getItem('ww_ai_key');
    if (encryptedKey && window.electronAPI && window.electronAPI.decryptKey) {
      try {
        var r = await window.electronAPI.decryptKey(encryptedKey);
        if (r.ok) WB.state.aiSettings.key = r.data;
      } catch(e) { console.error('解密 API Key 失败', e); }
    }

    try {
      var cfg = JSON.parse(localStorage.getItem('ww_cfg')||'{}');
      WB.state.autoStart = !!cfg.autoStart;
      WB.state.weekMode = cfg.weekMode || 5;
    } catch(e) { WB.state.autoStart = false; WB.state.weekMode = 5; }

    try {
      WB.state.chatHistory = JSON.parse(localStorage.getItem('ww_chat')||'[]').slice(-30);
    } catch(e) { WB.state.chatHistory = []; }

    WB.state.reportTemplate = localStorage.getItem('ww_report_template')||'';
    WB.state.viewWeekStart = WB.getMonday(new Date());
  };

  WB.save = function() {
    localStorage.setItem('ww_tasks', JSON.stringify(WB.state.tasks));

    // AI 设置存入时剥离 key 字段，key 单独加密存储
    var ai = WB.state.aiSettings;
    var rest = { base: ai.base, model: ai.model };
    localStorage.setItem('ww_ai', JSON.stringify(rest));

    if (ai.key && window.electronAPI && window.electronAPI.encryptKey) {
      window.electronAPI.encryptKey(ai.key).then(function(r) {
        if (r.ok) localStorage.setItem('ww_ai_key', r.data);
      }).catch(function(e) { console.error('加密 API Key 失败', e); });
    } else if (!ai.key) {
      localStorage.removeItem('ww_ai_key');
    }

    localStorage.setItem('ww_cfg', JSON.stringify({
      autoStart: WB.state.autoStart,
      weekMode: WB.state.weekMode
    }));

    localStorage.setItem('ww_chat', JSON.stringify(WB.state.chatHistory.slice(-30)));

    if (WB.state.reportTemplate) {
      localStorage.setItem('ww_report_template', WB.state.reportTemplate);
    } else {
      localStorage.removeItem('ww_report_template');
    }
  };

})(window.WB);
