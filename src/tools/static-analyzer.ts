// 导入 Mastra 工具创建函数
import { createTool } from '@mastra/core/tools';
// 导入 Zod 用于数据验证和类型定义
import { z } from 'zod';

/**
 * 静态代码分析工具
 *
 * 功能说明：
 * 这是一个基于正则表达式的轻量级静态代码分析工具，用于快速检测代码中的常见问题。
 *
 * 支持的检测规则：
 * 1. no-console: 检测调试语句（console.log、console.debug、console.info）
 * 2. no-hardcoded-secrets: 检测硬编码的敏感信息（密码、API密钥、密钥、令牌）
 * 3. todo-comment: 检测 TODO 注释
 *
 * 问题严重程度分级：
 * - error: 严重问题，必须修复（如硬编码密钥）
 * - warning: 警告，强烈建议修复（如调试语句）
 * - info: 信息提示，建议关注（如 TODO 注释）
 */
export const staticAnalyzerTool = createTool({
  // 工具唯一标识符
  id: 'static-analyzer',

  // 工具描述，说明工具的用途
  description: 'Analyze code for common issues and code smells',

  /**
   * 输入数据结构定义
   * 使用 Zod schema 进行运行时类型验证
   */
  inputSchema: z.object({
    code: z.string(),      // 待分析的源代码（字符串形式）
    fileName: z.string(),  // 文件名（用于上下文信息）
  }),

  /**
   * 输出数据结构定义
   * 包含问题列表和统计摘要
   */
  outputSchema: z.object({
    // 问题列表数组
    issues: z.array(
      z.object({
        line: z.number(),                                  // 问题所在行号
        severity: z.enum(['error', 'warning', 'info']),   // 严重程度
        message: z.string(),                               // 问题描述信息
        rule: z.string(),                                  // 触发的规则名称
      }),
    ),
    // 统计摘要
    summary: z.object({
      total: z.number(),      // 问题总数
      errors: z.number(),     // 错误数量
      warnings: z.number(),   // 警告数量
    }),
  }),

  /**
   * 工具执行函数
   * 核心分析逻辑：逐行检查代码，应用各种规则
   *
   * @param context - 包含 code 和 fileName 的上下文对象
   * @returns 返回问题列表和统计信息
   */
  execute: async ({ context }) => {
    // 解构获取代码和文件名
    const { code, fileName } = context;

    // 将代码按行分割为数组，便于逐行分析
    const lines = code.split('\n');

    // 初始化问题列表
    const issues: any[] = [];

    // 遍历每一行代码进行检查
    lines.forEach((line, idx) => {
      // ============================================
      // 规则 1: 检测调试语句（no-console）
      // ============================================
      // 正则表达式匹配 console.log、console.debug、console.info
      // 这些调试语句不应该出现在生产代码中
      if (/console\.(log|debug|info)/.test(line)) {
        issues.push({
          line: idx + 1,           // 行号（从 1 开始）
          severity: 'warning',     // 警告级别
          message: 'Debug statement found',  // 问题描述
          rule: 'no-console',      // 规则名称
        });
      }

      // ============================================
      // 规则 2: 检测硬编码的敏感信息（no-hardcoded-secrets）
      // ============================================
      // 正则表达式匹配常见的敏感变量赋值模式：
      // - password = "xxx"
      // - apiKey = "xxx" 或 api_key = "xxx" 或 api-key = "xxx"
      // - secret = "xxx"
      // - token = "xxx"
      // 使用 /i 标志进行大小写不敏感匹配
      if (/(password|api[_-]?key|secret|token)\s*=\s*['"][^'"]+['"]/i.test(line)) {
        issues.push({
          line: idx + 1,
          severity: 'error',       // 错误级别（最高优先级）
          message: 'Hardcoded secret detected',  // 发现硬编码密钥
          rule: 'no-hardcoded-secrets',
        });
      }

      // ============================================
      // 规则 3: 检测 TODO 注释（todo-comment）
      // ============================================
      // 正则表达式匹配 TODO 注释：// TODO
      // 帮助开发者追踪未完成的工作
      if (/\/\/\s*TODO/i.test(line)) {
        issues.push({
          line: idx + 1,
          severity: 'info',        // 信息级别
          message: 'TODO comment found',  // 发现 TODO 注释
          rule: 'todo-comment',
        });
      }
    });

    // 统计不同严重程度的问题数量
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;

    // 返回分析结果
    return {
      issues,        // 完整的问题列表
      summary: {     // 统计摘要
        total: issues.length,  // 问题总数
        errors,                // 错误数量
        warnings,              // 警告数量
      },
    };
  },
});
