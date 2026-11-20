import TemporaryHostingPanel from '../components/TemporaryHostingPanel'
import SubmissionAttachments from '../components/SubmissionAttachments'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Sidebar from '../components/Sidebar'
import WorkspaceHeader from '../components/WorkspaceHeader'
import WorkspaceBanner from '../components/WorkspaceBanner'
import WorkspaceFooter from '../components/WorkspaceFooter'
import api, { apiUrl } from '../api/axios'
import { Users, CheckCircle, Clock, Download, XCircle, FileText, Plus, Upload, ClipboardList, RotateCcw, Search, Server, GraduationCap, X } from 'lucide-react'
import '../styles/management.css'
import '../styles/workspace-pages.css'

const ROLES = ['admin', 'faculty', 'student']
const MANAGEMENT_TABS = [
    ['requests', 'Upload requests', ClipboardList],
    ['outputs', 'Legacy outputs', FileText],
    ['users', 'People', Users],
    ['academic', 'Academic settings', GraduationCap],
    ['hosting', 'Temporary hosting', Server],
]

// eslint-disable-next-line react/prop-types -- Local wrapper for the three management dialogs below.
function ManagementDialog({ children, label, className = '', onClose, busy = false }) {
    const dialogRef = useRef(null)
    useEffect(() => {
        const previousFocus = document.activeElement
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const dialog = dialogRef.current
        if (!dialog.contains(document.activeElement)) dialog.focus()
        return () => {
            document.body.style.overflow = previousOverflow
            if (previousFocus?.isConnected) previousFocus.focus()
        }
    }, [])

    const handleKeyDown = event => {
        if (event.key === 'Escape' && !busy) {
            event.stopPropagation()
            onClose()
        }
        if (event.key !== 'Tab') return
        const controls = [...dialogRef.current.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
            .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length > 0)
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (!first) { event.preventDefault(); return }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
            event.preventDefault()
            last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
        }
    }

    return <div className="management-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`management-modal ${className}`} onKeyDown={handleKeyDown}>{children}</div>
    </div>
}

