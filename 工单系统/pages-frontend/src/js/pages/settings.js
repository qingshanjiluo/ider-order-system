// pages/settings.js — 设置页

import { api } from '../api.js';
import { store } from '../store.js';
import { toast } from '../components/toast.js';

export async function renderSettings({ container }) {
  const user = store.getUser();

  container.innerHTML = `
    <div class="page-header">
      <h2>设置</h2>
      <p>管理你的账号信息</p>
    </div>

    <!-- 个人信息 -->
    <div class="card mb-6">
      <div class="card-header">
        <h3>个人信息</h3>
      </div>
      <form id="profile-form">
        <div class="form-group">
          <label class="form-label">用户名</label>
          <input type="text" class="form-input" id="set-username" value="${user?.username || ''}" disabled>
          <div class="form-hint">用户名不可修改</div>
        </div>
        <div class="form-group">
          <label class="form-label">邮箱</label>
          <input type="email" class="form-input" id="set-email" value="${user?.email || ''}" placeholder="绑定邮箱">
        </div>
        <div class="form-group">
          <label class="form-label">QQ</label>
          <input type="text" class="form-input" id="set-qq" value="${user?.qq || ''}" placeholder="绑定QQ">
        </div>
        <button type="submit" class="btn btn-primary">保存修改</button>
      </form>
    </div>

    <!-- 修改密码 -->
    <div class="card mb-6">
      <div class="card-header">
        <h3>修改密码</h3>
      </div>
      <form id="password-form">
        <div class="form-group">
          <label class="form-label">当前密码</label>
          <input type="password" class="form-input" id="set-old-pw" placeholder="输入当前密码" required>
        </div>
        <div class="form-group">
          <label class="form-label">新密码</label>
          <input type="password" class="form-input" id="set-new-pw" placeholder="至少6位" required>
        </div>
        <div class="form-group">
          <label class="form-label">确认新密码</label>
          <input type="password" class="form-input" id="set-new-pw2" placeholder="再次输入新密码" required>
        </div>
        <button type="submit" class="btn btn-primary">修改密码</button>
      </form>
    </div>

    <!-- API Token -->
    <div class="card mb-6">
      <div class="card-header">
        <h3>API Token <span style="font-size:var(--text-xs);color:var(--text-tertiary);font-weight:normal;">（用于 Tampermonkey 脚本连接工单系统）</span></h3>
      </div>
      <div id="token-section">
        <p style="font-size:var(--text-xs);color:var(--text-secondary);margin-bottom:var(--space-3);">
          Token 是脚本连接工单系统的凭证。在游戏中安装 Tampermonkey 皮肤脚本后，需要在此获取 Token 并在脚本中配置。
        </p>
        <div style="display:flex;gap:var(--space-2);align-items:center;flex-wrap:wrap;">
          <input type="text" class="form-input font-mono" id="api-token-display" readonly
                 style="flex:1;min-width:200px;background:var(--bg-base);cursor:text;font-size:var(--text-xs);"
                 value="加载中...">
          <button class="btn btn-primary btn-sm" id="token-copy-btn">复制</button>
          <button class="btn btn-ghost btn-sm" id="token-regenerate-btn">重新生成</button>
        </div>
        <div id="token-msg" style="margin-top:var(--space-2);font-size:var(--text-xs);"></div>

        <details style="margin-top:var(--space-4);">
          <summary style="font-size:var(--text-sm);color:var(--accent-blue);cursor:pointer;font-weight:var(--font-semibold);">
            📖 如何在 Tampermonkey 脚本中使用 Token
          </summary>
          <div style="margin-top:var(--space-3);background:var(--bg-card);border-radius:var(--radius-md);padding:var(--space-4);font-size:var(--text-xs);color:var(--text-secondary);line-height:1.8;">
            <ol style="padding-left:var(--space-4);">
              <li>在浏览器安装 <strong>Tampermonkey</strong> 扩展（<a href="https://www.tampermonkey.net/" target="_blank" style="color:var(--accent-blue);">官网下载</a>）</li>
              <li>下载皮肤脚本：
                <a href="/docs/ider_skin_full.user.js" target="_blank" style="color:var(--accent-blue);display:inline-block;margin:var(--space-1) 0;">
                  ⬇️ ider_skin_full.user.js
                </a>
              </li>
              <li>安装脚本后，进入游戏页面，点击右下角 🎨 按钮打开皮肤面板</li>
              <li>点击 ⚙ 按钮打开设置，在 Token 输入框中粘贴上方复制的 Token</li>
              <li>点击「保存」即可自动同步你在工单系统选择的皮肤</li>
            </ol>

            <div style="margin-top:var(--space-3);padding:var(--space-3);background:rgba(212,168,68,0.1);border-radius:var(--radius-sm);border:1px solid rgba(212,168,68,0.2);">
              <strong style="color:var(--accent-amber);">💡 提示</strong>
              <ul style="margin-top:var(--space-1);padding-left:var(--space-4);">
                <li>Token 有效期 7 天，到期后需要重新登录获取</li>
                <li>「重新生成」会使旧 Token 立即失效，脚本需要更新配置</li>
                <li>如果 Token 泄露，请立即「重新生成」</li>
              </ul>
            </div>
          </div>
        </details>
      </div>
    </div>

    <!-- 兑换码 -->
    <div class="card mb-6">
      <div class="card-header">
        <h3>兑换码</h3>
      </div>
      <div class="flex items-center gap-3">
        <input type="text" class="form-input" id="redeem-code" placeholder="输入兑换码" style="max-width:300px;">
        <button class="btn btn-primary btn-sm" id="redeem-btn">兑换</button>
      </div>
    </div>

    <!-- 账号信息 -->
    <div class="card">
      <div class="card-header">
        <h3>账号信息</h3>
      </div>
      <div style="display:grid;grid-template-columns:120px 1fr;gap:var(--space-2) var(--space-4);font-size:var(--text-sm);">
        <span class="text-muted">用户ID</span><span class="font-mono">${user?.id || '-'}</span>
        <span class="text-muted">等级</span><span>Lv.${user?.level || 1}</span>
        <span class="text-muted">经验值</span><span>${user?.xp || 0}</span>
        <span class="text-muted">邀请码</span><span class="font-mono">${user?.invite_code || '-'}</span>
        <span class="text-muted">注册时间</span><span>${user?.created_at ? new Date(user.created_at).toLocaleDateString('zh-CN') : '-'}</span>
        <span class="text-muted">管理员</span><span>${user?.is_admin === 1 ? '是' : '否'}</span>
      </div>
    </div>`;

  // 保存个人信息
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const data = {};
      const email = document.getElementById('set-email').value.trim();
      const qq = document.getElementById('set-qq').value.trim();
      if (email) data.email = email;
      if (qq) data.qq = qq;

      await api.updateProfile(data);
      // 刷新用户信息
      const info = await api.getUserInfo();
      store.saveUserToStorage(info.user || info, api.getToken());
      toast.success('保存成功');
    } catch (err) {
      toast.error(err.message || '保存失败');
    }
  });

  // 修改密码
  document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const old_pw = document.getElementById('set-old-pw').value;
    const new_pw = document.getElementById('set-new-pw').value;
    const new_pw2 = document.getElementById('set-new-pw2').value;

    if (new_pw !== new_pw2) {
      toast.error('两次密码不一致');
      return;
    }
    if (new_pw.length < 6) {
      toast.error('密码至少6位');
      return;
    }

    try {
      await api.changePassword(old_pw, new_pw);
      toast.success('密码修改成功');
      document.getElementById('set-old-pw').value = '';
      document.getElementById('set-new-pw').value = '';
      document.getElementById('set-new-pw2').value = '';
    } catch (err) {
      toast.error(err.message || '修改失败');
    }
  });

  // Token 显示
  async function loadToken() {
    try {
      const res = await api.getTokenInfo();
      const input = document.getElementById('api-token-display');
      if (input) {
        input.value = res.token || '获取失败';
        input.title = res.token || '';
      }
    } catch {
      const input = document.getElementById('api-token-display');
      if (input) input.value = '获取失败，请刷新页面';
    }
  }
  loadToken();

  // 复制 Token
  document.getElementById('token-copy-btn')?.addEventListener('click', () => {
    const input = document.getElementById('api-token-display');
    if (!input || !input.value || input.value === '加载中...' || input.value === '获取失败，请刷新页面') {
      toast.error('Token 未加载完成');
      return;
    }
    navigator.clipboard.writeText(input.value).then(() => {
      toast.success('已复制到剪贴板');
    }).catch(() => {
      input.select();
      document.execCommand('copy');
      toast.success('已复制到剪贴板');
    });
  });

  // 重新生成 Token
  document.getElementById('token-regenerate-btn')?.addEventListener('click', async () => {
    if (!confirm('重新生成 Token 会使旧 Token 立即失效，正在使用旧 Token 的脚本将无法连接。确定继续？')) return;
    const btn = document.getElementById('token-regenerate-btn');
    btn.disabled = true;
    btn.textContent = '生成中...';
    try {
      const res = await api.regenerateToken();
      const msgEl = document.getElementById('token-msg');
      if (msgEl) {
        msgEl.textContent = '✅ ' + (res.message || 'Token 已重新生成');
        msgEl.style.color = 'var(--accent-green)';
      }
      const input = document.getElementById('api-token-display');
      if (input) {
        input.value = res.token;
        input.title = res.token;
      }
      api.setToken(res.token);
      store.saveUserToStorage(store.getUser(), res.token);
      toast.success('Token 已重新生成');
    } catch (err) {
      toast.error(err.message || '生成失败');
      const msgEl = document.getElementById('token-msg');
      if (msgEl) {
        msgEl.textContent = '❌ ' + (err.message || '生成失败');
        msgEl.style.color = 'var(--accent-red)';
      }
    } finally {
      btn.disabled = false;
      btn.textContent = '重新生成';
    }
  });

  // 兑换码
  document.getElementById('redeem-btn').addEventListener('click', async () => {
    const code = document.getElementById('redeem-code').value.trim();
    if (!code) {
      toast.error('请输入兑换码');
      return;
    }
    try {
      const res = await api.redeemCode(code);
      toast.success(res.message || '兑换成功');
      document.getElementById('redeem-code').value = '';
      // 刷新用户信息
      const info = await api.getUserInfo();
      store.saveUserToStorage(info.user || info, api.getToken());
    } catch (err) {
      toast.error(err.message || '兑换失败');
    }
  });
}
