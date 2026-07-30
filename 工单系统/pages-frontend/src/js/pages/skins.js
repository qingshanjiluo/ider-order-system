// pages/skins.js — 皮肤管理（用户端）
import { api } from '../api.js';
import { toast } from '../components/toast.js';

let currentActive = null;
let userBalance = 0;

const SKIN_PREVIEWS = {
  ink: 'linear-gradient(135deg,#f5f0e8,#e8dfd0)',
  cyber: 'linear-gradient(135deg,#03030a,#0c0c28)',
  luxe: 'linear-gradient(135deg,#0d0b08,#3a3022)',
  magazine: 'linear-gradient(135deg,#f8f6f2,#e8e2da)',
  wabi: 'linear-gradient(135deg,#e8ddd0,#c4b4a0)',
  minimal: 'linear-gradient(135deg,#ffffff,#e8e8e8)',
  frost: 'linear-gradient(135deg,#0e0e14,#2c2e44)',
  brutal: 'linear-gradient(135deg,#f0f0f0,#d0d0d0)',
  dunhuang: 'linear-gradient(135deg,#F0E6D3,#D4A844)',
  taiji: 'linear-gradient(135deg,#F8F8F8,#0A0A0A)',
  guzhenren: 'linear-gradient(135deg,#07070A,#5C4033)',
};

export async function renderSkins({ container }) {
  try {
    const userRes = await api.getUserInfo();
    userBalance = userRes.user?.bonus_points || 0;
  } catch { userBalance = 0; }

  container.innerHTML = `
    <div class="page-header">
      <div class="flex justify-between items-center">
        <div>
          <h2>皮肤管理</h2>
          <p>管理你的游戏皮肤外观</p>
        </div>
        <div>
          <span style="font-size:var(--text-sm);color:var(--text-secondary);">修仙币：</span>
          <strong style="color:var(--accent-amber);font-size:1.1em;" id="skin-coins-balance">${userBalance}</strong>
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

    el.innerHTML = `
      <div style="background:var(--bg-card);border-radius:var(--radius-md);padding:var(--space-3);margin-top:var(--space-4);border:1px solid var(--accent-amber);font-size:var(--text-xs);color:var(--text-secondary);display:flex;align-items:center;gap:var(--space-2);">
        <span style="font-size:16px;">💡</span>
        <span>当前预览仅是在系统展现效果，非最终效果。购买后可查看完整使用教程。</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-4);margin-top:var(--space-4);">
        ${skins.map(skin => {
          const o = owned.find(x => x.id === skin.id);
          const active = currentActive && currentActive.id === skin.id;
          const price = skin.price || 0;
          return `
            <div class="card" style="display:flex;flex-direction:column;${active ? 'outline:2px solid var(--accent-green);outline-offset:-2px;' : ''}">
              <div style="height:120px;border-radius:var(--radius-md);background:${SKIN_PREVIEWS[skin.key] || '#1a1a2e'};display:flex;align-items:center;justify-content:center;margin-bottom:var(--space-3);border:1px solid rgba(255,255,255,0.1);">
                <span style="color:rgba(255,255,255,0.6);font-size:var(--text-sm);">${skin.label}</span>
              </div>
              <div style="flex:1;">
                <h3 style="font-size:var(--text-base);font-weight:var(--font-semibold);margin-bottom:var(--space-1);">${skin.label}</h3>
                <p style="font-size:var(--text-sm);color:var(--text-secondary);">${skin.description || ''}</p>
                ${price > 0 ? `<p style="font-size:var(--text-sm);color:var(--accent-amber);margin-top:var(--space-1);">价格：${price} 修仙币</p>` : '<p style="font-size:var(--text-sm);color:var(--accent-green);margin-top:var(--space-1);">免费</p>'}
              </div>
              <div style="margin-top:var(--space-3);display:flex;gap:var(--space-2);flex-wrap:wrap;">
                ${o ? `
                  <button class="btn ${active ? 'btn-success' : 'btn-primary'} btn-sm" data-use-skin="${skin.id}">${active ? '使用中' : '使用'}</button>
                ` : `
                  <button class="btn btn-primary btn-sm" data-buy-skin="${skin.id}" data-price="${price}">${price > 0 ? `购买 ${price}币` : '免费领取'}</button>
                `}
                <button class="btn btn-ghost btn-sm" data-preview-skin="${skin.key}">预览</button>
                <button class="btn btn-ghost btn-sm" data-tutorial-skin="${skin.key}">教程</button>
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

    el.querySelectorAll('[data-buy-skin]').forEach(btn => {
      btn.addEventListener('click', () => {
        const skinId = parseInt(btn.dataset.buySkin);
        const skin = skins.find(s => s.id === skinId);
        if (!skin) return toast.error('皮肤数据异常，请刷新重试');
        showBuyModal(container, skin, () => {
          loadShop(el, container);
          loadMine(container.querySelector('#skin-mine'));
          refreshBalance(container);
        });
      });
    });

    el.querySelectorAll('[data-preview-skin]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.previewSkin;
        const existing = document.getElementById('skin-preview-style');
        if (existing) existing.remove();
        fetch(`/api/skins/css/${key}?v=${Date.now()}`)
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

    el.querySelectorAll('[data-tutorial-skin]').forEach(btn => {
      btn.addEventListener('click', () => showTutorialModal());
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
              <div style="height:100px;border-radius:var(--radius-md);background:${SKIN_PREVIEWS[o.key] || '#1a1a2e'};display:flex;align-items:center;justify-content:center;margin-bottom:var(--space-3);border:1px solid rgba(255,255,255,0.1);">
                <span style="color:rgba(255,255,255,0.6);font-size:var(--text-sm);">${o.label}</span>
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-2);">
                <h3 style="font-size:var(--text-base);font-weight:var(--font-semibold);">${o.label}</h3>
                ${active ? '<span class="badge badge-approved">使用中</span>' : ''}
              </div>
              <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-bottom:var(--space-3);">获取于 ${new Date(o.created_at).toLocaleDateString('zh-CN')}</p>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${!active ? '<button class="btn btn-primary btn-sm" data-use-owned="' + o.id + '">使用</button>' : ''}
                <button class="btn btn-ghost btn-sm" data-apply-css="' + o.key + '">应用于工单系统</button>
              </div>
            </div>`;
        }).join('')}
      </div>`;

    el.querySelectorAll('[data-apply-css]').forEach(btn => {
      btn.addEventListener('click', function() {
        applySkinToSite(this.dataset.applyCss);
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>加载失败: ${err.message}</p></div>`;
  }
}

