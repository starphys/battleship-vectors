const maxAcc = 25
const maxVel = 50
const handlerTimeout = 16 // ms
const debug = false

const canvas = document.querySelector('canvas')
const context = canvas.getContext('2d')

canvas.width = 800
canvas.height = 600

function drawBackground () {
  context.beginPath()
  context.strokeStyle = 'white'
  context.strokeRect(0, 0, canvas.width, canvas.height)
}

function drawGameOver () {
  context.beginPath()
  context.fillStyle = 'rgba(100, 100, 100, 0.7)'
  context.fillRect(0, 0, canvas.width, canvas.height)

  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = 'bold 30px Courier New'
  context.fillStyle = 'white'
  context.fillText(game.winner === 'p1' ? 'You got them!' : 'They got you.', canvas.width / 2, canvas.height / 2)
}

function generateRandomSeed () {
  return Math.floor(Math.random() * (2 ** 32))
}

class LCG {
  constructor (seed) {
    this.seed = seed
    this.modulus = 2 ** 32
    this.a = 1664525
    this.c = 1013904223
    this.state = seed
  }

  next () {
    this.state = (this.a * this.state + this.c) % this.modulus
    return this.state / this.modulus
  }

  nextInt (min, max) {
    return Math.floor(this.next() * (max - min)) + min
  }
}

class Shot {
  constructor (center, radius) {
    this.center = center
    this.radius = radius
  }

  draw (player = 'p1') {
    if (debug || player === 'p1') {
      context.beginPath()
      context.arc(this.center.x, this.center.y, this.radius, 0, 360)
      context.strokeStyle = 'white'
      context.stroke()
    }

    this.drawX(player === 'p1' ? 'white' : 'orange')
  }

  drawX (color = 'p1') {
    const length = 10
    context.beginPath()
    context.moveTo(this.center.x - length, this.center.y - length)
    context.lineTo(this.center.x + length, this.center.y + length)
    context.strokeStyle = color
    context.stroke()

    context.beginPath()
    context.moveTo(this.center.x + length, this.center.y - length)
    context.lineTo(this.center.x - length, this.center.y + length)
    context.strokeStyle = color
    context.stroke()
  }

  getRandomPoint (rng) {
    const angle = rng.next() * Math.PI * 2
    return {
      x: this.center.x + Math.cos(angle) * this.radius,
      y: this.center.y + Math.sin(angle) * this.radius
    }
  }

  getRandomPointInBounds (rng) {
    const point = this.getRandomPoint(rng)
    return {
      x: Math.max(0, Math.min(point.x, canvas.width)),
      y: Math.max(0, Math.min(point.y, canvas.height))
    }
  }
}

class Vector {
  constructor (x = 0, y = 0) {
    this.x = x
    this.y = y
  }

  length () {
    return Math.sqrt(this.x * this.x + this.y * this.y)
  }

  normalize () {
    const len = this.length()
    if (len !== 0) {
      this.x /= len
      this.y /= len
    }
    return this
  }

  unitVector () {
    const len = this.length()
    if (len !== 0) {
      return new Vector(this.x / len, this.y / len)
    }
    return new Vector(0, 0)
  }

  add (vector) {
    this.x += vector.x
    this.y += vector.y
    return this
  }

  subtract (vector) {
    this.x -= vector.x
    this.y -= vector.y
    return this
  }

  scale (scalar) {
    this.x *= scalar
    this.y *= scalar
    return this
  }

  copy () {
    return new Vector(this.x, this.y)
  }

  draw (origin = { x: 0, y: 0 }, color = 'white') {
    context.beginPath()
    const angle = Math.atan2(this.y, this.x)
    const length = this.length()
    const head = { x: origin.x + this.x, y: origin.y + this.y }
    context.moveTo(origin.x, origin.y)
    context.lineTo(head.x, head.y)
    context.lineTo(
      head.x - length * 0.5 * Math.cos(angle - Math.PI / 6),
      head.y - length * 0.5 * Math.sin(angle - Math.PI / 6)
    )
    context.moveTo(head.x, head.y)
    context.lineTo(
      head.x - length * 0.5 * Math.cos(angle + Math.PI / 6),
      head.y - length * 0.5 * Math.sin(angle + Math.PI / 6)
    )
    context.strokeStyle = color
    context.stroke()
  }
}

