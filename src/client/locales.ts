/**
 * Client-side i18n strings for the settings page and provider card.
 * Registered under the `settings.commandcode` locale namespace.
 */

/** Merge this plugin's namespace into the client locale table. */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.commandcode': keyof ClientLocale
  }
}

export interface ClientLocale {
  nav: string
  title: string
  intro: string
  connectionTitle: string
  apiKeyLabel: string
  apiKeyPlaceholder: string
  apiKeyConfiguredPlaceholder: string
  apiKeyHint: string
  apiBaseLabel: string
  apiBasePlaceholder: string
  apiBaseHint: string
  workingDirLabel: string
  workingDirPlaceholder: string
  advancedTitle: string
  requestTimeoutLabel: string
  requestTimeoutHint: string
  streamTimeoutLabel: string
  streamTimeoutHint: string
  filterModelsLabel: string
  filterModelsHint: string
  cachePathLabel: string
  cachePathHint: string
  accountsTitle: string
  accountsIntro: string
  addAccount: string
  removeAccount: string
  accountLabelPlaceholder: string
  accountKeyPlaceholder: string
  accountEnvPlaceholder: string
  activeAccount: string
  usageTitle: string
  usageRefresh: string
  usageRefreshing: string
  usageNoAccounts: string
  usageBlockedInvalidKey: string
  usageBlockedService: string
  usageBlockedNetwork: string
  usagePartial: string
  usageUpdated: string
  totalRequests: string
  successRate: string
  totalCost: string
  tokensIn: string
  tokensOut: string
  loginTitle: string
  loginButton: string
  loginBegin: string
  loginCancel: string
  loginPending: string
  loginSuccess: string
  loginFailed: string
  loginTimeout: string
  loginCancelled: string
  loginHint: string
  cardTitle: string
  cardConfigured: string
  cardNotConfigured: string
  cardConfigure: string
  cardUsage: string
  cardLogin: string
  invalidApiBase: string
  invalidTimeout: string
  save: string
  saving: string
  saved: string
  discard: string
  reset: string
  version: string
  updateAvailable: string
  langLabel: string
  langZh: string
  langEn: string
}

export const zh: ClientLocale = {
  nav: 'Command Code',
  title: 'Command Code 提供商设置',
  intro: '配置 Command Code API 凭证、连接参数和多账户轮换。所有更改即时生效，无需重启。',
  connectionTitle: '连接配置',
  apiKeyLabel: 'API Key',
  apiKeyPlaceholder: '输入新的 API Key 以替换',
  apiKeyConfiguredPlaceholder: '已保存（输入新值可替换）',
  apiKeyHint: '也可设置环境变量 COMMANDCODE_API_KEY，或使用下方登录流程自动获取。',
  apiBaseLabel: 'API 地址',
  apiBasePlaceholder: 'https://api.commandcode.ai',
  apiBaseHint: '默认使用官方 API 地址，自定义部署时修改此项。',
  workingDirLabel: '工作目录',
  workingDirPlaceholder: '默认使用当前进程目录',
  advancedTitle: '高级设置',
  requestTimeoutLabel: '请求超时（毫秒）',
  requestTimeoutHint: '等待响应首字节的最长时间，默认 60000（60秒）。',
  streamTimeoutLabel: '流式空闲超时（毫秒）',
  streamTimeoutHint: '流式响应中允许的最长停顿时间，默认 300000（5分钟）。',
  filterModelsLabel: '按套餐过滤模型',
  filterModelsHint: '隐藏当前套餐不可用的模型。关闭后显示全部模型。',
  cachePathLabel: '模型缓存路径',
  cachePathHint: '模型目录的本地缓存文件路径。',
  accountsTitle: '多账户管理',
  accountsIntro: '配置多个 API Key 以实现自动轮换。遇到 429 限流或 401 失效时自动切换到下一个可用账户。',
  addAccount: '添加账户',
  removeAccount: '移除',
  accountLabelPlaceholder: '账户名称（如：工作号）',
  accountKeyPlaceholder: 'API Key',
  accountEnvPlaceholder: '环境变量名（如：COMMANDCODE_API_KEY_2）',
  activeAccount: '当前使用',
  usageTitle: '用量与套餐',
  usageRefresh: '刷新',
  usageRefreshing: '刷新中…',
  usageNoAccounts: '尚未配置账户',
  usageBlockedInvalidKey: 'API Key 无效，请检查凭证',
  usageBlockedService: 'Command Code 服务暂不可用',
  usageBlockedNetwork: '网络连接失败，请检查网络',
  usagePartial: '部分数据获取失败',
  usageUpdated: '更新于',
  totalRequests: '总请求数',
  successRate: '成功率',
  totalCost: '总费用',
  tokensIn: '输入 tokens',
  tokensOut: '输出 tokens',
  loginTitle: '快捷登录',
  loginButton: '使用浏览器登录',
  loginBegin: '开始登录',
  loginCancel: '取消登录',
  loginPending: '正在等待浏览器授权…',
  loginSuccess: '登录成功！凭证已保存。',
  loginFailed: '登录失败',
  loginTimeout: '登录超时，请重试',
  loginCancelled: '登录已取消',
  loginHint: '将在浏览器中打开 Command Code 授权页面，授权后自动保存 API Key。',
  cardTitle: 'Command Code',
  cardConfigured: '已配置',
  cardNotConfigured: '未配置',
  cardConfigure: '配置',
  cardUsage: '查看用量',
  cardLogin: '登录',
  invalidApiBase: 'API 地址格式不正确',
  invalidTimeout: '超时时间必须为正整数',
  save: '保存',
  saving: '保存中…',
  saved: '已保存',
  discard: '放弃更改',
  reset: '重置为默认',
  version: '版本',
  updateAvailable: '有新版本可用',
  langLabel: '命令语言',
  langZh: '中文',
  langEn: 'English',
}

