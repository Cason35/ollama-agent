import type { Job } from "@/lib/queue/queue-types"; // 引入任务类型

export class QueueManager { // 定义本地数组队列管理器
  private queue: Job[] = []; // 使用数组保存排队任务

  enqueue(job: Job): Job { // 定义入队方法
    if (!this.queue.some((item) => item.id === job.id)) { // 避免同一个任务重复入队
      this.queue.push(job); // 把任务追加到队尾
    } // 去重判断结束
    return job; // 返回入队任务
  } // enqueue 方法结束

  dequeue(): Job | undefined { // 定义出队方法
    return this.queue.shift(); // 从队首取出一个任务
  } // dequeue 方法结束

  peek(): Job | undefined { // 定义查看队首方法
    return this.queue[0]; // 返回队首任务但不移除
  } // peek 方法结束

  size(): number { // 定义队列长度方法
    return this.queue.length; // 返回当前排队数量
  } // size 方法结束

  list(): Job[] { // 定义队列快照方法
    return [...this.queue]; // 返回队列副本
  } // list 方法结束
} // QueueManager 类结束
