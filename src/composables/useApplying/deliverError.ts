export class BossHelperError extends Error {
  state: 'warning' | 'danger'
  error_type: 'boss-helper'

  constructor(message: string, state: 'warning' | 'danger' = 'warning', options?: ErrorOptions) {
    super(message, options)
    this.state = state
    this.error_type = 'boss-helper'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class UnknownError extends BossHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'danger', options)
    this.name = '未知错误'
  }
}

export class PublishError extends BossHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'danger', options)
    this.name = '投递出错'
  }
}

export class GreetError extends BossHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'danger', options)
    this.name = '打招呼出错'
  }
}

export class LimitError extends BossHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'danger', options)
    this.name = '达到限制'
  }
}

export class RateLimitError extends BossHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'danger', options)
    this.name = '操作频繁'
  }
}

export class AuthenticationError extends BossHelperError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'danger', options)
    this.name = '登录失效'
  }
}

export function isFatalWorkflowError(error: unknown): error is BossHelperError {
  return (
    error instanceof LimitError ||
    error instanceof RateLimitError ||
    error instanceof AuthenticationError
  )
}
