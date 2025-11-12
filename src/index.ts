/**
 * ============================================
 * Mastra GitHub 代码审查系统
 * ============================================
 *
 * 功能：
 * 当代码 push 到 GitHub 时，自动审查整个仓库并创建 Issue 报告
 *
 * 技术栈：
 * - Cloudflare Workers: 无服务器边缘计算
 * - Hono: 轻量级 Web 框架
 * - Mastra: AI 工作流编排
 * - OpenAI GPT-4o-mini: AI 代码审查
 * - GitHub API: 创建 Issue 和评论
 *
 * 工作流程：
 * 1. 接收 GitHub Webhook (push/pull_request 事件)
 * 2. 使用 GitHub API 获取仓库所有代码文件
 * 3. 并行执行静态分析 + AI 审查
 * 4. 生成汇总报告
 * 5. 通过 GitHub API 创建 Issue 或 PR 评论
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { mastra } from './mastra';
import { githubScannerTool } from './tools/github-scanner';


/**
 * 环境变量定义
 */
interface Env {
  OPENAI_API_KEY: string;  // OpenAI API 密钥
  GITHUB_TOKEN: string;    // GitHub Personal Access Token
}

const app = new Hono<{ Bindings: Env }>();

// 启用 CORS
app.use('/*', cors());

/**
 * ============================================
 * API 端点 1: 健康检查
 * ============================================
 *
 * GET /health
 *
 * 用途：检查服务运行状态
 */
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'GitHub Auto Code Review',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

/**
 * ============================================
 * API 端点 2: GitHub Webhook 处理器
 * ============================================
 *
 * POST /webhook/github
 *
 * 功能：
 * 1. 接收 GitHub push 或 pull_request 事件
 * 2. 自动扫描整个仓库
 * 3. 执行代码审查
 * 4. 创建 GitHub Issue 或 PR 评论
 *
 * GitHub Webhook 配置：
 * - Payload URL: https://your-worker.workers.dev/webhook/github
 * - Content type: application/json
 * - Events: push, pull_request
 */
