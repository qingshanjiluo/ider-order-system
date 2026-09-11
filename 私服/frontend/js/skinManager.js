/* 仙 九重天阙 私服 · 皮肤管理器
 * 内置 8 套皮肤（抽取自 docs/ider_skin_full.user.js），无需油猴脚本。
 * 用法：
 *   <link id="skin-link" rel="stylesheet" href="skins/inkwash.css">
 *   SkinManager.init({ registry: '/skin-registry.json', onChange: (key)=>{} });
 *   SkinManager.apply('cyber');
 *   SkinManager.getCurrent();
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'ideer_skin_key';
  const DEFAULT_SKIN = 'original';

  // 本地注册表（与 shared/skin-registry.json 一致，作为兜底）
  const LOCAL_SKINS = [
    { key: 'original', name: '原皮', desc: '原始修仙风格（默认）', file: '' },
    { key: 'inkwash',  name: '水墨修仙', desc: '泼墨写意，素雅高远 · 大面积留白，笔触质感', file: 'inkwash.css' },
    { key: 'cyber',    name: '赛博修仙', desc: '霓虹光污染，数据流涌动 · 紧凑布局，速度感', file: 'cyber.css' },
    { key: 'luxe',     name: '奢华金属', desc: '鎏金溢彩，华贵典藏 · 金属光泽，浮雕质感', file: 'luxe.css' },
    { key: 'magazine', name: '轻奢杂志', desc: '杂志级排版，克制优雅 · 大留白，精字距', file: 'magazine.css' },
    { key: 'wabi',     name: '日式和风', desc: '侘寂美学，一木一石 · 自然质感，和纸纹理', file: 'wabi.css' },
    { key: 'minimal',  name: '极简主义', desc: '少即是多，内容至上 · 极致留白，去装饰化', file: 'minimal.css' },
    { key: 'frost',    name: '磨砂玻璃态', desc: 'Apple 风格玻璃拟态 · 通透模糊，悬浮层次', file: 'frost.css' },
    { key: 'brutal',   name: '粗野主义', desc: '粗粝不羁，破格醒目 · 厚边框，撞色块，无圆角', file: 'brutal.css' },
  ];

  let _skins = LOCAL_SKINS;
  let _current = null;
  let _onChange = null;
  let _linkEl = null;

  function getSkinBase() {
    // 兼容 /chat.html 与子路径部署
    const p = location.pathname;
    const base = p.endsWith('.html') || p.includes('/chat') ? p.substring(0, p.lastIndexOf('/') + 1) : './';
    return base + 'skins/';
  }

  function ensureLink() {
    if (_linkEl) return _linkEl;
    let el = document.getElementById('skin-link');
    if (!el) {
      el = document.createElement('link');
      el.id = 'skin-link';
      el.rel = 'stylesheet';
      el.setAttribute('data-ideer-skin', '1');
      document.head.appendChild(el);
    }
    _linkEl = el;
    return el;
  }

  async function loadRegistry() {
    try {
      const res = await fetch('skin-registry.json', { cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.skins) && data.skins.length) {
          _skins = data.skins.map(s => ({ key: s.key, name: s.name || s.key, desc: s.desc || '', file: s.file || (s.key + '.css') }));
          return _skins;
        }
      }
    } catch (e) { /* 本地注册表兜底 */ }
    return _skins;
  }

  function apply(key) {
    if (!key) key = DEFAULT_SKIN;
    const skin = _skins.find(s => s.key === key);
    if (!skin) skin = _skins.find(s => s.key === DEFAULT_SKIN);
    if (!skin) return key;
    const link = ensureLink();
    if (skin.file) {
      link.href = getSkinBase() + skin.file;
    } else {
      // 原皮：清除皮肤样式，恢复 style.css 基础样式
      link.removeAttribute('href');
    }
    _current = skin.key;
    try { localStorage.setItem(STORAGE_KEY, skin.key); } catch (e) {}
    document.documentElement.setAttribute('data-skin', skin.key);
    if (typeof _onChange === 'function') {
      try { _onChange(skin.key); } catch (e) {}
    }
    return skin.key;
  }

  function getCurrent() {
    return _current || DEFAULT_SKIN;
  }

  function getSkins() {
    return _skins;
  }

  function init(opts) {
    opts = opts || {};
    _onChange = opts.onChange || null;
    loadRegistry().then(() => {
      let saved = null;
      try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
      apply(saved || opts.defaultSkin || DEFAULT_SKIN);
    });
  }

  /** 渲染一个皮肤选择面板（弹层），返回 DOM 容器 */
  function renderPicker(container, opts) {
    opts = opts || {};
    const box = document.createElement('div');
    box.className = 'ideer-skin-picker';
    box.style.cssText = [
      'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;',
      'background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);'
    ].join('');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'width:min(560px,92vw);max-height:82vh;overflow-y:auto;background:rgba(22,24,36,0.97);',
      'border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:20px;color:#e8e8f0;',
      'font-family:"PingFang SC","Microsoft YaHei",sans-serif;box-shadow:0 24px 80px rgba(0,0,0,0.5);'
    ].join('');

    const title = document.createElement('div');
    title.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;';
    title.innerHTML = '<span style="font-size:15px;font-weight:600;color:#d4a844;">🎨 皮肤主题</span>' +
      '<span data-ideer-picker-close style="font-size:20px;color:#888;cursor:pointer;">✕</span>';
    panel.appendChild(title);

    const list = document.createElement('div');
    list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;';
    _skins.forEach(s => {
      const item = document.createElement('div');
      const active = s.key === getCurrent();
      item.dataset.key = s.key;
      item.style.cssText = [
        'padding:12px 14px;border-radius:12px;cursor:pointer;border:2px solid ' + (active ? 'rgba(212,168,68,0.7)' : 'transparent') + ';',
        'background:rgba(255,255,255,' + (active ? '0.06' : '0.03') + ');transition:all .2s;'
      ].join('');
      item.innerHTML = '<div style="font-weight:600;font-size:13px;color:' + (active ? '#d4a844' : '#d0d0dc') + ';">' + s.name + '</div>' +
        (s.desc ? '<div style="font-size:11px;color:#8a8a9a;margin-top:3px;line-height:1.4;">' + s.desc + '</div>' : '');
      item.addEventListener('click', () => {
        apply(s.key);
        if (typeof opts.onApply === 'function') opts.onApply(s.key);
        const cur = getCurrent();
        list.querySelectorAll('[data-key]').forEach(el => {
          const isActive = el.dataset.key === cur;
          el.style.borderColor = isActive ? 'rgba(212,168,68,0.7)' : 'transparent';
          el.style.background = 'rgba(255,255,255,' + (isActive ? '0.06' : '0.03') + ')';
          el.firstChild.style.color = isActive ? '#d4a844' : '#d0d0dc';
        });
        if (typeof opts.autoClose === 'undefined' || opts.autoClose) {
          setTimeout(() => box.remove(), 250);
        }
      });
      list.appendChild(item);
    });
    panel.appendChild(list);

    const foot = document.createElement('div');
    foot.style.cssText = 'margin-top:12px;font-size:11px;color:#666;text-align:center;';
    foot.textContent = '皮肤选择已保存到本地，下次进入自动应用';
    panel.appendChild(foot);

    box.appendChild(panel);
    box.addEventListener('click', (e) => { if (e.target === box) box.remove(); });
    panel.querySelector('[data-ideer-picker-close]').addEventListener('click', () => box.remove());

    if (container) container.appendChild(box);
    else document.body.appendChild(box);
    return box;
  }

  /** 浮动换肤按钮（登录页/聊天页使用） */
  function mountFloatButton(opts) {
    opts = opts || {};
    if (document.getElementById('ideer-skin-float')) return;
    const btn = document.createElement('button');
    btn.id = 'ideer-skin-float';
    btn.textContent = '🎨';
    btn.title = '切换皮肤';
    btn.style.cssText = [
      'position:fixed;right:16px;bottom:16px;z-index:99990;width:44px;height:44px;border-radius:50%;',
      'background:rgba(30,32,48,0.85);border:1px solid rgba(212,168,68,0.4);color:#d4a844;font-size:20px;',
      'cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,0.35);backdrop-filter:blur(4px);transition:transform .15s;'
    ].join('');
    btn.onmouseenter = () => { btn.style.transform = 'scale(1.08)'; };
    btn.onmouseleave = () => { btn.style.transform = 'scale(1)'; };
    btn.addEventListener('click', () => renderPicker(null, opts));
    document.body.appendChild(btn);
    return btn;
  }

  global.SkinManager = {
    init, apply, getCurrent, getSkins, renderPicker, mountFloatButton,
    DEFAULT_SKIN, STORAGE_KEY
  };
})(window);
