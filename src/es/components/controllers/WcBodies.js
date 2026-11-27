// @ts-check

import { bodySelectorNamespace } from '../atoms/Body.js'

/**
 * web component attribute controlled props
 @typedef {{
  collisionFilter?: {
    category?: import('./Matter.js').CollisionCategory,
    mask?: import('./Matter.js').CollisionCategory,
    group?: number
  },
  height?: number,
  radius?: number,
  polygon?: string,
  width?: number,
  position?: {x?: number, y?: number},
  density?: number,
  frictionAir?: number,
  frictionStatic?: number,
  friction?: number,
  inertia?: number,
  isSensor: boolean,
  isStatic: boolean,
  mass?: number,
  restitution?: number,
  timeScale?: number,
  type?: 'circle' | 'polygon' | 'rectangle' | string,
  origin?: import('../atoms/Body.js').origin,
  ctrl: {
    uid: string | '',
    userControlled: boolean
  }
}} WcBody
*/

import { WebWorker } from '../prototypes/WebWorker.js'

export default class WcBodies extends WebWorker() {
  /**
   * Creates an instance of yjs users. The constructor will be called for every custom element using this class when initially created.
   *
   * @param {any} [options = {namespace=undefined}]
   * @param {*} args
   */
  constructor (options = { namespace: undefined }, ...args) {
    super()

    // set attribute namespace
    if (options.namespace) this.namespace = options.namespace
    else if (!this.namespace) this.namespace = 'yjs-'

    // TODO: Listen to c-users instead of the awareness events analog Body.js
    this.awarenessChangeEventListenerOnce = event => {
      this.globalEventTarget.removeEventListener(`${this.namespace}websocket-awareness-change`, this.awarenessChangeEventListenerOnce)
      this.globalEventTarget.removeEventListener(`${this.namespace}webrtc-awareness-change`, this.awarenessChangeEventListenerOnce)
      this.globalEventTarget.removeEventListener(`${this.namespace}websocket-awareness-update`, this.awarenessChangeEventListenerOnce)
      this.globalEventTarget.removeEventListener(`${this.namespace}webrtc-awareness-update`, this.awarenessChangeEventListenerOnce)
      this.awarenessChangeEventListenerOnce = () => {}
      this.uidResolve(`${bodySelectorNamespace}${JSON.parse(event.detail.uid).uuid}`)
    }

    this.bodiesObserveEventListener = event => {
      // Array.from Map with key (bid) and value {action: "add" | "update" | "delete" | etc. see yjs doc}
      const keysAction = Array.from(event.detail.yjsEvent?.[0]?.changes?.keys || []).reduce((acc, [key, value]) => {
        acc.push([key, value.action])
        return acc
      }, [])
      if (keysAction.length) {
        this.dispatchEvent(new CustomEvent(this.getAttribute(`${this.namespace}wc-bodies`) || `${this.namespace}wc-bodies`, {
          detail: {
            // todo: action instead of value
            keysAction: keysAction.map(([key, value]) => ({
              key,
              value,
              getBody: () => event.detail.type.get(key) // have bid on matter body for making event.data.bodies delivered to web worker matter digestible
            }))
          },
          bubbles: true,
          cancelable: true,
          composed: true
        }))
      }
    }

    /** @type {Map<string, any>} */
    const addTransactions = new Map()
    let animationFrameId = null
    /** @param {CustomEvent<{body: WcBody, bid: string, origin: import('../atoms/Body.js').origin}>} event */
    this.addBodyEventListener = async event => {
      if (['yjs'].includes(event.detail.origin)) return
      if ((await this.yMap).type.has(event.detail.bid)) return
      if (event.detail.body.ctrl.userControlled && await this.uid !== event.detail.body.ctrl.uid) return
      addTransactions.set(event.detail.bid, event.detail.body)
      if (!animationFrameId) animationFrameId = self.requestAnimationFrame(timestamp => _updateMap())
    }

    let removeTransactions = []
    /** @param {CustomEvent<{bid: string, origin: import('../atoms/Body.js').origin}>} event */
    this.removeBodyEventListener = async event => {
      if (['yjs'].includes(event.detail.origin)) return
      if (!(await this.yMap).type.has(event.detail.bid)) return
      let body
      if (!(body = (await this.yMap).type.get(event.detail.bid))) return
      if (body.ctrl.userControlled && await this.uid !== body.ctrl.uid) return
      removeTransactions.push(event.detail.bid)
      if (!animationFrameId) animationFrameId = self.requestAnimationFrame(timestamp => _updateMap())
    }

    const _updateMap = async () => {
      if (!addTransactions.size && !removeTransactions.length) return
      const {type: yMap, doc} = await this.yMap
      doc.transact(() => {
        Array.from(addTransactions).forEach(([key, body]) => yMap.set(key, body))
        removeTransactions.forEach(key => yMap.delete(key))
      })
      addTransactions.clear()
      removeTransactions = []
      animationFrameId = null
    }

    /** @type {(any)=>void} */
    this.uidResolve = map => map
    /** @type {Promise<string>} */
    this.uid = new Promise(resolve => (this.uidResolve = resolve))

    /** @type {(any)=>void} */
    this.yMapResolve = map => map
    /** @type {Promise<{type: import("../../event-driven-web-components-yjs/src/es/dependencies/yjs.js").Map, doc: import("../../event-driven-web-components-yjs/src/es/dependencies/yjs.js").Doc}>} */
    this.yMap = new Promise(resolve => (this.yMapResolve = resolve))
  }

