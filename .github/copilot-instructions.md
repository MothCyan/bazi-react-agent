# 观命 · 八字命理智能分析平台

React 19 + Vite（JavaScript ES Modules）前端，Express 5 后端，`node:test` 测试。

## 项目约定（改动前请先读）

- 全项目使用 **JavaScript ES Modules**，不使用 TypeScript。
- **历法必须由 `lunar-javascript` 计算**（`server/chart.js` 是唯一排盘入口）。四柱、纳音、藏干、十神一律取自 `LunarUtil` 查表，禁止手写干支表或让模型推算排盘。
- 模型只负责选择工具与撰写报告；工具参数不得影响排盘结果（`calculate_bazi` 忽略入参，与请求输入绑定）。
- **时柱未知的名人绝不能标为"四柱完全匹配"**（`exact` 恒为 `false`，只比对应位置上已知的柱）。
- 报告与匹配结果必须说明局限：五行计数不等于旺衰；命理不是科学预测。
- **密钥只保存在被 Git 忽略的服务端 `data/` 目录**，不得返回前端、写入日志或浏览器存储。接口只返回 `hasKey`。
- 工具轨迹只展示动作摘要与工具结果，不展示模型隐藏思维链。
- 接口错误统一返回 `{ error: '中文可读说明' }`，参数校验用 zod。

## 常用命令

```bash
npm run dev     # 后端 3001 + 前端 5173（concurrently）
npm test        # node --test，全部 29 项
npm run lint    # oxlint，应为 0 warning / 0 error
npm run build   # 构建到 dist/，npm start 后由后端托管
```

## 校验要求

新增功能后请确保：`npm test` 全部通过、`npm run lint` 无警告、`npm run build` 成功。

## 完成任务清单

- [x] 明确需求：React + Express 八字排盘、ReAct Agent、名人匹配和 LLM 配置。
- [x] 初始化 Vite React 工程。
- [x] 实现并定制前后端（排盘、Agent、名人库、模型设置、报告导出）。
- [x] 无需额外 VS Code 扩展。
- [x] 编译、测试并检查诊断（29 项测试通过、lint 0 警告、构建成功）。
- [x] 创建运行任务（`.vscode/tasks.json`）。
- [x] 启动本地预览（前后端开发服务器）。
- [x] 完善 README。
