// @ts-check

import { bodySelectorNamespace } from '../atoms/Body.js'

/**
 * matter.js per tick updated props
 @typedef {{
  angle: number,
  angularVelocity: number,
  bid: string, // bid is not inside the CRDT map value, since key === bid
  collisions: {
    bid: string,
    isGround: boolean
  }[],
  ctrl?: {
    uid: string | '',
    timestamp?: number,
    userControlled?: boolean
  },
  isSleeping: boolean,
  isStatic: boolean,
  position: {x: number, y: number},
  velocity: { x: number, y: number }
}} MatterBody
*/

import { WebWorker } from '../prototypes/WebWorker.js'

export default class MatterBodies extends WebWorker() {
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

    this.bodiesObserveEventListener = async event => {
      const uid = await this.uid
      const keys = Array.from(event.detail.yjsEvent?.[0]?.changes?.keys || []).reduce((acc, [key]) => {
        if (!event.detail.type.has(key)) return acc
        const body = event.detail.type.get(key)
        if (body.ctrl.uid === uid) return acc
        acc.push(key)
        return acc
      }, [])
      if (keys.length) {
        this.dispatchEvent(new CustomEvent(this.getAttribute(`${this.namespace}matter-bodies`) || `${this.namespace}matter-bodies`, {
          detail: {
            keys: keys.map(key => ({
              key,
              isSelf: key === uid,
              getBody: () => ({...event.detail.type.get(key), bid: key})
            }))
          },
          bubbles: true,
          cancelable: true,
          composed: true
        }))
      }
    }

    /** @type {Map<string, any>} */
    const bodyTransactions = new Map()
    let animationFrameId = null
    this.setBodyEventListener = async event => {
      // TODO: also sync static bodies (does WcBodies.js)
      // TODO: make this more flexible with ctrl. when !event.detail.isSelf && event.detail.body.ctrl.uid don't just not treat it but make it smarter through ctrl
      // don't deal with other user bodies as well as with static bodies
      const uid = await this.uid
      const isSelf = event.detail.body.ctrl.userControlled && uid === event.detail.body.ctrl.uid
      if (!isSelf && (event.detail.body.ctrl.userControlled || event.detail.body.isStatic)) return
      const key = event.detail.body.bid
      // bid is already the map key for this body, so we remove this for the CRDT and readd it at getBody
      delete event.detail.body.bid
      let body
      if (isSelf) {
        bodyTransactions.set(key, event.detail.body)
        if (!animationFrameId) animationFrameId = self.requestAnimationFrame(timestamp => _setBody())
      } else if (
        !(await this.yMap).type.has(key)
        || !(body = (await this.yMap).type.get(key)).ctrl.uid
        || body.ctrl.uid === uid
        || await this.webWorker(detectCollision, event.detail.body.collisions, uid, body.ctrl.uid)
        || body.ctrl.timestamp && (body.ctrl.timestamp + 1000 < Date.now())
      ) {
        // all bodies without a uid
        bodyTransactions.set(key, {...event.detail.body, ctrl: {
          uid,
          timestamp: Date.now()
        }})
        if (!animationFrameId) animationFrameId = self.requestAnimationFrame(timestamp => _setBody())
      }
    }
    const detectCollision = (collisions, selfUid, ctrlUid) => {
      return (collisions.some(collision => collision.uid === selfUid) && collisions.every(collision => collision.uid !== ctrlUid))
    }
    const _setBody = async () => {
      if (!bodyTransactions.size) return
      const {type: yMap, doc} = await this.yMap
      doc.transact(() => Array.from(bodyTransactions).forEach(([key, body]) => yMap.set(key, body)))
      bodyTransactions.clear()
      animationFrameId = null
    }

    this.removeBodyEventListener = async event => {
      if (!(await this.yMap).type.has(event.detail.bid)) return
      let body
      if (!(body = (await this.yMap).type.get(event.detail.bid))) return
      if (body.ctrl.userControlled && await this.uid !== body.ctrl.uid) return
      // TODO: decide further rules by event.detail.origin ('yjs' | 'event' | 'preset')
      (await this.yMap).type.delete(event.detail.bid)
    }

    /** @type {(any)=>void} */
    this.uidResolve = map => map
    /** @type {Promise<string>} */
    this.uid = new Promise(resolve => (this.uidResolve = resolve))

    /** @type {(any)=>void} */
    this.yMapResolve = map => map
    // yMap holds MatterBody as value without bid
    /** @type {Promise<{type: import("../../event-driven-web-components-yjs/src/es/dependencies/yjs.js").Map, doc: import("../../event-driven-web-components-yjs/src/es/dependencies/yjs.js").Doc}>} */
    this.yMap = new Promise(resolve => (this.yMapResolve = resolve))
  }

  connectedCallback () {
    this.globalEventTarget.addEventListener(`${this.namespace}websocket-awareness-change`, this.awarenessChangeEventListenerOnce, {once: true})
    this.globalEventTarget.addEventListener(`${this.namespace}webrtc-awareness-change`, this.awarenessChangeEventListenerOnce, {once: true})
    this.globalEventTarget.addEventListener(`${this.namespace}websocket-awareness-update`, this.awarenessChangeEventListenerOnce, {once: true})
    this.globalEventTarget.addEventListener(`${this.namespace}webrtc-awareness-update`, this.awarenessChangeEventListenerOnce, {once: true})
    this.globalEventTarget.addEventListener(`${this.namespace}matter-bodies-observe`, this.bodiesObserveEventListener)
    this.globalEventTarget.addEventListener(`${this.namespace}matter-set-body`, this.setBodyEventListener)
    this.globalEventTarget.addEventListener(`${this.namespace}matter-remove-body`, this.removeBodyEventListener)
    if (this.isConnected) this.connectedCallbackOnce()
  }

  connectedCallbackOnce () {
    this.dispatchEvent(new CustomEvent(`${this.namespace}doc`, {
      detail: {
        command: 'getMap',
        arguments: ['bodies'],
        observe: `${this.namespace}matter-bodies-observe`,
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
    this.globalEventTarget.removeEventListener(`${this.namespace}matter-bodies-observe`, this.bodiesObserveEventListener)
    this.globalEventTarget.removeEventListener(`${this.namespace}matter-set-body`, this.setBodyEventListener)
    this.globalEventTarget.removeEventListener(`${this.namespace}matter-remove-body`, this.removeBodyEventListener)
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
