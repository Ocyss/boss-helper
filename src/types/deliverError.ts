export class BoosHelperError extends Error {
  state: 'warning' | 'danger'
  error_type: 'boss-helper'

  constructor(message: string, state: 'warning' | 'danger' = 'warning', options?: ErrorOptions) {
    super(message, options)
    this.state = state
    this.error_type = 'boss-helper'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class RepeatError extends BoosHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'warning', options)
    this.name = '重复沟通'
  }
}

export class JobTitleError extends BoosHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'warning', options)
    this.name = '岗位名筛选'
  }
}

export class CompanyNameError extends BoosHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'warning', options)
    this.name = '公司名筛选'
  }
}

export class SalaryError extends BoosHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'warning', options)
    this.name = '薪资筛选'
  }
}

export class CompanySizeError extends BoosHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'warning', options)
    this.name = '公司规模筛选'
  }
}

export class JobDescriptionError extends BoosHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'warning', options)
    this.name = '工作内容筛选'
  }
}

export class HrPositionError extends BoosHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'warning', options)
    this.name = 'Hr职位筛选'
  }
}

export class JobAddressError extends BoosHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'warning', options)
    this.name = '工作地址筛选'
  }
}

export class AIFilteringError extends BoosHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'warning', options)
    this.name = 'AI筛选'
  }
}

export class FriendStatusError extends BoosHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'warning', options)
    this.name = '好友状态'
  }
}

export class ActivityError extends BoosHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'warning', options)
    this.name = '活跃度过滤'
  }
}

export class GoldHunterError extends BoosHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'warning', options)
    this.name = '猎头过滤'
  }
}

export class UnknownError extends BoosHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'danger', options)
    this.name = '未知错误'
  }
}

export class PublishError extends BoosHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'danger', options)
    this.name = '投递出错'
  }
}

export class GreetError extends BoosHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'danger', options)
    this.name = '打招呼出错'
  }
}

export class LimitError extends BoosHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'danger', options)
    this.name = '达到限制'
  }
}

export class RateLimitError extends BoosHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'danger', options)
    this.name = '操作频繁'
  }
}
