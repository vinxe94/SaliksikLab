import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
    LayoutDashboard, BookOpen, Upload, Shield, User, LogOut
} from 'lucide-react'

export default function Sidebar() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <img src="/logo.png" alt="Research Repository" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                <span>SaliksikLab</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                <div className="nav-section">Navigation</div>

                <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <LayoutDashboard size={18} /> Dashboard
                </NavLink>
                <NavLink to="/repository" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <BookOpen size={18} /> Repository
                </NavLink>
                <NavLink to="/upload" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Upload size={18} /> Upload
                </NavLink>

                {user?.role === 'admin' && (
                    <>
                        <div className="nav-section" style={{ marginTop: 12 }}>Admin</div>
                        <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Shield size={18} /> Admin Panel
                        </NavLink>
                    </>
                )}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', padding: '12px 8px 0' }}>
                <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <User size={18} />
                    <span style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.85rem' }}>
                            {user?.first_name} {user?.last_name}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text2)', textTransform: 'capitalize' }}>
                            {user?.role}
                        </div>
                    </span>
                </NavLink>
                <button onClick={handleLogout} className="nav-item" style={{ width: '100%', background: 'none', border: 'none', color: 'var(--danger)', marginTop: 4 }}>
                    <LogOut size={18} /> Sign out
                </button>
            </div>
        </aside>
    )
}
