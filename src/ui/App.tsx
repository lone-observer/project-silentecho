/**
 * Phase 0 placeholder. The text renderer arrives in Phase 1, the diorama in Phase 4.
 */
export function App() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#0E1A1C',
        color: '#F2B155',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        letterSpacing: '0.08em',
      }}
    >
      <h1 style={{ fontWeight: 500, fontSize: 'clamp(1.25rem, 5vw, 2rem)' }}>
        Project Silent Echo
      </h1>
    </main>
  )
}
