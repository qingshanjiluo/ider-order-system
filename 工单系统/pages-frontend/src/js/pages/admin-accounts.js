import { api } from '../api.js';
import { toast } from '../components/toast.js';

let _pollTimer = null;
let _isLoading = false;
let _lastUpdate = null;
let _currentPage = 1;
let _currentStatus = '';
let _totalPages = 1;

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
          <span class="text-xs text-muted" id="admin-account-total"></span>
          <button class="btn btn-sm btn-ghost" id="admin-account-refresh-btn" title="手动刷新">↻</button>
          <label class="text-xs text-muted" style="display:flex;align-items:center;gap:4px;cursor:pointer;">
            <input type="checkbox" id="admin-auto-refresh" checked> 自动刷新
          </label>
        </div>
      </div>
    </div>
    <div class="filter-bar" style="margin-bottom:8px;">
      <select class="form-select" id="admin-account-status">
        <option value="">全部状态</option>
        <option value="creating">注册中</option>
        <option value="farming">挂机中</option>
        <option value="completed">已完成</option>
        <option value="error">异常</option>
        <option value="banned">封禁</option>
        <option value="failed">失败</option>
      </select>
      <button class="btn btn-sm" style="background:var(--accent-amber);color:#fff;border:none;border-radius:var(--radius-md);padding:4px 10px;font-size:var(--text-sm);cursor:pointer;margin-left:auto;" id="btn-retry-all" title="一键重置所有失败账号为重试状态">一键重试</button>
    </div>
    <div id="admin-accounts-list">
      <div class="loading"><div class="spinner"></div></div>
    </div>
    <div id="admin-accounts-pager" style="display:flex;justify-content:center;align-items:center;gap:12px;padding:16px 0;">
      <button class="btn btn-sm btn-ghost" id="page-prev" disabled>‹ 上一页</button>
      <span class="text-sm text-muted" id="page-info">第 1 页</span>
      <button class="btn btn-sm btn-ghost" id="page-next" disabled>下一页 ›</button>
    </div>`;

  document.getElementById('admin-account-status').addEventListener('change', (e) => {
    _currentStatus = e.target.value;
    _currentPage = 1;
    loadAccounts();
  });
  document.getElementById('admin-account-refresh-btn').addEventListener('click', () => loadAccounts());
  document.getElementById('page-prev').addEventListener('click', () => {
    if (_currentPage > 1) { _currentPage--; loadAccounts(); }
  });
  document.getElementById('page-next').addEventListener('click', () => {
    if (_currentPage < _totalPages) { _currentPage++; loadAccounts(); }
  });
  document.getElementById('admin-auto-refresh').addEventListener('change', (e) => {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    if (e.target.checked) startPoll();
  });
  document.getElementById('btn-retry-all').addEventListener('click', retryAllFailed);

  await loadAccounts();
  startPoll();
}

function startPoll() {
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(() => {
    if (_isLoading) return;
    if (document.getElementById('admin-auto-refresh')?.checked) loadAccounts();
  }, 15000);
}

async function loadAccounts() {
  if (_isLoading) return;
  _isLoading = true;

  const btn = document.getElementById('admin-account-refresh-btn');
  if (btn) btn.disabled = true;

  const el = document.getElementById('admin-accounts-list');
  if (!el) { _isLoading = false; return; }
  const isFirstLoad = el.querySelector('.loading') !== null;

  try {
    const res = await api.adminGetAccounts(_currentStatus, _currentPage);
    const accounts = res.accounts || [];
    const total = res.total || accounts.length;
    _totalPages = res.totalPages || Math.ceil(total / 50);

    _lastUpdate = new Date().toISOString();
    const rt = document.getElementById('admin-account-refresh-time');
    if (rt) rt.textContent = '更新: ' + timeAgo(_lastUpdate);
    const tt = document.getElementById('admin-account-total');
    if (tt) tt.textContent = '共 ' + total + ' 条';

    // 分页按钮
    document.getElementById('page-prev').disabled = _currentPage <= 1;
    document.getElementById('page-next').disabled = _currentPage >= _totalPages;
    document.getElementById('page-info').textContent = '第 ' + _currentPage + '/' + _totalPages + ' 页';

    if (!accounts.length) {
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

    const existingTable = el.querySelector('table');
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

  } catch (err) {
    if (isFirstLoad || !el.querySelector('table')) {
      el.innerHTML = `<div class="empty-state"><p>加载失败: ${err.message}</p></div>`;
    }
    toast.error('刷新失败: ' + err.message);
  }

  _isLoading = false;
  if (btn) btn.disabled = false;
}

async function retryAllFailed() {
  if (!confirm('确定要一键重试所有失败账号吗？将重置所有失败账号为「注册中」状态。')) return;
  const btn = document.getElementById('btn-retry-all');
  try {
    btn.disabled = true; btn.textContent = '重试中...';
    const res = await api.adminRetryAllFailed();
    if (res.ok) {
      toast.success(res.message || '操作成功');
      loadAccounts();
    } else {
      toast.error(res.error || '操作失败');
    }
  } catch (err) { toast.error('操作失败: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = '一键重试'; }
}

window.__retryAccount = async function(el) {
  const accountId = el.dataset.rid;
  if (!accountId || !confirm('确定要重试这个失败账号吗？')) return;
  try {
    el.disabled = true; el.textContent = '重试中...';
    const res = await api.adminRetryAccount(accountId);
    if (res.ok) { toast.success('已提交重试'); loadAccounts(); }
    else { toast.error(res.error || '重试失败'); }
  } catch (err) { toast.error('重试失败: ' + err.message); }
  finally { el.disabled = false; el.textContent = '重试'; }
};
