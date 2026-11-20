import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, CheckCircle, Clock, Gauge, GraduationCap, UsersRound, XCircle } from 'lucide-react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import Sidebar from '../components/Sidebar'
import WorkspaceHeader from '../components/WorkspaceHeader'
import WorkspaceBanner from '../components/WorkspaceBanner'
import WorkspaceFooter from '../components/WorkspaceFooter'
import api from '../api/axios'
import '../styles/workspace-pages.css'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend)
ChartJS.defaults.font.family = "'Inter', sans-serif"
ChartJS.defaults.color = '#62736a'

const palette = ['#07985a', '#78c65a', '#2882b5', '#e9a42b', '#8470b8', '#259c9a', '#e55b80', '#486c5b']
const coursePalette = ['#07985a', '#78c65a', '#2882b5', '#e9a42b', '#8470b8', '#259c9a', '#e55b80', '#486c5b']

function percent(value, total) {
  if (!total) return 0
  return Math.round((value / total) * 100)
}

function shortDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    api.get('/repository/stats/')
      .then((res) => setStats(res.data))
      .catch(() => setError('Analytics could not be loaded. Please try again.'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const statusSeries = useMemo(() => [
    { label: 'Approved', value: stats?.approved ?? 0, color: '#07824c', icon: CheckCircle },
    { label: 'Pending', value: stats?.pending ?? 0, color: '#ac7500', icon: Clock },
    { label: 'Rejected', value: stats?.rejected ?? 0, color: '#d93570', icon: XCircle },
  ], [stats])

  const topCourse = stats?.by_course?.[0]
  const topDepartment = stats?.by_dept?.[0]
  const totalStatus = statusSeries.reduce((sum, item) => sum + item.value, 0)
  const engagementSeries = stats?.user_engagement || []
  const latestEngagement = engagementSeries[engagementSeries.length - 1]
  const departmentTotal = stats?.by_dept?.[0]?.count ?? 0
  const courseTotal = stats?.by_course?.[0]?.count ?? 0

  const statusData = {
    labels: statusSeries.map((item) => item.label),
    datasets: [{
      data: statusSeries.map((item) => item.value),
      backgroundColor: statusSeries.map((item) => item.color),
      borderColor: '#ffffff',
      borderWidth: 4,
    }],
  }

  const courseData = {
    labels: (stats?.by_course || []).map((item) => item.course || 'Unassigned'),
    datasets: [{
      label: 'Outputs',
      data: (stats?.by_course || []).map((item) => item.count),
      backgroundColor: (stats?.by_course || []).map((_, index) => coursePalette[index % coursePalette.length]),
      borderRadius: 8,
    }],
  }

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#5f6b5c', font: { size: 11 } } },
      y: { beginAtZero: true, grid: { color: 'rgba(95, 107, 92, 0.12)' }, ticks: { precision: 0, color: '#5f6b5c' } },
    },
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    animation: {
      animateRotate: true,
      animateScale: true,
      duration: 900,
      easing: 'easeOutQuart',
    },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 14 } },
    },
  }

  const engagementData = {
    labels: engagementSeries.map((item) => shortDate(item.date)),
    datasets: [
      {
        label: 'Daily active users',
        data: engagementSeries.map((item) => item.daily_active_users),
        borderColor: '#07985a',
        backgroundColor: 'rgba(15, 118, 110, 0.12)',
        pointBackgroundColor: '#07985a',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 3,
        tension: 0.36,
      },
      {
        label: 'Logins per day',
        data: engagementSeries.map((item) => item.logins_per_day),
        borderColor: '#2882b5',
        backgroundColor: 'rgba(124, 58, 237, 0.1)',
        pointBackgroundColor: '#2882b5',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 3,
        tension: 0.36,
      },
    ],
  }

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, boxWidth: 8, padding: 14 },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#5f6b5c', font: { size: 11 }, maxRotation: 0 } },
      y: { beginAtZero: true, grid: { color: 'rgba(95, 107, 92, 0.12)' }, ticks: { precision: 0, color: '#5f6b5c' } },
    },
  }

  return (
    <div className="layout workspace-layout">
      <Sidebar />
      <main id="main-content" tabIndex={-1} className="main-content workspace-content">
        <WorkspaceHeader title="Analytics" eyebrow="Research insights" />

        <div className="page-body workspace-page-body analytics-workspace-body">
          {error && <div className="alert alert-error" role="alert">{error} <button type="button" className="btn btn-ghost btn-sm" onClick={load}>Try again</button></div>}
          <WorkspaceBanner compact eyebrow="Understand your impact"
            title={<>Research in motion. <span>Insights that matter.</span></>}
            description="Follow submissions from review to publication, and see where your community is most active."
            actions={<div className="workspace-banner-stat"><span>Total records</span><strong>{loading ? '…' : error ? '—' : stats?.total ?? 0}</strong></div>}
          />

          <div className="stat-grid">
            {statusSeries.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="stat-card dashboard-stat-card analytics-stat-card">
                  <span className="analytics-stat-icon" style={{ color: item.color }}><Icon size={18} /></span>
                  <span className="stat-value" style={{ color: item.color }}>{loading ? '…' : error ? '—' : item.value}</span>
                  <span className="stat-label">{item.label}</span>
                  <span className="dashboard-stat-meta">{percent(item.value, stats?.total ?? 0)}% of repository records</span>
                </div>
              )
            })}
            <div className="stat-card dashboard-stat-card analytics-stat-card">
              <span className="analytics-stat-icon"><UsersRound size={18} /></span>
              <span className="stat-value">{loading ? '…' : error ? '—' : (latestEngagement?.daily_active_users ?? 0)}</span>
              <span className="stat-label">Active students today</span>
              <span className="dashboard-stat-meta">{loading ? '...' : (latestEngagement?.logins_per_day ?? 0)} logins today</span>
            </div>
          </div>

          <section className="analytics-visual-grid">
            <article className="dashboard-panel analytics-chart-panel">
              <div className="dashboard-panel-head">
                <div>
                  <span className="dashboard-panel-kicker">Review status</span>
                  <h3><Gauge size={16} /> Approval Breakdown</h3>
                </div>
              </div>
              <div className="analytics-doughnut-wrap">
                <Doughnut data={statusData} options={doughnutOptions} role="img" aria-label={`Review status: ${statusSeries.map(item => `${item.value} ${item.label.toLowerCase()}`).join(', ')}`} />
                <div className="analytics-doughnut-center">
                  <strong>{loading ? '...' : totalStatus}</strong>
                  <span>Total</span>
                </div>
              </div>
            </article>

            <article className="dashboard-panel analytics-chart-panel analytics-wide-panel">
              <div className="dashboard-panel-head">
                <div>
                  <span className="dashboard-panel-kicker">Usage consistency</span>
                  <h3><UsersRound size={16} /> User Engagement</h3>
                </div>
                {latestEngagement && <strong className="dashboard-panel-total">{latestEngagement.daily_active_users}</strong>}
              </div>
              <div className="analytics-chart-height">
                <Line data={engagementData} options={lineOptions} role="img" aria-label="Daily active students and daily logins over time" />
              </div>
            </article>

            <article className="dashboard-panel analytics-chart-panel analytics-wide-panel">
              <div className="dashboard-panel-head">
                <div>
                  <span className="dashboard-panel-kicker">Courses</span>
                  <h3><GraduationCap size={16} /> Distribution of Outputs by Courses</h3>
                </div>
                {topCourse && <strong className="dashboard-panel-total">{topCourse.count}</strong>}
              </div>
              <div className="analytics-chart-height">
                <Bar data={courseData} options={barOptions} role="img" aria-label={`Outputs by course: ${(stats?.by_course || []).map(item => `${item.course || 'Unassigned'} ${item.count}`).join(', ')}`} />
              </div>
            </article>

            <article className="dashboard-panel analytics-chart-panel">
              <div className="dashboard-panel-head">
                <div>
                  <span className="dashboard-panel-kicker">Academic coverage</span>
                  <h3><Building2 size={16} /> Departments & Courses</h3>
                </div>
              </div>
              <div className="analytics-type-list">
                <div className="analytics-breakdown-label">
                  <span>Departments</span>
                  {topDepartment && <strong>{topDepartment.count}</strong>}
                </div>
                {(stats?.by_dept || []).map((item, index) => (
                  <div key={item.department || index} className="analytics-type-row">
                    <span>{item.department || 'Unassigned'}</span>
                    <div className="analytics-mini-track">
                      <span style={{ width: `${percent(item.count, departmentTotal)}%`, background: palette[index % palette.length] }} />
                    </div>
                    <strong>{item.count}</strong>
                  </div>
                ))}
                {!loading && (stats?.by_dept || []).length === 0 && (
                  <p className="dashboard-card-copy">No department data available yet.</p>
                )}

                <div className="analytics-breakdown-label">
                  <span>Courses</span>
                  {topCourse && <strong>{topCourse.count}</strong>}
                </div>
                {(stats?.by_course || []).map((item, index) => (
                  <div key={item.course || index} className="analytics-type-row">
                    <span>{item.course || 'Unassigned'}</span>
                    <div className="analytics-mini-track">
                      <span style={{ width: `${percent(item.count, courseTotal)}%`, background: coursePalette[index % coursePalette.length] }} />
                    </div>
                    <strong>{item.count}</strong>
                  </div>
                ))}
                {!loading && (stats?.by_course || []).length === 0 && (
                  <p className="dashboard-card-copy">No course data available yet.</p>
                )}
              </div>
            </article>
          </section>
        <WorkspaceFooter />
        </div>
      </main>
    </div>
  )
}
