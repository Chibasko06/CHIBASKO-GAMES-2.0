import React from 'react'
import { createRoot } from 'react-dom/client'
import Online from '@chibaskogames/chibasko-pong/client'
import Local from '@chibaskogames/chibasko-pong/local'

const state = { phase: 'COUNTDOWN', remainingMs: 3000, width: 1000, height: 600,
  paddleWidth: 16, paddleHeight: 100, inset: 30, radius: 10, leftPaddleY: 250,
  rightPaddleY: 250, ballX: 500, ballY: 300, leftScore: 0, rightScore: 0,
  players: new Map([['left', { side: 'LEFT', username: 'Joueur 1' }], ['right', { side: 'RIGHT', username: 'Joueur 2' }]]) }
const connection = { localPlayerId: 'left', getSession: () => null, getState: () => state,
  getRevision: () => 0, subscribe: () => () => {}, send() {} }
const root = createRoot(document.getElementById('pong-fixture'))
root.render(React.createElement(window.__pongLocal ? Local : Online, window.__pongLocal ? { onExit() {} } : { connection }))
window.__unmountPong = () => root.unmount()