app.post('/webhook/github', async (c) => {
  try {
    /**
     * 1. 获取 GitHub Event 类型
     */
    const eventType = c.req.header('X-GitHub-Event');

    if (!eventType || !['push', 'pull_request'].includes(eventType)) {
      return c.json({
        success: false,
        message: `Event type '${eventType}' is not supported. Only 'push' and 'pull_request' events are processed.`,
      });
    }

    /**
     * 2. 解析 Webhook Payload
     */
    const payload = await c.req.json();

    /**
     * 3. 提取仓库信息
     */
    const repository = payload.repository?.full_name;
    const [owner, repo] = repository?.split('/') || [];

    // 获取分支名
    let branch = '';
    let pullRequestNumber: number | null = null;

    if (eventType === 'push') {
      branch = payload.ref?.replace('refs/heads/', '') || 'main';
    } else if (eventType === 'pull_request') {
      branch = payload.pull_request?.head?.ref || 'main';
      pullRequestNumber = payload.pull_request?.number;
    }

    if (!owner || !repo) {
      return c.json(
        {
          success: false,
          error: 'Invalid webhook payload: missing repository information',
        },
        400,
      );
    }

    /**
     * 4. 获取 GitHub Token
     */
    const githubToken = c.env?.GITHUB_TOKEN;
    if (!githubToken) {
      return c.json(
        {
          success: false,
          error: 'GITHUB_TOKEN environment variable is required',
        },
        500,
      );
    }

    /**
     * 5. 扫描 GitHub 仓库
     */
    console.log(`📦 Scanning repository: ${owner}/${repo}@${branch}`);

    const scanResult = await githubScannerTool.execute({
      context: {
        owner,
        repo,
        branch,
        githubToken,
      },
    });

    console.log(`✅ Found ${scanResult.summary.totalFiles} files to review`);

    /**
     * 6. 执行代码审查工作流
     */
    const workflow = mastra.getWorkflow('codeReviewWorkflow');
    if (!workflow) {
      return c.json({ success: false, error: 'Workflow not found' }, 500);
    }
    console.log('start code review workflow.');

    // 并行审查所有文件
    const results = await Promise.all(
      scanResult.files.map(async (file) => {
        try {
          // 直接使用 workflow.start() 而不是 .execute()，避免 addEventListener 问题
          // 参考：https://github.com/mastra-ai/mastra/issues/7588
          const result = await (workflow as any).start({
            inputData: {
              code: file.content,
              fileName: file.path,
            },
          });
          console.log(`${file.path} result status: ${result.status}`);

          // 根据 status 判断是否成功
          if (result.status === 'success') {
            // @ts-ignore - result 字段在 success 状态下存在
            const output = result.result;
            console.log(`${file.path} output: ${JSON.stringify(output)}`);
            return {
              success: true,
              fileName: file.path,
              ...output,
            };
          } else {
            // 失败状态
            return {
              success: false,
              fileName: file.path,
              error: result.status === 'failed' ? result.error?.message : 'Workflow execution failed',
            };
          }
        } catch (error: any) {
          console.error(`❌ Failed to review ${file.path}:`, error.message);
          console.error('Error details:', error);
          return {
            success: false,
            fileName: file.path,
            error: error.message,
          };
        }
      }),
    );

    /**
     * 7. 生成审查统计
     */
    const successResults = results.filter((r) => r.success);
    const totalIssues = successResults.reduce(
      (sum: number, r: any) => sum + (r.metrics?.staticIssues || 0),
      0,
    );
    const totalErrors = successResults.reduce(
      (sum: number, r: any) => sum + (r.metrics?.staticErrors || 0),
      0,
    );

    // 识别关键文件（包含错误的文件）
    const criticalFiles = successResults
      .filter((r: any) => r.metrics?.staticErrors > 0)
      .map((r: any) => ({ fileName: r.fileName, errors: r.metrics.staticErrors }));

    /**
     * 8. 生成 Markdown 格式的审查报告
     */
    const reportMarkdown = generateReportMarkdown({
      repository: `${owner}/${repo}`,
      branch,
      eventType,
      totalFiles: scanResult.summary.totalFiles,
      totalIssues,
      totalErrors,
      criticalFiles,
      results: successResults,
    });

    /**
     * 9. 通过 GitHub API 创建 Issue 或 PR 评论
     */
    if (eventType === 'push') {
      // Push 事件：创建 Issue（如果有问题）
      if (totalIssues > 0) {
        await createGitHubIssue({
          owner,
          repo,
          title: `🤖 代码审查报告 - ${branch} (发现 ${totalErrors} 个错误)`,
          body: reportMarkdown,
          githubToken,
        });
        console.log(`✅ Created GitHub Issue for ${owner}/${repo}`);
      }
    } else if (eventType === 'pull_request' && pullRequestNumber) {
      // PR 事件：创建评论
      await createPullRequestComment({
        owner,
        repo,
        pullNumber: pullRequestNumber,
        body: reportMarkdown,
        githubToken,
      });
      console.log(`✅ Created PR comment for ${owner}/${repo}#${pullRequestNumber}`);
    }

    /**
     * 10. 返回响应
     */
    return c.json({
      success: true,
      message: 'Code review completed',
      repository: `${owner}/${repo}`,
      branch,
      eventType,
      summary: {
        totalFiles: scanResult.summary.totalFiles,
        totalIssues,
        totalErrors,
        criticalFilesCount: criticalFiles.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    return c.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      500,
    );
  }
});

/**
 * ============================================
 * 404 处理
 * ============================================
 */
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: 'Endpoint not found',
      availableEndpoints: ['/health', '/webhook/github'],
    },
    404,
  );
});

/**
 * ============================================
 * 辅助函数：生成审查报告（Markdown 格式）
 * ============================================
 */
