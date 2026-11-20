import { useId } from 'react'
import PropTypes from 'prop-types'
import { ArrowRight, FileText, FlaskConical, Search, Share2, Sprout, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import '../styles/auth-submission.css'
import '../styles/auth.css'

export default function AuthLayout({ title, subtitle, children, footer, wide = false }) {
    const artworkId = useId()

    return (
        <main id="main-content" tabIndex={-1} className={`tukiva-auth${wide ? ' tukiva-auth--wide' : ''}`}>
            <svg className="auth-landscape" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                <defs>
                    <clipPath id={`${artworkId}-curve`}>
                        <path d="M0 0H980C680 250 930 700 615 1000H0Z" />
                    </clipPath>
                    <linearGradient id={`${artworkId}-shade`} x1="0" y1="0" x2="0.8" y2="1">
                        <stop offset="0" stopColor="#003f2e" />
                        <stop offset="0.42" stopColor="#004731" stopOpacity="0.96" />
                        <stop offset="0.73" stopColor="#004932" stopOpacity="0.6" />
                        <stop offset="1" stopColor="#003c2a" stopOpacity="0.62" />
                    </linearGradient>
                    <linearGradient id={`${artworkId}-photo-fade`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#000" />
                        <stop offset="0.22" stopColor="#fff" />
                    </linearGradient>
                    <mask id={`${artworkId}-photo-mask`}>
                        <rect x="0" y="350" width="1000" height="650" fill={`url(#${artworkId}-photo-fade)`} />
                    </mask>
                </defs>
                <path d="M0 0H1000C700 250 955 700 640 1000H0Z" fill="#e6f1e4" />
                <g clipPath={`url(#${artworkId}-curve)`}>
                    <rect width="1000" height="1000" fill="#004331" />
                    <image href="/images/research-campus.png" x="0" y="350" width="1000" height="650" preserveAspectRatio="xMidYMid slice" mask={`url(#${artworkId}-photo-mask)`} />
                    <rect width="1000" height="1000" fill={`url(#${artworkId}-shade)`} />
                    <path d="M680 0H1000V430C845 295 855 130 680 0Z" fill="#84cf8b" opacity="0.1" />
                    <path d="M875 0H1000V355C880 225 820 100 875 0Z" fill="#bce6a5" opacity="0.26" />
                    <path d="M0 850C225 810 400 970 665 1000H0Z" fill="#002f24" opacity="0.5" />
                </g>
            </svg>
            <div className="auth-dot-pattern" aria-hidden="true" />
            <svg className="auth-leaf-corner" viewBox="0 0 320 310" aria-hidden="true" focusable="false">
                <path d="M320 0C188 42 178 182 170 310H320Z" fill="#e3f0d7" />
                <path d="M320 90C210 120 172 224 151 310H320Z" fill="#75bc75" />
                <path d="M320 166C260 260 106 232 0 310H320Z" fill="#ccecd2" opacity="0.76" />
                <path d="M320 176C271 241 212 254 170 310H320Z" fill="#369758" opacity="0.72" />
            </svg>
            <section className="auth-story" aria-label="About Tukiva">
                <Link to="/login" className="auth-brand" aria-label="Tukiva home">
                    <img src="/logo-nav.png" alt="" />
                    <span>Tukiva<small>INSTITUTIONAL RESEARCH REPOSITORY</small></span>
                </Link>
                <div className="auth-story-copy">
                    <h2>Great research<br />deserves to<br /><em>go further.</em></h2>
                    <p>Discover ideas, share your work, and bring research to life in one connected workspace.</p>
                    <ul className="auth-features" aria-label="Your research community">
                        <li><span><Search size={27} aria-hidden="true" /></span>Discover<br />Research</li>
                        <li><span><Share2 size={26} aria-hidden="true" /></span>Share<br />Your Work</li>
                        <li><span><UsersRound size={28} aria-hidden="true" /></span>Collaborate<br />Together</li>
                    </ul>
                    <Link to="/register" className="auth-chapter-card" aria-label="Join Tukiva and share your research">
                        <svg className="auth-chapter-spark" viewBox="0 0 40 48" aria-hidden="true" focusable="false"><path d="M24 4l5 12M5 15l13 6M3 37l13-4" /></svg>
                        <span className="auth-chapter-label"><FileText size={22} aria-hidden="true" /> THE NEXT CHAPTER</span>
                        <strong>From a question<br />to a contribution.</strong>
                        <span className="auth-chapter-arrow"><ArrowRight size={22} aria-hidden="true" /></span>
                    </Link>
                </div>
                <p className="auth-story-footer"><span><Sprout size={19} aria-hidden="true" /></span>Built for your academic community.</p>
            </section>
            <section className="auth-form-panel" aria-labelledby="auth-heading">
                <Link to="/login" className="auth-mobile-brand"><img src="/logo-nav.png" alt="" /><span>Tukiva<small>Your research community</small></span></Link>
                <div className="auth-form-card">
                    <div className="auth-form-heading">
                        <span className="auth-workspace-badge"><FlaskConical size={23} aria-hidden="true" />Your Research Workspace</span>
                        <h1 id="auth-heading">{title}</h1>
                        <p>{subtitle}</p>
                    </div>
                    {children}
                    {footer && <div className="auth-form-footer"><div>{footer}</div></div>}
                </div>
                <p className="auth-bottom-note">Discover. Contribute. Make a difference.</p>
            </section>
        </main>
    )
}

AuthLayout.propTypes = {
    title: PropTypes.string.isRequired,
    subtitle: PropTypes.string.isRequired,
    children: PropTypes.node.isRequired,
    footer: PropTypes.node,
    wide: PropTypes.bool,
}
