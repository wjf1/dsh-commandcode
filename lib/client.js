window.__ModuleLoader__.load({ id: "dsh-commandcode", factory: (require) => {
var module = { exports: {} };
var exports = module.exports;

Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//#endregion
require("react");
let react_jsx_runtime = require("react/jsx-runtime");
//#region node_modules/zustand/esm/vanilla.mjs
const createStoreImpl = (createState) => {
	let state;
	const listeners = /* @__PURE__ */ new Set();
	const setState = (partial, replace) => {
		const nextState = typeof partial === "function" ? partial(state) : partial;
		if (!Object.is(nextState, state)) {
			const previousState = state;
			state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
			listeners.forEach((listener) => listener(state, previousState));
		}
	};
	const getState = () => state;
	const subscribe = (listener) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	};
	const destroy = () => {
		if (({}.env ? {}.env.MODE : void 0) !== "production") console.warn("[DEPRECATED] The `destroy` method will be unsupported in a future version. Instead use unsubscribe function returned by subscribe. Everything will be garbage-collected if store is garbage-collected.");
		listeners.clear();
	};
	const api = {
		setState,
		getState,
		subscribe,
		destroy
	};
	state = createState(setState, getState, api);
	return api;
};
const createStore = (createState) => createState ? createStoreImpl(createState) : createStoreImpl;
//#endregion
//#region node_modules/zustand/esm/middleware.mjs
const subscribeWithSelectorImpl = (fn) => (set, get, api) => {
	const origSubscribe = api.subscribe;
	api.subscribe = (selector, optListener, options) => {
		let listener = selector;
		if (optListener) {
			const equalityFn = (options == null ? void 0 : options.equalityFn) || Object.is;
			let currentSlice = selector(api.getState());
			listener = (state) => {
				const nextSlice = selector(state);
				if (!equalityFn(currentSlice, nextSlice)) {
					const previousSlice = currentSlice;
					optListener(currentSlice = nextSlice, previousSlice);
				}
			};
			if (options == null ? void 0 : options.fireImmediately) optListener(currentSlice, currentSlice);
		}
		return origSubscribe(listener);
	};
	return fn(set, get, api);
};
const subscribeWithSelector = subscribeWithSelectorImpl;
//#endregion
//#region node_modules/immer/dist/immer.mjs
var NOTHING = Symbol.for("immer-nothing");
var DRAFTABLE = Symbol.for("immer-draftable");
var DRAFT_STATE = Symbol.for("immer-state");
function die(error, ...args) {
	throw new Error(`[Immer] minified error nr: ${error}. Full error at: https://bit.ly/3cXEKWf`);
}
var getPrototypeOf = Object.getPrototypeOf;
function isDraft(value) {
	return !!value && !!value[DRAFT_STATE];
}
function isDraftable(value) {
	if (!value) return false;
	return isPlainObject(value) || Array.isArray(value) || !!value[DRAFTABLE] || !!value.constructor?.[DRAFTABLE] || isMap(value) || isSet(value);
}
var objectCtorString = Object.prototype.constructor.toString();
var cachedCtorStrings = /* @__PURE__ */ new WeakMap();
function isPlainObject(value) {
	if (!value || typeof value !== "object") return false;
	const proto = Object.getPrototypeOf(value);
	if (proto === null || proto === Object.prototype) return true;
	const Ctor = Object.hasOwnProperty.call(proto, "constructor") && proto.constructor;
	if (Ctor === Object) return true;
	if (typeof Ctor !== "function") return false;
	let ctorString = cachedCtorStrings.get(Ctor);
	if (ctorString === void 0) {
		ctorString = Function.toString.call(Ctor);
		cachedCtorStrings.set(Ctor, ctorString);
	}
	return ctorString === objectCtorString;
}
function each(obj, iter, strict = true) {
	if (getArchtype(obj) === 0) (strict ? Reflect.ownKeys(obj) : Object.keys(obj)).forEach((key) => {
		iter(key, obj[key], obj);
	});
	else obj.forEach((entry, index) => iter(index, entry, obj));
}
function getArchtype(thing) {
	const state = thing[DRAFT_STATE];
	return state ? state.type_ : Array.isArray(thing) ? 1 : isMap(thing) ? 2 : isSet(thing) ? 3 : 0;
}
function has(thing, prop) {
	return getArchtype(thing) === 2 ? thing.has(prop) : Object.prototype.hasOwnProperty.call(thing, prop);
}
function set(thing, propOrOldValue, value) {
	const t = getArchtype(thing);
	if (t === 2) thing.set(propOrOldValue, value);
	else if (t === 3) thing.add(value);
	else thing[propOrOldValue] = value;
}
function is(x, y) {
	if (x === y) return x !== 0 || 1 / x === 1 / y;
	else return x !== x && y !== y;
}
function isMap(target) {
	return target instanceof Map;
}
function isSet(target) {
	return target instanceof Set;
}
function latest(state) {
	return state.copy_ || state.base_;
}
function shallowCopy(base, strict) {
	if (isMap(base)) return new Map(base);
	if (isSet(base)) return new Set(base);
	if (Array.isArray(base)) return Array.prototype.slice.call(base);
	const isPlain = isPlainObject(base);
	if (strict === true || strict === "class_only" && !isPlain) {
		const descriptors = Object.getOwnPropertyDescriptors(base);
		delete descriptors[DRAFT_STATE];
		let keys = Reflect.ownKeys(descriptors);
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			const desc = descriptors[key];
			if (desc.writable === false) {
				desc.writable = true;
				desc.configurable = true;
			}
			if (desc.get || desc.set) descriptors[key] = {
				configurable: true,
				writable: true,
				enumerable: desc.enumerable,
				value: base[key]
			};
		}
		return Object.create(getPrototypeOf(base), descriptors);
	} else {
		const proto = getPrototypeOf(base);
		if (proto !== null && isPlain) return { ...base };
		const obj = Object.create(proto);
		return Object.assign(obj, base);
	}
}
function freeze(obj, deep = false) {
	if (isFrozen(obj) || isDraft(obj) || !isDraftable(obj)) return obj;
	if (getArchtype(obj) > 1) Object.defineProperties(obj, {
		set: dontMutateMethodOverride,
		add: dontMutateMethodOverride,
		clear: dontMutateMethodOverride,
		delete: dontMutateMethodOverride
	});
	Object.freeze(obj);
	if (deep) Object.values(obj).forEach((value) => freeze(value, true));
	return obj;
}
function dontMutateFrozenCollections() {
	die(2);
}
var dontMutateMethodOverride = { value: dontMutateFrozenCollections };
function isFrozen(obj) {
	if (obj === null || typeof obj !== "object") return true;
	return Object.isFrozen(obj);
}
var plugins = {};
function getPlugin(pluginKey) {
	const plugin = plugins[pluginKey];
	if (!plugin) die(0, pluginKey);
	return plugin;
}
var currentScope;
function getCurrentScope() {
	return currentScope;
}
function createScope(parent_, immer_) {
	return {
		drafts_: [],
		parent_,
		immer_,
		canAutoFreeze_: true,
		unfinalizedDrafts_: 0
	};
}
function usePatchesInScope(scope, patchListener) {
	if (patchListener) {
		getPlugin("Patches");
		scope.patches_ = [];
		scope.inversePatches_ = [];
		scope.patchListener_ = patchListener;
	}
}
function revokeScope(scope) {
	leaveScope(scope);
	scope.drafts_.forEach(revokeDraft);
	scope.drafts_ = null;
}
function leaveScope(scope) {
	if (scope === currentScope) currentScope = scope.parent_;
}
function enterScope(immer2) {
	return currentScope = createScope(currentScope, immer2);
}
function revokeDraft(draft) {
	const state = draft[DRAFT_STATE];
	if (state.type_ === 0 || state.type_ === 1) state.revoke_();
	else state.revoked_ = true;
}
function processResult(result, scope) {
	scope.unfinalizedDrafts_ = scope.drafts_.length;
	const baseDraft = scope.drafts_[0];
	if (result !== void 0 && result !== baseDraft) {
		if (baseDraft[DRAFT_STATE].modified_) {
			revokeScope(scope);
			die(4);
		}
		if (isDraftable(result)) {
			result = finalize(scope, result);
			if (!scope.parent_) maybeFreeze(scope, result);
		}
		if (scope.patches_) getPlugin("Patches").generateReplacementPatches_(baseDraft[DRAFT_STATE].base_, result, scope.patches_, scope.inversePatches_);
	} else result = finalize(scope, baseDraft, []);
	revokeScope(scope);
	if (scope.patches_) scope.patchListener_(scope.patches_, scope.inversePatches_);
	return result !== NOTHING ? result : void 0;
}
function finalize(rootScope, value, path) {
	if (isFrozen(value)) return value;
	const useStrictIteration = rootScope.immer_.shouldUseStrictIteration();
	const state = value[DRAFT_STATE];
	if (!state) {
		each(value, (key, childValue) => finalizeProperty(rootScope, state, value, key, childValue, path), useStrictIteration);
		return value;
	}
	if (state.scope_ !== rootScope) return value;
	if (!state.modified_) {
		maybeFreeze(rootScope, state.base_, true);
		return state.base_;
	}
	if (!state.finalized_) {
		state.finalized_ = true;
		state.scope_.unfinalizedDrafts_--;
		const result = state.copy_;
		let resultEach = result;
		let isSet2 = false;
		if (state.type_ === 3) {
			resultEach = new Set(result);
			result.clear();
			isSet2 = true;
		}
		each(resultEach, (key, childValue) => finalizeProperty(rootScope, state, result, key, childValue, path, isSet2), useStrictIteration);
		maybeFreeze(rootScope, result, false);
		if (path && rootScope.patches_) getPlugin("Patches").generatePatches_(state, path, rootScope.patches_, rootScope.inversePatches_);
	}
	return state.copy_;
}
function finalizeProperty(rootScope, parentState, targetObject, prop, childValue, rootPath, targetIsSet) {
	if (childValue == null) return;
	if (typeof childValue !== "object" && !targetIsSet) return;
	const childIsFrozen = isFrozen(childValue);
	if (childIsFrozen && !targetIsSet) return;
	if (isDraft(childValue)) {
		const res = finalize(rootScope, childValue, rootPath && parentState && parentState.type_ !== 3 && !has(parentState.assigned_, prop) ? rootPath.concat(prop) : void 0);
		set(targetObject, prop, res);
		if (isDraft(res)) rootScope.canAutoFreeze_ = false;
		else return;
	} else if (targetIsSet) targetObject.add(childValue);
	if (isDraftable(childValue) && !childIsFrozen) {
		if (!rootScope.immer_.autoFreeze_ && rootScope.unfinalizedDrafts_ < 1) return;
		if (parentState && parentState.base_ && parentState.base_[prop] === childValue && childIsFrozen) return;
		finalize(rootScope, childValue);
		if ((!parentState || !parentState.scope_.parent_) && typeof prop !== "symbol" && (isMap(targetObject) ? targetObject.has(prop) : Object.prototype.propertyIsEnumerable.call(targetObject, prop))) maybeFreeze(rootScope, childValue);
	}
}
function maybeFreeze(scope, value, deep = false) {
	if (!scope.parent_ && scope.immer_.autoFreeze_ && scope.canAutoFreeze_) freeze(value, deep);
}
function createProxyProxy(base, parent) {
	const isArray = Array.isArray(base);
	const state = {
		type_: isArray ? 1 : 0,
		scope_: parent ? parent.scope_ : getCurrentScope(),
		modified_: false,
		finalized_: false,
		assigned_: {},
		parent_: parent,
		base_: base,
		draft_: null,
		copy_: null,
		revoke_: null,
		isManual_: false
	};
	let target = state;
	let traps = objectTraps;
	if (isArray) {
		target = [state];
		traps = arrayTraps;
	}
	const { revoke, proxy } = Proxy.revocable(target, traps);
	state.draft_ = proxy;
	state.revoke_ = revoke;
	return proxy;
}
var objectTraps = {
	get(state, prop) {
		if (prop === DRAFT_STATE) return state;
		const source = latest(state);
		if (!has(source, prop)) return readPropFromProto(state, source, prop);
		const value = source[prop];
		if (state.finalized_ || !isDraftable(value)) return value;
		if (value === peek(state.base_, prop)) {
			prepareCopy(state);
			return state.copy_[prop] = createProxy(value, state);
		}
		return value;
	},
	has(state, prop) {
		return prop in latest(state);
	},
	ownKeys(state) {
		return Reflect.ownKeys(latest(state));
	},
	set(state, prop, value) {
		const desc = getDescriptorFromProto(latest(state), prop);
		if (desc?.set) {
			desc.set.call(state.draft_, value);
			return true;
		}
		if (!state.modified_) {
			const current2 = peek(latest(state), prop);
			const currentState = current2?.[DRAFT_STATE];
			if (currentState && currentState.base_ === value) {
				state.copy_[prop] = value;
				state.assigned_[prop] = false;
				return true;
			}
			if (is(value, current2) && (value !== void 0 || has(state.base_, prop))) return true;
			prepareCopy(state);
			markChanged(state);
		}
		if (state.copy_[prop] === value && (value !== void 0 || prop in state.copy_) || Number.isNaN(value) && Number.isNaN(state.copy_[prop])) return true;
		state.copy_[prop] = value;
		state.assigned_[prop] = true;
		return true;
	},
	deleteProperty(state, prop) {
		if (peek(state.base_, prop) !== void 0 || prop in state.base_) {
			state.assigned_[prop] = false;
			prepareCopy(state);
			markChanged(state);
		} else delete state.assigned_[prop];
		if (state.copy_) delete state.copy_[prop];
		return true;
	},
	getOwnPropertyDescriptor(state, prop) {
		const owner = latest(state);
		const desc = Reflect.getOwnPropertyDescriptor(owner, prop);
		if (!desc) return desc;
		return {
			writable: true,
			configurable: state.type_ !== 1 || prop !== "length",
			enumerable: desc.enumerable,
			value: owner[prop]
		};
	},
	defineProperty() {
		die(11);
	},
	getPrototypeOf(state) {
		return getPrototypeOf(state.base_);
	},
	setPrototypeOf() {
		die(12);
	}
};
var arrayTraps = {};
each(objectTraps, (key, fn) => {
	arrayTraps[key] = function() {
		arguments[0] = arguments[0][0];
		return fn.apply(this, arguments);
	};
});
arrayTraps.deleteProperty = function(state, prop) {
	return arrayTraps.set.call(this, state, prop, void 0);
};
arrayTraps.set = function(state, prop, value) {
	return objectTraps.set.call(this, state[0], prop, value, state[0]);
};
function peek(draft, prop) {
	const state = draft[DRAFT_STATE];
	return (state ? latest(state) : draft)[prop];
}
function readPropFromProto(state, source, prop) {
	const desc = getDescriptorFromProto(source, prop);
	return desc ? `value` in desc ? desc.value : desc.get?.call(state.draft_) : void 0;
}
function getDescriptorFromProto(source, prop) {
	if (!(prop in source)) return void 0;
	let proto = getPrototypeOf(source);
	while (proto) {
		const desc = Object.getOwnPropertyDescriptor(proto, prop);
		if (desc) return desc;
		proto = getPrototypeOf(proto);
	}
}
function markChanged(state) {
	if (!state.modified_) {
		state.modified_ = true;
		if (state.parent_) markChanged(state.parent_);
	}
}
function prepareCopy(state) {
	if (!state.copy_) state.copy_ = shallowCopy(state.base_, state.scope_.immer_.useStrictShallowCopy_);
}
var Immer2 = class {
	constructor(config) {
		this.autoFreeze_ = true;
		this.useStrictShallowCopy_ = false;
		this.useStrictIteration_ = true;
		/**
		* The `produce` function takes a value and a "recipe function" (whose
		* return value often depends on the base state). The recipe function is
		* free to mutate its first argument however it wants. All mutations are
		* only ever applied to a __copy__ of the base state.
		*
		* Pass only a function to create a "curried producer" which relieves you
		* from passing the recipe function every time.
		*
		* Only plain objects and arrays are made mutable. All other objects are
		* considered uncopyable.
		*
		* Note: This function is __bound__ to its `Immer` instance.
		*
		* @param {any} base - the initial state
		* @param {Function} recipe - function that receives a proxy of the base state as first argument and which can be freely modified
		* @param {Function} patchListener - optional function that will be called with all the patches produced here
		* @returns {any} a new state, or the initial state if nothing was modified
		*/
		this.produce = (base, recipe, patchListener) => {
			if (typeof base === "function" && typeof recipe !== "function") {
				const defaultBase = recipe;
				recipe = base;
				const self = this;
				return function curriedProduce(base2 = defaultBase, ...args) {
					return self.produce(base2, (draft) => recipe.call(this, draft, ...args));
				};
			}
			if (typeof recipe !== "function") die(6);
			if (patchListener !== void 0 && typeof patchListener !== "function") die(7);
			let result;
			if (isDraftable(base)) {
				const scope = enterScope(this);
				const proxy = createProxy(base, void 0);
				let hasError = true;
				try {
					result = recipe(proxy);
					hasError = false;
				} finally {
					if (hasError) revokeScope(scope);
					else leaveScope(scope);
				}
				usePatchesInScope(scope, patchListener);
				return processResult(result, scope);
			} else if (!base || typeof base !== "object") {
				result = recipe(base);
				if (result === void 0) result = base;
				if (result === NOTHING) result = void 0;
				if (this.autoFreeze_) freeze(result, true);
				if (patchListener) {
					const p = [];
					const ip = [];
					getPlugin("Patches").generateReplacementPatches_(base, result, p, ip);
					patchListener(p, ip);
				}
				return result;
			} else die(1, base);
		};
		this.produceWithPatches = (base, recipe) => {
			if (typeof base === "function") return (state, ...args) => this.produceWithPatches(state, (draft) => base(draft, ...args));
			let patches, inversePatches;
			return [
				this.produce(base, recipe, (p, ip) => {
					patches = p;
					inversePatches = ip;
				}),
				patches,
				inversePatches
			];
		};
		if (typeof config?.autoFreeze === "boolean") this.setAutoFreeze(config.autoFreeze);
		if (typeof config?.useStrictShallowCopy === "boolean") this.setUseStrictShallowCopy(config.useStrictShallowCopy);
		if (typeof config?.useStrictIteration === "boolean") this.setUseStrictIteration(config.useStrictIteration);
	}
	createDraft(base) {
		if (!isDraftable(base)) die(8);
		if (isDraft(base)) base = current(base);
		const scope = enterScope(this);
		const proxy = createProxy(base, void 0);
		proxy[DRAFT_STATE].isManual_ = true;
		leaveScope(scope);
		return proxy;
	}
	finishDraft(draft, patchListener) {
		const state = draft && draft[DRAFT_STATE];
		if (!state || !state.isManual_) die(9);
		const { scope_: scope } = state;
		usePatchesInScope(scope, patchListener);
		return processResult(void 0, scope);
	}
	/**
	* Pass true to automatically freeze all copies created by Immer.
	*
	* By default, auto-freezing is enabled.
	*/
	setAutoFreeze(value) {
		this.autoFreeze_ = value;
	}
	/**
	* Pass true to enable strict shallow copy.
	*
	* By default, immer does not copy the object descriptors such as getter, setter and non-enumrable properties.
	*/
	setUseStrictShallowCopy(value) {
		this.useStrictShallowCopy_ = value;
	}
	/**
	* Pass false to use faster iteration that skips non-enumerable properties
	* but still handles symbols for compatibility.
	*
	* By default, strict iteration is enabled (includes all own properties).
	*/
	setUseStrictIteration(value) {
		this.useStrictIteration_ = value;
	}
	shouldUseStrictIteration() {
		return this.useStrictIteration_;
	}
	applyPatches(base, patches) {
		let i;
		for (i = patches.length - 1; i >= 0; i--) {
			const patch = patches[i];
			if (patch.path.length === 0 && patch.op === "replace") {
				base = patch.value;
				break;
			}
		}
		if (i > -1) patches = patches.slice(i + 1);
		const applyPatchesImpl = getPlugin("Patches").applyPatches_;
		if (isDraft(base)) return applyPatchesImpl(base, patches);
		return this.produce(base, (draft) => applyPatchesImpl(draft, patches));
	}
};
function createProxy(value, parent) {
	const draft = isMap(value) ? getPlugin("MapSet").proxyMap_(value, parent) : isSet(value) ? getPlugin("MapSet").proxySet_(value, parent) : createProxyProxy(value, parent);
	(parent ? parent.scope_ : getCurrentScope()).drafts_.push(draft);
	return draft;
}
function current(value) {
	if (!isDraft(value)) die(10, value);
	return currentImpl(value);
}
function currentImpl(value) {
	if (!isDraftable(value) || isFrozen(value)) return value;
	const state = value[DRAFT_STATE];
	let copy;
	let strict = true;
	if (state) {
		if (!state.modified_) return state.base_;
		state.finalized_ = true;
		copy = shallowCopy(value, state.scope_.immer_.useStrictShallowCopy_);
		strict = state.scope_.immer_.shouldUseStrictIteration();
	} else copy = shallowCopy(value, true);
	each(copy, (key, childValue) => {
		set(copy, key, currentImpl(childValue));
	}, strict);
	if (state) state.finalized_ = false;
	return copy;
}
var produce = new Immer2().produce;
//#endregion
//#region node_modules/@deepseek-ai/dsh-client-store/lib/index.js
/**
* React-free snapshot store engine (zustand vanilla + immer + subscribeWithSelector +
* rafFlush middleware + opt-in persist + dev freeze) plus the declarative
* shell over it: {@link defineStore} bakes an init/persist/actions literal
* into a {@link StoreHandle}, the registration-side store seat of slot
* terminals. Engine products are bare observables — subscribe/getSnapshot/
* update/set, NO selector hook. Hook synthesis is ui-renderer's (the one
* uSES bridge, cached per source at the binding site).
*/
/**
* Notify an observer set without allowing one callback to starve the rest.
* @param listeners - current observer callbacks; copied before dispatch.
* @param label - diagnostic owner prefix.
* @param args - callback arguments.
*/
function notifySubscribers(listeners, label, ...args) {
	for (const listener of [...listeners]) try {
		listener(...args);
	} catch (error) {
		console.error(`${label} subscriber failed:`, error);
	}
}
/** Batches subscriber notification into one flush per animation frame. */
function rafBatch(notify) {
	const schedule = typeof requestAnimationFrame === "function" ? (fn) => {
		requestAnimationFrame(() => {
			fn();
		});
	} : (fn) => {
		queueMicrotask(fn);
	};
	let scheduled = false;
	return () => {
		if (scheduled) return;
		scheduled = true;
		schedule(() => {
			scheduled = false;
			notify();
		});
	};
}
/**
* Create a snapshot store.
*
* Flush default is 'sync' (controlled inputs need same-tick echo); frame-driven
* stores opt into 'raf', where a frame's worth of updates coalesces into one
* notification. Known raf-mode tradeoff: a component mounting mid-frame reads
* fresh state while existing subscribers hear it next flush — transient
* frame-level skew, same nature as the object layer's microtask batching.
*
* @param init - initial state.
* @param opts - flush mode and opt-in persistence (localStorage, keyed by name).
* @returns the store.
*/
function createSnapshotStore(init, opts) {
	const withSelector = subscribeWithSelector(() => init);
	const api = createStore()(withSelector);
	if (opts?.persist) attachPersistence(api, opts.persist.name);
	let subscribe = (fn) => api.subscribe(() => {
		notifySubscribers([fn], "[client-store]");
	});
	if (opts?.flush === "raf") {
		const listeners = /* @__PURE__ */ new Set();
		const flush = rafBatch(() => {
			notifySubscribers(listeners, "[client-store]");
		});
		api.subscribe(flush);
		subscribe = (fn) => {
			listeners.add(fn);
			return () => {
				listeners.delete(fn);
			};
		};
	}
	return {
		getSnapshot: () => api.getState(),
		subscribe: (fn) => subscribe(fn),
		update: (mutator) => {
			api.setState(produce(api.getState(), (draft) => {
				mutator(draft);
			}), true);
		},
		set: (next) => {
			api.setState(devFreeze(next), true);
		}
	};
}
/**
* Whole-value JSON persistence to localStorage. Hand-rolled instead of the
* zustand persist middleware: its write path spreads state into an object
* (`partialize({ ...get() })`), exploding primitive state (a persisted string
* draft becomes {0:'h',1:'e',...}) — not fixable via merge/deserialize options
* because the corruption happens before serialization. Storage failures
* (quota, private mode) only disable persistence, never break the store.
*/
function attachPersistence(api, name) {
	if (typeof localStorage === "undefined") return;
	try {
		const raw = localStorage.getItem(name);
		if (raw !== null) api.setState(devFreeze(JSON.parse(raw)), true);
	} catch (error) {
		console.error(`snapshot store '${name}' rehydration failed:`, error);
	}
	api.subscribe((state) => {
		try {
			localStorage.setItem(name, JSON.stringify(state));
		} catch (error) {
			console.error(`snapshot store '${name}' persistence failed:`, error);
		}
	});
}
/** Deep-freeze draftable wholesale-set state outside production: set() bypasses immer's freeze. */
function devFreeze(value) {
	return freeze(value, true);
}
//#endregion
//#region src/client/settings.ts
/** Settings namespace for the llm-commandcode section. */
const COMMANDCODE_NS = "llm-commandcode";
const DEFAULT_API_KEY_ENV = "COMMANDCODE_API_KEY";
const EMPTY_STATE = {
	apiKey: "",
	apiKeyEnv: DEFAULT_API_KEY_ENV,
	apiKeyConfigured: false,
	apiBase: "",
	workingDir: "",
	requestTimeoutMs: "",
	streamIdleTimeoutMs: "",
	filterModelsByPlan: true,
	modelsCachePath: "",
	lang: "zh",
	accounts: [],
	activeAccount: "",
	status: "loading",
	dirty: false,
	saving: false,
	saved: false,
	failed: false,
	errorMessage: "",
	anyAccountConfigured: false,
	errors: {}
};
var CommandCodeSettingsController = class {
	scope;
	deps;
	stateValue;
	listeners = /* @__PURE__ */ new Set();
	unsubscribeScope;
	disposed = false;
	constructor(scope, deps) {
		this.scope = scope;
		this.deps = deps;
		this.stateValue = { ...EMPTY_STATE };
		this.unsubscribeScope = this.scope.subscribe(() => {
			if (!this.stateValue.dirty) this.absorbSnapshot();
		});
		this.load();
	}
	state() {
		return {
			...this.stateValue,
			accounts: this.stateValue.accounts.map((a) => ({ ...a }))
		};
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	emit() {
		for (const listener of this.listeners) listener();
	}
	patch(partial) {
		this.stateValue = {
			...this.stateValue,
			...partial,
			dirty: true,
			saved: false,
			failed: false
		};
		this.emit();
	}
	section() {
		return this.scope.getSnapshot().value ?? {};
	}
	/** Re-read the scope snapshot into local state (keeps user edits when dirty). */
	absorbSnapshot(apiKeyConfigured) {
		const section = this.section();
		const configured = apiKeyConfigured ?? this.stateValue.apiKeyConfigured;
		const accounts = Array.isArray(section.accounts) ? section.accounts.map((a, i) => ({
			id: typeof a.apiKeyEnv === "string" && a.apiKeyEnv ? a.apiKeyEnv : `account-${i + 2}`,
			label: typeof a.label === "string" ? a.label : `Account ${i + 2}`,
			apiKey: typeof a.apiKey === "string" ? a.apiKey : "",
			apiKeyEnv: typeof a.apiKeyEnv === "string" ? a.apiKeyEnv : "",
			showKey: false
		})) : [];
		this.stateValue = {
			...this.stateValue,
			apiKeyEnv: typeof section.apiKeyEnv === "string" && section.apiKeyEnv !== "" ? section.apiKeyEnv : DEFAULT_API_KEY_ENV,
			apiKeyConfigured: configured,
			apiBase: typeof section.apiBase === "string" ? section.apiBase : "",
			workingDir: typeof section.workingDir === "string" ? section.workingDir : "",
			requestTimeoutMs: section.requestTimeoutMs !== void 0 && section.requestTimeoutMs !== null ? String(section.requestTimeoutMs) : "",
			streamIdleTimeoutMs: section.streamIdleTimeoutMs !== void 0 && section.streamIdleTimeoutMs !== null ? String(section.streamIdleTimeoutMs) : "",
			filterModelsByPlan: section.filterModelsByPlan !== false,
			modelsCachePath: typeof section.modelsCachePath === "string" ? section.modelsCachePath : "",
			lang: typeof section.lang === "string" ? section.lang : "zh",
			accounts,
			activeAccount: typeof section.activeAccount === "string" ? section.activeAccount : "",
			anyAccountConfigured: configured || accounts.some((a) => a.apiKey.length > 0 || a.apiKeyEnv.length > 0),
			status: this.scope.getSnapshot().status,
			dirty: false
		};
		this.emit();
	}
	edit(field, text) {
		const errors = { ...this.stateValue.errors };
		delete errors[field];
		this.patch({
			[field]: text,
			errors
		});
	}
	editAccountLabel(id, text) {
		const accounts = this.stateValue.accounts.map((a) => a.id === id ? {
			...a,
			label: text
		} : a);
		this.patch({ accounts });
	}
	editAccountKey(id, text) {
		const accounts = this.stateValue.accounts.map((a) => a.id === id ? {
			...a,
			apiKey: text
		} : a);
		this.patch({ accounts });
	}
	toggleKeyClear(id) {
		const accounts = this.stateValue.accounts.map((a) => a.id === id ? {
			...a,
			showKey: !a.showKey
		} : a);
		this.patch({ accounts });
	}
	setFilterModels(value) {
		this.patch({ filterModelsByPlan: value });
	}
	setLang(value) {
		this.patch({ lang: value });
	}
	addAccount() {
		const id = `account-${Date.now()}`;
		const accounts = [...this.stateValue.accounts, {
			id,
			label: `Account ${this.stateValue.accounts.length + 2}`,
			apiKey: "",
			apiKeyEnv: "",
			showKey: false
		}];
		this.patch({ accounts });
	}
	removeAccount(id) {
		const accounts = this.stateValue.accounts.filter((a) => a.id !== id);
		this.patch({ accounts });
	}
	resetField(field) {
		const defaults = {
			apiBase: "",
			workingDir: "",
			requestTimeoutMs: "",
			streamIdleTimeoutMs: "",
			modelsCachePath: ""
		};
		if (field in defaults) this.edit(field, defaults[field]);
	}
	validate() {
		const errors = {};
		const { apiBase, requestTimeoutMs, streamIdleTimeoutMs } = this.stateValue;
		if (apiBase && !isValidUrl(apiBase)) errors.apiBase = "invalidApiBase";
		if (requestTimeoutMs && (!Number.isInteger(Number(requestTimeoutMs)) || Number(requestTimeoutMs) <= 0)) errors.requestTimeoutMs = "invalidTimeout";
		if (streamIdleTimeoutMs && (!Number.isInteger(Number(streamIdleTimeoutMs)) || Number(streamIdleTimeoutMs) <= 0)) errors.streamIdleTimeoutMs = "invalidTimeout";
		this.stateValue = {
			...this.stateValue,
			errors
		};
		return Object.keys(errors).length === 0;
	}
	async load() {
		try {
			const section = this.section();
			const apiKeyEnv = typeof section.apiKeyEnv === "string" && section.apiKeyEnv !== "" ? section.apiKeyEnv : DEFAULT_API_KEY_ENV;
			let configured = false;
			try {
				configured = (await this.deps.credentials.describe([apiKeyEnv]))?.[apiKeyEnv]?.configured === true;
			} catch {}
			this.absorbSnapshot(configured);
			this.stateValue = {
				...this.stateValue,
				status: this.scope.getSnapshot().status
			};
			this.emit();
		} catch (error) {
			this.stateValue = {
				...EMPTY_STATE,
				failed: true,
				errorMessage: error instanceof Error ? error.message : String(error)
			};
			this.emit();
		}
	}
	async save() {
		if (!this.validate()) {
			this.stateValue = {
				...this.stateValue,
				failed: true,
				errorMessage: "validation"
			};
			this.emit();
			return;
		}
		this.stateValue = {
			...this.stateValue,
			saving: true,
			saved: false,
			failed: false
		};
		this.emit();
		try {
			const apiKeyEnv = this.stateValue.apiKeyEnv || DEFAULT_API_KEY_ENV;
			if (this.stateValue.apiKey.length > 0) try {
				await this.deps.credentials.set(apiKeyEnv, this.stateValue.apiKey);
				this.stateValue = {
					...this.stateValue,
					apiKey: "",
					apiKeyConfigured: true
				};
			} catch {}
			const fieldWrites = [
				{
					field: "apiKeyEnv",
					value: apiKeyEnv
				},
				{
					field: "apiBase",
					value: this.stateValue.apiBase || void 0
				},
				{
					field: "workingDir",
					value: this.stateValue.workingDir || void 0
				},
				{
					field: "requestTimeoutMs",
					value: this.stateValue.requestTimeoutMs ? Number(this.stateValue.requestTimeoutMs) : void 0
				},
				{
					field: "streamIdleTimeoutMs",
					value: this.stateValue.streamIdleTimeoutMs ? Number(this.stateValue.streamIdleTimeoutMs) : void 0
				},
				{
					field: "filterModelsByPlan",
					value: this.stateValue.filterModelsByPlan
				},
				{
					field: "modelsCachePath",
					value: this.stateValue.modelsCachePath || void 0
				},
				{
					field: "lang",
					value: this.stateValue.lang || void 0
				},
				{
					field: "activeAccount",
					value: this.stateValue.activeAccount || void 0
				},
				{
					field: "accounts",
					value: this.stateValue.accounts.map((a) => ({
						label: a.label,
						apiKeyEnv: a.apiKeyEnv || void 0,
						apiKey: a.apiKey || void 0
					}))
				}
			];
			for (const { field, value } of fieldWrites) if (value === void 0) await this.scope.unset(field);
			else await this.scope.set(field, value);
			this.stateValue = {
				...this.stateValue,
				saving: false,
				saved: true,
				dirty: false,
				anyAccountConfigured: this.stateValue.apiKeyConfigured || this.stateValue.accounts.some((a) => a.apiKey.length > 0 || a.apiKeyEnv.length > 0)
			};
			this.emit();
		} catch (error) {
			this.stateValue = {
				...this.stateValue,
				saving: false,
				failed: true,
				errorMessage: error instanceof Error ? error.message : String(error)
			};
			this.emit();
		}
	}
	discard() {
		this.load();
	}
	dispose() {
		this.disposed = true;
		this.unsubscribeScope();
		this.listeners.clear();
	}
};
function isValidUrl(url) {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}
//#endregion
//#region src/client/usage.ts
/**
* Usage controller. Fetches the usage report on demand and manages
* the selected account tab state.
*/
var CommandCodeUsageController = class {
	remote;
	stateValue = {
		accounts: [],
		loading: false
	};
	listeners = /* @__PURE__ */ new Set();
	disposed = false;
	constructor(remote) {
		this.remote = remote;
	}
	state() {
		return {
			...this.stateValue,
			accounts: [...this.stateValue.accounts]
		};
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	emit() {
		for (const listener of this.listeners) listener();
	}
	async refresh() {
		if (this.stateValue.loading) return;
		this.stateValue = {
			...this.stateValue,
			loading: true,
			error: void 0
		};
		this.emit();
		try {
			const result = await this.remote.report();
			if (!result.ok || !result.data) {
				this.stateValue = {
					...this.stateValue,
					loading: false,
					error: result.error?.message ?? "Failed to fetch usage"
				};
				this.emit();
				return;
			}
			const accounts = result.data.accounts;
			this.stateValue = {
				accounts,
				loading: false,
				lastUpdated: Date.now(),
				selectedAccountId: this.stateValue.selectedAccountId ?? accounts.find((a) => a.active)?.id ?? accounts[0]?.id
			};
			this.emit();
		} catch (error) {
			this.stateValue = {
				...this.stateValue,
				loading: false,
				error: error instanceof Error ? error.message : String(error)
			};
			this.emit();
		}
	}
	selectAccount(id) {
		this.stateValue = {
			...this.stateValue,
			selectedAccountId: id
		};
		this.emit();
	}
	dispose() {
		this.disposed = true;
		this.listeners.clear();
	}
};
//#endregion
//#region src/client/login.ts
const POLL_INTERVAL_MS = 2e3;
/**
* Login controller. Polls the Host login status while a flow is pending.
*/
var CommandCodeLoginController = class {
	remote;
	stateValue = { phase: "idle" };
	listeners = /* @__PURE__ */ new Set();
	pollTimer;
	disposed = false;
	constructor(remote) {
		this.remote = remote;
	}
	state() {
		return { ...this.stateValue };
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	emit() {
		for (const listener of this.listeners) listener();
	}
	async begin() {
		if (this.stateValue.phase === "pending") return;
		this.stateValue = { phase: "pending" };
		this.emit();
		try {
			const result = await this.remote.begin();
			if (!result.ok || !result.data) {
				this.stateValue = {
					phase: "failed",
					failure: "network",
					message: result.error?.message ?? "Failed to start login"
				};
				this.emit();
				return;
			}
			this.stateValue = { ...result.data };
			this.emit();
			if (result.data.authUrl) window.open(result.data.authUrl, "_blank", "noopener,noreferrer");
			this.startPolling();
		} catch (error) {
			this.stateValue = {
				phase: "failed",
				failure: "network",
				message: error instanceof Error ? error.message : String(error)
			};
			this.emit();
		}
	}
	async cancel() {
		this.stopPolling();
		try {
			await this.remote.cancel();
		} catch {}
		this.stateValue = { phase: "idle" };
		this.emit();
	}
	startPolling() {
		this.stopPolling();
		this.pollTimer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
	}
	stopPolling() {
		if (this.pollTimer !== void 0) {
			clearInterval(this.pollTimer);
			this.pollTimer = void 0;
		}
	}
	async poll() {
		if (this.disposed || this.stateValue.phase !== "pending") {
			this.stopPolling();
			return;
		}
		try {
			const result = await this.remote.status();
			if (result.ok && result.data) {
				this.stateValue = { ...result.data };
				this.emit();
				if (result.data.phase !== "pending") this.stopPolling();
			}
		} catch {}
	}
	dispose() {
		this.disposed = true;
		this.stopPolling();
		this.listeners.clear();
	}
};
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
//#region src/client/version.ts
/** Plugin version, kept in sync with package.json. */
const PLUGIN_VERSION = "1.1.1";
//#endregion
//#region src/client/section.tsx
/**
* Command Code settings page — a React component rendered in the DSH-Desktop
* settings section. Covers:
* - Connection config (API key, API base, working dir)
* - Quick login (browser OAuth)
* - Advanced settings (timeouts, model filter, cache path, language)
* - Multi-account management
* - Usage & plan display (per-account tabs)
*/
function CommandCodeSettingsPage(props) {
	const { t } = props;
	const settings = props.useCommandCodeSettings((s) => s);
	const usage = props.useCommandCodeUsage((s) => s);
	const login = props.useCommandCodeLogin((s) => s);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "cc-section",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
				className: "cc-title",
				children: t("title")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "cc-intro",
				children: t("intro")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cc-card",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-field",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cc-fieldHead",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									className: "cc-label",
									htmlFor: "cc-api-key",
									children: t("apiKeyLabel")
								}), settings.apiKeyConfigured && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-badge",
									children: t("cardConfigured")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								id: "cc-api-key",
								className: `cc-input ${settings.errors.apiKey ? "cc-inputInvalid" : ""}`,
								type: "password",
								value: settings.apiKey,
								placeholder: settings.apiKeyConfigured ? t("apiKeyConfiguredPlaceholder") : t("apiKeyPlaceholder"),
								onChange: (e) => props.edit("apiKey", e.target.value),
								autoComplete: "off",
								spellCheck: false
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cc-hint",
								children: t("apiKeyHint")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-field",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cc-fieldHead",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									className: "cc-label",
									htmlFor: "cc-api-base",
									children: t("apiBaseLabel")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "cc-reset",
									onClick: () => props.resetField("apiBase"),
									disabled: !settings.apiBase,
									children: t("reset")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								id: "cc-api-base",
								className: `cc-input ${settings.errors.apiBase ? "cc-inputInvalid" : ""}`,
								type: "url",
								value: settings.apiBase,
								placeholder: t("apiBasePlaceholder"),
								onChange: (e) => props.edit("apiBase", e.target.value),
								spellCheck: false
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cc-hint",
								children: t("apiBaseHint")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-field",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "cc-fieldHead",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-label",
									children: t("loginTitle")
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cc-hint",
								children: t("loginHint")
							}),
							login.phase === "idle" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "cc-input cc-loginBtn",
								onClick: () => props.beginLogin(),
								children: t("loginButton")
							}),
							login.phase === "pending" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cc-loginPending",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-loginBusy",
									children: t("loginPending")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "cc-reset",
									onClick: () => props.cancelLogin(),
									children: t("loginCancel")
								})]
							}),
							login.phase === "success" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cc-loginDone",
								children: t("loginSuccess")
							}),
							login.phase === "failed" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: "cc-loginError",
								children: [
									t("loginFailed"),
									": ",
									login.message ?? ""
								]
							})
						]
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cc-usageCard",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cc-usageHead",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "cc-usageTitle",
							children: t("usageTitle")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "cc-usageMetaSpacer" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageHeadMeta, { usage }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "cc-usageRefresh",
							onClick: () => props.refreshUsage(),
							disabled: usage.loading,
							children: usage.loading ? t("usageRefreshing") : t("usageRefresh")
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageDisplay, {
					usage,
					onSelectAccount: props.selectUsageAccount,
					t
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cc-card",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cc-field",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-fieldHead",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "cc-label",
							children: t("accountsTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							className: "cc-reset",
							onClick: () => props.addAccount(),
							children: ["+ ", t("addAccount")]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cc-hint",
						children: t("accountsIntro")
					})]
				}), settings.accounts.map((account) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cc-field",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-fieldHead",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "cc-input cc-accountLabel",
							value: account.label,
							placeholder: t("accountLabelPlaceholder"),
							onChange: (e) => props.editAccountLabel(account.id, e.target.value)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "cc-reset",
							onClick: () => props.removeAccount(account.id),
							children: t("removeAccount")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: "cc-input",
						type: account.showKey ? "text" : "password",
						value: account.apiKey,
						placeholder: t("accountKeyPlaceholder"),
						onChange: (e) => props.editAccountKey(account.id, e.target.value),
						autoComplete: "off",
						spellCheck: false
					})]
				}, account.id))]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cc-card",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
					className: "cc-advanced",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", {
						className: "cc-advancedHead",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cc-advancedTitle",
								children: t("advancedTitle")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "cc-advancedSpacer" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "cc-chevron" })
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-advancedBody",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cc-field",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										className: "cc-label",
										htmlFor: "cc-req-timeout",
										children: t("requestTimeoutLabel")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										id: "cc-req-timeout",
										className: `cc-input ${settings.errors.requestTimeoutMs ? "cc-inputInvalid" : ""}`,
										type: "number",
										value: settings.requestTimeoutMs,
										placeholder: "60000",
										onChange: (e) => props.edit("requestTimeoutMs", e.target.value)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "cc-hint",
										children: t("requestTimeoutHint")
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cc-field",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										className: "cc-label",
										htmlFor: "cc-stream-timeout",
										children: t("streamTimeoutLabel")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										id: "cc-stream-timeout",
										className: `cc-input ${settings.errors.streamIdleTimeoutMs ? "cc-inputInvalid" : ""}`,
										type: "number",
										value: settings.streamIdleTimeoutMs,
										placeholder: "300000",
										onChange: (e) => props.edit("streamIdleTimeoutMs", e.target.value)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "cc-hint",
										children: t("streamTimeoutHint")
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cc-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "cc-toggleRow",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										className: "cc-toggle",
										checked: settings.filterModelsByPlan,
										onChange: (e) => props.setFilterModels(e.target.checked)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cc-label",
										children: t("filterModelsLabel")
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "cc-hint",
									children: t("filterModelsHint")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cc-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									className: "cc-label",
									htmlFor: "cc-lang",
									children: t("langLabel")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									id: "cc-lang",
									className: "cc-input",
									value: settings.lang,
									onChange: (e) => props.edit("lang", e.target.value),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "zh",
										children: t("langZh")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "en",
										children: t("langEn")
									})]
								})]
							})
						]
					})]
				})
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cc-footer",
				children: [
					settings.saved && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "cc-saved",
						children: t("saved")
					}),
					settings.failed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "cc-failed",
						children: settings.errorMessage || "Save failed"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "cc-reset",
						onClick: () => props.discard(),
						disabled: !settings.dirty || settings.saving,
						children: t("discard")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "cc-input cc-saveBtn",
						onClick: () => props.save(),
						disabled: settings.saving || !settings.dirty,
						children: settings.saving ? t("saving") : t("save")
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: "cc-version",
				children: [
					t("version"),
					" ",
					PLUGIN_VERSION
				]
			})
		]
	});
}
/** Right side of the usage card head: selected account chip + plan badge. */
function UsageHeadMeta({ usage }) {
	const selected = usage.accounts.find((a) => a.id === usage.selectedAccountId) ?? usage.accounts[0];
	if (selected === void 0 || !selected.configured) return null;
	const name = selected.report.account?.userName || selected.report.account?.name || selected.label;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [name !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
		className: "cc-usageAccount",
		children: name
	}), selected.report.plan !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
		className: "cc-usagePlan",
		children: selected.report.plan.name
	})] });
}
function formatTokens(n) {
	if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
	if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
	if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
	return String(Math.round(n));
}
function money(n) {
	return `$${n.toFixed(2)}`;
}
function UsageWindow({ label, used, cap, exceeded, resetAt, t }) {
	const percent = cap > 0 ? Math.min(100, used / cap * 100) : 0;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "cc-usageWindow",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cc-usageWindowHead",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "cc-usageWindowLabel",
						children: label
					}),
					exceeded && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "cc-usageExceeded",
						children: t("usageExceeded")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "cc-usageMetaSpacer" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "cc-usageWindowValue",
						children: [
							money(used),
							" / ",
							money(cap)
						]
					})
				]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cc-usageBar",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: `cc-usageBarFill ${exceeded ? "cc-usageBarFillWarn" : ""}`,
					style: { width: `${percent}%` }
				})
			}),
			resetAt > Date.now() && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
				className: "cc-usageResets",
				children: [
					t("usageResetsAt"),
					" ",
					new Date(resetAt).toLocaleString()
				]
			})
		]
	});
}
function Stat({ label, value, sub }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "cc-stat",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "cc-statLabel",
				children: label
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "cc-statValue",
				children: value
			}),
			sub !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "cc-statSub",
				children: sub
			})
		]
	});
}
function UsageDisplay({ usage, onSelectAccount, t }) {
	if (usage.loading && usage.accounts.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
		className: "cc-usageHint",
		children: t("usageRefreshing")
	});
	if (usage.error !== void 0 && usage.accounts.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
		className: "cc-usageError",
		children: usage.error
	});
	if (usage.accounts.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
		className: "cc-usageHint",
		children: t("usageNoAccounts")
	});
	const selected = usage.accounts.find((a) => a.id === usage.selectedAccountId) ?? usage.accounts[0];
	if (selected === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
		className: "cc-usageHint",
		children: t("usageNoAccounts")
	});
	const report = selected.report;
	const usageStats = report.usage;
	const credits = report.credits;
	const totalTokens = usageStats === void 0 ? 0 : usageStats.totalTokensIn + usageStats.totalTokensOut;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "cc-accountReport",
		children: [
			usage.accounts.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cc-tabs",
				children: usage.accounts.map((account) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					className: `cc-tab ${account.id === selected.id ? "cc-tabActive" : ""}`,
					onClick: () => onSelectAccount(account.id),
					children: [
						account.mark === "rate-limit" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "cc-tabDotWarn" }),
						account.mark === "invalid-credential" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "cc-tabDotError" }),
						account.active && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "cc-tabDotOk" }),
						account.label
					]
				}, account.id))
			}),
			!selected.configured && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "cc-usageHint",
				children: t("usageNoAccounts")
			}),
			selected.configured && report.blocked === "invalid-key" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cc-usageBlocked",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "cc-usageBlockedTitle",
					children: t("usageBlockedInvalidKey")
				})
			}),
			selected.configured && report.blocked === "service-unavailable" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cc-usageBlocked",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "cc-usageBlockedTitle",
					children: t("usageBlockedService")
				})
			}),
			selected.configured && report.blocked === "network" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cc-usageBlocked",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "cc-usageBlockedTitle",
					children: t("usageBlockedNetwork")
				})
			}),
			selected.configured && report.blocked === void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				usageStats !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cc-statGrid",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Stat, {
							label: t("totalRequests"),
							value: String(usageStats.totalCount),
							sub: `${t("usageFailed")} ${usageStats.failedCount}`
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Stat, {
							label: t("successRate"),
							value: `${Math.round(usageStats.successRate)}%`
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Stat, {
							label: t("totalCost"),
							value: `$${usageStats.totalCost.toFixed(4)}`,
							sub: `$${usageStats.totalCredits.toFixed(2)} ${t("usageCreditsUnit")}`
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Stat, {
							label: t("usageTokensLabel"),
							value: formatTokens(totalTokens),
							sub: `${formatTokens(usageStats.totalTokensIn)} ${t("tokensIn")} / ${formatTokens(usageStats.totalTokensOut)} ${t("tokensOut")}`
						})
					]
				}),
				credits !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cc-statGrid",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Stat, {
							label: t("usageMonthly"),
							value: money(credits.monthlyCredits)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Stat, {
							label: t("usagePurchased"),
							value: money(credits.purchasedCredits)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Stat, {
							label: t("usageFree"),
							value: money(credits.freeCredits)
						})
					]
				}),
				credits !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cc-usageWindows",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageWindow, {
						label: t("usage5hWindow"),
						used: credits.fiveHour.used,
						cap: credits.fiveHour.cap,
						exceeded: credits.fiveHour.exceeded,
						resetAt: credits.fiveHour.resetAt,
						t
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageWindow, {
						label: t("usageWeeklyWindow"),
						used: credits.weekly.used,
						cap: credits.weekly.cap,
						exceeded: credits.weekly.exceeded,
						resetAt: credits.weekly.resetAt,
						t
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cc-usageFooter",
					children: [report.plan !== void 0 && report.plan.currentPeriodEnd > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						t("usagePeriodEnds"),
						" ",
						new Date(report.plan.currentPeriodEnd).toLocaleDateString()
					] }), usage.lastUpdated !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						t("usageUpdated"),
						" ",
						new Date(usage.lastUpdated).toLocaleTimeString()
					] })]
				}),
				report.failures.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					className: "cc-usagePartial",
					children: [
						t("usagePartial"),
						": ",
						report.failures.length
					]
				})
			] })
		]
	});
}
//#endregion
//#region src/client/card.tsx
/**
* Command Code provider card — rendered on the Models page for the
* `commandcode` provider. Shows connection status, a quick API key field,
* and a login button.
*/
function CommandCodeProviderCard(props) {
	const { t } = props;
	const settings = props.useCommandCodeSettings((s) => s);
	const login = props.useCommandCodeLogin((s) => s);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "cc-card",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cc-field",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cc-fieldHead",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "cc-label",
						children: t("cardTitle")
					}), settings.apiKeyConfigured || settings.anyAccountConfigured ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "cc-badge",
						children: t("cardConfigured")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "cc-badgeMuted",
						children: t("cardNotConfigured")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "cc-hint",
					children: t("apiKeyHint")
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cc-field",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "cc-fieldHead",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
						className: "cc-label",
						htmlFor: "cc-card-api-key",
						children: t("apiKeyLabel")
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					id: "cc-card-api-key",
					className: "cc-input",
					type: "password",
					value: settings.apiKey,
					placeholder: settings.apiKeyConfigured ? t("apiKeyConfiguredPlaceholder") : t("apiKeyPlaceholder"),
					onChange: (e) => props.edit("apiKey", e.target.value),
					onBlur: () => {
						if (settings.apiKey.length > 0) props.save();
					},
					autoComplete: "off",
					spellCheck: false
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cc-field",
				children: [
					login.phase === "idle" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						className: "cc-input cc-loginBtn",
						onClick: () => props.beginLogin(),
						children: t("loginButton")
					}),
					login.phase === "pending" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-loginPending",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "cc-loginBusy",
							children: t("loginPending")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "cc-reset",
							onClick: () => props.cancelLogin(),
							children: t("loginCancel")
						})]
					}),
					login.phase === "success" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cc-loginDone",
						children: t("loginSuccess")
					}),
					login.phase === "failed" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "cc-loginError",
						children: [
							t("loginFailed"),
							": ",
							login.message ?? ""
						]
					})
				]
			}),
			settings.saved && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "cc-saved",
				children: t("saved")
			})
		]
	});
}
//#endregion
//#region src/client/locales.ts
const zh = {
	nav: "Command Code",
	title: "Command Code 提供商设置",
	intro: "配置 Command Code API 凭证、连接参数和多账户轮换。所有更改即时生效，无需重启。",
	connectionTitle: "连接配置",
	apiKeyLabel: "API Key",
	apiKeyPlaceholder: "输入新的 API Key 以替换",
	apiKeyConfiguredPlaceholder: "已保存（输入新值可替换）",
	apiKeyHint: "也可设置环境变量 COMMANDCODE_API_KEY，或使用下方登录流程自动获取。",
	apiBaseLabel: "API 地址",
	apiBasePlaceholder: "https://api.commandcode.ai",
	apiBaseHint: "默认使用官方 API 地址，自定义部署时修改此项。",
	workingDirLabel: "工作目录",
	workingDirPlaceholder: "默认使用当前进程目录",
	advancedTitle: "高级设置",
	requestTimeoutLabel: "请求超时（毫秒）",
	requestTimeoutHint: "等待响应首字节的最长时间，默认 60000（60秒）。",
	streamTimeoutLabel: "流式空闲超时（毫秒）",
	streamTimeoutHint: "流式响应中允许的最长停顿时间，默认 300000（5分钟）。",
	filterModelsLabel: "按套餐过滤模型",
	filterModelsHint: "隐藏当前套餐不可用的模型。关闭后显示全部模型。",
	cachePathLabel: "模型缓存路径",
	cachePathHint: "模型目录的本地缓存文件路径。",
	accountsTitle: "多账户管理",
	accountsIntro: "配置多个 API Key 以实现自动轮换。遇到 429 限流或 401 失效时自动切换到下一个可用账户。",
	addAccount: "添加账户",
	removeAccount: "移除",
	accountLabelPlaceholder: "账户名称（如：工作号）",
	accountKeyPlaceholder: "API Key",
	accountEnvPlaceholder: "环境变量名（如：COMMANDCODE_API_KEY_2）",
	activeAccount: "当前使用",
	usageTitle: "用量与套餐",
	usageRefresh: "刷新",
	usageRefreshing: "刷新中…",
	usageNoAccounts: "尚未配置账户",
	usageBlockedInvalidKey: "API Key 无效，请检查凭证",
	usageBlockedService: "Command Code 服务暂不可用",
	usageBlockedNetwork: "网络连接失败，请检查网络",
	usagePartial: "部分数据获取失败",
	usageUpdated: "更新于",
	totalRequests: "请求",
	successRate: "成功率",
	totalCost: "花费",
	usageTokensLabel: "Token",
	tokensIn: "入",
	tokensOut: "出",
	usageFailed: "失败",
	usageCreditsUnit: "credits",
	usageMonthly: "月额度",
	usagePurchased: "已购",
	usageFree: "赠送",
	usage5hWindow: "5 小时窗口",
	usageWeeklyWindow: "每周窗口",
	usageResetsAt: "重置于",
	usagePeriodEnds: "账期截止",
	usageExceeded: "已超限",
	loginTitle: "快捷登录",
	loginButton: "使用浏览器登录",
	loginBegin: "开始登录",
	loginCancel: "取消登录",
	loginPending: "正在等待浏览器授权…",
	loginSuccess: "登录成功！凭证已保存。",
	loginFailed: "登录失败",
	loginTimeout: "登录超时，请重试",
	loginCancelled: "登录已取消",
	loginHint: "将在浏览器中打开 Command Code 授权页面，授权后自动保存 API Key。",
	cardTitle: "Command Code",
	cardConfigured: "已配置",
	cardNotConfigured: "未配置",
	cardConfigure: "配置",
	cardUsage: "查看用量",
	cardLogin: "登录",
	invalidApiBase: "API 地址格式不正确",
	invalidTimeout: "超时时间必须为正整数",
	save: "保存",
	saving: "保存中…",
	saved: "已保存",
	discard: "放弃更改",
	reset: "重置为默认",
	version: "版本",
	updateAvailable: "有新版本可用",
	langLabel: "命令语言",
	langZh: "中文",
	langEn: "English"
};
const en = {
	nav: "Command Code",
	title: "Command Code Provider Settings",
	intro: "Configure Command Code API credentials, connection parameters, and multi-account rotation. All changes take effect immediately without restart.",
	connectionTitle: "Connection",
	apiKeyLabel: "API Key",
	apiKeyPlaceholder: "Enter a new API key to replace it",
	apiKeyConfiguredPlaceholder: "Saved (type to replace)",
	apiKeyHint: "You can also set the COMMANDCODE_API_KEY environment variable, or use the login flow below.",
	apiBaseLabel: "API Base URL",
	apiBasePlaceholder: "https://api.commandcode.ai",
	apiBaseHint: "Defaults to the official API. Change this for self-hosted deployments.",
	workingDirLabel: "Working Directory",
	workingDirPlaceholder: "Defaults to process cwd",
	advancedTitle: "Advanced",
	requestTimeoutLabel: "Request Timeout (ms)",
	requestTimeoutHint: "Max time to wait for the first byte. Default: 60000 (60s).",
	streamTimeoutLabel: "Stream Idle Timeout (ms)",
	streamTimeoutHint: "Max stall allowed during streaming. Default: 300000 (5min).",
	filterModelsLabel: "Filter Models by Plan",
	filterModelsHint: "Hide models unavailable on your current plan. Disable to show all.",
	cachePathLabel: "Model Cache Path",
	cachePathHint: "Local cache file for the model catalog.",
	accountsTitle: "Multi-Account",
	accountsIntro: "Configure multiple API keys for automatic rotation. Switches to the next usable account on 429 rate-limit or 401 invalid-credential.",
	addAccount: "Add Account",
	removeAccount: "Remove",
	accountLabelPlaceholder: "Account label (e.g. Work)",
	accountKeyPlaceholder: "API Key",
	accountEnvPlaceholder: "Env var name (e.g. COMMANDCODE_API_KEY_2)",
	activeAccount: "Active",
	usageTitle: "Usage & Plan",
	usageRefresh: "Refresh",
	usageRefreshing: "Refreshing…",
	usageNoAccounts: "No accounts configured",
	usageBlockedInvalidKey: "Invalid API key. Check your credentials.",
	usageBlockedService: "Command Code service is temporarily unavailable",
	usageBlockedNetwork: "Network connection failed. Check your connection.",
	usagePartial: "Some data failed to load",
	usageUpdated: "Updated",
	totalRequests: "Requests",
	successRate: "Success rate",
	totalCost: "Spend",
	usageTokensLabel: "Tokens",
	tokensIn: "in",
	tokensOut: "out",
	usageFailed: "Failed",
	usageCreditsUnit: "credits",
	usageMonthly: "Monthly",
	usagePurchased: "Purchased",
	usageFree: "Bonus",
	usage5hWindow: "5-hour window",
	usageWeeklyWindow: "Weekly window",
	usageResetsAt: "Resets",
	usagePeriodEnds: "Period ends",
	usageExceeded: "Exceeded",
	loginTitle: "Quick Login",
	loginButton: "Login with Browser",
	loginBegin: "Start Login",
	loginCancel: "Cancel",
	loginPending: "Waiting for browser authorization…",
	loginSuccess: "Login successful! Credentials saved.",
	loginFailed: "Login failed",
	loginTimeout: "Login timed out. Please try again.",
	loginCancelled: "Login cancelled",
	loginHint: "Opens the Command Code authorization page in your browser. The API key is saved automatically after authorization.",
	cardTitle: "Command Code",
	cardConfigured: "Configured",
	cardNotConfigured: "Not configured",
	cardConfigure: "Configure",
	cardUsage: "View Usage",
	cardLogin: "Login",
	invalidApiBase: "Invalid API base URL",
	invalidTimeout: "Timeout must be a positive integer",
	save: "Save",
	saving: "Saving…",
	saved: "Saved",
	discard: "Discard",
	reset: "Reset to Default",
	version: "Version",
	updateAvailable: "Update available",
	langLabel: "Command Language",
	langZh: "中文",
	langEn: "English"
};
//#endregion
//#region src/client/sessions.ts
/**
* Friendly image-session error helper.
*
* The harness's image-session gate rejects with a generic
* `model-unavailable` code when the selected model cannot run in an image
* session. This helper recognizes that specific rejection so callers can
* point the user at a Vision-capable Command Code model.
*/
/** Check whether an error is the image-session gate rejection. */
function isImageSessionRejection(error) {
	if (typeof error !== "object" || error === null) return false;
	const e = error;
	if (e.code !== "model-unavailable") return false;
	const message = typeof e.message === "string" ? e.message : "";
	return message.includes("image") || message.includes("vision") || message.includes("session");
}
//#endregion
//#region src/client/index.ts
/** CSS for the settings page and provider card, injected once. */
const PAGE_CSS = `
.cc-section{max-width:760px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:16px;display:flex;padding:8px 0}
.cc-title{margin:0;font-size:20px;font-weight:600;letter-spacing:-0.01em}
.cc-intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:1.6}
.cc-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:14px;padding:4px 18px;transition:border-color .15s ease}
.cc-card:hover{border-color:var(--dsw-alias-border-l1)}
.cc-field{flex-direction:column;gap:6px;padding:14px 0;display:flex}
.cc-field+.cc-field{border-top:1px solid var(--dsw-alias-border-l2)}
.cc-fieldHead{align-items:center;gap:8px;display:flex}
.cc-label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}
.cc-badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:2px 10px;font-size:11px;font-weight:600;line-height:18px}
.cc-badgeMuted{white-space:nowrap;color:var(--dsw-alias-label-tertiary);border-radius:999px;padding:2px 10px;font-size:11px;line-height:18px}
.cc-reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5;transition:color .15s ease}
.cc-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.cc-reset:disabled{cursor:default;opacity:.4}
.cc-input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);height:36px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:10px;padding:0 14px;font-size:13px;line-height:1.5;transition:border-color .15s ease,box-shadow .15s ease;width:100%;box-sizing:border-box}
.cc-input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none;box-shadow:0 0 0 3px var(--dsw-alias-brand-primary, rgba(59,130,246,.15))}
.cc-input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
select.cc-input{appearance:none;-webkit-appearance:none;-moz-appearance:none;box-sizing:border-box;padding-right:36px;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='7' viewBox='0 0 12 7'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%23888f98' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center}
.cc-inputInvalid{border-color:var(--dsw-alias-label-error)}
.cc-invalid{color:var(--dsw-alias-label-error);margin:0;font-size:12px;line-height:1.5}
.cc-advanced{padding:0}
.cc-advancedHead{align-items:center;gap:8px;display:flex;width:100%;padding:14px 0;background:0 0;border:none;cursor:pointer;font:inherit;text-align:left;list-style:none}
.cc-advancedHead::-webkit-details-marker{display:none}
.cc-advancedTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:1.5}
.cc-advancedSpacer{flex:1}
.cc-chevron{flex-shrink:0;border-right:1.5px solid var(--dsw-alias-label-tertiary);border-bottom:1.5px solid var(--dsw-alias-label-tertiary);width:8px;height:8px;margin-right:4px;margin-bottom:2px;transform:rotate(45deg);transition:transform .15s ease}
.cc-advanced[open] .cc-chevron{transform:rotate(-135deg);margin-bottom:-3px}
.cc-advancedBody{flex-direction:column;display:flex}
.cc-advancedBody>.cc-field:first-of-type{border-top:1px solid var(--dsw-alias-border-l2)}
.cc-hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.6}
.cc-footer{justify-content:flex-end;align-items:center;gap:10px;display:flex;padding:8px 0}
.cc-toggleRow{align-items:center;gap:10px;cursor:pointer;display:flex}
.cc-toggle{appearance:none;flex-shrink:0;background:var(--dsw-alias-border-l2);border-radius:999px;width:34px;height:20px;margin:0;cursor:pointer;position:relative;transition:background .15s ease}
.cc-toggle:checked{background:var(--dsw-alias-brand-primary)}
.cc-toggle::after{content:'';background:#fff;border-radius:50%;width:16px;height:16px;position:absolute;top:2px;left:2px;transition:left .15s ease}
.cc-toggle:checked::after{left:16px}
.cc-toggle:disabled{cursor:default;opacity:.4}
.cc-failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5}
.cc-saveBtn{width:auto;padding:0 20px;font-weight:600;background:var(--dsw-alias-brand-primary);color:#fff;border-color:var(--dsw-alias-brand-primary);cursor:pointer}
.cc-saveBtn:hover:not(:disabled){opacity:.9}
.cc-saveBtn:disabled{opacity:.5;cursor:default}
.cc-loginBtn{width:auto;padding:0 16px;font-weight:500;background:var(--dsw-alias-bg-layer-1);cursor:pointer}
.cc-loginBtn:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.cc-loginPending{align-items:center;gap:10px;display:flex}
.cc-loginBusy{color:var(--dsw-alias-label-tertiary);font-size:12px}
.cc-loginDone{color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-secondary));margin:0;font-size:12px;font-weight:500}
.cc-loginError{color:var(--dsw-alias-label-error);margin:0;font-size:12px}
.cc-saved{color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-secondary));margin:0;font-size:12px;font-weight:500}
.cc-accountLabel{max-width:200px}
.cc-usageCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:14px;padding:16px 18px;flex-direction:column;gap:14px;display:flex}
.cc-usageHead{align-items:center;gap:8px;display:flex}
.cc-usageTitle{color:var(--dsw-alias-label-primary);flex:1;margin:0;font-size:15px;font-weight:600;line-height:1.5}
.cc-usageAccount{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:3px 12px;font-size:12px;font-weight:500;line-height:18px}
.cc-usagePlan{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-brand-primary);border-radius:999px;padding:3px 12px;font-size:12px;font-weight:600;line-height:18px}
.cc-usageRefresh{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0 0 0 4px;font-size:12px;line-height:1.5;transition:color .15s ease}
.cc-usageRefresh:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.cc-usageRefresh:disabled{cursor:default;opacity:.4}
.cc-usageHint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}
.cc-usageError{align-items:center;gap:8px;color:var(--dsw-alias-label-error);margin:0;font-size:12px;line-height:1.5;display:flex}
.cc-statGrid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;display:grid}
.cc-stat{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:12px 14px;flex-direction:column;gap:4px;display:flex;min-width:0;transition:border-color .15s ease}
.cc-stat:hover{border-color:var(--dsw-alias-border-l1)}
.cc-statLabel{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.4}
.cc-statValue{color:var(--dsw-alias-label-primary);font-size:20px;font-weight:600;line-height:1.3;letter-spacing:-.01em}
.cc-statSub{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-usageWindows{flex-direction:column;gap:16px;display:flex}
.cc-usageWindow{flex-direction:column;gap:6px;display:flex}
.cc-usageWindowHead{align-items:baseline;gap:8px;display:flex}
.cc-usageWindowLabel{color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;line-height:1.5}
.cc-usageWindowValue{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:1.5;font-variant-numeric:tabular-nums}
.cc-usageResets{color:var(--dsw-alias-label-tertiary);margin:0;font-size:11px;line-height:1.5}
.cc-usageExceeded{color:var(--dsw-alias-label-error);font-size:11px;font-weight:600;line-height:1.5}
.cc-usageBar{overflow:hidden;background:var(--dsw-alias-bg-layer-1);border-radius:999px;height:6px}
.cc-usageBarFill{background:var(--dsw-alias-brand-primary);border-radius:999px;height:100%;transition:width .3s ease}
.cc-usageBarFillWarn{background:var(--dsw-alias-label-error)}
.cc-usageMetaSpacer{flex:1}
.cc-usageFooter{align-items:center;gap:14px;flex-wrap:wrap;display:flex;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.5;font-variant-numeric:tabular-nums}
.cc-usagePartial{color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-secondary));margin:0;font-size:11px;line-height:1.5}
.cc-usageBlocked{border:1px solid var(--dsw-alias-label-error);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:4px}
.cc-usageBlockedTitle{color:var(--dsw-alias-label-error);margin:0;font-size:13px;font-weight:600;line-height:1.5}
.cc-accountReport{flex-direction:column;gap:12px;display:flex}
.cc-tabs{flex-wrap:wrap;gap:6px;display:flex}
.cc-tab{align-items:center;font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:4px 12px;font-size:12px;line-height:18px;display:inline-flex;gap:6px;transition:all .15s ease}
.cc-tab:hover:not(.cc-tabActive){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}
.cc-tabActive{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-3)}
.cc-tabDotOk{background:var(--dsw-alias-brand-primary);border-radius:50%;width:6px;height:6px}
.cc-tabDotWarn{background:#d97706;border-radius:50%;width:6px;height:6px}
.cc-tabDotError{background:var(--dsw-alias-label-error);border-radius:50%;width:6px;height:6px}
.cc-version{margin:4px 0 0;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}
`;
function injectPageCss() {
	if (typeof document === "undefined") return;
	const id = "dsh-commandcode/settings.css";
	if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return;
	const tag = document.createElement("style");
	tag.dataset.plugin = "dsh-commandcode";
	tag.dataset.pluginCss = id;
	tag.textContent = PAGE_CSS;
	document.head.appendChild(tag);
}
const FETCH_TIMEOUT_MS = 15e3;
async function fetchJson(path) {
	const response = await fetch(path, {
		headers: { accept: "application/json" },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
	});
	if (!response.ok) throw new Error(`Host returned HTTP ${response.status} for ${path}`);
	return response.json();
}
function apply(ctx) {
	injectPageCss();
	ctx.effect(() => ctx.locale.register("settings.commandcode", {
		zh,
		en
	}), "dsh-commandcode: page copy");
	const controller = new CommandCodeSettingsController(ctx.settingsScope.bind({ namespace: COMMANDCODE_NS }), { credentials: {
		describe: async (refs) => {
			const result = await ctx.remote.credentials.describe(refs);
			return result.ok ? result.value : void 0;
		},
		set: async (ref, value) => {
			const result = await ctx.remote.credentials.set(ref, value);
			if (!result.ok) throw new Error(result.error.message);
		}
	} });
	ctx.effect(() => () => controller.dispose(), "dsh-commandcode: settings controller");
	const store = createSnapshotStore(controller.state());
	controller.subscribe(() => store.set(controller.state()));
	const usageRemote = { report: async () => {
		try {
			return {
				ok: true,
				data: parseAccountsReport(await fetchJson(USAGE_REPORT_PATH))
			};
		} catch (error) {
			return {
				ok: false,
				error: { message: error instanceof Error ? error.message : String(error) }
			};
		}
	} };
	const loginRemote = {
		begin: () => fetchLoginStatus(LOGIN_BEGIN_PATH),
		status: () => fetchLoginStatus(LOGIN_STATUS_PATH),
		cancel: () => fetchLoginStatus(LOGIN_CANCEL_PATH)
	};
	const usageController = new CommandCodeUsageController(usageRemote);
	ctx.effect(() => () => usageController.dispose(), "dsh-commandcode: usage controller");
	const usageStore = createSnapshotStore(usageController.state());
	usageController.subscribe(() => usageStore.set(usageController.state()));
	usageController.refresh();
	const loginController = new CommandCodeLoginController(loginRemote);
	ctx.effect(() => () => loginController.dispose(), "dsh-commandcode: login controller");
	const loginStore = createSnapshotStore(loginController.state());
	loginController.subscribe(() => loginStore.set(loginController.state()));
	const t = () => ctx.locale.bind("settings.commandcode");
	const injected = () => ({
		hooks: {
			commandCodeSettings: store,
			commandCodeUsage: usageStore,
			commandCodeLogin: loginStore
		},
		edit: (field, text) => controller.edit(field, text),
		resetField: (field) => controller.resetField(field),
		save: () => void controller.save().then(() => {
			const settled = controller.state();
			if (!settled.failed && settled.anyAccountConfigured) usageController.refresh();
		}),
		discard: () => controller.discard(),
		refreshUsage: () => void usageController.refresh(),
		beginLogin: () => void loginController.begin(),
		cancelLogin: () => void loginController.cancel(),
		addAccount: () => controller.addAccount(),
		removeAccount: (id) => controller.removeAccount(id),
		editAccountLabel: (id, text) => controller.editAccountLabel(id, text),
		editAccountKey: (id, text) => controller.editAccountKey(id, text),
		toggleKeyClear: (id) => controller.toggleKeyClear(id),
		setFilterModels: (value) => controller.setFilterModels(value),
		selectUsageAccount: (id) => usageController.selectAccount(id),
		t: (key) => t()(key)
	});
	ctx.slots.inject("settings.section", () => ctx.slots.register({
		name: "settings.section",
		id: "commandcode",
		order: 12,
		label: () => t()("nav"),
		inject: injected
	}, CommandCodeSettingsPage));
	ctx.slots.inject("settings.models.provider-card", () => ctx.slots.register({
		name: "settings.models.provider-card",
		key: "llm-commandcode",
		inject: () => ({
			hooks: {
				commandCodeSettings: store,
				commandCodeLogin: loginStore
			},
			edit: (field, text) => controller.edit(field, text),
			save: () => void controller.save().then(() => {
				const settled = controller.state();
				if (!settled.failed && settled.anyAccountConfigured) usageController.refresh();
			}),
			beginLogin: () => void loginController.begin(),
			cancelLogin: () => void loginController.cancel(),
			t: (key) => t()(key)
		})
	}, CommandCodeProviderCard));
}
async function fetchLoginStatus(path) {
	try {
		return {
			ok: true,
			data: parseLoginStatus(await fetchJson(path))
		};
	} catch (error) {
		return {
			ok: false,
			error: { message: error instanceof Error ? error.message : String(error) }
		};
	}
}
const inject = [
	"slots",
	"locale",
	"connection",
	"remote",
	"remote.credentials",
	"settingsScope"
];
//#endregion
exports.apply = apply;
exports.inject = inject;
exports.isImageSessionRejection = isImageSessionRejection;


return module.exports;
}});
//# sourceMappingURL=client.js.map