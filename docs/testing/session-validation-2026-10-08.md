# 单元测试与本机会话验证（2026-10-08）

## 结果

-   `npm test`：59 项单元测试通过，0 失败、0 跳过；严格 TypeScript 消费端类型检查通过。
-   本轮新增 38 项单元测试，覆盖 HTTP 刷新并发与错误传播、日历边界、token 文件和凭证切换。
-   使用已有中国区、国际区各一个 session，对全部 13 个新增 API 分别进行只读查询，共 26 次调用正常完成，包含正常空数据。
-   两个访问令牌已通过已有 DI 会话逻辑刷新，会话写回各自原文件；没有使用密码登录。

## 可重复执行的离线测试

```sh
npm test
```

| 测试文件                          | 项数 | 覆盖范围                                                                |
| --------------------------------- | ---: | ----------------------------------------------------------------------- |
| `tests/health-recovery.test.js`   |   13 | HRV、压力、Body Battery、准备度的地区路由、完整响应、空数据及 HTTP 错误 |
| `tests/training-metrics.test.js`  |    8 | 训练状态、负荷、max metrics、预测范围及当前账号资料解析                 |
| `tests/http-client.test.js`       |   16 | 同账号并发刷新、账号间隔离、重试上限、失败释放、原始错误及请求参数保留  |
| `tests/calendar-contract.test.js` |   10 | 世纪闰年、所有月末、年份边界、四个时区、夏令时及 366 天跨度             |
| `tests/session-token.test.js`     |   12 | 凭证往返、缺失或损坏文件、失败时保持原凭证、字段校验及文件权限          |

这些测试使用合成数据、Axios adapter 和临时 token 文件，不需要真实账号或网络。`tests/public-types.test.ts` 另通过 `strict`、`noEmit`、`skipLibCheck: false` 检查导出的声明，包含合法消费方式和非法参数断言。

## 本机 session 实测

单日日期为 `2026-10-07`，区间为 `2026-10-01` 至 `2026-10-07`。下表只记录响应形状和条数，不记录账号标识、邮箱、设备 ID、令牌或健康数值。

| API                       | 中国区响应              | 国际区响应 |
| ------------------------- | ----------------------- | ---------- |
| `getHrvData`              | 空响应，归一化为 `null` | 对象       |
| `getHrvSummaries`         | 空响应，归一化为 `null` | 对象       |
| `getStressData`           | 对象                    | 对象       |
| `getStressSummaries`      | 空数组                  | 数组，7 条 |
| `getBodyBattery`          | 数组，7 条              | 数组，7 条 |
| `getTrainingReadiness`    | 空数组                  | 数组，1 条 |
| `getDailyTrainingStatus`  | 对象                    | 对象       |
| `getTrainingStatus`       | 对象                    | 对象       |
| `getTrainingLoadBalance`  | 对象                    | 对象       |
| `getMaxMetrics`           | 空数组                  | 空数组     |
| `getMaxMetricsRange`      | 空数组                  | 数组，2 条 |
| `getRacePredictions`      | 对象                    | 对象       |
| `getRacePredictionsRange` | 空数组                  | 数组，7 条 |

调用顺序执行。比赛预测使用当前社交资料中的 `displayName`；本轮范围预测验证的是默认 `daily` 模式。账号资料校验和令牌刷新分别额外执行，不计入 26 次 API 调用。

验证程序只记录调用成功与响应结构，未采集原始 HTTP 状态码，因此“调用成功”包含可能的无内容响应，不表示所有请求都返回 HTTP 200。

### 观察到的响应字段

-   HRV 使用 `userProfilePk`，压力和准备度使用 `userProfilePK`，大小写保持服务原样。
-   Body Battery reports 使用 `bodyBatteryValueDescriptorDTOList`；压力日响应里的对应字段是 `bodyBatteryValueDescriptorsDTOList`。时序数组完整保留。
-   日训练状态根字段包含 `userId`、`latestTrainingStatusData`、`recordedDevices`、`showSelector`、`lastPrimarySyncDate`。
-   聚合训练状态根字段包含 `userId`、`mostRecentVO2Max`、`mostRecentTrainingLoadBalance`、`mostRecentTrainingStatus`、`heatAltitudeAcclimationDTO`。
-   负荷平衡根字段包含 `userId`、`metricsTrainingLoadBalanceDTOMap`、`recordedDevices`。
-   max metrics 范围返回数组，条目含 `userId`、`generic`、`cycling`、`heatAltitudeAcclimation`。
-   最新比赛预测返回对象，日范围返回数组；条目含 `userId`、`fromCalendarDate`、`toCalendarDate`、`calendarDate`、`time5K`、`time10K`、`timeHalfMarathon`、`timeMarathon`。

以上是本轮账号样本的字段名证据。没有据此强制所有字段存在，也没有把单账号的空数据解释为整个地区不支持该 API。

## 测试推动的修复

1. OAuth 刷新锁改为每个 `HttpClient` 实例独立的 Promise；同账号共享一次刷新，不同实例独立刷新。
2. 所有等待请求最多重试一次；刷新失败会同时拒绝等待者并释放锁，OAuth exchange 不会递归等待自身。
3. 没有请求配置、没有凭证或非 401 的错误保持原始身份，避免覆盖为另一个错误或吞掉失败。
4. 文件加载先读取并校验两份 token，全部成功后才替换内存凭证；导出也先校验完整凭证。
5. 新 token 目录权限为 `0700`，文件为 `0600`；覆盖已有文件时收紧文件权限，保留现有目录权限。
6. 补齐原有心率、体重、饮水及高尔夫类型的模块导入与公开导出，使生成的声明可供外部 TypeScript 项目使用。

## 验证边界

实测通过现有 DSH 插件的 DI runtime 将 session 鉴权安装到 SDK 的 Axios 实例。SDK 本身仍保留原 OAuth token 接口；本轮没有新增 SDK 原生 DI session 文件接口，没有切换 DSH 插件依赖或发布 npm。

实测覆盖两个账号及上述日期。不同设备、其他日期、月度预测和服务端限流行为不属于这次线上验证；相关参数与错误分支由离线测试覆盖。token 导出不是两份文件的事务写入，第二个文件发生写入错误时可能留下部分磁盘更新，错误会向调用者传播。
