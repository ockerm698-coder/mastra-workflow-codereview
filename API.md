# API 完整文档

## 📋 概述

本系统提供极简的 API 设计，只有 **2 个端点**：

1. `GET /health` - 健康检查
2. `POST /webhook/github` - GitHub Webhook 处理器（核心功能）

**基础 URL**: `https://your-worker.workers.dev`

## 🔑 认证

所有敏感操作通过环境变量配置，无需在请求中传递：

- `OPENAI_API_KEY` - OpenAI API 密钥
- `GITHUB_TOKEN` - GitHub Personal Access Token

这些密钥在 Cloudflare Workers 中通过 Secrets 管理：

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put GITHUB_TOKEN
```

---

## API 端点详情

### 1. 健康检查

检查服务运行状态。

**端点**: `GET /health`

**请求**: 无需参数

**响应示例**:

```json
{
  "status": "healthy",
  "service": "GitHub Auto Code Review",
  "version": "2.0.0",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**HTTP 状态码**:
- `200 OK` - 服务运行正常

**使用示例**:

```bash
curl https://your-worker.workers.dev/health
```

---

### 2. GitHub Webhook 处理器

接收 GitHub Webhook 事件，自动执行代码审查并反馈结果。

**端点**: `POST /webhook/github`

**请求头**:

```
Content-Type: application/json
X-GitHub-Event: push | pull_request
X-Hub-Signature-256: sha256=... (可选，用于验证)
```

**触发事件**:

- `push` - 代码推送事件
- `pull_request` - Pull Request 事件

#### Push 事件 Payload 示例

```json
{
  "ref": "refs/heads/main",
  "repository": {
    "name": "my-repo",
    "full_name": "username/my-repo",
    "owner": {
      "name": "username"
    }
  },
  "commits": [...]
}
```

#### Pull Request 事件 Payload 示例

```json
{
  "action": "opened",
  "number": 42,
  "pull_request": {
    "number": 42,
    "head": {
      "ref": "feature-branch"
    }
  },
  "repository": {
    "name": "my-repo",
    "full_name": "username/my-repo"
  }
}
```

#### 成功响应示例

```json
{
  "success": true,
  "message": "Code review completed",
  "repository": "username/my-repo",
  "branch": "main",
  "eventType": "push",
  "summary": {
    "totalFiles": 25,
    "totalIssues": 15,
    "totalErrors": 2,
    "criticalFilesCount": 2
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

#### 错误响应示例

```json
{
  "success": false,
  "error": "GITHUB_TOKEN environment variable is required"
}
```

**HTTP 状态码**:
- `200 OK` - Webhook 处理成功
- `400 Bad Request` - 请求参数错误
- `500 Internal Server Error` - 服务器内部错误

---

## 🔄 工作流程

### Push 事件流程

```
1. GitHub 发送 push 事件 Webhook
         ↓
2. 系统解析 Webhook Payload
         ↓
3. 提取仓库信息（owner/repo/branch）
         ↓
4. 使用 GitHub API 扫描仓库所有代码文件
         ↓
5. 并行执行代码审查（静态分析 + AI 审查）
         ↓
6. 生成 Markdown 格式的审查报告
         ↓
7. 如果发现问题，通过 GitHub API 创建 Issue
         ↓
8. 返回处理结果
```

### Pull Request 事件流程

```
1. GitHub 发送 pull_request 事件 Webhook
         ↓
2. 系统解析 Webhook Payload
         ↓
3. 提取 PR 信息（owner/repo/branch/PR号）
         ↓
4. 扫描 PR 分支的所有代码文件
         ↓
5. 并行执行代码审查
         ↓
6. 生成审查报告
         ↓
7. 通过 GitHub API 在 PR 中添加评论
         ↓
8. 返回处理结果
```

---

## 📊 审查报告格式

系统会生成结构化的 Markdown 格式报告，包含以下部分：

### 报告结构

```markdown
# 🤖 AI 代码审查报告

**仓库**: username/repository
**分支**: main
**事件**: push
**时间**: 2024-01-01T12:00:00.000Z

## 📊 审查摘要

| 指标 | 数量 |
|------|------|
| 扫描文件 | 25 |
| 发现问题 | 15 |
| 错误数量 | 2 |
| 关键文件 | 2 |

## ⚠️ 需要优先修复的文件

- **src/auth.ts** - 2 个错误
- **src/config.ts** - 1 个错误

## 📋 详细问题列表

### src/auth.ts

**问题数**: 5 | **错误数**: 2

🔴 **Line 12**: Hardcoded secret detected (`no-hardcoded-secrets`)
🟡 **Line 45**: Debug statement found (`no-console`)
ℹ️ **Line 78**: TODO comment found (`todo-comment`)

### src/config.ts

**问题数**: 3 | **错误数**: 1

🔴 **Line 8**: Hardcoded secret detected (`no-hardcoded-secrets`)
🟡 **Line 23**: Debug statement found (`no-console`)

---

🤖 _此报告由 AI-CODEREVIEW 代码审查系统自动生成_
```

---

## 🎯 GitHub 集成

### 创建 Issue

当 `push` 事件检测到问题时，系统会自动创建 Issue：

**Issue 标题格式**:
```
🤖 代码审查报告 - {branch} (发现 {errors} 个错误)
```

**Issue 标签**:
- `code-review`
- `automated`

**Issue 正文**: 完整的审查报告（Markdown 格式）

### 创建 PR 评论

当 `pull_request` 事件触发时，系统会在 PR 中添加评论：

**评论内容**: 完整的审查报告（Markdown 格式）

---

## 🔧 配置 GitHub Webhook

### 步骤 1: 进入仓库设置

在你的 GitHub 仓库中：
1. 点击 **Settings**
2. 点击 **Webhooks**
3. 点击 **Add webhook**

### 步骤 2: 配置 Webhook

填写以下信息：

| 字段 | 值 |
|------|-----|
| **Payload URL** | `https://your-worker.workers.dev/webhook/github` |
| **Content type** | `application/json` |
| **Secret** | (可选) 用于验证请求的密钥 |
| **SSL verification** | Enable SSL verification |
| **Which events** | 选择 `Just the push event` 或 `Let me select individual events` |

### 步骤 3: 选择事件

如果选择 "Let me select individual events"，勾选：
- ✅ **Pushes** - 代码推送时触发
- ✅ **Pull requests** - PR 创建/更新时触发

### 步骤 4: 激活 Webhook

- ✅ 勾选 **Active**
- 点击 **Add webhook**

---

## 🐛 错误处理

### 常见错误

#### 1. 环境变量未设置

**错误响应**:
```json
{
  "success": false,
  "error": "GITHUB_TOKEN environment variable is required"
}
```

**解决方法**:
```bash
npx wrangler secret put GITHUB_TOKEN
```

#### 2. 仓库信息缺失

**错误响应**:
```json
{
  "success": false,
  "error": "Invalid webhook payload: missing repository information"
}
```

**原因**: Webhook Payload 格式不正确或缺少必需字段

#### 3. GitHub API 调用失败

**错误响应**:
```json
{
  "success": false,
  "error": "Failed to create GitHub issue: ..."
}
```

**可能原因**:
- GitHub Token 权限不足
- 仓库不存在或无权访问
- GitHub API 速率限制

---

## 📈 性能指标

### 处理时间

| 场景 | 预计时间 |
|------|----------|
| 小型仓库 (< 10 文件) | 30-60 秒 |
| 中型仓库 (10-50 文件) | 60-120 秒 |
| 大型仓库 (50-100 文件) | 2-5 分钟 |
| 超大仓库 (> 100 文件) | 3-10 分钟 |

### 资源消耗

- **CPU 时间**: 取决于文件数量和代码复杂度
- **OpenAI API 调用**: 每个文件 1-2 次
- **GitHub API 调用**:
  - 文件获取: 1 次（树结构） + N 次（文件内容）
  - Issue/评论创建: 1 次

### 速率限制

**GitHub API**:
- 认证用户: 5000 次/小时
- 未认证: 60 次/小时

**OpenAI API**:
- 根据你的 API 计划

**建议**:
- 为大型仓库设置合理的超时时间
- 监控 API 使用量
- 考虑实现缓存机制

---

## 🔒 安全建议

### 1. 保护敏感信息

- ✅ 使用 Cloudflare Secrets 存储 API 密钥
- ✅ 不要在代码中硬编码密钥
- ✅ 定期轮换 GitHub Token

### 2. Webhook 验证 (可选)

配置 GitHub Webhook Secret 并验证请求签名：

```typescript
// 示例：验证 GitHub Webhook 签名
import crypto from 'crypto';

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}
```

### 3. 最小权限原则

GitHub Token 只需要以下权限：
- ✅ `repo` - 访问仓库代码
- ✅ `repo:status` - 读取提交状态

### 4. 监控和日志

使用 Cloudflare Workers 日志监控异常：

```bash
# 实时查看日志
npx wrangler tail

# 查看最近的日志
npx wrangler tail --format pretty
```

---

## 💡 最佳实践

### 1. 合理配置触发条件

**推荐配置**:
- ✅ 主分支（main/master）启用 push 事件
- ✅ 所有 Pull Request 启用 pull_request 事件
- ❌ 避免在开发分支启用（避免噪音）

### 2. 控制仓库大小

**建议**:
- 单个仓库文件数 < 100
- 单个文件行数 < 5000
- 总代码量 < 50MB

### 3. Issue 管理

**建议**:
- 定期关闭已修复的审查 Issue
- 使用标签分类问题严重程度
- 设置自动化规则处理审查 Issue

### 4. 成本优化

**建议**:
- 监控 OpenAI API 使用量
- 考虑为大型仓库实现增量审查（只审查变更文件）
- 使用缓存减少重复审查

---

## 🆘 故障排查

### Webhook 未触发

**检查清单**:
1. ✅ Webhook URL 是否正确
2. ✅ 查看 GitHub → Settings → Webhooks → Recent Deliveries
3. ✅ 检查响应状态码和错误信息
4. ✅ 确认 Cloudflare Workers 正在运行

### Issue/评论未创建

**检查清单**:
1. ✅ 确认 `GITHUB_TOKEN` 已设置: `npx wrangler secret list`
2. ✅ 确认 Token 有 `repo` 权限
3. ✅ 查看 Workers 日志: `npx wrangler tail`
4. ✅ 检查 GitHub API 速率限制

### 审查超时

**解决方案**:
1. 减少仓库文件数量
2. 增加 Cloudflare Workers CPU 时间限制
3. 实现增量审查（只审查变更文件）
4. 使用异步队列处理大型仓库

---

## 📞 技术支持

- **文档**: [README.md](README.md)
- **快速开始**: [QUICKSTART.md](QUICKSTART.md)
- **GitHub**: 提交 Issue

---

**版本**: 2.0.0
**最后更新**: 2024-01-01
