export const BOSS_REPLY_PARTIAL_REVIEW_PROTOCOL = `【多问题部分回复协议】
本协议在启用时补充并覆盖此前“必须完整回答，否则整轮转人工”的规则。
当一条 HR 消息同时包含多个相互独立的问题时，逐项判断是否存在充分且仍有效的已确认依据：
1. 若所有问题都可安全回答，action 返回 reply，needsHumanReview 返回 false，unansweredTopics 返回空数组。
2. 若至少一个问题可安全回答，但薪资、详细住址、具体时间、联系方式、承诺或其他问题缺少依据，action 仍返回 reply；reply 只回答有依据且可独立表达的部分，完全避开不可回答内容，不使用占位符，也不声称已经完整回答；needsHumanReview 返回 true，unansweredTopics 列出待人工核验的主题。
   “完全避开”是指 reply 中不得提及该主题、不得解释缺少答案、不得说暂时不清楚、需要确认、之后沟通或反问 HR；只保留其他可回答问题的直接答案。部分回复不添加“您好”“你好”等称呼，不补充对方未问的专业、经历或优势，不使用括号添加说明，也不主动追加岗位、团队或项目追问。学历层次、学制和毕业状态等具体答案必须逐项由本轮证据支持，本协议不预设候选人的具体学历。例如薪资待核验时，reply 正文不能出现“薪资”“待遇”“暂时没有具体数字”等表述。
3. 若没有任何问题可安全回答，或省略待核验内容会造成误导、错误承诺或语义不完整，action 返回 need_human，reply 为空。
4. “目前住在哪里、目前在哪”通常是询问现居城市；有现居城市依据时可以回答。只有询问街道、小区、门牌等详细住址时，才按隐私信息处理。
5. needsHumanReview 只能和 action=reply 同时使用；此时 evidenceIds 只引用直接支持 reply 正文的证据，待核验主题不需要凑证据。

输出仍为一个 JSON 对象，字段必须完整：
{"action":"reply|ignore|need_human","intent":"意图标识","reply":"可直接发送的安全回复，非 reply 时为空字符串","reason":"简短原因","evidenceIds":["证据 ID"],"needsHumanReview":false,"unansweredTopics":[]}

needsHumanReview 为 true 时，unansweredTopics 必须为 1 至 10 个简短主题；否则必须为空数组。`

export function buildBossReplyTopicRewriteProtocol(topics: string[]): string {
  return `【部分回复纠错】
上一轮回复正文仍然提到了必须避开的待人工核验主题：${topics.join('、')}。
请重新完成本轮决策，只回答有已确认依据的其他独立问题。reply 中不得出现上述主题及其核心词，不得解释为什么没有回答，不得使用“不清楚、暂时没有、需要确认、之后沟通”等替代说法，不添加“您好”“你好”等称呼，不使用括号补充说明，也不添加对方未问的信息或新的追问。
若删除这些主题后仍有完整、自然且有证据支持的内容，保持 action=reply、needsHumanReview=true，并在 unansweredTopics 中保留上述主题；否则返回 need_human。只输出完整 JSON。`
}
