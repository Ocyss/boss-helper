// @ts-nocheck
import protobufjs, { Root, Type } from 'protobufjs'

const ProtoFile =
  'option java_package = "cn.techwolf.boss.chat";option java_outer_classname = "ChatProtocol";message TechwolfUser { required int64 uid = 1; optional string name = 2; optional string avatar = 3; optional string company = 4; optional int32 headImg = 5; optional int32 certification = 6; optional int32 source = 7;}message TechwolfSound { optional int64 sid = 1; optional string url = 2; optional int32 duration = 3; optional int32 templateId = 4; optional string extend = 5;}message TechwolfVideo { required int32 type = 1; required int32 status = 2; optional int32 duration = 3; optional string text = 4;}message TechwolfInterview { required int32 condition = 1; required string text = 2; optional string url = 3; optional string extend = 4; }message TechwolfImageInfo { required string url = 1; required int32 width = 2; required int32 height = 3;}message TechwolfImage { optional int64 iid = 1; optional TechwolfImageInfo tinyImage = 2; optional TechwolfImageInfo originImage = 3;}message TechwolfAction { required int32 aid = 1; optional string extend = 2;}message TechwolfArticle { required string title = 1; required string description = 2; required string picUrl = 3; required string url = 4; optional int32 templateId = 5; optional string bottomText = 6; optional int64 timeout = 7; optional string statisticParameters = 8; repeated TechwolfSlice highlightParts = 9; repeated TechwolfSlice dimParts = 10; optional string subTitle = 11; optional string extend = 12;}message TechwolfNotify { required string text = 1; optional string url = 2; optional string title = 3;}message TechwolfButton { required string text = 1; optional string url = 2; optional int32 templateId = 3;}message TechwolfDialog { required string text = 1; repeated TechwolfButton buttons = 2; required bool operated = 3; optional bool clickMore = 4; optional int32 type = 5; optional string backgroundUrl = 6; optional int64 timeout = 7; optional string statisticParameters = 8; optional string title = 9; optional string url = 10; optional int32 selectedIndex = 11; optional string extend = 12; optional string content = 13;}message TechwolfJobDesc { required string title = 1; required string company = 2; required string salary = 3; required string url = 4; required int64 jobId = 5; optional string positionCategory = 6; optional string experience = 7; optional string education = 8; optional string city = 9; optional string bossTitle = 10; optional TechwolfUser boss = 11; optional string lid = 12; optional string stage = 13; optional string bottomText = 14; optional string jobLabel = 15; optional int32 iconFlag = 16; optional string content = 17; repeated string labels = 18; optional int64 expectId = 19; optional string expectPosition = 20; optional string expectSalary = 21; optional string partTimeDesc = 22; optional TechwolfUser geek = 23; optional string latlon = 24; optional string distance = 25; optional string extend = 26;}message TechwolfResume { required TechwolfUser user = 1; optional string description = 2; optional string city = 3; optional string position = 4; repeated string keywords = 5; optional int64 expectId = 6; optional string lid = 7; optional int32 gender = 8; optional string salary = 9; optional string workYear = 10; optional string content1 = 11; optional string content2 = 12; optional string education = 13; optional string age = 14; repeated string labels = 15; repeated UserExperience experiences = 16; optional string positionCategory = 17; optional string jobSalary = 18; optional string bottomText = 19; optional string applyStatus = 20; optional int64 jobId = 21; optional string content3 = 22; optional string securityId = 23; optional TechwolfUser boss = 24; optional string brandName = 25; optional string extend = 26;}message TechwolfHyperLink {        required string text = 1;       required string url = 2; required int32 hyperLinkType = 3; optional string extraJson=4;}message TechwolfMessageBody { required int32 type = 1; required int32 templateId = 2; optional string headTitle = 11; optional string text = 3; optional TechwolfSound sound = 4; optional TechwolfImage image = 5; optional TechwolfAction action = 6; repeated TechwolfArticle articles = 7; optional TechwolfNotify notify = 8; optional TechwolfDialog dialog = 9; optional TechwolfJobDesc jobDesc = 10; optional TechwolfResume resume = 12; optional TechwolfRedEnvelope redEnvelope = 13; optional TechwolfOrderDetail orderDetail = 14; optional TechwolfHyperLink hyperLink = 15; optional TechwolfVideo video = 16; optional TechwolfInterview interview = 17; optional TechwolfJobShare jobShare = 18; optional TechwolfResumeShare resumeShare = 19; optional AtInfo atInfo = 20; optional TechwolfSticker sticker = 21; optional TechwolfChatShare chatShare = 22; optional TechwolfInterviewShare interviewShare = 23; optional TechwolfListCard listCard = 24; optional TechwolfStarRate starRate = 25; optional TechwolfFrame frame = 26; optional TechwolfMultiImage multiImage = 27; optional string extend = 28; optional int32 style = 29; optional TechwolfComDesc comDesc = 30; optional TechwolfUserCard userCard = 31;}message TechwolfMessage { required TechwolfUser from = 1; required TechwolfUser to = 2; required int32 type = 3; optional int64 mid = 4; optional int64 time = 5; required TechwolfMessageBody body = 6; optional bool offline = 7; optional bool received = 8; optional string pushText = 9; optional int64 taskId = 10; optional int64 cmid = 11; optional int32 status = 12; optional int32 uncount = 13; optional int32 pushSound = 14; optional int32 flag = 15; optional bytes encryptedBody = 16; optional string bizId = 17; optional int32 bizType = 18; optional string securityId = 19; optional int64 quoteId = 20;}message TechwolfClientInfo { optional string version = 1; optional string system = 2; optional string systemVersion = 3; optional string model = 4; optional string uniqid = 5; optional string network = 6; optional int32 appid = 7; optional string platform = 8; optional string channel = 9; optional string ssid = 10; optional string bssid = 11; optional double longitude = 12; optional double latitude = 13;}message TechwolfClientTime { optional int64 startTime = 1; optional int64 resumeTime = 2; optional int64 locateTime = 3;}message TechwolfPresence { required int32 type = 1; required int32 uid = 2; optional TechwolfClientInfo clientInfo = 3; optional TechwolfClientTime clientTime = 4; optional int64 lastMessageId = 5; optional int64 lastGroupMessageId = 6; optional int64 userId = 7;}message TechwolfKVEntry {        required string key = 1;        required string value = 2;}message TechwolfIq { required int64 qid = 1; required string query = 2; repeated TechwolfKVEntry params = 3;}message TechwolfIqResponse { required int64 qid = 1; required string query = 2; repeated TechwolfKVEntry results = 3;}message TechwolfMessageSync {       required int64 clientMid = 1;    required int64 serverMid = 2;}message TechwolfMessageRead {     required int64 userId = 1;      required int64 messageId = 2;   required int64 readTime = 3;     optional bool sync = 4 [default = false];       optional int32 userSource = 5;}message TechwolfChatProtocol { required int32 type = 1; optional string version = 2; repeated TechwolfMessage messages = 3; optional TechwolfPresence presence = 4; optional TechwolfIq iq = 5; optional TechwolfIqResponse iqResponse = 6; repeated TechwolfMessageSync messageSync = 7; repeated TechwolfMessageRead messageRead = 8; optional TechwolfDataSync dataSync = 9; optional int32 domain = 10;}message TechwolfRedEnvelope { required int64 redId = 1; required string redText = 2; required string redTitle = 3; required string clickUrl = 4;}message TechwolfOrderDetail { required string title = 1; required string subTitle = 2; optional string url = 3; repeated TechwolfOrderDetailEntry orderDetailEntryList = 4;}message TechwolfOrderDetailItem { required string name = 1; required int32 templateId = 2;}message TechwolfOrderDetailEntry { required TechwolfOrderDetailItem key = 1; required TechwolfOrderDetailItem value = 2;}message TechwolfUserSync { required int64 uid = 1; required int32 identity = 2; optional string extraJson = 3; optional int32 userSource = 4;}message TechwolfDataSync { required int32 type = 1; optional TechwolfUserSync userSync = 2; optional TechwolfGroupSync groupSync = 3;}message TechwolfSlice { required int32 startIndex = 1; required int32 endIndex = 2;}message UserExperience { required string organization = 1; required string occupation = 2; optional string startDate = 3; optional string endDate = 4; required int32 type = 5;}message TechwolfJobShare { required TechwolfUser user = 1; required int64 jobId = 2; required string position = 3; required string salary = 4; optional string location = 5; required string company = 6; optional string stage = 7; optional string experience = 8; optional string education = 9; optional string url = 10; optional string lid = 11; optional string price = 12; optional string description = 13; optional int64 bossId = 14; optional string extend = 15;}message TechwolfResumeShare { required TechwolfUser user = 1; required int64 expectId = 2; required string position = 3; required string salary = 4; optional string location = 5; optional string applyStatus = 6; optional string age = 7; optional string experience = 8; optional string education = 9; optional string url = 10; optional string lid = 11; optional int32 gender = 12; optional bool blurred = 13; optional int32 source = 14;}message AtInfo { required int32 flag = 1; repeated int64 uids = 2;}message TechwolfGroupSync { required int64 gid = 1; optional int32 version = 2; optional string encGid = 3; optional string extraJson = 4;}message TechwolfSticker { required int64 sid = 1; optional int64 packId = 2; optional TechwolfImage image = 3; optional string format = 4; optional string name = 5; optional string encSid = 6;}message TechwolfChatShare { required int64 shareId = 1; required string title = 2; repeated string records = 3; optional string bottomText = 4; optional string url = 5; required TechwolfUser from = 6; required TechwolfUser to = 7; required TechwolfUser user = 8;}message TechwolfInterviewShare { required int64 interviewId = 1; required TechwolfUser user = 2; required string title = 3; required string bottomText = 4; optional string url = 5; optional string interviewTime = 6; optional string interviewAddress = 7; optional string jobName = 8;}message TechwolfListItem { optional string title = 1; optional int32 icon = 2; optional string url = 3; optional string text = 4;}message TechwolfListCard { optional string title = 1; repeated TechwolfListItem items = 2; optional int32 pageSize = 3; optional string extend = 4;}message TechwolfStar { required int64 starId = 1; optional string starDesc = 2; repeated TechwolfListItem options = 3;}message TechwolfStarRate { optional string title = 1; repeated TechwolfStar stars = 2; required int32 rateStatus = 3; optional TechwolfStar rateStar = 4; optional TechwolfButton submitButton = 5;}message TechwolfFrame { required string href = 1;}message TechwolfMultiImage { repeated TechwolfImageInfo images = 1;}message TechwolfComDesc { required string picUrl = 1; required string name = 2; optional string stage = 3; optional string scale = 4; optional string industry = 5; repeated string welfareLabels = 6; optional string introduce = 7; optional string url = 8; optional string extend = 9;}message TechwolfUserCard { required string name = 1; required string tiny = 2; optional int32 gender = 3; optional string comment = 4; optional string description = 5; repeated string labels = 6; optional string url = 7; optional string extend = 8;}'

