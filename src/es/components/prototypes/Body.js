// @ts-check
/* global self */

/**
 * Constructor options
 @typedef {{
  namespace?: string,
  bid?: string // every class is going to possess a unique bid,
  accuracy?: number
 }} options
*/

import { Intersection } from './Intersection.js' // new IntersectionObserver controlling attribute 'intersecting'

/**
 * Body is the web component container for any type of html content and reflecting the physics of matter.js
 * Web Component Body does:
 *  - command class Matter regarding physics (../controllers/Matter.js) by dispatching Events: matter-add-body, matter-remove-body
 *  - command class Matter regarding physics drag (../controllers/Matter.js) by dispatching Events: wc-body-pointer-down, wc-body-pointer-move, wc-body-pointer-up
 *  - command class Bodies regarding yjs CRDT synchronization (../controllers/Bodies.js) by dispatching Events: yjs-set-body, yjs-remove-body
 *  - reflect physics from Event: matter-bodies, dispatched by class Matter (../controllers/Matter.js), through CSS by the matter-body coordinates (transform: translate3d(x, y, rotate))
 *
 * @export
 * @function Body
 * @param {CustomElementConstructor} ChosenHTMLElement
 * @return {CustomElementConstructor | *}
 */
export class Body extends Intersection() {
  static get observedAttributes () {
    return [
      'height', // number (required for 'rectangle' and 'trapezoid')
      'is-static', // boolean by hasAttribute
      'radius', // number (required for 'circle' and 'polygon')
      'sides', // number (required for 'polygon')
      'slope', // number (required for 'trapezoid')
      'type', // ['circle', 'polygon', 'rectangle', 'trapezoid']
      'width', // number (required for 'rectangle' and 'trapezoid')
      'x', // number (position coordinate)
      'y' // number (position coordinate)
    ]
  }
  
  /**
   * Creates an instance of Body. The constructor will be called for every custom element using this class when initially created.
   *
   * @param {options} [options = {namespace=undefined, bid=undefined}]
   * @param {*} args
   */
  constructor (options = { namespace: undefined, bid: undefined, accuracy: undefined }, ...args) {
    super({ intersectionObserverInit: {rootMargin: '0px 0px 0px 0px'} }, ...args)

    // set attribute namespace
    if (options.namespace) this.namespace = options.namespace
    else if (!this.namespace) this.namespace = 'wc-body-'

    // unique body id used to identify at yjs and matter.js
    if (options.bid) this.bid = options.bid
    else if (!this.bid) this.bid = `b_${self.crypto.randomUUID()}`

    // The accuracy for the css number values at transform translate3d toFixed
    let accuracy = 0
    if (options.accuracy) accuracy = options.accuracy
    else if (!accuracy) accuracy = 2

    // TODO: continue here...
    this.matterBodyEventListener = event => {
      let body
      if (body = event.detail.body) {
        this.body = body
        const sleepingChanged = this.getAttribute('is-sleeping') !== String(body.isSleeping)
        if (sleepingChanged) this.setAttribute('is-sleeping', body.isSleeping)
        /*
        // NOTE: transform has better performance than top and left props
        top: ${body.position.y - this.getAttribute('half-height')}px;
        left: ${body.position.x - this.getAttribute('half-width')}px;
        transform: rotate(${body.angle}rad);
        */
        // NOTE: translate3d is more likely to be handed to gpu than just translate
        const textContent = /* css */`
          :host {
            transform: translate3d(${(body.position.x - this.getAttribute('half-width')).toFixed(accuracy)}px, ${(body.position.y - this.getAttribute('half-height')).toFixed(accuracy)}px, 0) rotate(${body.angle.toFixed(accuracy)}rad);
          }
        `
        if (sleepingChanged || textContent !== this.customStyle.textContent) {
          this.customStyle.textContent = textContent
          this.doOnIntersection = () => {
            this.dispatchEvent(new CustomEvent(this.getAttribute('yjs-set-body') || 'yjs-set-body', {
              detail: {
                /** @type {import('../controllers/Bodies.js').YjsBody} */
                body: {
                  angle: body.angle,
                  angularVelocity: body.angularVelocity,
                  position: body.position,
                  velocity: body.velocity,
                  bid: this.bid,
                  uid: this.getAttribute('uid') || body.uid || '',
                  isStatic: this.isStatic() || body.isStatic || false,
                  isSleeping: body.isSleeping,
                  collisions: body.collisions
                }
              },
              bubbles: true,
              cancelable: true,
              composed: true
            }))
            this.doOnIntersection = null
          }
          if (this.hasAttribute('intersecting') || this.hasAttribute('self')) this.doOnIntersection()
        }
      }
    }

    this.matterSleepStartEventListener = async event => {
      //if (event.detail.body === await this.body) this.globalEventTarget.removeEventListener(`${this.getAttribute('matter-body') || 'matter-body'}-${this.bid}`, this.matterBodyEventListener)
    }
    this.matterSleepEndEventListener = async event => {
      //if (event.detail.body === await this.body) this.globalEventTarget.addEventListener(`${this.getAttribute('matter-body') || 'matter-body'}-${this.bid}`, this.matterBodyEventListener)
    }

    this.yjsSelfUidEventListener = event => {
      // TODO: has uid === client controller shall be something more flexible for multiple bodies
      this.setAttribute('uid', event.detail.uid)
      this.setAttribute('bid', event.detail.uid)
      this.globalEventTarget.addEventListener(`${this.getAttribute('matter-body') || 'matter-body'}-${this.bid}`, this.matterBodyEventListener)
      // the dispatch must be after rendering
      this.dispatchEvent(new CustomEvent(this.getAttribute('matter-add-body') || 'matter-add-body', {
        detail: {
          webComponent: this
        },
        bubbles: true,
        cancelable: true,
        composed: true
      }))
    }

    this.pointerdownEventListener = event => {
      if (!this.body) return
      this.setPointerCapture(event.pointerId)
      this.dispatchEvent(new CustomEvent(`${this.namespace}pointer-down`, {
        detail: {
          webComponent: this,
          position: {x: event.clientX, y: event.clientY}
        },
        bubbles: true,
        cancelable: true,
        composed: true
      }))
    }
    this.pointermoveEventListener = event => {
      if (!this.hasPointerCapture(event.pointerId)) return
      this.dispatchEvent(new CustomEvent(`${this.namespace}pointer-move`, {
        detail: {
          position: {x: event.clientX, y: event.clientY}
        },
        bubbles: true,
        cancelable: true,
        composed: true
      }))
    }
    this.pointerupEventListener = event => {
      this.dispatchEvent(new CustomEvent(`${this.namespace}pointer-up`, {
        bubbles: true,
        cancelable: true,
        composed: true
      }))
      if (this.hasPointerCapture(event.pointerId)) this.releasePointerCapture(event.pointerId)
    }
  }

