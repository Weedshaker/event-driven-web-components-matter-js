// @ts-check
/* global self */

import Matter from '../../dependencies/matter.min.js' // needed for debug render
import MatterWebWorker from './MatterWebWorker.js'

/**
 * Collision category bitmasks for Matter.js bodies.
 * Each category must use a unique power of two.
 * @readonly
 * @enum {number}
 */
export const CollisionCategory = {
  DEFAULT: 0x0001,
  PLAYER: 0x0002,
  ENEMY: 0x0004,
  PROJECTILE: 0x0008,
  ENVIRONMENT: 0x0010,
  ALL: 0xFFFFFFFF
}

/***
 * https://github.com/liabru/matter-js
 * https://brm.io/matter-js/docs/
 * 
 * TODO: do matter physics inside webworker
 *
 * @export
 * @class Matter
 * @type {CustomElementConstructor}
 * @param {any} [options = {namespace=undefined}]
 * @param {*} args
 */
export default class MatterElement extends HTMLElement {
  constructor (options = { namespace: undefined }, ...args) {
    super()

    // set attribute namespace
    if (options.namespace) this.namespace = options.namespace
    else if (!this.namespace) this.namespace = 'matter-'

    this.importMetaUrl = import.meta.url.replace(/(.*\/)(.*)$/, '$1')

    const engineCreateOptions = {
      create: {
        enableSleeping: true, // makes it less accurate
        gravity: {
            x: this.getAttribute('gravity-x') || 0,
            y: this.getAttribute('gravity-y') || 0.1,
            scale: this.getAttribute('gravity-scale') || 0.001
        }
      },
      // todo: how does phaser solve matter world size/walls?
      walls: {
        width: Number(this.globalEventTarget.getAttribute('data-width')) || 1600,
        height: Number(this.globalEventTarget.getAttribute('data-height')) || 1200
      }
    }

    if (this.hasAttribute('debug')) {
      this.worker = new MatterWebWorker(engineCreateOptions)
        // start matter this.engine
        const render = Matter.Render.create({
          element: this.globalEventTarget,
          engine: this.worker.engine,
          options: {
            width: Number(this.globalEventTarget.getAttribute('data-width')) || 1600,
            height: Number(this.globalEventTarget.getAttribute('data-height')) || 1200,
            hasBounds: true,
            wireframes: true,
            showBounds: true,
            showVelocity: true,
            showCollisions: true,
            showAxes: true,
            showPositions: true,
            showAngleIndicator: true
          }
        })
        const style = document.createElement('style')
        style.textContent = /* css */`
          ${this.tagName} {
            --opacity: 0.5;
          }
        `
        this.appendChild(style)
        Matter.Render.run(render)
    } else {
      this.worker = new Worker(`${this.importMetaUrl}./MatterWebWorker.js`, {type: 'module'})
      this.worker.addEventListener('error', error => console.error('MatterWebWorker.js Error:', error))
      this.worker.addEventListener('messageerror', error => console.error('MatterWebWorker.js message deserialization failed:', error))
      this.worker.postMessage({
        type: 'engineCreate',
        options: engineCreateOptions
      })
    }

    let animationFrameId = null
    let bodies = null
    this.worker.onmessage = event => {
      if (!event.data) event.data = event
      switch (event.data.type) {
        case 'afterUpdate':
          bodies = event.data.bodies
          if (!animationFrameId) animationFrameId = self.requestAnimationFrame(timestamp => {
            if (!bodies) return
            //self.bodies = bodies
            bodies.forEach(body => {
              if (!body.isSleeping && !body.isStatic) this.dispatchEvent(new CustomEvent(`${this.namespace}body-${body.bid}`, {
                detail: {
                  /** @type {import('./MatterBodies.js').MatterBody} */
                  body
                },
                bubbles: true,
                cancelable: true,
                composed: true
              }))
            })
            bodies = null
            animationFrameId = null
          })
          break
        case 'addedBody':
          this.dispatchEvent(new CustomEvent(`${this.namespace}added-body-${event.data.body.bid}`, {
            detail: {
              body: event.data.body,
              center: event.data.center
            },
            bubbles: true,
            cancelable: true,
            composed: true
          }))
          break
        case 'sleepStart':
          this.dispatchEvent(new CustomEvent(`${this.namespace}sleep-start-body-${event.data.body.bid}`, {
            detail: {
              body: event.data.body
            },
            bubbles: true,
            cancelable: true,
            composed: true
          }))
          break
        case 'sleepEnd':
          this.dispatchEvent(new CustomEvent(`${this.namespace}sleep-end-body-${event.data.body.bid}`, {
            detail: {
              body: event.data.body
            },
            bubbles: true,
            cancelable: true,
            composed: true
          }))
          break
      }
    }

    this.addBodyEventListener = event => {
      if (event && event.detail && event.detail.args && event.detail.bid && event.detail.method) {
        this.worker.postMessage({
          type: 'addBody',
          args: event.detail.args,
          bid: event.detail.bid,
          method: event.detail.method,
          vertexSets: event.detail.vertexSets,
          radius: event.detail.radius
        })
      }
    }

    this.removeBodyEventListener = event => {
      if (event && event.detail && event.detail.bid) {
        this.worker.postMessage({
          type: 'removeBody',
          bid: event.detail.bid
        })
      }
    }

    this.bodyPointerDownEventListener = event => {
      if (event && event.detail && event.detail.bid) {
        this.worker.postMessage({
          type: 'bodyPointerDown',
          bid: event.detail.bid,
          position: event.detail.position
        })
      }
    }
    this.bodyPointerMoveEventListener = event => {
      this.worker.postMessage({
        type: 'bodyPointerMove',
        position: event.detail.position
      })
    }
    this.bodyPointerUpEventListener = event => {
      this.worker.postMessage({
        type: 'bodyPointerUp'
      })
    }

    const webComponentMap = new Map()
    this.matterBodiesEventListener = async event => {
      // TODO: a separate controller as a factory for the web components is required
      const bodies = []
      event.detail.keys.forEach(async ({key, isSelf, getBody}) => {
        if (isSelf) return
        const body = getBody()
        bodies.push(body)
        let webComponent
        if (webComponentMap.has(key)) {
          webComponent = await webComponentMap.get(key)
        } else if ((webComponent = this.querySelector(`[bid="${body.bid}"]`))) {
          webComponentMap.set(key, Promise.resolve(webComponent))
        } else {
          let resolveWebComponent
          webComponentMap.set(key, new Promise(resolve => (resolveWebComponent = resolve)))
          const module = await import(`${this.importMetaUrl}../atoms/Body.js`)
          webComponent = new module.default
          webComponent.setAttribute('type', 'rectangle')
          webComponent.setAttribute('data-x', body.position.x)
          webComponent.setAttribute('data-y', body.position.y)
          webComponent.setAttribute('bid', body.bid)
          webComponent.setAttribute('uid', body.uid)
          if (body.isStatic) webComponent.setAttribute('is-static', '')
          // TODO: make dynamic width, height, shape
          webComponent.setAttribute('data-width', '50')
          webComponent.setAttribute('data-height', '50')
          this.appendChild(webComponent)
          // @ts-ignore
          resolveWebComponent(webComponent)
        }
      })
      this.worker.postMessage({
        type: 'matterBodies',
        bodies
      })
    }
  }

