# 第6天学习记录 + 第7天学习计划

## 第6天学习记录：最小 Tool Calling

### 今日主题

让 search action 真正执行，完成 Agent 的"决策 + 执行"闭环。

### 第6天完成情况

-   成功实现 fakeSearch 工具函数
-   当 action=search 时，后端能够正确调用工具
-   前端可以成功展示工具执行结果
-   chat / search 能正常分流
-   调整了 prompt，让模型更稳定触发 search
-   当前已经具备最小 Tool Calling 能力

### 当前系统能力

目前你的系统已经具备：

1.  多轮上下文对话
2.  Streaming 流式输出
3.  JSON 结构化输出
4.  action 分流
5.  fake Tool Calling
6.  前后端协同执行
7.  prompt 控制与 fallback

当前系统已经不再只是"聊天应用"，而是一个具备 Agent 雏形的本地 AI 应用。

### 当前存在的问题

-   fakeSearch 使用的是写死的数据
-   没有真实 API 调用能力
-   无法返回实时数据
-   工具能力有限，缺乏产品真实感

------------------------------------------------------------------------

## 第7天学习计划：真实 Tool Calling（接入实时 API）

### 为什么要做这一步

fakeSearch 只是"演示工具调用"，但真实世界中的 Agent 需要调用外部
API、数据库或第三方服务。

第7天的目标是：

从：

模型 → fake 工具 → 假数据

升级为：

模型 → 真实 API → 实时数据

------------------------------------------------------------------------

## 今日主题

接入真实天气 API，让 search 真正具备"实时能力"。

------------------------------------------------------------------------

## 推荐 API

使用无需 key 的 Open-Meteo API。

### 示例工具函数

``` ts
async function realWeather(city: string) {
  const cityMap: Record<string, { lat: number; lon: number }> = {
    北京: { lat: 39.9042, lon: 116.4074 },
    上海: { lat: 31.2304, lon: 121.4737 }
  };

  const location = cityMap[city];

  if (!location) {
    return "暂不支持该城市";
  }

  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current_weather=true`
  );

  const data = await res.json();

  return `当前温度：${data.current_weather.temperature}°C`;
}
```

------------------------------------------------------------------------

## 第7天任务拆解

### Step 1：实现 realWeather 工具函数

-   接收城市名
-   转换为经纬度
-   调用 Open-Meteo API
-   返回实时天气结果

### Step 2：替换 fakeSearch

当 action=search 时，不再返回假数据，而是调用真实 API。

### Step 3：处理 keyword 提取问题

例如： - "帮我查北京天气" - "北京的天气情况"

最终都应该提取为：

北京

### Step 4：优化 Prompt

要求模型输出更精简、更稳定的 keyword。

------------------------------------------------------------------------

## 第7天验收标准

### 测试1

输入： 帮我查北京天气

输出类似： 🔍 北京 📌 当前温度：XX°C

### 测试2

输入： 上海天气

返回实时天气。

### 测试3

输入： 你好

正常聊天。

------------------------------------------------------------------------

## 第7天打卡模板

【第7天打卡｜真实工具接入】

## 1. 是否成功接入真实 API：

## 2. 是否能根据 keyword 调用 API：

## 3. 是否解决 keyword 提取问题：

## 4. 是否返回真实数据：

## 5. 遇到的问题：

## 6. 当前系统能力：

------------------------------------------------------------------------

## 当前学习路线（更新版）

-   Day 5：JSON 结构化输出
-   Day 6：fake Tool Calling
-   Day 7：真实 Tool Calling
-   Day 8：上下文裁剪（解决卡顿）

调整顺序不是推翻计划，而是根据当前进度做优化：

先做"能用" → 再做"更好用"
