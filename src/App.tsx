import './App.css'

function App() {
  return (
    <main className="garden">
      <div className="garden-icon">🌱</div>
      <h1 className="garden-title">Friendship Garden</h1>
      <p className="garden-subtitle">
        Your garden starts empty — you choose who belongs here.
      </p>
      <div className="garden-use">
        <p>Everything stays on your device.</p>
        <p>Private by default.</p>
      </div>
      <button
        className="add-friend-button"
        type="button"
      >
        Add your first friend
      </button>
    </main>
  )
}

export default App
