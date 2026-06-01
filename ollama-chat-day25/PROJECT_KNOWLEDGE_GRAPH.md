# ollama-chat-day25 Knowledge Graph

> Generated on 2026-05-30. The requested "Understand Anything" plugin is not available in the current installable plugin list, so this graph is generated from local source-code inspection.

## Project Identity

- **App**: `ollama-chat-day25`
- **Stack**: Next.js `16.2.4`, React `19.2.4`, TypeScript, Tailwind CSS 4, MySQL optional persistence
- **Runtime purpose**: Local/MiMo chat agent with memory, tool routing, RAG knowledge base, and multi-step workflow execution
- **Primary UI**: `app/page.tsx`
- **Primary API surface**: `app/api/**/route.ts`
- **Core domains**: Chat, Memory, Tool Routing, Knowledge/RAG, Workflow DAG, Persistence

## System Knowledge Graph

```mermaid
flowchart TD
  User["User"] --> UI["app/page.tsx<br/>Chat UI, RAG panel, workflow views"]
  UI --> ChatAPI["POST /api/chat"]
  UI --> KnowledgeAPI["/api/knowledge<br/>import/list/metrics"]
  UI --> RetrieveAPI["/api/knowledge/retrieve<br/>debug retrieval"]
  UI --> WorkflowAPI["/api/workflows<br/>history/persistence"]
  UI --> ConfirmAPI["/api/workflow/confirm<br/>HITL continue/cancel"]
  UI --> ToolsAPI["/api/tools<br/>tool registry metadata"]

  ChatAPI --> Envelope["lib/api-envelope.ts<br/>standard API responses"]
  ChatAPI --> Memory["lib/chat-memory.ts<br/>short-term + long-term memory"]
  ChatAPI --> Runtime["lib/model-runtime.ts<br/>Ollama/MiMo invocation"]
  ChatAPI --> Routing["lib/chat-routing.ts<br/>single-step action routing"]
  ChatAPI --> ChatTools["lib/chat-tools.ts<br/>weather/summary/todo/chat helpers"]
  ChatAPI --> Planner["lib/workflow-planner.ts<br/>LLM plan to steps"]
  ChatAPI --> Validate["lib/workflow-validate.ts<br/>validate/repair/toposort"]
  ChatAPI --> Executor["lib/workflow-executor.ts<br/>parallel DAG + retry + HITL"]

  Planner --> ToolRegistry["lib/tool-registry.ts<br/>capability/action mapping"]
  Executor --> WorkflowTools["lib/workflow-tools.ts<br/>workflow action implementations"]
  WorkflowTools --> KnowledgeStore["lib/knowledge-store.ts<br/>document/chunk store"]
  WorkflowTools --> Runtime
  WorkflowTools --> Memory

  KnowledgeAPI --> KnowledgeStore
  RetrieveAPI --> KnowledgeStore
  KnowledgeStore --> Chunking["lib/knowledge-chunking.ts<br/>overlap chunking"]
  KnowledgeStore --> Embedding["lib/knowledge-embedding.ts<br/>embedding via Ollama"]
  KnowledgeStore --> Retrieval["lib/knowledge-retrieval.ts<br/>cosine + topK + minScore"]
  Retrieval --> Embedding
  WorkflowTools --> RAG["lib/knowledge-rag.ts<br/>strict prompt + fallback"]
  RAG --> Runtime
  RAG --> Retrieval

  Executor --> PauseStore["lib/workflow-pause-store.ts<br/>paused HITL state"]
  ConfirmAPI --> PauseStore
  ConfirmAPI --> Executor
  Executor --> Persistence["lib/workflow-persistence.ts<br/>state snapshots"]
  WorkflowAPI --> BackendStore["lib/backend-workflow-store.ts<br/>store facade"]
  BackendStore --> LocalStore["lib/local-workflow-store.ts<br/>local/.data store"]
  BackendStore --> MySQLStore["lib/mysql-workflow-store.ts<br/>MySQL store"]
  MySQLStore --> MySQL["lib/mysql.ts<br/>mysql2 pool"]

  KnowledgeStore --> DataKnowledge[".data/knowledge-store.json"]
  LocalStore --> DataWorkflow[".data workflow snapshots"]
  MySQLStore --> Database["MySQL tables<br/>scripts/init-mysql.sql"]
```

