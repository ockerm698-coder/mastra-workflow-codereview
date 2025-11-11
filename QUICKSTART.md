# 🚀 5 分钟快速开始

一步步教你部署 GitHub 自动代码审查系统。

## 步骤 1: 安装和配置 (2 分钟)

```bash
# 克隆或进入项目目录
cd mastra-workflow-codereview

# 安装依赖
npm install

# 配置环境变量
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`，填入你的密钥：
```bash
OPENAI_API_KEY=sk-xxxxx  # 从 https://platform.openai.com/api-keys 获取
GITHUB_TOKEN=ghp_xxxxx   # 从 https://github.com/settings/tokens 创建（需要 repo 权限）
```

## 步骤 2: 本地测试 (1 分钟)

```bash
# 启动开发服务器
npm run dev

# 在浏览器中访问
# http://localhost:8787/health
```

看到 `"status": "healthy"` 就说明运行正常！

## 步骤 3: 部署到 Cloudflare (1 分钟)

```bash
# 登录 Cloudflare（首次需要）
npx wrangler login

# 部署
npm run deploy

# 设置生产环境密钥
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put GITHUB_TOKEN
```

部署成功后，你会看到类似的 URL：
```
https://mastra-codereview-worker.your-name.workers.dev
```

## 步骤 4: 配置 GitHub Webhook (1 分钟)

1. 打开你的 GitHub 仓库
2. 进入 **Settings → Webhooks → Add webhook**
3. 填写：
   - **Payload URL**: `https://your-worker-url.workers.dev/webhook/github`
   - **Content type**: `application/json`
   - **Events**: 勾选 `Pushes` 和 `Pull requests`
4. 点击 **Add webhook**

## ✅ 完成！

现在，每次你 push 代码或创建 PR，系统都会：
1. 自动扫描整个仓库
2. 执行 AI 代码审查
3. 创建 Issue 或 PR 评论

## 🧪 测试一下

```bash
# 在你的仓库中创建一个测试文件
echo "const password = '123456';" > test.js
git add test.js
git commit -m "test code review"
git push

# 几分钟后，检查你的 GitHub 仓库
# 应该会看到一个新的 Issue，标题类似：
# 🤖 代码审查报告 - main (发现 1 个错误)
```

## 🆘 遇到问题？

### Webhook 没有触发

1. 检查 Webhook URL 是否正确
2. 进入 GitHub → Settings → Webhooks → Recent Deliveries 查看日志
3. 确认返回状态码为 200

### 没有创建 Issue 或 PR 评论

1. 确认 `GITHUB_TOKEN` 已设置：`npx wrangler secret list`
2. 确认 Token 有 `repo` 权限
3. 查看 Cloudflare Workers 日志：`npx wrangler tail`

### 环境变量未设置

**错误**: "GITHUB_TOKEN environment variable is required"

**解决**:
```bash
# 本地开发
echo "GITHUB_TOKEN=ghp_your_token" >> .dev.vars

# 生产环境
npx wrangler secret put GITHUB_TOKEN
```

---

就这么简单！🎉

**查看完整文档**: [README.md](README.md)
