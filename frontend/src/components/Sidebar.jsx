import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LanguageSwitcher from './LanguageSwitcher'
import { useLanguage } from '../contexts/LanguageContext'
import {
    LayoutDashboard, BookOpen, Upload, Shield, User, LogOut, Code2, GitBranch, FileText, ChartColumn
} from 'lucide-react'

export default function Sidebar() {
    const { user, logout } = useAuth()
    const { t } = useLanguage()
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
                <div className="nav-section">{t('nav.dashboard')?.includes('Dashboard') ? 'Navigation' : 'Nabigasyon'}</div>

                <NavLink to="/dashboard" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <LayoutDashboard size={18} /> {t('nav.dashboard')}
                </NavLink>
                <NavLink to="/repository" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <BookOpen size={18} /> {t('nav.repository')}
                </NavLink>
                <NavLink to="/upload" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Upload size={18} /> {t('nav.upload')}
                </NavLink>
                <NavLink to="/code-lab" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Code2 size={18} /> {t('nav.codelab')}
                </NavLink>
                <NavLink to="/reports" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <FileText size={18} /> {t('nav.reports')}
                </NavLink>
                <NavLink to="/analytics" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <ChartColumn size={18} /> {t('nav.analytics')}
                </NavLink>
                <NavLink to="/collaborate" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <GitBranch size={18} /> Collaborate
                </NavLink>

                {user?.role === 'admin' && (
                    <>
                        <div className="nav-section" style={{ marginTop: 12 }}>Admin</div>
                        <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <Shield size={18} /> {t('nav.admin')}
                        </NavLink>
                    </>
                )}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', padding: '12px 8px 0' }}>
                {/* Language switcher */}
                <div style={{ padding: '4px 12px 10px' }}>
                    <LanguageSwitcher />
                </div>
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
                    <LogOut size={18} /> {t('nav.logout')}
                </button>
            </div>
        </aside>
    )
}
