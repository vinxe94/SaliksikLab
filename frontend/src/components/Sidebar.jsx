import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LanguageSwitcher from './LanguageSwitcher'
import { useLanguage } from '../contexts/LanguageContext'
import {
    LayoutDashboard, BookOpen, Upload, Shield, User, LogOut, ChartColumn, Menu, X
} from 'lucide-react'

export default function Sidebar() {
    const { user, logout } = useAuth()
    const { t } = useLanguage()
    const navigate = useNavigate()
    const [isOpen, setIsOpen] = useState(false)

    const closeSidebar = () => setIsOpen(false)

    const handleLogout = () => {
        logout()
        closeSidebar()
        navigate('/login')
    }

    return (
        <>
            <header className="mobile-brand-header">
                <button
                    type="button"
                    className="mobile-menu-button"
                    onClick={() => setIsOpen(true)}
                    aria-label="Open navigation menu"
                    aria-expanded={isOpen}
                >
                    <Menu size={22} />
                </button>
                <img src="/logo-nav.png" alt="SaliksikLab logo" />
                <span>SaliksikLab</span>
            </header>
            <button
                type="button"
                className={`sidebar-backdrop ${isOpen ? 'show' : ''}`}
                onClick={closeSidebar}
                aria-label="Close navigation menu"
            />
            <aside className={`sidebar ${isOpen ? 'open' : ''}`} aria-label="Primary navigation">
                <div className="sidebar-logo">
                    <img src="/logo-nav.png" alt="SaliksikLab logo" className="sidebar-logo-image" />
                    <span>SaliksikLab</span>
                    <button
                        type="button"
                        className="sidebar-close-button"
                        onClick={closeSidebar}
                        aria-label="Close navigation menu"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <div className="nav-section">{t('nav.dashboard')?.includes('Dashboard') ? 'Navigation' : 'Nabigasyon'}</div>

                    <NavLink to="/dashboard" onClick={closeSidebar} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <LayoutDashboard size={18} /> {t('nav.dashboard')}
                    </NavLink>
                    <NavLink to="/repository" onClick={closeSidebar} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <BookOpen size={18} /> {t('nav.repository')}
                    </NavLink>
                    <NavLink to="/upload" onClick={closeSidebar} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        <Upload size={18} /> {t('nav.upload')}
                    </NavLink>
                    {user?.role === 'admin' && (
                        <>
                            <div className="nav-section" style={{ marginTop: 12 }}>Admin</div>
                            <NavLink to="/admin" onClick={closeSidebar} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <Shield size={18} /> {t('nav.admin')}
                            </NavLink>
                            <NavLink to="/analytics" onClick={closeSidebar} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <ChartColumn size={18} /> {t('nav.analytics')}
                            </NavLink>
                        </>
                    )}
                </div>

                <div style={{ borderTop: '1px solid var(--border)', padding: '12px 8px 0' }}>
                    {/* Language switcher */}
                    <div style={{ padding: '4px 12px 10px' }}>
                        <LanguageSwitcher />
                    </div>
                    <NavLink to="/profile" onClick={closeSidebar} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                        {user?.avatar_url ? (
                            <img
                                src={user.avatar_url}
                                alt={`${user?.first_name || 'User'} avatar`}
                                className="sidebar-user-avatar"
                            />
                        ) : (
                            <User size={18} />
                        )}
                        <span className="sidebar-user-label" style={{ flex: 1 }}>
                            <div className="sidebar-user-fullname" style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.85rem' }}>
                                {user?.first_name} {user?.last_name}
                            </div>
                            <div className="sidebar-user-firstname" style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.85rem' }}>
                                {user?.first_name}
                            </div>
                            <div style={{ fontSize: '0.73rem', color: 'var(--text2)', textTransform: 'capitalize' }}>
                                {user?.role}
                            </div>
                        </span>
                    </NavLink>
                    <button onClick={handleLogout} className="nav-item" style={{ width: '100%', background: 'none', border: 'none', color: 'var(--danger)', marginTop: 4 }}>
                        <LogOut size={18} /> {t('nav.logout')}
                    </button>
                </div>
            </aside>
        </>
    )
}