## Main Runtime Flows

### 1. Single-Turn Chat Flow

```mermaid
sequenceDiagram
  participant UI as app/page.tsx
  participant API as /api/chat
  participant Mem as chat-memory
  participant Rt as model-runtime
  participant Router as chat-routing
  participant Tools as chat-tools

  UI->>API: messages, memory, provider
  API->>Rt: buildModelRuntime()
  API->>Mem: buildMemory()
  API->>Router: buildRoutingSystemPrompt()
  API->>Rt: invokeChatModel(route prompt)
  Rt-->>API: JSON-ish action output
  API->>Router: parseModelOutput() + resolveContinuationAction()
  alt weather
    API->>Tools: realWeather()
  else summary
    API->>Tools: summarizeWithModel()
  else todo
    API->>Tools: generateTodosWithModel()
  else chat
    API->>Tools: generateFallbackChat() if needed
  end
  API-->>UI: apiJsonSuccess(payload + memory)
```

### 2. RAG Knowledge Flow

```mermaid
flowchart LR
  Import["Import document"] --> Chunk["buildChunksForDocument<br/>default overlap chunking"]
  Chunk --> Embed["embedTexts<br/>Ollama embedding"]
  Embed --> Store["knowledge-store Map<br/>persist to .data/knowledge-store.json"]
  Query["User query"] --> QEmbed["embedText"]
  QEmbed --> Score["cosineSimilarity against chunk embeddings"]
  Store --> Score
  Score --> Filter["sort desc + minScore filter + topK"]
  Filter --> Hits["RetrievedChunkHit[]"]
  Hits --> Prompt["buildRagPrompt"]
  Prompt --> LLM["invokeChatModel"]
  Hits --> Fallback["No hits => fixed no-knowledge fallback"]
```

### 3. Workflow DAG Flow

```mermaid
flowchart TD
  Goal["Latest user text"] --> Plan["planWorkflowSteps<br/>LLM JSON plan"]
  Plan --> Normalize["normalize action/input/deps/conditions/HITL"]
  Normalize --> Workflow["Workflow object"]
  Workflow --> Validate["validateWorkflow"]
  Validate -->|invalid| Repair["repairWorkflow"]
  Repair --> Validate2["validateWorkflow again"]
  Validate -->|valid| Execute["executeWorkflow"]
  Validate2 -->|valid| Execute
  Validate2 -->|invalid| Fail["Return validation failure"]

  Execute --> Topo["topologicalSort"]
  Topo --> Batch["getRunnableSteps by dependency readiness"]
  Batch --> Parallel["Promise.all runnable steps"]
  Parallel --> ToolInput["buildWorkflowToolInput"]
  ToolInput --> Registry["workflowToolRegistry.execute"]
  Registry --> Outputs["step output/status/duration"]
  Outputs --> Conditions["condition evaluation<br/>success/skipped/blocked"]
  Conditions --> HITL{"requiresConfirmation<br/>and not confirmed?"}
  HITL -->|yes| Pause["waiting_confirmation<br/>savePausedWorkflow"]
  HITL -->|no| More{"pending left?"}
  More -->|yes| Batch
  More -->|no| Synthesize["synthesizeWorkflowResult"]
```

## Module Map