class RuledLine {
  constructor ({ head, tail }) {
    this.head = new Vector(head.x, head.y)
    this.tail = new Vector(tail.x, tail.y)
    this.length = this.head.copy().subtract(this.tail).length()
    this.unit = this.head.copy().subtract(this.tail).normalize()
  }

  draw (tickSpacing = 10, tickLength = 10) {
    context.beginPath()
    context.moveTo(this.tail.x, this.tail.y)
    context.lineTo(this.head.x, this.head.y)
    context.strokeStyle = 'white'
    context.stroke()

    const numTicks = Math.ceil(this.length / tickSpacing)

    for (let i = 0; i < numTicks; i++) {
      const tickSize = i % 5 === 0 ? tickLength : tickLength / 2
      const tickX = this.tail.x + this.unit.x * tickSpacing * (i)
      const tickY = this.tail.y + this.unit.y * tickSpacing * (i)

      const perpX = -this.unit.y
      const perpY = this.unit.x

      // Draw the tick
      context.beginPath()
      context.moveTo(tickX - perpX * tickSize, tickY - perpY * tickSize)
      context.lineTo(tickX + perpX * tickSize, tickY + perpY * tickSize)
      context.strokeStyle = 'white'
      context.stroke()
    }
  }
}

class Player {
  constructor ({ position, velocity, radius, player }) {
    this.position = new Vector(position.x, position.y)
    this.velocity = new Vector(velocity.x, velocity.y)
    this.radius = radius
    this.player = player
  }

  copy () {
    return new Player({
      position: this.position.copy(),
      velocity: this.velocity.copy(),
      radius: this.radius,
      player: this.player
    })
  }

  update ({ acceleration }) {
    acceleration.normalize().scale(maxAcc)

    this.position.add(this.velocity).add(acceleration.scale(0.5))
    this.velocity.add(acceleration)

    if (this.position.x + this.radius >= canvas.width) {
      this.position.x = canvas.width - this.radius
      this.velocity.x = 0
    }

    if (this.position.x - this.radius <= 0) {
      this.position.x = this.radius
      this.velocity.x = 0
    }

    if (this.position.y + this.radius >= canvas.height) {
      this.position.y = canvas.height - this.radius
      this.velocity.y = 0
    }

    if (this.position.y - this.radius <= 0) {
      this.position.y = this.radius
      this.velocity.y = 0
    }
  }

  draw () {
    context.beginPath()
    context.arc(this.position.x, this.position.y, this.radius, 0, 360)
    context.fillStyle = this.player === 'p1' ? 'rgba(255, 0, 0, 0.5)' : 'rgba(0, 0, 255, 0.5)'
    context.fill()

    context.strokeStyle = this.player === 'p1' ? 'rgba(255, 0, 0, 1)' : 'rgba(0, 0, 255, 1)'
    context.stroke()

    this.velocity.draw({ x: this.position.x, y: this.position.y })
  }
}

class StateMachine {
  constructor (initialState) {
    this.states = {
      prompt: ['shoot', 'accelerate', 'analyze'],
      shoot: ['accelerate', 'sync', 'analyze'],
      accelerate: ['shoot', 'sync', 'analyze'],
      sync: ['prompt'],
      analyze: ['shoot', 'accelerate'],
      gameover: []
    }

    this.state = this.states[initialState] ? initialState : 'prompt'
  }

  getState () {
    return this.state
  }

  transition (action) {
    if (action === 'gameover') {
      this.state = 'gameover'
      return
    }

    if (this.states[this.state].includes(action)) {
      this.state = action
    }
  }
}

class UIManager {
  constructor () {
    this.accelerateBtn = document.getElementById('accelerate-btn')
    this.shootBtn = document.getElementById('shoot-btn')
    this.analyzeBtn = document.getElementById('analyze-btn')
    this.acceleratePrompt = document.getElementById('accelerate-prompt')
    this.shootPrompt = document.getElementById('shoot-prompt')
    this.analyzePrompt = document.getElementById('analyze-prompt')
  }

