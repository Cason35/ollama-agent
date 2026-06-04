import type { Job } from "@/lib/queue/queue-types"; // 引入任务类型

function isRunnable(job: Job, now: number): boolean { // 定义任务是否可运行的判断函数
  if (job.status === "queued") return true; // queued 状态可以立刻执行
  if (job.status === "retrying") return typeof job.nextRunAt === "number" && job.nextRunAt <= now; // retrying 只有到达 nextRunAt 后才可执行
  return false; // 其他状态都不可执行
} // isRunnable 函数结束

export class QueueManager { // 定义本地数组队列管理器
  private queue: Job[] = []; // 使用数组保存排队与等待重试任务

  enqueue(job: Job): Job { // 定义入队方法
    if (!this.queue.some((item) => item.id === job.id)) { // 避免同一个任务重复入队
      this.queue.push(job); // 把任务追加到队尾
    } // 去重判断结束
    return job; // 返回入队任务
  } // enqueue 方法结束

  dequeue(now = Date.now()): Job | undefined { // 定义只取可运行任务的出队方法
    const index = this.queue.findIndex((job) => isRunnable(job, now)); // 寻找第一个可运行任务
    if (index < 0) return undefined; // 没有可运行任务时返回空
    const [job] = this.queue.splice(index, 1); // 从队列中移除命中的任务
    return job; // 返回可运行任务
  } // dequeue 方法结束

  peek(now = Date.now()): Job | undefined { // 定义查看第一个可运行任务的方法
    return this.queue.find((job) => isRunnable(job, now)); // 返回第一个可运行任务但不移除
  } // peek 方法结束

  size(): number { // 定义队列长度方法
    return this.queue.length; // 返回当前内存队列数量
  } // size 方法结束

  list(): Job[] { // 定义队列快照方法
    return [...this.queue]; // 返回队列副本
  } // list 方法结束
} // QueueManager 类结束
