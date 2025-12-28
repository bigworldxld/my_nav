# Cloudflare 平台部署完整指南

本指南将详细说明如何在 Cloudflare 平台上部署网址提交和管理系统，包括使用 Cloudflare Workers 和 KV 存储。

---

## 📋 目录

1. [准备工作](#准备工作)
2. [创建 KV Namespaces](#创建-kv-namespaces)
3. [配置 Worker](#配置-worker)
4. [部署 Worker](#部署-worker)
5. [配置 Cloudflare Pages（可选）](#配置-cloudflare-pages可选)
6. [设置环境变量](#设置环境变量)
7. [测试部署](#测试部署)
8. [常见问题](#常见问题)

---

## 🚀 准备工作

### 1. 安装 Wrangler CLI

```bash
# 使用 npm 安装
npm install -g wrangler

# 或使用 yarn
yarn global add wrangler

# 验证安装
wrangler --version
```

### 2. 登录 Cloudflare

```bash
wrangler login
```

这会打开浏览器，让你登录 Cloudflare 账号并授权 Wrangler。

### 3. 获取 Account ID

登录 Cloudflare Dashboard，在右侧边栏可以看到你的 **Account ID**，稍后会用到。

---

## 💾 创建 KV Namespaces

我们需要创建 3 个 KV Namespace 来存储不同类型的数据：

### 方法一：使用 Wrangler CLI（推荐）

```bash
# 创建存储用户提交的 KV Namespace
wrangler kv namespace create "SUBMISSIONS_KV"

# 创建存储网站列表的 KV Namespace
wrangler kv namespace create "SITES_KV"

# 创建存储管理员配置的 KV Namespace
wrangler kv namespace create "ADMIN_KV"
```

每个命令会返回类似这样的输出：
```
🌀  Creating namespace with title "SUBMISSIONS_KV"
✨  Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "SUBMISSIONS_KV", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
```

**重要**：复制每个 KV Namespace 的 `id`，稍后需要填入 `wrangler.toml`。

### 方法二：使用 Cloudflare Dashboard

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** > **KV**
3. 点击 **Create a namespace**
4. 输入名称（例如：`SUBMISSIONS_KV`）
5. 点击 **Add**
6. 复制 Namespace ID

重复以上步骤创建另外两个 KV Namespace。

---

## ⚙️ 配置 Worker

### 1. 更新 wrangler.toml

打开 `worker/wrangler.toml` 文件，将 KV Namespace ID 替换为你刚才创建的：

```toml
name = "nav-api"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "SUBMISSIONS_KV"
id = "你的_SUBMISSIONS_KV_ID"  # 替换这里

[[kv_namespaces]]
binding = "SITES_KV"
id = "你的_SITES_KV_ID"  # 替换这里

[[kv_namespaces]]
binding = "ADMIN_KV"
id = "你的_ADMIN_KV_ID"  # 替换这里
```

### 2. 设置管理员账号密码（推荐使用 Secrets）

**方法一：使用 Wrangler Secrets（推荐，更安全）**

```bash
# 设置管理员用户名（默认：admin）
wrangler secret put ADMIN_USERNAME

# 设置管理员密码（建议使用强密码）
wrangler secret put ADMIN_PASSWORD
```

执行命令后，会提示你输入值。输入完成后，这些值会被加密存储，不会出现在代码中。

**方法二：在 Cloudflare Dashboard 中设置**

1. 进入 **Workers & Pages** > 选择你的 Worker > **Settings** > **Variables**
2. 在 **Environment Variables** 中添加：
   - `ADMIN_USERNAME` = `admin`（或你想要的用户名）
   - `ADMIN_PASSWORD` = `你的强密码`

**方法三：在 wrangler.toml 中设置（仅用于开发，不推荐生产环境）**

```toml
[vars]
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "your_strong_password_here"
```

---

## 🚢 部署 Worker

### 1. 进入 Worker 目录

```bash
cd worker
```

### 2. 部署到 Cloudflare

```bash
# 部署到生产环境
wrangler deploy

# 或部署到预览环境（用于测试）
wrangler deploy --env preview
```

部署成功后，你会看到类似这样的输出：
```
✨  Success! Published nav-api (xxxx seconds)
  https://nav-api.your-subdomain.workers.dev
```

**重要**：复制这个 URL，稍后需要更新 HTML 文件中的 API 地址。

### 3. 绑定自定义域名（可选）

如果你想使用自己的域名：

1. 在 Cloudflare Dashboard 中，进入你的 Worker
2. 点击 **Triggers** > **Custom Domains**
3. 点击 **Add Custom Domain**
4. 输入你的域名（例如：`api.yourdomain.com`）
5. 保存

---

## 📄 配置 Cloudflare Pages（可选）

如果你使用 Cloudflare Pages 托管前端页面：

### 1. 部署 HTML 文件到 Pages

**方法一：通过 Git 仓库**

1. 将代码推送到 GitHub/GitLab
2. 在 Cloudflare Dashboard 中，进入 **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**
3. 选择你的仓库
4. 配置构建设置：
   - **Build command**: 留空（静态文件）
   - **Build output directory**: `/`（根目录）
5. 点击 **Save and Deploy**

**方法二：直接上传**

1. 进入 **Workers & Pages** > **Create application** > **Pages** > **Upload assets**
2. 上传你的 HTML 文件和其他静态资源
3. 点击 **Deploy**

### 2. 更新 API 地址

#### 如果使用 Cloudflare Pages + Workers（同一域名）

如果你的 Pages 和 Worker 使用同一个域名，API 路径可以使用相对路径：

- `commit.html` 中的 API：`/api/submit`（保持不变）
- `admin.html` 中的 API：`/api/admin/login`（保持不变）

#### 如果 Worker 使用独立域名

需要更新 HTML 文件中的 API 地址：

**更新 commit.html（第 373 行）：**
```javascript
url: 'https://nav-api.your-subdomain.workers.dev/api/submit',
```

**更新 admin.html（第 47 行）：**
```javascript
const API_BASE = 'https://nav-api.your-subdomain.workers.dev/api';
```

### 3. 配置路由（Pages + Workers）

如果你想在同一个域名下使用 Pages 和 Workers：

1. 在 `wrangler.toml` 中添加路由配置：

```toml
[[routes]]
pattern = "yourdomain.com/api/*"
zone_name = "yourdomain.com"
```

2. 或者使用 `workers_dev = false` 并配置路由：

```toml
workers_dev = false

[[routes]]
pattern = "yourdomain.com/api/*"
zone_name = "yourdomain.com"
```

---

## 🔐 设置环境变量

### 生产环境 Secrets

```bash
# 在 worker 目录下执行
cd worker

# 设置管理员用户名
wrangler secret put ADMIN_USERNAME
# 输入：admin（或你想要的用户名）

# 设置管理员密码
wrangler secret put ADMIN_PASSWORD
# 输入：你的强密码（建议包含大小写字母、数字、特殊字符）
```

### 验证 Secrets

```bash
# 查看已设置的 secrets（不会显示值）
wrangler secret list
```

---

## 🧪 测试部署

### 1. 测试用户提交 API

```bash
curl -X POST https://nav-api.your-subdomain.workers.dev/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "siteName": "测试网站",
    "siteUrl": "https://example.com",
    "category": "常用工具",
    "description": "这是一个测试网站",
    "email": "test@example.com"
  }'
```

预期响应：
```json
{
  "success": true,
  "message": "提交成功，我们会尽快审核您的网站",
  "submissionId": "submission_..."
}
```

### 2. 测试管理员登录

```bash
curl -X POST https://nav-api.your-subdomain.workers.dev/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your_password"
  }'
```

预期响应：
```json
{
  "success": true,
  "message": "登录成功",
  "token": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx-1234567890"
}
```

### 3. 测试获取提交列表

```bash
# 使用上面获取的 token
curl -X GET https://nav-api.your-subdomain.workers.dev/api/admin/submissions?status=pending \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 4. 测试前端页面

1. 打开 `commit.html`，填写表单并提交
2. 打开 `admin.html`，使用管理员账号登录
3. 在管理后台查看提交、审核、添加网站

---

## 📝 完整部署步骤总结

### 快速部署清单

- [ ] 安装 Wrangler CLI
- [ ] 登录 Cloudflare (`wrangler login`)
- [ ] 创建 3 个 KV Namespace
- [ ] 更新 `wrangler.toml` 中的 KV Namespace ID
- [ ] 设置管理员账号密码（使用 `wrangler secret put`）
- [ ] 部署 Worker (`wrangler deploy`)
- [ ] 更新 HTML 文件中的 API 地址（如果需要）
- [ ] 部署前端页面到 Cloudflare Pages（或你的服务器）
- [ ] 测试所有功能

---

## 🔧 项目结构

```
my_nav/
├── commit.html              # 用户提交表单页面
├── admin.html               # 管理员后台页面
├── worker/                  # Cloudflare Worker 代码
│   ├── src/
│   │   └── index.js        # Worker 主文件
│   └── wrangler.toml       # Worker 配置文件
└── Cloudflare部署指南.md    # 本文件
```

---

## 🎯 使用说明

### 用户提交网站

1. 访问 `commit.html`
2. 填写表单（网站名称、网址、分类、描述、邮箱等）
3. 点击提交
4. 提交成功后，数据会保存到 KV，状态为"待审核"

### 管理员操作

1. 访问 `admin.html`
2. 使用管理员账号登录
3. **待审核提交**：查看、批准或拒绝用户提交的网站
4. **添加网站**：直接添加新网站到导航（无需审核）
5. **网站列表**：查看所有已添加的网站

### API 端点说明

| 端点 | 方法 | 说明 | 需要认证 |
|------|------|------|----------|
| `/api/submit` | POST | 用户提交网站 | ❌ |
| `/api/admin/login` | POST | 管理员登录 | ❌ |
| `/api/admin/submissions` | GET | 获取提交列表 | ✅ |
| `/api/admin/add-site` | POST | 管理员添加网站 | ✅ |
| `/api/admin/review` | POST | 审核提交（批准/拒绝） | ✅ |
| `/api/admin/sites` | GET | 获取网站列表 | ✅ |

---

## 🛠️ 常见问题

### Q1: 部署时提示 KV Namespace 不存在

**A**: 确保你已经创建了 KV Namespace，并且 `wrangler.toml` 中的 ID 正确。可以使用 `wrangler kv:namespace list` 查看所有 Namespace。

### Q2: 如何查看 KV 中存储的数据？

**A**: 使用 Wrangler CLI：
```bash
# 列出所有 key
wrangler kv:key list --namespace-id YOUR_NAMESPACE_ID

# 获取某个 key 的值
wrangler kv:key get "key_name" --namespace-id YOUR_NAMESPACE_ID
```

### Q3: 如何更新 Worker 代码？

**A**: 修改代码后，重新执行 `wrangler deploy` 即可。

### Q4: 如何删除 KV 中的数据？

**A**: 
```bash
# 删除单个 key
wrangler kv:key delete "key_name" --namespace-id YOUR_NAMESPACE_ID

# 清空整个 Namespace（谨慎操作）
# 需要在 Cloudflare Dashboard 中操作
```

### Q5: CORS 错误怎么办？

**A**: Worker 代码中已经配置了 CORS 头。如果还有问题，检查：
1. API 地址是否正确
2. 请求方法是否为 POST/GET
3. Content-Type 是否为 application/json

### Q6: 管理员密码忘记了怎么办？

**A**: 重新设置 Secret：
```bash
wrangler secret put ADMIN_PASSWORD
```

### Q7: 如何限制 API 访问频率？

**A**: 可以在 Worker 代码中添加速率限制逻辑，或使用 Cloudflare 的 Rate Limiting 功能。

### Q8: 如何备份 KV 数据？

**A**: 使用 Wrangler CLI 导出：
```bash
wrangler kv:key list --namespace-id YOUR_NAMESPACE_ID > backup.json
```

### Q9: Worker 部署失败怎么办？

**A**: 检查：
1. `wrangler.toml` 语法是否正确
2. KV Namespace ID 是否正确
3. 代码语法是否有错误（使用 `wrangler dev` 本地测试）

### Q10: 如何查看 Worker 日志？

**A**: 
```bash
# 实时查看日志
wrangler tail

# 或访问 Cloudflare Dashboard > Workers & Pages > 你的 Worker > Logs
```

---

## 🔒 安全建议

1. **使用强密码**：管理员密码应包含大小写字母、数字、特殊字符，长度至少 12 位
2. **使用 Secrets**：不要将密码硬编码在代码中，使用 `wrangler secret put`
3. **HTTPS**：确保所有通信都使用 HTTPS
4. **Token 过期**：当前实现中 token 24 小时过期，可以根据需要调整
5. **输入验证**：Worker 代码中已包含基本的输入验证，生产环境建议加强
6. **速率限制**：考虑添加 API 速率限制，防止滥用

---

## 📚 相关资源

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Cloudflare KV 文档](https://developers.cloudflare.com/kv/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)

---

## 🎉 完成！

部署完成后，你的系统应该可以正常工作了。如果遇到问题，请参考常见问题部分或查看 Cloudflare Dashboard 中的日志。

祝你使用愉快！🚀



