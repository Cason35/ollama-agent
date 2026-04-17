# 第6天学习记录 + 第7天学习计划（Ollama Agent 学习）

## 📅 第6天学习记录（最小工具调用）

### ✅ 完成情况

-   成功实现 fakeSearch 工具函数
-   后端在 action=search 时成功调用工具
-   前端可以正确展示工具返回结果
-   chat / search 分流逻辑稳定运行
-   prompt 已优化，提高 search 触发稳定性

### 🧠 核心能力提升

你已经完成从"只会判断"到"可以执行"的关键跃迁：

流程能力： 用户输入 → 模型判断 → JSON输出 → 后端解析 → 工具调用 →
返回结果 → 前端展示

### ⚠️ 当前系统不足

-   工具数据为假数据（mock）
-   无法获取实时信息
-   工具能力单一（仅 search）
-   keyword 提取仍不够稳定（依赖 prompt）

------------------------------------------------------------------------

## 🚀 第7天学习计划（真实工具接入）

### 🎯 今日目标

将 fakeSearch 升级为真实工具，实现"实时数据获取"

------------------------------------------------------------------------

### 🧩 任务拆解

#### Step 1：实现真实天气工具（Open-Meteo API）

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

#### Step 2：处理 keyword（提取城市）

``` ts
const city = parsed.keyword.replace("天气", "");
```

------------------------------------------------------------------------

#### Step 3：接入 Agent 分流逻辑

``` ts
if (parsed.action === "search") {
  const city = parsed.keyword.replace("天气", "");
  const result = await realWeather(city);

  return Response.json({
    type: "search",
    keyword: city,
    result
  });
}
```

------------------------------------------------------------------------

#### Step 4：前端展示结果（保持不变）

``` ts
🔍 北京
📌 当前温度：XX°C
```

------------------------------------------------------------------------

### 🧪 验收标准

-   输入"帮我查北京天气" → 返回真实天气
-   输入"上海天气" → 返回实时数据
-   输入"你好" → 正常聊天
-   keyword 能正确提取城市

------------------------------------------------------------------------

## 📋 第7天打卡模板

【第7天打卡｜真实工具接入】

## 1. 是否成功接入真实 API：

## 2. 是否能根据 keyword 调用 API：

## 3. 是否解决 keyword 提取问题：

## 4. 是否返回真实数据：

## 5. 遇到的问题：

## 6. 当前系统能力：

------------------------------------------------------------------------

## 🧠 当前阶段总结

你已经完成： - 多轮对话 - 流式输出 - JSON结构化输出 - Tool
Calling（假工具）

下一步： 👉 Real Tool（真实工具接入） → 真正进入可用 Agent 系统