  connectedCallback () {
    this.globalEventTarget.addEventListener(`${this.namespace}add-body`, this.addBodyEventListener)
    this.globalEventTarget.addEventListener(`${this.namespace}remove-body`, this.removeBodyEventListener)
    this.globalEventTarget.addEventListener(this.getAttribute('wc-body-pointer-down') || 'wc-body-pointer-down', this.bodyPointerDownEventListener)
    this.globalEventTarget.addEventListener(this.getAttribute('wc-body-pointer-move') || 'wc-body-pointer-move', this.bodyPointerMoveEventListener)
    this.globalEventTarget.addEventListener(this.getAttribute('wc-body-pointer-up') || 'wc-body-pointer-up', this.bodyPointerUpEventListener)
    this.globalEventTarget.addEventListener(this.getAttribute('yjs-matter-bodies') || 'yjs-matter-bodies', this.matterBodiesEventListener)
  }

  disconnectedCallback () {
    this.globalEventTarget.removeEventListener(`${this.namespace}add-body`, this.addBodyEventListener)
    this.globalEventTarget.removeEventListener(`${this.namespace}remove-body`, this.removeBodyEventListener)
    this.globalEventTarget.removeEventListener(this.getAttribute('wc-body-pointer-down') || 'wc-body-pointer-down', this.bodyPointerDownEventListener)
    this.globalEventTarget.removeEventListener(this.getAttribute('wc-body-pointer-move') || 'wc-body-pointer-move', this.bodyPointerMoveEventListener)
    this.globalEventTarget.removeEventListener(this.getAttribute('wc-body-pointer-up') || 'wc-body-pointer-up', this.bodyPointerUpEventListener)
    this.globalEventTarget.removeEventListener(this.getAttribute('yjs-matter-bodies') || 'yjs-matter-bodies', this.matterBodiesEventListener)
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
