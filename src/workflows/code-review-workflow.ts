// 导入 Mastra 工作流相关函数
import { createStep, createWorkflow } from '@mastra/core/workflows';
// 导入 Zod 用于数据验证
import { z } from 'zod';
// 导入静态分析工具
import { staticAnalyzerTool } from '../tools/static-analyzer';

/**
 * ============================================
 * 步骤 1: 静态代码分析
 * ============================================
 *
 * 工作流程的第一步，使用静态分析工具快速检测代码中的常见问题。
 *
 * 功能：
 * - 调用 staticAnalyzerTool 执行分析
 * - 检测调试语句、硬编码密钥、TODO 注释等
 * - 为后续的 AI 审查提供基础数据
 *
 * 输入：
 * - code: 源代码字符串
 * - fileName: 文件名
 *
 * 输出：
 * - code: 原始代码（传递给下一步）
 * - fileName: 文件名（传递给下一步）
 * - staticResult: 静态分析结果（问题列表和统计摘要）
 *
 * 执行时间：通常 <100ms（取决于代码长度）
 */
const staticAnalysisStep = createStep({
  // 步骤唯一标识符
  id: 'static-analysis',

  // 步骤描述
  description: 'Run static code analysis',

  // 输入数据结构：代码和文件名
  inputSchema: z.object({
    code: z.string(),      // 待分析的源代码
    fileName: z.string(),  // 文件名（用于上下文）
  }),

  // 输出数据结构：包含原始输入和分析结果
  outputSchema: z.object({
    code: z.string(),          // 原始代码（传递给下一步）
    fileName: z.string(),      // 文件名（传递给下一步）
    staticResult: z.object({   // 静态分析结果
      issues: z.array(z.any()),       // 问题列表
      summary: z.object({             // 统计摘要
        total: z.number(),      // 总问题数
        errors: z.number(),     // 错误数
        warnings: z.number(),   // 警告数
      }),
    }),
  }),

  /**
   * 执行函数
   *
   * 流程：
   * 1. 接收输入数据（code 和 fileName）
   * 2. 调用 staticAnalyzerTool 执行静态分析
   * 3. 返回原始数据和分析结果
   */
  execute: async ({ inputData }) => {
    // 调用静态分析工具
    const result = await staticAnalyzerTool.execute({
      context: inputData!,
    });
    console.log('Run static code analysis. result: ', JSON.stringify(result));
    // 返回结果，包含原始数据和分析结果
    return {
      code: inputData!.code,              // 保留原始代码
      fileName: inputData!.fileName,      // 保留文件名
      staticResult: result,               // 静态分析结果
    };
  },
});

/**
 * ============================================
 * 步骤 2: AI 深度审查
 * ============================================
 *
 * 工作流程的第二步，使用 AI 代理进行深度代码分析和审查。
 *
 * 功能：
 * - 调用 codeReviewerAgent（基于 GPT-4o-mini）
 * - 理解代码逻辑和设计意图
 * - 识别 bug、安全问题、性能瓶颈
 * - 提供最佳实践建议和改进方向
 * - 结合静态分析结果进行综合评估
 *
 * 输入：
 * - code: 源代码
 * - fileName: 文件名
 * - staticResult: 第一步的静态分析结果
 *
 * 输出：
 * - fileName: 文件名（传递给下一步）
 * - staticResult: 静态分析结果（传递给下一步）
 * - aiReview: AI 生成的审查报告文本
 *
 * 执行时间：通常 5-10 秒（取决于代码复杂度和 API 响应速度）
 */
const aiReviewStep = createStep({
  // 步骤唯一标识符
  id: 'ai-review',

  // 步骤描述
  description: 'Perform AI code review',

  // 输入数据结构：包含代码、文件名和静态分析结果
  inputSchema: z.object({
    code: z.string(),           // 源代码
    fileName: z.string(),       // 文件名
    staticResult: z.any(),      // 静态分析结果
  }),

  // 输出数据结构：包含文件名、静态结果和 AI 审查内容
  outputSchema: z.object({
    fileName: z.string(),       // 文件名
    staticResult: z.any(),      // 静态分析结果
    aiReview: z.string(),       // AI 审查报告
  }),

  /**
   * 执行函数
   *
   * 流程：
   * 1. 从 Mastra 实例获取 codeReviewerAgent
   * 2. 构建包含代码和静态分析结果的提示词
   * 3. 调用 AI 代理生成审查报告
   * 4. 返回审查结果
   */
  execute: async ({ inputData, mastra }) => {
    // 获取代码审查代理
    // mastra 是 Mastra 实例的引用，通过它可以访问注册的代理
    const agent = mastra?.getAgent('codeReviewerAgent');
    if (!agent) throw new Error('Agent not found');

    /**
     * 构建 AI 提示词
     *
     * 提示词设计原则：
     * 1. 提供清晰的上下文（文件名、代码）
     * 2. 包含静态分析结果作为参考
     * 3. 使用代码块格式提升可读性
     * 4. 提供足够信息让 AI 做出准确判断
     */
    const prompt = `Review this file: ${inputData!.fileName}

Code:
\`\`\`
${inputData!.code}
\`\`\`

Static Analysis found ${inputData!.staticResult.summary.total} issues:
${JSON.stringify(inputData!.staticResult.issues, null, 2)}`;

    // 调用 AI 代理生成审查报告
    // generate() 方法会：
    // 1. 将提示词发送给 OpenAI API
    // 2. 接收 AI 生成的响应
    // 3. 返回包含生成文本的响应对象
    console.log('AI-CodeReview. prompt: ', prompt);
    const response = await agent.generate(prompt);
    console.log("AI-CodeReview. responde: ", JSON.stringify(response));

    // 返回审查结果
    return {
      fileName: inputData!.fileName,                // 保留文件名
      staticResult: inputData!.staticResult,        // 保留静态分析结果
      aiReview: response.text || 'No review generated',  // AI 生成的审查文本
    };
  },
});