function generateReportMarkdown(data: {
  repository: string;
  branch: string;
  eventType: string;
  totalFiles: number;
  totalIssues: number;
  totalErrors: number;
  criticalFiles: Array<{ fileName: string; errors: number }>;
  results: any[];
}): string {
  const { repository, branch, eventType, totalFiles, totalIssues, totalErrors, criticalFiles, results } = data;

  let report = `# 🤖 AI 代码审查报告\n\n`;
  report += `**仓库**: ${repository}\n`;
  report += `**分支**: ${branch}\n`;
  report += `**事件**: ${eventType}\n`;
  report += `**时间**: ${new Date().toISOString()}\n\n`;

  report += `## 📊 审查摘要\n\n`;
  report += `| 指标 | 数量 |\n`;
  report += `|------|------|\n`;
  report += `| 扫描文件 | ${totalFiles} |\n`;
  report += `| 发现问题 | ${totalIssues} |\n`;
  report += `| 错误数量 | ${totalErrors} |\n`;
  report += `| 关键文件 | ${criticalFiles.length} |\n\n`;

  if (totalErrors > 0) {
    report += `## ⚠️ 需要优先修复的文件\n\n`;
    criticalFiles.forEach((file) => {
      report += `- **${file.fileName}** - ${file.errors} 个错误\n`;
    });
    report += `\n`;
  }

  if (totalIssues > 0) {
    report += `## 📋 详细问题列表\n\n`;

    // 只显示前 10 个文件的详细报告（避免 Issue 过长）
    const topFiles = results
      .filter((r: any) => r.metrics?.staticIssues > 0)
      .slice(0, 10);

    topFiles.forEach((r: any) => {
      report += `### ${r.fileName}\n\n`;
      report += `**问题数**: ${r.metrics.staticIssues} | **错误数**: ${r.metrics.staticErrors}\n\n`;

      // 提取静态分析结果的简要信息
      if (r.staticResult?.issues?.length > 0) {
        r.staticResult.issues.slice(0, 5).forEach((issue: any) => {
          const emoji = issue.severity === 'error' ? '🔴' : issue.severity === 'warning' ? '🟡' : 'ℹ️';
          report += `${emoji} **Line ${issue.line}**: ${issue.message} (\`${issue.rule}\`)\n`;
        });
        if (r.staticResult.issues.length > 5) {
          report += `\n_... 还有 ${r.staticResult.issues.length - 5} 个问题_\n`;
        }
      }
      report += `\n`;
    });

    if (results.filter((r: any) => r.metrics?.staticIssues > 0).length > 10) {
      report += `\n_... 还有 ${results.filter((r: any) => r.metrics?.staticIssues > 0).length - 10} 个文件包含问题_\n\n`;
    }
  } else {
    report += `## ✅ 太棒了！\n\n`;
    report += `没有发现任何问题，代码质量良好！\n\n`;
  }

  report += `---\n\n`;
  report += `🤖 _此报告由 [Mastra AI 代码审查系统](https://github.com/mastra) 自动生成_\n`;

  return report;
}

/**
 * ============================================
 * 辅助函数：创建 GitHub Issue
 * ============================================
 */
async function createGitHubIssue(params: {
  owner: string;
  repo: string;
  title: string;
  body: string;
  githubToken: string;
}): Promise<void> {
  const { owner, repo, title, body, githubToken } = params;

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      body,
      labels: ['code-review', 'automated'],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create GitHub issue: ${error}`);
  }
}

/**
 * ============================================
 * 辅助函数：创建 Pull Request 评论
 * ============================================
 */
async function createPullRequestComment(params: {
  owner: string;
  repo: string;
  pullNumber: number;
  body: string;
  githubToken: string;
}): Promise<void> {
  const { owner, repo, pullNumber, body, githubToken } = params;

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${pullNumber}/comments`,
    {
      method: 'POST',
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create PR comment: ${error}`);
  }
}

/**
 * ============================================
 * 导出应用
 * ============================================
 */
export default app;