| Area | Files | Responsibility |
| --- | --- | --- |
| UI | `app/page.tsx`, `app/globals.css`, `app/layout.tsx` | Chat surface, RAG debug panel, workflow cards/history controls |
| Chat API | `app/api/chat/route.ts` | Main orchestrator for memory, single-step routing, workflow execution |
| API envelope | `lib/api-envelope.ts`, `lib/api-client.ts` | Consistent success/error response shapes and client fetch helper |
| Model runtime | `lib/model-runtime.ts`, `lib/mimo-models.ts` | Provider selection and LLM calls for Ollama/MiMo |
| Memory | `lib/chat-memory.ts`, `lib/chat-types.ts` | Short-term messages, long-term memory extraction/formatting |
| Single-step tools | `lib/chat-routing.ts`, `lib/chat-tools.ts` | Route user intent to chat/weather/summary/todo |
| Tool registry | `lib/tool-registry.ts`, `lib/workflow-tools.ts` | Workflow tool definitions, capability routing, input validation |
| Knowledge/RAG | `lib/knowledge-*` | Document import, chunking, embedding, retrieval, strict RAG answer |
| Workflow | `lib/workflow-*` | Planning, validation, DAG execution, HITL pause, logs, persistence |
| Persistence | `lib/backend-workflow-store.ts`, `lib/local-workflow-store.ts`, `lib/mysql-workflow-store.ts`, `lib/mysql.ts` | Store abstraction with local and MySQL backends |
| Scripts | `scripts/*.mjs`, `scripts/init-mysql.sql` | Test runners and MySQL schema initialization |

## Entity Relationships

```mermaid
erDiagram
  MEMORY ||--o{ CHAT_MESSAGE : contains
  MEMORY ||--o{ MEMORY_ITEM : retains

  KNOWLEDGE_DOCUMENT ||--o{ KNOWLEDGE_CHUNK : chunked_into
  KNOWLEDGE_CHUNK ||--o| EMBEDDING : has
  RETRIEVAL_QUERY ||--o{ RETRIEVED_CHUNK_HIT : returns
  RETRIEVED_CHUNK_HIT }o--|| KNOWLEDGE_CHUNK : references

  WORKFLOW ||--o{ WORKFLOW_STEP : contains
  WORKFLOW_STEP }o--o{ WORKFLOW_STEP : depends_on
  WORKFLOW_STEP ||--o| WORKFLOW_STEP_CONDITION : gates
  WORKFLOW ||--o{ WORKFLOW_TIMELINE_EVENT : logs
  WORKFLOW ||--o{ WORKFLOW_EXECUTION_BATCH : schedules
  WORKFLOW_STATE ||--|| WORKFLOW : snapshots
```

## Important Data Types

- `Memory`: `{ shortTerm, items }`, shared by chat and workflows.
- `ChatResponseBody`: typed response union carrying `memory`.
- `KnowledgeDocument`: imported document with generated chunks and embeddings.
- `KnowledgeChunk`: text slice plus document offsets, index, token estimate, optional embedding.
- `RetrieveOptions`: `{ topK, minScore }`.
- `RetrievedChunkHit`: scored retrieval result with chunk/document metadata.
- `RagAnswerResult`: answer, hits, and fallback marker.
- `Workflow`: goal, status, steps, timeline, execution batches.
- `WorkflowStep`: action, input, deps, condition, confirmation, status, output/error/duration.
- `WorkflowState`: persisted workflow snapshot for resume/history.

## External Dependencies And Side Effects

- **Ollama local model runtime**: Used for chat and embeddings. RAG embedding expects an embedding model such as `nomic-embed-text`.
- **MiMo provider**: Optional chat runtime path controlled by env/config.
- **Open-Meteo**: Weather tool path in `chat-tools`.
- **Filesystem**: `.data/knowledge-store.json`, workflow snapshots, workflow logs.
- **MySQL**: Optional backend persistence via `mysql2` and `scripts/init-mysql.sql`.

## Reading Guide

1. Start with `app/api/chat/route.ts` to understand the orchestration boundary.
2. Read `lib/model-runtime.ts` to understand model provider behavior.
3. Read `lib/chat-memory.ts`, `lib/chat-routing.ts`, and `lib/chat-tools.ts` for single-turn agent behavior.
4. Read `lib/knowledge-store.ts`, `lib/knowledge-retrieval.ts`, and `lib/knowledge-rag.ts` for RAG behavior.
5. Read `lib/workflow-planner.ts`, `lib/workflow-validate.ts`, `lib/workflow-executor.ts`, and `lib/workflow-tools.ts` for workflow behavior.
6. Read `lib/backend-workflow-store.ts` and the local/MySQL store files for persistence behavior.