function refreshBalance(container) {
  api.getUserInfo().then(res => {
    userBalance = res.user?.bonus_points || 0;
    const el = container.querySelector('#skin-coins-balance');
    if (el) el.textContent = userBalance;
  }).catch(() => {});
}

function showTutorialModal() {
  showModal('完整使用教程', `
    <div style="background:var(--bg-card);border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-4);">
      <h4 style="font-size:var(--text-sm);font-weight:var(--font-semibold);margin-bottom:var(--space-2);">📥 下载脚本</h4>
      <p style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-2);">点击下方按钮下载脚本文件（某些浏览器不会自动弹出安装，此时请手动导入）</p>
      <div style="text-align:center;margin:var(--space-3) 0;">
        <a href="/docs/ider_skin_full.user.js" target="_blank" class="btn btn-primary">📥 下载 ider_skin_full.user.js</a>
      </div>
    </div>

    <div style="background:var(--bg-card);border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-4);">
      <h4 style="font-size:var(--text-sm);font-weight:var(--font-semibold);margin-bottom:var(--space-2);">🔧 手动导入（如果自动安装没弹出）</h4>
      <ol style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.8;padding-left:var(--space-4);">
        <li>点击上方按钮下载 <code style="background:var(--bg-base);padding:1px 4px;border-radius:3px;">.user.js</code> 文件到本地</li>
        <li>打开浏览器的 Tampermonkey 扩展（工具栏 🧩 图标 → 管理面板 / Dashboard）</li>
        <li>点击「<strong>实用工具</strong>」(Utilities) 选项卡</li>
        <li>在「<strong>导入</strong>」(Import) 区域选择刚下载的 .user.js 文件</li>
        <li>点击「安装」(Install) 完成安装</li>
      </ol>
    </div>

    <div style="background:var(--bg-card);border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-4);">
      <h4 style="font-size:var(--text-sm);font-weight:var(--font-semibold);margin-bottom:var(--space-2);">📱 在手机上使用</h4>
      <ol style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.8;padding-left:var(--space-4);">
        <li>Android：安装 <strong>Kiwi Browser</strong>，从 Chrome 商店安装 Tampermonkey 扩展</li>
        <li>iOS：安装 <strong>Userscripts</strong> App（App Store 免费）</li>
        <li>下载脚本文件后，Tampermonkey 如果没弹出安装，进入扩展管理面板手动导入</li>
        <li>Userscripts 需将 .user.js 文件放入 Safari 共享菜单中的 Userscripts 扩展</li>
      </ol>
    </div>

    <div style="background:var(--bg-card);border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-4);">
      <h4 style="font-size:var(--text-sm);font-weight:var(--font-semibold);margin-bottom:var(--space-2);">🎨 切换皮肤</h4>
      <ol style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.8;padding-left:var(--space-4);">
        <li>脚本安装后，游戏页面右下角会出现 <strong>🧩 皮肤</strong> 按钮</li>
        <li>点击可打开皮肤选择面板，选择你拥有的皮肤</li>
        <li>脚本会自动同步你在工单系统选择的皮肤（每 30 分钟同步一次）</li>
        <li>也可在工单系统「我的皮肤」中切换，脚本会同步更新</li>
      </ol>
    </div>

    <div style="background:var(--bg-card);border-radius:var(--radius-md);padding:var(--space-4);">
      <h4 style="font-size:var(--text-sm);font-weight:var(--font-semibold);margin-bottom:var(--space-2);">❓ 常见问题</h4>
      <ul style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.8;padding-left:var(--space-4);">
        <li><strong>皮肤不生效？</strong> 确认脚本已启用，刷新游戏页面重试</li>
        <li><strong>脚本设置在哪？</strong> 页面右下角 🧩 图标打开皮肤面板</li>
        <li><strong>手机怎么装？</strong> Kiwi Browser (Android) 或 Userscripts (iOS)</li>
        <li><strong>如何恢复默认？</strong> 皮肤面板选择「无」或禁用脚本</li>
        <li><strong>下载后没有反应？</strong> 手动导入：Tampermonkey → 管理面板 → 实用工具 → 导入文件</li>
      </ol>
    </div>
  `.trim());
}

