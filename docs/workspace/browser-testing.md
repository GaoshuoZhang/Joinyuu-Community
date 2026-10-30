# 跨端浏览器联调

企业代办专项使用隔离API17757、后台17758与移动Web17759。先在API仓设置AGENCY_BROWSER_FIXTURE=1并执行 `pnpm test:e2e:it --runTestsByPath test/helpers/enterprise-agency-browser.e2e-spec.ts`；它仅重种隔离库，并显式开启测试服务。后台与移动Web构建后分别以PORT=17758/17759、API_PROXY_TARGET=http://127.0.0.1:17757启动 `node server.mjs`。

`scripts/browser/enterprise-services-acceptance.mjs` 使用真实移动Web表单、上传与状态动作验收三类服务，并检查后台开关保存/刷新及服务暂停。设置PLAYWRIGHT_PACKAGE为已安装Playwright的package.json，AGENCY_E2E_FIXTURE为API生成的私有fixture文件，再从根仓运行该脚本；文件含临时令牌，禁止提交或打印。后台另有 `node test/authenticatedE2e.mjs enterprise-agency`，覆盖注册及三类扩展服务列表/详情、受理、补件重提、完成。证据写入后台test/artifacts，包含实际滚动截图及报告。

小程序验收通过wechatide-skill连接开发者工具，运行时只将7757重定向到隔离17757，不改正式配置。编译后须等待实际运行时恢复再安装包装；先安全备份原会话，结束恢复接口、会话及主题。源码编译会清内存包装，不能把触发刷新当成编译已完成。

dual-end-browser-e2e.mjs 验证后台与移动 Web 的既有整套业务流程，不属于单仓单元测试。先启动使用隔离数据的联调环境，并按脚本指定 PLAYWRIGHT_PACKAGE 指向已安装的 Playwright 包；默认保留原本本地 Codex runtime 路径。

脚本包含业务写入，应只连接专用测试账号与隔离测试库，不能在生产或日常数据环境运行。独立仓库安装与构建无需 Playwright；日常迁移验收使用各仓测试及只读健康冒烟。

根仓脚本位于 scripts/browser/dual-end-browser-e2e.mjs，当前对后台 7758、移动端 7759 有端口断言；这不代表可以使用这两个端口上的日常数据，执行前必须确认后端连接隔离库。后台仓 test/authenticatedE2e.mjs 则要求 127.0.0.1:17758，使用其自己的路由清单。二者都依赖固定测试账号和种子业务编号，数据集变更后需先核对 fixture，不能将旧报告的通过结果当作当前验证。
