# ghostty-latex-render

[![npm](https://img.shields.io/npm/v/ghostty-latex-render)](https://www.npmjs.com/package/ghostty-latex-render)

[English](README.md) · **简体中文**

把 Claude Code 回答里的 LaTeX 实时渲染成**论文级别的数学公式图片**，显示在
**Ghostty 的分屏窗格**里 —— 不用 fork 终端，也不用离开终端。

装好后运行一次 `cc-latex setup`，此后：只要 Ghostty 里的 Claude Code 回答包含公式，
旁边就会自动打开一个窗格显示排版好的数学公式。后续回答会更新同一个窗格。

![ghostty-latex-render 运行效果 —— 左侧是 Claude Code，右侧自动打开的窗格里是渲染好的公式](assets/screenshot.jpg)

完整的设计思路见 [`docs/ghostty-latex-render-design.md`](docs/ghostty-latex-render-design.md)。

## 工作原理

<p align="center">
  <img src="assets/how-it-works.png" alt="流程：包含公式的 Claude Code 回答触发 Stop hook；cc-latex 提取出 LaTeX，通过 AppleScript 分屏 Ghostty，watcher 把公式渲染成 MathJax → SVG → PNG，再用 Kitty 图形协议绘制到右侧窗格" width="820">
</p>

- **检测**发生在应用层：Claude Code 的 **`Stop` hook** 读取刚完成回答的 transcript，
  提取出 `$…$` / `$$…$$` / `\(…\)` / `\[…\]`。
- **分屏**通过 **Ghostty 原生的 AppleScript** `split` 命令 + surface-config
  `command` 打开（需要 Ghostty ≥ 1.3）。不依赖按键模拟，也不需要辅助功能（Accessibility）权限。
- **渲染**走 **MathJax → SVG → PNG**（`sharp`），再用 Ghostty 支持的 **Kitty 图形协议**
  绘制。不需要系统 TeX，不需要 `chafa`/`timg`，也不需要 `fswatch`。

只有两个 npm 依赖：`mathjax-full` 和 `sharp`。

## 环境要求

- **Ghostty ≥ 1.3**（AppleScript `split` 命令所需），macOS 上。
- **Node ≥ 18。**
- Claude Code，在 Ghostty 窗口里运行。

## 安装

从 npm 安装，然后注册一次 hook：

```bash
npm install -g ghostty-latex-render
cc-latex setup
```

<details>
<summary>或者从源码安装</summary>

```bash
git clone https://github.com/YangLiu14/ghostty-latex-render.git
cd ghostty-latex-render
npm install && npm link
cc-latex setup
```
</details>

`setup` 会把 hook 写入 `~/.claude/settings.json`（加 `--project` 则写入单个项目的
`.claude/settings.json`）。**重启正在运行的 Claude Code 会话**，让它加载新的 hook。

就这样。在 Ghostty 里打开 Claude Code，问一个带数学公式的问题即可。

## 验证是否生效

1. **Ghostty 图片支持** —— 在 Ghostty 窗口里：

   ```bash
   cc-latex demo 'V(s)=\mathbb{E}\left[\sum_{t=0}^{\infty}\gamma^t r_t \mid s_0=s\right]'
   ```

   你应该看到排版好的公式图片（而不是一大堆 `_Ga=T,f=100…` 的乱码文本）。

2. **自动分屏** —— 在 Ghostty 里运行 Claude Code 并提问：*“用 LaTeX 写出二次方程求根公式”*。
   回答结束后，右侧应当打开一个窗格并显示渲染好的公式。

## 命令

| 命令 | 作用 |
|---|---|
| `cc-latex setup [--project] [--direction right\|left\|up\|down] [--scale N]` | 安装 Stop hook。 |
| `cc-latex uninstall [--project]` | 移除 hook。 |
| `cc-latex status` | 显示 hook 是否已安装、以及当前有哪些预览在运行。 |
| `cc-latex demo '<tex>'` | 渲染单个公式（冒烟测试）。 |
| `cc-latex preview [--session PATH] [--once] [--cols N] [--native]` | 手动运行 watcher（通常会自动启动）。 |

### 在多个公式间导航

当一个回答包含多个公式时，窗格会显示一个**带编号的菜单**；选中的公式会在下方放大显示。
在（自动打开的）窗格里：

- **点击**某个菜单行，或按 **1–9**，跳转到对应公式。
- **`j`/`k`** 或**方向键**在公式间移动。
- **`y`** 把当前聚焦公式的 LaTeX 复制到剪贴板。
- **`q`** 关闭窗格。

窗格会**匹配你的终端主题** —— 它查询 Ghostty 的背景/前景色（OSC 10/11），并据此渲染数学
公式和界面外观；如果终端没有响应，则回退到默认的深色主题。

单个公式会直接显示。无法解析的公式会被跳过。
（非交互式运行 —— `--once`，或输出被管道重定向 —— 会改为把所有公式堆叠渲染。）

### 尺寸

每个公式按其**自然尺寸**渲染（由公式本身推导得出），并以窗格宽度为上限；当你调整窗格大小时
会重绘。用 `--scale`（默认 `1.0`）调整整体大小：更大例如 `cc-latex setup --scale 1.4`，
更小用 `--scale 0.7`。你也可以在环境变量里设置 `CC_LATEX_SCALE`。

自动打开的窗格在启动时会把自己缩小到**窗口的约 1/3**（`--fit`），把较大的三分之二留给
Claude Code 窗格。它通过不断调整分屏大小、直到列数达到目标值来实现 —— 自校准，因此不依赖
显示器 DPI。（手动运行 `cc-latex preview` 而不加 `--fit`，可保持默认的 50/50 分屏。）

### 哪些公式会被显示

为了减少干扰，只有**复杂**公式才会渲染 —— 即那些带有纯文本无法表达的二维/排版结构的公式
（分数、求和/积分、矩阵、根号、带花括号的上下标、真正的方程式）。平凡的行内数学本身已经清晰
可读，因此会被跳过：单个符号（`$x$`、`$\gamma$`）、简单的上下标（`$x_i$`、`$x^2$`）、或简单
的乘积（`$ab$`、`$a\cdot b$`）。

如果一个回答里只有平凡的数学，就不会打开窗格。要渲染**所有**公式，传入 `--all`
（`cc-latex preview --all`），或在启动 Claude Code 前在环境里设置 `CC_LATEX_ALL=1`
（自动打开的窗格会继承它）。

## 卸载

```bash
cc-latex uninstall                 # 从 ~/.claude/settings.json 移除 Stop hook
cc-latex uninstall --project       # ...或从当前项目的 .claude/settings.json 移除

npm uninstall -g ghostty-latex-render   # 如果是全局安装的
npm unlink -g ghostty-latex-render      # 如果你用了 `npm link`

rm -rf "$TMPDIR/cc-latex"          # 可选：清除锁/日志/wrapper 文件
```

`cc-latex uninstall` 只会移除我们自己的 hook 条目 —— 你 `settings.json` 里的其他 hook
不受影响。运行 `cc-latex status` 确认它已被移除。关闭所有打开的预览窗格（或在窗格里按 `q`）。