  connectedCallback () {
    this.globalEventTarget.addEventListener(`${this.namespace}websocket-awareness-change`, this.awarenessChangeEventListenerOnce, {once: true})
    this.globalEventTarget.addEventListener(`${this.namespace}webrtc-awareness-change`, this.awarenessChangeEventListenerOnce, {once: true})
    this.globalEventTarget.addEventListener(`${this.namespace}websocket-awareness-update`, this.awarenessChangeEventListenerOnce, {once: true})
    this.globalEventTarget.addEventListener(`${this.namespace}webrtc-awareness-update`, this.awarenessChangeEventListenerOnce, {once: true})
    this.globalEventTarget.addEventListener(`${this.namespace}wc-bodies-observe`, this.bodiesObserveEventListener)
    this.globalEventTarget.addEventListener(`${this.namespace}wc-add-body`, this.addBodyEventListener)
    this.globalEventTarget.addEventListener(`${this.namespace}wc-remove-body`, this.removeBodyEventListener)
    if (this.isConnected) this.connectedCallbackOnce()
  }

  connectedCallbackOnce () {
    this.dispatchEvent(new CustomEvent(`${this.namespace}doc`, {
      detail: {
        command: 'getMap',
        arguments: ['wc-bodies'],
        observe: `${this.namespace}wc-bodies-observe`,
        observeDeep: true,
        resolve: this.yMapResolve
      },
      bubbles: true,
      cancelable: true,
      composed: true
    }))
    this.connectedCallbackOnce = () => {}
  }

  disconnectedCallback () {
    this.globalEventTarget.removeEventListener(`${this.namespace}websocket-awareness-change`, this.awarenessChangeEventListenerOnce)
    this.globalEventTarget.removeEventListener(`${this.namespace}webrtc-awareness-change`, this.awarenessChangeEventListenerOnce)
    this.globalEventTarget.removeEventListener(`${this.namespace}websocket-awareness-update`, this.awarenessChangeEventListenerOnce)
    this.globalEventTarget.removeEventListener(`${this.namespace}webrtc-awareness-update`, this.awarenessChangeEventListenerOnce)
    this.globalEventTarget.removeEventListener(`${this.namespace}wc-bodies-observe`, this.bodiesObserveEventListener)
    this.globalEventTarget.removeEventListener(`${this.namespace}wc-add-body`, this.addBodyEventListener)
    this.globalEventTarget.removeEventListener(`${this.namespace}wc-remove-body`, this.removeBodyEventListener)
  }

  /**
   * The namespace is prepended to the custom event names
   * priority of value appliance: options, attribute
   *
   * @param {string} value
   */
  set namespace (value) {
    if (value) this.setAttribute('namespace', value)
  }

  /**
   * @return {string}
   */
  get namespace () {
    // @ts-ignore
    return this.getAttribute('namespace')
  }

  get globalEventTarget () {
    // @ts-ignore
    return this._globalEventTarget || (this._globalEventTarget = self.Environment?.activeRoute || document.body)
  }
}
