const response = await fetch("http://localhost:11434/api/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    model: "qwen2.5:14b",
    messages: [
      {
        role: "system",
        content: "你是一名严格、简洁、专业的 AI 工程导师。"
      },
      {
        role: "user",
        content: "请用三句话解释为什么前端开发适合转 Agent 工程师。"
      }
    ],
    stream: false
  })
});

const data = await response.json();

console.log("完整返回：");
console.log(JSON.stringify(data, null, 2));

console.log("\n模型回答：");
console.log(data.message?.content);