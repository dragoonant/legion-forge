import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// M0 placeholder: the start screen and battle client are ported from legacy/ in M3 (docs/spec/05-migration.md).
function App() {
  return (
    <main style={{ color: '#dfe6f0', fontFamily: "'Segoe UI', system-ui, sans-serif", padding: 24 }}>
      <h1 style={{ color: '#ffd166' }}>Legion Forge</h1>
      <p>Unofficial, non-commercial fan project. Engine in progress.</p>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
