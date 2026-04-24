import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import {
    Search, Filter, Link2, Unlink2, ChevronRight, GitBranch,
} from 'lucide-react'

function timeAgo(iso) {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`
    return `${Math.floor(diff / 604800)} weeks ago`
}

function fileKindLabel(filename = '') {
    const ext = filename.includes('.') ? filename.split('.').pop().toUpperCase() : 'FILE'
    return ext
}

function reviewBadge(doc) {
    if (doc.is_approved) return <span className="badge badge-green">Approved</span>
    if (doc.is_rejected && doc.revision_comment && !doc.rejection_reason) return <span className="badge badge-yellow">Revision</span>
    if (doc.is_rejected) return <span className="badge" style={{ background: 'rgba(248,81,73,0.12)', color: 'var(--danger)' }}>Rejected</span>
    return <span className="badge badge-yellow">Pending</span>
}

export default function RepositoryPage() {
    const navigate = useNavigate()
    const [search, setSearch] = useState('')
    const [showFilters, setShowFilters] = useState(false)
    const [archiveFilter, setArchiveFilter] = useState('')
    const [departmentFilter, setDepartmentFilter] = useState('')
    const [courseFilter, setCourseFilter] = useState('')
    const [archives, setArchives] = useState([])
    const [archiveCount, setArchiveCount] = useState(0)
    const [repositories, setRepositories] = useState([])
    const [repositoryCount, setRepositoryCount] = useState(0)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        setLoading(true)
        const archiveParams = new URLSearchParams({
            ...(search && { search }),
            ...(archiveFilter && { linked: archiveFilter }),
            ...(departmentFilter && { department: departmentFilter }),
            ...(courseFilter && { course: courseFilter }),
        })

        const repositoryParams = new URLSearchParams({
            ...(search && { search }),
        })

        Promise.all([
            api.get(`/repository/archives/?${archiveParams}`),
            api.get(`/repository/repos/?${repositoryParams}`),
        ])
            .then(([archiveRes, repositoryRes]) => {
                setArchives(archiveRes.data.results || [])
                setArchiveCount(archiveRes.data.count || 0)
                setRepositories(repositoryRes.data.results || repositoryRes.data || [])
                setRepositoryCount(repositoryRes.data.count || repositoryRes.data?.length || 0)
            })
            .finally(() => setLoading(false))
    }, [search, archiveFilter, departmentFilter, courseFilter])

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Research PDF Repository</h2>
                        <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
                            Browse archived research PDFs in one place.
                        </p>
                    </div>
                    <button className={`btn btn-sm ${showFilters ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setShowFilters((v) => !v)}>
                        <Filter size={14} /> Filter
                    </button>
                </div>

                <div className="page-body repository-feed-page">
                    <div className="repository-hero">
                        <div>
                            <span className="dashboard-kicker">PDF Archive</span>
                            <h3>Browse finalized research documents.</h3>
                            <p>Uploads accept PDF files only, keeping archived documents consistent and easy to review.</p>
                        </div>
                        <div className="repository-hero-stats">
                            <div className="repository-hero-stat">
                                <span>Archived documents</span>
                                <strong>{archiveCount}</strong>
                            </div>
                            <div className="repository-hero-stat">
                                <span>Public repositories</span>
                                <strong>{repositoryCount}</strong>
                            </div>
                            <div className="repository-hero-stat">
                                <span>PDF versions shown</span>
                                <strong>{archives.reduce((sum, doc) => sum + (doc.version_count || 1), 0)}</strong>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="search-bar">
                            <Search size={16} className="search-icon" />
                            <input
                                placeholder="Search archived documents..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        {showFilters && (
                            <div className="repository-filter-panel">
                                <div className="filters repository-filters">
                                    <button className={`btn btn-sm ${archiveFilter === '' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setArchiveFilter('')}>All</button>
                                    <button className={`btn btn-sm ${archiveFilter === 'true' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setArchiveFilter('true')}>
                                        <Link2 size={14} /> With system link
                                    </button>
                                    <button className={`btn btn-sm ${archiveFilter === 'false' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setArchiveFilter('false')}>
                                        <Unlink2 size={14} /> No system link
                                    </button>
                                </div>
                                <div className="grid-2" style={{ marginTop: 12 }}>
                                    <div className="form-group">
                                        <label className="form-label">Department</label>
                                        <input
                                            className="form-input"
                                            placeholder="Filter by department"
                                            value={departmentFilter}
                                            onChange={(e) => setDepartmentFilter(e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Course</label>
                                        <input
                                            className="form-input"
                                            placeholder="Filter by course"
                                            value={courseFilter}
                                            onChange={(e) => setCourseFilter(e.target.value)}
                                        />
                                    </div>
                                </div>
                                {(departmentFilter || courseFilter || archiveFilter) && (
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        style={{ marginTop: 10 }}
                                        onClick={() => {
                                            setArchiveFilter('')
                                            setDepartmentFilter('')
                                            setCourseFilter('')
                                        }}
                                    >
                                        Clear filters
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="repository-feed-layout">
                        <section className="repository-feed-column">
                            {loading ? (
                                <div className="repo-list">
                                    {Array.from({ length: 4 }).map((_, i) => (
                                        <div key={i} className="activity-card">
                                            <div className="skeleton-text h-4 w-32" style={{ marginBottom: 10 }} />
                                            <div className="skeleton-text h-4 w-full" style={{ marginBottom: 10 }} />
                                            <div className="skeleton-text h-4 w-24" />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="repo-list">
                                    {archives.map((doc) => (
                                        <article key={doc.id} className="activity-card archive-card" onClick={() => navigate(`/archives/${doc.id}`)}>
                                            <div className="archive-card-head">
                                                <div className="archive-file-icon">{fileKindLabel(doc.original_filename)}</div>
                                                <div style={{ flex: 1 }}>
                                                    <div className="repository-link" style={{ display: 'inline-block' }}>{doc.title}</div>
                                                    <div className="activity-header-meta">
                                                        Uploaded {timeAgo(doc.uploaded_at)} by {doc.uploaded_by?.full_name || doc.uploaded_by?.email?.split('@')[0] || 'Researcher'}
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="archive-card-copy">{doc.abstract || 'No abstract available for this document.'}</p>
                                            <div className="repository-preview-meta">
                                                <span className="language-chip"><span className="language-dot" style={{ background: '#6e7781' }} /> {fileKindLabel(doc.original_filename)}</span>
                                                <span className="feed-meta-item"><GitBranch size={13} /> v{doc.current_version || 1}</span>
                                                <span className="feed-meta-item">{doc.version_count || 1} version{(doc.version_count || 1) === 1 ? '' : 's'}</span>
                                                <span className={`badge ${doc.is_public ? 'badge-green' : 'badge-gray'}`}>{doc.is_public ? 'Public' : 'Private'}</span>
                                                {reviewBadge(doc)}
                                                {doc.department && <span className="feed-meta-item">{doc.department}</span>}
                                                {doc.course && <span className="feed-meta-item">{doc.course}</span>}
                                                {doc.system_link ? (
                                                    <button
                                                        type="button"
                                                        className="star-button compact"
                                                        onClick={(e) => { e.stopPropagation(); window.open(doc.system_link, '_blank', 'noopener,noreferrer') }}
                                                    >
                                                        Open System Link <ChevronRight size={14} />
                                                    </button>
                                                ) : (
                                                    <span className="feed-meta-item"><Unlink2 size={13} /> No system link</span>
                                                )}
                                            </div>
                                        </article>
                                    ))}
                                    {archives.length === 0 && <div className="empty-state"><h3>No archive documents found</h3></div>}
                                </div>
                            )}
                        </section>

                        <aside className="repository-side-column">
                            <div className="trending-panel repository-guidance-panel">
                                <h3>Public Repositories</h3>
                                <p>Repository records marked public are visible to every signed-in role.</p>
                                <div className="versioned-repository-list">
                                    {loading ? (
                                        Array.from({ length: 3 }).map((_, i) => (
                                            <div key={i} className="versioned-repository-card">
                                                <div className="skeleton-text h-4 w-32" style={{ marginBottom: 10 }} />
                                                <div className="skeleton-text h-4 w-full" />
                                            </div>
                                        ))
                                    ) : repositories.length === 0 ? (
                                        <div className="empty-state compact">
                                            <h3>No public repositories</h3>
                                            <p>Public repositories will appear here once available.</p>
                                        </div>
                                    ) : (
                                        repositories.map((repo) => (
                                            <button
                                                key={repo.id}
                                                type="button"
                                                className="versioned-repository-card"
                                                onClick={() => navigate(`/repository/${repo.id}`)}
                                            >
                                                <div className="versioned-repository-head">
                                                    <span className="versioned-repository-title">{repo.title}</span>
                                                    <span className="badge badge-gray">v{repo.current_version || 0}</span>
                                                </div>
                                                <div className="repository-preview-meta">
                                                    <span className="feed-meta-item"><GitBranch size={13} /> {repo.file_count ?? 0} file{repo.file_count === 1 ? '' : 's'}</span>
                                                    <span className="feed-meta-item"><Link2 size={13} /> {repo.linked_documents_count ?? 0} linked</span>
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                            <div className="trending-panel repository-guidance-panel">
                                <h3>How it works</h3>
                                <p>Uploads are limited to valid PDF files.</p>
                                <p>Open an archive document to upload a revised PDF and review every paper version.</p>
                            </div>
                        </aside>
                    </div>
                </div>
            </div>
        </div>
    )
}
