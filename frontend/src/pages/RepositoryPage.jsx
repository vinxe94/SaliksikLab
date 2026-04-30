import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import api from '../api/axios'
import {
    Search, Filter, Link2, Unlink2, ChevronRight, FileText, BookOpen,
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

function byline(doc) {
    const author = doc.author || doc.uploaded_by?.full_name || doc.uploaded_by?.email?.split('@')[0] || 'Unknown author'
    const year = doc.year || 'n.d.'
    return `${author} (${year})`
}

export default function RepositoryPage() {
    const navigate = useNavigate()
    const [search, setSearch] = useState('')
    const [showFilters, setShowFilters] = useState(false)
    const [archiveFilter, setArchiveFilter] = useState('')
    const [departmentFilter, setDepartmentFilter] = useState('')
    const [courseFilter, setCourseFilter] = useState('')
    const [departments, setDepartments] = useState([])
    const [courses, setCourses] = useState([])
    const [archives, setArchives] = useState([])
    const [archiveCount, setArchiveCount] = useState(0)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let alive = true

        Promise.all([
            api.get('/repository/departments/'),
            api.get('/repository/courses/'),
        ]).then(([departmentRes, courseRes]) => {
            if (!alive) return
            setDepartments(departmentRes.data || [])
            setCourses(courseRes.data || [])
        }).catch(() => {
            if (!alive) return
            setDepartments([])
            setCourses([])
        })

        return () => {
            alive = false
        }
    }, [])

    useEffect(() => {
        setLoading(true)
        const archiveParams = new URLSearchParams({
            ...(search && { search }),
            ...(archiveFilter && { linked: archiveFilter }),
            ...(departmentFilter && { department: departmentFilter }),
            ...(courseFilter && { course: courseFilter }),
        })

        api.get(`/repository/archives/?${archiveParams}`)
            .then((archiveRes) => {
                setArchives(archiveRes.data.results || [])
                setArchiveCount(archiveRes.data.count || 0)
            })
            .finally(() => setLoading(false))
    }, [search, archiveFilter, departmentFilter, courseFilter])

    const filteredCourses = courses.filter((course) => (
        !departmentFilter || course.department_name === departmentFilter
    ))

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <div className="page-header">
                    <div>
                        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Research Repository</h2>
                        <p style={{ color: 'var(--text2)', fontSize: '0.85rem' }}>
                            Browse archived research documents in one place.
                        </p>
                    </div>
                    <button className={`btn btn-sm ${showFilters ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setShowFilters((v) => !v)}>
                        <Filter size={14} /> Filter
                    </button>
                </div>

                <div className="page-body repository-feed-page">
                    <div className="repository-hero">
                        <div>
                            <span className="dashboard-kicker">Research Archive</span>
                            <h3>Browse finalized research documents.</h3>
                            <p>Review finalized documents, packages, and supporting archive files in one place.</p>
                        </div>
                        <div className="repository-hero-stats">
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
                                        <select
                                            className="form-input"
                                            value={departmentFilter}
                                            onChange={(e) => {
                                                setDepartmentFilter(e.target.value)
                                                setCourseFilter('')
                                            }}
                                        >
                                            <option value="">All departments</option>
                                            {departments.map((department) => (
                                                <option key={department.id} value={department.name}>
                                                    {department.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Course</label>
                                        <select
                                            className="form-input"
                                            value={courseFilter}
                                            onChange={(e) => setCourseFilter(e.target.value)}
                                        >
                                            <option value="">All courses</option>
                                            {filteredCourses.map((course) => (
                                                <option key={course.id} value={course.name}>
                                                    {course.name}
                                                </option>
                                            ))}
                                        </select>
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

                    <div className="repository-feed-layout" style={{ gridTemplateColumns: '1fr' }}>
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
                                        <article key={doc.id} className="activity-card archive-card journal-card">
                                            <div className="journal-card-kicker">
                                                <span><BookOpen size={14} /> Archive Journal</span>
                                                <span>{doc.department || 'General Research'}</span>
                                            </div>
                                            <div className="archive-card-head journal-card-head">
                                                <div className="archive-file-icon journal-file-icon">{fileKindLabel(doc.original_filename)}</div>
                                                <div className="journal-title-block">
                                                    <button
                                                        type="button"
                                                        className="repository-link journal-title"
                                                        onClick={() => navigate(`/archives/${doc.id}`)}
                                                    >
                                                        {doc.title}
                                                    </button>
                                                    <div className="journal-byline">{byline(doc)}</div>
                                                    <div className="activity-header-meta">
                                                        Published in archives {timeAgo(doc.uploaded_at)} by {doc.uploaded_by?.full_name || doc.uploaded_by?.email?.split('@')[0] || 'Researcher'}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="repository-preview-meta">
                                                <span className="language-chip"><span className="language-dot" style={{ background: '#6e7781' }} /> {fileKindLabel(doc.original_filename)}</span>
                                                <span className="feed-meta-item"><FileText size={13} /> v{doc.current_version || 1}</span>
                                                <span className="feed-meta-item">{doc.version_count || 1} version{(doc.version_count || 1) === 1 ? '' : 's'}</span>
                                                <span className={`badge ${doc.is_public ? 'badge-green' : 'badge-gray'}`}>{doc.is_public ? 'Public' : 'Private'}</span>
                                                {reviewBadge(doc)}
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
                    </div>
                </div>
            </div>
        </div>
    )
}