  connectedCallback () {
    if (this.shouldRenderCSS()) this.renderCSS()
    if (this.shouldRenderHTML()) this.renderHTML()
    this.globalEventTarget.addEventListener(this.getAttribute('matter-sleep-start') || 'matter-sleep-start', this.matterSleepStartEventListener)
    this.globalEventTarget.addEventListener(this.getAttribute('matter-sleep-end') || 'matter-sleep-end', this.matterSleepEndEventListener)
    // todo: needs to be self only and likely better uuid as additional info
    if (this.hasAttribute('self')) {
      this.globalEventTarget.addEventListener(this.getAttribute('yjs-self-uid') || 'yjs-self-uid', this.yjsSelfUidEventListener)
      this.addEventListener('pointerdown', this.pointerdownEventListener)
      this.addEventListener('pointermove', this.pointermoveEventListener)
      this.addEventListener('pointerup', this.pointerupEventListener)
    } else {
      super.connectedCallback()
      // TODO: Use other targets than document body, Environment.globalEventTarget or such...
      this.globalEventTarget.addEventListener(`${this.getAttribute('matter-body') || 'matter-body'}-${this.bid}`, this.matterBodyEventListener)
      // the dispatch must be after rendering
      this.dispatchEvent(new CustomEvent(this.getAttribute('matter-add-body') || 'matter-add-body', {
        detail: {
          webComponent: this
        },
        bubbles: true,
        cancelable: true,
        composed: true
      }))
    }
  }

  disconnectedCallback () {
    // must be dispatched from body, since this element dies before it can dispatch
    this.globalEventTarget.dispatchEvent(new CustomEvent(this.getAttribute('matter-remove-body') || 'matter-remove-body', {
      detail: {
        webComponent: this
      },
      bubbles: true,
      cancelable: true,
      composed: true
    }))
    this.dispatchEvent(new CustomEvent(this.getAttribute('yjs-remove-body') || 'yjs-remove-body', {
      detail: {
        body: {
          isSelf: this.hasAttribute('self'),
          bid: this.bid
        }
      },
      bubbles: true,
      cancelable: true,
      composed: true
    }))
    this.globalEventTarget.removeEventListener(`${this.getAttribute('matter-body') || 'matter-body'}-${this.bid}`, this.matterBodyEventListener)
    this.globalEventTarget.removeEventListener(this.getAttribute('matter-sleep-start') || 'matter-sleep-start', this.matterSleepStartEventListener)
    this.globalEventTarget.removeEventListener(this.getAttribute('matter-sleep-end') || 'matter-sleep-end', this.matterSleepEndEventListener)
    if (this.hasAttribute('self')) {
      this.globalEventTarget.removeEventListener(this.getAttribute('yjs-self-uid') || 'yjs-self-uid', this.yjsSelfUidEventListener)
      this.removeEventListener('pointerdown', this.pointerdownEventListener)
      this.removeEventListener('pointermove', this.pointermoveEventListener)
      this.removeEventListener('pointerup', this.pointerupEventListener)
    } else {
      super.disconnectedCallback()
    }
  }

