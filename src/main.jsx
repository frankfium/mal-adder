import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './ui/App.jsx'

createRoot(document.getElementById('root') || document.body.appendChild(document.createElement('div'))).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)


