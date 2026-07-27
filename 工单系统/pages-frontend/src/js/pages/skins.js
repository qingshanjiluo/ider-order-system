// pages/skins.js — 皮肤管理（用户端）
import { api } from '../api.js';
import { toast } from '../components/toast.js';

let currentActive = null;

export async function renderSkins({ container }) {
  container.innerHTML = `
    <div class="page-header">
      <div class="flex justify-between items-center">
        <div>
          <h2>皮肤管理</h2>
          <p>管理你的游戏皮肤外观</p>
        </div>
      </div>
    </div>

    <div class="tabs" id="skin-tabs">
      <button class="tab active" data-tab="shop">皮肤商店</button>
      <button class="tab" data-tab="mine">我的皮肤</button>
      <button class="tab" data-tab="activate">激活码</button>
    </div>

    <div id="skin-shop" class="tab-content"></div>
    <div id="skin-mine" class="tab-content" style="display:none"></div>
    <div id="skin-activate" class="tab-content" style="display:none"></div>`;

  container.querySelectorAll('#skin-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('#skin-tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      container.querySelectorAll('#skin-shop, #skin-mine, #skin-activate').forEach(el => el.style.display = 'none');
      const target = container.querySelector(`#skin-${tab.dataset.tab}`);
      if (target) target.style.display = '';
    });
  });

  const [shopEl, mineEl, activateEl] = ['shop', 'mine', 'activate'].map(id =>
    container.querySelector(`#skin-${id}`)
  );

  loadShop(shopEl, container);
  loadMine(mineEl);

  activateEl.innerHTML = `
    <div class="card" style="margin-top:var(--space-4);max-width:480px;">
      <h3 style="font-size:var(--text-base);font-weight:var(--font-semibold);margin-bottom:var(--space-4);">激活皮肤</h3>
      <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-4);">输入你在工单系统购买的激活码来解锁皮肤</p>
      <div class="form-group">
        <input type="text" class="form-input" id="activate-code-input" placeholder="输入激活码 (如 ABCDE-12345)" style="text-transform:uppercase;letter-spacing:0.1em;font-family:var(--font-mono);">
      </div>
      <button class="btn btn-primary" id="activate-btn">激活</button>
      <div id="activate-result" style="margin-top:var(--space-3);"></div>
    </div>`;

  container.querySelector('#activate-btn')?.addEventListener('click', async () => {
    const input = container.querySelector('#activate-code-input');
    const resultEl = container.querySelector('#activate-result');
    const code = (input.value || '').trim().toUpperCase();
    if (!code) {
      resultEl.innerHTML = `<p style="color:var(--accent-red);font-size:var(--text-sm);">请输入激活码</p>`;
      return;
    }
    try {
      const res = await api.activateSkin(code);
      resultEl.innerHTML = `<p style="color:var(--accent-green);font-size:var(--text-sm);">${res.message}</p>`;
      input.value = '';
      loadMine(container.querySelector('#skin-mine'));
      loadShop(container.querySelector('#skin-shop'), container);
    } catch (err) {
      resultEl.innerHTML = `<p style="color:var(--accent-red);font-size:var(--text-sm);">${err.message}</p>`;
    }
  });
}