export default function AdminPage() {
    const navigate = useNavigate()
    const restoreInputRef = useRef(null)
    const [tab, setTab] = useState('requests')
    const [search, setSearch] = useState('')
    const [requestFilter, setRequestFilter] = useState('all')
    const [requests, setRequests] = useState([])
    const [outputs, setOutputs] = useState([])
    const [users, setUsers] = useState([])
    const [departments, setDepartments] = useState([])
    const [courses, setCourses] = useState([])
    const [loadingO, setLoadingO] = useState(true)
    const [loadingU, setLoadingU] = useState(true)
    const [academicLoading, setAcademicLoading] = useState(true)
    const [requestsLoading, setRequestsLoading] = useState(true)
    const [departmentName, setDepartmentName] = useState('')
    const [courseForm, setCourseForm] = useState({ name: '', department: '' })
    // Rejection modal state
    const [rejectTarget, setRejectTarget] = useState(null)   // output object
    const [rejectReason, setRejectReason] = useState('')
    const [rejectLoading, setRejectLoading] = useState(false)
    const [requestReview, setRequestReview] = useState(null)
    const [requestPreview, setRequestPreview] = useState(null)
    const [requestComment, setRequestComment] = useState('')
    const [requestResearchFile, setRequestResearchFile] = useState(null)
    const [requestSystemFile, setRequestSystemFile] = useState(null)
    const [requestSystemLink, setRequestSystemLink] = useState('')
    const [requestReviewLoading, setRequestReviewLoading] = useState(false)

    const loadRequests = useCallback(() => {
        setRequestsLoading(true)
        return api.get('/repository/submission-requests/?page_size=100')
            .then((response) => setRequests(response.data.results || response.data || []))
            .catch(() => toast.error('Failed to load submission requests.'))
            .finally(() => setRequestsLoading(false))
    }, [])

    useEffect(() => {
        api.get('/repository/?page_size=100')
            .then(r => setOutputs(r.data.results || []))
            .catch(() => toast.error('Failed to load outputs.'))
            .finally(() => setLoadingO(false))
        api.get('/auth/admin/users/')
            .then(r => setUsers(r.data))
            .catch(() => toast.error('Failed to load users.'))
            .finally(() => setLoadingU(false))
        Promise.all([
            api.get('/repository/departments/'),
            api.get('/repository/courses/'),
        ]).then(([deptRes, courseRes]) => {
            setDepartments(deptRes.data || [])
            setCourses(courseRes.data || [])
        }).catch(() => toast.error('Failed to load departments and courses.'))
            .finally(() => setAcademicLoading(false))
    }, [])

    useEffect(() => {
        loadRequests()
    }, [loadRequests])

    const openRequestReview = (submission, action) => {
        setRequestPreview(null)
        setRequestReview({ submission, action })
        setRequestComment('')
        setRequestResearchFile(null)
        setRequestSystemFile(null)
        setRequestSystemLink(submission.proposed_system_link || '')
    }

    const submitRequestReview = async () => {
        if (!requestReview) return
        const { submission, action } = requestReview
        if (['reject', 'revision'].includes(action) && !requestComment.trim()) {
            toast.error('Add an administrator comment.')
            return
        }
        const needsPaper = submission.submission_type !== 'executable_system'
        const needsSystem = submission.submission_type !== 'research_paper'
        if (action === 'approve' && needsPaper && !submission.has_research_file && !requestResearchFile) {
            toast.error('Select the approved research PDF.')
            return
        }
        if (action === 'approve' && needsSystem && !submission.has_system_file && !requestSystemFile) {
            toast.error('Select the approved executable system ZIP.')
            return
        }

        setRequestReviewLoading(true)
        try {
            const body = new FormData()
            body.append('action', action)
            body.append('comment', requestComment.trim())
            if (requestResearchFile) body.append('research_file', requestResearchFile)
            if (requestSystemFile) body.append('system_file', requestSystemFile)
            if (requestSystemLink.trim()) body.append('system_link', requestSystemLink.trim())
            await api.post(`/repository/submission-requests/${submission.id}/review/`, body)
            toast.success(action === 'approve' ? (needsSystem ? 'Approved. Files published and the default system configuration saved.' : 'Request approved and research published.') : action === 'revision' ? 'Request returned for revision.' : 'Request rejected.')
            setRequestReview(null)
            await loadRequests()
        } catch (err) {
            const data = err.response?.data
            const message = data?.detail || data?.research_file?.[0] || data?.system_file?.[0] || data?.comment?.[0] || 'Request review failed.'
            toast.error(message)
        } finally {
            setRequestReviewLoading(false)
        }
    }

    const approve = async (id) => {
        await api.post(`/repository/${id}/approve/`, { action: 'approve' })
        setOutputs(os => os.map(o => o.id === id ? { ...o, is_approved: true, is_rejected: false, rejection_reason: '' } : o))
        toast.success('Output approved!')
    }

    const openRejectModal = (output) => {
        setRejectTarget(output)
        setRejectReason('')
    }

    const submitRejection = async () => {
        if (!rejectReason.trim()) { toast.error('Please provide a rejection reason.'); return }
        setRejectLoading(true)
        try {
            await api.post(`/repository/${rejectTarget.id}/approve/`, { action: 'reject', rejection_reason: rejectReason })
            setOutputs(os => os.map(o => o.id === rejectTarget.id ? { ...o, is_approved: false, is_rejected: true, rejection_reason: rejectReason } : o))
            toast.success('Output rejected with feedback sent.')
            setRejectTarget(null)
        } catch (err) {
            toast.error(err.response?.data?.rejection_reason || 'Rejection failed.')
        } finally {
            setRejectLoading(false)
        }
    }

    const updateRole = async (userId, role) => {
        await api.patch(`/auth/admin/users/${userId}/`, { role })
        setUsers(us => us.map(u => u.id === userId ? { ...u, role } : u))
        toast.success('Role updated.')
    }

    const toggleActive = async (u) => {
        await api.patch(`/auth/admin/users/${u.id}/`, { is_active: !u.is_active })
        setUsers(us => us.map(x => x.id === u.id ? { ...x, is_active: !u.is_active } : x))
        toast.success(u.is_active ? 'User deactivated.' : 'User activated.')
    }

    const toggleApproveAccount = async (u) => {
        await api.post(`/auth/admin/users/${u.id}/approve/`)
        setUsers(us => us.map(x => x.id === u.id ? { ...x, is_account_approved: !u.is_account_approved } : x))
        toast.success(u.is_account_approved ? 'Account unapproved.' : 'Account approved!')
    }

    const backup = async () => {
        const { data } = await api.get('/repository/backup/')
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `backup_${Date.now()}.json`; a.click()
        URL.revokeObjectURL(url); toast.success('Backup downloaded!')
    }

    const restoreBackup = async (selectedFile) => {
        if (!selectedFile) return
        if (!confirm('Restore this backup? Existing matching records will be updated.')) {
            if (restoreInputRef.current) restoreInputRef.current.value = ''
            return
        }
        try {
            const fd = new FormData()
            fd.append('backup_file', selectedFile)
            const { data } = await api.post('/repository/restore/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
            toast.success(`Backup restored: ${Object.values(data.restored || {}).reduce((sum, count) => sum + count, 0)} records processed.`)
            window.location.reload()
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Restore failed.')
        } finally {
            if (restoreInputRef.current) restoreInputRef.current.value = ''
        }
    }

    const exportCSV = async () => {
        try {
            const token = localStorage.getItem('access_token')
            const response = await fetch(apiUrl('/repository/export/csv/'), {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (!response.ok) throw new Error()
            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = `outputs_${Date.now()}.csv`; a.click()
            URL.revokeObjectURL(url); toast.success('CSV exported!')
        } catch { toast.error('Export failed.') }
    }

    const addDepartment = async (e) => {
        e.preventDefault()
        if (!departmentName.trim()) return
        const { data } = await api.post('/repository/departments/', { name: departmentName.trim() })
        setDepartments((items) => [...items, data].sort((a, b) => a.name.localeCompare(b.name)))
        setDepartmentName('')
        toast.success('Department added.')
    }

    const addCourse = async (e) => {
        e.preventDefault()
        if (!courseForm.name.trim()) return
        const payload = { name: courseForm.name.trim(), department: courseForm.department || null }
        const { data } = await api.post('/repository/courses/', payload)
        setCourses((items) => [...items, data].sort((a, b) => a.name.localeCompare(b.name)))
        setCourseForm({ name: '', department: '' })
        toast.success('Course added.')
    }

    const toggleDepartment = async (department) => {
        const { data } = await api.patch(`/repository/departments/${department.id}/`, { is_active: !department.is_active })
        setDepartments((items) => items.map((item) => item.id === department.id ? data : item))
        toast.success(data.is_active ? 'Department activated.' : 'Department deactivated.')
    }

    const toggleCourse = async (course) => {
        const { data } = await api.patch(`/repository/courses/${course.id}/`, { is_active: !course.is_active })
        setCourses((items) => items.map((item) => item.id === course.id ? data : item))
        toast.success(data.is_active ? 'Course activated.' : 'Course deactivated.')
    }

    const pending = outputs.filter(o => !o.is_approved && !o.is_rejected)
    const approved = outputs.filter(o => o.is_approved)
    const rejected = outputs.filter(o => o.is_rejected)
    const pendingRequests = requests.filter((item) => item.status === 'pending')
    const searchTerm = search.trim().toLowerCase()
    const matchingRequests = requests.filter(item => (requestFilter === 'all' || item.status === requestFilter) && [item.title, item.author, item.requested_by?.full_name, item.requested_by?.email].some(value => String(value || '').toLowerCase().includes(searchTerm)))
    const matchingOutputs = outputs.filter(item => [item.title, item.author, item.output_type, item.year].some(value => String(value || '').toLowerCase().includes(searchTerm)))
    const matchingUsers = users.filter(item => [item.first_name, item.last_name, `${item.first_name} ${item.last_name}`, item.email, item.department, item.role].some(value => String(value || '').toLowerCase().includes(searchTerm)))
    const selectTab = key => { setTab(key); setSearch('') }
    const onTabKeyDown = (event, index) => {
        let next = index
        if (event.key === 'ArrowRight') next = (index + 1) % MANAGEMENT_TABS.length
        else if (event.key === 'ArrowLeft') next = (index - 1 + MANAGEMENT_TABS.length) % MANAGEMENT_TABS.length
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = MANAGEMENT_TABS.length - 1
        else return
        event.preventDefault()
        selectTab(MANAGEMENT_TABS[next][0])
        document.getElementById(`management-tab-${MANAGEMENT_TABS[next][0]}`)?.focus()
    }

    const statusBadge = (o) => {
        if (o.is_approved) return <span className="badge badge-green">Approved</span>
        if (o.is_rejected) return <span className="badge" style={{ background: 'rgba(248,81,73,0.12)', color: 'var(--danger)' }}>Rejected</span>
        return <span className="badge badge-yellow">Pending</span>
    }

    const requestStatusBadge = (submission) => {
        if (submission.status === 'approved') return <span className="badge badge-green">Approved</span>
        if (submission.status === 'rejected') return <span className="badge" style={{ background: 'rgba(248,81,73,0.12)', color: 'var(--danger)' }}>Rejected</span>
        if (submission.status === 'revision_requested') return <span className="badge badge-yellow">Revision requested</span>
        return <span className="badge badge-blue">Queue #{submission.queue_position}</span>
    }

    const submissionTypeLabel = (value) => ({
        research_paper: 'Research paper',
        executable_system: 'Executable system',
        paper_and_system: 'Paper + system',
    }[value] || value)

    return (
        <div className="layout workspace-layout management-page">
            <Sidebar />
            <main id="main-content" tabIndex={-1} className="main-content workspace-content">
                <WorkspaceHeader title="Management" eyebrow="Administration" />

                <div className="page-body workspace-page-body">
                    <WorkspaceBanner compact eyebrow="Support your research community"
                        title={<>Help good research <span>find its audience.</span></>}
                        description="Review submissions, manage your community, and bring approved systems online."
                    />
                    <div className="workspace-section-toolbar">
                        <div><h2>Community overview</h2><p>Research, submissions, and the people behind them.</p></div>
                    <div className="management-header-actions">
                        <button className="btn btn-ghost btn-sm" onClick={exportCSV}><FileText size={15} /> Export CSV</button>
                        <button className="btn btn-ghost btn-sm" onClick={backup}><Download size={15} /> Export JSON</button>
                        <input
                            ref={restoreInputRef}
                            type="file"
                            accept="application/json,.json"
                            hidden
                            onChange={(e) => restoreBackup(e.target.files[0])}
                        />
                        <button className="btn btn-ghost btn-sm" onClick={() => restoreInputRef.current?.click()}><Upload size={15} /> Restore JSON</button>
                    </div>
                    </div>
                    <div className="management-stats">
                        {[['Upload requests', requestsLoading ? '—' : requests.length, 'var(--accent)', <ClipboardList key="0" size={22} />],
                        ['Awaiting review', requestsLoading ? '—' : pendingRequests.length, '#926e2b', <Clock key="1" size={22} />],
                        ['Published', loadingO ? '—' : approved.length, 'var(--accent)', <CheckCircle key="2" size={22} />],
                        ['Legacy pending', loadingO ? '—' : pending.length, '#926e2b', <Clock key="3" size={22} />],
                        ['Rejected outputs', loadingO ? '—' : rejected.length, 'var(--danger)', <XCircle key="4" size={22} />],
                        ['Community members', loadingU ? '—' : users.length, 'var(--text)', <Users key="5" size={22} />]].map(([l, v, c, icon]) => (
                            <div key={l} className={`management-stat ${l === 'Awaiting review' ? 'is-priority' : ''}`}>
                                <span className="management-stat-top"><span className="workspace-stat-icon" style={{ color: c }} aria-hidden="true">{icon}</span>{l}</span>
                                <span className="management-stat-value" style={{ color: c }}>{v}</span>
                            </div>
                        ))}
                    </div>

                    {/* Tabs */}
                    <div className="management-tabs" role="tablist" aria-label="Management areas">
                        {MANAGEMENT_TABS.map(([key, label, Icon], index) => (
                            <button key={key} id={`management-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`management-panel-${key}`} tabIndex={tab === key ? 0 : -1} onClick={() => selectTab(key)} onKeyDown={event => onTabKeyDown(event, index)}>
                                <Icon size={15} /> {label}{key === 'requests' && pendingRequests.length > 0 && <span className="management-tab-count">{pendingRequests.length}</span>}
                            </button>
                        ))}
                    </div>

                    <section id={`management-panel-${tab}`} role="tabpanel" aria-labelledby={`management-tab-${tab}`} tabIndex={0}>
                    {['requests', 'outputs', 'users', 'academic'].includes(tab) && <div className="management-section-heading"><div>
                        <h2>{{ requests: 'Submission queue', outputs: 'Legacy research outputs', users: 'Your research community', academic: 'Departments & courses' }[tab]}</h2>
                        <p>{{ requests: 'Review research files and move each submission forward.', outputs: 'Manage research added through the legacy publishing workflow.', users: 'Manage account approvals, roles, and access.', academic: 'Keep the academic structure of your repository organized.' }[tab]}</p>
                    </div></div>}
                    {['requests', 'outputs', 'users'].includes(tab) && <div className="management-toolbar">
                        <label className="management-search"><Search size={17} /><input className="form-input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={tab === 'users' ? 'Search name, email, or role…' : 'Search title or author…'} aria-label={tab === 'users' ? 'Search community members' : 'Search research submissions'} /></label>
                        {tab === 'requests' && <select className="form-input" aria-label="Filter submission status" value={requestFilter} onChange={event => setRequestFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Awaiting review</option><option value="revision_requested">Revision requested</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>}
                        <span className="management-results" role="status">{(tab === 'requests' ? requestsLoading : tab === 'users' ? loadingU : loadingO) ? 'Loading…' : `${tab === 'requests' ? matchingRequests.length : tab === 'users' ? matchingUsers.length : matchingOutputs.length} results`}</span>
                    </div>}

                    {tab === 'hosting' && <TemporaryHostingPanel isAdmin />}

                    {tab === 'requests' && (
                        <div>
                            <div className="management-queue-note">
                                <ClipboardList size={20} />
                                <div><strong>First-come, first-served queue</strong>
                                <p>
                                    View the submitted files before deciding, and process queue #1 first. Approval publishes the attachments and saves an included ZIP as the research’s default system configuration.
                                </p></div>
                            </div>
                            <div className="management-table" role="region" aria-label="Submission requests" tabIndex={0}>
                                {requestsLoading ? <div className="spinner" /> : (
                                    <table className="table">
                                        <thead><tr><th>Queue</th><th>Requested</th><th>Title / requester</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
                                        <tbody>
                                            {matchingRequests.length === 0 && <tr><td colSpan={6} className="management-empty"><strong>{requests.length ? 'No matching submissions' : 'Your review queue is clear'}</strong><p>{requests.length ? 'Try a different search or status filter.' : 'New research requests will appear here when they are submitted.'}</p></td></tr>}
                                            {matchingRequests.map((submission) => {
                                                const isNext = submission.status === 'pending' && submission.queue_position === 1
                                                return (
                                                    <tr key={submission.id} className={isNext ? 'is-next' : ''}>
                                                        <td style={{ fontWeight: 700 }}>{submission.queue_position ? `#${submission.queue_position}` : '—'}</td>
                                                        <td className="text-sm text-muted">{new Date(submission.queued_at).toLocaleString()}</td>
                                                        <td style={{ maxWidth: 280 }}>
                                                            <strong>{submission.title}</strong>
                                                            <div className="text-sm text-muted">{submission.requested_by?.full_name || submission.requested_by?.email} · {submission.author}</div>
                                                            {submission.admin_comment && <div className="text-sm" style={{ color: 'var(--text2)', marginTop: 4 }}>Comment: {submission.admin_comment}</div>}
                                                        </td>
                                                        <td><span className="badge badge-gray">{submissionTypeLabel(submission.submission_type)}</span></td>
                                                        <td>{requestStatusBadge(submission)}</td>
                                                        <td>
                                                            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 6 }} onClick={() => setRequestPreview(submission)}><FileText size={13} /> Review files</button>
                                                            {submission.status === 'pending' ? (
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                                    <button className="btn btn-sm" disabled={!isNext} title={!isNext ? 'Process the earlier request first' : ''} style={{ background: 'rgba(46,168,108,0.1)', color: 'var(--accent2)' }} onClick={() => openRequestReview(submission, 'approve')}>
                                                                        <CheckCircle size={13} /> Approve
                                                                    </button>
                                                                    <button className="btn btn-sm btn-ghost" disabled={!isNext} onClick={() => openRequestReview(submission, 'revision')}>
                                                                        <RotateCcw size={13} /> Revise
                                                                    </button>
                                                                    <button className="btn btn-sm" disabled={!isNext} style={{ background: 'rgba(248,81,73,0.1)', color: 'var(--danger)' }} onClick={() => openRequestReview(submission, 'reject')}>
                                                                        <XCircle size={13} /> Reject
                                                                    </button>
                                                                </div>
                                                            ) : submission.published_archive_id ? (
                                                                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/archives/${submission.published_archive_id}`)}>View publication</button>
                                                            ) : '—'}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    )}

                    {tab === 'outputs' && (
                        <div className="management-table" role="region" aria-label="Legacy research outputs" tabIndex={0}>
                            {loadingO ? <div className="spinner" /> : (
                                <table className="table">
                                    <thead><tr><th>Title</th><th>Author</th><th>Type</th><th>Year</th><th>Status</th><th>Actions</th></tr></thead>
                                    <tbody>
                                        {matchingOutputs.length === 0 && <tr><td colSpan={6} className="management-empty"><strong>{outputs.length ? 'No matching research' : 'No legacy outputs yet'}</strong><p>{outputs.length ? 'Try a different title or author.' : 'Research from the legacy publishing workflow appears here.'}</p></td></tr>}
                                        {matchingOutputs.map(o => (
                                            <tr key={o.id}>
                                                <td style={{ fontWeight: 600, maxWidth: 260 }}><button className="management-text-button" onClick={() => navigate('/repository')}>{o.title}</button></td>
                                                <td className="text-sm text-muted">{o.author}</td>
                                                <td><span className="badge badge-blue text-xs">{o.output_type}</span></td>
                                                <td className="text-sm text-muted">{o.year}</td>
                                                <td>{statusBadge(o)}</td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: 6 }}>
                                                        {!o.is_approved && (
                                                            <button className="btn btn-sm" style={{ background: 'rgba(46,168,108,0.1)', color: 'var(--accent2)' }} onClick={() => approve(o.id)}>
                                                                <CheckCircle size={13} /> Approve
                                                            </button>
                                                        )}
                                                        {!o.is_rejected && (
                                                            <button className="btn btn-sm" style={{ background: 'rgba(248,81,73,0.1)', color: 'var(--danger)' }} onClick={() => openRejectModal(o)}>
                                                                <XCircle size={13} /> Reject
                                                            </button>
                                                        )}
                                                        {o.is_approved && (
                                                            <button className="btn btn-sm" style={{ background: 'rgba(248,81,73,0.07)', color: 'var(--danger)', fontSize: '0.78rem' }} onClick={() => openRejectModal(o)}>
                                                                Unapprove
                                                            </button>
                                                        )}
                                                        <button className="btn btn-sm" style={{ background: 'rgba(27,94,32,0.08)', color: 'var(--accent)' }} title="Download latest file" aria-label={`Download ${o.title}`} onClick={(e) => {
                                                            e.stopPropagation()
                                                            const token = localStorage.getItem('access_token')
                                                            fetch(apiUrl(`/repository/${o.id}/download/`), { headers: { Authorization: `Bearer ${token}` } })
                                                                .then(r => r.blob()).then(blob => {
                                                                    const href = URL.createObjectURL(blob)
                                                                    const a = document.createElement('a')
                                                                    a.href = href; a.download = ''; a.click(); URL.revokeObjectURL(href)
                                                                    toast.success('Download started!')
                                                                }).catch(() => toast.error('Download failed.'))
                                                        }}>
                                                            <Download size={13} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {tab === 'users' && (
                        <div className="management-table" role="region" aria-label="Community members" tabIndex={0}>
                            {loadingU ? <div className="spinner" /> : (
                                <table className="table">
                                    <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Role</th><th>Account</th><th>Status</th><th>Joined</th></tr></thead>
                                    <tbody>
                                        {matchingUsers.length === 0 && <tr><td colSpan={7} className="management-empty"><strong>{users.length ? 'No matching members' : 'No community members yet'}</strong><p>{users.length ? 'Search by name, email, department, or role.' : 'Registered accounts will appear here.'}</p></td></tr>}
                                        {matchingUsers.map(u => (
                                            <tr key={u.id}>
                                                <td style={{ fontWeight: 600 }}>{u.first_name} {u.last_name}</td>
                                                <td className="text-sm text-muted">{u.email}</td>
                                                <td className="text-sm text-muted">{u.department || '—'}</td>
                                                <td>
                                                    <select value={u.role} aria-label={`Role for ${u.first_name} ${u.last_name}`} onChange={e => updateRole(u.id, e.target.value)} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '4px 8px', fontSize: '0.82rem' }}>
                                                        {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                                                    </select>
                                                </td>
                                                <td>
                                                    {u.is_account_approved
                                                        ? <span className="badge badge-green">Approved</span>
                                                        : (
                                                            <button className="btn btn-sm" style={{ background: 'rgba(46,168,108,0.1)', color: 'var(--accent2)', fontSize: '0.78rem' }} onClick={() => toggleApproveAccount(u)}>
                                                                Approve Account
                                                            </button>
                                                        )}
                                                </td>
                                                <td>
                                                    <button className="btn btn-sm" style={{ background: u.is_active ? 'rgba(248,81,73,0.1)' : 'rgba(46,168,108,0.1)', color: u.is_active ? 'var(--danger)' : 'var(--accent2)' }} onClick={() => toggleActive(u)}>
                                                        {u.is_active ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                </td>
                                                <td className="text-sm text-muted">{new Date(u.date_joined).toLocaleDateString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {tab === 'academic' && (
                        <div className="admin-academic-grid">
                            <div className="card">
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 14 }}>Departments</h3>
                                <form className="management-department-form" onSubmit={addDepartment}>
                                    <input className="form-input" aria-label="New department name" required value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} placeholder="New department" />
                                    <button className="btn btn-primary btn-sm" type="submit"><Plus size={14} /> Add</button>
                                </form>
                                {academicLoading ? <div className="spinner" /> : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {departments.length === 0 && <p className="management-academic-empty">Add a department to organize your research community.</p>}
                                        {departments.map((department) => (
                                            <div key={department.id} className="management-academic-row">
                                                <div>
                                                    <strong>{department.name}</strong>
                                                    <div>{department.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</div>
                                                </div>
                                                <button className="btn btn-sm btn-ghost" onClick={() => toggleDepartment(department)}>
                                                    {department.is_active ? 'Deactivate' : 'Activate'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="card">
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 14 }}>Courses</h3>
                                <form className="admin-course-form" onSubmit={addCourse}>
                                    <input className="form-input" aria-label="New course name" required value={courseForm.name} onChange={(e) => setCourseForm((form) => ({ ...form, name: e.target.value }))} placeholder="New course" />
                                    <select className="form-input" aria-label="Department for new course" value={courseForm.department} onChange={(e) => setCourseForm((form) => ({ ...form, department: e.target.value }))}>
                                        <option value="">No department</option>
                                        {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                                    </select>
                                    <button className="btn btn-primary btn-sm" type="submit"><Plus size={14} /> Add</button>
                                </form>
                                {academicLoading ? <div className="spinner" /> : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {courses.length === 0 && <p className="management-academic-empty">Add courses and connect them to their departments.</p>}
                                        {courses.map((course) => (
                                            <div key={course.id} className="management-academic-row">
                                                <div>
                                                    <strong>{course.name}</strong>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                                                        <span className="badge badge-blue">{course.department_name || 'No department'}</span>
                                                        {course.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}
                                                    </div>
                                                </div>
                                                <button className="btn btn-sm btn-ghost" onClick={() => toggleCourse(course)}>
                                                    {course.is_active ? 'Deactivate' : 'Activate'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    </section>
                <WorkspaceFooter />
                </div>
            </main>

            {requestPreview && (
                <ManagementDialog label="Review submitted files" className="management-modal--preview" onClose={() => setRequestPreview(null)}>
                        <div className="management-modal-heading">
                            <div><span className="management-eyebrow">SUBMITTED FILES</span><h3>{requestPreview.title}</h3></div>
                            <button className="btn btn-ghost btn-sm" aria-label="Close preview" onClick={() => setRequestPreview(null)}><X size={18} /></button>
                        </div>
                        <p className="text-sm text-muted" style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}>{requestPreview.abstract || 'No abstract provided.'}</p>
                        {requestPreview.system_details && <p className="text-sm" style={{ marginBottom: 12, whiteSpace: 'pre-wrap' }}><strong>System details:</strong> {requestPreview.system_details}</p>}
                        <SubmissionAttachments key={requestPreview.id} submission={requestPreview} autoPreview />
                        {requestPreview.status === 'pending' && requestPreview.queue_position === 1 && <div className="management-modal-footer">
                            <button className="btn btn-primary btn-sm" onClick={() => openRequestReview(requestPreview, 'approve')}><CheckCircle size={14} /> Approve request</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => openRequestReview(requestPreview, 'revision')}><RotateCcw size={14} /> Return for revision</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => openRequestReview(requestPreview, 'reject')}><XCircle size={14} /> Reject request</button>
                        </div>}
                </ManagementDialog>
            )}

            {requestReview && (
                <ManagementDialog label="Decide submission request" onClose={() => setRequestReview(null)} busy={requestReviewLoading}>
                        <div className="management-modal-heading"><div><span className="management-eyebrow">REVIEW DECISION</span><h3 style={{ textTransform: 'capitalize' }}>
                            {requestReview.action === 'revision' ? 'Return for revision' : `${requestReview.action} request`}
                        </h3></div><button className="btn btn-ghost btn-sm" aria-label="Close decision dialog" onClick={() => setRequestReview(null)} disabled={requestReviewLoading}><X size={18} /></button></div>
                        <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginBottom: 16 }}>
                            Queue #1: <strong style={{ color: 'var(--text)' }}>{requestReview.submission.title}</strong>
                        </p>

                        <SubmissionAttachments key={requestReview.submission.id} submission={requestReview.submission} autoPreview />
                        {requestReview.action === 'approve' && requestReview.submission.has_system_file && <p className="text-sm" style={{ margin: '14px 0', color: 'var(--accent)' }}>The submitted ZIP will be saved as the default configuration for this research. You can run it from the published archive.</p>}

                        {requestReview.action === 'approve' && (
                            <div style={{ display: 'grid', gap: 14, marginBottom: 14 }}>
                                {requestReview.submission.submission_type !== 'executable_system' && !requestReview.submission.has_research_file && (
                                    <div className="form-group">
                                        <label className="form-label" htmlFor="review-research-file">Research paper (PDF) *</label>
                                        <input id="review-research-file" className="form-input" type="file" accept="application/pdf,.pdf" onChange={(event) => setRequestResearchFile(event.target.files[0] || null)} />
                                    </div>
                                )}
                                {requestReview.submission.submission_type !== 'research_paper' && (
                                    <>
                                        {!requestReview.submission.has_system_file && <div className="form-group">
                                            <label className="form-label" htmlFor="review-system-file">Executable system (ZIP) *</label>
                                            <input id="review-system-file" className="form-input" type="file" accept="application/zip,.zip" onChange={(event) => setRequestSystemFile(event.target.files[0] || null)} />
                                        </div>}
                                        <div className="form-group">
                                            <label className="form-label" htmlFor="review-system-link">Published system link</label>
                                            <input id="review-system-link" className="form-input" type="url" value={requestSystemLink} onChange={(event) => setRequestSystemLink(event.target.value)} placeholder="https://example.com/system" />
                                        </div>
                                        {requestReview.submission.system_details && (
                                            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12, fontSize: '0.85rem' }}>
                                                <strong>Student handoff details</strong>
                                                <p style={{ color: 'var(--text2)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{requestReview.submission.system_details}</p>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        <div className="form-group">
                            <label className="form-label" htmlFor="request-review-comment">
                                Administrator comment {requestReview.action !== 'approve' && <span style={{ color: 'var(--danger)' }}>*</span>}
                            </label>
                            <textarea id="request-review-comment" className="form-textarea" rows={4} value={requestComment} onChange={(event) => setRequestComment(event.target.value)} placeholder="Record the decision or revision instructions." autoFocus={requestReview.action !== 'approve'} />
                        </div>
                        <div className="management-modal-footer">
                            <button className="btn btn-ghost btn-sm" onClick={() => setRequestReview(null)} disabled={requestReviewLoading}>Cancel</button>
                            <button className="btn btn-primary btn-sm" onClick={submitRequestReview} disabled={requestReviewLoading}>
                                {requestReviewLoading ? 'Processing…' : 'Confirm decision'}
                            </button>
                        </div>
                </ManagementDialog>
            )}

            {/* Rejection Modal */}
            {rejectTarget && (
                <ManagementDialog label="Reject research output" className="management-modal--reject" onClose={() => setRejectTarget(null)} busy={rejectLoading}>
                        <div className="management-modal-heading"><h3>
                            <XCircle size={16} style={{ marginRight: 8, color: 'var(--danger)', verticalAlign: 'middle' }} />
                            Reject Output
                        </h3><button className="btn btn-ghost btn-sm" aria-label="Close rejection dialog" onClick={() => setRejectTarget(null)} disabled={rejectLoading}><X size={18} /></button></div>
                        <p style={{ color: 'var(--text2)', fontSize: '0.85rem', marginBottom: 16 }}>
                            You are rejecting: <strong style={{ color: 'var(--text)' }}>{rejectTarget.title}</strong>
                        </p>
                        <div className="form-group">
                            <label className="form-label" htmlFor="legacy-rejection-reason">Reason for rejection <span style={{ color: 'var(--danger)' }}>*</span></label>
                            <textarea
                                id="legacy-rejection-reason"
                                className="form-textarea"
                                rows={4}
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                placeholder="Explain why this submission is not approved, so the uploader can revise and resubmit…"
                                autoFocus
                            />
                        </div>
                        <div className="management-modal-footer">
                            <button className="btn btn-ghost btn-sm" onClick={() => setRejectTarget(null)} disabled={rejectLoading}>Cancel</button>
                            <button className="btn btn-sm" style={{ background: 'rgba(248,81,73,0.15)', color: 'var(--danger)' }} onClick={submitRejection} disabled={rejectLoading}>
                                {rejectLoading ? 'Rejecting…' : 'Confirm Rejection'}
                            </button>
                        </div>
                </ManagementDialog>
            )}
        </div>
    )
}
