import { useId } from 'react'
import PropTypes from 'prop-types'

export default function WorkspaceBanner({ eyebrow, title, description, actions, compact = false }) {
    const headingId = useId()
    return (
        <section className={`dashboard-hero${compact ? ' workspace-banner-compact' : ''}`} aria-labelledby={headingId}>
            <div className="dashboard-hero-photo" aria-hidden="true" />
            <svg className="dashboard-hero-curves" viewBox="0 0 1100 320" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                <path d="M0 0H1060C1005 124 923 260 731 320H0Z" fill="#4bac77" opacity=".66" />
                <path d="M0 0H984C940 139 824 264 655 320H0Z" fill="#187a50" opacity=".88" />
                <path d="M0 0H906C852 168 750 266 589 320H0Z" fill="#00432f" />
            </svg>
            <div className="dashboard-hero-copy">
                <span className="dashboard-overline">{eyebrow}</span>
                <h2 id={headingId}>{title}</h2>
                <p>{description}</p>
                {actions && <div className="dashboard-hero-actions">{actions}</div>}
            </div>
            <span className="dashboard-hero-signature" aria-hidden="true">Research<br />Connects Us</span>
        </section>
    )
}

WorkspaceBanner.propTypes = {
    eyebrow: PropTypes.string.isRequired,
    title: PropTypes.node.isRequired,
    description: PropTypes.string.isRequired,
    actions: PropTypes.node,
    compact: PropTypes.bool,
}
