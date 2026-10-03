# 手工饺子工坊

作为王阿姨社区技能分享的演示工坊，让初次接触手工制饺的人了解工具、动作和判断依据。它展示一次具体活动可以怎样开始，不代表已联系老师或预约线下授课。保留中式店铺，制作区是主要视角。原有社区需求、热度光柱和无关物品介绍已移除。

## 独立演示

运行 `npm run dev`，访问 `http://localhost:4317/dumpling-house.html`。无需安装依赖、配置 AI 或访问外网。不支持直接用 `file://` 双击打开；本地 HTTP 服务负责加载模块。

六步为和面与醒面、制馅、搓条分剂、擀皮、放馅包合、煮制装盘。每步可以独立查看，并可用按钮完成。擀皮支持鼠标或触摸拖动擀面杖：每次有效拖动最多计一次擀压，需要三次完成，长距离拖动不会连跳，小范围抖动不计数；按钮每次同样完成一次。放馅支持把调羹拖到面皮中央。过量馅料需要调整后才能对折。动画压缩了真实制作所需的时间，属于学习示意。

「自由观察」支持旋转、缩放、右键或中键平移；点击模型上的制作工具，或使用工具列表，阅读用途、操作、原因和观察要点。桌面端可选漫游：WASD / 方向键移动，Shift 加速，鼠标转头，E 查看工具，Esc 暂停，V 退出。失焦和失去鼠标锁定都会清除移动输入。浏览器拒绝 Pointer Lock 时，可退出漫游继续观察。

导览与自由观察均隐藏屋顶、山墙和悬挂灯笼，方便从上方查看制作区；进入漫游后一起显示。屋顶斜面、侧墙山墙与横梁相接，灯笼悬挂在屋顶下。环境设置已移除，光照固定为原滑块最右侧的效果；「恢复视角」直接位于场景工具栏。

查看步骤不会标记完成。完成本步操作才计入体验；重演本步保留已体验记录，「重新开始」经确认后只清除本工坊记录。学习状态保存在 `writespace.experience.dumpling.v1`，与主项目的发布、匹配、身份和参与意向分开。首页「重置演示」同时清除工坊记录；其他已打开的同源工坊页面会通过 storage 事件回到第一步，关闭旧的工艺回顾，避免再次保存旧进度。存储不可用时仍能在当前页面完成流程。WebGL、绘图上下文或渲染模块不可用时，自动切换为图文示意及按钮操作。

## 工程结构

- `public/dumpling-house.html`：独立入口；沿用服务端的 public 静态路由，不开放项目根目录。
- `public/experiences/dumpling/`：`data.js` 工艺与工具内容、`state.js` 学习状态、`main.js` 界面与嵌入协议、`models.js` 程序化模型、`renderer.js` 渲染和相机、`styles.css` 独立样式。
- `vendor/`：原页面使用的 Three.js **0.170.0**、对应 OrbitControls 与 MIT 许可证；运行时不连接 CDN。

只使用原生 Web 技术和现有 Node.js 服务。三维绘制最多约 30 帧/秒，限制像素比，仅一个投影光源；页面隐藏时暂停渲染。几何体在替换或退出时释放。主站发布和匹配接口、数据字段保持现有行为。

## 接入 WriteSpace

已接入王阿姨的样例详情（`p1`）：首页「周末一起包饺子，我来教和面擀皮」→「查看详情」→「进入饺子工坊」。匹配结果中打开同一条样例也能进入。其他详情不显示工坊入口，进入体验不会改变参与意向。

工坊按需在弹窗中加载同源 iframe，手机全屏展示；宿主校验消息来源窗口、origin、协议版本与体验 ID，展示已完成的操作步数。「返回详情」或工坊「关闭体验」会移除 iframe 并回到王阿姨详情，将焦点还给入口。导览或自由观察中按 Esc 也可返回；工坊弹窗打开时优先关闭弹窗，漫游中 Esc 仍用于暂停鼠标锁定。再次进入时由工坊恢复独立的学习记录。详情中「独立打开」保留完整页面访问方式。

复用嵌入接口时可以使用：

```html
<iframe id="dumpling-experience"
  title="传统手工饺子制作体验"
  src="/dumpling-house.html?embed=1"
  sandbox="allow-scripts allow-same-origin allow-pointer-lock"
  style="width:100%;height:800px;border:0">
</iframe>
```

