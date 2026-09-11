# 艾德尔修仙传 - 批量自动化工具集

## 工具列表

| 工具 | 文件 | 功能 |
|------|------|------|
| 📧 邮箱绑定 | `batch_email_bind_ci.js` | 登录 → 创建临时邮箱 → 收验证码 → 绑定 |
| 🏯 仙盟日常 | `batch_alliance_daily.js` | 登录 → 沐浴 → 采摘 → 悟道 → 洞府采集 |
| ⚔️ 自动刷怪 | `auto_farm.js` | 登录 → 切换地图 → 自动战斗刷怪 |
| 🔬 自动炼丹 | `auto_alchemy.js` | 登录 → 采集材料 → 炼制丹药 → 升级突破 |
| 📝 批量注册 | `batch.js` | 批量创建账号 → 创角 → 绑邀请码 |
| 📬 邮件领取 | `mail_claim_and_use.js` | 领取邮件附件并自动使用筑基丹 |
| 🛡️ 反检测核心 | `_anti_detect_shared.js` | IP伪装/指纹轮换/随机延迟/智能分段 |

## GitHub Actions 一键运行

所有工具均有对应工作流（`.github/workflows/`），支持：

- **手动触发** — 仓库 → Actions → 选择工具 → Run workflow
- **定时执行** — 每日自动运行（仙盟日常, 刷怪, 炼丹等）
- **三种账号输入** — 仓库文件 / 面板填写 / Secrets

### 邮箱绑定

```yaml
# 账号格式（分号分隔）
user1,pass1;user2,pass2
```

| 参数 | 说明 | 默认 |
|------|------|------|
| `accounts` | 账号列表 | 读取文件 |
| `accounts_file` | 仓库文件路径 | - |
| `provider` | 邮箱商: mail_tm / tempy_email / all | mail_tm |
| `delay_seconds` | 账号间隔 | 10 |
| `poll_timeout` | 验证码等待超时 | 120 |

### 仙盟日常 + 洞府采集

| 参数 | 说明 | 默认 |
|------|------|------|
| `cave_type` | 采集: field(灵田) / mine(灵矿) | field |
| `alliance_name` | 目标仙盟名称 | 天地一家大爱盟 |
| `auto_join_alliance` | 自动加仙盟 | true |

## 防封号机制

所有工具集成 `_anti_detect_shared.js`：

- **独立IP** — 31段真实中国运营商IP池（电信/联通/移动）
- **指纹轮换** — 12种浏览器UA + Sec-CH-UA + Accept-Language
- **machine_id** — 6种格式随机生成
- **CDN伪装** — Via/X-Cache/CDN节点模拟
- **智能分段** — 每3-5个账号暂停25-60秒
- **随机延迟** — 操作间1-3秒，账号间3-13秒

## 本地运行

```bash
cd 批量注册工具
npm install

# CI模式（自动执行）
CI=true ACCOUNTS="user1,pass1;user2,pass2" node batch_email_bind_ci.js
CI=true CAVE_TYPE=field node batch_alliance_daily.js

# 交互模式（手动选择账号范围）
node batch_alliance_daily.js
node auto_farm.js
```

## 账号文件格式

`accounts_email.txt` 或 `accounts.txt`:

```
username1,password1
username2,password2
```

支持 `#` 注释行。文件可放在 `批量注册工具/` 目录或仓库根目录。
