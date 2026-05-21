/**
 * 浏览器端解析统一 API 响应包（re-export 便于 page / Store 引用）。
 */

export {
  ApiClientError,
  readApiData,
  readApiDataOrNull,
  assertApiOk,
  type ApiEnvelope,
} from "@/lib/api-envelope";