function showPurchaseSuccessModal(skin, message) {
  showModal('🎉 购买成功', `
    <p style="font-size:var(--text-sm);color:var(--accent-green);text-align:center;margin-bottom:var(--space-4);">${message}</p>
    <p style="font-size:var(--text-xs);color:var(--text-secondary);text-align:center;margin-bottom:var(--space-4);">皮肤已自动启用，工单系统界面已更换新外观。</p>

    <div style="background:var(--bg-card);border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-3);">
      <h4 style="font-size:var(--text-sm);font-weight:var(--font-semibold);margin-bottom:var(--space-2);">📖 在游戏内使用该皮肤</h4>
      <ol style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.8;padding-left:var(--space-4);">
        <li><a href="/docs/ider_skin_full.user.js" target="_blank" style="color:var(--accent-blue);">下载脚本</a> 到本地（如自动安装弹窗未出现）</li>
        <li>Tampermonkey → 管理面板 → 实用工具 → 导入文件 → 选下载的 .user.js → 安装</li>
        <li>脚本会自动同步你在工单系统选择的皮肤</li>
        <li>游戏页面右下角会出现 🧩 皮肤按钮可切换</li>
      </ol>
    </div>

    <p style="font-size:var(--text-xs);color:var(--text-tertiary);text-align:center;">详细教程请点击「教程」按钮查看</p>
  `.trim(), '知道了');
}

function applySkinToSite(key) {
  if (!key) return toast.error('无效皮肤');
  // 清除之前应用的皮肤
  var existing = document.getElementById('ider-skin-css');
  if (existing) existing.remove();
  // 获取CSS并应用
  fetch('/api/skins/css/' + key + '?v=' + Date.now())
    .then(function(r) { return r.text(); })
    .then(function(css) {
      var style = document.createElement('style');
      style.id = 'ider-skin-css';
      style.textContent = css;
      document.head.appendChild(style);
      localStorage.setItem('ider_active_skin', key);
      toast.success('皮肤已应用于工单系统');
    })
    .catch(function() { toast.error('皮肤应用失败'); });
}

// 页面加载时恢复之前应用的皮肤
(function() {
  var saved = localStorage.getItem('ider_active_skin');
  if (saved) {
    fetch('/api/skins/css/' + saved)
      .then(function(r) { return r.text(); })
      .then(function(css) {
        var style = document.createElement('style');
        style.id = 'ider-skin-css';
        style.textContent = css;
        document.head.appendChild(style);
      }).catch(function() {});
  }
})();

