// pages/admin-skins.js — 管理后台 - 皮肤管理
import { api } from '../api.js';
import { toast } from '../components/toast.js';
import { modal } from '../components/modal.js';

export async function renderAdminSkins({ container }) {
  container.innerHTML = `
    <div class="page-header">
      <div class="flex justify-between items-center">
        <div>
          <h2>皮肤管理</h2>
          <p>管理皮肤主题和激活码</p>
        </div>
        <button class="btn btn-primary" id="new-skin-btn">+ 创建皮肤</button>
      </div>
    </div>
    <div id="skins-list"><div class="loading"><div class="spinner"></div></div></div>`;

  container.querySelector('#new-skin-btn').addEventListener('click', showNewSkinModal);
  loadSkins(container);
}

async function loadSkins(container) {
  const el = container.querySelector('#skins-list');
  if (!el) return;
  try {
    const res = await api.adminGetSkins();
    const skins = res.skins || [];

    if (!skins.length) {
      el.innerHTML = `<div class="empty-state"><p>暂无皮肤</p></div>`;
      return;
    }

    el.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>排序</th><th>标识</th><th>名称</th><th>价格</th><th>拥有数</th><th>激活码</th><th>已用</th><th>状态</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${skins.map(s => `
              <tr>
                <td>${s.sort_order}</td>
                <td class="font-mono font-semibold">${s.key}</td>
                <td>${s.label}</td>
                <td>¥${s.price}</td>
                <td>${s.owned_count || 0}</td>
                <td>${s.code_count || 0}</td>
                <td>${s.used_code_count || 0}</td>
                <td><span class="badge ${s.is_active ? 'badge-approved' : 'badge-rejected'}">${s.is_active ? '启用' : '停用'}</span></td>
                <td>
                  <div style="display:flex;gap:var(--space-1);flex-wrap:wrap;">
                    <button class="btn btn-ghost btn-sm" data-edit-skin="${s.id}">编辑</button>
                    <button class="btn btn-ghost btn-sm" data-codes-skin="${s.id}" data-skin-name="${s.label}">生成码</button>
                    <button class="btn btn-ghost btn-sm" style="color:var(--accent-red)" data-delete-skin="${s.id}">删除</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;

    el.querySelectorAll('[data-edit-skin]').forEach(btn => {
      btn.addEventListener('click', () => {
        const skin = skins.find(x => x.id == btn.dataset.editSkin);
        if (skin) showEditSkinModal(skin, container);
      });
    });

    el.querySelectorAll('[data-codes-skin]').forEach(btn => {
      btn.addEventListener('click', () => {
        showGenerateCodesModal(parseInt(btn.dataset.codesSkin), btn.dataset.skinName, container);
      });
    });

    el.querySelectorAll('[data-delete-skin]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await modal.confirm('确认删除', '删除后关联的激活码和用户皮肤记录将一并清除，确定？');
        if (ok) {
          try {
            await api.adminDeleteSkin(btn.dataset.deleteSkin);
            toast.success('皮肤已删除');
            loadSkins(container);
          } catch (err) { toast.error(err.message); }
        }
      });
    });
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p>加载失败: ${err.message}</p></div>`;
  }
}

function showNewSkinModal() {
  const body = document.createElement('div');
  body.innerHTML = `
    <form id="new-skin-form">
      <div class="form-group">
        <label class="form-label">名称 (name)</label>
        <input type="text" class="form-input" id="skin-name" placeholder="如 金碧辉煌" required>
      </div>
      <div class="form-group">
        <label class="form-label">标识 (key)</label>
        <input type="text" class="form-input" id="skin-key" placeholder="如 golden" required>
        <p class="form-hint">英文字母标识，用于URL和CSS引用</p>
      </div>
      <div class="form-group">
        <label class="form-label">显示名称 (label)</label>
        <input type="text" class="form-input" id="skin-label" placeholder="如 金碧辉煌" required>
      </div>
      <div class="form-group">
        <label class="form-label">描述</label>
        <textarea class="form-textarea" id="skin-desc" placeholder="皮肤描述"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">价格 (元)</label>
        <input type="number" class="form-input" id="skin-price" value="0" min="0" step="0.01">
      </div>
      <div class="form-group">
        <label class="form-label">排序</label>
        <input type="number" class="form-input" id="skin-sort" value="0">
      </div>
    </form>`;

  modal.open({
    title: '创建皮肤',
    body,
    confirmText: '创建',
    onConfirm: handleSkinFormSubmit,
  });
}

function showEditSkinModal(skin, container) {
  const body = document.createElement('div');
  body.innerHTML = `
    <form id="edit-skin-form">
      <div class="form-group">
        <label class="form-label">名称 (name)</label>
        <input type="text" class="form-input" id="skin-name" value="${skin.name || ''}" required>
      </div>
      <div class="form-group">
        <label class="form-label">标识 (key)</label>
        <input type="text" class="form-input" id="skin-key" value="${skin.key}" required>
      </div>
      <div class="form-group">
        <label class="form-label">显示名称 (label)</label>
        <input type="text" class="form-input" id="skin-label" value="${skin.label}" required>
      </div>
      <div class="form-group">
        <label class="form-label">描述</label>
        <textarea class="form-textarea" id="skin-desc">${skin.description || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">价格 (元)</label>
        <input type="number" class="form-input" id="skin-price" value="${skin.price}" min="0" step="0.01">
      </div>
      <div class="form-group">
        <label class="form-label">排序</label>
        <input type="number" class="form-input" id="skin-sort" value="${skin.sort_order}">
      </div>
      <div class="form-group">
        <label class="form-label">
          <input type="checkbox" id="skin-active" ${skin.is_active ? 'checked' : ''}> 启用
        </label>
      </div>
    </form>`;

  modal.open({
    title: '编辑皮肤',
    body,
    confirmText: '保存',
    onConfirm: async () => {
      const data = {
        name: document.getElementById('skin-name').value.trim(),
        key: document.getElementById('skin-key').value.trim(),
        label: document.getElementById('skin-label').value.trim(),
        description: document.getElementById('skin-desc').value.trim(),
        price: parseFloat(document.getElementById('skin-price').value) || 0,
        sort_order: parseInt(document.getElementById('skin-sort').value) || 0,
        is_active: document.getElementById('skin-active').checked ? 1 : 0,
      };
      if (!data.name || !data.key || !data.label) {
        toast.error('请填写完整信息');
        return;
      }
      try {
        await api.adminUpdateSkin(skin.id, data);
        toast.success('皮肤已更新');
        modal.close();
        loadSkins(container);
      } catch (err) { toast.error(err.message || '更新失败'); }
    },
  });
}

function handleSkinFormSubmit() {
  const data = {
    name: document.getElementById('skin-name').value.trim(),
    key: document.getElementById('skin-key').value.trim().toLowerCase(),
    label: document.getElementById('skin-label').value.trim(),
    description: document.getElementById('skin-desc').value.trim(),
    price: parseFloat(document.getElementById('skin-price').value) || 0,
    sort_order: parseInt(document.getElementById('skin-sort').value) || 0,
  };
  if (!data.name || !data.key || !data.label) {
    toast.error('请填写完整信息');
    return;
  }
  api.adminCreateSkin(data).then(res => {
    toast.success('皮肤已创建');
    modal.close();
    loadSkins(document.querySelector('#app-content'));
  }).catch(err => toast.error(err.message || '创建失败'));
}

function showGenerateCodesModal(skinId, skinName, container) {
  const body = document.createElement('div');
  body.innerHTML = `
    <form id="codes-form">
      <p style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-4);">为「${skinName}」生成激活码</p>
      <div class="form-group">
        <label class="form-label">生成数量</label>
        <input type="number" class="form-input" id="codes-count" value="10" min="1" max="100">
      </div>
      <div class="form-group">
        <label class="form-label">过期时间（选填）</label>
        <input type="datetime-local" class="form-input" id="codes-expires">
      </div>
    </form>
    <div id="codes-result" style="margin-top:var(--space-3);"></div>`;

  modal.open({
    title: '生成激活码',
    body,
    confirmText: '生成',
    onConfirm: async () => {
      const count = parseInt(document.getElementById('codes-count').value) || 1;
      const expires_at = document.getElementById('codes-expires').value || null;
      try {
        const res = await api.adminGenerateCodes(skinId, count, expires_at);
        const resultEl = document.getElementById('codes-result');
        if (res.codes && res.codes.length) {
          resultEl.innerHTML = `
            <p style="color:var(--accent-green);font-size:var(--text-sm);margin-bottom:var(--space-2);">${res.message}</p>
            <textarea class="form-textarea" style="font-family:var(--font-mono);font-size:var(--text-xs);" readonly rows="${Math.min(res.codes.length, 10)}">${res.codes.join('\n')}</textarea>
            <button class="btn btn-sm btn-secondary mt-2" onclick="navigator.clipboard.writeText('${res.codes.join('\n')}')">复制全部</button>`;
        } else {
          resultEl.innerHTML = `<p style="color:var(--accent-red);font-size:var(--text-sm);">生成失败</p>`;
        }
      } catch (err) {
        toast.error(err.message);
      }
    },
  });
}
