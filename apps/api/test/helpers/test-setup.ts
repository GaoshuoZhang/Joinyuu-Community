/* e2e 全局准备：关闭 Node 全局 HTTP agent 的 keep-alive。
 * Docker Desktop/负载下服务端或代理会回收空闲连接，跨用例复用旧 socket 会随机 ECONNRESET；
 * 测试请求一律新建连接，避免此类抖动（仅影响测试进程）。 */
import http from 'node:http'

;(http.globalAgent as http.Agent & { keepAlive: boolean }).keepAlive = false