export const en: ClientLocale = {
  nav: 'Command Code',
  title: 'Command Code Provider Settings',
  intro: 'Configure Command Code API credentials, connection parameters, and multi-account rotation. All changes take effect immediately without restart.',
  connectionTitle: 'Connection',
  apiKeyLabel: 'API Key',
  apiKeyPlaceholder: 'Enter a new API key to replace it',
  apiKeyConfiguredPlaceholder: 'Saved (type to replace)',
  apiKeyHint: 'You can also set the COMMANDCODE_API_KEY environment variable, or use the login flow below.',
  apiBaseLabel: 'API Base URL',
  apiBasePlaceholder: 'https://api.commandcode.ai',
  apiBaseHint: 'Defaults to the official API. Change this for self-hosted deployments.',
  workingDirLabel: 'Working Directory',
  workingDirPlaceholder: 'Defaults to process cwd',
  advancedTitle: 'Advanced',
  requestTimeoutLabel: 'Request Timeout (ms)',
  requestTimeoutHint: 'Max time to wait for the first byte. Default: 60000 (60s).',
  streamTimeoutLabel: 'Stream Idle Timeout (ms)',
  streamTimeoutHint: 'Max stall allowed during streaming. Default: 300000 (5min).',
  filterModelsLabel: 'Filter Models by Plan',
  filterModelsHint: 'Hide models unavailable on your current plan. Disable to show all.',
  cachePathLabel: 'Model Cache Path',
  cachePathHint: 'Local cache file for the model catalog.',
  accountsTitle: 'Multi-Account',
  accountsIntro: 'Configure multiple API keys for automatic rotation. Switches to the next usable account on 429 rate-limit or 401 invalid-credential.',
  addAccount: 'Add Account',
  removeAccount: 'Remove',
  accountLabelPlaceholder: 'Account label (e.g. Work)',
  accountKeyPlaceholder: 'API Key',
  accountEnvPlaceholder: 'Env var name (e.g. COMMANDCODE_API_KEY_2)',
  activeAccount: 'Active',
  usageTitle: 'Usage & Plan',
  usageRefresh: 'Refresh',
  usageRefreshing: 'Refreshing…',
  usageNoAccounts: 'No accounts configured',
  usageBlockedInvalidKey: 'Invalid API key. Check your credentials.',
  usageBlockedService: 'Command Code service is temporarily unavailable',
  usageBlockedNetwork: 'Network connection failed. Check your connection.',
  usagePartial: 'Some data failed to load',
  usageUpdated: 'Updated',
  totalRequests: 'Total Requests',
  successRate: 'Success Rate',
  totalCost: 'Total Cost',
  tokensIn: 'Tokens In',
  tokensOut: 'Tokens Out',
  loginTitle: 'Quick Login',
  loginButton: 'Login with Browser',
  loginBegin: 'Start Login',
  loginCancel: 'Cancel',
  loginPending: 'Waiting for browser authorization…',
  loginSuccess: 'Login successful! Credentials saved.',
  loginFailed: 'Login failed',
  loginTimeout: 'Login timed out. Please try again.',
  loginCancelled: 'Login cancelled',
  loginHint: 'Opens the Command Code authorization page in your browser. The API key is saved automatically after authorization.',
  cardTitle: 'Command Code',
  cardConfigured: 'Configured',
  cardNotConfigured: 'Not configured',
  cardConfigure: 'Configure',
  cardUsage: 'View Usage',
  cardLogin: 'Login',
  invalidApiBase: 'Invalid API base URL',
  invalidTimeout: 'Timeout must be a positive integer',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  discard: 'Discard',
  reset: 'Reset to Default',
  version: 'Version',
  updateAvailable: 'Update available',
  langLabel: 'Command Language',
  langZh: '中文',
  langEn: 'English',
}
