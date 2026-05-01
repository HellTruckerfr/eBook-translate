import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter as BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandledrejection]', e.reason)
  e.preventDefault()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
