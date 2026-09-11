// ==UserScript==
// @name         艾德尔修仙传 - 皮肤系统
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  头部风格、字体、背景、全局美化
// @author       Ider
// @match        https://idlexiuxianzhuan.cn/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-end
// ==/UserScript==

(function() {
  'use strict';

  // ══════════════════════════════════════════════
  // 皮肤配置
  // ══════════════════════════════════════════════

  const SKINS = {

    // ─── 金碧辉煌 ───
    imperial: {
      name: '金碧辉煌',
      desc: '古典宫廷风格，朱红描金',
      css: `
        /* ── Header 背景 ── */
        .game-header {
          background: linear-gradient(135deg, #1a0505 0%, #2d0a0a 30%, #1a0808 100%) !important;
          border-bottom: 2px solid #8b6914 !important;
          padding: 8px 16px !important;
          position: relative !important;
          box-shadow: 0 2px 20px rgba(139, 105, 20, 0.15) !important;
        }
        .game-header::before {
          content: '' !important;
          position: absolute !important;
          bottom: -2px !important;
          left: 0 !important;
          right: 0 !important;
          height: 1px !important;
          background: linear-gradient(90deg, transparent, #d4a844, transparent) !important;
        }
        .game-header::after {
          content: '◈' !important;
          position: absolute !important;
          bottom: -10px !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          color: #d4a844 !important;
          font-size: 12px !important;
          text-shadow: 0 0 8px rgba(212,168,68,0.5) !important;
          z-index: 1 !important;
        }

        /* ── 角色名 ── */
        .hdr-name {
          font-family: 'STKaiti', 'KaiTi', '楷体', serif !important;
          font-size: 18px !important;
          color: #ffd700 !important;
          text-shadow: 0 0 12px rgba(255,215,0,0.3), 0 1px 3px rgba(0,0,0,0.5) !important;
          letter-spacing: 2px !important;
        }

        /* ── 等级境界 ── */
        .hdr-info { gap: 8px !important; }
        .hdr-info span:first-child {
          background: rgba(139,105,20,0.2) !important;
          padding: 1px 10px !important;
          border-radius: 10px !important;
          border: 1px solid rgba(139,105,20,0.3) !important;
          color: #e8d5a3 !important;
          font-size: 12px !important;
        }
        .realm-badge {
          background: linear-gradient(135deg, #5c3d0e, #8b6914) !important;
          color: #fff !important;
          padding: 2px 12px !important;
          border-radius: 10px !important;
          font-size: 12px !important;
          border: 1px solid #d4a844 !important;
          box-shadow: 0 0 8px rgba(212,168,68,0.2) !important;
        }

        /* ── QQ群 ── */
        .hdr-qq {
          color: #a89070 !important;
          font-size: 11px !important;
          background: rgba(139,105,20,0.08) !important;
          padding: 2px 10px !important;
          border-radius: 12px !important;
          border: 1px solid rgba(139,105,20,0.15) !important;
        }

        /* ── 资源 ── */
        .hdr-res span {
          font-weight: 600 !important;
          padding: 2px 10px !important;
          border-radius: 12px !important;
          background: rgba(0,0,0,0.2) !important;
        }
        .hdr-res span:first-child {
          color: #ffd700 !important;
          border: 1px solid rgba(255,215,0,0.15) !important;
        }
        .hdr-res span[title*="宗门"] {
          color: #a78bfa !important;
          border: 1px solid rgba(167,139,250,0.15) !important;
        }

        /* ── 按钮 ── */
        .btn-icon {
          color: #a89070 !important;
          transition: all 0.3s !important;
        }
        .btn-icon:hover {
          color: #ffd700 !important;
          background: rgba(255,215,0,0.1) !important;
          box-shadow: 0 0 12px rgba(255,215,0,0.15) !important;
        }
      `
    },

    // ─── 水墨丹青 ───
    inkwash: {
      name: '水墨丹青',
      desc: '中式水墨风格，素雅写意',
      css: `
        .game-header {
          background: linear-gradient(135deg, #1c1c1a 0%, #2a2824 50%, #1e1e1c 100%) !important;
          border-bottom: 1px solid #4a4540 !important;
          padding: 10px 16px !important;
          position: relative !important;
        }
        .game-header::before {
          content: '' !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          height: 3px !important;
          background: linear-gradient(90deg, transparent 5%, #8a7a6a 20%, #c9a96e 50%, #8a7a6a 80%, transparent 95%) !important;
          opacity: 0.6 !important;
        }

        .hdr-name {
          font-family: 'STSong', 'SimSun', '宋体', serif !important;
          font-size: 17px !important;
          color: #c9a96e !important;
          letter-spacing: 3px !important;
          font-weight: 400 !important;
        }

        .hdr-info span:first-child {
          color: #9a8a7a !important;
          font-size: 12px !important;
        }
        .realm-badge {
          background: rgba(201,169,110,0.08) !important;
          border: 1px solid rgba(201,169,110,0.2) !important;
          color: #c9a96e !important;
          padding: 1px 10px !important;
          border-radius: 3px !important;
          font-size: 11px !important;
          letter-spacing: 1px !important;
        }

        .hdr-qq {
          color: #7a6a5a !important;
          font-size: 11px !important;
          font-style: italic !important;
        }

        .hdr-res span {
          font-size: 12px !important;
          color: #b8a898 !important;
        }
        .hdr-res span:first-child { color: #c9a96e !important; }
        .hdr-res span[title*="宗门"] { color: #8a9ab8 !important; }

        .btn-icon {
          color: #6a5a4a !important;
          opacity: 0.7 !important;
          transition: opacity 0.3s !important;
        }
        .btn-icon:hover {
          opacity: 1 !important;
          color: #c9a96e !important;
          background: rgba(201,169,110,0.08) !important;
        }
      `
    },

    // ─── 赛博修仙 ───
    cyber: {
      name: '赛博修仙',
      desc: '霓虹科幻风格，发光特效',
      css: `
        .game-header {
          background: linear-gradient(135deg, #050510 0%, #0a0a20 50%, #050510 100%) !important;
          border-bottom: 1px solid rgba(168,85,247,0.2) !important;
          padding: 10px 16px !important;
          position: relative !important;
          box-shadow: 0 0 30px rgba(168,85,247,0.05) !important;
        }
        .game-header::before {
          content: '' !important;
          position: absolute !important;
          bottom: 0 !important;
          left: 0 !important;
          right: 0 !important;
          height: 1px !important;
          background: linear-gradient(90deg, transparent, #a855f7, #22d3ee, #a855f7, transparent) !important;
          background-size: 200% 100% !important;
          animation: cyberScan 3s linear infinite !important;
        }
        @keyframes cyberScan {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .hdr-name {
          font-family: 'Orbitron', 'Rajdhani', sans-serif !important;
          font-size: 16px !important;
          color: #22d3ee !important;
          text-shadow: 0 0 10px rgba(34,211,238,0.5), 0 0 30px rgba(34,211,238,0.2) !important;
          letter-spacing: 1px !important;
        }

        .hdr-info span:first-child {
          color: #94a3b8 !important;
          font-family: 'Rajdhani', sans-serif !important;
          font-size: 13px !important;
        }
        .realm-badge {
          background: rgba(168,85,247,0.1) !important;
          border: 1px solid rgba(168,85,247,0.3) !important;
          color: #c084fc !important;
          font-family: 'Rajdhani', sans-serif !important;
          text-shadow: 0 0 8px rgba(168,85,247,0.3) !important;
        }

        .hdr-qq {
          color: #64748b !important;
          font-size: 11px !important;
          font-family: 'Rajdhani', sans-serif !important;
        }

        .hdr-res span {
          font-family: 'Rajdhani', sans-serif !important;
          font-size: 13px !important;
          font-weight: 600 !important;
        }
        .hdr-res span:first-child { color: #22d3ee !important; text-shadow: 0 0 8px rgba(34,211,238,0.3) !important; }
        .hdr-res span[title*="宗门"] { color: #a78bfa !important; text-shadow: 0 0 8px rgba(167,139,250,0.3) !important; }

        .btn-icon {
          color: #475569 !important;
          transition: all 0.3s !important;
        }
        .btn-icon:hover {
          color: #22d3ee !important;
          text-shadow: 0 0 12px rgba(34,211,238,0.6) !important;
          background: rgba(34,211,238,0.05) !important;
        }
      `
    },

    // ─── 毛玻璃 ───
    glass: {
      name: '毛玻璃',
      desc: '现代玻璃拟态，通透模糊',
      css: `
        .game-header {
          background: rgba(20,22,32,0.55) !important;
          backdrop-filter: blur(16px) saturate(1.2) !important;
          -webkit-backdrop-filter: blur(16px) saturate(1.2) !important;
          border-bottom: 1px solid rgba(255,255,255,0.06) !important;
          padding: 10px 16px !important;
          position: relative !important;
        }
        .game-header::after {
          content: '' !important;
          position: absolute !important;
          inset: 0 !important;
          background: linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 100%) !important;
          pointer-events: none !important;
        }

        .hdr-name {
          font-weight: 300 !important;
          font-size: 16px !important;
          color: rgba(255,255,255,0.9) !important;
          text-shadow: 0 1px 2px rgba(0,0,0,0.3) !important;
        }

        .hdr-info span:first-child {
          color: rgba(255,255,255,0.5) !important;
          font-size: 12px !important;
        }
        .realm-badge {
          background: rgba(212,168,68,0.1) !important;
          border: 1px solid rgba(212,168,68,0.2) !important;
          color: rgba(212,168,68,0.9) !important;
          backdrop-filter: blur(4px) !important;
        }

        .hdr-qq {
          color: rgba(255,255,255,0.3) !important;
          font-size: 11px !important;
        }

        .hdr-res span {
          color: rgba(255,255,255,0.7) !important;
          font-size: 12px !important;
        }
        .hdr-res span:first-child { color: rgba(255,215,0,0.8) !important; }
        .hdr-res span[title*="宗门"] { color: rgba(167,139,250,0.8) !important; }

        .btn-icon {
          color: rgba(255,255,255,0.3) !important;
          transition: all 0.3s !important;
        }
        .btn-icon:hover {
          color: rgba(255,255,255,0.8) !important;
          background: rgba(255,255,255,0.05) !important;
          backdrop-filter: blur(4px) !important;
        }
      `
    },

    // ─── 暗黑符文 ───
    runic: {
      name: '暗黑符文',
      desc: '神秘黑暗风格，魔法符文光效',
      css: `
        .game-header {
          background: linear-gradient(135deg, #0a0a0f 0%, #0f0a1a 50%, #0a0a0f 100%) !important;
          border-bottom: 1px solid rgba(99,102,241,0.15) !important;
          padding: 10px 16px !important;
          position: relative !important;
        }
        .game-header::before {
          content: '✦' !important;
          position: absolute !important;
          top: 50% !important;
          left: 8px !important;
          transform: translateY(-50%) !important;
          color: rgba(99,102,241,0.15) !important;
          font-size: 20px !important;
          text-shadow: 0 0 20px rgba(99,102,241,0.2) !important;
          animation: runePulse 3s ease-in-out infinite !important;
        }
        .game-header::after {
          content: '✦' !important;
          position: absolute !important;
          top: 50% !important;
          right: 8px !important;
          transform: translateY(-50%) !important;
          color: rgba(99,102,241,0.15) !important;
          font-size: 20px !important;
          text-shadow: 0 0 20px rgba(99,102,241,0.2) !important;
          animation: runePulse 3s ease-in-out infinite 1.5s !important;
        }
        @keyframes runePulse {
          0%, 100% { opacity: 0.3; transform: translateY(-50%) scale(1); }
          50% { opacity: 0.8; transform: translateY(-50%) scale(1.2); }
        }

        .hdr-name {
          color: #a5b4fc !important;
          text-shadow: 0 0 15px rgba(99,102,241,0.4) !important;
          font-size: 16px !important;
          letter-spacing: 1px !important;
        }

        .hdr-info span:first-child {
          color: #64748b !important;
        }
        .realm-badge {
          background: rgba(99,102,241,0.08) !important;
          border: 1px solid rgba(99,102,241,0.2) !important;
          color: #a5b4fc !important;
        }

        .hdr-qq {
          color: #4a5568 !important;
          font-size: 11px !important;
        }

        .hdr-res span:first-child { color: #c084fc !important; text-shadow: 0 0 8px rgba(192,132,252,0.2) !important; }
        .hdr-res span[title*="宗门"] { color: #6366f1 !important; }

        .btn-icon {
          color: #4a5568 !important;
          transition: all 0.3s !important;
        }
        .btn-icon:hover {
          color: #a5b4fc !important;
          text-shadow: 0 0 10px rgba(99,102,241,0.4) !important;
        }
      `
    }
  };

  // ══════════════════════════════════════════════
  // 核心逻辑
  // ══════════════════════════════════════════════

  const STORAGE_KEY = 'ider_skin_active';

  function getActiveSkin() {
    return GM_getValue(STORAGE_KEY, '');
  }

  function setActiveSkin(name) {
    GM_setValue(STORAGE_KEY, name);
  }

  let activeStyleEl = null;

  function applySkin(skinName) {
    if (activeStyleEl) {
      activeStyleEl.remove();
      activeStyleEl = null;
    }

    if (skinName && SKINS[skinName]) {
      const style = document.createElement('style');
      style.textContent = SKINS[skinName].css;
      style.setAttribute('data-ider-skin', skinName);
      document.head.appendChild(style);
      activeStyleEl = style;
      setActiveSkin(skinName);
      console.log('[皮肤] 已应用:', SKINS[skinName].name);
    } else {
      setActiveSkin('');
      console.log('[皮肤] 已恢复默认');
    }
  }

  // ─── 注入皮肤选择面板 ───

  function injectSkinPanel() {
    // 等 header 渲染出来后再加按钮
    const observer = new MutationObserver(() => {
      const header = document.querySelector('.game-header');
      if (header && !document.querySelector('.ider-skin-btn')) {
        const btn = document.createElement('button');
        btn.className = 'btn-icon ider-skin-btn';
        btn.textContent = '🎨';
        btn.title = '切换皮肤';
        btn.style.cssText = 'font-size:16px;position:relative;';
        btn.addEventListener('click', showSkinPicker);
        header.appendChild(btn);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function showSkinPicker() {
    const existing = document.querySelector('.ider-skin-panel');
    if (existing) { existing.remove(); return; }

    const current = getActiveSkin();
    const panel = document.createElement('div');
    panel.className = 'ider-skin-panel';
    panel.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(20,22,32,0.95); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px; padding: 24px; z-index: 99999;
      min-width: 300px; max-width: 90vw; max-height: 80vh; overflow-y: auto;
      backdrop-filter: blur(20px); box-shadow: 0 24px 80px rgba(0,0,0,0.6);
    `;

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0;color:#d4a844;font-size:16px">🎨 皮肤切换</h3>
        <button class="ider-skin-close" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer">✕</button>
      </div>
      <div style="display:grid;gap:8px">
        <div class="ider-skin-option ${!current ? 'active' : ''}" data-skin=""
             style="padding:10px 14px;border-radius:10px;cursor:pointer;border:2px solid ${!current ? '#d4a844' : 'transparent'};background:rgba(255,255,255,0.03);transition:all 0.2s;">
          <div style="font-weight:600;color:${!current ? '#d4a844' : '#ccc'};font-size:14px">默认样式</div>
          <div style="font-size:12px;color:#888;margin-top:2px">游戏原始外观</div>
        </div>
    `;

    for (const [key, skin] of Object.entries(SKINS)) {
      const isActive = current === key;
      html += `
        <div class="ider-skin-option ${isActive ? 'active' : ''}" data-skin="${key}"
             style="padding:10px 14px;border-radius:10px;cursor:pointer;border:2px solid ${isActive ? '#d4a844' : 'transparent'};background:rgba(255,255,255,0.03);transition:all 0.2s;">
          <div style="font-weight:600;color:${isActive ? '#d4a844' : '#ccc'};font-size:14px">${skin.name}</div>
          <div style="font-size:12px;color:#888;margin-top:2px">${skin.desc}</div>
        </div>
      `;
    }
    html += `</div>`;
    panel.innerHTML = html;

    // 遮罩
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99998;';
    overlay.addEventListener('click', () => { panel.remove(); overlay.remove(); });
    panel.querySelector('.ider-skin-close').addEventListener('click', () => { panel.remove(); overlay.remove(); });

    panel.querySelectorAll('.ider-skin-option').forEach(el => {
      el.addEventListener('click', () => {
        const skin = el.dataset.skin;
        applySkin(skin);
        panel.remove();
        overlay.remove();
        showToast(skin ? `已切换为「${SKINS[skin].name}」` : '已恢复默认样式');
      });
    });

    document.body.appendChild(overlay);
    document.body.appendChild(panel);
  }

  function showToast(msg) {
    const t = document.createElement('div');
    t.style.cssText = `
      position:fixed;top:60px;left:50%;transform:translateX(-50%);
      background:rgba(30,32,52,0.95);border:1px solid #d4a844;
      color:#d4a844;padding:10px 24px;border-radius:20px;
      z-index:99999;font-size:14px;max-width:90vw;text-align:center;
      animation:iderFadeIn 0.3s ease;
    `;
    t.textContent = msg;
    document.head.insertAdjacentHTML('beforeend', '<style>@keyframes iderFadeIn{from{opacity:0;transform:translateX(-50%) translateY(-10px)}}</style>');
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 2000);
  }

  // ─── 自动加载已保存的皮肤 ───

  const savedSkin = getActiveSkin();
  if (savedSkin && SKINS[savedSkin]) {
    // 等页面加载完再应用
    const waitLoop = setInterval(() => {
      if (document.querySelector('.game-header')) {
        applySkin(savedSkin);
        clearInterval(waitLoop);
      }
    }, 200);
  }

  // ─── 注入皮肤按钮 ───
  setTimeout(injectSkinPanel, 1000);

})();
