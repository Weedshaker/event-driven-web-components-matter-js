// @ts-check

/**
 * initial local state field user
 @typedef {{
  angle: number,
  angularVelocity: number,
  position: {x: number, y: number},
  velocity: { x: number, y: number },
  bid: string,
  uid: string | '',
  isStatic: boolean,
  isSleeping: boolean,
  collisions: {
    bid: string,
    uid: string | undefined,
    isGround: boolean
  }[]
}} YjsBody
*/

import { WebWorker } from '../prototypes/WebWorker.js'

export default class Bodies extends WebWorker() {
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

    this.awarenessChangeEventListenerOnce = event => {
      this.globalEventTarget.removeEventListener(`${this.namespace}websocket-awareness-change`, this.awarenessChangeEventListenerOnce)
      this.globalEventTarget.removeEventListener(`${this.namespace}webrtc-awareness-change`, this.awarenessChangeEventListenerOnce)
      this.globalEventTarget.removeEventListener(`${this.namespace}websocket-awareness-update`, this.awarenessChangeEventListenerOnce)
      this.globalEventTarget.removeEventListener(`${this.namespace}webrtc-awareness-update`, this.awarenessChangeEventListenerOnce)
      this.awarenessChangeEventListenerOnce = () => {}
      this.uidResolve(`b_${JSON.parse(event.detail.uid).uuid}`)
    }

    this.bodiesObserveEventListener = async event => {
      const uid = await this.uid
      const keys = Array.from(event.detail.yjsEvent?.[0]?.changes?.keys || []).reduce((acc, [key]) => {
        if (!event.detail.type.has(key)) return acc
        const yjsBody = event.detail.type.get(key)
        if (yjsBody.uid === uid || yjsBody.ctrl?.uid === uid) return acc
        acc.push(key)
        return acc
      }, [])
      if (keys.length) {
        const uid = await this.uid
        this.dispatchEvent(new CustomEvent(this.getAttribute(`${this.namespace}bodies`) || `${this.namespace}bodies`, {
          detail: {
            keys: keys.map(key => ({
              key,
              isSelf: key === uid,
              getBody: () => event.detail.type.get(key)
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
      // TODO: also sync static bodies
      // TODO: make this more flexible with ctrl. when !event.detail.isSelf && event.detail.body.uid don't just not treat it but make it smarter through ctrl
      // don't deal with other user bodies as well as with static bodies
      const uid = await this.uid
      const isSelf = uid === event.detail.body.uid
      if (!isSelf && (event.detail.body.isStatic || event.detail.body.uid)) return
      let key, yjsBody
      if (isSelf) {
        bodyTransactions.set(event.detail.body.uid || event.detail.body.bid, event.detail.body)
        if (!animationFrameId) animationFrameId = self.requestAnimationFrame(timestamp => _setBody())
      } else if (
        (key = event.detail.body.uid || event.detail.body.bid)
        && (
        !(await this.yMap).type.has(key)
        || !(yjsBody = (await this.yMap).type.get(key)).ctrl
        || yjsBody.ctrl.uid === uid
        || await this.webWorker(detectCollision, event.detail.body.collisions, uid, yjsBody.ctrl.uid)
        || yjsBody.ctrl.timestamp + 1000 < Date.now()
      )) {
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
      // TODO: Decide how to handle !isSelf elements
      const isSelf = await this.uid === event.detail.body.uid
      if (!isSelf) return
      const yMap = (await this.yMap).type
      // TODO: add remove capabilities
      //yMap.remove(event.detail.body.uid || event.detail.body.bid)
    }

    /** @type {(any)=>void} */
    this.uidResolve = map => map
    /** @type {Promise<string>} */
    this.uid = new Promise(resolve => (this.uidResolve = resolve))
    this.uid.then(uid => this.dispatchEvent(new CustomEvent(this.getAttribute(`${this.namespace}self-uid`) || `${this.namespace}self-uid`, {
      detail: {
        uid
      },
      bubbles: true,
      cancelable: true,
      composed: true
    })))

    /** @type {(any)=>void} */
    this.yMapResolve = map => map
    /** @type {Promise<{type: import("../../event-driven-web-components-yjs/src/es/dependencies/yjs").Map, doc: import("../../event-driven-web-components-yjs/src/es/dependencies/yjs").Doc}>} */
    this.yMap = new Promise(resolve => (this.yMapResolve = resolve))
  }

  connectedCallback () {
    this.globalEventTarget.addEventListener(`${this.namespace}websocket-awareness-change`, this.awarenessChangeEventListenerOnce, {once: true})
    this.globalEventTarget.addEventListener(`${this.namespace}webrtc-awareness-change`, this.awarenessChangeEventListenerOnce, {once: true})
    this.globalEventTarget.addEventListener(`${this.namespace}websocket-awareness-update`, this.awarenessChangeEventListenerOnce, {once: true})
    this.globalEventTarget.addEventListener(`${this.namespace}webrtc-awareness-update`, this.awarenessChangeEventListenerOnce, {once: true})
    this.globalEventTarget.addEventListener(`${this.namespace}bodies-observe`, this.bodiesObserveEventListener)
    this.globalEventTarget.addEventListener(`${this.namespace}set-body`, this.setBodyEventListener)
    this.globalEventTarget.addEventListener(`${this.namespace}remove-body`, this.removeBodyEventListener)
    if (this.isConnected) this.connectedCallbackOnce()
  }

  connectedCallbackOnce () {
    this.dispatchEvent(new CustomEvent(`${this.namespace}doc`, {
      detail: {
        command: 'getMap',
        arguments: ['bodies'],
        observe: `${this.namespace}bodies-observe`,
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
    this.globalEventTarget.removeEventListener(`${this.namespace}bodies-observe`, this.bodiesObserveEventListener)
    this.globalEventTarget.removeEventListener(`${this.namespace}set-body`, this.setBodyEventListener)
    this.globalEventTarget.removeEventListener(`${this.namespace}remove-body`, this.removeBodyEventListener)
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
