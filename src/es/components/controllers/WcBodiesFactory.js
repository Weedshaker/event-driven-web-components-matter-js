// @ts-check
/* global self */

/***
 * Web Component Bodies Factory
 * creates a-body
 *
 * @export
 * @class Factory
 * @type {CustomElementConstructor}
 * @param {any} [options = {namespace=undefined}]
 * @param {*} args
 */
export default class WcBodiesFactory extends HTMLElement {
  constructor (options = { namespace: undefined }, ...args) {
    super()

    // set attribute namespace
    if (options.namespace) this.namespace = options.namespace
    else if (!this.namespace) this.namespace = 'matter-'

    this.importMetaUrl = import.meta.url.replace(/(.*\/)(.*)$/, '$1')

    /** @param {CustomEvent<{keysAction: {key: string, value: 'add' | 'update' | 'delete', getBody: () => {body: import('./WcBodies').WcBody, isSelf: boolean}}[]}>} event */
    this.wcBodiesEventListener = async event => {
      event.detail.keysAction.forEach(async ({key, value, getBody}) => {
        let webComponent
        switch (value) {
          case 'add':
            const {body, isSelf} = getBody()
            if (!isSelf && !this.querySelector(`[bid="${key}"]`)) {
              // TODO: clean up when removing already existing body and/or remove attribute user-controlled
              let prevBody
              if (body.ctrl.userControlled && (prevBody = this.querySelector(`[uid="${body.ctrl.uid}"]`))) prevBody.remove()
              const module = await import(`${this.importMetaUrl}../atoms/Body.js`)
              webComponent = new module.default({bid: key, origin: 'yjs'})
              module.default.objectToAttributes(webComponent, body)
              this.appendChild(webComponent)
            }
            break
          case 'update':
            // TODO: update wc body attributes
            break
          case 'delete':
            if ((webComponent = this.querySelector(`[bid="${key}"]`))) webComponent.remove()
            break
        }
      })
    }
  }

  connectedCallback () {
    // TODO: Listen to controller/users for mutually connected users, so that user-controlled elements are removed when no mutual connection
    this.globalEventTarget.addEventListener(this.getAttribute('yjs-wc-bodies') || 'yjs-wc-bodies', this.wcBodiesEventListener)
  }

  disconnectedCallback () {
    this.globalEventTarget.removeEventListener(this.getAttribute('yjs-wc-bodies') || 'yjs-wc-bodies', this.wcBodiesEventListener)
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
