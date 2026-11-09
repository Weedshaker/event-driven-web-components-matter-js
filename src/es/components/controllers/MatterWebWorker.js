// @ts-check
/* global self */

import Matter from '../../dependencies/matter.min.js'

/***
 * https://github.com/liabru/matter-js
 * https://brm.io/matter-js/docs/
 * 
 *
 * @export
 * @class MatterWebWorker
 * @type {CustomElementConstructor}
 */
export default class MatterWebWorker {
  constructor (options) {
    this.importMetaUrl = import.meta.url.replace(/(.*\/)(.*)$/, '$1')

    try {
      // @ts-ignore
      if (globalThis instanceof WorkerGlobalScope) self.addEventListener('message', this.postMessage)
    } catch (error) {
      console.info('MatterWebWorker is running in main threat due to debugging')
    }

    // start matter engine
    this.engine = Matter.Engine.create(options.create)
    // TODO: fix the wall and dimension stuff
    const WALL = 50
    const height = options.walls.height
    const width = options.walls.width
    // TODO: set walls through the general function which adds props like collisions
    const walls = [
      Matter.Bodies.rectangle(width / 2, height + WALL / 2, width, WALL, { isStatic: true, collisions: [] }),
      Matter.Bodies.rectangle(width / 2, -WALL / 2, width, WALL, { isStatic: true, collisions: [] }),
      Matter.Bodies.rectangle(-WALL / 2, height / 2, WALL, height, { isStatic: true, collisions: [] }),
      Matter.Bodies.rectangle(width + WALL / 2, height / 2, WALL, height, { isStatic: true, collisions: [] })
    ]
    Matter.Composite.add(this.engine.world, walls)
    this.beforeUpdateFuncs = []
    this.canUpdate = true
    Matter.Events.on(this.engine, 'beforeUpdate', () => {
      this.canUpdate = false
      const updatedBodies = this.beforeUpdateFuncs.map(func => func())
      this.beforeUpdateFuncs = []
    })
    Matter.Events.on(this.engine, 'afterUpdate', () => {
      this.onmessage({
        type: 'afterUpdate',
        bodies: this.engine.world.bodies.map(body => ({
          angle: body.angle,
          angularVelocity: body.angularVelocity,
          position: body.position,
          velocity: body.velocity,
          bid: body.bid,
          uid: body.uid,
          isStatic: body.isStatic,
          isSleeping: body.isSleeping,
          collisions: body.collisions
        }))
      })
      this.canUpdate = true
    })
    Matter.Events.on(this.engine, 'collisionStart', event => {
      for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair
        if (bodyA.isSensor || bodyB.isSensor) continue
        bodyA.collisions.unshift({
          bid: bodyB.bid,
          uid: bodyB.uid,
          isGround: pair.collision.normal.y < -0.5
        })
        bodyB.collisions.unshift({
          bid: bodyA.bid,
          uid: bodyA.uid,
          isGround: pair.collision.normal.y > 0.5
        })
      }
    })
    const spliceCollision = (collisions, bid) => {
      const index = collisions.findIndex(collision => collision.bid === bid)
      if (index !== -1) collisions.splice(index, 1)
    }
    Matter.Events.on(this.engine, 'collisionEnd', event => {
      for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair
        spliceCollision(bodyA.collisions, bodyB.bid)
        spliceCollision(bodyB.collisions, bodyA.bid)
        if (bodyA.isSleeping && !bodyA.collisions.some(collision => collision.isGround)) Matter.Sleeping.set(bodyA, false)
        if (bodyB.isSleeping && !bodyB.collisions.some(collision => collision.isGround)) Matter.Sleeping.set(bodyB, false)
      }
    })

    this.oidToMatterIdMap = new Map()
    this.addBodyEventListener = event => {
      const body = Matter.Bodies.rectangle(...event.data.shape)
      Matter.Events.on(body, 'sleepStart', event => {
        if (body.isStatic) return
        if (!body.collisions.some(collision => collision.isGround)) Matter.Sleeping.set(body, false)
      })
      Matter.Composite.add(this.engine.world, body)
      this.oidToMatterIdMap.set(event.data.bid, body.id)
    }

    // TODO: on remove also remove this body as a collision!
    // this.removeBodyEventListener = event => {
    //   let webComponent = null
    //   if (event && event.detail && (webComponent = event.detail.webComponent) && typeof webComponent.body?.then === 'function') {
    //     this.matterEnginePromise.then(([Matter, engine]) => {
    //       webComponent.body.then(body => Matter.Composite.remove(engine.world, body))
    //     })
    //   }
    // }

    this.tick(() => {
      if (this.canUpdate) Matter.Engine.update(this.engine)
    })
  }

  tick (func, time, keepRunning = true) {
    this._isRunning = keepRunning
    func(time)
    if (this._isRunning) self.requestAnimationFrame(time => this.tick(func, time))
  }

  // this is the onmessage listener within the web worker but called postMessage from the outside
  postMessage = event => {
    if (!event.data) event.data = event
    switch (event.data.type) {
      case 'yjsBodies':
        event.data.bodies.forEach(yjsBody => {
          if (this.oidToMatterIdMap.has(yjsBody.bid)) this.beforeUpdateFuncs.push(() => {
            const body = Matter.Composite.get(this.engine.world, this.oidToMatterIdMap.get(yjsBody.bid), 'body')
            if (!body) return null
            if (body.angle !== yjsBody.angle) Matter.Body.setAngle(body, yjsBody.angle)
            if (body.angularVelocity !== yjsBody.angularVelocity) Matter.Body.setAngularVelocity(body, yjsBody.angularVelocity)
            if (body.position.x !== yjsBody.position.x || body.position.y !== yjsBody.position.y) Matter.Body.setPosition(body, yjsBody.position)
            if (body.velocity !== yjsBody.velocity) Matter.Body.setVelocity(body, yjsBody.velocity)
            if (body.isStatic !== yjsBody.isStatic) Matter.Body.setStatic(body, yjsBody.isStatic)
            if (body.isSleeping !== yjsBody.isSleeping) Matter.Sleeping.set(body, yjsBody.isSleeping)
            return body
          })
        })
        break
      case 'addBody':
        this.addBodyEventListener(event)
        break
      case 'bodyPointerDown':
        if (this.dragConstraint) Matter.Composite.remove(this.engine.world, this.dragConstraint)
        const bodyA = Matter.Composite.get(this.engine.world, this.oidToMatterIdMap.get(event.data.bid), 'body')
        if (!bodyA) return
        this.dragConstraint = Matter.Constraint.create({
          bodyA,
          pointA: {
            x: event.data.position.x - bodyA.position.x,
            y: event.data.position.y - bodyA.position.y
          },
          pointB: event.data.position,
          stiffness: 0.2,
          damping: 0.1,
          length: 0
        })
        Matter.Composite.add(this.engine.world, this.dragConstraint)
        break
      case 'bodyPointerMove':
        if (!this.dragConstraint) return
        this.dragConstraint.pointB.x = event.data.position.x
        this.dragConstraint.pointB.y = event.data.position.y
        break
      case 'bodyPointerUp':
        if (!this.dragConstraint) return
        Matter.Composite.remove(this.engine.world, this.dragConstraint)
        this.dragConstraint = null
        break
    }
  }

  // this is the postMessage function within the web worker but called onmessage from the outside
  onmessage (message) {
    self.postMessage(message)
  }
}

try {
  // @ts-ignore
  if (globalThis instanceof WorkerGlobalScope) self.addEventListener('message', event => new MatterWebWorker(event.data.options), {once: true})
} catch (error) {}
