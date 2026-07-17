export const QUERY_EMBEDDING_DIMENSION = 128; /* 第48天：定义本地确定性查询向量的维度，保证离线演示与测试稳定。 */

const STOPWORD_PHRASES = ["有什么作用", "有什么用", "是什么意思", "是什么", "介绍一下", "请介绍", "介绍", "解释一下", "解释", "讲解", "说明", "如何使用", "怎么使用", "怎么用", "如何", "用法", "作用", "请问", "请", "一下", "的", "了", "吗", "呢", "什么", "告诉我", "帮我"]; /* 第48天：定义会被剥离的疑问与填充词，让语义相同的不同问法归一化。 */

export function cleanQuery(query: string): string { /* 第48天：定义把查询归一化为核心语义的清洗函数。 */
  let text = query.toLowerCase().trim(); /* 第48天：统一转为小写并去除首尾空白。 */
  for (const phrase of STOPWORD_PHRASES) { /* 第48天：按从长到短的顺序遍历停用短语。 */
    text = text.split(phrase).join(" "); /* 第48天：把停用短语替换为空格以剥离非核心语义。 */
  } /* 第48天：结束停用短语剥离循环。 */
  text = text.replace(/[\s\p{P}\p{S}]+/gu, " ").trim(); /* 第48天：把空白、标点和符号压缩为单个空格并去除首尾空白。 */
  return text; /* 第48天：返回只保留核心语义的清洗结果。 */
} /* 第48天：结束查询清洗函数。 */

function hashToken(token: string): number { /* 第48天：定义把特征字符串映射到向量维度的稳定哈希函数。 */
  let hash = 2166136261; /* 第48天：使用 FNV-1a 哈希初始偏移量。 */
  for (let i = 0; i < token.length; i += 1) { /* 第48天：逐字符更新哈希值。 */
    hash ^= token.charCodeAt(i); /* 第48天：把字符编码异或进哈希。 */
    hash = Math.imul(hash, 16777619); /* 第48天：乘以 FNV 质数并保持 32 位整数语义。 */
  } /* 第48天：结束逐字符哈希循环。 */
  return Math.abs(hash) % QUERY_EMBEDDING_DIMENSION; /* 第48天：把哈希折叠到向量维度范围内作为特征下标。 */
} /* 第48天：结束特征哈希函数。 */

function extractFeatures(cleaned: string): string[] { /* 第48天：定义从清洗文本中提取词与字符二元组特征的函数。 */
  const features: string[] = []; /* 第48天：初始化特征列表。 */
  const tokens = cleaned.split(" ").filter((token) => token.length > 0); /* 第48天：按空格切分出词级特征。 */
  for (const token of tokens) { /* 第48天：遍历每个词级特征。 */
    features.push(`w:${token}`); /* 第48天：把词本身作为强特征写入。 */
    for (let i = 0; i < token.length - 1; i += 1) { /* 第48天：在词内滑动提取字符二元组。 */
      features.push(`b:${token.slice(i, i + 2)}`); /* 第48天：把字符二元组作为细粒度特征，提升近义表达的相似度鲁棒性。 */
    } /* 第48天：结束字符二元组提取循环。 */
  } /* 第48天：结束词级特征遍历。 */
  return features; /* 第48天：返回全部特征。 */
} /* 第48天：结束特征提取函数。 */

export function computeQueryEmbedding(query: string): number[] { /* 第48天：定义把查询转换为确定性归一化向量的函数。 */
  const vector = new Array<number>(QUERY_EMBEDDING_DIMENSION).fill(0); /* 第48天：初始化全零向量。 */
  const features = extractFeatures(cleanQuery(query)); /* 第48天：先清洗查询再提取特征。 */
  for (const feature of features) { /* 第48天：遍历每个特征。 */
    vector[hashToken(feature)] += 1; /* 第48天：把特征累加到对应维度形成词袋向量。 */
  } /* 第48天：结束特征累加循环。 */
  let norm = 0; /* 第48天：初始化向量模长平方。 */
  for (const value of vector) norm += value * value; /* 第48天：累加每个维度的平方。 */
  norm = Math.sqrt(norm); /* 第48天：计算向量模长。 */
  if (norm === 0) return vector; /* 第48天：空查询返回全零向量，避免除零。 */
  return vector.map((value) => value / norm); /* 第48天：归一化为单位向量，使点积即为余弦相似度。 */
} /* 第48天：结束查询向量计算函数。 */

export function cosineSimilarity(a: number[], b: number[]): number { /* 第48天：定义计算两个查询向量余弦相似度的函数。 */
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0; /* 第48天：空向量或维度不一致直接返回 0。 */
  let dot = 0; /* 第48天：初始化点积累计。 */
  let normA = 0; /* 第48天：初始化向量 a 的模长平方。 */
  let normB = 0; /* 第48天：初始化向量 b 的模长平方。 */
  for (let i = 0; i < a.length; i += 1) { /* 第48天：逐维度累计点积与模长。 */
    dot += a[i] * b[i]; /* 第48天：累加点积。 */
    normA += a[i] * a[i]; /* 第48天：累加 a 的平方。 */
    normB += b[i] * b[i]; /* 第48天：累加 b 的平方。 */
  } /* 第48天：结束逐维度累计循环。 */
  const denom = Math.sqrt(normA) * Math.sqrt(normB); /* 第48天：计算余弦分母。 */
  if (denom === 0) return 0; /* 第48天：模长为零无法比较，返回 0。 */
  return Math.max(0, Math.min(1, dot / denom)); /* 第48天：由于词袋向量非负，余弦值落在 0 到 1 区间。 */
} /* 第48天：结束余弦相似度函数。 */
