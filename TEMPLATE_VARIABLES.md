# AI 与招呼语模板变量说明

本文根据岗位类型 `src/composables/useHelper/type.ts`、当前工作流及实际模板渲染逻辑整理，适用于 AI 筛选提示词、AI 招呼语提示词和自定义招呼语。

## 1. 快速使用

使用双花括号包裹变量路径，变量名区分大小写：

```text
{{jobData.boss.name}}，您好！我对贵公司的 {{jobData.jobName}} 岗位很感兴趣，期待进一步沟通。
```

示例数据下会渲染为：

```text
张经理，您好！我对贵公司的 前端开发工程师 岗位很感兴趣，期待进一步沟通。
```

- **AI 筛选、AI 招呼语**：提示词中字符串形式的消息内容会自动替换变量；复杂消息的内容数组不会由当前逻辑逐项渲染。
- **自定义招呼语**：需要启用自定义招呼语，并开启变量开关（配置项 `greetingVariable.value`）。纯文本及混合消息中的 `text` 内容支持替换，图片内容不参与渲染。
- 变量直接从工作流数据根节点读取，不要额外加 `data.` 或 `ctx.` 前缀。
- 示例内容仅用于说明，不代表所有岗位都能获取这些信息；平台未提供的字段可能为空。

## 2. 语法与渲染规则

| 写法或数据                           | 行为                                                            |
| ------------------------------------ | --------------------------------------------------------------- |
| `{{jobData.jobName}}`                | 读取岗位名称                                                    |
| `{{ jobData.brand.name }}`           | 花括号内部路径两侧允许空白                                      |
| `{{jobData.showSkills}}`             | 字符串数组转为英文逗号分隔文本，例如 `Vue,React,TypeScript`     |
| `{{jobData.showSkills.0}}`           | 读取第一个元素；下标从 `0` 开始                                 |
| `{{jobData.showSkills.length}}`      | 读取数组长度                                                    |
| 不存在、`undefined` 或 `null` 的字段 | 替换为空字符串                                                  |
| 数字、布尔值                         | 原样转为字符串，例如 `0`、`true`、`false`                       |
| 普通对象                             | 通常变成 `[object Object]`，不会自动输出 JSON；请读取具体子字段 |

当前仅支持点分隔的属性路径，**不支持 JavaScript 表达式、函数调用、条件、循环、默认值或单位换算**。以下写法均不受支持，不会按表达式求值：

```text
{{jobData.showSkills[0]}}
{{jobData.showSkills.join('、')}}
{{jobData.boss.name || '招聘老师'}}
{{state.amap.distance.driving.distance / 1000}}
```

替换只进行一遍：字段值中即使包含 `{{...}}`，也不会递归渲染。文本不会自动进行 HTML 或 JSON 转义；如果用变量拼接 JSON，需注意描述中的引号、换行可能破坏 JSON 格式。

## 3. 岗位变量 `jobData`

这些变量是跨平台模板优先使用的数据。表中“可选”表示类型允许缺省；即使类型必填，实际抓取结果也可能是空字符串或空数组。

### 3.1 基本信息与职位要求

