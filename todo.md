
https://github.com/Weedshaker/MatterDom
https://docs.yjs.dev/api/y.doc
https://brm.io/matter-js/docs/classes/Body.html
https://bennettfeely.com/clippy/

fix bodySelectorNamespace 'b_' to also have directly the uid


--------



const camera = {
  following: true,

  deadZone: {
    left: 200,
    right: 200,
    top: 150,
    bottom: 150
  }
};


function updateCamera(target) {
  if (!camera.following) return;

  const { scrollLeft, scrollTop } = viewport;
  const { clientWidth, clientHeight } = viewport;

  const left   = scrollLeft + camera.deadZone.left;
  const right  = scrollLeft + clientWidth - camera.deadZone.right;
  const top    = scrollTop + camera.deadZone.top;
  const bottom = scrollTop + clientHeight - camera.deadZone.bottom;

  let x = scrollLeft;
  let y = scrollTop;

  if (target.x < left) {
    x = target.x - camera.deadZone.left;
  } else if (target.x + target.width > right) {
    x = target.x + target.width
      - clientWidth
      + camera.deadZone.right;
  }

  if (target.y < top) {
    y = target.y - camera.deadZone.top;
  } else if (target.y + target.height > bottom) {
    y = target.y + target.height
      - clientHeight
      + camera.deadZone.bottom;
  }

  viewport.scrollLeft = x;
  viewport.scrollTop = y;
}


camera.following = false;
camera.following = true;


















----------------------------------------------------------






<div class="viewport">
  <div class="world">
    <div class="matter-object"></div>
    <div class="matter-object"></div>
    ...
  </div>
</div>
.viewport {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: auto;
}

.world {
  position: relative;
  width: 5000px;
  height: 5000px;
}

.matter-object {
  position: absolute;
}

+-----------------------------------------+
|                                         |
|       +-----------------------+         |
|       |                       |         |
|       |       DEAD ZONE       |         |
|       |                       |         |
|       +-----------------------+         |
|                                         |
+-----------------------------------------

viewport.scrollLeft
viewport.scrollTop

or

viewport
  └── world
       ├── object
       ├── object
       └── object

camera = { x, y, zoom }
world.transform = camera transform
?


class DOMCamera {
  constructor(viewport) {
    this.viewport = viewport;

    this.deadZone = {
      left: 250,
      right: 250,
      top: 150,
      bottom: 150
    };

    this.lerpX = 0.1;
    this.lerpY = 0.1;

    this.target = null;
  }

  follow(body, width = 0, height = 0) {
    this.target = {
      body,
      width,
      height
    };
  }

  update() {
    if (!this.target) return;

    const {
      body,
      width,
      height
    } = this.target;

    const x = body.position.x - width / 2;
    const y = body.position.y - height / 2;

    this.followRect({
      x,
      y,
      width,
      height
    });
  }

  followRect(target) {
    const viewport = this.viewport;

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;

    let cameraX = viewport.scrollLeft;
    let cameraY = viewport.scrollTop;

    const left = cameraX + this.deadZone.left;
    const right = cameraX + vw - this.deadZone.right;

    const top = cameraY + this.deadZone.top;
    const bottom = cameraY + vh - this.deadZone.bottom;

    let desiredX = cameraX;
    let desiredY = cameraY;

    if (target.x < left) {
      desiredX = target.x - this.deadZone.left;
    } else if (target.x + target.width > right) {
      desiredX =
        target.x + target.width -
        vw +
        this.deadZone.right;
    }

    if (target.y < top) {
      desiredY = target.y - this.deadZone.top;
    } else if (target.y + target.height > bottom) {
      desiredY =
        target.y + target.height -
        vh +
        this.deadZone.bottom;
    }

    viewport.scrollLeft +=
      (desiredX - cameraX) * this.lerpX;

    viewport.scrollTop +=
      (desiredY - cameraY) * this.lerpY;
  }
}

camera.follow(playerBody);

camera.deadZone = {
  left: 300,
  right: 300,
  top: 200,
  bottom: 200
};

camera.lerpX = 0.1;
camera.lerpY = 0.1;

function tick() {
  Matter.Engine.update(engine);

  renderBodies();

  camera.update();

  requestAnimationFrame(tick);
}


------------

