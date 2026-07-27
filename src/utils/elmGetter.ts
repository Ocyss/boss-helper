// ==UserScript==
// @name         ElementGetter
// @author       cxxjackie
// @version      2.0.0
// @supportURL   https://bbs.tampermonkey.net.cn/thread-2726-1-1.html
// ==/UserScript==

/* eslint-disable */
// @ts-nocheck

const win = document.defaultView || window
const doc = win.document
const listeners = new WeakMap()

const elProto = win.Element.prototype

const matches =
  elProto.matches ||
  elProto.matchesSelector ||
  elProto.webkitMatchesSelector ||
  elProto.mozMatchesSelector ||
  elProto.oMatchesSelector
const MutationObs = win.MutationObserver || win.WebkitMutationObserver || win.MozMutationObserver
function addObserver(target, callback) {
  const observer = new MutationObs((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        callback(mutation.target)
        if (observer.canceled) return
      }
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) callback(node)
        if (observer.canceled) return
      }
    }
  })
  observer.canceled = false
  observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
  })
  return () => {
    observer.canceled = true
    observer.disconnect()
  }
}
function addFilter(target, filter) {
  let listener = listeners.get(target)
  if (!listener) {
    listener = {
      filters: new Set(),
      remove: addObserver(target, (el) => listener.filters.forEach((f) => f(el))),
    }
    listeners.set(target, listener)
  }
  listener.filters.add(filter)
}
function removeFilter(target, filter) {
  const listener = listeners.get(target)
  if (!listener) return
  listener.filters.delete(filter)
  if (!listener.filters.size) {
    listener.remove()
    listeners.delete(target)
  }
}
function query(all, selector, parent, includeParent) {
  const checkParent = includeParent && matches.call(parent, selector)
  if (all) {
    const queryAll = parent.querySelectorAll(selector)
    return checkParent ? [parent, ...queryAll] : [...queryAll]
  }
  return checkParent ? parent : parent.querySelector(selector)
}

function getOne(selector, parent, timeout) {
  return new Promise((resolve) => {
    const node = query(false, selector, parent, false)
    if (node) return resolve(node)
    let timer
    const filter = (el) => {
      const node = query(false, selector, el, true)
      if (node) {
        removeFilter(parent, filter)
        timer && clearTimeout(timer)
        resolve(node)
      }
    }
    addFilter(parent, filter)
    if (timeout > 0) {
      timer = setTimeout(() => {
        removeFilter(parent, filter)
        resolve(null)
      }, timeout)
    }
  })
}

function get<E extends Element = Element>(
  selector: string[],
  ...args: [Element, number] | [number] | [Element] | []
): Promise<E[]>
function get<E extends Element = Element>(
  selector: string,
  ...args: [Element, number] | [number] | [Element] | []
): Promise<E>
function get<E extends Element = Element>(
  selector: string | string[],
  ...args: [Element, number] | [number] | [Element] | []
): Promise<E | E[]> {
  const parent = (typeof args[0] !== 'number' && args.shift()) || doc
  const timeout = args[0] || 0
  if (Array.isArray(selector)) {
    return Promise.all(selector.map((s) => getOne(s, parent, timeout))) as Promise<E[]>
  }
  return getOne(selector, parent, timeout) as Promise<E>
}

function each(
  selector: string,
  ...args:
    | [Element, (elm: Element, isInserted: boolean) => boolean]
    | [(elm: Element, isInserted: boolean) => boolean]
) {
  const parent = (typeof args[0] !== 'function' && args.shift()) || doc

  const callback = args[0] as (elm: Element, isInserted: boolean) => boolean

  const refs = new WeakSet()
  for (const node of query(true, selector, parent, false)) {
    refs.add(node)
    if (callback(node, false) === false) return
  }
  const filter = (el: Element) => {
    for (const node of query(true, selector, el, true)) {
      const _el = node
      if (refs.has(_el)) break
      refs.add(_el)
      if (callback(node, true) === false) {
        return removeFilter(parent, filter)
      }
    }
  }
  addFilter(parent, filter)
}

async function rm(
  selector: string | string[],
  ...args: [Element, number] | [number] | [Element] | []
) {
  if (Array.isArray(selector)) {
    await Promise.all(
      selector.map((s) => {
        get(s, ...args).then((e) => e.remove())
      }),
    )
  } else {
    await get(selector, ...args).then((e) => e.remove())
  }
}
export default {
  get,
  each,
  rm,
}