| 变量                          | 含义                    | 类型 / 示例              | 备注                           |
| ----------------------------- | ----------------------- | ------------------------ | ------------------------------ |
| `{{jobData.key}}`             | 岗位唯一键              | 字符串                   | 内部标识                       |
| `{{jobData.link}}`            | 岗位链接                | 字符串                   | 可选                           |
| `{{jobData.companyId}}`       | 公司唯一标识            | 字符串                   | 可选，用于公司去重             |
| `{{jobData.hrId}}`            | 招聘者唯一标识          | 字符串                   | 可选，用于 HR 去重             |
| `{{jobData.jobName}}`         | 职位名称                | `前端开发工程师`         | 常用                           |
| `{{jobData.positionName}}`    | 职位名称 / 职位分类名称 | `前端工程师`             | 具体值以平台数据为准           |
| `{{jobData.jobDescription}}`  | 职责与任职要求          | `负责前端页面开发……`     | BOSS 工作流在获取详情后补全    |
| `{{jobData.experienceName}}`  | 经验要求                | `3-5年`                  | 字符串                         |
| `{{jobData.degreeName}}`      | 学历要求                | `本科`                   | 字符串                         |
| `{{jobData.salary}}`          | 薪资描述                | `15-25K`                 | 原始描述，不会拆分上下限       |
| `{{jobData.city}}`            | 工作城市 / 区域         | `北京-朝阳区`            | 可选                           |
| `{{jobData.address}}`         | 详细工作地址            | `北京市朝阳区某大厦`     | 可选，BOSS 获取详情后补全      |
| `{{jobData.addressCoords}}`   | 地址经纬度              | `116.397128,39.916527`   | 可选，顺序为经度、纬度         |
| `{{jobData.addressCoords.0}}` | 地址经度                | `116.397128`             | 可选                           |
| `{{jobData.addressCoords.1}}` | 地址纬度                | `39.916527`              | 可选                           |
| `{{jobData.showSkills}}`      | 展示技能标签            | `Vue,React,JavaScript`   | 字符串数组                     |
| `{{jobData.skills}}`          | 技能要求                | `PHP,PHP开发经验`        | 字符串数组                     |
| `{{jobData.jobLabels}}`       | 岗位标签                | `1-3年,学历不限`         | 字符串数组                     |
| `{{jobData.welfareList}}`     | 福利列表                | `意外险,工龄奖,团建聚餐` | 可选，字符串数组               |
| `{{jobData.activeTime}}`      | 活跃时间戳              | `1640995200000`          | 可选，毫秒，不会自动格式化日期 |
| `{{jobData.activeTimeStr}}`   | 活跃状态描述            | `上周活跃`               | 可选，适合直接展示             |

### 3.2 招聘者信息

| 变量                              | 含义              | 类型 / 示例 | 备注                               |
| --------------------------------- | ----------------- | ----------- | ---------------------------------- |
| `{{jobData.boss.name}}`           | 招聘者姓名        | `张经理`    | 常用称呼                           |
| `{{jobData.boss.title}}`          | 招聘者职位        | `技术总监`  | 字符串                             |
| `{{jobData.boss.link}}`           | 招聘者链接        | 字符串      | 可选                               |
| `{{jobData.boss.avatar}}`         | 招聘者头像 URL    | 字符串      | 只输出 URL，不会自动发送图片       |
| `{{jobData.boss.certificated}}`   | 是否认证          | 布尔值      | 与 `isCertificated` 是两个独立字段 |
| `{{jobData.boss.isHeadhunter}}`   | 是否猎头          | 布尔值      | 可选                               |
| `{{jobData.boss.isFriend}}`       | 是否好友          | 布尔值      | 可选                               |
| `{{jobData.boss.isOnline}}`       | 是否在线          | 布尔值      | 可选，BOSS 获取详情后补全          |
| `{{jobData.boss.isCertificated}}` | 是否已验证 / 认证 | 布尔值      | 可选，BOSS 获取详情后补全          |

### 3.3 公司信息

| 变量                          | 含义          | 类型 / 示例        | 备注                                   |
| ----------------------------- | ------------- | ------------------ | -------------------------------------- |
| `{{jobData.brand.name}}`      | 公司名称      | `北京科技有限公司` | 常用                                   |
| `{{jobData.brand.link}}`      | 公司链接      | 字符串             | 可选                                   |
| `{{jobData.brand.logo}}`      | 公司 Logo URL | 字符串             | 只输出 URL                             |
| `{{jobData.brand.scale}}`     | 公司规模      | `50-150人`         | 字符串                                 |
| `{{jobData.brand.industry}}`  | 所属行业      | `互联网`           | 字符串                                 |
| `{{jobData.brand.stageName}}` | 融资阶段      | `未融资`           | 可选                                   |
| `{{jobData.brand.introduce}}` | 公司介绍      | 字符串             | BOSS 获取详情后补全                    |
| `{{jobData.brand.labels}}`    | 公司标签      | 数组               | 元素类型未固定；对象元素不适合直接渲染 |

