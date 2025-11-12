/**
 * ============================================
 * Cloudflare Workers Polyfills
 * ============================================
 *
 * 修复 Cloudflare Workers 环境中缺失的 Web API
 */

/**
 * AbortSignal.addEventListener Polyfill
 *
 * 问题：Cloudflare Workers 的 AbortSignal 不支持 addEventListener/removeEventListener
 * 解决：使用 Map 存储监听器，通过 onabort 触发
 */
if (typeof AbortSignal !== 'undefined') {
  const originalAbortSignal = AbortSignal.prototype;

  // 检查是否已经有 addEventListener
  if (!originalAbortSignal.addEventListener) {
    // 定义监听器函数类型
    type ListenerFunction = (event: Event) => void;

    // 为每个 AbortSignal 实例创建一个监听器集合
    const listenersMap = new WeakMap<AbortSignal, Map<ListenerFunction, ListenerFunction>>();

    // 添加事件监听器
    // @ts-ignore
    AbortSignal.prototype.addEventListener = function(
      type: string,
      listener: ListenerFunction
    ) {
      if (type !== 'abort') return; // 只支持 abort 事件

      // 获取或创建监听器集合
      let listeners = listenersMap.get(this);
      if (!listeners) {
        listeners = new Map();
        listenersMap.set(this, listeners);
      }

      // 如果已经添加过，不重复添加
      if (listeners.has(listener)) return;

      // 保存原始的 onabort
      const originalOnAbort = this.onabort;

      // 创建包装函数
      const wrappedListener = (event: Event) => {
        listener.call(this, event);
      };

      // 存储监听器映射
      listeners.set(listener, wrappedListener);

      // 设置新的 onabort，调用所有监听器
      this.onabort = (event: Event) => {
        // 先调用原始的 onabort
        if (originalOnAbort) {
          originalOnAbort.call(this, event);
        }

        // 调用所有通过 addEventListener 添加的监听器
        const currentListeners = listenersMap.get(this);
        if (currentListeners) {
          currentListeners.forEach((wrappedFn) => {
            wrappedFn.call(this, event);
          });
        }
      };
    };

    // 移除事件监听器
    // @ts-ignore
    AbortSignal.prototype.removeEventListener = function(
      type: string,
      listener: ListenerFunction
    ) {
      if (type !== 'abort') return;

      const listeners = listenersMap.get(this);
      if (!listeners) return;

      // 移除监听器
      listeners.delete(listener);

      // 如果没有监听器了，清理
      if (listeners.size === 0) {
        listenersMap.delete(this);
        this.onabort = null;
      }
    };

    console.log('✅ AbortSignal.addEventListener polyfill installed');
  }
}
