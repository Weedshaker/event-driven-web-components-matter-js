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

import { Intersection } from '../prototypes/Intersection.js' // new IntersectionObserver controlling attribute 'intersecting'

/**
 * a uuid can start with alphanumeric char but dom query selector needs an alphabetic first char.
 * 
 * @type {string}
 */
export const bodySelectorNamespace = 'b_'

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
export default class Body extends Intersection() {
  static get observedAttributes () {
    return [
      'collision-filter-category', // controls collision categories, allowed collisions, and group-based collision overrides. default: { category: 0x0001, mask: 0xFFFFFFFF, group: 0 }
      'collision-filter-group',
      'collision-filter-mask',
      'data-height', // number (required for 'rectangle')
      'data-radius', // number (required for 'circle' and 'polygon')
      'data-polygon', // number (required for 'polygon')
      'data-width', // number (required for 'rectangle')
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
      'restitution', // a number that defines the restitution (elasticity) of the body. The value is always positive and is in the range (0, 1
      'timeScale', // controls the speed of time for an individual physics body
      'type' // 'circle' | 'polygon' | 'rectangle'
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
    else if (!this.bid) this.bid = `${bodySelectorNamespace}${self.crypto.randomUUID()}`

    // The accuracy for the css number values at transform translate3d toFixed
    if (options.accuracy) this.accuracy = options.accuracy
    else if (!this.accuracy) this.accuracy = 2

    // update the css according to the matter.js physics. Also inform through yjs crdt about the changed state as well as when the body starts sleeping
    this.matterBodyEventListener = (event, sleepStart = false) => {
      event.stopPropagation()
      const body = event.detail.body
      let initiateDoOnIntersectionOnce = () => {
        initiateDoOnIntersectionOnce = () => {}
        this.doOnIntersection = () => {
          this.dispatchEvent(new CustomEvent(this.getAttribute('yjs-set-body') || 'yjs-set-body', {
            detail: {
              /** @type {import('../controllers/MatterBodies.js').MatterBody} */
              body
            },
            bubbles: true,
            cancelable: true,
            composed: true
          }))
          this.doOnIntersection = null
        }
        // trigger the dispatch when attribute intersecting or attribute self, in both cases we want to inform yjs crdt about the changes
        if (this.hasAttribute('intersecting') || this.hasAttribute('self-controlled')) this.doOnIntersection()
      }
      if (sleepStart) initiateDoOnIntersectionOnce()
      /*
      // NOTE: transform has better performance than top and left props
      top: ${body.position.y - this.getAttribute('data-height-center')}px;
      left: ${body.position.x - this.getAttribute('data-width-center')}px;
      transform: rotate(${body.angle}rad);
      */
      // NOTE: translate3d is more likely to be handed to gpu than just translate
      const textContent = /* css */`:host {transform: translate3d(${(body.position.x - this.getAttribute('data-width-center')).toFixed(this.accuracy)}px, ${(body.position.y - this.getAttribute('data-height-center')).toFixed(this.accuracy)}px, 0) rotate(${body.angle.toFixed(this.accuracy)}rad);}`
      if (textContent !== this.customStyle.textContent) {
        this.customStyle.textContent = textContent
        initiateDoOnIntersectionOnce()
      }
    }

    // inform about the last change when body started sleeping
    this.matterSleepStartEventListener = event => {
      this.setAttribute('is-sleeping', '')
      this.matterBodyEventListener(event, true)
    }
    this.matterSleepEndEventListener = event => this.removeAttribute('is-sleeping')

    this.pointerdownEventListener = event => {
      this.setPointerCapture(event.pointerId)
      this.dispatchEvent(new CustomEvent(`${this.namespace}pointer-down`, {
        detail: {
          bid: this.bid || '',
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

    this.usersEventListener = async event => {
      if (event.detail.selfUser?.uid) {
        this.globalEventTarget.removeEventListener('yjs-users', this.usersEventListener)
        this.setAttribute('uid', `${bodySelectorNamespace}${JSON.parse(event.detail.selfUser.uid).uuid}`)
        this.addBody()
      }
    }
  }

  connectedCallback () {
    if (this.shouldRenderCSS()) this.renderCSS()
    if (this.shouldRenderHTML()) this.renderHTML()
    this.globalEventTarget.addEventListener(`${this.getAttribute('matter-body') || 'matter-body'}-${this.bid}`, this.matterBodyEventListener)
    this.globalEventTarget.addEventListener(`${this.getAttribute('matter-sleep-start-body') || 'matter-sleep-start-body'}-${this.bid}`, this.matterSleepStartEventListener)
    this.globalEventTarget.addEventListener(`${this.getAttribute('matter-sleep-end-body') || 'matter-sleep-end-body'}-${this.bid}`, this.matterSleepEndEventListener)
    // todo: needs to be self only and likely better uuid as additional info
    if (this.hasAttribute('self-controlled')) {
      this.addEventListener('pointerdown', this.pointerdownEventListener)
      this.addEventListener('pointermove', this.pointermoveEventListener)
      this.addEventListener('pointerup', this.pointerupEventListener)
      this.globalEventTarget.addEventListener('yjs-users', this.usersEventListener)
    } else {
      super.connectedCallback() // start intersection observer
      this.addBody()
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
          isSelf: this.hasAttribute('self-controlled'),
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
    if (this.hasAttribute('self-controlled')) {
      this.globalEventTarget.removeEventListener('yjs-users', this.usersEventListener)
      this.removeEventListener('pointerdown', this.pointerdownEventListener)
      this.removeEventListener('pointermove', this.pointermoveEventListener)
      this.removeEventListener('pointerup', this.pointerupEventListener)
    } else {
      super.disconnectedCallback()
    }
  }

  attributeChangedCallback (name, oldValue, newValue) {
    // todo: observedAttributes changed, destroy old matter body and make a new one with current position, angle, velocity, angularVelocity
    // todo: dispatch matter modify + prop; collect all with requestAnimationFrame for multiple attr changes
    if (name === 'is-static') {
      //this.body.then(body => (body.isStatic = this.isStatic()))
    } else if (name === 'data-width' || name === 'data-height') {
      this.setAttribute('data-width-center', (this.getAttribute('data-width') / 2).toFixed(this.accuracy))
      this.setAttribute('data-height-center', (this.getAttribute('data-height') / 2).toFixed(this.accuracy))
    } else if (name === 'data-radius') {
      this.setAttribute('data-width-center', Number(this.getAttribute('data-radius')).toFixed(this.accuracy))
      this.setAttribute('data-height-center', Number(this.getAttribute('data-radius')).toFixed(this.accuracy))
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
      :host([has-error]) {
        color: red;
      }
      :host(:not([intersecting]):not([self-controlled])) > section {
        display: none;
      }
      :host([self-controlled]) {
        cursor: ${this.getAttribute('cursor') ? this.getAttribute('cursor') : 'var(--cursor, move)'};
        transition: none;
      }
      :host(:not([is-sleeping]):not([is-static])) {
        will-change: transform;
      }
      :host {
        /* expl.: --height: attr(data-height px); is not supported by firefox 138 */
        --height: ${this.getAttribute('data-height')}px;
        --width: ${this.getAttribute('data-width')}px;
        --radius: ${this.getAttribute('data-radius')}px;
        opacity: var(--opacity, 1);
        position: ${this.getAttribute('position') ? this.getAttribute('position') : 'var(--position, absolute)'};
        transform-origin: center;
        transform: translate3d(${this.getAttribute('data-x')}px, ${this.getAttribute('data-y')}px, 0);
        transition: transform 50ms ease-out;
      }
      :host > section {
        background: ${this.getAttribute('background') ? this.getAttribute('background') : 'var(--background, #111)'};
        height: var(--height);
        width: var(--width);
      }
      :host(:where([type=circle], [type=polygon])) > section {
        height: calc(var(--radius) * 2);
        width: calc(var(--radius) * 2);
      }
      :host([type=circle]) > section {
        clip-path: circle(50%);
      }
      :host([type=polygon]) > section {
        clip-path: polygon(${this.getAttribute('data-polygon')}); /* not every browser supports using attr() as raw-string */
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
    if (!this.hasAttribute('data-x')) this.setAttribute('data-x', bodyBoundingClientRect.x)
    if (!this.hasAttribute('data-y')) this.setAttribute('data-y', bodyBoundingClientRect.y)
    if (this.getAttribute('type') === 'rectangle' && bodyBoundingClientRect.width && bodyBoundingClientRect.height) {
      if (!this.hasAttribute('data-width')) this.setAttribute('data-width', bodyBoundingClientRect.width.toFixed(this.accuracy))
      if (!this.hasAttribute('data-height')) this.setAttribute('data-height', bodyBoundingClientRect.height.toFixed(this.accuracy))
    } else if ((this.getAttribute('type') === 'circle' || this.getAttribute('type') === 'polygon') && (bodyBoundingClientRect.width || bodyBoundingClientRect.height)) {
      if (!this.hasAttribute('data-radius')) this.setAttribute('data-radius', ((bodyBoundingClientRect.width || bodyBoundingClientRect.height) / 2).toFixed(this.accuracy))
    }
  }

  addBody () {
    // the dispatch must be after rendering
    const {args, method, error, vertexSets, radius} = Body.getMethodAndArgs(this)
    if (error) {
      console.warn((this.section.textContent = error), this)
      this.setAttribute('has-error', '')
    } else {
      this.removeAttribute('has-error')
    }
    this.globalEventTarget.addEventListener(`${this.getAttribute('matter-added-body') || 'matter-added-body'}-${this.bid}`, event => {
      // expect matter to answer with the actual body center calculated from bounds.min before rotation
      const x = event.detail.center.x.toFixed(this.accuracy)
      const y = event.detail.center.y.toFixed(this.accuracy)
      this.setAttribute('data-width-center', x)
      this.setAttribute('data-height-center', y)
      this.css = /* css */`
        :host {
          transform-origin: ${x}px ${y}px;
        }
      `
    }, {once: true})
    this.dispatchEvent(new CustomEvent(this.getAttribute('matter-add-body') || 'matter-add-body', {
      detail: {
        args,
        bid: this.bid,
        method,
        vertexSets,
        radius
      },
      bubbles: true,
      cancelable: true,
      composed: true
    }))
  }

  /**
   * Create the method call to create a matter.js body: https://www.brm.io/matter-js/docs/classes/Bodies.html
   * 
   * @param {Body} webComponent
   * @return {{
   *  args: [number, number, number, number, any] | [number, number, number, any] | [number, number, {x: number, y: number}[], any],
   *  method: 'string',
   *  error: null,
   *  vertexSets?: {x: number, y: number}[],
   *  radius?: number
   * } | {args: null, method: null, error: string, vertexSets?: {x: number, y: number}[], radius?: number}}
   */
  static getMethodAndArgs (webComponent) {
    if (!webComponent.hasAttribute('type')) return {args: null, method: null, error: 'type of shape missing. See https://www.brm.io/matter-js/docs/classes/Bodies.html + src/es/components/controllers/WcBodies.js typedef WcBody types: "circle" | "polygon" | "rectangle" is required'}
    const getOptions = () => {
      // custom properties
      const options = {
        bid: webComponent.getAttribute('bid') || '',
        uid: webComponent.getAttribute('uid') || '',
        collisions: []
      }
      const requireCollisionFilterProp = () => {
        if (!options.collisionFilter) options.collisionFilter = {}
      }
      // Matter.Body properties must only be set if they are available
      if (webComponent.hasAttribute('collision-filter-category')) {
        requireCollisionFilterProp()
        options.collisionFilter.category = webComponent.getAttribute('collision-filter-category')
      }
      if (webComponent.hasAttribute('collision-filter-group')) {
        requireCollisionFilterProp()
        options.collisionFilter.group = Number(webComponent.getAttribute('collision-filter-group'))
      }
      if (webComponent.hasAttribute('collision-filter-mask')) {
        requireCollisionFilterProp()
        options.collisionFilter.mask = Number(webComponent.getAttribute('collision-filter-mask'))
      }
      if (webComponent.hasAttribute('density')) options.density = Number(webComponent.getAttribute('density'))
      if (webComponent.hasAttribute('friction-air')) options.frictionAir = Number(webComponent.getAttribute('friction-air'))
      if (webComponent.hasAttribute('friction-static')) options.frictionStatic = Number(webComponent.getAttribute('friction-static'))
      if (webComponent.hasAttribute('friction')) options.friction = Number(webComponent.getAttribute('friction'))
      if (webComponent.hasAttribute('inertia')) options.inertia = Number(webComponent.getAttribute('inertia'))  
      options.isSensor = webComponent.hasAttribute('is-sensor')
      options.isStatic = webComponent.hasAttribute('is-static')
      if (webComponent.hasAttribute('mass')) options.mass = Number(webComponent.getAttribute('mass'))
      if (webComponent.hasAttribute('restitution')) options.restitution = Number(webComponent.getAttribute('restitution'))
      if (webComponent.hasAttribute('time-scale')) options.timeScale = Number(webComponent.getAttribute('time-scale'))
      // IMPORTANT: don't change initial angle, otherwise the center calculation is going to be off
      return options
    }
    // TODO: check and fix func below
    const clipPathToVertexSets = (clipPath, radius) => {
      radius = Number(radius)
      const num = '(-?\\d*\\.?\\d+)%?'
      return [
        [...clipPath.matchAll(new RegExp(`${num}\\s+${num}`, 'g'))].map(([, x, y]) => ({
          x: (parseFloat(x) - 50) * radius / 50,
          y: (parseFloat(y) - 50) * radius / 50
        }))
      ]
    }
    switch (webComponent.getAttribute('type')) {
      // TODO:  fix circle (circle has no data-width/height so do the css) and do the other shapes plus all data-attributes
      case 'circle':
        if (!webComponent.hasAttribute('data-radius')) return {args: null, method: null, error: 'Radius of circle is missing. See https://www.brm.io/matter-js/docs/classes/Bodies.html + src/es/components/controllers/WcBodies.js typedef WcBody'}
        return {
          args: [
            Number(webComponent.getAttribute('data-x') || 0) + Number(webComponent.getAttribute('data-radius')), // matter.js will use the coordinates for center of body but here we do adjust for top/left
            Number(webComponent.getAttribute('data-y') || 0) + Number(webComponent.getAttribute('data-radius')), // matter.js will use the coordinates for center of body but here we do adjust for top/left
            Number(webComponent.getAttribute('data-radius')),
            getOptions()
          ],
          method: webComponent.getAttribute('type'),
          error: null
        }
      case 'polygon':
        if (!webComponent.hasAttribute('data-radius') || !webComponent.hasAttribute('data-polygon')) return {args: null, method: null, error: 'Radius or polygon of polygon are missing. See https://www.brm.io/matter-js/docs/classes/Bodies.html + src/es/components/controllers/WcBodies.js typedef WcBody'}
        webComponent.setAttribute('data-width-center', 0)
        webComponent.setAttribute('data-height-center', 0)
        const vertexSets = clipPathToVertexSets(webComponent.getAttribute('data-polygon'), webComponent.getAttribute('data-radius'))[0]
        return {
          args: [
            Number(webComponent.getAttribute('data-x') || 0) + Number(webComponent.getAttribute('data-radius')), // matter.js will use the coordinates for center of body but here we do adjust for top/left
            Number(webComponent.getAttribute('data-y') || 0) + Number(webComponent.getAttribute('data-radius')), // matter.js will use the coordinates for center of body but here we do adjust for top/left
            vertexSets,
            getOptions()
          ],
          method: webComponent.getAttribute('type'),
          vertexSets,
          radius: Number(webComponent.getAttribute('data-radius')),
          error: null
        }
      case 'rectangle':
        if (!webComponent.hasAttribute('data-width') || !webComponent.hasAttribute('data-height')) return {args: null, method: null, error: 'Width or height of rectangle are missing. See https://www.brm.io/matter-js/docs/classes/Bodies.html + src/es/components/controllers/WcBodies.js typedef WcBody'}
        return {
          args: [
            Number(webComponent.getAttribute('data-x') || 0) + Number(webComponent.getAttribute('data-width-center')), // matter.js will use the coordinates for center of body but here we do adjust for top/left
            Number(webComponent.getAttribute('data-y') || 0) + Number(webComponent.getAttribute('data-height-center')), // matter.js will use the coordinates for center of body but here we do adjust for top/left
            Number(webComponent.getAttribute('data-width')),
            Number(webComponent.getAttribute('data-height')),
            getOptions()
          ],
          method: webComponent.getAttribute('type'),
          error: null
        }
    }
    return {args: null, method: null, error: 'type of shape not of types: "circle" | "polygon" | "rectangle". See https://www.brm.io/matter-js/docs/classes/Bodies.html + src/es/components/controllers/WcBodies.js typedef WcBody'}
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
