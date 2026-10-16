# 第二批训练分析 API 调查

调查日期：2026-10-08。源码调查范围为当前 `cyberjunky/python-garminconnect` 与 `matin/garth` 原仓库源码、测试和公开录制。同日另完成使用已有本机会话的只读验证，结果单列在下文；源码引用与本轮实测分别标注。

## 当前源码基线

本次重新查询默认分支 HEAD，仍为 [python-garminconnect `218e72ca5459e014435fc2d94fd18bd601fa0c14`](https://github.com/cyberjunky/python-garminconnect/commit/218e72ca5459e014435fc2d94fd18bd601fa0c14)（2026-09-29）和 [garth `f99159a15c4c9463ce215a60ba9f7cb21f94a3b7`](https://github.com/matin/garth/commit/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7)（2026-03-28）；与第一批调查没有源码差异。下面所有链接固定到这些 commit，不依赖今后会变动的分支页面。

证据优先级：同一路径的直接 HTTP 录制 > 服务录制中明确标注 `requestUrl` 的嵌入 `payload` > 响应模型 > mock fixture / 函数类型注解。嵌入 payload 是服务器录制的间接证据，不能声称为对该 endpoint 独立录制的请求。garth 已弃用，仍可用其录制核对历史响应；认证方案应独立维护。

## 请求契约

请求均为 GET，路径相对于账号地区的 `connectapi` 服务；日参数均为真实 `YYYY-MM-DD` 日期。

| 建议 TS 方法 | 路径和 query | Python 方法与准确来源 |
|---|---|---|
| `getDailyTrainingStatus(date)` | `/metrics-service/metrics/trainingstatus/daily/{date}`；无 query | `get_daily_training_status`，注释说明包含训练状态、acute/chronic load、ACWR。[源码](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2356-L2366) |
| `getTrainingStatus(date)` | `/metrics-service/metrics/trainingstatus/aggregated/{date}`；无 query | `get_training_status`。[路径常量](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L714-L716)、[请求](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2478-L2484) |
| `getTrainingLoadBalance(date)` | `/metrics-service/metrics/trainingloadbalance/latest/{date}`；无 query；date 为过去四周 load focus 的结束日 | `get_training_four_week_load_balance`。[路径常量](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L705-L707)、[请求和日期语义](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2345-L2354) |
| `getMaxMetrics(date)` | `/metrics-service/metrics/maxmet/daily/{date}/{date}`；无 query | `get_max_metrics`。[路径常量](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L592)、[请求](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L1675-L1681) |
| `getMaxMetricsRange(startDate,endDate)` | `/metrics-service/metrics/maxmet/daily/{startDate}/{endDate}`；无 query，是原生范围请求 | `get_max_metrics_range`；校验 start ≤ end。[源码](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L1683-L1694) |
| `getRacePredictions()` | `/metrics-service/metrics/racepredictions/latest/{displayName}`；无 query | `get_race_predictions` 的无参数分支。[源码](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2429-L2457) |
| `getRacePredictionsRange(startDate,endDate,options?)` | `/metrics-service/metrics/racepredictions/{type}/{displayName}`；query 为 `fromCalendarDate`、`toCalendarDate`；`options.aggregation` 为 `daily` 或 `monthly`，默认 daily | `get_race_predictions` 的三个参数分支。[源码](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2459-L2476) |

Python 的通用日期校验先去首尾空格，再检查格式和真实日历日期；通用区间校验拒绝 start > end。日训练接口复用日期校验，max metrics 范围复用区间校验。[校验源码](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L109-L139)。

## 比赛预测的 displayName 和范围约束

路径中的 `displayName` 是 Garmin 社交资料的标识，应从 `/userprofile-service/socialProfile` 的 `displayName` 获取，而不是 UI 昵称或账号别名。Python 登录时加载社交资料，最多三次尝试；若资料对象存在但仍没有名称，它最终使用 username 回退。这是 Python 的容错策略，不构成“邮箱作为 displayName 总能请求成功”的证据。[加载流程](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L1035-L1071)。

`_require_display_name()` 在名称未设置时重载社交资料，仍为空则明确报错；写入 URL 前使用 `quote(display_name, safe="")` 编码，防止名称里的路径、query 或 fragment 字符改变请求。[源码](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L1111-L1136)。本批 TS 默认每次读取当前 profile 并用 `encodeURIComponent` 编码，也允许 `options.displayName` 显式提供内部标识来跳过 profile 请求。当前库缺少外部 session 更换的缓存失效机制，因此这里不缓存账号标识。

Python 比赛预测接受两种模式：全部省略，或 startDate/endDate/type 全部提供；不接受部分参数。type 只接受 `daily`、`monthly`。其范围限制直接检查 `endDate - startDate > 366 天`；恰好 366 天差可通过，不能误写成“最多 366 个包含首尾的日期”。这是客户端限制，未证明服务端严格上限。[参数与范围检查](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2448-L2476)。

该方法没有复用通用区间校验，因而源码没有显式拒绝倒序。TS 建议在发请求和读取 profile 前复用已有区间校验，拒绝倒序、无效日期、未知 type、部分参数和超过 366 天差的范围。这是本库的实施建议，不是声称 Python 已完成全部检查。

## 公开源码与录制的响应证据

所有目标 Python 方法都直接返回 `connectapi` 的 JSON，函数注解是 `dict[str, Any]`；`connectapi()` 实际没有按这些接口做结构转换。[JSON 返回层](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/client.py#L1596-L1601)。当前 Python `typed.py` 未定义这批接口的响应模型。

| 接口 | 当前能证实的 response shape | 类型实施建议 |
|---|---|---|
| daily training status | 有公开服务录制嵌入 payload，且 `requestUrl` 明确指向此 metrics endpoint；详见下节 | 据 payload 声明保守可选字段；保留未知字段和全部设备映射 |
| training load balance latest | 同上，录制包含对应 `requestUrl` 和 payload；详见下节 | 据 payload 声明保守可选字段；保留全部设备映射 |
| aggregated training status | Python 注解预期对象；未找到直接录制、匹配 endpoint 的嵌入 payload 或 typed 模型 | 不借用 daily 或 mobile-gateway 外层结构；暂用原始宽类型 |
| max metrics 日 / 范围 | Python 注解预期对象；当前 mock 返回 `{vo2Max: ...}`，未找到真实录制或响应模型 | 不把 mock 的字段或根形状作为确定协议；保留原始 JSON |
| race predictions latest / daily / monthly | Python 注解预期对象；方法只透传，无 typed 模型，也未找到原仓库公开录制 | 不把 5k/10k/半马/全马说明变成未经证实的字段名；保留原始 JSON |

max metrics 当前 unit test 的 `{vo2Max: 55}` 和 aggregated status test 的 `{status: "productive"}` 都通过 `patch.object(..., return_value=...)` 构造，只验证路径，不能代表服务器 schema。[max metrics mock](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/tests/test_garmin_unit.py#L202-L210)、[aggregated mock](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/tests/test_garmin_unit.py#L310-L321)、[范围 mock](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/tests/test_garmin_unit.py#L1433-L1443)。Python demo 将 max metrics 描述为 VO₂ 与 fitness age，只证明方法用途，不能证明响应一定含 `vo2Max` 字段。[demo](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/demo.py#L245-L248)。

### 服务录制中的训练状态和负荷 payload

garth 的 `test_daily_training_status.yaml` 录制实际请求的是 mobile gateway。可用证据仅限其中 `requestUrl` 明确指出 metrics endpoint 的子对象 `payload`；不可把 mobile gateway 整个响应、`mostRecentTrainingStatus` 外层包装或所有服务状态认定为 metrics endpoint 自身返回。[固定录制](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/tests/stats/cassettes/test_daily_training_status.yaml#L40-L67)。

日训练状态子对象的 `requestUrl` 是 `/metrics-service/metrics/trainingstatus/daily/2025-06-11`；其 `payload` 为对象，根有 `userId`、`latestTrainingStatusData`（按 deviceId 的对象映射）、`recordedDevices`（设备数组）、`showSelector` 和可空 `lastPrimarySyncDate`。每个设备的训练状态记录含以下字段。[recorded payload](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/tests/stats/cassettes/test_daily_training_status.yaml#L51-L67)。

| 字段组 | 录制能证实的字段及值类型 |
|---|---|
| 日和设备 | `calendarDate:string`、`sinceDate:string`、`timestamp:number`、`deviceId:number`、`primaryTrainingDevice:boolean` |
| 训练状态 | `trainingStatus:number`、`trainingStatusFeedbackPhrase:string`、`trainingPaused:boolean`；不可把 numeric status 和 phrase 当同一种值 |
| 趋势和运动 | `sport:string`、`subSport:string`、`fitnessTrendSport:string`、`fitnessTrend:number` |
| 急慢性负荷 | 嵌套 `acuteTrainingLoadDTO`：`acwrPercent:number`、`acwrStatus:string`、`acwrStatusFeedback:string`、`dailyTrainingLoadAcute:number`、`dailyTrainingLoadChronic:number`、`dailyAcuteChronicWorkloadRatio:number`、`minTrainingLoadChronic:number`、`maxTrainingLoadChronic:number` |
| 空字段 | 该录制的 `weeklyTrainingLoad`、`loadTunnelMin`、`loadTunnelMax`、`loadLevelTrend` 为 null；不能据此断言它们永远为空，也不能凭这个样本认定非空值类型 |

四周负荷平衡子对象的 `requestUrl` 是 `/metrics-service/metrics/trainingloadbalance/latest/2025-06-11`；其 `payload` 是对象，根有 `userId`、`metricsTrainingLoadBalanceDTOMap`（按 deviceId 的对象映射）、`recordedDevices`。每个设备含 `calendarDate:string`、`deviceId:number`、`primaryTrainingDevice:boolean`、`trainingBalanceFeedbackPhrase:string`，以及 `monthlyLoadAerobicLow`、`monthlyLoadAerobicHigh`、`monthlyLoadAnaerobic` 三项 number，三项各自对应 `TargetMin` / `TargetMax` number。这里 monthly 前缀是原字段名，应保留其四周观察窗口含义。[recorded payload](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/tests/stats/cassettes/test_daily_training_status.yaml#L40-L51)。

两种 payload 的设备数组均有 `deviceId:number`、`imageURL:string`、`deviceName:string`、`category:number`；deviceId 映射不能默认只取第一台设备。`requestUrl`、`statusCode`、`headers`、`errorMessage`、`payload`、`successful` 属于 mobile gateway 包装，不应被声明为独立 metrics 响应字段。[录制](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/tests/stats/cassettes/test_daily_training_status.yaml#L40-L67)。

这些字段可支持保守 optional 类型；不能从一个录制推导全部账号和设备的必填字段或所有状态枚举。公开仓库中 aggregated、max metrics、race predictions 的准确根结构仍缺少同路径证据，不借用该 mobile gateway payload 填补。本轮账户实测的独立观察见下节。

## 本轮会话实测

2026-10-08 使用中国区和国际区各一个已有账号会话，通过插件 DI runtime 为当前 SDK 桥接鉴权。日查询日期为 `2026-10-07`，范围为 `2026-10-01` 至 `2026-10-07`；两区各调用全部 13 个新增方法，共 26 次正常完成，包含 `null` 和空数组。两个会话均成功刷新并保存。验证器没有记录原始 HTTP 状态码，因此此处仅报告方法调用结果。

以下是直接调用这批 SDK 方法得到的根形状与字段名，不包含账号标识值或健康数值：

| 方法 | 本轮观察 |
|---|---|
| `getDailyTrainingStatus` | 两区均为对象，根有 `userId`、`latestTrainingStatusData`、`recordedDevices`、`showSelector`、`lastPrimarySyncDate` |
| `getTrainingStatus` | 两区均为对象，根有 `userId`、`mostRecentVO2Max`、`mostRecentTrainingLoadBalance`、`mostRecentTrainingStatus`、`heatAltitudeAcclimationDTO` |
| `getTrainingLoadBalance` | 两区均为对象，根有 `userId`、`metricsTrainingLoadBalanceDTOMap`、`recordedDevices` |
| `getMaxMetrics` | 两区均为空数组 |
| `getMaxMetricsRange` | 中国区为空数组；国际区为非空数组，条目根有 `userId`、`generic`、`cycling`、`heatAltitudeAcclimation` |
| `getRacePredictions` | 两区均为对象，根有 `userId`、`fromCalendarDate`、`toCalendarDate`、`calendarDate`、`time5K`、`time10K`、`timeHalfMarathon`、`timeMarathon` |
| `getRacePredictionsRange` | 中国区为空数组；国际区为非空数组，条目字段与本轮 latest 根字段相同 |

这些观察补充了根结构证据，当前宽类型仍保留对象、数组、未知字段和空数据。单个账号/日期的结果不能证明完整设备覆盖、嵌套字段的全部非空类型、服务端区间上限或月聚合响应。完整方法结果见 [脱敏验证报告](../testing/session-validation-2026-10-08.md)。

## 中国区、验证和待确认项

本批七个方法已在 TS 库实现，公共类型由包入口导出。比赛预测使用独立 latest/range 方法与可选参数对象；range 默认按日，所有参数先校验再读取当前 profile，账号标识不缓存。构建、59 项离线单元测试及严格 TypeScript consumer 声明检查全部通过：恢复 API 13 项、训练 API 8 项、HTTP 刷新 16 项、日期契约 10 项、token 文件 12 项。单元测试使用合成凭证和临时文件，不需要真实账号或网络。

新增测试覆盖账号之间的独立刷新、同一账号的并发刷新合并、等待请求的单次重试、刷新失败传播、缺少请求配置的错误保留、token 完整加载与文件权限，以及跨时区/夏令时日期边界。严格声明检查也验证包入口类型可供外部 TypeScript 项目使用。

Python 通过 `Garmin(is_cn=...)` 选择 domain，新 client 构造 `https://connectapi.{domain}`；新增方法应复用现有 TS `UrlClass` 地区适配。这只证明客户端路由方式，不证明每个接口在 CN/global、每种设备上都可用。[地区域名](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/client.py#L305-L324)。

单元测试已核对路径、query、displayName 编码、资料缺失、无效输入及原始数据透传。后续需要扩充设备与日期样本，确认嵌套 schema、月聚合、服务端区间限制和多设备变化；继续保留未知字段。SDK 的原生 DI 会话支持、DSH 插件依赖切换和 npm 发布尚未完成。
