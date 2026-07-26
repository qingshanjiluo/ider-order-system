import { api } from '../api.js';
import { toast } from '../components/toast.js';

let _pollTimer = null;
let _isLoading = false;
let _lastUpdate = null;

function fmtDate(d) {
  if (!d) return '-';
  const dt = typeof d === 'string' ? d.replace(' ', 'T') : d;
  const date = new Date(dt);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleString('zh-CN', { hour12: false });
}

function timeAgo(d) {
  if (!d) return '';
  const dt = typeof d === 'string' ? d.replace(' ', 'T') : d;
  const diff = Date.now() - new Date(dt).getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  return Math.floor(diff / 3600000) + '小时前';
}

const STATUS_MAP = {
  creating: { label: '注册中', class: 'badge-pending' },
  farming: { label: '挂机中', class: 'badge-approved' },
  completed: { label: '已完成', class: 'badge-completed' },
  error: { label: '异常', class: 'badge-rejected' },
  banned: { label: '封禁', class: 'badge-rejected' },
  failed: { label: '失败', class: 'badge-rejected' },
};

const SETUP_MAP = {
  pending: { label: '待Setup', class: 'badge-pending' },
  creating: { label: '创建中', class: 'badge-pending' },
  running: { label: '进行中', class: 'badge-approved' },
  skills: { label: '技能', class: 'badge-approved' },
  iron_sword: { label: '铁剑', class: 'badge-approved' },
  technique: { label: '功法', class: 'badge-approved' },
  map: { label: '地图', class: 'badge-approved' },
  battle: { label: '战斗', class: 'badge-approved' },
  done: { label: '已完成', class: 'badge-completed' },
  error: { label: '异常', class: 'badge-rejected' },
};

export async function renderAdminAccounts({ container }) {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }

  container.innerHTML = `
    <div class="page-header">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div>
          <h2>账号管理</h2>
          <p>所有账号实时状态</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="text-xs text-muted" id="admin-account-refresh-time"></span>
          <button class="btn btn-sm btn-ghost" id="admin-account-refresh-btn" title="手动刷新">
            <span id="admin-refresh-icon">↻</span>
          </button>
          <label class="text-xs text-muted" style="display:flex;align-items:center;gap:4px;cursor:pointer;">
            <input type="checkbox" id="admin-auto-refresh" checked> 自动刷新
          </label>
        </div>
      </div>
    </div>
    <div class="filter-bar">
      <select class="form-select" id="admin-account-status">
        <option value="">全部状态</option>
        <option value="creating">注册中</option>
        <option value="farming">挂机中</option>
        <option value="completed">已完成</option>
        <option value="error">异常</option>
        <option value="banned">封禁</option>
        <option value="failed">失败</option>
      </select>
      <select class="form-select" id="admin-account-setup">
        <option value="">全部Setup</option>
        <option value="pending">待Setup</option>
        <option value="creating">创建中</option>
        <option value="running">进行中</option>
        <option value="done">已完成</option>
        <option value="error">异常</option>
      </select>
    </div>
    <div id="admin-accounts-list">
      <div class="loading"><div class="spinner"></div></div>
    </div>`;

  document.getElementById('admin-account-status').addEventListener('change', () => loadAccounts());
  document.getElementById('admin-account-setup').addEventListener('change', () => loadAccounts());
  document.getElementById('admin-account-refresh-btn').addEventListener('click', () => loadAccounts());
  document.getElementById('admin-auto-refresh').addEventListener('change', (e) => {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    if (e.target.checked) startPoll();
  });

  await loadAccounts();
  startPoll();
}

function startPoll() {
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(() => {
    if (_isLoading) return;
    const cb = document.getElementById('admin-auto-refresh');
    if (cb && !cb.checked) return;
    loadAccounts();
  }, 15000);
}

