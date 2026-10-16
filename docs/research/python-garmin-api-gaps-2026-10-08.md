# Python Garmin Connect API 对照与 TS 库补齐建议

调查日期：2026-10-08。源码调查使用原项目源码、原项目测试记录和 GitHub API；同日另使用已有本机会话完成只读验证，结果单列于下文。日期占位符均指 `YYYY-MM-DD`，路径均相对于该账号地区的 `connectapi` 服务。

## 调查基线和证据层级

| 原项目 | 固定源码版本 | 状态和用途 |
|---|---|---|
| [cyberjunky/python-garminconnect](https://github.com/cyberjunky/python-garminconnect) | [`218e72ca5459e014435fc2d94fd18bd601fa0c14`](https://github.com/cyberjunky/python-garminconnect/commit/218e72ca5459e014435fc2d94fd18bd601fa0c14)，2026-09-29 | 当前维护的 Python API 包；优先参考其现用 endpoint 和参数。 |
| [matin/garth](https://github.com/matin/garth) | [`f99159a15c4c9463ce215a60ba9f7cb21f94a3b7`](https://github.com/matin/garth/commit/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7)，2026-03-28 | 已发布最终版本并弃用；可参考响应模型及公开录制 cassette，不能直接作为未来认证方案。 |

Python 新版已经改为自己的 client：`Garmin.connectapi()` 委托给 `Client.connectapi()`，后者实际发送 GET 并返回 JSON。[包装层](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L831-L839)、[client](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/client.py#L1596-L1601)。因此旧资料中“Python Garmin Connect 基于 garth”的说明不适合当前版本。

本文区分三类公开证据：**源码实现**证明开源客户端发出了什么请求；**录制 cassette**证明过去的真实服务器响应形状；**mock fixture / 模型**证明客户端预期，不证明服务器一定返回该值或字段。2026-10-08 的账户实测另外标注，不把公开 mock 当作本轮真实返回。

## 第一批：HRV、压力、身体电量、训练准备度

| 建议 TS 方法 | 证实的 GET 路径 / query | 原始响应形状 | 证据 |
|---|---|---|---|
| `getHrvData(date)` | `/hrv-service/hrv/{date}`；无 query | 对象，或无数据；HRV 历史录制有 `204 No Content` | [Python 请求](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2269-L2275)、[garth 请求和模型](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/src/garth/data/hrv.py)、[录制](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/tests/data/cassettes/test_hrv_data_get.yaml#L17-L44) |
| `getHrvSummaries(startDate,endDate)` | `/hrv-service/hrv/daily/{startDate}/{endDate}`；无 query | `{ hrvSummaries: [...], userProfilePk: number }` | [当前 Python 原生范围实现](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2277-L2288)、[garth 实现](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/src/garth/stats/hrv.py)、[录制](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/tests/stats/cassettes/test_daily_hrv.yaml#L17-L24) |
| `getStressData(date)` | `/wellness-service/wellness/dailyStress/{date}`；无 query | 对象，同时包含 `stressValuesArray` 和 `bodyBatteryValuesArray` | [Python 请求](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2170-L2176)、[garth 模型和请求](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/src/garth/data/body_battery/daily_stress.py)、[录制](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/tests/data/cassettes/test_daily_body_battery_stress_get.yaml#L17-L38) |
| `getStressSummaries(startDate,endDate)` | `/usersummary-service/stats/stress/daily/{startDate}/{endDate}`；无 query | `[{ calendarDate, values: { overallStressLevel, restStressDuration, lowStressDuration, mediumStressDuration, highStressDuration } }]` | [路径](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/src/garth/stats/stress.py)、[录制](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/tests/stats/cassettes/test_daily_stress.yaml#L17-L31) |
| `getBodyBattery(startDate,endDate=startDate)` | `/wellness-service/wellness/bodyBattery/reports/daily?startDate={startDate}&endDate={endDate}` | 日条目数组；单日仍走同一路径、两个相同 query 日期 | [Python 请求](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L1577-L1592)、[Python typed 模型](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/typed.py#L295-L316) |
| `getTrainingReadiness(date)` | `/metrics-service/metrics/trainingreadiness/{date}`；无 query | 录制为快照数组，无数据录制为 `[]`；Python typed 也接纳单对象 | [Python 请求](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2290-L2296)、[真实录制](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/tests/data/cassettes/test_training_readiness_data_get.yaml#L16-L86)、[Python typed 归一化](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/typed.py#L538-L558) |

HRV 范围与压力 summary 范围是独立的服务器 endpoint，不能把它们误写成逐日请求循环。garth 的 28 天 page size 是客户端分片策略；仅凭这一常量不能认定服务器拒绝所有大于 28 天的区间。garth 用 `start = end - (period - 1)` 计算每日范围，说明其调用约定包含首尾两日。[HRV 分片](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/src/garth/stats/hrv.py)、[通用统计分片](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/src/garth/stats/_base.py)。本次未发现训练准备度的独立范围 endpoint；将来若提供范围便利方法，应明确它是客户端循环。

### HRV 可确认字段和缺失情况

公开录制的日对象根字段是 `userProfilePk`（小写 `k`）、`hrvSummary`、`hrvReadings` 和 `startTimestampGMT` / `endTimestampGMT` / `startTimestampLocal` / `endTimestampLocal`，还包括对应四个 `sleep*Timestamp*` 字段。时间字段录制值为字符串。每条读数有 `hrvValue`、`readingTimeGMT`、`readingTimeLocal`。[原始录制](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/tests/data/cassettes/test_hrv_data_get.yaml#L20-L43)。

日对象的 `hrvSummary` 与范围的 `hrvSummaries[]` 共有 `calendarDate`、`weeklyAvg`、`lastNightAvg`、`lastNight5MinHigh`、`baseline`、`status`、`feedbackPhrase`、`createTimeStamp`。`baseline` 包含 `lowUpper`、`balancedLow`、`balancedUpper`、`markerValue`。garth 范围模型允许部分平均值、baseline 和 marker 为 null；TS 不应把全部字段设为必填，也不应把 `status` 固定为目前观察到的几个字符串。[日模型](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/src/garth/data/hrv.py)、[范围模型](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/src/garth/stats/hrv.py)。

注意 Python typed 使用 `userProfilePK` alias，其单元测试是自行构造 `SAMPLE_HRV_DATA` 并用 `MagicMock` 返回；不能覆盖录制中 `userProfilePk` 的事实。保守处理可保留两种可选拼写，但原始响应不应被静默改名。[typed 模型](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/typed.py#L269-L287)、[mock fixture 和测试](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/tests/test_typed.py#L103-L122)。

同一公开 cassette 的较早无数据日请求返回 204；garth HTTP client 明确把 204 转为 `None`。TS 方法应把空数据作为正常情况，而不是构造包含虚假平均值的对象。[无数据录制](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/tests/data/cassettes/test_hrv_data_get.yaml#L184-L222)、[204 处理](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/src/garth/http.py#L243-L249)。

### 压力、身体电量和准备度类型边界

压力日记录中的账号字段是 `userProfilePK`（大写 `PK`），与 HRV 不同；还有 `calendarDate`、四项日界时间字符串、`maxStressLevel`、`avgStressLevel`、`stressChartValueOffset`、`stressChartYAxisOrigin`。`stressValuesArray` 在录制中是 `[timestamp, stressLevel]`；`bodyBatteryValuesArray` 是 `[timestamp, status, level, version]`，不是同一个二元读数格式。[录制](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/tests/data/cassettes/test_daily_body_battery_stress_get.yaml#L20-L25)、[读数解析器](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/src/garth/data/body_battery/readings.py#L24-L59)。应保留 raw 数组，后续解析器再依据 descriptor 或明确位置处理；不能把压力日数组与 reports/daily 数组假定为完全同形。

Python `BodyBatteryEntry` 模型预期 `date`、`charged`、`drained`、四项日界时间、`bodyBatteryValuesArray`、`bodyBatteryValueDescriptorDTOList`。其 `[timestamp, level]` 测试样本是 mock，公开源码调查没有取得 reports/daily 的真实录制，因此数组元组含义先保持宽类型。[模型](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/typed.py#L295-L316)、[mock](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/tests/test_typed.py#L125-L137)。本轮两区实测均返回日条目数组，并观察到上述根字段，包括单数拼写 `bodyBatteryValueDescriptorDTOList`；数值数组仍按原样保留。

训练准备度真实录制证实 `userProfilePK`、`calendarDate`、`timestamp`、`timestampLocal`、`deviceId`、`score`、`level`、`feedbackLong`、`feedbackShort`、`sleepScore`、`recoveryTime`、`acuteLoad`、`hrvWeeklyAverage`、`validSleep`、`primaryActivityTracker`、`inputContext`，以及 sleepScore/recoveryTime/acwr/hrv/stressHistory/sleepHistory 的 factor percent/feedback。对应的 `*FactorFeedbackPhrase` 和 `recoveryTimeChangePhrase` 可为 null，TS 适合设为可选且可空。[录制](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/tests/data/cassettes/test_training_readiness_data_get.yaml#L19-L86)、[对应 VCR 测试](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/tests/data/test_training_readiness.py#L9-L10)。Python 模型注释将恢复时间解释为分钟，并提示 `REACHED_ZERO` 时已恢复；这是客户端知识，录制本身不证明单位，应和原始值一起保留。[Python typed 模型](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/typed.py#L323-L379)。

“晨间准备度”是同一个日响应中 `inputContext == AFTER_WAKEUP_RESET` 的筛选；Python 在找不到时退回第一条，garth 则返回空。第一条必定等于晨间值没有得到证实，所以基础 TS 方法应先返回整组快照。[Python 筛选](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2298-L2343)、[garth 筛选](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/src/garth/data/morning_training_readiness.py#L36-L67)。

## 中国区和国际区

Python `is_cn` 仅选择 `garmin.cn` 或 `garmin.com`，业务 endpoint 常量相同；新 client 按账号 domain 构造 `connectapi`、SSO、mobile integration 和 DI auth 地址。garth 也用可配置 domain 形成 `https://connectapi.{domain}`。因此 TS 应继续通过现有地区 URL 构造器生成地址，不在新增健康方法内硬编码 `.com`。[Python 地区选择](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L795-L800)、[client 域名适配](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/client.py#L305-L324)、[garth URL 构造](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/src/garth/http.py#L162-L174)。

上述源码证实地区路由适配；公开录制 HRV/压力样本均为 `.com`。本轮另外完成 CN/global 各一个账号的直接查询，见下节。中国区账户的全部设备能力、HRV 状态覆盖和权限组合仍需要更多样本。Python 还注明中国账户睡眠 `*Local` 时间可能重复偏移，建议先用 GMT 再转换；不能未经验证把这一睡眠问题推广到全部 endpoint。[睡眠注释](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2116-L2125)。

## 本轮会话实测与单元测试

通过现有插件 DI runtime 桥接 SDK 鉴权，使用中国区与国际区各一个已有会话，各调用全部 13 个新增 API，共 26 次正常完成。日查询为 `2026-10-07`，范围为 `2026-10-01` 至 `2026-10-07`；两个会话已刷新并保存。验证器未记录原始 HTTP 状态码，此处报告方法调用结果及响应形状。

中国区 HRV 日/范围在本轮返回 `null`，国际区返回对象；压力日两区都返回对象，但本轮中国区对象没有国际区样本中的 Body Battery 字段。压力范围和训练准备度在中国区返回空数组，在国际区返回非空数组。Body Battery 两区均为非空数组，条目含 `bodyBatteryValuesArray` 和 `bodyBatteryValueDescriptorDTOList`。这些是所选账号与日期的观察，空数据不能推导为整个地区不支持该功能。训练分析根字段见 [第二批调查的实测节](training-metrics-apis-2026-10-08.md#本轮会话实测)，逐方法结果见 [脱敏验证报告](../testing/session-validation-2026-10-08.md)。

构建、59 项离线单元测试及严格 TypeScript consumer 声明检查全部通过。59 项分别为恢复 API 13 项、训练 API 8 项、HTTP 刷新 16 项、日期契约 10 项、token 文件 12 项。覆盖请求契约、原始字段和空数据保留、profile 变更、跨时区和闰年边界、账号间独立刷新、并发刷新/重试、失败传播以及完整 token 加载和文件权限。离线测试只用合成凭证和临时文件，无需真实账号。

## 后续补齐优先级

以下优先级是结合恢复和训练分析用途的维护建议，不是上游的接口稳定性承诺。

| 优先级 | 数据 / 建议方法 | 已证实的路径及参数 | 原项目依据 |
|---|---|---|---|
| P1 | VO₂ max / max metrics 日与范围 | `/metrics-service/metrics/maxmet/daily/{start}/{end}`；单日使用 `{date}/{date}`，无 query；当前 Python demo 将 max metrics 对应到 VO₂、fitness age | [路径常量](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L592)、[日与范围方法](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L1675-L1694)、[demo 用途说明](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/demo.py#L245-L248) |
| P1 | 活动 laps / typed splits / split summaries | `/activity-service/activity/{activityId}/splits`、`/activity-service/activity/{activityId}/typedsplits`、`/activity-service/activity/{activityId}/split_summaries`；均无 query。typed splits 在部分活动类型提供更多细节 | [Python 三个方法](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L3294-L3318)、[公共路径常量](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L739) |
| P1 | 活动详细图表与轨迹 | `/activity-service/activity/{activityId}/details?maxChartSize={maxChartSize}&maxPolylineSize={maxPolylineSize}`；Python 默认 `2000` 和 `4000`，前者须正数，后者可为零 | [Python](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L3378-L3389) |
| P1 | 活动心率区间停留时间 | `/activity-service/activity/{activityId}/hrTimeInZones`；无 query。另有同一活动 `/powerTimeInZones`，不要用名称相近的用户训练分区配置接口代替 | [Python](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L3328-L3342) |
| P1 | `getDailyTrainingStatus(date)` | `/metrics-service/metrics/trainingstatus/daily/{date}`，注释明确含 acute/chronic load、ACWR | [Python](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2356-L2366) |
| P1 | `getTrainingStatus(date)` | `/metrics-service/metrics/trainingstatus/aggregated/{date}` | [Python](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2478-L2484) |
| P1 | `getTrainingLoadBalance(date)` | `/metrics-service/metrics/trainingloadbalance/latest/{date}`；date 为观察四周负荷的结束日 | [Python](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2345-L2354) |
| P1 | Body Battery 事件 | `/wellness-service/wellness/bodyBattery/events/{date}`；可解释睡眠、活动、小睡的电量变化 | [Python](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L1594-L1603)、[garth 事件模型](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/src/garth/data/body_battery/events.py#L64-L196) |
| P1 | 睡眠每日范围 | `/sleep-service/stats/sleep/daily/{start}/{end}`；Python 读 `individualStats` 并按日去重 | [Python](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2132-L2168) |
| P2 | 比赛预测 latest / 日与月范围 | 最新 `/metrics-service/metrics/racepredictions/latest/{displayName}`，无 query；范围 `/metrics-service/metrics/racepredictions/{type}/{displayName}?fromCalendarDate={startDate}&toCalendarDate={endDate}`，type 为 `daily` 或 `monthly`。Python 要求完整提供 start/end/type，并对区间超过 366 天做客户端拒绝 | [Python](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2429-L2476)、[路径常量](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L711-L713) |
| P2 | 日呼吸频率 | `/wellness-service/wellness/daily/respiration/{date}` | [Python](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L1944-L1950)、[常量](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L726-L729) |
| P2 | 日 SpO₂ | `/wellness-service/wellness/daily/spo2/{date}`；Python 对 `lastSevenDaysAvgSpO2` 的字符串数值做转换 | [Python](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L1952-L1968) |
| P2 | 耐力分数 | 日 `/metrics-service/metrics/endurancescore?calendarDate={date}`；范围 `/endurancescore/stats?startDate=…&endDate=…&aggregation=weekly` | [Python](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2368-L2392) |
| P2 | 坡度分数 | 日 `/metrics-service/metrics/hillscore?calendarDate={date}`；范围 `/hillscore/stats?startDate=…&endDate=…&aggregation=daily` | [Python](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2494-L2518) |
| P2 | 跑步耐受量 | `/metrics-service/metrics/runningtolerance/stats`；query `startDate`,`endDate`,`aggregation=daily|weekly`，上游默认 weekly | [Python](https://github.com/cyberjunky/python-garminconnect/blob/218e72ca5459e014435fc2d94fd18bd601fa0c14/garminconnect/__init__.py#L2394-L2427) |

如果以后需要按设备的训练状态历史，garth 还提供 `/mobile-gateway/usersummary/trainingstatus/latest/{date}`、`weekly/{start}/{end}`、`monthly/{start}/{end}`。其 `acuteTrainingLoadDTO` 模型包含 `dailyTrainingLoadAcute`、`dailyTrainingLoadChronic`、`dailyAcuteChronicWorkloadRatio` 等字段，但这不能证明 `/metrics-service/.../daily` 同样返回这些嵌套结构。garth 解析只取首个设备，TS 更适合保留全部设备映射。[日模型与解析](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/src/garth/stats/training_status/daily.py#L10-L68)、[周](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/src/garth/stats/training_status/weekly.py#L35-L71)、[月](https://github.com/matin/garth/blob/f99159a15c4c9463ce215a60ba9f7cb21f94a3b7/src/garth/stats/training_status/monthly.py#L35-L71)。

第一批六个恢复方法已补齐；第二批又实现 `getDailyTrainingStatus`、`getTrainingStatus`、`getTrainingLoadBalance`、`getMaxMetrics`、`getMaxMetricsRange`、`getRacePredictions`、`getRacePredictionsRange`，累计新增 13 个方法，构建、59 项无网络单元测试和严格类型检查通过。上表中的日/聚合训练状态、四周负荷、VO₂ max 日/范围和比赛预测已经完成，其余为待迭代项。第二批的请求与类型证据见 [训练分析 API 调查](training-metrics-apis-2026-10-08.md)。已完成上述两区会话实测；SDK 原生 DI 会话支持、DSH 插件依赖切换和 npm 发布尚未完成。

## 实施建议与尚待确认项

第一批先提供原始数据和可选字段类型，承认空数据，复用现有地区/鉴权层；可用请求路径及 query 的单元测试验证封装逻辑。范围方法必须指出返回日 summary 还是夜间全部读数，避免把 HRV daily summaries 当作细粒度 HRV 时序。

仍待扩充账户实测：CN 与国际区更多设备的功能覆盖、reports/daily 元组语义、训练准备度的单对象形态、月聚合、服务端区间上限、后台新增字段与状态枚举。本文仅保留本轮响应形状与字段名，没有复制个人健康数值作为产品样例；上游 mock 数值也没有被当成真实用户返回。
