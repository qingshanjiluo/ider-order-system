// pages/changelog.js — 修仙纪事 · 完整更新日志

const STYLES_ID = 'cl-styles';

function loadStyles() {
  if (document.getElementById(STYLES_ID)) return;
  const link = document.createElement('link');
  link.id = STYLES_ID;
  link.rel = 'stylesheet';
  link.href = '/src/css/changelog.css';
  document.head.appendChild(link);
}

const HISTORY = [
  {
    version: 'v3.5',
    date: '2026-07-26',
    badge: 'current',
    changes: [
      { type: 'perf', text: '侧边栏分区可折叠：stopPropagation 防止误关闭，状态持久化 localStorage' },
      { type: 'perf', text: '移动端适配：rem 字体缩放到 touch-action 全面优化' },
      { type: 'perf', text: '非关键 JS 延后加载：聊天机器人 requestIdleCallback 执行' },
      { type: 'perf', text: 'localStorage 全部 try/catch 包裹，读写失败静默降级' },
      { type: 'feat', text: '修仙聊天室上线：文字聊天/3秒轮询/彩色头像，道友可实时交流' },
      { type: 'fix', text: '优惠折扣未实际应用：修仙币冻结改为基于折后价，不再冻结全额' },
      { type: 'fix', text: '重复退款修复：拒绝工单幂等性检查，防止 Webhook 重复调用多次退还修仙币' },
      { type: 'fix', text: '角色名冲突自动重试：创建角色冲突后加 _1/_2 后缀重试（最多10次）' },
      { type: 'fix', text: '失败账号自动重试：扫描时联查 status=failed 的账号重新注册' },
      { type: 'perf', text: '日志系统全面增强：report-account 返回 account_id + 内部自动写日志' },
      { type: 'perf', text: 'account_logs 查询优化：支持订单级日志（account_id=0 也可查询到）' },
      { type: 'perf', text: '升级日志增强：从"满级120!"改为"从Lv.X升到Lv.Y（+N级）"' },
      { type: 'perf', text: '订单预览实付价格：优惠后显示实付金额 + 原价划线 + "省X"提示' },
      { type: 'perf', text: '订单创建/审批自动写入 account_logs，全链路可追溯' },
      { type: 'fix', text: '升级超时修复：每轮账号数 50→30，减少延迟适配 1h 限制' },
      { type: 'fix', text: '经验百分比错误：next_level_exp→max_exp，修复显示 8897200%' },
      { type: 'fix', text: 'help.js inline onclick 改为 data-toggle + stopPropagation' },
    ],
  },
  {
    version: 'v3.4',
    date: '2026-07-26',
    changes: [
      { type: 'feat', text: '传人派出工单：选择地图 + 物资类别，每日自动派（1修仙币/月）' },
      { type: 'feat', text: '副本刷取工单：全地图自动战斗，每图 2 次自动推进（3修仙币/次）' },
      { type: 'feat', text: '新增 daily_dispatch.js 每日传人自动派出脚本' },
      { type: 'feat', text: '新增 dungeon_clear.js 副本自动刷取脚本' },
      { type: 'feat', text: '订阅到期自动完成：订单扫描自动识别到期工单并完结' },
      { type: 'perf', text: 'auto-levelup.yml 重写：从旧版迁移至工单系统新架构' },
      { type: 'fix', text: '升级循环修复：游戏 API 不返回 can_level_up，移除守卫直接调 level_up' },
      { type: 'fix', text: '验证假阳性修复：autoMaintain 改用 /player/state 验证防止误报' },
      { type: 'fix', text: '无角色账号跳过：autoMaintain 检测空 player 时直接返回' },
      { type: 'fix', text: '前端表单新增传人派出/副本刷取字段及动态切换' },
      { type: 'perf', text: '数据库迁移 v11：orders 表新增 dispatch_map / material_type / clear_type' },
    ],
  },
  {
    version: 'v3.3',
    date: '2026-07-24',
    changes: [
      { type: 'feat', text: '订单全局流程审计：覆盖创建 → 审批 → 绑定 → 扫码 → 报告全链路' },
      { type: 'fix', text: 'B1: username 不匹配时绑错 order_id 的问题修复' },
      { type: 'fix', text: 'B2: process-trial-test 端点缺失，新建 Worker + Pages 双端端点' },
      { type: 'fix', text: 'B3: 新订单账号数超限未检查，添加 account_count 校验' },
      { type: 'fix', text: 'B4: 试炼测试账号名未存入 game_accounts，添加无账号时的写入逻辑' },
      { type: 'fix', text: 'B5: 已审批订单未限制再次审批，添加 status 校验' },
      { type: 'fix', text: 'B6: 未绑定账号的订单扫码报错，跳过无 game_accounts 的订单' },
      { type: 'fix', text: 'B7: 一单出 120 个账号改为一单最多 10 个' },
      { type: 'fix', text: 'B8: 升级后 expPercent 未按最新 finalPlayer 重算' },
      { type: 'fix', text: 'B9: Health Check 中不必要的 forcedUp 调用移除' },
      { type: 'fix', text: 'B10: setup_status 传空字符串而非 farming，保留数据库原值' },
      { type: 'fix', text: 'B11: 重试耗尽后没有上报失败状态，registerAndSetup 末尾调 report-account' },
      { type: 'fix', text: 'B12: 账号密码修改后同步到 game_accounts' },
    ],
  },
  {
    version: 'v3.2',
    date: '2026-07-22',
    changes: [
      { type: 'feat', text: '新用户注册赠送 10 修仙币免费试用额度' },
      { type: 'feat', text: '管理后台可配置免费试用开关和额度' },
      { type: 'feat', text: '新增提现审核系统：管理员审核/拒绝，拒绝自动退还积分' },
      { type: 'feat', text: '系统配置新增「积分提现」开关' },
      { type: 'feat', text: '新增个人修仙等级页面，展示境界路线图与进度' },
      { type: 'feat', text: '新增更新日志页面与站点信息页面' },
      { type: 'fix', text: '账号详情页状态/等级/订单号显示 undefined 的问题' },
      { type: 'fix', text: '申诉页面缺少标题输入框的问题' },
      { type: 'fix', text: '账号详情页新增详细信息卡片（服务器、境界、地图等）' },
    ],
  },
  {
    version: 'v3.1',
    date: '2026-07-20',
    changes: [
      { type: 'fix', text: '数据统计页面数据不显示的问题' },
      { type: 'fix', text: '控制台统计数据解包错误' },
      { type: 'feat', text: '多用途优惠券码支持' },
      { type: 'feat', text: '修仙币充值功能上线' },
      { type: 'feat', text: '修仙坊市（黑市交易）上线' },
    ],
  },
  {
    version: 'v3.0',
    date: '2026-07-15',
    changes: [
      { type: 'feat', text: '全新 SPA 前端：赛博朋克 × 修仙风格 UI' },
      { type: 'feat', text: '邀请返利系统上线' },
      { type: 'feat', text: '排行榜功能' },
      { type: 'feat', text: 'AI 客服机器人' },
      { type: 'feat', text: '兑换码系统' },
      { type: 'feat', text: '售后服务系统' },
      { type: 'feat', text: '管理员后台：用户/工单/账号/配置/公告管理' },
    ],
  },
  {
    version: 'v2.0',
    date: '2026-06-01',
    changes: [
      { type: 'feat', text: '工单系统核心功能上线：创建/审批/执行/完成全流程' },
      { type: 'feat', text: '用户注册/登录系统' },
      { type: 'feat', text: 'D1 数据库 + Cloudflare Workers + Pages 部署' },
      { type: 'feat', text: 'GH Actions 自动扫码和执行脚本' },
    ],
  },
  {
    version: 'v1.0',
    date: '2026-04-15',
    changes: [
      { type: 'feat', text: '批量注册工具第一版' },
      { type: 'feat', text: '自动化挂机脚本基础框架' },
      { type: 'feat', text: '多账号批量管理功能' },
    ],
  },
];

