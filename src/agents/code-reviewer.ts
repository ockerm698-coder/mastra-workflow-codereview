// 导入 Mastra Agent 核心类
import { Agent } from '@mastra/core/agent';
// 导入静态分析工具
import { staticAnalyzerTool } from '../tools/static-analyzer';

/**
 * AI 代码审查代理
 *
 * 这是一个专业的代码审查 AI 代理，使用 OpenAI 的 GPT-4o-mini 模型进行深度代码分析。
 *
 * 核心能力：
 * - 理解代码逻辑和设计意图
 * - 识别潜在的 bug 和逻辑错误
 * - 发现安全漏洞和性能问题
 * - 提供最佳实践建议
 * - 评估代码可读性和可维护性
 *
 * 审查维度：
 * 1. 代码质量：Bug、边界条件、错误处理
 * 2. 安全性：SQL注入、XSS、密钥泄露等
 * 3. 性能：算法效率、内存管理
 * 4. 最佳实践：命名规范、代码结构、可维护性
 * 5. 可读性：清晰度、注释、文档完整性
 *
 * 输出格式：
 * - 简洁的摘要
 * - 严重问题列表
 * - 分类改进建议
 * - 代码优点反馈
 */
export const codeReviewerAgent = new Agent({
  // 代理名称，用于识别和日志记录
  name: 'Code Reviewer',

  /**
   * 代理指令 (System Prompt)
   *
   * 这是提供给 AI 模型的核心指令，定义了代理的角色、职责和输出格式。
   * 好的指令能显著提升审查质量和一致性。
   *
   * 指令结构：
   * 1. 角色定义：你是一个专业的代码审查专家
   * 2. 审查维度：从5个方面分析代码
   * 3. 输出格式：使用固定的 Markdown 格式
   * 4. 语气要求：建设性、教育性的反馈
   */
  instructions: `You are an expert code reviewer. Analyze code for:

1. **Code Quality**: bugs, edge cases, error handling
2. **Security**: SQL injection, XSS, hardcoded secrets
3. **Performance**: inefficient algorithms, memory leaks
4. **Best Practices**: naming, structure, maintainability
5. **Readability**: clarity, documentation

Provide constructive feedback in this format:

**Summary**: Brief overview
**Issues**: List critical problems
**Suggestions**: Improvements by category
**Good Points**: What was done well`,

  /**
   * 使用的 AI 模型
   *
   * 模型选择说明：
   * - gpt-4o-mini: 快速且经济，适合大多数代码审查场景（推荐）
   * - gpt-4o: 更强大但成本更高，适合复杂代码审查
   * - gpt-4-turbo: 平衡性能和成本
   *
   * 格式：'provider/model-name'
   */
  model: 'openai/gpt-4o-mini',

  /**
   * 可用工具列表
   *
   * 代理可以调用这些工具来辅助审查：
   * - staticAnalyzerTool: 静态代码分析工具
   *
   * AI 会智能决定何时调用工具：
   * - 当需要快速检测常见问题时
   * - 当需要补充静态分析结果时
   * - 当需要验证某些模式时
   */
  tools: { staticAnalyzerTool },
});