async function loadShop(el, container) {
  if (!el) return;
  try {
    const [skinsRes, mineRes] = await Promise.all([
      api.getSkins(),
      api.getMySkins().catch(() => ({ owned: [], active: null })),
    ]);
    const skins = skinsRes.skins || [];
    const owned = mineRes.owned || [];
    currentActive = mineRes.active;

    if (!skins.length) {
      el.innerHTML = `<div class="empty-state"><p>暂无可用皮肤</p></div>`;
      return;
    }

    const previewColors = {
      golden: 'linear-gradient(135deg,#1a1100,#2d1f00)',
      ink: 'linear-gradient(135deg,#0d0d1a,#1a1a2e)',
      cyber: 'linear-gradient(135deg,#0a0a1a,#1a0033)',
      glass: 'linear-gradient(135deg,#1a1a2e,#0f3460)',
      rune: 'linear-gradient(135deg,#050505,#0f0a05)',
    };

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-4);margin-top:var(--space-4);">
        ${skins.map(skin => {
          const o = owned.find(x => x.id === skin.id);
          const active = currentActive && currentActive.id === skin.id;
          return `
            <div class="card" style="display:flex;flex-direction:column;${active ? 'outline:2px solid var(--accent-green);outline-offset:-2px;' : ''}">
              <div style="height:120px;border-radius:var(--radius-md);background:${previewColors[skin.key] || '#1a1a2e'};display:flex;align-items:center;justify-content:center;margin-bottom:var(--space-3);border:1px solid rgba(255,255,255,0.1);">
                <span style="color:rgba(255,255,255,0.6);font-size:var(--text-sm);">${skin.label}</span>
              </div>
              <div style="flex:1;">
                <h3 style="font-size:var(--text-base);font-weight:var(--font-semibold);margin-bottom:var(--space-1);">${skin.label}</h3>
                <p style="font-size:var(--text-sm);color:var(--text-secondary);">${skin.description || ''}</p>
              </div>
              <div style="margin-top:var(--space-3);display:flex;gap:var(--space-2);flex-wrap:wrap;">
                ${o ? `
                  <button class="btn ${active ? 'btn-success' : 'btn-primary'} btn-sm" data-use-skin="${skin.id}">${active ? '使用中' : '使用'}</button>
                ` : `<button class="btn btn-secondary btn-sm" disabled>未拥有</button>`}
                <button class="btn btn-ghost btn-sm" data-preview-skin="${skin.key}">预览</button>
              </div>
            </div>`;
        }).join('')}
      </div>`;

    el.querySelectorAll('[data-use-skin]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const res = await api.useSkin(parseInt(btn.dataset.useSkin));
          toast.success(res.message);
          loadShop(el, container);
          loadMine(container.querySelector('#skin-mine'));
        } catch (err) { toast.error(err.message); }
      });
    });

    el.querySelectorAll('[data-preview-skin]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.previewSkin;
        const existing = document.getElementById('skin-preview-style');
        if (existing) existing.remove();
        fetch(`/api/skins/css/${key}`)
          .then(r => r.text())
          .then(css => {
            const style = document.createElement('style');
            style.id = 'skin-preview-style';
            style.textContent = css;
            document.head.appendChild(style);
            toast.info('已应用皮肤预览，刷新页面恢复默认');
          })
          .catch(() => toast.error('预览加载失败'));
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>加载失败: ${err.message}</p></div>`;
  }
}

async function loadMine(el) {
  if (!el) return;
  try {
    const res = await api.getMySkins();
    const owned = res.owned || [];
    currentActive = res.active;

    if (!owned.length) {
      el.innerHTML = `<div class="empty-state"><p>你还没有任何皮肤，前往商店购买吧</p></div>`;
      return;
    }

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-4);margin-top:var(--space-4);">
        ${owned.map(o => {
          const active = currentActive && currentActive.id === o.id;
          return `
            <div class="card" style="${active ? 'outline:2px solid var(--accent-green);outline-offset:-2px;' : ''}">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-2);">
                <h3 style="font-size:var(--text-base);font-weight:var(--font-semibold);">${o.label}</h3>
                ${active ? '<span class="badge badge-approved">使用中</span>' : ''}
              </div>
              <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:var(--space-3);">获取于 ${new Date(o.created_at).toLocaleDateString('zh-CN')}</p>
              ${!active ? `<button class="btn btn-primary btn-sm" data-use-owned="${o.id}">使用</button>` : ''}
            </div>`;
        }).join('')}
      </div>`;

    el.querySelectorAll('[data-use-owned]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const res = await api.useSkin(parseInt(btn.dataset.useOwned));
          toast.success(res.message);
          loadMine(el);
          loadShop(document.querySelector('#skin-shop'), el.closest('#app-content'));
        } catch (err) { toast.error(err.message); }
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>加载失败: ${err.message}</p></div>`;
  }
}
