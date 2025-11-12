// 首先加载 polyfills（必须在 Mastra 之前）
import '../polyfills';

// 导入 Mastra 核心类
import { Mastra } from '@mastra/core/mastra';
// 导入代码审查工作流
import { codeReviewWorkflow } from '../workflows/code-review-workflow';
// 导入代码审查 AI 代理
import { codeReviewerAgent } from '../agents/code-reviewer';

/**
 * ============================================
 * Mastra 实例配置
 * ============================================
 *
 * 这是整个应用的核心配置文件，负责初始化 Mastra 框架并注册所有组件。
 *
 * Mastra 是一个 AI 工作流编排框架，提供以下核心功能：
 * 1. 工作流管理：定义和执行多步骤的 AI 工作流
 * 2. 代理管理：注册和调用 AI 代理（Agents）
 * 3. 工具集成：为代理提供可用的工具
 * 4. 数据流转：在步骤之间安全传递数据
 *
 * 在这个应用中，Mastra 实例配置了：
 * - 1 个工作流：codeReviewWorkflow（代码审查工作流）
 * - 1 个代理：codeReviewerAgent（AI 代码审查代理）
 *
 * 工作原理：
 * 1. Cloudflare Workers API 接收外部请求
 * 2. 通过 mastra.getWorkflow() 获取注册的工作流
 * 3. 通过 mastra.getAgent() 获取注册的代理
 * 4. 执行工作流，内部自动调用代理和工具
 * 5. 返回处理结果
 *
 * 这种设计的优势：
 * - 集中管理：所有 AI 组件在一处注册
 * - 类型安全：TypeScript 类型推断保证正确使用
 * - 可扩展：轻松添加新的工作流和代理
 * - 解耦：API 层和 AI 逻辑分离
 */
export const mastra = new Mastra({
  // 注册工作流
  // 工作流是一系列步骤的编排，每个步骤可以调用工具或代理
  workflows: { codeReviewWorkflow },

  // 注册 AI 代理
  // 代理是具有特定能力的 AI 助手，可以理解指令并调用工具
  agents: { codeReviewerAgent },
});
