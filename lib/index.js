import { homedir } from "node:os";
import { dirname, join } from "node:path";
import z from "@deepseek-ai/schemastery";
import { MAX_TIMER_DELAY_MS } from "@deepseek-ai/dsh-timeout";
import { LlmAdapter, LlmError, ReasoningEffortId, ToolCallId, assertUsableApiKey, attributionHeaders, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { URL } from "node:url";
//#region src/retry.ts
/** Default retry configuration. */
const DEFAULT_RETRY_CONFIG = {
	/** Maximum retry attempts for transient errors. */
	maxRetries: 12,
	/** Initial backoff delay in milliseconds. */
	initialDelayMs: 500,
	/** Maximum backoff delay in milliseconds (cap). */
	maxDelayMs: 9e5,
	/** Jitter ratio (0–1) applied to each delay. */
	jitterRatio: .1,
	/** Circuit breaker: consecutive failures before opening. */
	circuitThreshold: 20,
	/** Circuit breaker: cooldown in ms before half-open. */
	circuitCooldownMs: 6e4
};
/** Error codes that are always retryable (transient). */
const RETRYABLE_CODES = [
	"EMPTY_RESPONSE",
	"RATE_LIMIT",
	"SERVER",
	"TIMEOUT",
	"TRANSPORT"
];
/** Error codes that are never retried (permanent). */
const NON_RETRYABLE_CODES = [
	"INVALID_CREDENTIAL",
	"UNSUPPORTED_CONTENT",
	"UNSUPPORTED_OPTION",
	"MODEL_NOT_IN_PLAN",
	"MODEL_NOT_FOUND",
	"MISSING_CREDENTIAL"
];
/**
* Build the resolved retry policy for the provider route.
* Captured once at registration; per-request overrides flow through
* the adapter's options thunk instead.
*/
function buildRetryPolicy(config = {}) {
	const merged = {
		...DEFAULT_RETRY_CONFIG,
		...config
	};
	return resolveRetryPolicy({
		mode: "normal",
		maxRetries: merged.maxRetries,
		retryableCodes: [...RETRYABLE_CODES],
		backoff: {
			initialDelayMs: merged.initialDelayMs,
			maxDelayMs: merged.maxDelayMs,
			jitterRatio: merged.jitterRatio
		}
	}, "dsh-commandcode: retryPolicy");
}
/**
* Simple circuit breaker for the model catalog and billing endpoints.
* Opens after `threshold` consecutive failures, rejects calls immediately
* during cooldown, then allows one probe (half-open).
*/
var CircuitBreaker = class {
	failures = 0;
	openedAt = 0;
	threshold;
	cooldownMs;
	constructor(threshold = DEFAULT_RETRY_CONFIG.circuitThreshold, cooldownMs = DEFAULT_RETRY_CONFIG.circuitCooldownMs) {
		this.threshold = threshold;
		this.cooldownMs = cooldownMs;
	}
	/** Whether calls should be allowed through right now. */
	get isOpen() {
		if (this.failures < this.threshold) return false;
		return Date.now() - this.openedAt < this.cooldownMs;
	}
	/** Record a successful call (resets the breaker). */
	recordSuccess() {
		this.failures = 0;
		this.openedAt = 0;
	}
	/** Record a failed call. */
	recordFailure() {
		this.failures += 1;
		if (this.failures === this.threshold) this.openedAt = Date.now();
	}
	/** Current state for diagnostics. */
	get state() {
		if (this.failures < this.threshold) return "closed";
		if (Date.now() - this.openedAt >= this.cooldownMs) return "half-open";
		return "open";
	}
};
//#endregion
//#region src/errors.ts
/**
* Enhanced error diagnostics for dsh-commandcode.
*
* Structured error codes, diagnostic context, and user-facing troubleshooting
* hints. Every error the adapter surfaces carries a stable code, a machine-
* readable context object, and a hint that guides the user to the fix.
*/
/** Stable error codes — never renumber, only append. */
let CommandCodeErrorCode = /* @__PURE__ */ function(CommandCodeErrorCode) {
	/** No API key could be resolved from any source. */
	CommandCodeErrorCode["MISSING_CREDENTIAL"] = "MISSING_CREDENTIAL";
	/** The resolved API key was rejected (401). */
	CommandCodeErrorCode["INVALID_CREDENTIAL"] = "INVALID_CREDENTIAL";
	/** Usage window exhausted (429). */
	CommandCodeErrorCode["RATE_LIMIT"] = "RATE_LIMIT";
	/** The model is not available on the current subscription plan. */
	CommandCodeErrorCode["MODEL_NOT_IN_PLAN"] = "MODEL_NOT_IN_PLAN";
	/** The requested model does not exist in the catalog. */
	CommandCodeErrorCode["MODEL_NOT_FOUND"] = "MODEL_NOT_FOUND";
	/** The Command Code API returned an unexpected response shape. */
	CommandCodeErrorCode["PROVIDER_PROTOCOL_ERROR"] = "PROVIDER_PROTOCOL_ERROR";
	/** The request timed out before headers arrived. */
	CommandCodeErrorCode["REQUEST_TIMEOUT"] = "REQUEST_TIMEOUT";
	/** The stream stalled beyond the idle timeout. */
	CommandCodeErrorCode["STREAM_IDLE_TIMEOUT"] = "STREAM_IDLE_TIMEOUT";
	/** A network-level failure (no HTTP response). */
	CommandCodeErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
	/** The Command Code service returned 5xx. */
	CommandCodeErrorCode["SERVER_ERROR"] = "SERVER_ERROR";
	/** The request carried unsupported content (e.g. images to a non-vision model). */
	CommandCodeErrorCode["UNSUPPORTED_CONTENT"] = "UNSUPPORTED_CONTENT";
	/** The request carried an unsupported option (e.g. stop sequences). */
	CommandCodeErrorCode["UNSUPPORTED_OPTION"] = "UNSUPPORTED_OPTION";
	/** The model catalog endpoint failed and no cache is available. */
	CommandCodeErrorCode["CATALOG_UNAVAILABLE"] = "CATALOG_UNAVAILABLE";
	/** The login flow was cancelled or timed out. */
	CommandCodeErrorCode["LOGIN_FAILED"] = "LOGIN_FAILED";
	/** An internal invariant was violated. */
	CommandCodeErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
	return CommandCodeErrorCode;
}({});
/** HTTP status → error code mapping. */
function errorCodeFromStatus(status) {
	if (status === 401) return "INVALID_CREDENTIAL";
	if (status === 403) return "MODEL_NOT_IN_PLAN";
	if (status === 404) return "MODEL_NOT_FOUND";
	if (status === 429) return "RATE_LIMIT";
	if (status >= 500) return "SERVER_ERROR";
	return "PROVIDER_PROTOCOL_ERROR";
}
const HINTS = {
	["MISSING_CREDENTIAL"]: {
		message: "Set COMMANDCODE_API_KEY in the Models page, your environment, or run the built-in login flow.",
		docRef: "#configuration"
	},
	["INVALID_CREDENTIAL"]: {
		message: "The API key was rejected. Verify it in the Models page or re-run login. Multi-account rotation may have exhausted all keys.",
		docRef: "#troubleshooting"
	},
	["RATE_LIMIT"]: {
		message: "Usage limit reached. Wait for the window to reset, switch accounts, or upgrade your plan.",
		docRef: "#multi-account"
	},
	["MODEL_NOT_IN_PLAN"]: {
		message: "This model requires a higher subscription tier. Switch to a model in your plan or upgrade.",
		docRef: "#model-catalog"
	},
	["MODEL_NOT_FOUND"]: {
		message: "The model id is not in the current catalog. Refresh the model list or check the spelling.",
		docRef: "#model-catalog"
	},
	["PROVIDER_PROTOCOL_ERROR"]: {
		message: "The Command Code API returned an unexpected response. The service may have changed its protocol — check for plugin updates.",
		docRef: "#changelog"
	},
	["REQUEST_TIMEOUT"]: {
		message: "The request timed out. Increase requestTimeoutMs in settings or check your network connection.",
		docRef: "#advanced-settings"
	},
	["STREAM_IDLE_TIMEOUT"]: {
		message: "The response stream stalled. Increase streamIdleTimeoutMs in settings or retry the request.",
		docRef: "#advanced-settings"
	},
	["NETWORK_ERROR"]: {
		message: "Could not reach the Command Code API. Check your network connection, firewall, and proxy settings.",
		docRef: "#troubleshooting"
	},
	["SERVER_ERROR"]: {
		message: "The Command Code service is experiencing issues. Retry later or check status.commandcode.ai.",
		docRef: "#troubleshooting"
	},
	["UNSUPPORTED_CONTENT"]: {
		message: "This model does not support the input content type. Use a Vision-capable model for image input.",
		docRef: "#model-catalog"
	},
	["UNSUPPORTED_OPTION"]: {
		message: "The Command Code API does not support this request option. Remove it and retry.",
		docRef: "#limitations"
	},
	["CATALOG_UNAVAILABLE"]: {
		message: "Could not fetch the model catalog and no cached copy is available. Check your network and retry.",
		docRef: "#troubleshooting"
	},
	["LOGIN_FAILED"]: {
		message: "The login flow did not complete. Close the browser tab and try again, or paste your API key manually.",
		docRef: "#login"
	},
	["INTERNAL_ERROR"]: {
		message: "An internal error occurred. Please file an issue with the diagnostic details below.",
		docRef: "https://github.com/wjf1/dsh-commandcode/issues"
	}
};
/**
* Structured error with diagnostic context and a user-facing hint.
* Extends the harness LlmError contract so it flows through the retry
* executor unchanged.
*/
var CommandCodeError = class extends Error {
	code;
	context;
	hint;
	cause;
	constructor(code, message, context = {}, cause) {
		super(message);
		this.name = "CommandCodeError";
		this.code = code;
		this.context = {
			provider: "commandcode",
			timestamp: Date.now(),
			...context
		};
		this.hint = HINTS[code] ?? HINTS["INTERNAL_ERROR"];
		this.cause = cause;
	}
	/** Serialize for logging and UI display (no secrets). */
	toJSON() {
		return {
			code: this.code,
			message: this.message,
			hint: this.hint.message,
			context: { ...this.context }
		};
	}
	/** One-line diagnostic summary for logs. */
	get diagnostic() {
		const parts = [`[${this.code}]`, this.message];
		if (this.context.status !== void 0) parts.push(`status=${this.context.status}`);
		if (this.context.model !== void 0) parts.push(`model=${this.context.model}`);
		if (this.context.accountId !== void 0) parts.push(`account=${this.context.accountId}`);
		if (this.context.attempts !== void 0) parts.push(`attempts=${this.context.attempts}`);
		if (this.context.requestId !== void 0) parts.push(`reqId=${this.context.requestId}`);
		return parts.join(" ");
	}
};
/**
* Wrap a raw error (fetch failure, JSON parse error, etc.) into a
* CommandCodeError with the appropriate code and context.
*/
function wrapError(error, code, context = {}) {
	if (error instanceof CommandCodeError) return error;
	return new CommandCodeError(code, error instanceof Error ? error.message : String(error), context, error);
}
/**
* Classify an HTTP error response into a CommandCodeError.
* Reads Retry-After and request-id headers when present.
*/
function httpError(status, bodyText, context = {}, retryAfterMs, requestId) {
	return new CommandCodeError(errorCodeFromStatus(status), `Command Code API returned ${status}: ${(bodyText.length > 500 ? `${bodyText.slice(0, 500)}…` : bodyText) || "(empty body)"}`, {
		...context,
		status,
		retryAfterMs,
		requestId
	});
}
/** Timeout for the catalog HTTP request. */
const CATALOG_TIMEOUT_MS = 15e3;
/** Catalog refresh cooldown when the breaker is open. */
const CATALOG_CIRCUIT_COOLDOWN_MS = 3e5;
function isRecord$2(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringValue$1(value) {
	return typeof value === "string" && value.length > 0 ? value : void 0;
}
function numberValue$1(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
/** Parse the `/provider/v1/models` response into model entries. */
function parseCatalogResponse(value) {
	if (!isRecord$2(value) || value.object !== "list" || !Array.isArray(value.data)) throw new CommandCodeError("PROVIDER_PROTOCOL_ERROR", "Unexpected Command Code models response shape: expected { object: \"list\", data: [...] }");
	const models = [];
	for (const entry of value.data) {
		if (!isRecord$2(entry)) continue;
		const id = stringValue$1(entry.id);
		const name = stringValue$1(entry.name) ?? stringValue$1(entry.id) ?? "Unknown";
		const contextLength = numberValue$1(entry.context_length) ?? numberValue$1(entry.contextWindow);
		if (!id || !contextLength || contextLength <= 0) continue;
		models.push({
			id,
			name,
			contextWindow: contextLength,
			maxTokens: Math.min(contextLength, 32768)
		});
	}
	if (models.length === 0) throw new CommandCodeError("CATALOG_UNAVAILABLE", "Command Code models endpoint returned an empty catalog");
	return models;
}
/** Read the catalog cache from disk. */
async function readModelsCache(cachePath) {
	try {
		const parsed = JSON.parse(await readFile(cachePath, "utf-8"));
		if (!isRecord$2(parsed) || !Array.isArray(parsed.models)) return void 0;
		return {
			models: parsed.models,
			fetchedAt: typeof parsed.fetchedAt === "number" ? parsed.fetchedAt : 0,
			etag: typeof parsed.etag === "string" ? parsed.etag : void 0
		};
	} catch {
		return;
	}
}
/** Atomically write the catalog cache (write temp + rename). */
async function writeModelsCache(cachePath, cache) {
	const dir = dirname(cachePath);
	await mkdir(dir, { recursive: true });
	const tmp = `${cachePath}.tmp-${process.pid}`;
	await writeFile(tmp, JSON.stringify(cache, null, 2), "utf-8");
	await rename(tmp, cachePath).catch(async () => {
		await writeFile(cachePath, JSON.stringify(cache, null, 2), "utf-8");
		await rm(tmp, { force: true });
	});
}
/**
* Model catalog manager.
*
* Usage:
* ```ts
* const catalog = new ModelCatalog({ apiBase: () => opts.apiBase, cachePath, fetchImpl })
* const models = await catalog.list() // SWR: returns cache immediately, refreshes in background
* ```
*/
var ModelCatalog = class {
	deps;
	memory = [];
	memoryFetchedAt = 0;
	memoryEtag;
	breaker = new CircuitBreaker(5, CATALOG_CIRCUIT_COOLDOWN_MS);
	refreshInFlight;
	ttlMs;
	staleMs;
	constructor(deps) {
		this.deps = deps;
		this.ttlMs = deps.ttlMs ?? 36e5;
		this.staleMs = deps.staleMs ?? 864e5;
	}
	/** Whether the in-memory catalog is fresh enough to serve. */
	get isFresh() {
		return this.memory.length > 0 && Date.now() - this.memoryFetchedAt < this.ttlMs;
	}
	/** Whether the in-memory catalog is within the stale-accept window. */
	get isStaleAcceptable() {
		return this.memory.length > 0 && Date.now() - this.memoryFetchedAt < this.staleMs;
	}
	/**
	* List models with stale-while-revalidate.
	*
	* - If the in-memory catalog is fresh, return it immediately.
	* - If stale but within the accept window, return it and trigger a
	*   background refresh (non-blocking).
	* - If no memory or too stale, try to load from disk cache; if that
	*   fails and the breaker is closed, do a blocking fetch.
	*/
	async list() {
		if (this.isFresh) return this.memory;
		if (this.isStaleAcceptable) {
			this.scheduleBackgroundRefresh();
			return this.memory;
		}
		const disk = await readModelsCache(this.deps.cachePath());
		if (disk !== void 0 && disk.models.length > 0) {
			this.memory = disk.models;
			this.memoryFetchedAt = disk.fetchedAt;
			this.memoryEtag = disk.etag;
			if (Date.now() - disk.fetchedAt < this.ttlMs) return this.memory;
			this.scheduleBackgroundRefresh();
			return this.memory;
		}
		return this.refresh({ blocking: true });
	}
	/**
	* Force a refresh (bypasses cache). Used by the "Refresh models" button.
	*/
	async refreshNow() {
		return this.refresh({
			blocking: true,
			force: true
		});
	}
	/** Find a model by id (checks memory first, then triggers refresh). */
	async find(modelId) {
		const hit = this.memory.find((m) => m.id === modelId);
		if (hit !== void 0) return hit;
		await this.list();
		return this.memory.find((m) => m.id === modelId);
	}
	/** Current catalog state for diagnostics. */
	get state() {
		return {
			count: this.memory.length,
			fetchedAt: this.memoryFetchedAt,
			fresh: this.isFresh,
			circuit: this.breaker.state
		};
	}
	/** Trigger a non-blocking background refresh (deduped). */
	scheduleBackgroundRefresh() {
		if (this.refreshInFlight !== void 0) return;
		this.refreshInFlight = this.refresh({ blocking: false }).then(() => void 0).catch(() => void 0).finally(() => {
			this.refreshInFlight = void 0;
		});
	}
	/**
	* Perform a catalog refresh.
	* @param blocking If true, throw on failure; if false, log and keep stale.
	* @param force If true, bypass the circuit breaker.
	*/
	async refresh(opts) {
		const fetchImpl = this.deps.fetchImpl ?? fetch;
		const apiBase = this.deps.apiBase();
		const cachePath = this.deps.cachePath();
		if (!opts.force && this.breaker.isOpen) {
			if (this.memory.length > 0) return this.memory;
			if (opts.blocking) throw new CommandCodeError("CATALOG_UNAVAILABLE", `Model catalog circuit breaker is open (${this.breaker.state}); last refresh failed and no cache is available`, { endpoint: `${apiBase}/provider/v1/models` });
			return this.memory;
		}
		try {
			const headers = { accept: "application/json" };
			if (this.memoryEtag && !opts.force) headers["If-None-Match"] = this.memoryEtag;
			const response = await fetchImpl(`${apiBase}/provider/v1/models`, {
				headers,
				signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS)
			});
			if (response.status === 304) {
				this.memoryFetchedAt = Date.now();
				this.breaker.recordSuccess();
				return this.memory;
			}
			if (!response.ok) throw new CommandCodeError("CATALOG_UNAVAILABLE", `Models endpoint returned ${response.status}`, {
				endpoint: `${apiBase}/provider/v1/models`,
				status: response.status
			});
			const etag = response.headers.get("etag") ?? void 0;
			const models = parseCatalogResponse(await response.json());
			this.memory = models;
			this.memoryFetchedAt = Date.now();
			this.memoryEtag = etag;
			this.breaker.recordSuccess();
			await writeModelsCache(cachePath, {
				models,
				fetchedAt: this.memoryFetchedAt,
				etag
			}).catch(() => void 0);
			return models;
		} catch (error) {
			this.breaker.recordFailure();
			const wrapped = wrapError(error, "CATALOG_UNAVAILABLE", { endpoint: `${apiBase}/provider/v1/models` });
			if (this.memory.length > 0) return this.memory;
			const disk = await readModelsCache(cachePath).catch(() => void 0);
			if (disk !== void 0 && disk.models.length > 0) {
				this.memory = disk.models;
				this.memoryFetchedAt = disk.fetchedAt;
				return disk.models;
			}
			if (opts.blocking) throw wrapped;
			return this.memory;
		}
	}
};
//#endregion
//#region src/adapter.ts
/**
* DeepSeek Harness LLM adapter for the Command Code Provider API.
*
* Enhanced reimplementation of the reference adapter with:
* - Stale-while-revalidate model catalog (via ModelCatalog)
* - Configurable request/stream timeouts with idle watchdog
* - Structured error diagnostics (via CommandCodeError)
* - Multi-account rotation with pre-stream 429/401 handling
* - Image input via the durable attachment service
* - Usage/billing endpoints with per-endpoint degradation
* - Retry policy with exponential backoff + jitter
*
* Wire protocol (reverse-engineered from command-code CLI):
*   POST {apiBase}/alpha/generate
*   body: { config, memory, taste, skills, params: { model, messages, tools,
*          system, max_tokens, temperature, stream, reasoning_effort? }, threadId }
*   SSE-ish JSONL events: text-delta | reasoning-start/delta/end | tool-call
*                         | tool-result | finish | error
*   Model catalog: GET {apiBase}/provider/v1/models -> { object: 'list', data: [...] }
*/
/** Default API base for the Command Code Provider API. */
const DEFAULT_API_BASE = "https://api.commandcode.ai";
/** Default request timeout (first byte): 60s. */
const DEFAULT_REQUEST_TIMEOUT_MS = 6e4;
/** Default stream idle timeout: 300s. */
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 3e5;
/** Default max output tokens (capped by context window). */
const DEFAULT_MAX_OUTPUT_TOKENS = 32768;
/** Hard cap on generate max_tokens. */
const DEFAULT_GENERATE_MAX_TOKENS = 65536;
/** CLI version reported to the API (the endpoint rejects clients below its
*  `minVersion` when the `x-command-code-version` header is missing). */
const COMMAND_CODE_CLI_VERSION = "1.38.2";
join(homedir(), ".commandcode", "models-cache.json");
/** Models with selectable reasoning effort (from command-code@1.37.0 registry). */
const KNOWN_EFFORTS = {
	"Qwen/Qwen3.8-Max": [
		"low",
		"medium",
		"xhigh"
	],
	"Qwen/Qwen3.8-27B": [
		"low",
		"medium",
		"xhigh"
	],
	"Qwen/Qwen3.8-Flash": [
		"low",
		"medium",
		"xhigh"
	],
	"claude-opus-4-7": [
		"low",
		"medium",
		"high",
		"xhigh",
		"max"
	],
	"claude-opus-4-8": [
		"low",
		"medium",
		"high",
		"xhigh",
		"max"
	],
	"claude-opus-5": [
		"low",
		"medium",
		"high",
		"xhigh",
		"max"
	],
	"claude-sonnet-4-6": [
		"low",
		"medium",
		"high",
		"xhigh",
		"max"
	],
	"claude-sonnet-5": [
		"low",
		"medium",
		"high",
		"xhigh",
		"max"
	],
	"deepseek/deepseek-v4-flash": ["high", "max"],
	"deepseek/deepseek-v4-pro": ["high", "max"],
	"google/gemini-3.5-flash": [
		"low",
		"medium",
		"high"
	],
	"google/gemini-3.5-flash-lite": [
		"low",
		"medium",
		"high"
	],
	"google/gemini-3.6-flash": [
		"low",
		"medium",
		"high"
	],
	"gpt-5.4": [
		"low",
		"medium",
		"high",
		"xhigh"
	],
	"gpt-5.4-mini": [
		"low",
		"medium",
		"high"
	],
	"gpt-5.5": [
		"low",
		"medium",
		"high",
		"xhigh"
	],
	"xai/grok-4.5": [
		"low",
		"medium",
		"high"
	],
	"xai/grok-4.6": [
		"low",
		"medium",
		"high",
		"xhigh"
	],
	"z-ai/glm-5.3-flash": [
		"low",
		"high",
		"max"
	]
};
/** Vision-capable models (from command-code registry). */
const KNOWN_IMAGE_MODELS = /* @__PURE__ */ new Set([
	"Qwen/Qwen3.6-Plus",
	"Qwen/Qwen3.7-Flash",
	"Qwen/Qwen3.8-Flash",
	"Qwen/Qwen3.8-Max",
	"claude-haiku-4-5-20251001",
	"claude-sonnet-4-6",
	"claude-sonnet-5",
	"deepseek/deepseek-v4-flash-vision-exp",
	"google/gemini-3.5-flash",
	"google/gemini-3.6-flash",
	"gpt-5.4",
	"gpt-5.5"
]);
/** Subscription plan tiers (lower index = more accessible). */
const KNOWN_PLANS = {
	"Qwen/Qwen3.8-Flash": "go",
	"Qwen/Qwen3.8-27B": "go",
	"deepseek/deepseek-v4-flash": "go",
	"minimax/minimax-m3-free": "go",
	"moonshotai/Kimi-K2.5": "go"
};
const PLAN_LABELS = {
	go: "Go",
	pro: "Pro",
	provider: "Provider"
};
const PLAN_ORDER = {
	go: 0,
	pro: 1,
	provider: 2
};
/** Known subscription plans with monthly credit totals. */
const KNOWN_SUBSCRIPTION_PLANS = {
	"individual-free": {
		name: "Free",
		monthlyCredits: 0
	},
	"individual-go": {
		name: "Go",
		monthlyCredits: 5
	},
	"individual-pro": {
		name: "Pro",
		monthlyCredits: 50
	},
	"individual-pro-annual": {
		name: "Pro (Annual)",
		monthlyCredits: 50
	}
};
/** Billing access TTL (5 minutes). */
const BILLING_ACCESS_TTL_MS = 3e5;
function isRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringValue(value) {
	return typeof value === "string" && value.length > 0 ? value : void 0;
}
function numberValue(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function recordOrEmpty(value) {
	return isRecord$1(value) ? value : {};
}
function blockText(block) {
	return block.type === "text" ? block.text : "";
}
function hasImageContent(message) {
	return message.content.some((block) => block.type === "image");
}
/** Extract the API key from the CLI auth file (~/.commandcode/auth.json). */
function resolveAuthFileApiKey() {
	const authPath = join(homedir(), ".commandcode", "auth.json");
	if (!existsSync(authPath)) return void 0;
	try {
		const raw = readFileSync(authPath, "utf-8");
		const parsed = JSON.parse(raw);
		if (!isRecord$1(parsed)) return void 0;
		const direct = stringValue(parsed.key) ?? stringValue(parsed.apiKey) ?? stringValue(parsed.access_token);
		if (direct !== void 0) return direct;
		if (isRecord$1(parsed.credentials)) return stringValue(parsed.credentials.key) ?? stringValue(parsed.credentials.apiKey);
		if (isRecord$1(parsed.commandcode)) return stringValue(parsed.commandcode.key) ?? stringValue(parsed.commandcode.apiKey);
		return;
	} catch {
		return;
	}
}
function planLabel(modelId) {
	const plan = KNOWN_PLANS[modelId];
	return plan === void 0 ? void 0 : PLAN_LABELS[plan];
}
function compareByPlan(a, b) {
	const pa = PLAN_ORDER[KNOWN_PLANS[a.id] ?? ""] ?? 99;
	const pb = PLAN_ORDER[KNOWN_PLANS[b.id] ?? ""] ?? 99;
	if (pa !== pb) return pa - pb;
	return a.id.localeCompare(b.id);
}
function modelVisibleInPlan(modelId, access) {
	if (access === void 0) return true;
	const modelPlan = KNOWN_PLANS[modelId];
	if (modelPlan === void 0) return true;
	if (access.onDemandCredits > 0) return true;
	return (access.planId === void 0 ? 99 : PLAN_ORDER[access.planId] ?? 99) >= (PLAN_ORDER[modelPlan] ?? 0);
}
function formatContext(contextWindow) {
	if (contextWindow >= 1e6) return `${(contextWindow / 1e6).toFixed(1)}M`;
	if (contextWindow >= 1e3) return `${Math.round(contextWindow / 1e3)}K`;
	return String(contextWindow);
}
function capabilityDescription(modelId, contextWindow) {
	const parts = [];
	const plan = planLabel(modelId);
	if (plan !== void 0) parts.push(plan);
	if (KNOWN_IMAGE_MODELS.has(modelId)) parts.push("Vision");
	if (KNOWN_EFFORTS[modelId] !== void 0) parts.push("Reasoning");
	if (contextWindow !== void 0 && contextWindow > 0) parts.push(`${formatContext(contextWindow)} ctx`);
	return parts.join(" · ");
}
function projectSlugFromPath(pathName) {
	const parts = pathName.split(/[\\/]/);
	return parts[parts.length - 1] || "unknown";
}
function parseStreamEventLine(line) {
	let trimmed = line.trim();
	if (!trimmed || trimmed.startsWith(":") || trimmed.startsWith("event:")) return void 0;
	if (trimmed.startsWith("data:")) trimmed = trimmed.slice(5).trim();
	if (!trimmed || trimmed === "[DONE]") return void 0;
	try {
		return JSON.parse(trimmed);
	} catch {
		return;
	}
}
function mapFinishReason(reason) {
	if (typeof reason === "string") switch (reason) {
		case "stop":
		case "end_turn": return { kind: "stop" };
		case "length": return { kind: "max-tokens" };
		case "tool_calls":
		case "tool_call": return { kind: "tool-calls" };
	}
	return { kind: "stop" };
}
function pairedToolCalls(messages) {
	const ids = /* @__PURE__ */ new Set();
	const names = /* @__PURE__ */ new Map();
	for (const message of messages) {
		if (message.role !== "assistant") continue;
		for (const block of message.content) if (block.type === "tool-call") {
			ids.add(block.id);
			names.set(block.id, block.name);
		}
	}
	return {
		ids,
		names
	};
}
function toolResultText(block) {
	if (block.type !== "tool-result") return "";
	if (typeof block.content === "string") return block.content;
	return JSON.stringify(block.content);
}
async function imageToCommandCode(ref, readImage) {
	const data = await readImage(ref);
	return {
		type: "image",
		source: {
			type: "base64",
			media_type: ref.mediaType,
			data: Buffer.from(data).toString("base64")
		}
	};
}
async function messagesToCC(messages, readImage) {
	const out = [];
	const { ids: paired, names: toolNames } = pairedToolCalls(messages);
	for (const message of messages) {
		if (message.role === "system") continue;
		if (message.role === "user" && message.source.kind !== "tool") {
			const parts = [];
			for (const block of message.content) if (block.type === "text") parts.push({
				type: "text",
				text: block.text
			});
			else if (block.type === "image") {
				if (!readImage) throw new CommandCodeError("UNSUPPORTED_CONTENT", "Image input requires the durable attachment service");
				parts.push(await imageToCommandCode(block.attachment, readImage));
			}
			out.push({
				role: "user",
				content: parts
			});
			continue;
		}
		if (message.role === "assistant") {
			const parts = [];
			for (const block of message.content) if (block.type === "text") parts.push({
				type: "text",
				text: block.text
			});
			else if (block.type === "tool-call" && paired.has(block.id)) parts.push({
				type: "tool-call",
				toolCallId: block.id,
				toolName: block.name,
				input: recordOrEmpty(block.arguments)
			});
			if (parts.length > 0) out.push({
				role: "assistant",
				content: parts
			});
			continue;
		}
		if (message.role === "user" && message.source.kind === "tool") {
			const block = message.content[0];
			if (!block || block.type !== "tool-result" || !paired.has(block.toolCallId)) continue;
			out.push({
				role: "tool",
				content: [{
					type: "tool-result",
					toolCallId: block.toolCallId,
					toolName: toolNames.get(block.toolCallId) || "unknown",
					output: block.isError ? {
						type: "error-text",
						value: toolResultText(block)
					} : {
						type: "text",
						value: toolResultText(block)
					}
				}]
			});
		}
	}
	return out;
}
var CommandCodeAdapter = class extends LlmAdapter {
	deps;
	catalog;
	fetchImpl;
	resolveAttachments;
	billingAccess = /* @__PURE__ */ new Map();
	billingAccessInflight = /* @__PURE__ */ new Map();
	constructor(deps) {
		super();
		this.deps = deps;
		this.fetchImpl = deps.fetchImpl ?? fetch;
		this.resolveAttachments = deps.resolveAttachments;
		this.catalog = new ModelCatalog({
			apiBase: () => this.deps.options().apiBase,
			cachePath: () => this.deps.options().modelsCachePath,
			fetchImpl: this.fetchImpl
		});
	}
	providerInfo(provider) {
		return {
			id: provider,
			name: "Command Code"
		};
	}
	providerRetryPolicy(_provider) {
		return buildRetryPolicy();
	}
	async listModels(provider) {
		const catalog = await this.catalog.list();
		const access = this.deps.options().filterModelsByPlan === false ? void 0 : await this.loadBillingAccess();
		return catalog.filter((model) => modelVisibleInPlan(model.id, access)).map((model) => {
			const vision = KNOWN_IMAGE_MODELS.has(model.id);
			return {
				provider,
				id: model.id,
				name: `${model.name} (CC)`,
				description: capabilityDescription(model.id, model.contextWindow),
				inputModalities: vision ? ["text", "image"] : ["text"]
			};
		}).sort(compareByPlan);
	}
	async resolveModel(provider, model, signal) {
		const entry = await this.catalog.find(model);
		const efforts = KNOWN_EFFORTS[model];
		const vision = KNOWN_IMAGE_MODELS.has(model);
		return {
			provider,
			id: model,
			name: entry ? `${entry.name} (CC)` : model,
			description: capabilityDescription(model, entry?.contextWindow),
			inputModalities: vision ? ["text", "image"] : ["text"],
			...entry ? {
				context: { contextWindow: entry.contextWindow },
				defaultMaxTokens: Math.min(entry.maxTokens, DEFAULT_GENERATE_MAX_TOKENS)
			} : {},
			...efforts ? { reasoning: { efforts: efforts.map((id) => ({
				id: ReasoningEffortId(id),
				name: id
			})) } } : {}
		};
	}
	/**
	* Probe one account's five-hour window (for the multi-account pool).
	*/
	async probeFiveHourWindow(apiKey) {
		try {
			const connection = this.deps.options();
			const response = await this.fetchImpl(`${connection.apiBase}/alpha/billing/credits`, {
				headers: {
					authorization: `Bearer ${apiKey}`,
					accept: "application/json"
				},
				signal: AbortSignal.timeout(1e4)
			});
			if (!response.ok) return void 0;
			const parsed = await response.json();
			const windowLimits = isRecord$1(parsed.windowLimits) ? parsed.windowLimits : parsed;
			const fiveHour = isRecord$1(windowLimits.fiveHour) ? windowLimits.fiveHour : void 0;
			if (fiveHour === void 0) return void 0;
			return {
				exceeded: fiveHour.exceeded === true,
				resetAt: numberValue(fiveHour.resetAt) ?? 0
			};
		} catch {
			return;
		}
	}
	/**
	* Fetch the full usage report for one API key (4 endpoints, degraded).
	*/
	async getUsage(apiKey) {
		const connection = this.deps.options();
		const report = { failures: [] };
		const failedStatuses = [];
		let networkFailures = 0;
		const endpoints = [
			{
				path: "/alpha/whoami",
				key: "account"
			},
			{
				path: "/alpha/usage/summary",
				key: "usage"
			},
			{
				path: "/alpha/billing/credits",
				key: "credits"
			},
			{
				path: "/alpha/billing/subscriptions",
				key: "plan"
			}
		];
		await Promise.all(endpoints.map(async ({ path, key }) => {
			try {
				const response = await this.fetchImpl(`${connection.apiBase}${path}`, {
					headers: {
						authorization: `Bearer ${apiKey}`,
						accept: "application/json"
					},
					signal: AbortSignal.timeout(1e4)
				});
				if (!response.ok) {
					failedStatuses.push(response.status);
					report.failures.push(`${path}: HTTP ${response.status}`);
					return;
				}
				const body = await response.json();
				failedStatuses.push(void 0);
				if (key === "account") {
					const user = isRecord$1(body.user) ? body.user : body;
					report.account = {
						id: stringValue(user.id) ?? "",
						name: stringValue(user.name) ?? "",
						userName: stringValue(user.userName) ?? ""
					};
				} else if (key === "usage") report.usage = {
					totalCount: numberValue(body.totalCount) ?? 0,
					totalCost: numberValue(body.totalCost) ?? 0,
					successRate: numberValue(body.successRate) ?? 0,
					completedCount: numberValue(body.completedCount) ?? 0,
					failedCount: numberValue(body.failedCount) ?? 0,
					totalTokensIn: numberValue(body.totalTokensIn) ?? 0,
					totalTokensOut: numberValue(body.totalTokensOut) ?? 0,
					totalCredits: numberValue(body.totalCredits) ?? 0,
					periodBasis: stringValue(body.periodBasis) ?? ""
				};
				else if (key === "credits") {
					const creditFields = isRecord$1(body.credits) ? body.credits : body;
					const windowLimits = isRecord$1(body.windowLimits) ? body.windowLimits : body;
					const fh = isRecord$1(windowLimits.fiveHour) ? windowLimits.fiveHour : isRecord$1(body.fiveHour) ? body.fiveHour : {};
					const wk = isRecord$1(windowLimits.weekly) ? windowLimits.weekly : isRecord$1(body.weekly) ? body.weekly : {};
					report.credits = {
						monthlyCredits: numberValue(creditFields.monthlyCredits) ?? 0,
						purchasedCredits: numberValue(creditFields.purchasedCredits) ?? 0,
						freeCredits: numberValue(creditFields.freeCredits) ?? 0,
						fiveHour: {
							used: numberValue(fh.used) ?? 0,
							cap: numberValue(fh.cap) ?? 0,
							exceeded: fh.exceeded === true,
							resetAt: numberValue(fh.resetAt) ?? 0
						},
						weekly: {
							used: numberValue(wk.used) ?? 0,
							cap: numberValue(wk.cap) ?? 0,
							exceeded: wk.exceeded === true,
							resetAt: numberValue(wk.resetAt) ?? 0
						}
					};
				} else if (key === "plan") {
					const planSource = isRecord$1(body.data) ? body.data : body;
					const planId = stringValue(planSource.planId) ?? stringValue(planSource.id) ?? "";
					const known = KNOWN_SUBSCRIPTION_PLANS[planId];
					const rawPeriodEnd = planSource.currentPeriodEnd;
					report.plan = {
						planId,
						name: known?.name ?? stringValue(planSource.name) ?? planId,
						status: stringValue(planSource.status) ?? "",
						monthlyCredits: known?.monthlyCredits ?? null,
						currentPeriodEnd: numberValue(rawPeriodEnd) ?? (typeof rawPeriodEnd === "string" ? Date.parse(rawPeriodEnd) || 0 : 0)
					};
				}
			} catch (error) {
				failedStatuses.push(void 0);
				networkFailures += 1;
				report.failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}));
		const codes = failedStatuses.filter((s) => s !== void 0);
		if (codes.length === endpoints.length && codes.every((c) => c === 401)) report.blocked = "invalid-key";
		else if (codes.length === endpoints.length && codes.every((c) => c >= 500)) report.blocked = "service-unavailable";
		else if (networkFailures === endpoints.length) report.blocked = "network";
		return report;
	}
	/** Load billing access (cached per API key, TTL-gated). */
	async loadBillingAccess() {
		let apiKey;
		try {
			apiKey = await this.deps.resolveApiKey(this.deps.options());
		} catch {
			return;
		}
		const cached = this.billingAccess.get(apiKey);
		if (cached !== void 0 && Date.now() - cached.at < 3e5) return cached.value;
		let inflight = this.billingAccessInflight.get(apiKey);
		if (inflight === void 0) {
			inflight = (async () => {
				try {
					const report = await this.getUsage(apiKey);
					const access = {
						planId: report.plan?.planId,
						planName: report.plan?.name,
						onDemandCredits: report.credits?.purchasedCredits ?? 0,
						fetchedAt: Date.now()
					};
					this.billingAccess.set(apiKey, {
						value: access,
						at: Date.now()
					});
					return access;
				} catch {
					this.billingAccess.set(apiKey, {
						value: void 0,
						at: Date.now()
					});
					return;
				} finally {
					this.billingAccessInflight.delete(apiKey);
				}
			})();
			this.billingAccessInflight.set(apiKey, inflight);
		}
		return inflight;
	}
	async *stream(options) {
		if (options.stop?.length) throw new CommandCodeError("UNSUPPORTED_OPTION", "Command Code adapter does not support stop sequences", { model: options.model });
		const connection = this.deps.options();
		const hasImages = options.messages.some(hasImageContent);
		let readImage;
		if (hasImages) {
			if (!KNOWN_IMAGE_MODELS.has(options.model)) throw new CommandCodeError("UNSUPPORTED_CONTENT", `Model "${options.model}" does not support image input; use a Vision-capable model`, { model: options.model });
			const attachments = this.resolveAttachments?.();
			if (attachments === void 0) throw new CommandCodeError("UNSUPPORTED_CONTENT", "Image input requires the durable attachment service", { model: options.model });
			readImage = (ref) => attachments.readImage(ref).then((stored) => stored.data);
		}
		let apiKey = await this.deps.resolveApiKey(connection);
		const tried = /* @__PURE__ */ new Set();
		const modelMax = (await this.catalog.find(options.model))?.maxTokens ?? 32768;
		const maxTokens = Math.min(options.maxTokens ?? modelMax, modelMax, DEFAULT_GENERATE_MAX_TOKENS);
		const effort = options.reasoningEffort;
		const supported = KNOWN_EFFORTS[options.model];
		const reasoningEffort = effort && effort !== "off" && supported?.includes(effort) ? effort : void 0;
		const systemText = [options.system ?? "", ...options.messages.filter((m) => m.role === "system").map((m) => m.content.map(blockText).filter(Boolean).join("\n"))].filter(Boolean).join("\n\n");
		const body = {
			config: {
				workingDir: connection.workingDir,
				date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
				environment: `${process.platform}-${process.arch}, Node.js ${process.version}, dsh-commandcode`,
				structure: [],
				isGitRepo: false,
				currentBranch: "",
				mainBranch: "",
				gitStatus: "",
				recentCommits: []
			},
			memory: null,
			taste: null,
			skills: null,
			params: {
				model: options.model,
				messages: await messagesToCC(options.messages, readImage),
				tools: (options.tools ?? []).map((tool) => ({
					type: "function",
					name: tool.name,
					description: tool.description,
					input_schema: tool.parameters
				})),
				system: systemText,
				max_tokens: maxTokens,
				temperature: options.temperature ?? .3,
				stream: true,
				...reasoningEffort ? { reasoning_effort: reasoningEffort } : {}
			},
			threadId: randomUUID()
		};
		const rotate = this.deps.rotateApiKey;
		let response;
		let cleanup;
		while (true) {
			tried.add(apiKey);
			try {
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), connection.requestTimeoutMs);
				cleanup = () => clearTimeout(timeout);
				response = await this.fetchImpl(`${connection.apiBase}/alpha/generate`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${apiKey}`,
						accept: "text/event-stream",
						"x-command-code-version": COMMAND_CODE_CLI_VERSION,
						...attributionHeaders()
					},
					body: JSON.stringify(body),
					signal: controller.signal
				});
				cleanup();
				if (response.ok) break;
				const status = response.status;
				const errText = await response.text().catch(() => "");
				const retryAfter = response.headers.get("retry-after");
				const retryAfterMs = retryAfter ? Number(retryAfter) * 1e3 : void 0;
				if ((status === 429 || status === 401) && rotate !== void 0) {
					const next = await rotate(apiKey, status === 429 ? "rate-limit" : "invalid-credential", connection);
					if (next !== void 0 && !tried.has(next)) {
						apiKey = next;
						continue;
					}
				}
				throw httpError(status, errText, {
					model: options.model,
					endpoint: "/alpha/generate"
				}, retryAfterMs);
			} catch (error) {
				cleanup?.();
				if (error instanceof CommandCodeError) throw error;
				if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) throw new CommandCodeError("REQUEST_TIMEOUT", `Request timed out after ${connection.requestTimeoutMs}ms`, {
					model: options.model,
					endpoint: "/alpha/generate"
				}, error);
				throw wrapError(error, "NETWORK_ERROR", {
					model: options.model,
					endpoint: "/alpha/generate"
				});
			}
		}
		if (!response.body) throw new CommandCodeError("PROVIDER_PROTOCOL_ERROR", "Command Code API returned no response body", { model: options.model });
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let streamIdleTimer;
		let textIndex = -1;
		let textContent = "";
		let reasoningIndex = -1;
		let reasoningContent = "";
		const resetIdleTimer = () => {
			if (streamIdleTimer !== void 0) clearTimeout(streamIdleTimer);
			streamIdleTimer = setTimeout(() => {
				reader.cancel().catch(() => void 0);
			}, connection.streamIdleTimeoutMs);
		};
		resetIdleTimer();
		const closeText = function* () {
			if (textIndex >= 0) {
				yield {
					type: "block-end",
					index: textIndex,
					block: {
						type: "text",
						text: textContent
					}
				};
				textIndex = -1;
				textContent = "";
			}
		};
		const closeReasoning = function* () {
			if (reasoningIndex >= 0) {
				yield {
					type: "block-end",
					index: reasoningIndex,
					block: {
						type: "reasoning",
						text: reasoningContent
					}
				};
				reasoningIndex = -1;
				reasoningContent = "";
			}
		};
		const handleEvent = (event) => {
			const chunks = [];
			if (!isRecord$1(event)) return chunks;
			switch (event.type) {
				case "text-delta": {
					chunks.push(...closeReasoning());
					if (textIndex < 0) {
						textIndex = 0;
						chunks.push({
							type: "block-start",
							index: textIndex,
							blockType: "text"
						});
					}
					const delta = stringValue(event.text) ?? "";
					textContent += delta;
					chunks.push({
						type: "text-delta",
						index: textIndex,
						text: delta
					});
					break;
				}
				case "reasoning-start":
					chunks.push(...closeText());
					if (reasoningIndex < 0) {
						reasoningIndex = 1;
						chunks.push({
							type: "block-start",
							index: reasoningIndex,
							blockType: "reasoning"
						});
					}
					break;
				case "reasoning-delta": {
					if (reasoningIndex < 0) {
						reasoningIndex = 1;
						chunks.push({
							type: "block-start",
							index: reasoningIndex,
							blockType: "reasoning"
						});
					}
					const delta = stringValue(event.text) ?? "";
					reasoningContent += delta;
					chunks.push({
						type: "reasoning-delta",
						index: reasoningIndex,
						text: delta
					});
					break;
				}
				case "reasoning-end":
					chunks.push(...closeReasoning());
					break;
				case "tool-call": {
					chunks.push(...closeText(), ...closeReasoning());
					const id = stringValue(event.toolCallId) ?? randomUUID();
					const name = stringValue(event.toolName) ?? "";
					const args = JSON.stringify(recordOrEmpty(event.input ?? event.args ?? event.arguments));
					const index = 2;
					chunks.push({
						type: "block-start",
						index,
						blockType: "tool-call"
					}, {
						type: "tool-call-delta",
						index,
						id: ToolCallId(id),
						name,
						argumentsDelta: args
					}, {
						type: "block-end",
						index,
						block: {
							type: "tool-call",
							id: ToolCallId(id),
							name,
							arguments: args
						}
					});
					break;
				}
				case "finish": {
					chunks.push(...closeText(), ...closeReasoning());
					const usage = isRecord$1(event.totalUsage) ? event.totalUsage : void 0;
					if (usage) {
						const details = isRecord$1(usage.inputTokenDetails) ? usage.inputTokenDetails : void 0;
						const tokenUsage = {
							inputTokens: numberValue(details?.noCacheTokens) ?? numberValue(usage.inputTokens) ?? 0,
							outputTokens: numberValue(usage.outputTokens) ?? 0,
							cacheReadTokens: numberValue(details?.cacheReadTokens) ?? 0
						};
						chunks.push({
							type: "usage",
							usage: tokenUsage
						});
					}
					chunks.push({
						type: "finish",
						reason: mapFinishReason(event.finishReason)
					});
					break;
				}
				case "error": throw new CommandCodeError("PROVIDER_PROTOCOL_ERROR", stringValue(event.message) ?? "Command Code stream error", {
					model: options.model,
					endpoint: "/alpha/generate"
				});
			}
			return chunks;
		};
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				resetIdleTimer();
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";
				for (const line of lines) {
					const event = parseStreamEventLine(line);
					if (event === void 0) continue;
					for (const chunk of handleEvent(event)) yield chunk;
				}
			}
			if (buffer.trim()) {
				const event = parseStreamEventLine(buffer);
				if (event !== void 0) for (const chunk of handleEvent(event)) yield chunk;
			}
		} catch (error) {
			if (error instanceof CommandCodeError) throw error;
			if (error instanceof Error && error.name === "AbortError") throw new CommandCodeError("STREAM_IDLE_TIMEOUT", `Stream idle for more than ${connection.streamIdleTimeoutMs}ms`, { model: options.model }, error);
			throw wrapError(error, "NETWORK_ERROR", { model: options.model });
		} finally {
			if (streamIdleTimer !== void 0) clearTimeout(streamIdleTimer);
			reader.cancel().catch(() => void 0);
		}
		yield {
			type: "finish",
			reason: { kind: "stop" }
		};
	}
};
//#endregion
//#region src/accounts.ts
/** Max delay for retry-after (matches dsh-llm's cap). */
const RETRY_MAX_DELAY_MS = 9e5;
/**
* Multi-account pool.
*
* Rotation is passive: a key is marked only when a request using it is
* actually rejected (429/401). When every account is marked, the pool
* probes windows to revive cooled-down accounts. The steady state costs
* zero extra API calls.
*/
var CommandCodeAccountPool = class {
	deps;
	/** Keyed by resolved API key (process-local, never logged). */
	states = /* @__PURE__ */ new Map();
	probeInflight;
	constructor(deps) {
		this.deps = deps;
	}
	/**
	* Resolve the next usable API key.
	* @param exclude Optional key to exclude (just-rejected, for rotation).
	*/
	async resolveKey(opts = {}) {
		const slots = this.deps.slots();
		const preferred = this.deps.preferredId();
		const resolved = await Promise.all(slots.map(async (slot) => {
			const key = await this.resolveSlotKey(slot);
			if (key === void 0) return void 0;
			return {
				slot,
				key,
				state: this.states.get(key) ?? { kind: "ok" }
			};
		}));
		const usable = resolved.filter((r) => r !== void 0 && this.isUsable(r.state));
		if (usable.length === 0) {
			await this.probeAllWindows(resolved.filter((r) => r !== void 0));
			const revived = resolved.filter((r) => r !== void 0 && this.isUsable(this.states.get(r.key) ?? r.state));
			if (revived.length === 0) return void 0;
			return this.select(revived, preferred, opts.exclude);
		}
		return this.select(usable, preferred, opts.exclude);
	}
	/** Mark a key as rejected (rate-limit or invalid-credential). */
	markRejected(key, rejection) {
		if (rejection === "invalid-credential") this.states.set(key, {
			kind: "disabled",
			rejection
		});
		else this.states.set(key, {
			kind: "cooldown",
			rejection,
			until: Date.now() + 3e5
		});
	}
	/** Describe all accounts (for the settings page UI). */
	async describeAccounts() {
		const slots = this.deps.slots();
		return (await Promise.all(slots.map(async (slot) => {
			const key = await this.resolveSlotKey(slot);
			if (key === void 0) return void 0;
			return {
				slot,
				key,
				state: this.states.get(key) ?? { kind: "ok" }
			};
		}))).filter((r) => r !== void 0);
	}
	/** Get all resolved accounts (for active selection logic). */
	async resolvedAccounts() {
		return this.describeAccounts();
	}
	/** Clear all state (e.g. when settings change drastically). */
	reset() {
		this.states.clear();
	}
	async resolveSlotKey(slot) {
		if (slot.literal !== void 0 && slot.literal.length > 0) return slot.literal;
		if (slot.ref !== void 0) {
			const hit = await this.deps.resolveRef(slot.ref);
			if (hit !== void 0 && hit.length > 0) return hit;
		}
		if (slot.allowAuthFile) return this.deps.authFileKey();
	}
	isUsable(state) {
		if (state.kind === "ok") return true;
		if (state.kind === "cooldown") return Date.now() >= state.until;
		return false;
	}
	select(accounts, preferredId, exclude) {
		const candidates = exclude !== void 0 ? accounts.filter((a) => a.key !== exclude) : accounts;
		if (candidates.length === 0) return void 0;
		if (preferredId !== void 0) {
			const hit = candidates.find((a) => a.slot.id === preferredId);
			if (hit !== void 0) return hit;
		}
		return candidates[0];
	}
	/** Probe all marked accounts' windows to revive cooled-down ones. */
	async probeAllWindows(accounts) {
		if (this.probeInflight !== void 0) {
			await this.probeInflight;
			return;
		}
		this.probeInflight = (async () => {
			await Promise.all(accounts.map(async (account) => {
				const state = this.states.get(account.key);
				if (state === void 0 || state.kind === "ok") return;
				try {
					const result = await this.deps.probeWindow(account.key);
					if (result === void 0) return;
					if (!result.exceeded) this.states.set(account.key, { kind: "ok" });
					else if (state.kind === "cooldown") this.states.set(account.key, {
						kind: "cooldown",
						rejection: state.rejection,
						until: result.resetAt > 0 ? result.resetAt : state.until
					});
				} catch {}
			}));
		})();
		try {
			await this.probeInflight;
		} finally {
			this.probeInflight = void 0;
		}
	}
};
/** Whether an account state is currently usable (exported for UI). */
function accountUsable(state) {
	if (state === void 0) return true;
	if (state.kind === "ok") return true;
	if (state.kind === "cooldown") return Date.now() >= state.until;
	return false;
}
/** Select the active account from a list, respecting preferred id. */
function selectActiveAccount(accounts, preferredId) {
	if (preferredId !== void 0) {
		const hit = accounts.find((a) => a.slot.id === preferredId && accountUsable(a.state));
		if (hit !== void 0) return hit;
	}
	return accounts.find((a) => accountUsable(a.state));
}
/** Build slot list from raw config (shared between index.ts and tests). */
function buildSlots(config, defaultEnv) {
	const list = [{
		id: "default",
		label: "Default",
		ref: credentialRef(config.apiKeyEnv ?? defaultEnv),
		literal: config.apiKey,
		allowAuthFile: true
	}];
	for (const [index, account] of (config.accounts ?? []).entries()) {
		const refName = typeof account.apiKeyEnv === "string" && account.apiKeyEnv.trim() !== "" ? account.apiKeyEnv.trim() : void 0;
		const literal = typeof account.apiKey === "string" && account.apiKey !== "" ? account.apiKey : void 0;
		if (refName === void 0 && literal === void 0) continue;
		list.push({
			id: refName ?? `account-${index + 2}`,
			label: typeof account.label === "string" && account.label.trim() !== "" ? account.label.trim() : `Account ${index + 2}`,
			ref: refName === void 0 ? void 0 : credentialRef(refName),
			literal,
			allowAuthFile: false
		});
	}
	return list;
}
//#endregion
//#region src/command-locales.ts
/** Chinese strings. */
const zh = {
	commandName: "commandcode",
	commandDescription: "查看 Command Code 账户用量与订阅状态",
	usageTitle: "Command Code 用量概览",
	accountLabel: "账户",
	planLabel: "套餐",
	creditsLabel: "额度",
	monthlyCredits: "月度额度",
	purchasedCredits: "按需额度",
	freeCredits: "免费额度",
	fiveHourWindow: "5 小时窗口",
	weeklyWindow: "每周窗口",
	used: "已用",
	cap: "上限",
	exceeded: "已超限",
	resetsAt: "重置时间",
	totalRequests: "总请求数",
	successRate: "成功率",
	totalCost: "总费用",
	tokensIn: "输入 Tokens",
	tokensOut: "输出 Tokens",
	noAccountsConfigured: "未配置任何账户，请在设置页面配置 API Key",
	noKeyFound: "未找到 API Key",
	fetchingUsage: "正在获取用量数据…",
	usageFetchFailed: "用量数据获取失败",
	activeAccount: "当前账户",
	rateLimited: "已限流",
	invalidCredential: "凭证无效",
	refreshHint: "运行 /commandcode 刷新数据"
};
/** English strings. */
const en = {
	commandName: "commandcode",
	commandDescription: "View Command Code account usage and subscription status",
	usageTitle: "Command Code Usage Overview",
	accountLabel: "Account",
	planLabel: "Plan",
	creditsLabel: "Credits",
	monthlyCredits: "Monthly Credits",
	purchasedCredits: "On-demand Credits",
	freeCredits: "Free Credits",
	fiveHourWindow: "5-Hour Window",
	weeklyWindow: "Weekly Window",
	used: "Used",
	cap: "Cap",
	exceeded: "Exceeded",
	resetsAt: "Resets At",
	totalRequests: "Total Requests",
	successRate: "Success Rate",
	totalCost: "Total Cost",
	tokensIn: "Input Tokens",
	tokensOut: "Output Tokens",
	noAccountsConfigured: "No accounts configured. Set an API key in the settings page.",
	noKeyFound: "No API key found",
	fetchingUsage: "Fetching usage data…",
	usageFetchFailed: "Failed to fetch usage data",
	activeAccount: "Active Account",
	rateLimited: "Rate Limited",
	invalidCredential: "Invalid Credential",
	refreshHint: "Run /commandcode to refresh"
};
/**
* Pick the command locale from the explicit config or shell environment.
* An unknown value is treated as "unset" → falls back to shell → 'zh'.
*/
function pickCommandLocale(lang) {
	if (lang === "zh" || lang === "en") return lang;
	if ((process.env.LC_ALL ?? process.env.LANG ?? "").toLowerCase().startsWith("en")) return "en";
	return "zh";
}
//#endregion
//#region src/commands.ts
/** Command definition (for registration with the commands service). */
const commandDefinition = {
	name: "commandcode",
	description: {
		zh: "查看 Command Code 账户用量与订阅状态",
		en: "View Command Code account usage and subscription status"
	}
};
/**
* Apply the /commandcode command to the commands context.
*/
function applyCommands(ctx, deps) {
	const commands = ctx.get("commands");
	if (commands === void 0) return;
	commands.register({
		name: "commandcode",
		description: "View Command Code account usage and subscription status",
		execute: async () => {
			const t = getLocaleStrings(deps.getLocale());
			return renderUsageReport(await deps.reports(), t);
		}
	});
}
/** Get locale strings by id. */
function getLocaleStrings(locale) {
	return locale === "en" ? en : zh;
}
/**
* Render the usage report as a human-readable string.
*/
function renderUsageReport(report, t) {
	const lines = [];
	lines.push(`=== ${t.usageTitle} ===`);
	lines.push("");
	if (report.accounts.length === 0) {
		lines.push(t.noAccountsConfigured);
		return lines.join("\n");
	}
	for (const account of report.accounts) {
		const badge = account.active ? `[${t.activeAccount}]` : "";
		const markBadge = account.mark === "rate-limit" ? `[${t.rateLimited}]` : account.mark === "invalid-credential" ? `[${t.invalidCredential}]` : "";
		lines.push(`--- ${account.label} ${badge} ${markBadge} ---`);
		if (!account.configured) {
			lines.push(`  ${t.noKeyFound}`);
			lines.push("");
			continue;
		}
		const r = account.report;
		if (r.blocked) {
			lines.push(`  ${t.usageFetchFailed}: ${r.blocked}`);
			lines.push("");
			continue;
		}
		if (r.account) lines.push(`  ${t.accountLabel}: ${r.account.userName || r.account.name || r.account.id}`);
		if (r.plan) lines.push(`  ${t.planLabel}: ${r.plan.name} (${r.plan.status})`);
		if (r.credits) {
			lines.push(`  ${t.monthlyCredits}: ${r.credits.monthlyCredits}`);
			lines.push(`  ${t.purchasedCredits}: ${r.credits.purchasedCredits}`);
			lines.push(`  ${t.freeCredits}: ${r.credits.freeCredits}`);
			lines.push("");
			lines.push(`  ${t.fiveHourWindow}:`);
			lines.push(`    ${t.used}: ${r.credits.fiveHour.used} / ${r.credits.fiveHour.cap}`);
			if (r.credits.fiveHour.exceeded) lines.push(`    ${t.exceeded}! ${t.resetsAt}: ${new Date(r.credits.fiveHour.resetAt).toLocaleString()}`);
			lines.push(`  ${t.weeklyWindow}:`);
			lines.push(`    ${t.used}: ${r.credits.weekly.used} / ${r.credits.weekly.cap}`);
			if (r.credits.weekly.exceeded) lines.push(`    ${t.exceeded}! ${t.resetsAt}: ${new Date(r.credits.weekly.resetAt).toLocaleString()}`);
		}
		if (r.usage) {
			lines.push("");
			lines.push(`  ${t.totalRequests}: ${r.usage.totalCount}`);
			lines.push(`  ${t.successRate}: ${r.usage.successRate.toFixed(1)}%`);
			lines.push(`  ${t.totalCost}: ${r.usage.totalCost.toFixed(4)}`);
			lines.push(`  ${t.tokensIn}: ${r.usage.totalTokensIn}`);
			lines.push(`  ${t.tokensOut}: ${r.usage.totalTokensOut}`);
		}
		if (r.failures.length > 0) {
			lines.push("");
			lines.push(`  ${t.usageFetchFailed}:`);
			for (const failure of r.failures) lines.push(`    - ${failure}`);
		}
		lines.push("");
	}
	lines.push(t.refreshHint);
	return lines.join("\n");
}
//#endregion
//#region src/usage-wire.ts
/**
* Usage wire protocol types — shared between Host and Client.
*
* The Host exposes a `GET /api/commandcode/report` Fetch route that returns
* per-account usage, billing, and plan data for the settings page. The
* payloads travel as plain JSON (no generated Remote codec), so the Client
* side validates defensively through `parseAccountsReport`.
*/
/** Fetch route path (mounted on the shared `/api` channel). */
const USAGE_REPORT_PATH = "/api/commandcode/report";
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function str(value, fallback) {
	return typeof value === "string" ? value : fallback;
}
function num(value, fallback) {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function bool(value, fallback) {
	return typeof value === "boolean" ? value : fallback;
}
function parseMark(value) {
	return value === "rate-limit" || value === "invalid-credential" ? value : "";
}
function parseBlocked(value) {
	return value === "invalid-key" || value === "service-unavailable" || value === "network" ? value : void 0;
}
function parseReport(value) {
	const report = isRecord(value) ? value : {};
	const out = { failures: [] };
	if (isRecord(report.account)) out.account = {
		id: str(report.account.id, ""),
		name: str(report.account.name, ""),
		userName: str(report.account.userName, "")
	};
	if (isRecord(report.usage)) out.usage = {
		totalCount: num(report.usage.totalCount, 0),
		totalCost: num(report.usage.totalCost, 0),
		successRate: num(report.usage.successRate, 0),
		completedCount: num(report.usage.completedCount, 0),
		failedCount: num(report.usage.failedCount, 0),
		totalTokensIn: num(report.usage.totalTokensIn, 0),
		totalTokensOut: num(report.usage.totalTokensOut, 0),
		totalCredits: num(report.usage.totalCredits, 0),
		periodBasis: str(report.usage.periodBasis, "")
	};
	if (isRecord(report.credits)) {
		const fh = isRecord(report.credits.fiveHour) ? report.credits.fiveHour : {};
		const wk = isRecord(report.credits.weekly) ? report.credits.weekly : {};
		out.credits = {
			monthlyCredits: num(report.credits.monthlyCredits, 0),
			purchasedCredits: num(report.credits.purchasedCredits, 0),
			freeCredits: num(report.credits.freeCredits, 0),
			fiveHour: {
				used: num(fh.used, 0),
				cap: num(fh.cap, 0),
				exceeded: fh.exceeded === true,
				resetAt: num(fh.resetAt, 0)
			},
			weekly: {
				used: num(wk.used, 0),
				cap: num(wk.cap, 0),
				exceeded: wk.exceeded === true,
				resetAt: num(wk.resetAt, 0)
			}
		};
	}
	if (isRecord(report.plan)) out.plan = {
		planId: str(report.plan.planId, ""),
		name: str(report.plan.name, ""),
		status: str(report.plan.status, ""),
		monthlyCredits: typeof report.plan.monthlyCredits === "number" ? report.plan.monthlyCredits : null,
		currentPeriodEnd: num(report.plan.currentPeriodEnd, 0)
	};
	out.failures = Array.isArray(report.failures) ? report.failures.filter((f) => typeof f === "string") : [];
	out.blocked = parseBlocked(report.blocked);
	return out;
}
/**
* Parse a raw report response (defensive: drops malformed entries instead of
* throwing, so a partial Host report still renders).
*/
function parseAccountsReport(value) {
	if (!isRecord(value) || !Array.isArray(value.accounts)) return { accounts: [] };
	const accounts = [];
	for (const entry of value.accounts) {
		if (!isRecord(entry)) continue;
		accounts.push({
			id: str(entry.id, ""),
			label: str(entry.label, ""),
			configured: bool(entry.configured, false),
			active: bool(entry.active, false),
			mark: parseMark(entry.mark),
			cooldownUntil: num(entry.cooldownUntil, 0),
			report: parseReport(entry.report)
		});
	}
	return { accounts };
}
//#endregion
//#region src/login-wire.ts
/**
* Login wire protocol types — shared between Host and Client.
*
* The Host exposes three GET Fetch routes on the shared `/api` channel:
*   - /api/commandcode/login/begin: start the OAuth flow (returns the
*     authorization URL)
*   - /api/commandcode/login/status: poll the flow status
*   - /api/commandcode/login/cancel: abort an in-progress flow
*
* Payloads travel as plain JSON; the Client validates them defensively
* through `parseLoginStatus`.
*/
/** Fetch route paths (mounted on the shared `/api` channel). */
const LOGIN_BEGIN_PATH = "/api/commandcode/login/begin";
const LOGIN_STATUS_PATH = "/api/commandcode/login/status";
const LOGIN_CANCEL_PATH = "/api/commandcode/login/cancel";
/** Parse a raw status response (defensive: returns idle on bad input). */
function parseLoginStatus(value) {
	if (typeof value !== "object" || value === null) return { phase: "idle" };
	const v = value;
	const phase = typeof v.phase === "string" ? v.phase : "idle";
	if (![
		"idle",
		"pending",
		"success",
		"failed"
	].includes(phase)) return { phase: "idle" };
	return {
		phase,
		authUrl: typeof v.authUrl === "string" ? v.authUrl : void 0,
		failure: typeof v.failure === "string" ? v.failure : void 0,
		message: typeof v.message === "string" ? v.message : void 0,
		startedAt: typeof v.startedAt === "number" ? v.startedAt : void 0,
		completedAt: typeof v.completedAt === "number" ? v.completedAt : void 0
	};
}
//#endregion
//#region src/usage-remote.ts
function jsonResponse(value) {
	return new Response(JSON.stringify(value), {
		status: 200,
		headers: { "content-type": "application/json" }
	});
}
function errorResponse(error) {
	return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
		status: 500,
		headers: { "content-type": "application/json" }
	});
}
/**
* Apply the usage remote: register the `/api/commandcode/*` Fetch routes.
*/
function applyUsageRemote(ctx, deps) {
	ctx.inject(["connection"], (connectionCtx) => {
		const connection = connectionCtx.get("connection");
		const routes = [
			{
				path: USAGE_REPORT_PATH,
				methods: ["GET"],
				fetch: async () => {
					try {
						return jsonResponse(await deps.reports());
					} catch (error) {
						return errorResponse(error);
					}
				}
			},
			{
				path: LOGIN_BEGIN_PATH,
				methods: ["GET"],
				fetch: async () => {
					try {
						return jsonResponse(await deps.login.begin());
					} catch (error) {
						return errorResponse(error);
					}
				}
			},
			{
				path: LOGIN_STATUS_PATH,
				methods: ["GET"],
				fetch: async () => {
					try {
						return jsonResponse(deps.login.getStatus());
					} catch (error) {
						return errorResponse(error);
					}
				}
			},
			{
				path: LOGIN_CANCEL_PATH,
				methods: ["GET"],
				fetch: async () => {
					try {
						return jsonResponse(await deps.login.cancel());
					} catch (error) {
						return errorResponse(error);
					}
				}
			}
		];
		for (const route of routes) connectionCtx.effect(() => connection.fetch.register(route), `dsh-commandcode: ${route.path}`);
	});
}
/**
* Usage service wrapper (for tests and direct access).
*/
var CommandCodeUsageService = class {
	deps;
	constructor(deps) {
		this.deps = deps;
	}
	async getReport() {
		return this.deps.reports();
	}
	async getUsageForAccount(apiKey) {
		return this.deps.adapter.getUsage(apiKey);
	}
};
//#endregion
//#region src/login.ts
/**
* Command Code login flow — OAuth-style authorization with a loopback
* callback server.
*
* The flow:
* 1. Host binds a loopback HTTP server on a random port (18700–18799).
* 2. Host builds the authorization URL (Command Code studio OAuth endpoint).
* 3. Client opens the URL in the user's browser.
* 4. User authorizes; Command Code redirects to the loopback callback with
*    the API key in the query string or POST body.
* 5. Host validates the key, stores it through the credentials seam, and
*    reports success.
*
* Enhancement: explicit port range, CORS-safe callback, timeout with
* automatic cleanup, and structured failure reasons.
*/
/** Login flow timeout (5 minutes). */
const LOGIN_TIMEOUT_MS = 3e5;
/** Start of the loopback port range. */
const LOGIN_START_PORT = 18700;
/** Number of ports to try before giving up. */
const LOGIN_MAX_PORT_ATTEMPTS = 100;
/**
* Build the Command Code authorization URL for the given callback port.
*/
function buildCommandAuthUrl(apiBase, port) {
	return `${studioBaseForApiBase(apiBase)}/auth/authorize?${new URLSearchParams({
		callback: `http://localhost:${port}/callback`,
		source: "dsh-commandcode"
	}).toString()}`;
}
/** Derive the studio (web UI) base from the API base. */
function studioBaseForApiBase(apiBase) {
	try {
		const url = new URL(apiBase);
		return `${url.protocol}//${url.host}/studio`;
	} catch {
		return "https://commandcode.ai/studio";
	}
}
/**
* Validate an API key by calling the /alpha/whoami endpoint.
* Returns the account info when valid.
*/
async function validateCommandApiKey(apiKey, apiBase, fetchImpl = fetch) {
	try {
		const response = await fetchImpl(`${apiBase}/alpha/whoami`, {
			headers: {
				authorization: `Bearer ${apiKey}`,
				accept: "application/json"
			},
			signal: AbortSignal.timeout(1e4)
		});
		if (response.status === 401 || response.status === 403) return {
			valid: false,
			error: `API key rejected (${response.status})`
		};
		if (!response.ok) return {
			valid: false,
			error: `Validation endpoint returned ${response.status}`
		};
		const body = await response.json();
		const user = typeof body.user === "object" && body.user !== null ? body.user : body;
		return {
			valid: true,
			account: typeof user.userName === "string" ? user.userName : typeof user.name === "string" ? user.name : void 0
		};
	} catch (error) {
		return {
			valid: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
/**
* Login flow controller. One instance per plugin lifecycle.
* Only one flow can be active at a time.
*/
var CommandCodeLoginFlow = class {
	deps;
	server;
	port = 0;
	status = { phase: "idle" };
	timeoutHandle;
	fetchImpl;
	constructor(deps) {
		this.deps = deps;
		this.fetchImpl = deps.fetchImpl ?? fetch;
	}
	/** Current status (for the status endpoint). */
	getStatus() {
		return { ...this.status };
	}
	/**
	* Begin the login flow. Binds the callback server and returns the
	* authorization URL. Throws if a flow is already active.
	*/
	async begin() {
		if (this.status.phase === "pending") return this.getStatus();
		const port = await this.bindServer();
		this.port = port;
		this.status = {
			phase: "pending",
			authUrl: buildCommandAuthUrl(this.deps.apiBase(), port),
			startedAt: Date.now()
		};
		this.timeoutHandle = setTimeout(() => {
			this.fail("timeout", "Login flow timed out after 5 minutes");
		}, LOGIN_TIMEOUT_MS);
		return this.getStatus();
	}
	/** Cancel an in-progress flow. */
	async cancel() {
		if (this.status.phase !== "pending") return this.getStatus();
		return this.fail("cancelled", "Login flow cancelled by user");
	}
	/** Dispose: clean up server and timers. */
	dispose() {
		this.cleanup();
		this.status = { phase: "idle" };
	}
	async bindServer() {
		for (let attempt = 0; attempt < 100; attempt++) {
			const port = LOGIN_START_PORT + attempt;
			try {
				await new Promise((resolve, reject) => {
					const server = createServer((req, res) => this.handleCallback(req, res));
					server.once("error", reject);
					server.listen(port, "127.0.0.1", () => {
						this.server = server;
						resolve();
					});
				});
				return port;
			} catch {
				continue;
			}
		}
		throw new CommandCodeError("LOGIN_FAILED", `Could not bind a loopback port in range ${LOGIN_START_PORT}–18800`);
	}
	handleCallback(req, res) {
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");
		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}
		const url = new URL(req.url ?? "/", `http://localhost:${this.port}`);
		if (url.pathname === "/callback" && (req.method === "GET" || req.method === "POST")) {
			let body = "";
			req.on("data", (chunk) => {
				body += chunk;
				if (body.length > 65536) {
					req.destroy();
					this.sendError(res, 413, "Payload too large");
				}
			});
			req.on("end", () => {
				this.processCallback(url, body, res);
			});
			return;
		}
		if (url.pathname === "/health") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ ok: true }));
			return;
		}
		res.writeHead(404);
		res.end();
	}
	async processCallback(url, body, res) {
		try {
			let apiKey = url.searchParams.get("api_key") ?? url.searchParams.get("apiKey") ?? url.searchParams.get("key");
			if (!apiKey && body.length > 0) try {
				const parsed = JSON.parse(body);
				apiKey = typeof parsed.api_key === "string" ? parsed.api_key : typeof parsed.apiKey === "string" ? parsed.apiKey : typeof parsed.key === "string" ? parsed.key : void 0;
			} catch {
				const params = new URLSearchParams(body);
				apiKey = params.get("api_key") ?? params.get("apiKey") ?? params.get("key");
			}
			if (!apiKey || apiKey.length === 0) {
				this.sendError(res, 400, "No API key in callback");
				await this.fail("callback-error", "Callback did not include an API key");
				return;
			}
			const validation = await validateCommandApiKey(apiKey, this.deps.apiBase(), this.fetchImpl);
			if (!validation.valid) {
				this.sendError(res, 401, validation.error ?? "Invalid API key");
				await this.fail("invalid-key", validation.error ?? "The delivered API key is invalid");
				return;
			}
			try {
				await this.deps.storeKey({
					apiKey,
					account: validation.account
				});
			} catch (error) {
				this.sendError(res, 500, "Failed to store credentials");
				await this.fail("store-error", error instanceof Error ? error.message : "Failed to store credentials");
				return;
			}
			this.cleanup();
			this.status = {
				phase: "success",
				completedAt: Date.now(),
				startedAt: this.status.startedAt
			};
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			res.end(`
        <!DOCTYPE html>
        <html><head><title>Login Successful</title></head>
        <body style="font-family:system-ui;text-align:center;padding:40px;">
          <h2>Command Code login successful</h2>
          <p>You can close this tab and return to DSH-Desktop.</p>
        </body></html>
      `);
		} catch (error) {
			this.sendError(res, 500, "Internal error");
			await this.fail("callback-error", error instanceof Error ? error.message : String(error));
		}
	}
	sendError(res, status, message) {
		res.writeHead(status, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: message }));
	}
	async fail(reason, message) {
		this.cleanup();
		this.status = {
			phase: "failed",
			failure: reason,
			message,
			startedAt: this.status.startedAt,
			completedAt: Date.now()
		};
		return this.getStatus();
	}
	cleanup() {
		if (this.timeoutHandle !== void 0) {
			clearTimeout(this.timeoutHandle);
			this.timeoutHandle = void 0;
		}
		if (this.server !== void 0) {
			this.server.close();
			this.server = void 0;
		}
		this.port = 0;
	}
};
//#endregion
//#region src/index.ts
/**
* dsh-commandcode — Enhanced DSH-Desktop LLM provider plugin for Command Code.
*
* Registers the `commandcode` provider route on `ctx.llm`, declares it in
* the configurable-provider directory (Models page card), and wires up:
* - Live model catalog with stale-while-revalidate + on-disk cache
* - Multi-account pool with passive rotation and active window probing
* - OAuth login flow with loopback callback server
* - Per-account usage/billing report (Typert Gateway)
* - /commandcode Host-side command for terminal usage
* - Settings section with API key, endpoint, timeouts, and accounts
*
* ```yaml
* - id: llm-commandcode
*   name: "dsh-commandcode"
*   config:
*     apiKeyEnv: COMMANDCODE_API_KEY
* ```
*
* @module dsh-commandcode
*/
const name = "llm-commandcode";
const inject = ["llm"];
const NS = settingsNamespace("llm-commandcode");
const DEFAULT_API_KEY_ENV = "COMMANDCODE_API_KEY";
/** The single provider route this plugin owns. */
const PROVIDER = "commandcode";
/** Default models cache path. */
const DEFAULT_MODELS_CACHE_PATH = join(homedir(), ".commandcode", "models-cache.json");
const Config = z.object({
	apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV),
	apiKey: z.string(),
	apiBase: z.string(),
	workingDir: z.string(),
	modelsCachePath: z.string(),
	requestTimeoutMs: z.number().min(1).max(MAX_TIMER_DELAY_MS),
	streamIdleTimeoutMs: z.number().min(1).max(MAX_TIMER_DELAY_MS),
	filterModelsByPlan: z.boolean(),
	accounts: z.array(z.object({
		label: z.string(),
		apiKeyEnv: z.string().role("credential-ref"),
		apiKey: z.string()
	})),
	activeAccount: z.string(),
	lang: z.string().pattern(/^(zh|en)$/).default("zh")
});
function resolveAdapterOptions(config) {
	return {
		apiKeyEnv: credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV),
		apiBase: config.apiBase ?? "https://api.commandcode.ai",
		workingDir: config.workingDir ?? process.cwd(),
		modelsCachePath: config.modelsCachePath ?? DEFAULT_MODELS_CACHE_PATH,
		requestTimeoutMs: config.requestTimeoutMs ?? 6e4,
		streamIdleTimeoutMs: config.streamIdleTimeoutMs ?? 3e5,
		filterModelsByPlan: config.filterModelsByPlan ?? true
	};
}
function apply(ctx, config) {
	let current = () => config;
	let lastRaw;
	let lastGood;
	const options = () => {
		const raw = current();
		if (raw === lastRaw && lastGood !== void 0) return lastGood;
		const next = resolveAdapterOptions(raw);
		lastRaw = raw;
		lastGood = next;
		return next;
	};
	options();
	const slots = () => buildSlots(current(), DEFAULT_API_KEY_ENV);
	const preferredId = () => {
		const raw = current().activeAccount;
		return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : void 0;
	};
	const resolveRef = async (ref) => {
		const credentials = ctx.get("credentials");
		if (credentials !== void 0) return (await credentials.resolve(ref))?.value;
		const ambient = launchEnvironmentOf(ctx).get(ref);
		return ambient !== void 0 && ambient.value.length > 0 ? ambient.value : void 0;
	};
	const pool = new CommandCodeAccountPool({
		slots,
		resolveRef,
		authFileKey: async () => resolveAuthFileApiKey(),
		probeWindow: (apiKey) => adapter.probeFiveHourWindow(apiKey),
		preferredId
	});
	const resolveApiKey = async (connection) => {
		const resolved = await pool.resolveKey();
		if (resolved !== void 0) return assertUsableApiKey(resolved.key, "llm-commandcode", resolved.slot.ref ?? `${resolved.slot.label} (config.apiKey)`);
		const ref = connection.apiKeyEnv;
		throw new LlmError(`llm-commandcode: no API key for provider route "${PROVIDER}"; store ${ref} through the credentials service (the web Models page writes it), export it in the launching environment, set config.apiKey, or run the built-in login flow.`, "MISSING_CREDENTIAL");
	};
	const adapter = new CommandCodeAdapter({
		options,
		resolveApiKey,
		rotateApiKey: async (rejectedKey, rejection, connection) => {
			pool.markRejected(rejectedKey, rejection);
			const resolved = await pool.resolveKey({ exclude: rejectedKey });
			return resolved === void 0 ? void 0 : assertUsableApiKey(resolved.key, "llm-commandcode", resolved.slot.ref ?? `${resolved.slot.label} (config.apiKey)`);
		},
		resolveAttachments: () => {
			const attachments = ctx.get("attachments");
			return attachments === void 0 ? void 0 : attachments;
		}
	});
	ctx.llm.registerConfigurableProviders([{
		provider: PROVIDER,
		displayName: "Command Code",
		settingsNs: NS,
		settingsPath: []
	}]);
	ctx.llm.registerAdapter([PROVIDER], adapter);
	const usageReports = async () => {
		const described = await pool.describeAccounts();
		const byId = new Map(described.map((a) => [a.slot.id, a]));
		const active = selectActiveAccount(await pool.resolvedAccounts(), preferredId());
		return { accounts: await Promise.all(slots().map(async (slot) => {
			const account = byId.get(slot.id);
			let report;
			if (account === void 0) report = { failures: [] };
			else try {
				report = await adapter.getUsage(account.key);
			} catch (error) {
				report = { failures: [error instanceof Error ? error.message : String(error)] };
			}
			const state = account?.state;
			const usable = accountUsable(state);
			return {
				id: slot.id,
				label: slot.label,
				configured: account !== void 0,
				active: account !== void 0 && active?.slot.id === slot.id,
				mark: usable ? "" : state?.kind === "disabled" ? "invalid-credential" : "rate-limit",
				cooldownUntil: !usable && state?.kind === "cooldown" ? state.until : 0,
				report
			};
		})) };
	};
	const commandLocale = () => pickCommandLocale(current().lang);
	ctx.inject(["commands"], (commandCtx) => {
		applyCommands(commandCtx, {
			reports: usageReports,
			getLocale: commandLocale
		});
	});
	const loginFlow = new CommandCodeLoginFlow({
		apiBase: () => options().apiBase,
		storeKey: async ({ apiKey }) => {
			const ref = credentialRef(current().apiKeyEnv ?? DEFAULT_API_KEY_ENV);
			const credentials = ctx.get("credentials");
			if (credentials === void 0) throw new CommandCodeError("LOGIN_FAILED", "The credentials service is unavailable in this profile; paste the key manually.");
			await credentials.set(ref, apiKey);
		}
	});
	ctx.effect(() => () => loginFlow.dispose(), "dsh-commandcode: login flow");
	applyUsageRemote(ctx, {
		adapter,
		reports: usageReports,
		login: loginFlow
	});
	installSettingsSection(ctx, NS, Config, config, {
		setSource: (source) => {
			current = source;
		},
		onChange: () => {
			pool.reset();
		}
	});
}
//#endregion
export { BILLING_ACCESS_TTL_MS, COMMAND_CODE_CLI_VERSION, CircuitBreaker, CommandCodeAccountPool, CommandCodeAdapter, CommandCodeError, CommandCodeErrorCode, CommandCodeLoginFlow, CommandCodeUsageService, Config, DEFAULT_API_BASE, DEFAULT_GENERATE_MAX_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_MODELS_CACHE_PATH, DEFAULT_REQUEST_TIMEOUT_MS, DEFAULT_STREAM_IDLE_TIMEOUT_MS, KNOWN_EFFORTS, KNOWN_IMAGE_MODELS, KNOWN_PLANS, KNOWN_SUBSCRIPTION_PLANS, LOGIN_BEGIN_PATH, LOGIN_CANCEL_PATH, LOGIN_MAX_PORT_ATTEMPTS, LOGIN_START_PORT, LOGIN_STATUS_PATH, LOGIN_TIMEOUT_MS, ModelCatalog, NON_RETRYABLE_CODES, PLAN_LABELS, PLAN_ORDER, PROVIDER, RETRYABLE_CODES, RETRY_MAX_DELAY_MS, USAGE_REPORT_PATH, accountUsable, apply, applyCommands, applyUsageRemote, buildCommandAuthUrl, buildRetryPolicy, buildSlots, capabilityDescription, commandDefinition, compareByPlan, en, errorCodeFromStatus, formatContext, httpError, inject, modelVisibleInPlan, name, parseAccountsReport, parseLoginStatus, pickCommandLocale, planLabel, projectSlugFromPath, resolveAdapterOptions, resolveAuthFileApiKey, selectActiveAccount, studioBaseForApiBase, validateCommandApiKey, wrapError, zh };

//# sourceMappingURL=index.js.map