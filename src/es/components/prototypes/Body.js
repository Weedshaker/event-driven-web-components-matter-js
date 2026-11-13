// @ts-check
/* global self */

/**
 * Constructor options
 @typedef {{
  namespace?: string, // namespace the events dispatched
  bid?: string // every class is going to possess a unique bid,
  accuracy?: number // the fixedTo rounding on css transition values
 }} options
*/

import { Intersection } from './Intersection.js' // new IntersectionObserver controlling attribute 'intersecting'

/**
 * Body is the web component container for any type of html content and reflecting the physics of matter.js
 * Web Component Body does:
 *  - command class Matter regarding physics (../controllers/Matter.js) by dispatching Events: matter-add-body, matter-remove-body, matter-command-body
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
      'collision-filter-category', // controls collision categories, allowed collisions, and group-based collision overrides. default: { category: 0x0001, mask: 0xFFFFFFFF, group: 0 }
      'collision-filter-group',
      'collision-filter-mask',
      'data-height', // number (required for 'rectangle' and 'trapezoid')
      'data-width', // number (required for 'rectangle' and 'trapezoid')
      'data-x', // number (position coordinate)
      'data-y', // number (position coordinate)
      'density', // a number that defines the density of the body (mass per unit area)
      'friction-air', // a number that defines the air friction of the body (air resistance). A value of 0 means the body will never slow as it moves through space
      'friction-static', // controls static friction: how much resistance an object has when another object tries to make it slide while it's at rest
      'friction', // a number that defines the friction of the body. The value is always positive and is in the range (0, 1)
      'inertia', // how difficult it is for an object to rotate
      'is-sensor', // a flag that indicates whether a body is a sensor. Sensor triggers collision events, but doesn't react with colliding body physically
      'is-static', // boolean by hasAttribute
      'mass', // a number that defines the mass of the body
      'radius', // number (required for 'circle' and 'polygon')
      'restitution', // a number that defines the restitution (elasticity) of the body. The value is always positive and is in the range (0, 1
      'sides', // number (required for 'polygon')
      'slope', // number (required for 'trapezoid')
      'timeScale', // controls the speed of time for an individual physics body
      'type' // 'circle' | 'polygon' | 'rectangle' | 'trapezoid'
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
    if (options.accuracy) this.accuracy = options.accuracy
    else if (!this.accuracy) this.accuracy = 2

    // update the css according to the matter.js physics. Also inform through yjs crdt about the changed state as well as when the body starts sleeping
    this.matterBodyEventListener = (event, sleepStart = false) => {
      const body = event.detail.body
      let initiateDoOnIntersectionOnce = () => {
        initiateDoOnIntersectionOnce = () => {}
        this.doOnIntersection = () => {
          this.dispatchEvent(new CustomEvent(this.getAttribute('yjs-set-body') || 'yjs-set-body', {
            detail: {
              /** @type {import('../controllers/YjsBodies.js').YjsBodyTick} */
              body
            },
            bubbles: true,
            cancelable: true,
            composed: true
          }))
          this.doOnIntersection = null
        }
        // trigger the dispatch when attribute intersecting or attribute self, in both cases we want to inform yjs crdt about the changes
        if (this.hasAttribute('intersecting') || this.hasAttribute('self')) this.doOnIntersection()
      }
      if (sleepStart) initiateDoOnIntersectionOnce()
      /*
      // NOTE: transform has better performance than top and left props
      top: ${body.position.y - this.getAttribute('data-height-half')}px;
      left: ${body.position.x - this.getAttribute('data-width-half')}px;
      transform: rotate(${body.angle}rad);
      */
      // NOTE: translate3d is more likely to be handed to gpu than just translate
      const textContent = /* css */`:host {transform: translate3d(${(body.position.x - this.getAttribute('data-width-half')).toFixed(this.accuracy)}px, ${(body.position.y - this.getAttribute('data-height-half')).toFixed(this.accuracy)}px, 0) rotate(${body.angle.toFixed(this.accuracy)}rad);}`
      if (textContent !== this.customStyle.textContent) {
        this.customStyle.textContent = textContent
        initiateDoOnIntersectionOnce()
      }
      // TODO: inform children about const body
    }

    // inform about the last change when body started sleeping
    this.matterSleepStartEventListener = event => {
      this.setAttribute('is-sleeping', 'true')
      this.matterBodyEventListener(event, true)
    }
    this.matterSleepEndEventListener = event => this.setAttribute('is-sleeping', 'false')

    // TODO: get uid from awareness directly or implement user controller
    this.yjsSelfUidEventListener = event => {
      // todo: received uid equals attr uid === self; rethink since self is less important than actively controlled body
      // TODO: has uid === client controller shall be something more flexible for multiple bodies
      this.setAttribute('uid', event.detail.uid)
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
    if (!this.hasAttribute('is-static')) this.setAttribute('is-sleeping', 'false') // initially the body is not sleeping
    if (this.shouldRenderCSS()) this.renderCSS()
    if (this.shouldRenderHTML()) this.renderHTML()
    this.globalEventTarget.addEventListener(`${this.getAttribute('matter-body') || 'matter-body'}-${this.bid}`, this.matterBodyEventListener)
    this.globalEventTarget.addEventListener(`${this.getAttribute('matter-sleep-start-body') || 'matter-sleep-start-body'}-${this.bid}`, this.matterSleepStartEventListener)
    this.globalEventTarget.addEventListener(`${this.getAttribute('matter-sleep-end-body') || 'matter-sleep-end-body'}-${this.bid}`, this.matterSleepEndEventListener)
    // todo: needs to be self only and likely better uuid as additional info
    if (this.hasAttribute('self')) {
      this.globalEventTarget.addEventListener(this.getAttribute('yjs-self-uid') || 'yjs-self-uid', this.yjsSelfUidEventListener)
      this.addEventListener('pointerdown', this.pointerdownEventListener)
      this.addEventListener('pointermove', this.pointermoveEventListener)
      this.addEventListener('pointerup', this.pointerupEventListener)
    } else {
      super.connectedCallback()
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
    // TODO: https://www.brm.io/matter-js/docs/classes/Body.html#method_setParts set and unset parts. when setting parts first remove those part bodies from world, when unset then set them separately to world
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
    this.globalEventTarget.removeEventListener(`${this.getAttribute('matter-sleep-start-body') || 'matter-sleep-start-body'}-${this.bid}`, this.matterSleepStartEventListener)
    this.globalEventTarget.removeEventListener(`${this.getAttribute('matter-sleep-end-body') || 'matter-sleep-end-body'}-${this.bid}`, this.matterSleepEndEventListener)
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
    } else if (name === 'data-width' || name === 'data-height') {
      this.setAttribute('data-width-half', this.getAttribute('data-width') / 2)
      this.setAttribute('data-height-half', this.getAttribute('data-height') / 2)
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
        --height: attr(data-height px);
        --width: attr(data-width px);
        opacity: var(--opacity, 1);
        position: ${this.getAttribute('position') ? this.getAttribute('position') : 'var(--position, absolute)'};
        transform-origin: center;
        transform: translate3d(attr(data-x px), attr(data-y px), 0);
        transition: transform 50ms ease-out;
      }
      :host > section {
        background: ${this.getAttribute('background') ? this.getAttribute('background') : 'var(--background, #111)'};
        height: var(--height);
        width: var(--width);
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
   * @param {number} value
   */
  set accuracy (value) {
    if (value) this.setAttribute('accuracy', value)
  }

  /**
   * @return {number}
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