/**
 * ============================================
 * 步骤 3: 生成审查报告
 * ============================================
 *
 * 工作流程的最后一步，整合静态分析和 AI 审查结果，生成格式化的 Markdown 报告。
 *
 * 功能：
 * - 整合前两步的所有分析结果
 * - 生成结构化的 Markdown 格式报告
 * - 提取关键指标用于快速评估
 * - 提供易读且专业的报告格式
 *
 * 输入：
 * - fileName: 文件名
 * - staticResult: 静态分析结果
 * - aiReview: AI 审查报告文本
 *
 * 输出：
 * - fileName: 文件名
 * - report: 完整的 Markdown 格式报告
 * - metrics: 关键指标（问题数、错误数）
 *
 * 执行时间：<10ms（纯文本处理）
 */
const generateReportStep = createStep({
  // 步骤唯一标识符
  id: 'generate-report',

  // 步骤描述
  description: 'Generate review report',

  // 输入数据结构：文件名、静态结果、AI 审查
  inputSchema: z.object({
    fileName: z.string(),       // 文件名
    staticResult: z.any(),      // 静态分析结果
    aiReview: z.string(),       // AI 审查文本
  }),

  // 输出数据结构：文件名、报告、指标
  outputSchema: z.object({
    fileName: z.string(),       // 文件名
    report: z.string(),         // Markdown 格式的完整报告
    metrics: z.object({         // 关键指标
      staticIssues: z.number(), // 静态分析发现的问题总数
      staticErrors: z.number(), // 静态分析发现的错误数
    }),
  }),

  /**
   * 执行函数
   *
   * 流程：
   * 1. 解构输入数据
   * 2. 构建 Markdown 格式的报告
   * 3. 提取关键指标
   * 4. 返回最终结果
   */
  execute: async ({ inputData }) => {
    // 解构获取所需数据
    const { fileName, staticResult, aiReview } = inputData!;

    /**
     * 生成 Markdown 格式的审查报告
     *
     * 报告结构：
     * 1. 标题：文件名
     * 2. 静态分析部分：
     *    - 统计摘要（总数、错误数、警告数）
     *    - 详细问题列表（行号、严重程度、描述、规则）
     * 3. AI 审查部分：
     *    - AI 生成的详细分析和建议
     * 4. 页脚：生成工具标识
     */
    const report = `# Code Review: ${fileName}

## 📊 Static Analysis
- Total Issues: ${staticResult.summary.total}
- Errors: ${staticResult.summary.errors}
- Warnings: ${staticResult.summary.warnings}

${staticResult.issues.map((i: any) =>
  `**Line ${i.line}** [${i.severity}]: ${i.message} (${i.rule})`
).join('\n')}

## 🤖 AI Review
${aiReview}

---
*Generated by Mastra Code Review*`;

    // 返回最终结果
    return {
      fileName,       // 文件名
      report,         // 完整的审查报告
      metrics: {      // 关键指标，用于快速评估
        staticIssues: staticResult.summary.total,  // 问题总数
        staticErrors: staticResult.summary.errors, // 错误数量
      },
    };
  },
});

/**
 * ============================================
 * 代码审查工作流定义
 * ============================================
 *
 * 这是完整的代码审查工作流，串联了三个步骤：
 * 1. 静态分析 (staticAnalysisStep)
 * 2. AI 审查 (aiReviewStep)
 * 3. 生成报告 (generateReportStep)
 *
 * 工作流特点：
 * - 顺序执行：每个步骤依赖前一步的输出
 * - 数据流转：通过 schema 定义确保类型安全
 * - 可追溯：每个步骤都有明确的输入输出
 * - 可扩展：可以轻松添加新的步骤
 *
 * 数据流：
 * 输入 → 静态分析 → AI审查 → 生成报告 → 输出
 *
 * 总执行时间：约 5-15 秒
 * - 静态分析：<100ms
 * - AI 审查：5-10秒
 * - 生成报告：<10ms
 */
export const codeReviewWorkflow = createWorkflow({
  // 工作流唯一标识符
  id: 'code-review',

  /**
   * 工作流输入数据结构
   * 这是整个工作流的起点，外部调用时需要提供的数据
   */
  inputSchema: z.object({
    code: z.string(),      // 待审查的源代码
    fileName: z.string(),  // 文件名
  }),

  /**
   * 工作流输出数据结构
   * 这是整个工作流的终点，返回给调用者的数据
   */
  outputSchema: z.object({
    fileName: z.string(),  // 文件名
    report: z.string(),    // 完整的审查报告（Markdown 格式）
    metrics: z.any(),      // 关键指标（问题数、错误数等）
  }),
})
  .then(staticAnalysisStep)    // 步骤1：执行静态分析
  .then(aiReviewStep)          // 步骤2：执行 AI 审查
  .then(generateReportStep);   // 步骤3：生成最终报告

/**
 * 提交工作流定义
 *
 * commit() 方法会：
 * - 验证工作流的完整性
 * - 注册工作流到 Mastra 系统
 * - 使工作流可以被调用
 *
 * 必须调用 commit() 才能使用工作流！
 */
codeReviewWorkflow.commit();
