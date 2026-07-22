// pages/changelog.js — 更新日志

export async function renderChangelog({ container }) {
  const changelog = [
    {
      version: 'v3.2',
      date: '2026-07-22',
      changes: [
        { type: 'fix', text: '修复账号详情页状态/等级/订单号显示 undefined 的问题' },
        { type: 'feat', text: '新增提现审核系统：管理员可审核/拒绝提现申请，拒绝自动退还积分' },
        { type: 'feat', text: '新增系统配置「积分提现」开关，管理员可控制提现功能是否可见' },
        { type: 'feat', text: '新增个人等级页面，展示修仙等级路线图和进度' },
        { type: 'feat', text: '新增更新日志页面' },
        { type: 'feat', text: '新增站点信息页面' },
        { type: 'fix', text: '修复申诉页面缺少标题输入框的问题' },
        { type: 'fix', text: '账号详情页新增详细信息卡片（服务器、境界、地图等）' },
      ],
    },
    {
      version: 'v3.1',
      date: '2026-07-20',
      changes: [
        { type: 'fix', text: '修复数据统计页面数据不显示的问题' },
        { type: 'fix', text: '修复控制台统计数据解包错误' },
        { type: 'feat', text: '新增多用优惠券码支持' },
        { type: 'feat', text: '新增修仙币充值功能' },
        { type: 'feat', text: '新增修仙坊市（黑市交易）' },
      ],
    },
    {
      version: 'v3.0',
      date: '2026-07-15',
      changes: [
        { type: 'feat', text: '全新 SPA 前端，赛博朋克修仙风格 UI' },
        { type: 'feat', text: '邀请返利系统上线' },
        { type: 'feat', text: '排行榜功能' },
        { type: 'feat', text: 'AI 客服机器人' },
        { type: 'feat', text: '兑换码系统' },
        { type: 'feat', text: '售后服务' },
        { type: 'feat', text: '管理员后台（用户/工单/账号/配置管理）' },
      ],
    },
    {
      version: 'v2.0',
      date: '2026-06-01',
      changes: [
        { type: 'feat', text: '工单系统核心功能上线' },
        { type: 'feat', text: '用户注册/登录系统' },
        { type: 'feat', text: 'D1 数据库 + Cloudflare Pages 部署' },
      ],
    },
  ];

  const TYPE_MAP = {
    feat: { label: '新功能', class: 'badge-approved' },
    fix: { label: '修复', class: 'badge-completed' },
    perf: { label: '优化', class: 'badge-pending' },
  };

  container.innerHTML = `
    <div class="page-header">
      <h2>更新日志</h2>
      <p>平台版本更新记录</p>
    </div>

    <div class="card">
      ${changelog.map(release => `
        <div style="padding:var(--space-6);border-bottom:1px solid var(--border-light);">
          <div class="flex justify-between items-center mb-4">
            <div>
              <span class="badge badge-approved" style="font-size:14px;padding:4px 12px;">${release.version}</span>
              <span class="text-sm text-muted" style="margin-left:var(--space-2);">${release.date}</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:var(--space-2);">
            ${release.changes.map(c => {
              const t = TYPE_MAP[c.type] || { label: c.type, class: '' };
              return `
                <div class="flex items-center gap-2" style="padding:var(--space-1) 0;">
                  <span class="badge ${t.class}" style="font-size:11px;min-width:48px;text-align:center;">${t.label}</span>
                  <span class="text-sm">${c.text}</span>
                </div>`;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>`;
}