function createMessage(e: ProtoBufferMessage) {
  return {
    init() {
      if (!e.protoRoot || !e.ChatProtocol) {
        throw new Error(
          `Protobuf is not initialized. Please call init() first., ${!e.protoRoot}, ${!e.ChatProtocol}`,
        )
      }
      this.build = {
        chatProtocol: e.ChatProtocol,
        message: e.protoRoot.lookupType('TechwolfMessage'),
        messageSync: e.protoRoot.lookupType('TechwolfMessage'),
        messageRead: e.protoRoot.lookupType('TechwolfMessageRead'),
        presence: e.protoRoot.lookupType('TechwolfPresence'),
        user: e.protoRoot.lookupType('TechwolfUser'),
        body: e.protoRoot.lookupType('TechwolfMessageBody'),
        clientInfo: e.protoRoot.lookupType('TechwolfClientInfo'),
        iq: e.protoRoot.lookupType('TechwolfIq'),
      }
    },
    model: {
      chatProtocol: (t) =>
        e.ChatProtocol.create({
          type: t,
        }),
      message(t, r, i, n, o, s, a) {
        const l = {
          type: t,
          mid: r,
          cmid: r,
          time: Date.now(),
          from: i,
          to: n,
          body: o,
        }
        if (a) {
          l.bizType = a
        }
        if (s) {
          l.taskId = s
        }
        return e.createMessage.build.message.create(l)
      },
      messageSync: (t, r) =>
        e.createMessage.build.messageSync.create({
          clientMid: t,
          serverMid: r,
        }),
      messageRead(t, r, i) {
        const n = i || 0
        return e.createMessage.build.messageRead.create({
          userId: t,
          userSource: n,
          messageId: r,
          readTime: new Date().getTime(),
        })
      },
      presence(t) {
        const r = t.clientInfo
        const i = e.createMessage.build.clientInfo.create({
          version: r.version,
          system: r.system,
          systemVersion: r.systemVersion,
          model: r.model,
          uniqid: r.uniqid,
          network: r.network,
          appid: r.appid,
          platform: r.platform,
          channel: r.channel,
          ssid: r.ssid,
          bssid: r.bssid,
          longitude: r.longitude,
          latitude: r.latitude,
        })
        return e.createMessage.build.presence.create({
          uid: t.uid,
          type: t.type,
          lastMessageId: t.lastMessageId,
          clientInfo: i,
        })
      },
      user(t, r, i) {
        const n = {
          uid: t || 0,
          source: i || 0,
        }
        if (t && r) {
          n.name = r
        }
        return e.createMessage.build.user.create(n)
      },
      body: (t, r) =>
        e.createMessage.build.body.create({
          type: t,
          templateId: r,
        }),
      iq(t) {
        const r = {
          qid: 1,
          query: '/message/suggest',
        }
        if (t && typeof t == 'object') {
          r.params = Object.keys(t).map((e) => ({
            key: e,
            value: String(t[e]),
          }))
        }
        return e.createMessage.build.iq.create(r)
      },
    },
    action(t) {
      const r = this.model
      const i = r.user(t.from.uid, t.from.encryptUid, t.from.source)
      const n = r.user(t.to.uid, t.to.encryptUid, t.to.source)
      const o = r.body(4, 1)
      o.text = t.body.text
      o.action = t.body.action
      const s = r.message(t.type || 1, t.tempID, i, n, o)
      const a = r.chatProtocol(t.type || 1)
      a.messages = [s]
      return e.ChatProtocol.toObject(a, e.toObjectOptions)
    },
    text(t) {
      const r = this.model
      const i = r.user(t.from.uid, t.from.encryptUid, t.from.source)
      const n = r.user(t.to.uid, t.to.encryptUid, t.to.source)
      const o = r.body(1, t.body.templateId || 1)
      o.text = t.body.text
      const s = r.message(t.type || 1, t.tempID, i, n, o, t.taskId, t.bizType)
      const a = r.chatProtocol(1)
      a.messages = [s]
      return e.ChatProtocol.toObject(a, e.toObjectOptions)
    },
    graphic(t) {
      const r = this.model
      const i = r.user(t.from.uid, t.from.encryptUid, t.from.source)
      const n = r.user(t.to.uid, t.to.encryptUid, t.to.source)
      const o = r.body(20, 1)
      o.text = t.body.text
      o.sticker = t.body.sticker
      const s = r.message(t.type || 1, t.tempID, i, n, o)
      const a = r.chatProtocol(1)
      a.messages = [s]
      return e.ChatProtocol.toObject(a, e.toObjectOptions)
    },
    image(t) {
      const r = this.model
      const i = r.user(t.from.uid, t.from.encryptUid, t.from.source)
      const n = r.user(t.to.uid, t.to.encryptUid, t.to.source)
      const o = r.body(3, 1)
      o.image = t.body.image
      const s = r.message(t.type || 1, t.tempID, i, n, o)
      const a = r.chatProtocol(1)
      a.messages = [s]
      return e.ChatProtocol.toObject(a, e.toObjectOptions)
    },
    sync(t) {
      const r = this.model
      const i = r.messageSync(t.clientMid, t.serverMid)
      const n = r.chatProtocol(5)
      n.messageSync = [i]
      return e.ChatProtocol.toObject(n, e.toObjectOptions)
    },
    read(t) {
      const r = this.model
      const i = r.messageRead(t.uid, t.mid, t.userSource)
      const n = r.chatProtocol(6)
      n.messageRead = [i]
      return e.ChatProtocol.toObject(n, e.toObjectOptions)
    },
    presence(t) {
      const r = this.model
      const i = r.presence(t)
      const n = r.chatProtocol(2)
      n.presence = i
      return e.ChatProtocol.toObject(n, e.toObjectOptions)
    },
    iq(t) {
      const r = this.model
      const i = r.chatProtocol(3)
      const n = r.iq(t)
      i.iq = n
      return e.ChatProtocol.toObject(i, e.toObjectOptions)
    },
  }
}
type MessageStanza = {
  uid: number
  groupId?: number
  encryptUid?: string
  encryptGid?: string
  friendSource?: number
  clientMid: number
}

