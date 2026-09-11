// Centralized configuration
require('dotenv').config();

module.exports = {
  jwt: {
    secret: process.env.JWT_SECRET || 'jiuchong-gongque-secret-2026',
    expiresIn: '7d'
  },
  server: {
    port: process.env.PORT || 3000
  },
  turnstile: {
    secret: process.env.TURNSTILE_SECRET || null
  },
  data: {
    dir: 'data',
    file: 'game.json'
  }
};