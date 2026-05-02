import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'
import Player from './views/Player'
import Profile from './views/Profile'
import Settings from './views/Settings'
import './App.css'

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Navigate to="/player" replace />} />
            <Route path="/player" element={<Player />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/player" replace />} />
          </Routes>
        </main>
        <nav className="tab-bar">
          <NavLink to="/player" className="tab">Player</NavLink>
          <NavLink to="/profile" className="tab">Profile</NavLink>
          <NavLink to="/settings" className="tab">Settings</NavLink>
        </nav>
      </div>
    </BrowserRouter>
  )
}