export class ProtoBufferMessage {
  protoRoot: Root
  ChatProtocol: Type
  isInitialized = false
  createMessage: ReturnType<typeof createMessage>
  toObjectOptions: object

  constructor(
    public config: {
      userId: number
      token: string
      platform: 'web'
      friendSource: 0
      supportPush: true
      wt: string
    },
  ) {
    this.toObjectOptions = {
      enums: String,
      bytes: String,
      defaults: true,
      arrays: true,
      objects: true,
      oneofs: true,
    }

    this.init()
  }

  init() {
    if (!this.isInitialized) {
      try {
        this.protoRoot = protobufjs.parse(ProtoFile, {
          keepCase: false,
        }).root
        if (!this.protoRoot) {
          throw new Error('Failed to load proto file')
        }
        this.ChatProtocol = this.protoRoot.lookupType('TechwolfChatProtocol')
        if (!this.ChatProtocol) {
          throw new Error('无法找到 TechwolfChatProtocol 类型')
        }
        this.createMessage = createMessage(this)
        this.createMessage.init()
        this.isInitialized = true
      } catch (e) {
        throw new Error(
          `Failed to initialize Protobuf: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    }
  }
  decode(e) {
    if (!this.isInitialized) {
      throw new Error('Protobuf is not initialized. Please call init() first.')
    }
    try {
      if (!this.ChatProtocol) {
        throw new Error('ChatProtocol type is not initialized')
      }
      let t
      if (typeof e == 'string') {
        const r = atob(e)
        t = new Uint8Array(r.length)
        for (let e = 0; e < r.length; e++) {
          t[e] = r.charCodeAt(e)
        }
      } else {
        if (!(e instanceof Uint8Array)) {
          throw new Error('Invalid bytes format')
        }
        t = e
      }
      const r = this.ChatProtocol.decode(t)
      return this.ChatProtocol.toObject(r, this.toObjectOptions)
    } catch (e) {
      throw new Error(
        `Failed to decode protobuf message: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }
  encode(e) {
    if (!this.isInitialized) {
      throw new Error('Protobuf is not initialized. Please call init() first.')
    }
    if (!e) {
      throw new Error('Cannot encode empty message')
    }
    try {
      if (!this.ChatProtocol) {
        throw new Error('ChatProtocol type is not initialized')
      }
      if (typeof e.encode == 'function') {
        const t = e.encode()
        if (t instanceof Buffer) {
          return t
        } else {
          return t.buffer
        }
      }
      if (!this.isValidMessage(e)) {
        throw new Error('Message verification failed: Invalid message')
      }
      return this.ChatProtocol.encode(e).finish()
    } catch (e) {
      throw new Error(
        `Failed to encode protobuf message: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }
  isValidMessage(e) {
    if (!e || !this.ChatProtocol) {
      return false
    }
    try {
      return this.ChatProtocol.verify(e) === null
    } catch {
      return false
    }
  }

  createTextMessage(e: MessageStanza, t: { text: string; bizType?: number }) {
    const r = this.getMessageStanza(e, {
      type: 1,
      text: t.text,
      bizType: t.bizType,
    })
    return this.createMessage.text(r)
  }
  createImageMessage(
    e: MessageStanza,
    t: {
      content: {
        iid: number
        tinyImage: { url: string; width: number; height: number }
        originImage: { url: string; width: number; height: number }
      }
      templateId?: number
    },
  ) {
    const r = this.getMessageStanza(e, {
      type: 3,
      image: t.content,
      templateId: t.templateId || 1,
    })
    return this.createMessage.image(r)
  }
  createStickerMessage(e: MessageStanza, t: { text?: string; sticker: string }) {
    const r = this.getMessageStanza(e, {
      type: 20,
      text: t.text || '[动画表情]',
      sticker: t.sticker,
    })
    return this.createMessage.sticker(r)
  }
  createActionMessage(
    e: MessageStanza,
    t: { aid: string; extend?: any; templateId?: number; text?: string },
  ) {
    const r = this.getMessageStanza(e, {
      type: 4,
      action: {
        aid: t.aid,
        extend: t.extend,
      },
      templateId: t.templateId || 1,
      text: t.text || '',
    })
    return this.createMessage.action(r)
  }
  createReadMessage(e: MessageStanza, t: string) {
    const r = {
      uid: e.uid || e.groupId,
      mid: t,
      userSource: e.friendSource || 0,
    }
    return this.createMessage.read(r)
  }
  createIqArray(e: MessageStanza, t) {
    var r
    const i = [
      {
        key: 'action',
        value: t.iqType || 'query',
      },
      {
        key: 'from_id',
        value: String((r = this.config) == null ? undefined : r.userId),
      },
      {
        key: 'to_id',
        value: String(e.uid),
      },
      {
        key: 'friend_source',
        value: String(e.friendSource),
      },
      {
        key: 'chat_type',
        value: '1',
      },
      {
        key: 'msg_id',
        value: String(t.lastMsgId || ''),
      },
      {
        key: 'resident',
        value: String(t.resident || ''),
      },
    ]
    if (t.type && t.type !== 'query') {
      i.splice(4, 0, {
        key: 'type',
        value: String(t.type),
      })
    }
    return i
  }
  createIqMessage(
    e,
    t = {
      iqType: 'query',
      type: 'query',
      lastMsgId: '',
      resident: '',
    },
  ) {
    const r = this.createIqArray(e, t)
    return this.createMessage.iq(r)
  }
  getMessageStanza(e: MessageStanza, t) {
    const r = Date.now()
    const i = this.config
    const n = t || {}
    const { bizType, ...s } = n
    return {
      tempID: e.clientMid,
      isSelf: true,
      from: {
        uid: (i == null ? undefined : i.userId) || 0,
        source: (i == null ? undefined : i.friendSource) || 0,
      },
      to: {
        source: e.friendSource || 0,
        uid: e.uid || e.groupId,
        encryptUid: e.encryptUid || e.encryptGid || '',
      },
      time: r,
      body: s,
      mSource: 'server',
      typeSource: 'newSubmit',
      type: e.groupId ? 2 : 1,
      bizType: bizType,
    }
  }
}
