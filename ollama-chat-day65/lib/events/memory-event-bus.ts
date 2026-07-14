import type { EventBus, EventHandler, EventType, RuntimeEvent, RuntimeEventRecord, Unsubscribe } from "@/lib/events/event-types"; // 第65天：引入事件总线协议、处理器和事件历史类型。

export class MemoryEventBus implements EventBus { // 第65天：实现适合教学和单进程开发的内存事件总线。
  private readonly handlers = new Map<EventType, Set<EventHandler>>(); // 第65天：按事件类型保存去重后的订阅处理器集合。
  private readonly history: RuntimeEventRecord[] = []; // 第65天：保存供 Event Explorer 展示的有限事件历史。

  constructor(private readonly historyLimit = 100) { // 第65天：允许调用方配置最大事件历史数量。
    if (!Number.isInteger(historyLimit) || historyLimit <= 0) throw new Error("historyLimit 必须是正整数"); // 第65天：拒绝无效历史容量，避免运行时出现不可预测行为。
  } // 第65天：结束内存事件总线构造函数。

  async publish(event: RuntimeEvent): Promise<void> { // 第65天：发布事件并依次等待全部匹配订阅者处理完成。
    const matchedHandlers = [...(this.handlers.get(event.type) ?? [])]; // 第65天：复制当前处理器快照，避免分发期间订阅集合变化。
    const record: RuntimeEventRecord = { ...event, metadata: event.metadata ? { ...event.metadata } : undefined, deliveryStatus: "published", handlerCount: matchedHandlers.length, errors: [] }; // 第65天：在调用订阅者前立即写入历史以保持嵌套事件的真实发布时间顺序。
    this.history.push(record); // 第65天：把新事件追加到内存历史尾部。
    if (this.history.length > this.historyLimit) this.history.splice(0, this.history.length - this.historyLimit); // 第65天：超出容量时删除最早事件，限制进程内存占用。
    for (const handler of matchedHandlers) { // 第65天：按订阅顺序遍历所有匹配的事件处理器。
      try { // 第65天：隔离单个订阅者异常并继续通知其他订阅者。
        await handler(event); // 第65天：等待当前同步或异步订阅者处理完成。
      } catch (error) { // 第65天：捕获订阅者抛出的未知异常。
        record.errors.push(error instanceof Error ? error.message : "未知事件处理错误"); // 第65天：仅保存安全错误摘要，不写入敏感业务对象。
      } // 第65天：结束单个订阅者异常处理。
    } // 第65天：结束全部匹配订阅者遍历。
    record.processedAt = Date.now(); // 第65天：记录全部订阅者处理结束时间。
    record.deliveryStatus = record.errors.length === 0 ? "processed" : "failed"; // 第65天：根据错误数量更新最终投递状态。
    if (record.errors.length > 0) throw new AggregateError(record.errors, `事件 ${event.type} 处理失败`); // 第65天：全部订阅者收到通知后向发布方报告聚合错误。
  } // 第65天：结束事件发布方法。

  subscribe(type: EventType, handler: EventHandler): Unsubscribe { // 第65天：按事件类型注册一个处理器并返回取消函数。
    const handlers = this.handlers.get(type) ?? new Set<EventHandler>(); // 第65天：复用现有集合或为该事件类型创建新集合。
    handlers.add(handler); // 第65天：把处理器加入集合并自动避免重复订阅。
    this.handlers.set(type, handlers); // 第65天：保存更新后的事件处理器集合。
    return () => this.unsubscribe(type, handler); // 第65天：返回可直接调用的取消订阅闭包。
  } // 第65天：结束事件订阅方法。

  unsubscribe(type: EventType, handler: EventHandler): void { // 第65天：移除指定事件类型下的指定处理器。
    const handlers = this.handlers.get(type); // 第65天：读取该事件类型当前的处理器集合。
    if (!handlers) return; // 第65天：没有对应订阅时安全返回。
    handlers.delete(handler); // 第65天：从集合中删除目标处理器。
    if (handlers.size === 0) this.handlers.delete(type); // 第65天：集合为空时删除 Map 键以释放内存。
  } // 第65天：结束显式取消订阅方法。

  getHistory(): RuntimeEventRecord[] { // 第65天：读取供 API、页面和测试使用的事件历史快照。
    return this.history.map((record) => ({ ...record, metadata: record.metadata ? { ...record.metadata } : undefined, errors: [...record.errors] })); // 第65天：返回浅拷贝，避免外部修改内存总线内部状态。
  } // 第65天：结束事件历史读取方法。

  clearHistory(): void { // 第65天：提供测试和本地调试使用的历史清空能力。
    this.history.length = 0; // 第65天：原地清空数组并保留历史容器引用。
  } // 第65天：结束事件历史清空方法。

  listenerCount(type: EventType): number { // 第65天：返回指定事件类型当前订阅者数量。
    return this.handlers.get(type)?.size ?? 0; // 第65天：没有订阅集合时返回零。
  } // 第65天：结束订阅者数量读取方法。
} // 第65天：结束内存事件总线实现。
