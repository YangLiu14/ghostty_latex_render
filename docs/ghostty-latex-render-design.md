# 在 Ghostty 终端里实时渲染 Claude Code 回答中的 LaTeX 公式 —— 设计文档

> 状态:设计阶段(待新项目实现)
> 目标读者:接手实现的开发者(很可能就是未来的你 / 一个新 Claude Code 会话)

---

## 1. 项目背景与需求

### 1.1 想要解决的问题

使用 **Claude Code(终端 CLI)** 时,AI 的回答里经常包含 LaTeX 公式(`$...$` 行内、`$$...$$` 块级)。
目前这些公式在终端里**只显示原始文本**(比如你会看到字面量 `$V(s) = \mathbb{E}[\dots]$`),
而不是排版后的数学。希望让它们被**渲染出来**。

### 1.2 最终敲定的需求(经过几轮收敛)

1. **论文级精排** —— 必须是真正渲染出的数学(矢量图片质量),不接受字符画 / Unicode 近似。
2. **轻量** —— 不重写产品、不 fork 终端、不造新终端。小脚本 + 配置即可。
3. **不离开 terminal** —— 整个体验留在 Ghostty 里,不跳浏览器、不开外部 GUI。
4. **实时** —— 每条回答出完即可看到对应公式(消息级刷新即可,不要求逐 token)。

---

## 2. 关键事实(已核实)

这些是决定方案边界的硬约束,实现前必须记住:

### 2.1 终端层

- **Ghostty 没有插件 / 扩展 API。** 可扩展性只有:macOS AppleScript(只能控制窗口/标签/分屏布局,**碰不到单元格内容**)、`libghostty`(把 Ghostty 嵌进你自己的程序 —— 方向相反)。所以**写不了"Ghostty 插件"**。
  - 来源:https://github.com/ghostty-org/ghostty/discussions/2353 、 https://ghostty.org/docs/features/applescript
- **Ghostty 支持 Kitty 图形协议(Kitty graphics protocol),可内联显示图片;不支持 sixel。**
  - 也就是说:**一张渲染好的公式 PNG,Ghostty 完全能贴出来。** Ghostty 作为"显示器"是够格的。
  - 来源:https://github.com/ghostty-org/ghostty/discussions/2496 、 https://news.ycombinator.com/item?id=45801643

### 2.2 应用层(Claude Code)

- Claude Code 的**终端 TUI 不渲染 LaTeX**,无任何设置/环境变量/flag 可开启。(已有社区 feature request。)
- Claude Code 的各个前端(VS Code / JetBrains 扩展、桌面 App)目前**也都不渲染 LaTeX**;VS Code 有第三方 "Claude Code LaTeX" 扩展作为 workaround。网页版未确认。
- Claude Code **自己从不向终端发送图片**(不用 Kitty 协议输出),它只把回答当纯文本输出。
- Claude Code 的 hook 体系里,能接触"显示输出"的有:
  - `MessageDisplay` hook:可通过 `displayContent` 字段**替换显示文本**,但**只能文本换文本**,无法触发图片/特殊渲染;原文仍保留在 transcript。
  - `Stop` hook:assistant 回答结束时触发,可拿到刚产出的消息内容。
  - (完整 hook 列表包含 SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/Stop/MessageDisplay/Notification 等。)

> ⚠️ 实现时请重新确认 `Stop` / `MessageDisplay` hook 的**确切 payload 字段**(官方 hooks 文档),本设计假定能从中拿到"最新 assistant 消息的纯文本"。

---

## 3. 核心架构洞察(为什么这样设计)

### 3.1 那堵墙:论文级 ⊥ 行内

- "论文级"=必须是**图片**。
- "嵌在 Claude Code TUI 回答的原文行内"=**不可能**,因为 TUI 独占屏幕、不断重绘,**任何注入的图片下一次重绘就被盖掉**。
- 这两个约束**直接冲突**。结论:**行内 + 图片 + 不 fork,三者不可兼得。**

### 3.2 破解:分离"渲染显示面"与"TUI"

把渲染显示挪到一个 **Claude Code 管不着的地方** —— 同一个 Ghostty 窗口的**另一个分屏(split pane)**:

- 左屏:Claude Code 正常跑(TUI 完全不受影响)。
- 右屏:一个**完全由我们自己的脚本拥有**的进程,随便用 Kitty 协议贴图片。

这样:
- TUI 不被污染(我们不往左屏注入任何东西)。
- 图片不被重绘清掉(右屏的重绘节奏由我们的脚本自己掌握)。
- **冲突化解。** 代价:公式在**旁边一栏**显示,而非左屏回答的原文行内 —— 这是为换取"论文级 + 不 fork"必须付的代价。

### 3.3 语义从哪来

终端层拿不到"哪段是 AI 回答"的语义(它只有字符网格)。解决:**在应用层(Claude Code hook)拿语义**。
hook 在回答结束时直接把"这条是 assistant 消息、内容是这些"交给我们,我们再从中抽取 LaTeX。

---

## 4. 设计方案

### 4.1 数据流

```
┌──────────────────────┬──────────────────────┐
│  Claude Code (左屏)   │   数学预览 (右屏)      │
│                       │                       │
│  你正常对话…          │   ┌─────────────┐     │
│  回答里有 $V(s)=…$    │   │ V(s) = 𝔼[…] │ ← 真·KaTeX/typst
│                       │   │  论文级图片   │   渲染的 PNG
│  (TUI 不受影响)       │   └─────────────┘     │
└──────────────────────┴──────────────────────┘

Claude Code ──[Stop / MessageDisplay hook]──► 把最新回答里的 $...$ 写到 /tmp/cc-latex/last.tex
                                                       │ (文件监听 / inotify / fswatch)
预览脚本(右屏常驻) ──LaTeX→PNG──► 用 Kitty 协议贴进 Ghostty 右屏
```