class DOMCamera {
  constructor(viewport) {
    this.viewport = viewport;

    this.deadZone = {
      left: 150,
      right: 150,
      top: 100,
      bottom: 100
    };

    this.lerpX = 1;
    this.lerpY = 1;

    this.target = null;
  }

  follow(target) {
    this.target = target;
  }

  update() {
    if (!this.target) return;

    const viewport = this.viewport;

    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;

    const cameraX = viewport.scrollLeft;
    const cameraY = viewport.scrollTop;

    const targetLeft = this.target.x;
    const targetTop = this.target.y;
    const targetRight = targetLeft + this.target.width;
    const targetBottom = targetTop + this.target.height;

    const left = cameraX + this.deadZone.left;
    const right = cameraX + vw - this.deadZone.right;

    const top = cameraY + this.deadZone.top;
    const bottom = cameraY + vh - this.deadZone.bottom;

    let desiredX = cameraX;
    let desiredY = cameraY;

    if (targetLeft < left) {
      desiredX = targetLeft - this.deadZone.left;
    } else if (targetRight > right) {
      desiredX = targetRight - vw + this.deadZone.right;
    }

    if (targetTop < top) {
      desiredY = targetTop - this.deadZone.top;
    } else if (targetBottom > bottom) {
      desiredY = targetBottom - vh + this.deadZone.bottom;
    }

    viewport.scrollLeft +=
      (desiredX - viewport.scrollLeft) * this.lerpX;

    viewport.scrollTop +=
      (desiredY - viewport.scrollTop) * this.lerpY;
  }
}

const camera = new DOMCamera(viewport);

camera.deadZone = {
  left: 250,
  right: 250,
  top: 150,
  bottom: 150
};

camera.lerpX = 0.1;
camera.lerpY = 0.1;

camera.follow({
  get x() {
    return body.position.x - 25;
  },
  get y() {
    return body.position.y - 25;
  },
  width: 50,
  height: 50
});


function render() {
  updateMatterObjects();

  camera.update();

  requestAnimationFrame(render);
}




---------------------------------------------------------------


const deadZone = {
  left: 200,
  right: 200,
  top: 150,
  bottom: 150
};

function followObject(viewport, object, deadZone) {
  const viewportWidth = viewport.clientWidth;
  const viewportHeight = viewport.clientHeight;

  const cameraLeft = viewport.scrollLeft;
  const cameraTop = viewport.scrollTop;

  const objectLeft = object.x;
  const objectTop = object.y;

  const objectRight = object.x + object.width;
  const objectBottom = object.y + object.height;

  const deadLeft =
    cameraLeft + deadZone.left;

  const deadRight =
    cameraLeft + viewportWidth - deadZone.right;

  const deadTop =
    cameraTop + deadZone.top;

  const deadBottom =
    cameraTop + viewportHeight - deadZone.bottom;

  let newScrollLeft = cameraLeft;
  let newScrollTop = cameraTop;

  if (objectLeft < deadLeft) {
    newScrollLeft -= deadLeft - objectLeft;
  }

  if (objectRight > deadRight) {
    newScrollLeft += objectRight - deadRight;
  }

  if (objectTop < deadTop) {
    newScrollTop -= deadTop - objectTop;
  }

  if (objectBottom > deadBottom) {
    newScrollTop += objectBottom - deadBottom;
  }

  viewport.scrollLeft = newScrollLeft;
  viewport.scrollTop = newScrollTop;
}

function render() {
  // Matter -> DOM
  object.style.left = `${body.position.x}px`;
  object.style.top = `${body.position.y}px`;

  // DOM -> camera
  followObject(
    viewport,
    {
      x: body.position.x - objectWidth / 2,
      y: body.position.y - objectHeight / 2,
      width: objectWidth,
      height: objectHeight
    },
    deadZone
  );
}

camera.startFollow(player);
camera.setDeadzone(400, 300);

---

function clipPathToVertexSets(clipPath, radius) {
  const points = [...clipPath.matchAll(
    /(-?[\d.]+)%\s+(-?[\d.]+)%/g
  )];

  return [
    points.map(([, x, y]) => ({
      x: (parseFloat(x) - 50) * radius / 50,
      y: (parseFloat(y) - 50) * radius / 50
    }))
  ];
}