## 4. 工作流变量 `state`

工作流结果存放在 `state` 下，只有对应任务已执行并写入数据后才有值。模板引用本身不会自动开启高德地图、AI 招呼语等功能。

### 4.1 高德地图结果

需要启用高德地图、配置 Key 和起点，并在“高德地图”任务获取结果之后使用。距离单位为**米**，时间单位为**秒**，不是设置界面使用的 km / 分钟。

| 变量                                        | 含义                                               |
| ------------------------------------------- | -------------------------------------------------- |
| `{{state.amap.distance.straight.ok}}`       | 直线距离查询是否成功                               |
| `{{state.amap.distance.straight.distance}}` | 直线距离，米                                       |
| `{{state.amap.distance.straight.duration}}` | 直线距离接口返回的耗时，秒；不建议当作实际通勤耗时 |
| `{{state.amap.distance.driving.ok}}`        | 驾车查询是否成功                                   |
| `{{state.amap.distance.driving.distance}}`  | 驾车距离，米                                       |
| `{{state.amap.distance.driving.duration}}`  | 驾车耗时，秒                                       |
| `{{state.amap.distance.walking.ok}}`        | 步行查询是否成功                                   |
| `{{state.amap.distance.walking.distance}}`  | 步行距离，米                                       |
| `{{state.amap.distance.walking.duration}}`  | 步行耗时，秒                                       |

单项查询失败时 `ok` 为 `false`，距离和时间为 `0`；不要把失败结果理解为无需通勤。成功响应缺少数值时也可能得到 `NaN`。

地址解析结果是第一条地理编码记录，不需要再加 `geocodes.0`：

| 变量                                       | 含义                             |
| ------------------------------------------ | -------------------------------- |
| `{{state.amap.geocode.formatted_address}}` | 格式化完整地址                   |
| `{{state.amap.geocode.country}}`           | 国家                             |
| `{{state.amap.geocode.province}}`          | 省份                             |
| `{{state.amap.geocode.city}}`              | 城市                             |
| `{{state.amap.geocode.citycode}}`          | 城市编码                         |
| `{{state.amap.geocode.district}}`          | 区县                             |
| `{{state.amap.geocode.adcode}}`            | 行政区划编码                     |
| `{{state.amap.geocode.location}}`          | 经纬度字符串，格式为 `经度,纬度` |
| `{{state.amap.geocode.level}}`             | 匹配级别                         |
| `{{state.amap.geocode.township}}`          | 乡镇字段，当前类型为数组         |
| `{{state.amap.geocode.street}}`            | 街道字段，当前类型为数组         |
| `{{state.amap.geocode.number}}`            | 门牌号字段，当前类型为数组       |
| `{{state.amap.geocode.neighborhood.name}}` | 社区名称，当前类型为数组         |
| `{{state.amap.geocode.neighborhood.type}}` | 社区类型，当前类型为数组         |
| `{{state.amap.geocode.building.name}}`     | 建筑名称，当前类型为数组         |
| `{{state.amap.geocode.building.type}}`     | 建筑类型，当前类型为数组         |

### 4.2 AI 招呼语生成结果

| 变量                               | 含义                      | 可用条件                        |
| ---------------------------------- | ------------------------- | ------------------------------- |
| `{{state.aiGreeting.greeting}}`    | 生成的招呼语正文          | “AI招呼语生成”成功后            |
| `{{state.aiGreeting.reason}}`      | 生成理由                  | JSON 模式且模型返回该字符串字段 |
| `{{state.aiGreeting.abilities}}`   | 能力列表，英文逗号分隔    | JSON 模式且模型返回字符串数组   |
| `{{state.aiGreeting.abilities.0}}` | 第一项能力                | 能力数组非空                    |
| `{{state.aiGreeting.error}}`       | 模型给出的拒绝 / 过滤原因 | JSON 模式且模型返回该字段       |

注意：