  updateUI (state) {
    // Enable all buttons and hide all prompts
    this.accelerateBtn.disabled = false
    this.shootBtn.disabled = false
    this.analyzeBtn.disabled = false
    this.acceleratePrompt.style.display = 'none'
    this.shootPrompt.style.display = 'none'
    this.analyzePrompt.style.display = 'none'
    canvas.classList.remove('shooting')

    switch (state) {
      case 'prompt':
        break
      case 'shoot':
        this.shootBtn.disabled = true
        this.shootPrompt.style.display = 'block'
        canvas.classList.add('shooting')
        break
      case 'accelerate':
        this.accelerateBtn.disabled = true
        this.acceleratePrompt.style.display = 'block'
        break
      case 'sync':
        // Perform sync actions
        break
      case 'analyze':
        this.analyzeBtn.disabled = true
        this.analyzePrompt.style.display = 'block'
        break
      case 'gameover':
        break
      default:
        break
    }
  }
}

class Game {
  constructor (seed1, seed2) {
    this.seed1 = seed1
    this.seed2 = seed2
    this.p1Moves = [{ state: 'init', data: { seed: seed1 } }]
    this.p2Moves = [{ state: 'init', data: { seed: seed2 } }]
    this.stateMachine = new StateMachine('prompt')
    this.uiManager = new UIManager()

    const rng1 = new LCG(seed1)
    this.p1 = new Player({
      position: {
        x: rng1.nextInt(10, canvas.width - 10),
        y: rng1.nextInt(10, canvas.height - 10)
      },
      velocity: {
        x: rng1.nextInt(0, maxVel + 1),
        y: rng1.nextInt(0, maxVel + 1)
      },
      radius: 10,
      player: 'p1'
    })

    const rng2 = new LCG(seed2)
    this.p2 = new Player({
      position: {
        x: rng2.nextInt(10, canvas.width - 10),
        y: rng2.nextInt(10, canvas.height - 10)
      },
      velocity: {
        x: rng2.nextInt(0, maxVel + 1),
        y: rng2.nextInt(0, maxVel + 1)
      },
      radius: 10,
      player: 'p2'
    })

    this.p1Shots = []
    this.p2Shots = []
    this.winner = ''
    this.aiRNG = new LCG(generateRandomSeed())
  }

  makeMove ({ state, data }) {
    // Record and send move
    this.p1Moves.push({ state, data: { ...data } })
    // Write to peer
  }

  getMoves () {
    // Get from peer
    this.p2Moves.push(this.aiRNG.nextInt(0, 2)
      ? {
          state: 'accelerate',
          data: {
            x: this.aiRNG.nextInt(-canvas.width, canvas.width),
            y: this.aiRNG.nextInt(-canvas.height, canvas.height)
          }
        }
      : {
          state: 'shoot',
          data: this.p2Shots.length > 0
            ? { ...this.p2Shots.at(-1).getRandomPointInBounds(this.aiRNG) }
            : {
                x: this.aiRNG.nextInt(0, canvas.width),
                y: this.aiRNG.nextInt(0, canvas.height)
              }
        })
  }

  computeShots ({ p1Moves, p2Moves, player }) {
    const rng = new LCG(player === 'p1' ? this.seed2 : this.seed1)
    let tempP2

    const p2Positions = p2Moves.map(({ state, data }) => {
      if (state === 'init') {
        tempP2 = new Player({
          position: {
            x: rng.nextInt(10, canvas.width - 10),
            y: rng.nextInt(10, canvas.height - 10)
          },
          velocity: {
            x: rng.nextInt(0, maxVel + 1),
            y: rng.nextInt(0, maxVel + 1)
          },
          radius: 10,
          player: player === 'p1' ? 'p2' : 'p1'
        })
      } else if (state === 'shoot') {
        tempP2.update({ acceleration: new Vector() })
      } else if (state === 'accelerate') {
        tempP2.update({ acceleration: new Vector(data.x, data.y) })
      }

      return tempP2.position.copy()
    })

    if (player === 'p1') { this.p2 = tempP2.copy() }

    const shots = p1Moves.map(({ state, data }, i) => {
      if (state === 'shoot') {
        const dx = data.x - p2Positions[i].x
        const dy = data.y - p2Positions[i].y
        const radius = Math.sqrt(dx * dx + dy * dy)
        if (radius <= 10) { this.winner = player }
        return new Shot({ ...data }, radius)
      }
      return null
    }).filter(x => x)

    return shots
  }