  attributeChangedCallback (name, oldValue, newValue) {
    if (name === 'is-static') {
      //this.body.then(body => (body.isStatic = this.isStatic()))
    } else if (name === 'width' || name === 'height') {
      this.setAttribute('half-width', this.getAttribute('width') / 2)
      this.setAttribute('half-height', this.getAttribute('height') / 2)
    }
  }

  intersectionCallback (entries, observer) {
    if (this.areEntriesIntersecting(entries)) {
      this.setAttribute('intersecting', '')
      if (this.doOnIntersection) this.doOnIntersection()
      return
    }
    this.removeAttribute('intersecting')
  }

  /**
  * evaluates if a render is necessary
  *
  * @return {boolean}
  */
  shouldRenderCSS () {
    return !this.root.querySelector(`${this.cssSelector} > style[_css]`)
  }

  /**
   * evaluates if a render is necessary
   *
   * @return {boolean}
   */
  shouldRenderHTML () {
    return !this.section
  }

  /**
  * renders the css
  *
  * @return {void}
  */
  renderCSS () {
    this.css = /* css */`
      :host, :host * {
        -webkit-user-drag: none;
        user-select: none;
      }
      :host(:not([intersecting]):not([self])) > section {
        display: none;
      }
      :host([self]) {
        cursor: ${this.getAttribute('cursor') ? this.getAttribute('cursor') : 'var(--cursor, move)'};
        transition: none;
      }
      :host([is-sleeping=false]) {
        will-change: transform;
      }
      :host {
        position: ${this.getAttribute('position') ? this.getAttribute('position') : 'var(--position, absolute)'};
        transform-origin: center;
        opacity: var(--opacity, 1);
        transition: transform 50ms ease-out;
      }
      :host, :host > section {
        height: ${this.getAttribute('height') ? this.getAttribute('height') + 'px' : '5px'};
        width: ${this.getAttribute('width') ? this.getAttribute('width') + 'px' : '5px'};
      }
      :host, :host > section {
        background: ${this.getAttribute('background') ? this.getAttribute('background') : 'var(--background, #111)'};
      }
    `
  }

  /**
   * Render HTML
   * @returns Promise<void>
   */
  renderHTML () {
    this.html = /* html */`<section></section>`
    this.html = this.customStyle
    this.copyPropertiesToAttributes()
  }

  copyPropertiesToAttributes () {
    const bodyBoundingClientRect = this.getBoundingClientRect()
    if (!this.hasAttribute('x')) this.setAttribute('x', bodyBoundingClientRect.x)
    if (!this.hasAttribute('y')) this.setAttribute('y', bodyBoundingClientRect.y)
    if (!this.hasAttribute('width')) this.setAttribute('width', bodyBoundingClientRect.width)
    if (!this.hasAttribute('height')) this.setAttribute('height', bodyBoundingClientRect.height)
  }

  /**
   * @return {boolean}
   */
  isStatic () {
    return this.hasAttribute('is-static') && this.getAttribute('is-static') !== 'false'
  }

  get section () {
    return this.root.querySelector('section')
  }

  get customStyle () {
    return (
      this._customStyle ||
        (this._customStyle = (() => {
          const style = document.createElement('style')
          style.setAttribute('protected', 'true')
          return style
        })())
    )
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

  /**
   * The body id (bid) is the unique reference for this body used throughout the whole application from yjs CRDT until matter.js
   *
   * @param {string} value
   */
  set bid (value) {
    if (value) this.setAttribute('bid', value)
  }

  /**
   * @return {string}
   */
  get bid () {
    // @ts-ignore
    return this.getAttribute('bid')
  }

  /**
   * The accuracy for the css number values at transform translate3d toFixed
   *
   * @param {string} value
   */
  set accuracy (value) {
    if (value) this.setAttribute('accuracy', value)
  }

  /**
   * @return {string}
   */
  get accuracy () {
    // @ts-ignore
    return this.getAttribute('accuracy')
  }

  get globalEventTarget () {
    // @ts-ignore
    return this._globalEventTarget || (this._globalEventTarget = self.Environment?.activeRoute || document.body)
  }
}
