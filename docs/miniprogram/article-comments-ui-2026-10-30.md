# 文章评论区优化 · 2026-10-30

## 改动

小程序 `pkg/pages/article/detail` 与移动 Web `ArticleComments.vue` 同步调整，保留原有评论接口、分页、身份过滤及删除确认。

- 评论标题与数量分层；编辑区置于列表前，提供可见的“写评论”标签、浅底输入边界、200 字计数及有上限的自动增高。
- 单一发表身份直接说明，多身份使用各端 TDesign CheckTag 并换行排列，至少 44px 高；移除原有横向滚动的自建身份按钮。
- 提示与发表按钮明确分组；发表评论期间锁定文本与身份，失败时保留草稿并显示就近错误，修改正文后清除旧错误。
- 头像、昵称和正文按同一基线对齐；时间移至昵称下方，身份标签与长昵称可换行，正文保留换行并支持长链接断行。
- 小程序匿名态不再使用旧账号缓存展示发表身份或本人删除权限；游客按钮明确显示“登录后评论”。
- 颜色、圆角与间距沿用两端语义令牌；平板评论头像固定 32px，正文缩进同步。

## 依据与验证

- 使用 ui-ux-pro-max；首轮搜索不够贴切，收窄至 `input labels error placement` 后采用 Forms 的可见标签与就近错误建议。
- 通过 TDesign MCP 查询两端组件列表、Textarea/CheckTag/Button/Tag 文档及 Textarea/CheckTag DOM；小程序 autosize 使用 minHeight/maxHeight，Web 使用 minRows/maxRows，未混用 API。
- 小程序：`npm test` 41 项通过，检查 148 个 JS、94 个 JSON、78 个注册页面及 86 个 Less 编译；`npm run lint` 通过。新增异步失败保留草稿/身份与匿名缓存隔离测试。
- Web：typecheck、lint、52 个测试文件/162 项测试、生产 build 通过；既有评论分页与身份更新回归测试通过。
- 实际画面：A1011 空态、SU1011 现有评论、空内容就近校验；365px 手机浅色/深色、375px iPhone、744px iPad；Web 游客空态及真实评论页。未发布或删除真实评论。
- 切换机型后 automation_navigate 曾超时并停在首页，相关截图未直接作为验收；改用 simulator_open_page 编译目标页后重新截图，核对实际文章画面。完成后恢复 HUAWEI Pura 80 Pro 与浅色模式。
- 多身份及分页行为有现有自动测试覆盖；多身份长标签、极长昵称的实际账号视觉组合、横屏、最大系统字号和真机软键盘尚未完成本轮视觉验证。

## 截图

本机临时目录：`C:\Users\Gaoshuo\AppData\Local\Temp`，图片不加入 Git。

| 文件名 | 内容 |
| --- | --- |
| `joinyuu-comment-before.jpg` | 修改前 |
| `joinyuu-comment-after.jpg` | 修改后空态与输入区 |
| `joinyuu-comment-after-bottom.jpg` | 空态末段 |
| `joinyuu-comment-list-after.jpg` | 现有评论与作者/时间布局 |
| `joinyuu-comment-validation.jpg` | 空内容校验 |
| `joinyuu-comment-dark.jpg` | 深色 |
| `joinyuu-comment-375.jpg` | 375px iPhone |
| `joinyuu-comment-tablet.jpg` | 744px iPad |