嵌入模式收起独立页头，随容器尺寸重新取景；保留「关闭体验」，由宿主处理关闭请求。需要同源，并在使用 sandbox 时允许脚本、同源和 Pointer Lock。无需把场景脚本导入主站 `app.js`。

所有消息使用以下信封：

```js
{
  version: 1,
  experienceId: "dumpling-house",
  type: "progress",
  data: {
    currentStepId: "wrap",
    completedStepIds: ["dough", "filling", "portion", "roll"]
  }
}
```

页面发出：

| type | 时机 |
| --- | --- |
| `ready` | 渲染或图文降级准备好后，包含恢复的学习状态 |
| `progress` | 切换步骤、操作、调整馅量、重演或重置后 |
| `complete` | 本次记录首次从未完成全部步骤变为六步均已完成 |
| `exit` | 嵌入页面点击「关闭体验」时 |

页面同时在自身 window 发出 `writespace:experience` CustomEvent，消息位于 `event.detail`。iframe 消息只发送到 `location.origin`，不使用通配目标。

宿主接收时也应校验来源：

```js
const frame = document.querySelector("#dumpling-experience");
window.addEventListener("message", event => {
  if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
  const message = event.data;
  if (message?.version !== 1 || message.experienceId !== "dumpling-house") return;
  if (message.type === "exit") frame.remove();
  // ready / progress / complete 可用于宿主显示学习状态。
});
```

页面接收来自同源父窗口的两种命令；其他来源、版本、体验 ID 或未知步骤均忽略：

```js
frame.contentWindow.postMessage({
  version: 1, experienceId: "dumpling-house", type: "focus-step",
  data: { stepId: "roll" }
}, location.origin);

frame.contentWindow.postMessage({
  version: 1, experienceId: "dumpling-house", type: "reset"
}, location.origin);
```

步骤 ID：`dough`、`filling`、`portion`、`roll`、`wrap`、`cook`。`focus-step` 回到导览并定位指定步骤，不标记完成。宿主的 `reset` 命令直接清除本工坊记录，因此应由宿主在用户选择重置后发送。刷新恢复或重演已完成步骤不会再次发出 `complete`；重置后可以重新完成。

## 验证

```sh
npm run check
npm test
npm run test:browser
npm run test:scene
```

浏览器检查需要 Node.js 22+ 与 Chromium / Chrome / Edge，可用 `BROWSER_PATH` 指定浏览器。测试使用隔离配置目录，不操作日常浏览器资料。

`test:scene` 使用真实鼠标拖拽、触摸与键盘输入，验证六步流程、长距离擀压最多计一次、抖动不计数、过量馅反馈、重演和恢复、工具介绍、观察模式切换、Pointer Lock 拒绝处理、375px 手机与 768px 平板布局、同源 sandbox iframe 消息及来源校验，以及渲染模块失败、禁止存储和外网阻断后的完整学习流程。另验证王阿姨详情入口、嵌入 WebGL 六步操作、宿主进度与完成消息、关闭后恢复、移动布局、Esc 优先关闭工艺回顾、移除 iframe 与焦点返回，以及参与意向保持原值。首页重置覆盖清除部分操作与全部完成记录、已打开页面同步清零和关闭旧回顾，再次进入从零开始。截图保存在被 Git 忽略的 `.tmp/dumpling-*.png`。

工坊开发阶段的既有验证记录为 34 项规则／API 测试、20 组主站浏览器流程和 8 组场景浏览器流程；场景检查包含原生鼠标锁定、鼠标转头、制作台碰撞及失焦停止。另用 WebGL 近景确认菜刀对齐、勺柄与漏勺柄连接、面皮及包合模型比例，以及屋顶、山墙、横梁和灯笼衔接。当前项目的本轮验证记录见 README。

部分环境中的无头 Chromium 会拒绝原生 Pointer Lock。若遇到这种情况，测试会明确打印说明，并仅为 WASD 移动及失焦停止模拟锁定状态；拒绝与恢复流程仍通过界面验证。这些环境中未验证的原生锁定与鼠标转头需要在正常桌面浏览器复核。

当前体验示范一种常见制作流程，地区、食材和习惯会产生差异。它帮助理解工艺，不模拟真实面团物理，也不提供真实机器人控制、账号、预约或线下活动完成证明。
