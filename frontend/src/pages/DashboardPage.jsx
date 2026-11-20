import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from '../components/Sidebar'
import WorkspaceHeader from '../components/WorkspaceHeader'
import WorkspaceBanner from '../components/WorkspaceBanner'
import WorkspaceFooter from '../components/WorkspaceFooter'
import api from '../api/axios'
import { BookOpen, CheckCircle2, Clock3, CloudUpload, FileText, FolderOpen, Lightbulb, RefreshCw, Upload, XCircle } from 'lucide-react'
import '../styles/research-pages.css'

function activityDate(iso) {
    if (!iso) return 'Recently added'
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return 'Recently added'
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusBadge(doc) {
    if (doc.is_approved) return <span className="badge badge-green">Approved</span>
    if (doc.is_rejected && doc.revision_comment && !doc.rejection_reason) return <span className="badge badge-yellow">Revision requested</span>
    if (doc.is_rejected) return <span className="badge badge-red">Rejected</span>
    return <span className="badge badge-yellow">Pending review</span>
}

const METRICS = [
    { key: 'total', label: 'Research outputs', icon: FileText, tone: 'green', note: 'Available to your account' },
    { key: 'approved', label: 'Approved', icon: CheckCircle2, tone: 'green', note: 'Reviewed and approved' },
    { key: 'pending', label: 'Pending review', icon: Clock3, tone: 'amber', note: 'Awaiting a decision' },
    { key: 'rejected', label: 'Rejected', icon: XCircle, tone: 'rose', note: 'Reviewed with feedback' },
    { key: 'my_uploads', label: 'My uploads', icon: CloudUpload, tone: 'blue', note: 'Your research contributions' },
]

function ResearchHelpArtwork() {
    return (
        <svg className="dashboard-help-art" viewBox="0 0 220 240" aria-hidden="true" focusable="false">
            <path d="M123 224C122 140 151 44 195 37C219 34 184 101 161 141C141 177 135 201 134 226Z" fill="#bbdbb2" />
            <path d="M169 231C159 155 183 90 219 82V237Z" fill="#5db96d" />
            <path d="M188 123C174 158 177 192 180 222" fill="none" stroke="#2f8b52" strokeWidth="2" />
            <ellipse cx="134" cy="219" rx="82" ry="13" fill="#1c683c" opacity=".13" />
            <path d="M45 190L150 170L206 191L103 216Z" fill="#075640" />
            <path d="M49 174L148 157L199 173V194L101 212L49 193Z" fill="#f8faf0" stroke="#a6c3a0" strokeWidth="2" />
            <path d="M45 171L148 151L205 171L102 193Z" fill="#24673c" />
            <path d="M56 188L101 203L190 187" fill="none" stroke="#ccd9bd" strokeWidth="2" />
            <path d="M43 148L144 130L195 148V170L94 188L43 170Z" fill="#fbfcf5" stroke="#acc5a5" strokeWidth="2" />
            <path d="M39 144L143 124L202 144L95 167Z" fill="#86b575" />
            <path d="M50 163L95 178L189 161" fill="none" stroke="#d1dcc7" strokeWidth="2" />
            <path d="M53 123L148 106L198 124V144L103 162L53 145Z" fill="#f9fbf1" stroke="#b0c6aa" strokeWidth="2" />
            <path d="M46 119L147 100L204 120L103 143Z" fill="#00523d" />
            <path d="M62 139L104 152L190 137" fill="none" stroke="#cfdbc1" strokeWidth="2" />
            <path d="M151 101L177 131" stroke="#073f32" strokeWidth="13" strokeLinecap="round" />
            <circle cx="131" cy="77" r="35" fill="#d6f2dc" fillOpacity=".85" stroke="#075b44" strokeWidth="7" />
            <circle cx="131" cy="77" r="28" fill="none" stroke="#7dab92" strokeWidth="2" />
            <path d="M113 71C116 58 127 53 139 58" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="5" strokeLinecap="round" />
            <path d="M93 24L84 10M115 16L111 0M140 16L145 2M166 29L177 17M79 48L65 42" fill="none" stroke="#217b42" strokeWidth="4" strokeLinecap="round" />
        </svg>
    )
}

export default function DashboardPage() {
    const { user } = useAuth()
    const [stats, setStats] = useState(null)
    const [recent, setRecent] = useState([])
    const [archives, setArchives] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [retry, setRetry] = useState(0)
    const isAdmin = user?.role === 'admin'
    const canSubmit = isAdmin || user?.role === 'student'
    const firstName = user?.first_name || user?.full_name?.split(' ')[0] || 'researcher'

    useEffect(() => {
        const controller = new AbortController()
        setLoading(true)
        setError('')
        Promise.all([
            api.get('/repository/stats/', { signal: controller.signal }),
            api.get('/repository/?page_size=5', { signal: controller.signal }),
            api.get('/repository/archives/?page_size=12&activity_feed=true', { signal: controller.signal }),
        ]).then(([overview, outputs, archiveResponse]) => {
            if (controller.signal.aborted) return
            setStats(overview.data)
            setRecent((outputs.data.results || outputs.data || []).slice(0, 4))
            const items = archiveResponse.data.results || archiveResponse.data || []
            setArchives(items.slice().sort((first, second) => new Date(second.updated_at || second.uploaded_at) - new Date(first.updated_at || first.uploaded_at)).slice(0, 2))
        }).catch(() => {
            if (!controller.signal.aborted) setError('Your workspace couldn’t be loaded. Check your connection and try again.')
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false)
        })
        return () => controller.abort()
    }, [user?.id, retry])

    return (
        <div className="layout workspace-layout">
            <Sidebar />
            <main id="main-content" tabIndex={-1} className="main-content research-dashboard workspace-content">
                <WorkspaceHeader recent={recent} pendingCount={stats?.pending ?? 0} loading={loading} error={error} />
                <div className="page-body dashboard-body">
                    <WorkspaceBanner
                        eyebrow="A place for ideas to grow"
                        title={<>Welcome back, <span>{firstName}.</span></>}
                        description={isAdmin ? 'Support your research community. Review submissions, publish work, and keep knowledge moving forward.' : 'Pick up where you left off. Discover research, follow your progress, and share what you’re working on.'}
                        actions={<>
                            <Link className="btn dashboard-hero-primary" to={isAdmin ? '/admin' : '/repository'}>{isAdmin ? <FileText size={20} aria-hidden="true" /> : <BookOpen size={20} aria-hidden="true" />}{isAdmin ? 'Manage submissions' : 'Explore repository'}</Link>
                            {canSubmit && <Link className="btn dashboard-hero-secondary" to="/upload"><Upload size={20} aria-hidden="true" />{isAdmin ? 'Publish research' : 'Request upload'}</Link>}
                        </>}
                    />

                    {error && <div className="research-error" role="alert"><span>{error}</span><button type="button" className="btn btn-ghost" onClick={() => setRetry(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />Try again</button></div>}
                    <section className="dashboard-metrics" aria-label="Research output overview" aria-busy={loading}>
                        {METRICS.map(({ key, label, icon: Icon, tone, note }) => <article className={`dashboard-metric ${tone}`} key={key} aria-label={label}>
                            <span className="dashboard-metric-icon"><Icon size={28} aria-hidden="true" /></span>
                            <div className="dashboard-metric-content">
                                <h3>{label}</h3>
                                {loading ? <span className="research-placeholder research-placeholder-number" /> : <strong>{error ? '—' : stats?.[key]?.toLocaleString() ?? '—'}</strong>}
                                <p>{note}</p>
                            </div>
                        </article>)}
                    </section>

                    <div className="dashboard-content-grid">
                        <section className="dashboard-recent" aria-labelledby="recent-research-title" aria-busy={loading}>
                            <div className="dashboard-section-heading">
                                <h2 id="recent-research-title"><span><FileText size={22} aria-hidden="true" /></span>Recent Research</h2>
                                <Link to="/repository">View all</Link>
                            </div>
                            {loading ? <div className="research-list-skeleton" role="status"><span className="sr-only">Loading recent research</span>{[1, 2].map(item => <div key={item}><span className="research-placeholder" /><span className="research-placeholder short" /></div>)}</div> : error ? <div className="dashboard-empty"><RefreshCw size={28} aria-hidden="true" /><h3>Research is temporarily unavailable</h3><p>Use Try again above to reload your workspace.</p></div> : archives.length ? <div className="dashboard-recent-list">{archives.map(doc => <article key={doc.id} className="dashboard-recent-row">
                                <span className="dashboard-document-icon"><FileText size={28} aria-hidden="true" /></span>
                                <div className="dashboard-document-copy">
                                    <div className="dashboard-document-meta"><span>{doc.department || 'General research'}</span>{statusBadge(doc)}</div>
                                    <h3><Link to={`/archives/${doc.id}`}>{doc.title}</Link></h3>
                                    <p>{doc.author || doc.uploaded_by?.full_name || 'Research contributor'}<span aria-hidden="true"> · </span>{doc.year || activityDate(doc.uploaded_at)}</p>
                                </div>
                                <Link className="dashboard-document-open" to={`/archives/${doc.id}`} aria-label={`Read ${doc.title}`}><BookOpen size={20} aria-hidden="true" /></Link>
                            </article>)}</div> : <div className="dashboard-empty"><FolderOpen size={32} aria-hidden="true" /><h3>A new home for your research</h3><p>Published research will appear here. Explore the repository or share your first contribution.</p><Link className="btn btn-ghost" to={canSubmit ? '/upload' : '/repository'}>{canSubmit ? 'Submit research' : 'Open repository'}</Link></div>}
                        </section>
                        <aside className="dashboard-help" aria-labelledby="next-step-title">
                            <ResearchHelpArtwork />
                            <div className="dashboard-help-heading"><span><Lightbulb size={30} aria-hidden="true" /></span><strong>Need help?</strong></div>
                            <h2 id="next-step-title">{isAdmin ? 'Help good research find its audience.' : 'Turn your work into shared knowledge.'}</h2>
                            <p>{isAdmin ? 'Review research and system packages, then publish work that’s ready for your community.' : canSubmit ? 'Share your research PDF and system ZIP. Follow your request and bring approved work online.' : 'Explore published studies and discover the ideas and systems behind the research.'}</p>
                            <Link className="btn btn-primary" to={isAdmin ? '/admin' : canSubmit ? '/upload' : '/repository'}>{isAdmin ? 'Open management' : canSubmit ? 'Start a submission' : 'Discover research'}</Link>
                        </aside>
                    </div>

                    <WorkspaceFooter />
                </div>
            </main>
        </div>
    )
}