function showModal(title, bodyHtml, confirmText) {
  const m = document.createElement('div');
  m.className = 'modal-overlay';
  m.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" data-close-modal>&times;</button>
      </div>
      <div class="modal-body" style="padding:var(--space-5);max-height:70vh;overflow-y:auto;">
        ${bodyHtml}
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" data-close-modal>${confirmText || '关闭'}</button>
      </div>
    </div>`;

  document.body.appendChild(m);
  requestAnimationFrame(() => m.classList.add('active'));

  function close() { m.classList.remove('active'); setTimeout(() => m.remove(), 200); }
  m.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', close));
  m.addEventListener('click', e => { if (e.target === m) close(); });
}

function showBuyModal(container, skin, onSuccess) {
  const price = skin.price || 0;
  const canAfford = userBalance >= price;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-header">
        <h3>确认购买皮肤</h3>
        <button class="modal-close" data-close-modal>&times;</button>
      </div>
      <div class="modal-body" style="padding:var(--space-5);">
        <div style="height:100px;border-radius:var(--radius-md);background:${SKIN_PREVIEWS[skin.key] || '#1a1a2e'};display:flex;align-items:center;justify-content:center;margin-bottom:var(--space-4);border:1px solid rgba(255,255,255,0.1);">
          <span style="color:rgba(255,255,255,0.6);font-size:var(--text-base);">${skin.label}</span>
        </div>
        <h3 style="font-size:var(--text-lg);font-weight:var(--font-semibold);text-align:center;margin-bottom:var(--space-2);">${skin.label}</h3>
        <p style="font-size:var(--text-sm);color:var(--text-secondary);text-align:center;margin-bottom:var(--space-4);">${skin.description || ''}</p>

        <div style="background:var(--bg-card);border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-4);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2);">
            <span style="font-size:var(--text-sm);color:var(--text-secondary);">价格</span>
            <span style="font-size:var(--text-base);font-weight:var(--font-semibold);color:${price > 0 ? 'var(--accent-amber)' : 'var(--accent-green)'};">${price > 0 ? `${price} 修仙币` : '免费'}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:var(--text-sm);color:var(--text-secondary);">当前余额</span>
            <span style="font-size:var(--text-base);font-weight:var(--font-semibold);color:${canAfford ? 'var(--accent-amber)' : 'var(--accent-red)'};">${userBalance} 修仙币</span>
          </div>
        </div>

        <div style="background:var(--bg-card);border-radius:var(--radius-md);padding:var(--space-4);margin-bottom:var(--space-4);">
          <h4 style="font-size:var(--text-sm);font-weight:var(--font-semibold);margin-bottom:var(--space-2);">📖 使用教程</h4>
          <ol style="font-size:var(--text-xs);color:var(--text-secondary);line-height:1.8;padding-left:var(--space-4);">
            <li>购买后皮肤将自动启用，整个工单系统界面会立即换上新外观</li>
            <li>可在"我的皮肤"中随时切换已拥有的皮肤</li>
            <li>如需在游戏内也使用该皮肤，请安装 Tampermonkey 脚本
              <a href="/docs/ider_skin_full.user.js" target="_blank" style="color:var(--accent-blue);">ider_skin_full.user.js</a>
            </li>
            <li>脚本安装后会自动同步你在工单系统选择的皮肤</li>
            <li>支持 Kiwi Browser (Android) 和 Userscripts (iOS)</li>
          </ol>
        </div>

        ${!canAfford ? `<p style="font-size:var(--text-sm);color:var(--accent-red);text-align:center;margin-bottom:var(--space-3);">修仙币不足，请先<a href="#/recharge" style="color:var(--accent-blue);">充值</a></p>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-close-modal>取消</button>
        <button class="btn btn-primary" id="confirm-buy-btn" ${!canAfford ? 'disabled' : ''}>
          ${price > 0 ? `确认支付 ${price} 修仙币` : '免费领取'}
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('active'));

  function closeModal() {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 200);
  }

  modal.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', closeModal);
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  const confirmBtn = modal.querySelector('#confirm-buy-btn');
  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = '处理中...';
    try {
      const res = await api.buySkin(skin.id);
      closeModal();
      showPurchaseSuccessModal(skin, res.message);
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(err.message);
      confirmBtn.disabled = false;
      confirmBtn.textContent = price > 0 ? `确认支付 ${price} 修仙币` : '免费领取';
    }
  });
}