- AI 招呼语提示词渲染前会删除旧的 `state.aiGreeting`，因此不能在本次生成提示词中引用本次生成结果。
- 非 JSON 模式只写入 `greeting`。
- `error` 非空时岗位会被跳过，后续发送任务不会正常继续。
- AI 生成的正文会直接用于发送，不会再执行一次模板变量替换；应让模型输出最终文本，而不是输出待替换的变量。
- 当前 AI 筛选任务只解析结果并判断分数，没有把分数、理由或原始回复写入通用 `state`，因此没有可供后续模板读取的通用 AI 筛选结果变量。

## 5. 平台原始数据 `rawData`（进阶）

`rawData` 是平台专属数据，不是跨平台稳定接口。BOSS 当前提供以下根路径：

| 路径              | 内容               | 可用时机                     |
| ----------------- | ------------------ | ---------------------------- |
| `rawData.jobitem` | 岗位卡片原始数据   | 岗位进入工作流时             |
| `rawData.detail`  | 岗位详情原始数据   | “岗位详情获取”完成后         |
| `rawData.boss`    | 招聘者接口原始响应 | 投递后的“Boss信息获取”完成后 |

代码中已使用的路径示例：

```text
{{rawData.jobitem.encryptJobId}}
{{rawData.jobitem.encryptBossId}}
{{rawData.jobitem.contact}}
{{rawData.detail.jobInfo.postDescription}}
{{rawData.detail.bossInfo.activeTimeDesc}}
{{rawData.detail.brandComInfo.introduce}}
{{rawData.boss.data.bossId}}
```

优先使用对应的 `jobData` 字段。`rawData.detail`、`rawData.boss` 初始化时使用延迟对象，访问尚未获取的数据可能触发缺失依赖错误，不一定只渲染为空。尤其不要在投递前的 AI 筛选 / AI 招呼语生成提示词中读取投递后才产生的 `rawData.boss`。

原始数据中可能含平台内部标识或安全相关字段，不建议加入招呼语或发送给 AI 服务商。

## 6. 工作流中的可用时机

BOSS 当前定义的主要顺序为：

```text
岗位卡片与基础筛选
  → 岗位详情获取
  → 详情相关筛选
  → 高德地图（启用时）
  → AI 筛选（启用时）
  → AI 招呼语生成（启用时）
  → 岗位投递
  → Boss 信息获取
  → 自定义招呼语 / AI 招呼语发送
```

这是任务定义中的主要顺序，实际执行还受功能开关、任务依赖、运行模式、缓存和过滤结果影响。只运行部分阶段或重新生成时，不应假定所有前序可选任务都有结果。

- AI 筛选和 AI 招呼语生成都声明了“岗位详情获取”依赖，可以优先使用详情补全后的 `jobData`。
- 高德地图未启用或尚未产生结果时，`state.amap` 下的普通缺失字段会渲染为空。
- 自定义招呼语只有在相关生成任务确实执行过时，才能读取 `state.aiGreeting`；不要仅因变量存在于类型定义中就假定运行时有值。

## 7. 不要把日志字段当作模板变量

`src/composables/useHelper/type.ts` 中的 `LogData` 用于日志数据描述，但当前 `renderTemplate()` 接收的是 `WorkflowData`：

```text
jobData  标准岗位信息
rawData  平台原始信息
state    工作流中间结果
```

因此以下日志字段**不是当前工作流自动提供的模板变量**：

| 日志字段                                                               | 当前模板应如何处理                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 顶层 `amap`                                                            | 改用 `state.amap` 下的具体字段                                           |
| 顶层 `bossData`                                                        | 标准招聘者信息用 `jobData.boss`；原始响应用 `rawData.boss`，注意获取时机 |
| `aiGreetingA`                                                          | 生成后的正文使用 `state.aiGreeting.greeting`                             |
| `aiFilteringQ`、`aiFilteringR`、`aiFilteringAjson`、`aiFilteringAtext` | 当前工作流没有自动注入这些变量                                           |
| `aiGreetingQ`、`aiGreetingR`                                           | 当前工作流没有自动注入这些变量                                           |
| `el`、`message`、`err`                                                 | 当前工作流没有自动注入这些变量                                           |
| 日志中的字符串 `state`                                                 | 当前模板中的 `state` 是结果对象，不是日志状态字符串                      |

