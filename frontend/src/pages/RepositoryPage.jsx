import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import {
    Search, Filter, MoreHorizontal, Star, GitBranch,
    FileText, Link2, Unlink2, ChevronRight, FolderKanban,
} from 'lucide-react'

function timeAgo(iso) {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`
    return `${Math.floor(diff / 604800)} weeks ago`
}

function initials(name = 'SL') {
    return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()
}

function fileKindLabel(filename = '') {
    const ext = filename.includes('.') ? filename.split('.').pop().toUpperCase() : 'FILE'
    return ext
}

function archiveStatusConfig(doc) {
    if (doc.is_approved) {
        return { label: 'Approved', bg: 'rgba(46,125,50,0.12)', color: '#2E7D32' }
    }
    if (doc.is_rejected) {
        return { label: 'Rejected', bg: 'rgba(198,40,40,0.12)', color: '#c62828' }
    }
    return { label: 'Pending', bg: 'rgba(230,81,0,0.12)', color: '#e65100' }
}

export default function RepositoryPage() {
    const navigate = useNavigate()
    const [module, setModule] = useState('repositories')
    const [search, setSearch] = useState('')
    const [showFilters, setShowFilters] = useState(false)
    const [repoFilter, setRepoFilter] = useState('')
    const [archiveFilter, setArchiveFilter] = useState('')
    const [repositories, setRepositories] = useState([])
    const [archives, setArchives] = useState([])
    const [repoCount, setRepoCount] = useState(0)
    const [archiveCount, setArchiveCount] = useState(0)
    const [loading, setLoading] = useState(true)
    const [starred, setStarred] = useState({})

    useEffect(() => {
        setLoading(true)
        const repoParams = new URLSearchParams({
            ...(search && { search }),
            ...(repoFilter && { has_documents: repoFilter }),
        })
        const archiveParams = new URLSearchParams({
            ...(search && { search }),
            ...(archiveFilter && { linked: archiveFilter }),
        })

        Promise.all([
            api.get(`/repository/repos/?${repoParams}`),
            api.get(`/repository/archives/?${archiveParams}`),
        ]).then(([repoRes, archiveRes]) => {
            setRepositories(repoRes.data.results || [])
            setRepoCount(repoRes.data.count || 0)
            setArchives(archiveRes.data.results || [])
            setArchiveCount(archiveRes.data.count || 0)
        }).finally(() => setLoading(false))
    }, [search, repoFilter, archiveFilter])

    const trendingRepositories = useMemo(
        () => [...repositories].sort((a, b) => (b.linked_documents_count + b.file_count) - (a.linked_documents_count + a.file_count)).slice(0, 5),
        [repositories]
    )

    const toggleStar = (id) => setStarred((current) => ({ ...current, [id]: !current[id] }))

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Research Code & Archive Hub</h2>
                        <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
                            Separate source repositories from research archives while keeping them linked.
                        </p>
                    </div>
                    <button className={`btn btn-sm ${showFilters ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setShowFilters((v) => !v)}>
                        <Filter size={14} /> Filter
                    </button>
                </div>

                <div className="page-body repository-feed-page">
                    <div className="repository-hero">
                        <div>
                            <span className="dashboard-kicker">Dual Module</span>
                            <h3>Keep code repositories and finalized research documents distinct, but connected.</h3>
                            <p>Use repositories for implementation files and archives for theses, PDFs, and reports. Linked items stay traceable across both modules.</p>
                        </div>
                        <div className="repository-hero-stats">
                            <div className="repository-hero-stat">
                                <span>Repositories</span>
                                <strong>{repoCount}</strong>
                            </div>
                            <div className="repository-hero-stat">
                                <span>Archived documents</span>
                                <strong>{archiveCount}</strong>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div className="search-bar">
                            <Search size={16} className="search-icon" />
                            <input
                                placeholder={module === 'repositories' ? 'Search repositories...' : 'Search archived documents...'}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        <div className="profile-tabs-bar" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                            <button type="button" className={`profile-tab ${module === 'repositories' ? 'active' : ''}`} onClick={() => setModule('repositories')}>
                                <GitBranch size={15} /> Repositories <span>{repoCount}</span>
                            </button>
                            <button type="button" className={`profile-tab ${module === 'archives' ? 'active' : ''}`} onClick={() => setModule('archives')}>
                                <FileText size={15} /> Archives <span>{archiveCount}</span>
                            </button>
                        </div>

                        {showFilters && (
                            <div className="repository-filter-panel">
                                {module === 'repositories' ? (
                                    <div className="filters repository-filters">
                                        <button className={`btn btn-sm ${repoFilter === '' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setRepoFilter('')}>All</button>
                                        <button className={`btn btn-sm ${repoFilter === 'true' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setRepoFilter('true')}>
                                            <Link2 size={14} /> With linked docs
                                        </button>
                                        <button className={`btn btn-sm ${repoFilter === 'false' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setRepoFilter('false')}>
                                            <Unlink2 size={14} /> Without linked docs
                                        </button>
                                    </div>
                                ) : (
                                    <div className="filters repository-filters">
                                        <button className={`btn btn-sm ${archiveFilter === '' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setArchiveFilter('')}>All</button>
                                        <button className={`btn btn-sm ${archiveFilter === 'true' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setArchiveFilter('true')}>
                                            <Link2 size={14} /> Linked
                                        </button>
                                        <button className={`btn btn-sm ${archiveFilter === 'false' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setArchiveFilter('false')}>
                                            <Unlink2 size={14} /> Unlinked
                                        </button>
                                    </div>
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
                            ) : module === 'repositories' ? (
                                <div className="repo-list">
                                    {repositories.map((repo) => {
                                        const ownerName = repo.created_by?.full_name || repo.created_by?.email?.split('@')[0] || 'Researcher'
                                        const isStarred = Boolean(starred[repo.id])
                                        return (
                                            <article key={repo.id} className="activity-card">
                                                <div className="activity-header">
                                                    <div className="repository-avatar">{initials(ownerName)}</div>
                                                    <div className="activity-header-copy">
                                                        <div className="activity-header-line">
                                                            <strong>{ownerName}</strong>
                                                            <span>created a repository</span>
                                                        </div>
                                                        <div className="activity-header-meta">{timeAgo(repo.created_at)}</div>
                                                    </div>
                                                    <button className="icon-button" type="button"><MoreHorizontal size={16} /></button>
                                                </div>

                                                <div className="repository-preview-card" onClick={() => navigate(`/repository/${repo.id}`)}>
                                                    <div className="repository-preview-main">
                                                        <div className="repository-preview-title-row">
                                                            <button type="button" className="repository-link" onClick={(e) => { e.stopPropagation(); navigate(`/repository/${repo.id}`) }}>
                                                                {repo.title}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className={`star-button ${isStarred ? 'active' : ''}`}
                                                                onClick={(e) => { e.stopPropagation(); toggleStar(repo.id) }}
                                                            >
                                                                <Star size={15} fill={isStarred ? 'currentColor' : 'none'} />
                                                                {isStarred ? 'Starred' : 'Star'}
                                                            </button>
                                                        </div>
                                                        <div className="repository-owner-line">{repo.created_by?.email?.split('@')[0] || 'researcher'}/{repo.title.toLowerCase().replace(/\s+/g, '-')}</div>
                                                        <div className="repository-preview-summary">{repo.description || 'No repository description yet.'}</div>
                                                        <div className="repository-preview-meta">
                                                            <span className="language-chip"><span className="language-dot" style={{ background: '#3572A5' }} /> Source code</span>
                                                            <span className="feed-meta-item"><FolderKanban size={13} /> {repo.file_count} file versions</span>
                                                            <span className="feed-meta-item"><Link2 size={13} /> {repo.linked_documents_count} linked documents</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </article>
                                        )
                                    })}
                                    {repositories.length === 0 && <div className="empty-state"><h3>No repositories found</h3></div>}
                                </div>
                            ) : (
                                <div className="repo-list">
                                    {archives.map((doc) => (
                                        <article key={doc.id} className="activity-card archive-card" onClick={() => navigate(`/archives/${doc.id}`)}>
                                            {(() => {
                                                const status = archiveStatusConfig(doc)
                                                return (
                                            <div className="archive-card-head">
                                                <div className="archive-file-icon">{fileKindLabel(doc.original_filename)}</div>
                                                <div style={{ flex: 1 }}>
                                                    <div className="repository-link" style={{ display: 'inline-block' }}>{doc.title}</div>
                                                    <div className="activity-header-meta">
                                                        Uploaded {timeAgo(doc.uploaded_at)} by {doc.uploaded_by?.full_name || doc.uploaded_by?.email?.split('@')[0] || 'Researcher'}
                                                    </div>
                                                </div>
                                                <span style={{
                                                    background: status.bg,
                                                    color: status.color,
                                                    borderRadius: 999,
                                                    padding: '4px 10px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                }}>
                                                    {status.label}
                                                </span>
                                            </div>
                                                )
                                            })()}
                                            <p className="archive-card-copy">{doc.abstract || 'No abstract available for this document.'}</p>
                                            <div className="repository-preview-meta" style={{ marginBottom: 10 }}>
                                                <span className="feed-meta-item"><FileText size={13} /> {doc.author || 'Unknown author'}</span>
                                                <span className="feed-meta-item">{doc.department || 'No department'}</span>
                                                <span className="feed-meta-item">{doc.course || 'No course'}</span>
                                                <span className="feed-meta-item">{doc.year || 'No year'}</span>
                                            </div>
                                            <div className="repository-preview-meta">
                                                <span className="language-chip"><span className="language-dot" style={{ background: '#6e7781' }} /> {fileKindLabel(doc.original_filename)}</span>
                                                {doc.linked_repository ? (
                                                    <button
                                                        type="button"
                                                        className="star-button compact"
                                                        onClick={(e) => { e.stopPropagation(); navigate(`/repository/${doc.linked_repository.id}`) }}
                                                    >
                                                        View Repository <ChevronRight size={14} />
                                                    </button>
                                                ) : (
                                                    <span className="feed-meta-item"><Unlink2 size={13} /> No linked repository</span>
                                                )}
                                            </div>
                                        </article>
                                    ))}
                                    {archives.length === 0 && <div className="empty-state"><h3>No archive documents found</h3></div>}
                                </div>
                            )}
                        </section>

                        <aside className="repository-side-column">
                            <div className="trending-panel">
                                <div className="trending-panel-header">
                                    <h3>Trending repositories</h3>
                                    <button type="button" className="see-more-link" onClick={() => setModule('repositories')}>See more</button>
                                </div>
                                <div className="trending-list">
                                    {trendingRepositories.map((repo) => (
                                        <div key={repo.id} className="trending-item" onClick={() => navigate(`/repository/${repo.id}`)}>
                                            <div style={{ flex: 1 }}>
                                                <button type="button" className="repository-link trending-repository-link" onClick={(e) => { e.stopPropagation(); navigate(`/repository/${repo.id}`) }}>
                                                    {repo.title}
                                                </button>
                                                <p>{repo.description || 'Technical implementation repository.'}</p>
                                                <div className="trending-meta">
                                                    <span>{repo.file_count} versions</span>
                                                    <span>{repo.linked_documents_count} linked docs</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="trending-panel repository-guidance-panel">
                                <h3>How it works</h3>
                                <p>Repositories hold source code and system files. Archives hold finalized research documents.</p>
                                <p>Archive documents can optionally point to a repository, and repositories surface their related documents for traceability.</p>
                            </div>
                        </aside>
                    </div>
                </div>
            </div>
        </div>
    )
}