export async function renderChangelog({ container }) {
  loadStyles();

  const stats = {
    versions: HISTORY.length,
    changes: HISTORY.reduce((sum, r) => sum + r.changes.length, 0),
    features: HISTORY.reduce((sum, r) => sum + r.changes.filter(c => c.type === 'feat').length, 0),
  };

  const html = `
    <div class="cl-page">
      <div class="cl-stars"></div>
      <div class="cl-glow-top"></div>

      <div class="cl-hero">
        <div class="cl-hero-subtitle">Changelog · 修仙纪事</div>
        <h1 class="cl-hero-title">天<wbr>穹<wbr>星<wbr>轨</h1>
        <p class="cl-hero-desc">每一行代码都是一次突破，每一次更新都是一场渡劫。</p>
        <div class="cl-hero-glow"></div>
      </div>

      <div class="cl-stats">
        <div class="cl-stat">
          <div class="cl-stat-num">${stats.versions}</div>
          <div class="cl-stat-label">大版本</div>
        </div>
        <div class="cl-stat">
          <div class="cl-stat-num">${stats.changes}</div>
          <div class="cl-stat-label">变更项</div>
        </div>
        <div class="cl-stat">
          <div class="cl-stat-num">${stats.features}</div>
          <div class="cl-stat-label">新功能</div>
        </div>
      </div>

      <div class="cl-timeline" id="cl-timeline">
        ${HISTORY.map((release, ri) => {
          const badgeClass = release.badge === 'current' ? 'current' : `v${release.version.charAt(1)}`;
          return `
            <div class="cl-release" data-index="${ri}">
              <div class="cl-release-connector"></div>
              <div class="cl-release-inner">
                <div class="cl-release-card">
                  <div class="cl-release-header">
                    <span class="cl-version-badge ${badgeClass}">${release.badge === 'current' ? '✦ ' : ''}${release.version}</span>
                    <span class="cl-release-date">${release.date}</span>
                  </div>
                  <div class="cl-release-body">
                    ${release.changes.map(c => `
                      <div class="cl-change-item">
                        <span class="cl-change-tag ${c.type}">${c.type === 'feat' ? '新增' : c.type === 'fix' ? '修复' : '优化'}</span>
                        <span class="cl-change-text">${c.text}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="cl-footer">
        <div class="cl-footer-divider"></div>
        <div class="cl-footer-text">道阻且长，行则将至</div>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // ── 滚动触发的入场动画 ──
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -40px 0px',
  });

  const releases = document.querySelectorAll('.cl-release');
  releases.forEach((el, i) => {
    el.style.transitionDelay = `${i * 120}ms`;
    observer.observe(el);
  });

  // ── 滚动时触发计数动画 ──
  const statEls = document.querySelectorAll('.cl-stat-num');
  let counted = false;
  const countObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !counted) {
        counted = true;
        statEls.forEach(el => {
          const target = parseInt(el.textContent);
          animateNumber(el, target);
        });
        countObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  if (statEls.length) countObserver.observe(statEls[0].closest('.cl-stats'));

  function animateNumber(el, target) {
    const duration = 1200;
    const start = performance.now();
    function frame(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ── 返回按钮 ──
  if (!document.querySelector('.cl-back-btn')) {
    const backBtn = document.createElement('button');
    backBtn.className = 'cl-back-btn';
    backBtn.innerHTML = '← 返回';
    backBtn.style.cssText = `
      position:fixed;top:24px;left:24px;z-index:10;
      background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);
      color:rgba(255,255,255,0.4);padding:8px 16px;border-radius:8px;
      font-size:13px;cursor:pointer;font-family:inherit;
      backdrop-filter:blur(8px);transition:all 0.3s ease;
    `;
    backBtn.addEventListener('mouseenter', () => {
      backBtn.style.background = 'rgba(255,255,255,0.08)';
      backBtn.style.color = 'rgba(255,255,255,0.7)';
    });
    backBtn.addEventListener('mouseleave', () => {
      backBtn.style.background = 'rgba(255,255,255,0.04)';
      backBtn.style.color = 'rgba(255,255,255,0.4)';
    });
    backBtn.addEventListener('click', () => window.history.back());
    container.querySelector('.cl-page').appendChild(backBtn);
  }

  const titleEl = container.querySelector('.cl-hero-title');
  if (titleEl) {
    titleEl.style.opacity = '0';
    titleEl.style.transform = 'translateY(20px)';
    requestAnimationFrame(() => {
      titleEl.style.transition = 'all 1.2s cubic-bezier(0.16,1,0.3,1)';
      titleEl.style.opacity = '1';
      titleEl.style.transform = 'translateY(0)';
    });
  }

  const subtitleEl = container.querySelector('.cl-hero-subtitle');
  if (subtitleEl) {
    subtitleEl.style.opacity = '0';
    requestAnimationFrame(() => {
      subtitleEl.style.transition = 'opacity 0.8s ease 0.3s';
      subtitleEl.style.opacity = '1';
    });
  }

  const descEl = container.querySelector('.cl-hero-desc');
  if (descEl) {
    descEl.style.opacity = '0';
    requestAnimationFrame(() => {
      descEl.style.transition = 'opacity 0.8s ease 0.5s';
      descEl.style.opacity = '1';
    });
  }
}