  computeGameState ({ state, data }) {
    this.p1.update({ acceleration: state === 'accelerate' ? new Vector(data.x, data.y) : new Vector() })

    this.p1Shots = this.computeShots({ p1Moves: this.p1Moves, p2Moves: this.p2Moves, player: 'p1' })
    this.p2Shots = this.computeShots({ p1Moves: this.p2Moves, p2Moves: this.p1Moves, player: 'p2' })
  }

  drawShots () {
    this.p1Shots.forEach(shot => shot.draw('p1'))
    this.p2Shots.forEach(shot => shot.draw('p2'))
  }

  changeModes (action) {
    game.stateMachine.transition(action)
    game.uiManager.updateUI(game.stateMachine.getState())
    game.draw()
  }

  update ({ state, data }) {
    if (this.stateMachine.getState() === 'sync') {
      // Perform sync
      this.makeMove({ state, data })
      this.getMoves()

      // Check that everything makes sense before simulation
      this.computeGameState({ state, data })

      if (this.winner === '') {
        this.stateMachine.transition('prompt')
      } else {
        this.stateMachine.transition('gameover')
      }
    }
  }

  draw () {
    context.clearRect(0, 0, canvas.width, canvas.height)

    if (this.winner === '') {
      drawBackground()
      this.p1.draw()
      debug && this.p2.draw()
      this.drawShots()
    } else {
      drawBackground()
      this.p1.draw()
      debug && this.p2.draw()
      this.drawShots()
      drawGameOver(this.winner)
    }
  }
}

function getCanvasCoordinates (event) {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height

  const pos = {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  }

  return pos
}

let wait = false
window.addEventListener('mousemove',
  (e) => {
    if (wait) { return }
    const prevState = game.stateMachine.getState()
    const coord = getCanvasCoordinates(e)
    if (prevState === 'accelerate') {
      const acceleration = new Vector(
        coord.x - game.p1.position.x,
        coord.y - game.p1.position.y
      ).normalize().scale(maxAcc)

      game.draw()
      acceleration.draw({ x: game.p1.position.x, y: game.p1.position.y })
    } else if (prevState === 'analyze' && analyzePoint.x >= 0 && analyzePoint.y >= 0) {
        const ruler = new RuledLine({
            tail: {...analyzePoint},
            head: {...coord}
        })
        game.draw()
        ruler.draw()
    }
    wait = true
    setTimeout(() => { wait = false }, handlerTimeout)
  }
)

document.getElementById('accelerate-btn')
  .addEventListener('click', () => game.changeModes('accelerate'))

document.getElementById('shoot-btn')
  .addEventListener('click', () => game.changeModes('shoot'))

document.getElementById('analyze-btn')
  .addEventListener('click', () => game.changeModes('analyze'))

let analyzePoint = {x: -1, y: -1}
canvas.addEventListener('click',
  (event) => {
    const prevState = game.stateMachine.getState()
    const coord = getCanvasCoordinates(event)

    if (prevState === 'accelerate') {
      game.stateMachine.transition('sync')
      game.update({
        state: prevState,
        data: {
          x: coord.x - game.p1.position.x,
          y: coord.y - game.p1.position.y
        }
      })
    } else if (prevState === 'shoot') {
      game.stateMachine.transition('sync')
      game.update({ state: prevState, data: { ...coord } })
    } else if (prevState === 'analyze') {
      analyzePoint = {...coord}
    } else {
      return
    }

    game.draw()
    game.uiManager.updateUI(game.stateMachine.getState())
  }
)

const game = new Game(generateRandomSeed(), generateRandomSeed())
game.uiManager.updateUI(game.stateMachine.getState())
game.draw()

window.game = game
