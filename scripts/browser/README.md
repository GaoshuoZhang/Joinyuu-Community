# 跨端浏览器联调

dual-end-browser-e2e.mjs 验证后台与移动 Web 的既有整套业务流程，不属于单仓单元测试。先启动使用隔离数据的联调环境，并按脚本指定 PLAYWRIGHT_PACKAGE 指向已安装的 Playwright 包；默认保留原本本地 Codex runtime 路径。

脚本包含业务写入，应只连接专用测试账号与隔离测试库，不能在生产或日常数据环境运行。独立仓库安装与构建无需 Playwright；日常迁移验收使用各仓测试及只读健康冒烟。
