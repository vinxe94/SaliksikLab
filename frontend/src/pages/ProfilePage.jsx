import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import { useAuth } from '../contexts/AuthContext'
import {
    Mail, Building, Shield, MapPin, CalendarDays, BookOpen,
    GitBranch, FileText, Clock3, Star, Pencil, X, Camera
} from 'lucide-react'

const roleColors = { admin: 'badge-red', faculty: 'badge-blue', student: 'badge-green', researcher: 'badge-yellow' }

const languagePalette = {
    thesis: { label: 'Research', color: '#1B5E20' },
    software: { label: 'Software', color: '#3572A5' },
    sourcecode: { label: 'Code', color: '#f1e05a' },
    documentation: { label: 'Docs', color: '#6e7781' },
    other: { label: 'General', color: '#8b949e' },
}

function timeAgo(iso) {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
    if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`
    return `${Math.floor(diff / 2592000)}mo ago`
}

function initialsFor(user) {
    return `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase() || 'U'
}

function outputLabel(count, singular, plural = `${singular}s`) {
    return `${count} ${count === 1 ? singular : plural}`
}

export default function ProfilePage() {
    const { user, refreshUser } = useAuth()
    const navigate = useNavigate()
    const [form, setForm] = useState({ first_name: '', last_name: '', department: '' })
    const [saving, setSaving] = useState(false)
    const [loadingRepos, setLoadingRepos] = useState(true)
    const [myRepos, setMyRepos] = useState([])
    const [editing, setEditing] = useState(false)
    const [avatarFile, setAvatarFile] = useState(null)
    const [avatarPreview, setAvatarPreview] = useState('')

    useEffect(() => {
        setForm({
            first_name: user?.first_name || '',
            last_name: user?.last_name || '',
            department: user?.department || '',
        })
        setAvatarPreview(user?.avatar_url || '')
        setAvatarFile(null)
    }, [user])

    useEffect(() => {
        return () => {
            if (avatarPreview && avatarPreview.startsWith('blob:')) {
                URL.revokeObjectURL(avatarPreview)
            }
        }
    }, [avatarPreview])

    useEffect(() => {
        setLoadingRepos(true)
        api.get('/repository/?mine=true&page_size=12')
            .then((response) => setMyRepos(response.data.results || []))
            .catch(() => setMyRepos([]))
            .finally(() => setLoadingRepos(false))
    }, [])

    const handle = (e) => setForm((current) => ({ ...current, [e.target.name]: e.target.value }))

    const startEditing = () => {
        setForm({
            first_name: user?.first_name || '',
            last_name: user?.last_name || '',
            department: user?.department || '',
        })
        setAvatarPreview(user?.avatar_url || '')
        setAvatarFile(null)
        setEditing(true)
    }

    const cancelEditing = () => {
        setForm({
            first_name: user?.first_name || '',
            last_name: user?.last_name || '',
            department: user?.department || '',
        })
        if (avatarPreview && avatarPreview.startsWith('blob:')) {
            URL.revokeObjectURL(avatarPreview)
        }
        setAvatarPreview(user?.avatar_url || '')
        setAvatarFile(null)
        setEditing(false)
    }

    const onAvatarChange = (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file.')
            return
        }
        if (avatarPreview && avatarPreview.startsWith('blob:')) {
            URL.revokeObjectURL(avatarPreview)
        }
        setAvatarFile(file)
        setAvatarPreview(URL.createObjectURL(file))
    }

    const save = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            const payload = new FormData()
            payload.append('first_name', form.first_name)
            payload.append('last_name', form.last_name)
            payload.append('department', form.department)
            if (avatarFile) {
                payload.append('avatar', avatarFile)
            }
            await api.patch('/auth/me/', payload, { headers: { 'Content-Type': 'multipart/form-data' } })
            await refreshUser()
            toast.success('Profile updated.')
            setAvatarFile(null)
            setEditing(false)
        } catch {
            toast.error('Update failed.')
        } finally {
            setSaving(false)
        }
    }

    const stats = useMemo(() => {
        const approved = myRepos.filter((repo) => repo.is_approved).length
        const pending = myRepos.filter((repo) => !repo.is_approved && !repo.is_rejected).length
        const files = myRepos.reduce((sum, repo) => sum + (repo.file_count || 0), 0)
        return [
            { label: 'Repositories', value: myRepos.length, icon: BookOpen },
            { label: 'Approved', value: approved, icon: Shield },
            { label: 'Pending', value: pending, icon: Clock3 },
            { label: 'Files', value: files, icon: FileText },
        ]
    }, [myRepos])

    const recentActivity = useMemo(() => myRepos.slice(0, 5), [myRepos])
    const pinnedRepos = useMemo(() => [...myRepos].sort((a, b) => (b.current_version || 0) - (a.current_version || 0)).slice(0, 6), [myRepos])

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Profile</h2>
                </div>
                <div className="page-body">
                    <div className="profile-shell">
                        <aside className="profile-sidebar-panel">
                            <div className="profile-avatar-frame">
                                {user?.avatar_url ? (
                                    <img
                                        src={user.avatar_url}
                                        alt={`${user?.first_name || 'User'} ${user?.last_name || ''}`.trim()}
                                        className="profile-avatar-image"
                                    />
                                ) : (
                                    <div className="profile-avatar-lg">{initialsFor(user)}</div>
                                )}
                            </div>
                            <div className="profile-identity">
                                <h1>{user?.first_name} {user?.last_name}</h1>
                                <div className="profile-handle">@{user?.email?.split('@')[0]}</div>
                                <p className="profile-bio-copy">
                                    SaliksikLab contributor focused on academic outputs, repository stewardship, and research collaboration.
                                </p>
                            </div>
                            <div className="profile-badges">
                                <span className={`badge ${roleColors[user?.role]}`}><Shield size={11} style={{ marginRight: 4 }} />{user?.role}</span>
                                <span className="badge badge-gray">{user?.is_account_approved ? 'Approved account' : 'Pending approval'}</span>
                            </div>
                            <div className="profile-meta-list">
                                <div><Mail size={15} /> {user?.email}</div>
                                {user?.department && <div><Building size={15} /> {user.department}</div>}
                                <div><MapPin size={15} /> SaliksikLab workspace</div>
                                <div><CalendarDays size={15} /> Joined {new Date(user?.date_joined).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                            </div>

                            {!editing ? (
                                <button type="button" className="btn btn-ghost profile-edit-trigger" onClick={startEditing}>
                                    <Pencil size={15} /> Edit profile
                                </button>
                            ) : (
                                <form onSubmit={save} className="profile-edit-card">
                                    <div className="profile-edit-head">
                                        <h3>Edit profile</h3>
                                        <button type="button" className="icon-button" onClick={cancelEditing} aria-label="Close edit profile">
                                            <X size={15} />
                                        </button>
                                    </div>
                                    <div className="profile-avatar-editor">
                                        <div className="profile-avatar-editor-preview">
                                            {avatarPreview ? (
                                                <img src={avatarPreview} alt="Avatar preview" className="profile-avatar-image" />
                                            ) : (
                                                <div className="profile-avatar-lg profile-avatar-lg-sm">{initialsFor(user)}</div>
                                            )}
                                        </div>
                                        <div className="profile-avatar-editor-copy">
                                            <strong>Profile picture</strong>
                                            <span>Upload a square image for the best result.</span>
                                            <label className="btn btn-ghost btn-sm profile-avatar-upload">
                                                <Camera size={14} /> Choose picture
                                                <input type="file" accept="image/*" onChange={onAvatarChange} hidden />
                                            </label>
                                        </div>
                                    </div>
                                    <div className="grid-2">
                                        <div className="form-group">
                                            <label className="form-label">First Name</label>
                                            <input className="form-input" name="first_name" value={form.first_name} onChange={handle} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Last Name</label>
                                            <input className="form-input" name="last_name" value={form.last_name} onChange={handle} />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Department</label>
                                        <input className="form-input" name="department" value={form.department} onChange={handle} placeholder="College of Engineering" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Email</label>
                                        <input className="form-input" value={user?.email || ''} disabled style={{ opacity: 0.6 }} />
                                    </div>
                                    <div className="profile-edit-actions">
                                        <button type="button" className="btn btn-ghost" onClick={cancelEditing}>Cancel</button>
                                        <button type="submit" className="btn btn-primary" disabled={saving}>
                                            {saving ? 'Saving...' : 'Save changes'}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </aside>

                        <section className="profile-main-panel">
                            <div className="profile-overview-card">
                                <div>
                                    <span className="dashboard-kicker">Overview</span>
                                    <h3>GitHub-style academic profile adapted for SaliksikLab.</h3>
                                    <p>Track research outputs, recent activity, and repository presence in one place.</p>
                                </div>
                                <div className="profile-stat-grid">
                                    {stats.map(({ label, value, icon: Icon }) => (
                                        <div key={label} className="profile-stat-card">
                                            <span><Icon size={14} /> {label}</span>
                                            <strong>{value}</strong>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="profile-tabs-bar">
                                <div className="profile-tab active"><BookOpen size={15} /> Overview</div>
                                <div className="profile-tab"><GitBranch size={15} /> Repositories <span>{myRepos.length}</span></div>
                                <div className="profile-tab"><Clock3 size={15} /> Activity</div>
                            </div>

                            <div className="profile-section-card">
                                <div className="profile-section-head">
                                    <h3>Pinned repositories</h3>
                                    <button type="button" className="see-more-link" onClick={() => navigate('/repository')}>View repository feed</button>
                                </div>
                                {loadingRepos ? (
                                    <div className="profile-pinned-grid">
                                        {Array.from({ length: 4 }).map((_, index) => (
                                            <div key={index} className="profile-pinned-card">
                                                <div className="skeleton-text h-4 w-32" style={{ marginBottom: 10 }} />
                                                <div className="skeleton-text h-4 w-full" style={{ marginBottom: 10 }} />
                                                <div className="skeleton-text h-4 w-24" />
                                            </div>
                                        ))}
                                    </div>
                                ) : pinnedRepos.length === 0 ? (
                                    <div className="empty-state" style={{ padding: '40px 20px' }}>
                                        <BookOpen style={{ width: 48, height: 48, opacity: 0.2, margin: '0 auto 12px' }} />
                                        <h3>No repositories yet</h3>
                                        <p style={{ marginTop: 6 }}>Upload a research output to start building your profile.</p>
                                    </div>
                                ) : (
                                    <div className="profile-pinned-grid">
                                        {pinnedRepos.map((repo) => {
                                            const lang = languagePalette[repo.output_type] || languagePalette.other
                                            return (
                                                <button key={repo.id} type="button" className="profile-pinned-card" onClick={() => navigate(`/repository/${repo.id}`)}>
                                                    <div className="profile-pinned-title">{repo.title}</div>
                                                    <p>{repo.department}{repo.course ? ` • ${repo.course}` : ''}</p>
                                                    <div className="profile-pinned-meta">
                                                        <span className="language-chip">
                                                            <span className="language-dot" style={{ background: lang.color }} />
                                                            {lang.label}
                                                        </span>
                                                        <span><Star size={13} /> v{repo.current_version || 0}</span>
                                                    </div>
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            <div className="profile-grid-two">
                                <div className="profile-section-card">
                                    <div className="profile-section-head">
                                        <h3>Recent activity</h3>
                                    </div>
                                    {loadingRepos ? (
                                        <div className="repo-list">
                                            {Array.from({ length: 4 }).map((_, index) => (
                                                <div key={index} className="profile-activity-item">
                                                    <div className="skeleton-text h-4 w-32" style={{ marginBottom: 8 }} />
                                                    <div className="skeleton-text h-4 w-20" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : recentActivity.length === 0 ? (
                                        <p className="profile-empty-copy">No recent repository activity yet.</p>
                                    ) : (
                                        <div className="repo-list">
                                            {recentActivity.map((repo) => (
                                                <button key={repo.id} type="button" className="profile-activity-item" onClick={() => navigate(`/repository/${repo.id}`)}>
                                                    <div className="profile-activity-copy">
                                                        <strong>Created {repo.title}</strong>
                                                        <span>{timeAgo(repo.created_at)} • {outputLabel(repo.file_count || 0, 'file')}</span>
                                                    </div>
                                                    <span className={`badge ${repo.is_approved ? 'badge-green' : repo.is_rejected ? 'badge-red' : 'badge-yellow'}`}>
                                                        {repo.is_approved ? 'Approved' : repo.is_rejected ? 'Rejected' : 'Pending'}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="profile-section-card">
                                    <div className="profile-section-head">
                                        <h3>Contribution summary</h3>
                                    </div>
                                    <div className="profile-summary-list">
                                        <div><span>Academic role</span><strong style={{ textTransform: 'capitalize' }}>{user?.role}</strong></div>
                                        <div><span>Department</span><strong>{user?.department || 'Not set'}</strong></div>
                                        <div><span>Account status</span><strong>{user?.is_active ? 'Active' : 'Inactive'}</strong></div>
                                        <div><span>Repository presence</span><strong>{outputLabel(myRepos.length, 'output')}</strong></div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    )
}