### 4.2 两种触发方式(择一)

- **A. hook 触发(推荐)**:配 `Stop`(或 `MessageDisplay`)hook,脚本接收 assistant 文本 → 抽取公式 → 写入约定文件。优点:直接拿到最终文本、最干净。代价:要改 `settings.json`。
- **B. tail transcript(零侵入)**:不配 hook,后台脚本 tail Claude Code 会话 JSONL(`~/.claude/projects/<project>/<session>.jsonl`),抓最新 assistant 消息里的公式。优点:不动 Claude Code 配置。代价:要自己定位会话文件、解析 JSONL。

### 4.3 工具链(都是单文件 / 小依赖,非产品)

| 环节 | 候选 | 推荐 | 备注 |
|---|---|---|---|
| LaTeX → 图片 | `typst`(单二进制) / KaTeX→SVG→PNG(node) / `matplotlib` mathtext / 完整 `tex`+`dvipng`/`dvisvgm` | **typst** 或 **KaTeX** | typst 单二进制最轻;完整 TeX 最正统但重;matplotlib 零 TeX 安装但只支持子集 |
| 图片 → Ghostty(Kitty 协议) | `chafa --format kitty` / `timg` / `viu` | **chafa** 或 **timg** | 都会说 Kitty 协议;Ghostty 不支持 sixel,务必用 kitty 格式 |
| 文件监听 | `fswatch`(macOS) / 脚本内轮询 | `fswatch` | 触发右屏重新渲染 |

### 4.4 右屏预览脚本职责(伪代码)

```
watch(/tmp/cc-latex/last.tex):
    on change:
        latex = read(file)
        for each $...$ / $$...$$ block:
            png = render_with_typst_or_katex(block)     # 论文级
            clear_pane()
            show(png, protocol="kitty")                  # chafa/timg 贴图
```

### 4.5 抽取逻辑要点

- 同时处理行内 `$...$` 与块级 `$$...$$`(注意转义 `\$`、代码块里的 `$` 要排除)。
- 一条回答可能有多个公式 → 右屏可纵向堆叠 / 或只显示最新一条 / 或可翻页。
- typst 与 LaTeX 语法不完全一致:若选 typst,需要一层 LaTeX→typst 的数学语法适配,或直接用 KaTeX/TeX 以避免转换损耗。**复杂公式(`\underbrace` + 文本标注、`\mathbb`、宏包)优先用完整 TeX 或 KaTeX,兼容性最好。**

---

## 5. 取舍清单(诚实记录)

- ✅ 真·论文级(矢量渲染图片)
- ✅ 不离开 terminal(Ghostty 分屏内)
- ✅ 实时(每条回答出完即刷新,消息级)
- ✅ 轻量(小脚本 + 配置 + 两三个小工具,无 fork、无新产品)
- ⚠️ **不是行内**:公式在右屏单独显示,非左屏原文行内(为"论文级 + 不 fork"付的必要代价)
- ⚠️ 需装 typst/KaTeX + chafa/timg + fswatch,并(若选触发方式 A)加一条 hook 改 `settings.json`
- ⚠️ hook payload 字段、会话 JSONL 结构需在实现时按当时官方文档复核

### 更省的退路

不要自动刷新,**绑一个快捷键"渲染上一条回答"**,触发时把最新公式渲染成图弹在分屏里。适合"只偶尔想看精排"的场景。

---

## 6. 被否决的方案(及原因)

| 方案 | 否决原因 |
|---|---|
| 给 Ghostty 写插件 | Ghostty 没有插件 API |
| Fork Ghostty 源码改渲染器 | 违反"不重写产品/轻量";且终端层无"哪段是 AI 回答"的语义,TUI 重绘会盖掉注入的图 |
| `MessageDisplay` hook 里直接塞 Kitty 图片转义码 | 该 hook 只能文本换文本;即便单帧侥幸显示,TUI 滚动/重绘也会破坏,极不可靠 |
| 换 Claude Code 的其他前端(VS Code/桌面/网页) | 目前各前端都不渲染 LaTeX,且违反"不离开 terminal" |
| 字符画 / Unicode 近似(sympy pprint 等) | 不是论文级;`\underbrace`+中文标注、`\mathbb`、花体等装饰性排版会退化 |
| 把终端流管道过滤后渲染 | Claude Code 是交互式 TUI,管道过滤会破坏其屏幕控制 |

---

## 7. 实现路线(给新项目的下一步)

1. **选型确认**:LaTeX 引擎(建议先 KaTeX 或完整 TeX,兼容性优先)+ 贴图工具(chafa/timg)+ 监听(fswatch)。先各自单独跑通"一段 `$$...$$` → 终端里出图片"。
2. **写右屏预览脚本**:文件监听 → 抽取公式 → 渲染 → Kitty 协议贴图;先用手写的 `last.tex` 测试。
3. **接触发**:先做**方式 B(tail transcript)**最快验证端到端(零配置);跑通后视需要再换 **方式 A(hook)** 求更干净的语义。
4. **接 Ghostty 分屏**:确定如何在左屏跑 Claude Code、右屏常驻预览脚本(Ghostty split / 单独 tab)。
5. **打磨抽取**:多公式堆叠/翻页、代码块内 `$` 的排除、块级 vs 行内。
6. **(可选)快捷键手动触发版**作为退路。

### 验证标准

- 在左屏 Claude Code 让 AI 输出含 `$$...$$` 的回答 → 右屏在数秒内出现**排版正确的公式图片**,且左屏 TUI 滚动/重绘时右屏不崩。
