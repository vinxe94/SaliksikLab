/**
 * LanguageContext — Multilingual interface support for SaliksikLab.
 * 
 * Supported locales:
 *   'en'  — English
 *   'fil' — Filipino (Tagalog)
 * 
 * Usage:
 *   const { t, locale, setLocale } = useLanguage()
 *   <p>{t('dashboard.welcome')}</p>
 */

import { createContext, useContext, useState, useCallback } from 'react'
import PropTypes from 'prop-types'

// ── Translation strings ────────────────────────────────────────────────────────
const TRANSLATIONS = {
    en: {
        // Navigation
        'nav.dashboard': 'Dashboard',
        'nav.repository': 'Repository',
        'nav.upload': 'Upload',
        'nav.admin': 'Admin',
        'nav.profile': 'Profile',
        'nav.logout': 'Logout',
        'nav.reports': 'Report Generation',
        'nav.analytics': 'Analytics',

        // Dashboard
        'dashboard.welcome': 'Welcome back',
        'dashboard.subtitle': 'Research Management System',
        'dashboard.myUploads': 'My Uploads',
        'dashboard.approved': 'Approved',
        'dashboard.pending': 'Pending',
        'dashboard.rejected': 'Rejected',

        // Repository
        'repo.title': 'Research Repository',
        'repo.search': 'Search research outputs...',
        'repo.filter': 'Filter',
        'repo.noResults': 'No research outputs found.',
        'repo.viewDetails': 'View Details',
        'repo.download': 'Download',
        'repo.approved': 'Approved',
        'repo.pending': 'Awaiting Approval',
        'repo.rejected': 'Rejected',

        // Upload
        'upload.title': 'Upload Research Output',
        'upload.dragDrop': 'Drag & drop files here or click to browse',
        'upload.submit': 'Submit for Review',
        'upload.abstract': 'Abstract',
        'upload.keywords': 'Keywords',
        'upload.author': 'Author(s)',
        'upload.adviser': 'Adviser',
        'upload.year': 'Year',
        'upload.type': 'Output Type',
        'upload.department': 'Department / College',
        'upload.course': 'Course / Program',

        // General
        'general.loading': 'Loading...',
        'general.error': 'An error occurred.',
        'general.save': 'Save',
        'general.cancel': 'Cancel',
        'general.close': 'Close',
        'general.copy': 'Copy to Clipboard',
        'general.copied': 'Copied!',
        'general.language': 'Language',
    },

    fil: {
        // Navigation
        'nav.dashboard': 'Dashboard',
        'nav.repository': 'Repositoryo',
        'nav.upload': 'Mag-upload',
        'nav.admin': 'Admin',
        'nav.profile': 'Profil',
        'nav.logout': 'Mag-logout',
        'nav.reports': 'Pagbuo ng Ulat',
        'nav.analytics': 'Analytics',

        // Dashboard
        'dashboard.welcome': 'Maligayang pagbabalik',
        'dashboard.subtitle': 'Sistema ng Pamamahala ng Pananaliksik',
        'dashboard.myUploads': 'Aking mga Na-upload',
        'dashboard.approved': 'Naaprubahan',
        'dashboard.pending': 'Nakabinbin',
        'dashboard.rejected': 'Tinanggihan',

        // Repository
        'repo.title': 'Repositoryo ng Pananaliksik',
        'repo.search': 'Maghanap ng pananaliksik...',
        'repo.filter': 'Salain',
        'repo.noResults': 'Walang nahanap na resulta.',
        'repo.viewDetails': 'Tingnan ang Detalye',
        'repo.download': 'I-download',
        'repo.approved': 'Naaprubahan',
        'repo.pending': 'Naghihintay ng Pag-apruba',
        'repo.rejected': 'Tinanggihan',

        // Upload
        'upload.title': 'Mag-upload ng Output ng Pananaliksik',
        'upload.dragDrop': 'I-drag at i-drop ang mga file dito o mag-click upang mag-browse',
        'upload.submit': 'Isumite para sa Pagsusuri',
        'upload.abstract': 'Abstrak',
        'upload.keywords': 'Mga Susi na Salita',
        'upload.author': 'May-akda',
        'upload.adviser': 'Tagapayo',
        'upload.year': 'Taon',
        'upload.type': 'Uri ng Output',
        'upload.department': 'Departamento / Kolehiyo',
        'upload.course': 'Kurso / Programa',

        // General
        'general.loading': 'Naglo-load...',
        'general.error': 'Nagkaroon ng error.',
        'general.save': 'I-save',
        'general.cancel': 'Kanselahin',
        'general.close': 'Isara',
        'general.copy': 'Kopyahin sa Clipboard',
        'general.copied': 'Nakopya!',
        'general.language': 'Wika',
    },
}

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
    const [locale, setLocale] = useState(
        () => localStorage.getItem('saliksik_locale') || 'en'
    )

    const changeLocale = useCallback((newLocale) => {
        setLocale(newLocale)
        localStorage.setItem('saliksik_locale', newLocale)
    }, [])

    /** Translate a key, optionally interpolating {variable} placeholders. */
    const t = useCallback((key, vars = {}) => {
        const dict = TRANSLATIONS[locale] || TRANSLATIONS['en']
        let str = dict[key] ?? TRANSLATIONS['en'][key] ?? key
        Object.entries(vars).forEach(([k, v]) => {
            str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v)
        })
        return str
    }, [locale])

    return (
        <LanguageContext.Provider value={{ locale, setLocale: changeLocale, t, TRANSLATIONS }}>
            {children}
        </LanguageContext.Provider>
    )
}

LanguageProvider.propTypes = { children: PropTypes.node }

// eslint-disable-next-line react-refresh/only-export-components
export const useLanguage = () => useContext(LanguageContext)