`ctx.now`、`ctx.index`、`ctx.helper` 等任务上下文也没有作为模板根数据传入，不能直接用来渲染当前日期、序号或个人简历信息。个人经历需要自行填写到提示词中，不能凭空引用不存在的变量。

## 8. 可直接参考的模板

### 自定义招呼语

```text
{{jobData.boss.name}}，您好！看到 {{jobData.brand.name}} 正在招聘 {{jobData.jobName}}，希望有机会进一步了解岗位要求，期待与您沟通。
```

### AI 筛选提示词中的岗位资料

将下面内容加入已有筛选提示词，保留原有评分与输出格式要求：

```text
请根据我的真实经历与求职偏好评估以下岗位。资料为空时请标记为未知，不要编造。

岗位：{{jobData.jobName}}
职位分类：{{jobData.positionName}}
公司：{{jobData.brand.name}}
行业：{{jobData.brand.industry}}
规模：{{jobData.brand.scale}}
融资阶段：{{jobData.brand.stageName}}
薪资：{{jobData.salary}}
经验要求：{{jobData.experienceName}}
学历要求：{{jobData.degreeName}}
城市：{{jobData.city}}
地址：{{jobData.address}}
技能：{{jobData.skills}}
福利：{{jobData.welfareList}}
岗位描述：
{{jobData.jobDescription}}

公司介绍：
{{jobData.brand.introduce}}
```

### AI 招呼语提示词（非 JSON 模式）

```text
请基于我在提示词中提供的真实经历，为以下岗位写一段简洁、自然的中文招呼语。
只输出可直接发送的正文，不要输出分析、Markdown 或模板占位符，不要编造我的经历。
招聘者姓名为空时使用“您好”，不要生造称呼。

招聘者：{{jobData.boss.name}}
招聘者职位：{{jobData.boss.title}}
公司：{{jobData.brand.name}}
岗位：{{jobData.jobName}}
岗位技能：{{jobData.showSkills}}
岗位描述：
{{jobData.jobDescription}}
```

如启用了 AI 招呼语 JSON 模式，需明确要求模型输出 JSON 对象：`greeting` 为非空正文字符串，`reason` 为可选字符串，`abilities` 为可选字符串数组；不适合沟通时可返回非空字符串 `error` 以过滤岗位。

### AI 提示词中的通勤信息（需先获取高德结果）

```text
以下距离单位为米，时间单位为秒。查询成功标记为 false 或数据为空时，请视为未知，不要当作零距离。

驾车查询成功：{{state.amap.distance.driving.ok}}
驾车距离：{{state.amap.distance.driving.distance}}
驾车耗时：{{state.amap.distance.driving.duration}}
步行查询成功：{{state.amap.distance.walking.ok}}
步行距离：{{state.amap.distance.walking.distance}}
步行耗时：{{state.amap.distance.walking.duration}}
```

这里的单位换算或缺失处理是要求 AI 理解的文字指令，不是模板引擎执行的计算。

## 9. 维护依据

更新变量或工作流时，请同步核对：

- `src/composables/useHelper/type.ts`：`JobBaseData`、`JobData`、`LogData`。
- `src/composables/useApplying/type.ts`：`WorkflowData`、`WorkflowState`。
- `src/composables/useApplying/handles.ts`：地图结果、AI 结果写入及招呼语渲染。
- `src/composables/useApplying/utils.ts`：AI 招呼语解析字段。
- `src/composables/useModel/chatModel.ts`：AI 提示词渲染入口。
- `src/utils/ai.ts`：变量语法与字符串转换规则。
- `src/utils/amap.ts`：高德地理编码、距离与时间结构。
- `src/entrypoints/boss/delivery.ts`、`src/entrypoints/boss/index.ts`：BOSS 工作流顺序、依赖与详情补全。
