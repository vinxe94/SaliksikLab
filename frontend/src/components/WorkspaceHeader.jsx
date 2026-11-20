import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, BookOpen, CalendarDays, ChevronDown, LogOut, Search, UserRound } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import api from '../api/axios'
import '../styles/workspace.css'

export default function WorkspaceHeader({ title = 'Dashboard', eyebrow = 'Your workspace', recent: suppliedRecent, pendingCount: suppliedPending, loading: suppliedLoading, error: suppliedError }) {
    const [activity, setActivity] = useState({ recent: [], pendingCount: 0, loading: true, error: '' })
    const [retry, setRetry] = useState(0)
    const recent = suppliedRecent ?? activity.recent
    const pendingCount = suppliedPending ?? activity.pendingCount
    const loading = suppliedLoading ?? activity.loading
    const error = suppliedError ?? activity.error
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const [search, setSearch] = useState('')
    const [openPanel, setOpenPanel] = useState(null)
    const toolsRef = useRef(null)
    const activityButton = useRef(null)
    const accountButton = useRef(null)
    const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.full_name || 'Your account'
    const initial = (user?.first_name || fullName).charAt(0).toUpperCase()
    const date = new Date()
    const today = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

    useEffect(() => {
        if (suppliedRecent !== undefined) return
        const controller = new AbortController()
        setActivity(current => ({ ...current, loading: true, error: '' }))
        Promise.all([
            api.get('/repository/stats/', { signal: controller.signal }),
            api.get('/repository/?page_size=5', { signal: controller.signal }),
        ]).then(([statsResponse, recentResponse]) => {
            if (controller.signal.aborted) return
            const outputs = recentResponse.data.results || recentResponse.data
            setActivity({ recent: Array.isArray(outputs) ? outputs.slice(0, 4) : [], pendingCount: statsResponse.data.pending ?? 0, loading: false, error: '' })
        }).catch(() => {
            if (!controller.signal.aborted) setActivity({ recent: [], pendingCount: 0, loading: false, error: 'Activity is temporarily unavailable.' })
        })
        return () => controller.abort()
    }, [suppliedRecent, retry])

    useEffect(() => {
        if (!openPanel) return
        const closeOutside = event => {
            if (!toolsRef.current?.contains(event.target)) setOpenPanel(null)
        }
        const closeOnEscape = event => {
            if (event.key !== 'Escape') return
            setOpenPanel(null)
            const trigger = openPanel === 'activity' ? activityButton : accountButton
            trigger.current?.focus()
        }
        document.addEventListener('pointerdown', closeOutside)
        document.addEventListener('focusin', closeOutside)
        document.addEventListener('keydown', closeOnEscape)
        return () => {
            document.removeEventListener('pointerdown', closeOutside)
            document.removeEventListener('focusin', closeOutside)
            document.removeEventListener('keydown', closeOnEscape)
        }
    }, [openPanel])

    const submitSearch = event => {
        event.preventDefault()
        const query = search.trim()
        navigate(query ? `/repository?search=${encodeURIComponent(query)}` : '/repository')
    }

    return (
        <header className="page-header dashboard-header">
            <div className="dashboard-heading"><span className="page-eyebrow">{eyebrow}</span><h1>{title}</h1></div>
            <form className="dashboard-search" role="search" onSubmit={submitSearch}>
                <button type="submit" aria-label="Search repository"><Search size={22} aria-hidden="true" /></button>
                <label className="sr-only" htmlFor="dashboard-search">Search research, authors, or topics</label>
                <input id="dashboard-search" type="search" placeholder="Search research, authors, or topics…" value={search} onChange={event => setSearch(event.target.value)} enterKeyHint="search" />
            </form>
            <div className="dashboard-header-tools" ref={toolsRef}>
                <div className="dashboard-popover-anchor">
                    <button ref={activityButton} type="button" className="dashboard-activity-button" aria-label="Research activity" aria-expanded={openPanel === 'activity'} aria-controls="dashboard-activity-panel" onClick={() => setOpenPanel(current => current === 'activity' ? null : 'activity')}>
                        <Bell size={24} aria-hidden="true" />
                        {!loading && !error && user?.role === 'admin' && pendingCount > 0 && <span className="dashboard-activity-count" aria-label={`${pendingCount} research outputs pending review`}>{pendingCount > 99 ? '99+' : pendingCount}</span>}
                    </button>
                    {openPanel === 'activity' && <section id="dashboard-activity-panel" className="dashboard-popover dashboard-activity-panel" aria-labelledby="dashboard-activity-heading">
                        <h2 id="dashboard-activity-heading">Research activity</h2>
                        {loading ? <p role="status">Loading recent activity…</p> : error ? <div><p>Activity is temporarily unavailable.</p>{suppliedRecent === undefined ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRetry(value => value + 1)}>Try again</button> : <p>Use Try again in your dashboard.</p>}</div> : <>
                            {user?.role === 'admin' && pendingCount > 0 && <Link className="dashboard-pending-note" to="/admin">{pendingCount} research {pendingCount === 1 ? 'output needs' : 'outputs need'} review. Open management.</Link>}
                            {recent.length ? <ul>{recent.map(output => <li key={output.id}><Link to={`/repository?search=${encodeURIComponent(output.title)}`}><BookOpen size={18} aria-hidden="true" /><span><strong>{output.title}</strong><small>{output.author || 'Research contributor'}</small></span></Link></li>)}</ul> : <p>No recent research outputs yet.</p>}
                            <Link className="dashboard-popover-link" to="/repository">Explore the repository</Link>
                        </>}
                    </section>}
                </div>
                <time className="dashboard-date" dateTime={localDate}><CalendarDays size={18} aria-hidden="true" />{today}</time>
                <div className="dashboard-popover-anchor">
                    <button ref={accountButton} type="button" className="dashboard-account-button" aria-label="Account options" aria-expanded={openPanel === 'account'} aria-controls="dashboard-account-panel" onClick={() => setOpenPanel(current => current === 'account' ? null : 'account')}>
                        {user?.avatar_url ? <img src={user.avatar_url} alt="" /> : <span>{initial}</span>}<ChevronDown size={16} aria-hidden="true" />
                    </button>
                    {openPanel === 'account' && <section id="dashboard-account-panel" className="dashboard-popover dashboard-account-panel" aria-label="Your account">
                        <strong>{fullName}</strong><span>{user?.role || 'Member'}</span>
                        <Link to="/profile"><UserRound size={17} aria-hidden="true" />Your profile</Link>
                        <button type="button" onClick={() => { logout(); navigate('/login') }}><LogOut size={17} aria-hidden="true" />Sign out</button>
                    </section>}
                </div>
            </div>
        </header>
    )
}

WorkspaceHeader.propTypes = {
    title: PropTypes.string,
    eyebrow: PropTypes.string,
    recent: PropTypes.arrayOf(PropTypes.object),
    pendingCount: PropTypes.number,
    loading: PropTypes.bool,
    error: PropTypes.string,
}
