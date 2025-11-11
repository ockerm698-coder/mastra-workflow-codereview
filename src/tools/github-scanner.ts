// 导入 Mastra 工具创建函数
import { createTool } from '@mastra/core/tools';
// 导入 Zod 用于数据验证和类型定义
import { z } from 'zod';

/**
 * ============================================
 * GitHub 仓库扫描工具
 * ============================================
 *
 * 功能说明：
 * 这个工具用于从 GitHub 仓库中获取所有代码文件的内容。
 *
 * 主要功能：
 * 1. 连接到 GitHub API
 * 2. 递归遍历仓库目录树
 * 3. 过滤并获取代码文件（排除二进制文件、依赖等）
 * 4. 返回文件路径和内容列表
 *
 * 支持的文件类型：
 * - JavaScript/TypeScript (.js, .jsx, .ts, .tsx)
 * - Python (.py)
 * - Java (.java)
 * - Go (.go)
 * - Rust (.rs)
 * - C/C++ (.c, .cpp, .h, .hpp)
 * - 其他常见编程语言
 *
 * 排除的文件/目录：
 * - node_modules/
 * - .git/
 * - dist/, build/
 * - 二进制文件
 * - 图片、视频等媒体文件
 */

// 需要扫描的文件扩展名
const CODE_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx',
  '.py', '.java', '.go', '.rs',
  '.c', '.cpp', '.h', '.hpp',
  '.rb', '.php', '.swift', '.kt',
  '.sh', '.bash', '.sql',
];

// 需要忽略的目录
const IGNORED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.vscode',
  '.idea',
  'vendor',
  '__pycache__',
];

/**
 * GitHub 仓库扫描工具
 */
export const githubScannerTool = createTool({
  // 工具唯一标识符
  id: 'github-scanner',

  // 工具描述
  description: 'Scan GitHub repository and fetch all code files',

  /**
   * 输入数据结构定义
   */
  inputSchema: z.object({
    owner: z.string(),              // 仓库所有者（用户名或组织名）
    repo: z.string(),               // 仓库名称
    branch: z.string().optional(),  // 分支名（默认为主分支）
    githubToken: z.string(),        // GitHub Personal Access Token
  }),

  /**
   * 输出数据结构定义
   */
  outputSchema: z.object({
    files: z.array(
      z.object({
        path: z.string(),       // 文件路径
        content: z.string(),    // 文件内容
        size: z.number(),       // 文件大小（字节）
      }),
    ),
    summary: z.object({
      totalFiles: z.number(),   // 扫描的文件总数
      totalSize: z.number(),    // 总大小（字节）
    }),
  }),

  /**
   * 工具执行函数
   *
   * @param context - 包含 owner、repo、branch、githubToken 的上下文对象
   * @returns 返回文件列表和统计信息
   */
  execute: async ({ context }) => {
    const { owner, repo, branch = 'main', githubToken } = context;

    /**
     * 获取仓库的目录树
     *
     * GitHub API 文档：
     * https://docs.github.com/en/rest/git/trees
     */
    const getTree = async (sha: string = branch): Promise<any> => {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`,
        {
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch repository tree: ${response.status} ${response.ok} ${response.statusText} ${githubToken}`);
      }

      return response.json();
    };

    /**
     * 获取文件内容
     *
     * @param path - 文件路径
     * @returns 文件内容（Base64 解码后的文本）
     */
    const getFileContent = async (path: string): Promise<string> => {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
        {
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch file ${path}: ${response.statusText}`);
      }

      const data = await response.json();

      // GitHub API 返回的内容是 Base64 编码的
      // 需要解码为文本
      if (data.content) {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }

      return '';
    };

    /**
     * 检查文件是否应该被扫描
     *
     * @param path - 文件路径
     * @returns 是否应该扫描此文件
     */
    const shouldScanFile = (path: string): boolean => {
      // 检查是否在忽略的目录中
      for (const ignoredDir of IGNORED_DIRS) {
        if (path.includes(`${ignoredDir}/`) || path.startsWith(`${ignoredDir}/`)) {
          return false;
        }
      }

      // 检查文件扩展名
      const hasCodeExtension = CODE_EXTENSIONS.some(ext => path.endsWith(ext));
      return hasCodeExtension;
    };

    try {
      // 1. 获取仓库的完整目录树
      console.log(`Fetching repository tree for ${owner}/${repo}@${branch}...`);
      const tree = await getTree();

      // 2. 过滤出需要扫描的代码文件
      const codeFiles = tree.tree.filter(
        (item: any) => item.type === 'blob' && shouldScanFile(item.path),
      );

      console.log(`Found ${codeFiles.length} code files to scan`);

      // 3. 获取所有文件的内容（并行请求，提高效率）
      const files = await Promise.all(
        codeFiles.map(async (file: any) => {
          try {
            const content = await getFileContent(file.path);
            return {
              path: file.path,
              content,
              size: file.size,
            };
          } catch (error: any) {
            console.error(`Error fetching file ${file.path}:`, error.message);
            // 跳过无法获取的文件
            return null;
          }
        }),
      );

      // 4. 过滤掉获取失败的文件
      const validFiles = files.filter(f => f !== null) as Array<{
        path: string;
        content: string;
        size: number;
      }>;

      // 5. 计算统计信息
      const totalSize = validFiles.reduce((sum, f) => sum + f.size, 0);

      return {
        files: validFiles,
        summary: {
          totalFiles: validFiles.length,
          totalSize,
        },
      };
    } catch (error: any) {
      throw new Error(`GitHub scanner error: ${error.message}`);
    }
  },
});
