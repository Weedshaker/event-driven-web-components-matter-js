// @ts-check
/* global self */

import Matter from '../../dependencies/matter.min.js'
import MatterWebWorker from './MatterWebWorker.js'

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
          if (!animationFrameId) animationFrameId = self.requestAnimationFrame(timestamp => _dispatchEvent())
          break
      }
    }
    const _dispatchEvent = () => {
      if (!bodies) return
      this.dispatchEvent(new CustomEvent(`${this.namespace}bodies`, {
        detail: {
          bodies
        },
        bubbles: true,
        cancelable: true,
        composed: true
      }))
      bodies = null
      animationFrameId = null
    }

    this.addBodyEventListener = event => {
      let webComponent = null
      if (event && event.detail && (webComponent = event.detail.webComponent) && webComponent.hasAttribute('bid')) {
        // add a reference pointing to the webComponent
        this.worker.postMessage({
          type: 'addBody',
          bid: webComponent.getAttribute('bid'),
          shape: MatterElement.getRectangle(webComponent)
        })
      }
    }

    this.removeBodyEventListener = event => {
      /*let webComponent = null
      if (event && event.detail && (webComponent = event.detail.webComponent) && typeof webComponent.body?.then === 'function') {
        webComponent.body.then(body => Matter.Composite.remove(this.engine.world, body))
      }*/
    }

    this.bodyPointerDownEventListener = event => {
      let webComponent = null
      if (event && event.detail && (webComponent = event.detail.webComponent)) {
        this.worker.postMessage({
          type: 'bodyPointerDown',
          bid: webComponent.getAttribute('bid') || '',
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
    this.yjsBodiesEventListener = async event => {
      const bodies = []
      event.detail.keys.forEach(async ({key, isSelf, getBody}) => {
        if (isSelf) return
        const yjsBody = getBody()
        bodies.push(yjsBody)
        let webComponent
        if (webComponentMap.has(key)) {
          webComponent = await webComponentMap.get(key)
        } else if ((webComponent = yjsBody.uid ? this.querySelector(`[uid="${yjsBody.uid}"]`) : this.querySelector(`[bid="${yjsBody.bid}"]`))) {
          webComponentMap.set(key, Promise.resolve(webComponent))
        } else {
          let resolveWebComponent
          webComponentMap.set(key, new Promise(resolve => (resolveWebComponent = resolve)))
          const module = await import(`${this.importMetaUrl}../bodies/Rectangle.js`)
          webComponent = new module.default
          webComponent.setAttribute('x', yjsBody.position.x)
          webComponent.setAttribute('y', yjsBody.position.y)
          webComponent.setAttribute('bid', yjsBody.bid)
          webComponent.setAttribute('uid', yjsBody.uid)
          webComponent.setAttribute('is-static', yjsBody.isStatic)
          // TODO: make dynamic width, height, shape
          webComponent.setAttribute('width', '50')
          webComponent.setAttribute('height', '50')
          this.appendChild(webComponent)
          // @ts-ignore
          resolveWebComponent(webComponent)
        }
      })
      this.worker.postMessage({
        type: 'yjsBodies',
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
    this.globalEventTarget.addEventListener(this.getAttribute('yjs-bodies') || 'yjs-bodies', this.yjsBodiesEventListener)
  }

  disconnectedCallback () {
    this.globalEventTarget.removeEventListener(`${this.namespace}add-body`, this.addBodyEventListener)
    this.globalEventTarget.removeEventListener(`${this.namespace}remove-body`, this.removeBodyEventListener)
    this.globalEventTarget.removeEventListener(this.getAttribute('wc-body-pointer-down') || 'wc-body-pointer-down', this.bodyPointerDownEventListener)
    this.globalEventTarget.removeEventListener(this.getAttribute('wc-body-pointer-move') || 'wc-body-pointer-move', this.bodyPointerMoveEventListener)
    this.globalEventTarget.removeEventListener(this.getAttribute('wc-body-pointer-up') || 'wc-body-pointer-up', this.bodyPointerUpEventListener)
    this.globalEventTarget.removeEventListener(this.getAttribute('yjs-bodies') || 'yjs-bodies', this.yjsBodiesEventListener)
  }


  /**
   * @param {HTMLElement} webComponent
   * @return {[number, number, number, number, {webComponent:HTMLElement}|any]}
   */
  static getRectangle (webComponent) {
    return [
      Number(webComponent.getAttribute('x')) + Number(webComponent.getAttribute('width')) / 2, // matter.js will use the coordinates for center of body but here we do adjust for top/left
      Number(webComponent.getAttribute('y')) + Number(webComponent.getAttribute('height')) / 2, // matter.js will use the coordinates for center of body but here we do adjust for top/left
      Number(webComponent.getAttribute('width')),
      Number(webComponent.getAttribute('height')),
      // @ts-ignore
      {
        bid: webComponent.getAttribute('bid') || '',
        uid: webComponent.getAttribute('uid') || '',
        restitution: webComponent.getAttribute('restitution') || 0.6,
        friction: webComponent.getAttribute('friction') || 0.1,
        // @ts-ignore
        isStatic: webComponent.isStatic(),
        collisions: []
      }
    ]
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