async function loadAccounts() {
  if (_isLoading) return;
  _isLoading = true;

  const btn = document.getElementById('admin-account-refresh-btn');
  const icon = document.getElementById('admin-refresh-icon');
  if (btn) btn.disabled = true;
  if (icon) icon.style.display = 'inline-block';

  const el = document.getElementById('admin-accounts-list');
  if (!el) { _isLoading = false; return; }
  const isFirstLoad = el.querySelector('.loading') !== null;

  try {
    const res = await api.adminGetAccounts();
    let accounts = res.accounts || res || [];

    const statusFilter = document.getElementById('admin-account-status')?.value || '';
    const setupFilter = document.getElementById('admin-account-setup')?.value || '';
    if (statusFilter) accounts = accounts.filter(a => a.status === statusFilter);
    if (setupFilter) accounts = accounts.filter(a => a.setup_status === setupFilter);

    _lastUpdate = new Date().toISOString();
    const rt = document.getElementById('admin-account-refresh-time');
    if (rt) rt.textContent = '更新: ' + timeAgo(_lastUpdate);

    if (!accounts.length) {
      // 只在首次或无内容时替换，避免闪烁
      if (isFirstLoad || !el.querySelector('table')) {
        el.innerHTML = `<div class="empty-state"><p>暂无账号</p></div>`;
      }
      _isLoading = false; if (btn) btn.disabled = false;
      return;
    }

    const rows = accounts.map(a => {
      const st = STATUS_MAP[a.status] || { label: a.status, class: '' };
      const setup = SETUP_MAP[a.setup_status] || { label: a.setup_status || '待Setup', class: 'badge-pending' };
      const showRetry = a.status === 'failed';
      return `
        <tr>
          <td class="font-mono text-xs">${a.id}</td>
          <td class="font-mono text-xs">${a.username || '-'}</td>
          <td class="font-semibold">${a.character_name || '-'}</td>
          <td><span class="badge ${st.class}">${st.label}</span></td>
          <td><span class="badge ${setup.class}">${setup.label}</span></td>
          <td><span title="${(a.exp != null ? a.exp.toLocaleString() : '0')}exp (${a.exp_percent || 0}%)">Lv.${a.level || '-'}</span></td>
          <td class="text-xs text-muted">${a.user_name || a.user_id || '-'}</td>
          <td class="font-mono text-xs">${a.order_id ? '#' + a.order_id : '-'}</td>
          <td class="text-xs" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${a.error_msg ? 'var(--accent-red)' : 'inherit'}">${a.error_msg || '-'}</td>
          <td class="text-sm text-muted" title="${fmtDate(a.last_check_at || a.created_at)}">${timeAgo(a.last_check_at || a.created_at) || '-'}</td>
          <td class="actions-cell">
            <div class="actions-group">
              <a href="#/accounts/${a.id}" class="btn btn-sm btn-ghost" title="查看详情">详情</a>
              ${showRetry ? `<button class="btn btn-sm btn-danger" data-rid="${a.id}" onclick="window.__retryAccount(this)">重试</button>` : ''}
            </div>
          </td>
        </tr>`;
    }).join('');

    // 无闪烁更新：保留 scrollTop
    const existingTable = el.querySelector('table');
    const scrollTop = el.scrollTop || 0;

    if (existingTable) {
      const tbody = existingTable.querySelector('tbody');
      if (tbody) tbody.innerHTML = rows;
    } else {
      el.innerHTML = `
        <div class="table-wrap" style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
          <table style="min-width:800px;">
            <thead>
              <tr>
                <th>ID</th>
                <th>游戏账号</th>
                <th>角色名</th>
                <th>状态</th>
                <th>Setup</th>
                <th>等级</th>
                <th>用户</th>
                <th>订单</th>
                <th>错误信息</th>
                <th>最后活跃</th>
                <th class="actions-th">操作</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    el.scrollTop = scrollTop;

  } catch (err) {
    if (isFirstLoad || !el.querySelector('table')) {
      el.innerHTML = `<div class="empty-state"><p>加载失败: ${err.message}</p></div>`;
    }
    toast.error('刷新失败: ' + err.message);
  }

  _isLoading = false;
  if (btn) btn.disabled = false;
}

window.__retryAccount = async function(el) {
  const accountId = el.dataset.rid;
  if (!accountId || !confirm('确定要重试这个失败账号吗？')) return;
  try {
    el.disabled = true; el.textContent = '重试中...';
    const res = await api.adminRetryAccount(accountId);
    if (res.ok) { toast.success('已提交重试，下次扫描将重新处理'); loadAccounts(); }
    else { toast.error(res.error || '重试失败'); }
  } catch (err) { toast.error('重试失败: ' + err.message); }
  finally { el.disabled = false; el.textContent = '重试'; }
};

function parseSpiritRoots(str) {
  if (!str) return null;
  try {
    const parsed = typeof str === 'string' ? JSON.parse(str) : str;
    if (parsed && typeof parsed === 'object' && ('metal' in parsed || 'wood' in parsed)) return parsed;
    return null;
  } catch { return null; }
}
