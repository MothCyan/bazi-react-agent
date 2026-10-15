/**
 * 给任意 Promise 加一个硬上限：即使底层连接卡在 DNS/握手阶段（AbortSignal 无效的情况），
 * 也保证在 ms 毫秒后以可读错误结束，避免请求永久挂起。
 */
export function withDeadline(promise, ms, message) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
