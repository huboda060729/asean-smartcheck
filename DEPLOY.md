# 部署与凭据安全说明

> 适用范围：ASEAN SmartCheck & RiskGuard 静态站点
> 本文档只描述**仓库现状**；凡未在本机实测过的内容，一律标注【待验证】，不得视为已确认。

## 1. 项目形态

- 本项目是**纯前端静态站点**：只有 HTML / CSS / JavaScript，没有后端服务、没有数据库、没有构建步骤、没有第三方依赖（无 `package.json`、无 `node_modules`）。
- **GitHub Pages 的发布目录是 `docs/`**（仓库根目录下的 `docs` 文件夹，包含 `.nojekyll`）。
- 线上地址形如：`https://<用户名>.github.io/<仓库名>/`。
- 计算全部在浏览器本地完成；当前版本不发送任何网络请求。

```
<repo-root>/
├── README.md
├── DEPLOY.md              ← 本文件
├── tests/
│   └── engine-baseline.js 规则引擎回归测试（Node 内置能力，无依赖）
└── docs/                  ← GitHub Pages 发布目录
    ├── index.html
    ├── styles.css
    ├── app.js             界面交互与结果渲染
    ├── engine.js          风险评分引擎（含内置演示样本）
    ├── background.js      粒子特效 / 鼠标交互（仅装饰）
    ├── favicon.svg
    └── .nojekyll
```

## 2. 本地运行与验证（不新增任何依赖）

因为 `docs/` 内全部是相对路径，**直接用浏览器打开 `docs/index.html` 即可运行**，无需服务器。

若希望更接近线上环境（有 HTTP 层、便于多设备访问），可使用本机已装工具起一个静态服务器：

### 2.1 Python 内置静态服务器（首选，无需安装新依赖）

```bash
# 在仓库根目录执行，把 docs/ 作为网站根目录
python -m http.server 8000 --directory docs
# 然后访问 http://127.0.0.1:8000/
```

Windows 上若 `python` 不可用，可尝试：

```powershell
py -m http.server 8000 --directory docs
```

【待验证】本机是否已安装 Python、`python` / `py` 命令是否可用、版本是否 ≥ 3.7（`--directory` 参数需要 3.7+）。

### 2.2 Node 备用方案（若本机已有 Node；注意 `npx` 会临时联网下载 `serve` 包）

```bash
# 会从 npm 源临时下载 serve 包（需要网络），但不会写入本仓库（不改 package.json、不生成 node_modules）
npx --yes serve docs
# 若不想下载任何包，请改用 2.1 的 Python 内置服务器，或本机已有的静态服务器
```

> **说明**：`npx --yes serve docs` **可能从 npm 源临时下载 `serve` 这个第三方包，并且需要网络**，因此它**不等同于"零下载"**，也**不应被描述为完全离线或不涉及第三方工具**的方案。它不会改动本仓库（不生成 `package.json`、不生成节点模块），但会在 npx 缓存中留下临时包。
> **Python 内置静态服务器（2.1）仍为首选方案**：它随 Python 一起提供，不需要任何下载。

【待验证】本机 Node 版本与 `npx` 是否可用。

## 3. 本地检查命令

```bash
# 1) JavaScript 语法检查（三个前端脚本）
node --check docs/app.js
node --check docs/engine.js
node --check docs/background.js

# 2) 规则引擎回归测试（唯一命令，无需依赖）
node tests/engine-baseline.js

# 3) 查看工作区改动
git status --short
git diff

# 4) 检查空白/冲突标记等低级问题
git diff --check
```

回归测试 `tests/engine-baseline.js` 会对内置四个样本（dengue / flu / nipah / insufficient）断言风险分、预警等级、拒答状态、人工复核状态、置信度与关键输出字段；失败时会打印"字段 / 期望 / 实际"的可定位差异，并以非零退出码结束。

## 4. 修改 → 测试 → 审查 → 提交 → 部署（分离流程）

**建议严格分步，不要一步到位：**

1. **本地修改**：只改需要改的文件；不要顺手重构无关模块。
2. **本地验证**：
   ```bash
   node --check docs/app.js
   node tests/engine-baseline.js
   ```
   若改动涉及界面，另需在浏览器中人工核对结果页（含打印预览）。
3. **代码审查**：
   ```bash
   git status --short
   git diff
   git diff --check
   ```
   确认改动范围与预期一致，且没有意外改动 `docs/engine.js`。
4. **提交（本地）**：
   ```bash
   git add <明确的文件列表>      # 避免 git add -A 误收临时文件
   git commit -m "<说明>"
   ```
5. **推送与部署**：
   ```bash
   git push origin main
   ```
   推送成功后，GitHub Pages 会重新构建 `docs/` 目录下的站点。
   【待验证】本机 git 凭据是否已配置、当前账号对本仓库是否具备写权限、Pages 构建策略与耗时，均需在本机实测确认。

> **注意**：本地修改、提交、推送是三个独立动作。本地改完并**不会**改变线上版本，只有推送（并等待 Pages 重建）之后线上才会变化。

## 5. 凭据安全规则（必须遵守）

1. **绝不**把 API Key、GitHub Token、密码等写进前端 JS / HTML、公开仓库或任何文档。
   - 前端代码对访问者完全可见，写在里面的任何密钥都等同于公开泄露。
2. **绝不**把凭据值粘贴到对话、Issue、提交信息、日志或截图中。
3. 优先使用 **Git Credential Manager / ssh-agent** 等本机凭据机制，或使用作用域最小、有效期最短的令牌。
4. 令牌权限遵循**最小必要**原则：仅在确需写代码时授予仓库内容写权限，用完即撤销。
5. 若凭据曾以明文形式出现在对话、日志、截图或提交中，**应立即撤销（Revoke）或轮换（Rotate）**：
   - 撤销后务必确认**是否仍有其它有效凭据**（例如其它令牌、SSH key、凭据管理器中的缓存），避免留有余量。
   - 轮换后重新验证部署链路是否仍然可用。

> 本项目开发过程中确实出现过凭据以明文形式暴露的情况。**其具体值不记录在本文档中**，也不应记录在任何仓库文件里。请按第 5 条自行撤销/轮换，并检查是否仍有其它有效凭据。

## 6. 当前版本的能力边界（避免误报）

为避免把"演示"当成"已实现"，特此声明当前 `docs/` 版本的实际状态：

| 能力 | 状态 |
| --- | --- |
| 规则评分引擎（风险分、预警分级、可疑病原排序、证据链） | ✅ 已实现（纯浏览器本地规则） |
| 真实检索（RAG）/ 知识库引用 | ❌ 未实现 |
| 大模型（如 DeepSeek）解释 | ❌ 未实现（当前无任何网络请求） |
| 数据持久化（数据库 / 本地存储） | ❌ 未实现（日志仅存内存，刷新即丢失） |
| 登录与权限控制 | ❌ 未实现 |
| 真正的 PDF 自动生成 | ❌ 未实现。界面的"打印报告"调用的是**浏览器打印功能**，需用户自行"另存为 PDF"，不等同于服务端自动生成 PDF |

## 7. 未验证事项汇总（交付前需在本机确认）

- 【待验证】本机 Python / Node 的可用性与版本。
- 【待验证】本机 git 凭据配置状态，以及是否具备推送权限。
- 【待验证】推送后 GitHub Pages 的构建结果与实际生效时间。
- 【待验证】打印预览在不同浏览器与纸张尺寸下的排版效果。

> 本文档编写时**未执行任何推送或部署操作**，仓库中的本地修改不会影响线上版本。
