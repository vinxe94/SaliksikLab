import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LanguageSwitcher from './LanguageSwitcher'
import { useLanguage } from '../contexts/LanguageContext'
import { LayoutDashboard, BookOpen, Upload, Shield, LogOut, ChartColumn, Menu, X, ChevronRight } from 'lucide-react'

export default function Sidebar() {
    const { user, logout } = useAuth()
    const { t } = useLanguage()
    const navigate = useNavigate()
    const [isOpen, setIsOpen] = useState(false)
    const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches)
    const menuButton = useRef(null)
    const sidebar = useRef(null)
    const closeButton = useRef(null)
    const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.full_name || 'Your account'
    const initials = [user?.first_name?.[0], user?.last_name?.[0]].filter(Boolean).join('') || name[0]

    useEffect(() => {
        const media = window.matchMedia('(max-width: 900px)')
        const resize = () => {
            setIsMobile(media.matches)
            if (!media.matches) setIsOpen(false)
        }
        media.addEventListener('change', resize)
        return () => media.removeEventListener('change', resize)
    }, [])

    useEffect(() => {
        if (!isOpen || !isMobile) return
        const previousOverflow = document.body.style.overflow
        const trigger = menuButton.current
        document.body.style.overflow = 'hidden'
        closeButton.current?.focus()
        const trapFocus = (event) => {
            if (event.key === 'Escape') setIsOpen(false)
            if (event.key !== 'Tab') return
            const controls = [...sidebar.current.querySelectorAll('a[href], button:not(:disabled)')]
                .filter(element => element.getClientRects().length > 0)
            const first = controls[0]
            const last = controls[controls.length - 1]
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last?.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first?.focus()
            }
        }
        document.addEventListener('keydown', trapFocus)
        return () => {
            document.body.style.overflow = previousOverflow
            document.removeEventListener('keydown', trapFocus)
            trigger?.focus()
        }
    }, [isOpen, isMobile])

    const closeSidebar = () => setIsOpen(false)
    const handleLogout = () => {
        logout()
        closeSidebar()
        navigate('/login')
    }
    const navClass = ({ isActive }) => `nav-item ${isActive ? 'active' : ''}`

    return (
        <>
            <a className="skip-link" href="#main-content">Skip to content</a>
            <header className="mobile-brand-header">
                <button ref={menuButton} type="button" className="mobile-menu-button" onClick={() => setIsOpen(true)}
                    aria-label="Open navigation menu" aria-expanded={isOpen} aria-controls="workspace-navigation">
                    <Menu size={22} />
                </button>
                <NavLink className="mobile-brand-link" to="/dashboard" aria-label="Tukiva dashboard">
                    <img src="/logo-nav.png" alt="" />
                    <span>Tukiva</span>
                </NavLink>
                <NavLink className="mobile-account" to="/profile" aria-label="Your profile">{initials}</NavLink>
            </header>
            <div className={`sidebar-backdrop ${isOpen ? 'show' : ''}`} onClick={closeSidebar} aria-hidden="true" />
            <aside ref={sidebar} id="workspace-navigation" className={`sidebar ${isOpen ? 'open' : ''}`}
                aria-label="Workspace navigation" role={isMobile && isOpen ? 'dialog' : undefined}
                aria-modal={isMobile && isOpen ? true : undefined} inert={isMobile && !isOpen ? '' : undefined}>
                <div className="sidebar-logo">
                    <NavLink to="/dashboard" className="sidebar-brand-link" onClick={closeSidebar} aria-label="Tukiva dashboard">
                        <div className="sidebar-logo-mark"><img src="/logo-nav.png" alt="" className="sidebar-logo-image" /></div>
                        <div className="sidebar-brand-copy"><strong>Tukiva</strong><span>Research workspace</span></div>
                    </NavLink>
                    <button ref={closeButton} type="button" className="sidebar-close-button" onClick={closeSidebar} aria-label="Close navigation menu">
                        <X size={20} />
                    </button>
                </div>

                <nav className="sidebar-navigation" aria-label="Main navigation">
                    <div className="nav-section">{t('nav.dashboard')?.includes('Dashboard') ? 'Workspace' : 'Nabigasyon'}</div>
                    <NavLink to="/dashboard" onClick={closeSidebar} className={navClass}>
                        <LayoutDashboard size={19} /><span>{t('nav.dashboard')}</span>
                    </NavLink>
                    <NavLink to="/repository" onClick={closeSidebar} className={navClass}>
                        <BookOpen size={19} /><span>{t('nav.repository')}</span>
                    </NavLink>
                    {(user?.role === 'student' || user?.role === 'admin') && (
                        <NavLink to="/upload" onClick={closeSidebar} className={navClass}>
                            <Upload size={19} /><span>{user?.role === 'admin' ? 'Publish Research' : 'Request Upload'}</span>
                        </NavLink>
                    )}
                    {user?.role === 'admin' && (
                        <>
                            <div className="nav-section nav-section-admin">Administration</div>
                            <NavLink to="/admin" onClick={closeSidebar} className={navClass}>
                                <Shield size={19} /><span>{t('nav.admin')}</span>
                            </NavLink>
                            <NavLink to="/analytics" onClick={closeSidebar} className={navClass}>
                                <ChartColumn size={19} /><span>{t('nav.analytics')}</span>
                            </NavLink>
                        </>
                    )}
                </nav>

                <div className="sidebar-footer">
                    <div className="sidebar-preference"><span>Language</span><LanguageSwitcher compact /></div>
                    <NavLink to="/profile" onClick={closeSidebar} className={({ isActive }) => `sidebar-profile ${isActive ? 'active' : ''}`}>
                        {user?.avatar_url ? <img src={user.avatar_url} alt="" className="sidebar-user-avatar" /> : <span className="sidebar-user-initials">{initials}</span>}
                        <span className="sidebar-user-label"><strong>{name}</strong><span>{user?.role || 'Member'}</span></span>
                        <ChevronRight size={16} />
                    </NavLink>
                    <button type="button" onClick={handleLogout} className="sidebar-logout"><LogOut size={17} /><span>{t('nav.logout')}</span></button>
                </div>
            </aside>
        </>
    )
}
