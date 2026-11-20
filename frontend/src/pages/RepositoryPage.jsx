import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from '../components/Sidebar'
import WorkspaceHeader from '../components/WorkspaceHeader'
import WorkspaceBanner from '../components/WorkspaceBanner'
import WorkspaceFooter from '../components/WorkspaceFooter'
import api from '../api/axios'
import { Check, ChevronLeft, ChevronRight, Code2, ExternalLink, FileText, FolderSearch, RefreshCw, Search, SlidersHorizontal, Upload, X } from 'lucide-react'
import '../styles/research-pages.css'
import '../styles/workspace-pages.css'

const EMPTY_QUERY = { search: '', linked: '', department: '', course: '', page: 1 }

function reviewBadge(doc) {
    if (doc.is_approved) return <span className="badge badge-green"><Check size={12} />Approved</span>
    if (doc.is_rejected && doc.revision_comment && !doc.rejection_reason) return <span className="badge badge-yellow">Revision requested</span>
    if (doc.is_rejected) return <span className="badge badge-red">Rejected</span>
    return <span className="badge badge-yellow">Pending review</span>
}

function safeSystemLink(value) {
    try {
        const url = new URL(value)
        return ['http:', 'https:'].includes(url.protocol) ? url.href : null
    } catch {
        return null
    }
}

