---
name: WriteSpace 留白
description: 面向未来自动化时代生活探索的温暖、清晰的工作台
colors:
  bg: "#f8f8f4"
  surface: "#ffffff"
  surface-2: "#f2f5f0"
  ink: "#1d2924"
  muted: "#65736b"
  line: "#e3e9e2"
  green: "#28735a"
  green-dark: "#1e5e49"
  green-soft: "#e8f2eb"
  danger: "#b43d36"
typography:
  display:
    fontFamily: "Noto Sans SC, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "31px"
    fontWeight: 780
    lineHeight: 1.3
    letterSpacing: "-.025em"
  headline:
    fontFamily: "Noto Sans SC, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "20px"
  title:
    fontFamily: "Noto Sans SC, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: 1.5
  body:
    fontFamily: "Noto Sans SC, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "13px"
    lineHeight: 1.7
  label:
    fontFamily: "Noto Sans SC, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "11px"
rounded:
  control: "9px"
  field: "10px"
  card: "14px"
  panel: "16px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 17px"
  button-primary-hover:
    backgroundColor: "{colors.green-dark}"
  button-secondary:
    backgroundColor: "{colors.green-soft}"
    textColor: "{colors.green}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 17px"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "40px"
    padding: "0 17px"
  search-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "46px"
    padding: "0 15px 0 44px"
  post-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px 21px 18px"
---

# Design System: WriteSpace 留白

## Overview

**Creative North Star: "温暖的未来生活探索工作台"**

页面借用熟悉的社区信息产品形式，让发布、浏览和理解匹配都容易上手。标题与示例表达自动化时代的生活探索：人们自由选择想亲手体验的事，理解曾经的手艺与日常，并找到共同参与的伙伴。温暖的纸白背景承载信息，深墨色正文保持阅读清晰，克制的绿突出操作与匹配状态。整体密度偏紧凑，卡片和留白让不同任务仍然容易分辨。

**Key Characteristics:**

- 清晰的中文无衬线层级与易扫读的信息卡片。
- 绿色主操作、浅绿状态和少量暖色人物标记。
- 桌面双栏、窄屏单栏的社区工作区。

## Colors

主色服务于行动和状态；中性色承担长时间浏览所需的阅读背景。

### Primary

- **社区绿** (`green`)：主要按钮、文字操作和匹配强调；悬停转为 `green-dark`，浅色选中态使用 `green-soft`。

### Neutral

- **纸白** (`bg`)：页面背景；**纯白** (`surface`)：卡片、表单和面板。
- **浅灰绿** (`surface-2`)：轻量的按钮悬停与图标底；**深墨** (`ink`)：主要文字。
- **灰绿** (`muted`)：次要说明；**柔和分隔线** (`line`)：卡片边界和分组。
- **错误红** (`danger`)：表单错误信息。

**The Action Green Rule.** 绿色标识可执行的操作和选中状态；大面积阅读区域保持中性。

## Typography

全站采用 `Noto Sans SC`、`PingFang SC`、`Microsoft YaHei` 和系统无衬线回退。字形以易读、熟悉为主，没有装饰性显示字体。

### Hierarchy

- **Display**：页面主标题（桌面 31px；760px 以下 25px；420px 以下 23px）。
- **Headline**：区块标题（桌面 20px；窄屏 18px）。
- **Title**：卡片标题（16px，行高 1.5）。
- **Body**：说明和卡片摘要（通常 13px，行高约 1.7）。
- **Label**：时间、来源及辅助说明（约 11px）；不要仅靠浅色区分意义。

## Layout

内容最大宽度为 1272px，桌面两栏为弹性信息流加 350px 匹配区，栏间距 38px。960px 以下匹配区缩到 310px，间距为 22px；760px 以下改为单栏，匹配区排在信息流之前。外边距从桌面 28px 逐步收至移动端 16px。卡片列表间距为 12px，筛选项可换行，420px 以下表单双列也改为单列。

## Elevation & Depth

主要靠白色表面、细边框和浅色底区分层次。帖子卡片静止时无阴影，悬停使用轻阴影 `0 12px 36px rgba(33,55,42,.08)` 并上移 1px；匹配面板有更淡的常驻阴影。模态对话框使用较深阴影和半透明遮罩。

**The Quiet Surface Rule.** 普通内容保持平稳；升起效果主要反馈悬停或突出对话框。

## Shapes

按钮圆角为 9px，搜索框为 10px，帖子卡片为 14px，匹配面板与对话框为 16px。边框通常为 1px 的柔和灰绿，头像则为圆形。较小的筛选项和状态标签使用更紧的圆角，保持控件与内容容器的层级差。

## Components

### Buttons

主按钮为绿色填充、白字、最小高度 40px；悬停变深并上移 1px。次按钮使用浅绿底，幽灵按钮为白底加细边框。键盘焦点显示 3px 浅绿外轮廓；禁用态降低不透明度。

### Chips

筛选项是可换行的小型文字按钮，默认透明；悬停出现浅底，选中态使用浅绿底、深绿文字和较高字重。选中状态在标记中同步以 `aria-pressed` 表达。

### Cards / Containers

帖子卡片为白底、细边框和 14px 圆角，桌面内边距约 20px；悬停才出现轻阴影。匹配面板为 16px 圆角的独立容器，内部结果由分隔线组织。

### Inputs / Fields

搜索框为 46px 高、白底和细边框，左侧内嵌搜索图标。表单输入为 8px 圆角；聚焦时边框转绿并出现浅绿外晕。错误文本使用错误红。

### Navigation

页头为带底边线的白色粘性导航，左侧品牌与“未来生活演示 · 真实地图”说明，右侧保留发布入口。地图区域不展示固定街区名称；未定位时提示选择区域。760px 以下隐藏页头辅助说明，保留主要操作。

### Live Map

真实底图是唯一的地图表面。地图上的需求与分享用不同颜色的小型文字标记；蓝点只代表本次使用的出发点。地图上方提供定位与地点搜索，搜索结果为可扫读的纵向名称／地址列表。任务详情展示“见面后先做”、路线和本人发布的编辑／删除操作；手机端缩短地图前的说明，让地图更早进入首屏。无权限、无密钥和服务故障有明确的恢复提示，不伪造附近任务或热度。

## Do's and Don'ts

### Do:

- **Do** 保持清晰的操作层级，让绿色主按钮和浅绿选中态延续现有用法。
- **Do** 保留可见的键盘焦点、文字提示和减少动态效果的媒体查询。
- **Do** 在窄屏用单栏顺序呈现匹配区与信息流。

### Don't:

- **Don't** 把演示内容或匹配结果视觉上包装成已验证的真实邻里关系。
- **Don't** 用阴影替代边框和留白来区分每一层内容。