export default function RepositoryPage() {
    const { user } = useAuth()
    const [searchParams] = useSearchParams()
    const requestedSearch = searchParams.get('search') || ''
    const [search, setSearch] = useState(requestedSearch)
    const [query, setQuery] = useState(() => ({ ...EMPTY_QUERY, search: requestedSearch.trim() }))
    const [showFilters, setShowFilters] = useState(false)
    const [departments, setDepartments] = useState([])
    const [courses, setCourses] = useState([])
    const [filterError, setFilterError] = useState(false)
    const [filterRetry, setFilterRetry] = useState(0)
    const [archives, setArchives] = useState([])
    const [archiveCount, setArchiveCount] = useState(0)
    const [pagination, setPagination] = useState({ next: false, previous: false })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [retry, setRetry] = useState(0)
    const resultsRef = useRef(null)
    const canSubmit = user?.role === 'admin' || user?.role === 'student'
    const filterCount = [query.linked, query.department, query.course].filter(Boolean).length
    const hasQuery = Boolean(query.search || filterCount)

    useEffect(() => {
        setSearch(requestedSearch)
        setQuery(current => ({ ...current, search: requestedSearch.trim(), page: 1 }))
    }, [requestedSearch])

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setQuery(current => current.search === search.trim() ? current : { ...current, search: search.trim(), page: 1 })
        }, 300)
        return () => window.clearTimeout(timer)
    }, [search])

    useEffect(() => {
        const controller = new AbortController()
        setFilterError(false)
        Promise.all([
            api.get('/repository/departments/', { signal: controller.signal }),
            api.get('/repository/courses/', { signal: controller.signal }),
        ]).then(([departmentRes, courseRes]) => {
            if (controller.signal.aborted) return
            setDepartments(departmentRes.data.results || departmentRes.data || [])
            setCourses(courseRes.data.results || courseRes.data || [])
        }).catch(() => {
            if (!controller.signal.aborted) setFilterError(true)
        })
        return () => controller.abort()
    }, [filterRetry])

    useEffect(() => {
        const controller = new AbortController()
        setLoading(true)
        setError('')
        const params = Object.fromEntries(Object.entries(query).filter(([, value]) => value !== ''))
        api.get('/repository/archives/', { params, signal: controller.signal }).then(({ data }) => {
            if (controller.signal.aborted) return
            const results = data.results || (Array.isArray(data) ? data : [])
            setArchives(results)
            setArchiveCount(data.count ?? results.length)
            setPagination({ next: Boolean(data.next), previous: Boolean(data.previous) })
        }).catch(() => {
            if (!controller.signal.aborted) setError('We couldn’t load the research repository. Please check your connection and try again.')
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false)
        })
        return () => controller.abort()
    }, [query, retry])

    const updateFilter = (name, value) => setQuery(current => ({ ...current, [name]: value, ...(name === 'department' ? { course: '' } : {}), page: 1 }))
    const clearAll = () => {
        setSearch('')
        setQuery(EMPTY_QUERY)
    }
    const changePage = (direction) => {
        setQuery(current => ({ ...current, page: Math.max(1, current.page + direction) }))
        resultsRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' })
        resultsRef.current?.focus({ preventScroll: true })
    }
    const filteredCourses = courses.filter(course => !query.department || course.department_name === query.department)

    return (
        <div className="layout workspace-layout">
            <Sidebar />
            <main id="main-content" tabIndex={-1} className="main-content workspace-content research-library">
                <WorkspaceHeader title="Repository" eyebrow="Discover & learn" />
                <div className="page-body workspace-page-body research-library-body">
                    <WorkspaceBanner compact eyebrow="The research collection" title={<>Discover ideas. <span>Build on knowledge.</span></>}
                        description="Explore research from your community. Find the studies, documents, and systems that inspire your next step."
                        actions={canSubmit && <Link className="btn dashboard-hero-primary" to="/upload"><Upload size={18} aria-hidden="true" />{user?.role === 'admin' ? 'Publish research' : 'Request upload'}</Link>}
                    />

                    <section className="research-library-controls" aria-label="Search and filter research">
                        <div className="research-search-row"><div className="research-search"><Search size={20} aria-hidden="true" /><label htmlFor="research-search" className="sr-only">Search by title, author, or keyword</label><input id="research-search" type="search" placeholder="Search by title, author, or keyword…" value={search} onChange={event => setSearch(event.target.value)} autoComplete="off" />{search && <button type="button" aria-label="Clear search" onClick={() => { setSearch(''); updateFilter('search', '') }}><X size={17} /></button>}</div><button type="button" className={`btn research-filter-toggle ${showFilters ? 'is-active' : ''}`} aria-expanded={showFilters} aria-controls="research-filter-panel" onClick={() => setShowFilters(value => !value)}><SlidersHorizontal size={17} />Filters{filterCount > 0 && <span>{filterCount}</span>}</button></div>
                        {showFilters && <div id="research-filter-panel" className="research-filter-panel">
                            <div className="form-group"><label className="form-label" htmlFor="research-department">Department</label><select id="research-department" className="form-input" value={query.department} onChange={event => updateFilter('department', event.target.value)}><option value="">All departments</option>{departments.map(department => <option key={department.id} value={department.name}>{department.name}</option>)}</select></div>
                            <div className="form-group"><label className="form-label" htmlFor="research-course">Course</label><select id="research-course" className="form-input" value={query.course} onChange={event => updateFilter('course', event.target.value)}><option value="">All courses</option>{filteredCourses.map(course => <option key={course.id} value={course.name}>{course.name}</option>)}</select></div>
                            <div className="form-group"><label className="form-label" htmlFor="research-system-link">System link</label><select id="research-system-link" className="form-input" value={query.linked} onChange={event => updateFilter('linked', event.target.value)}><option value="">All research</option><option value="true">With a system link</option><option value="false">Without a system link</option></select></div>
                            {filterError && <p className="research-filter-error" role="status">Department and course options couldn’t be loaded. <button type="button" onClick={() => setFilterRetry(value => value + 1)}>Retry</button></p>}
                        </div>}
                        {hasQuery && <div className="research-active-filters" aria-label="Active filters">{query.search && <button type="button" onClick={() => { setSearch(''); updateFilter('search', '') }}>Search: {query.search}<X size={13} /></button>}{query.department && <button type="button" onClick={() => updateFilter('department', '')}>{query.department}<X size={13} /></button>}{query.course && <button type="button" onClick={() => updateFilter('course', '')}>{query.course}<X size={13} /></button>}{query.linked && <button type="button" onClick={() => updateFilter('linked', '')}>{query.linked === 'true' ? 'With a system link' : 'Without a system link'}<X size={13} /></button>}<button type="button" className="research-clear-filters" onClick={clearAll}>Clear all</button></div>}
                    </section>

                    <section ref={resultsRef} tabIndex={-1} className="research-library-results" aria-labelledby="research-results-heading" aria-busy={loading}>
                        <div className="research-results-heading"><div><h2 id="research-results-heading">{hasQuery ? 'Search results' : 'Explore the collection'}</h2><span className="research-results-count" role="status" aria-live="polite">{loading ? 'Finding research…' : error ? 'Research unavailable' : `${archiveCount.toLocaleString()} ${archiveCount === 1 ? 'document' : 'documents'}${hasQuery ? ' found' : ' in the repository'}`}</span></div><span className="research-results-order">Latest additions</span></div>
                        {loading ? <div className="research-results-list" role="status"><span className="sr-only">Loading research documents</span>{[1, 2, 3, 4].map(item => <div className="research-library-card research-card-skeleton" key={item} aria-hidden="true"><span className="research-row-document"><FileText size={24} strokeWidth={1.5} /></span><div className="research-card-content"><span className="research-placeholder short" /><span className="research-placeholder" /><span className="research-placeholder" /><span className="research-placeholder short" /></div></div>)}</div> : error ? <div className="research-empty research-results-empty" role="alert"><RefreshCw size={30} /><h3>The collection couldn’t be loaded</h3><p>{error}</p><button type="button" className="btn btn-primary" onClick={() => setRetry(value => value + 1)}><RefreshCw size={15} />Try again</button></div> : archives.length ? <ul className="research-results-list" role="list" aria-label="Research documents">{archives.map(doc => {
                            const systemUrl = safeSystemLink(doc.system_link)
                            const author = doc.author || doc.uploaded_by?.full_name || 'Research contributor'
                            const fileKind = doc.file_extension?.replace(/^\./, '').toUpperCase() || doc.original_filename?.split('.').pop()?.toUpperCase() || 'DOC'
                            return (
                                <li key={doc.id}>
                                    <article className="research-library-card" aria-labelledby={`research-title-${doc.id}`}>
                                        <span className="research-row-document" aria-hidden="true"><FileText size={24} strokeWidth={1.5} /></span>
                                        <div className="research-card-content">
                                            <div className="research-card-top">
                                                <span className="research-card-file">{fileKind}</span>
                                                <span className="research-card-department">{doc.department || 'General research'}</span>
                                                {reviewBadge(doc)}
                                            </div>
                                            <h3 id={`research-title-${doc.id}`}><Link to={`/archives/${doc.id}`}>{doc.title}</Link></h3>
                                            <p className="research-card-author">{author}{doc.year ? ` · ${doc.year}` : ''}</p>
                                            <p className="research-card-abstract">{doc.abstract || 'Read the research document and explore its supporting materials.'}</p>
                                            <div className="research-card-tags">
                                                {doc.course && <span>{doc.course}</span>}
                                                {doc.system_original_filename && <span className="research-package-tag"><Code2 size={13} />System included</span>}
                                                <span>Version {doc.current_version || 1}</span>
                                            </div>
                                        </div>
                                        <div className="research-card-footer">
                                            <Link className="research-text-link" to={`/archives/${doc.id}`} aria-label={`View research: ${doc.title}`}>View research</Link>
                                            {systemUrl && <a className="research-system-link" href={systemUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open system for ${doc.title} in a new tab`}><ExternalLink size={14} /><span>Open system</span></a>}
                                        </div>
                                    </article>
                                </li>
                            )
                        })}</ul> : <div className="research-empty research-results-empty"><FolderSearch size={38} strokeWidth={1.5} /><h3>{hasQuery ? 'No research matches your search' : 'The collection is just getting started'}</h3><p>{hasQuery ? 'Try a different keyword or remove a filter to explore more of the collection.' : 'Published research will appear here as the community shares its work.'}</p>{hasQuery ? <button type="button" className="btn btn-ghost" onClick={clearAll}>Clear search and filters</button> : canSubmit && <Link className="btn btn-primary" to="/upload"><Upload size={15} />{user?.role === 'admin' ? 'Publish research' : 'Submit your research'}</Link>}</div>}
                        {!loading && !error && (pagination.next || pagination.previous) && <nav className="research-pagination" aria-label="Research results pages"><button type="button" className="btn btn-ghost btn-sm" disabled={!pagination.previous} onClick={() => changePage(-1)}><ChevronLeft size={16} />Previous</button><span aria-current="page">Page {query.page}</span><button type="button" className="btn btn-ghost btn-sm" disabled={!pagination.next} onClick={() => changePage(1)}>Next<ChevronRight size={16} /></button></nav>}
                    </section>
                <WorkspaceFooter />
                </div>
            </main>
        </div>
    )
}
