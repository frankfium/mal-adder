import React, { useEffect, useMemo, useState } from 'react'
import packageJson from '../../package.json'

function useIsHttpOrigin() {
  return useMemo(() => typeof location !== 'undefined' && location.protocol.startsWith('http'), [])
}

export default function App() {
  const isHttp = useIsHttpOrigin()
  const hasBrowserApis = typeof window !== 'undefined' && typeof document !== 'undefined'
  const [showsText, setShowsText] = useState('')
  const [previewResults, setPreviewResults] = useState([])
  const [finalResults, setFinalResults] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [listItems, setListItems] = useState([])
  const [listLoading, setListLoading] = useState(false)
  const [listLoaded, setListLoaded] = useState(false)
  const [listError, setListError] = useState('')
  const [exportLoading, setExportLoading] = useState(false)
  const [me, setMe] = useState({ loading: true, loggedIn: false, name: '' })
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' })
  const [activeTab, setActiveTab] = useState('home')
  const version = packageJson?.version || 'dev'

  const onLogin = () => {
    const w = 520, h = 640
    const y = window.top.outerHeight / 2 + window.top.screenY - (h / 2)
    const x = window.top.outerWidth / 2 + window.top.screenX - (w / 2)
    window.open('/login', 'mal_oauth', `width=${w},height=${h},left=${x},top=${y}`)
  }

  const onLogout = async () => {
    try {
      await fetch('/logout', { method: 'POST', credentials: 'include' })
      setMe({ loading: false, loggedIn: false, name: '' })
      showToast('Logged out successfully')
      setListItems([])
      setListLoaded(false)
      setListError('')
    } catch (err) {
      console.error('Logout error:', err)
    }
  }

  const parseShows = () => showsText.split('\n').map(s => s.trim()).filter(Boolean)

  const onPreview = async () => {
    if (!isHttp) {
      alert('Please open http://localhost:3000/ in your browser (do not open this file directly).')
      return
    }
    const shows = parseShows()
    if (!shows.length) {
      showToast('Add at least one show to preview', 'error')
      return
    }
    setIsLoading(true)
    setPreviewResults([])
    setFinalResults([])
    try {
      const res = await fetch('/preview-shows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shows }),
        credentials: 'include'
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data?.error || 'Failed to preview shows', 'error')
        return
      }
      setPreviewResults(Array.isArray(data.results) ? data.results : [])
      if (!data.results?.length) {
        showToast('No matches found. Check your titles.', 'error')
      }
    } catch (err) {
      showToast('Unexpected error while previewing shows', 'error')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const onConfirm = async () => {
    const shows = parseShows()
    if (!shows.length) {
      showToast('Nothing to update yet', 'error')
      return
    }
    const matches = previewResults.filter(item => !item.error)
    if (!matches.length) {
      showToast('No valid matches to update', 'error')
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch('/add-shows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches }),
        credentials: 'include'
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data?.error || 'Failed to add shows', 'error')
        return
      }
      setFinalResults(Array.isArray(data.results) ? data.results : [])
      const anyErrors = data.results?.some(item => item.status === 'error')
      showToast(anyErrors ? 'Finished with some errors' : 'Successfully updated your MAL list')
    } catch (err) {
      showToast('Unexpected error while adding shows', 'error')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadList = async ({ notify = false } = {}) => {
    if (!isHttp) {
      showToast('Open the app via http://localhost:3000/ to load your list', 'error')
      return
    }
    if (listLoading) return
    setListLoading(true)
    setListError('')
    try {
      const res = await fetch('/my-list', { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = data?.error || 'Failed to load MAL list'
        setListError(message)
        showToast(message, 'error')
        if (res.status === 401) {
          setListItems([])
          setListLoaded(false)
        }
        return
      }
      const items = Array.isArray(data.results) ? data.results : []
      setListItems(items)
      setListLoaded(true)
      if (notify) {
        showToast('List refreshed')
      }
    } catch (err) {
      console.error('Failed to load MAL list:', err)
      const message = 'Unexpected error while loading list'
      setListError(message)
      showToast(message, 'error')
    } finally {
      setListLoading(false)
    }
  }

  const onExport = async () => {
    if (!me.loggedIn) {
      showToast('Log in with MAL to export your list', 'error')
      return
    }
    if (!isHttp) {
      showToast('Open the app via http://localhost:3000/ to export your list', 'error')
      return
    }
    if (!hasBrowserApis) {
      console.warn('Export attempted without browser APIs')
      showToast('Export is only available in the browser', 'error')
      return
    }
    setExportLoading(true)
    try {
      const res = await fetch('/my-list', { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = data?.error || 'Failed to export MAL list'
        showToast(message, 'error')
        return
      }
      const items = Array.isArray(data.results) ? data.results : []
      const dateStamp = new Date().toISOString().split('T')[0]
      const filename = 'mal-list-' + dateStamp + '.json'
      const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' })
      const urlApi = window.URL || URL
      const link = document.createElement('a')
      const objectUrl = urlApi.createObjectURL(blob)
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => urlApi.revokeObjectURL(objectUrl), 1000)
      showToast('Exported list as JSON')
    } catch (err) {
      console.error('Export failed:', err)
      showToast('Unexpected error while exporting list', 'error')
    } finally {
      setExportLoading(false)
    }
  }

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  useEffect(() => {
    const load = async () => {
      try {
        console.log('Fetching /me...')
        const r = await fetch('/me', { credentials: 'include' })
        console.log('Response status:', r.status)
        
        let data
        if (r.status === 304) {
          // Use cached data - assume we're still logged in if we got 304
          console.log('Using cached response (304)')
          data = { loggedIn: true, name: me.name || 'User' }
        } else {
          data = await r.json()
        }
        console.log('User data received:', data)
        
        // If we got a 200 response but no name, let's try to get it from the session
        if (data.loggedIn && (!data.name || data.name === 'User')) {
          console.log('No name in response, trying to fetch fresh data...')
          // Force a fresh request
          const freshR = await fetch('/me?' + Date.now(), { 
            credentials: 'include',
            cache: 'no-cache'
          })
          if (freshR.status === 200) {
            const freshData = await freshR.json()
            console.log('Fresh user data:', freshData)
            if (freshData.name && freshData.name !== 'User') {
              data = freshData
            }
          }
        }
        const wasLoggedIn = me.loggedIn
        const isNowLoggedIn = !!data.loggedIn
        console.log('Was logged in:', wasLoggedIn, 'Now logged in:', isNowLoggedIn, 'Name:', data.name)
        setMe({ loading: false, loggedIn: isNowLoggedIn, name: data.name || '' })
        
        // Show toast if user just logged in
        if (!wasLoggedIn && isNowLoggedIn && data.name) {
          console.log('Showing success toast for:', data.name)
          showToast(`Successfully authenticated as ${data.name}!`)
        }
      } catch (err) {
        console.error('Error fetching user data:', err)
        setMe({ loading: false, loggedIn: false, name: '' })
      }
    }
    load()
    
    // Check for OAuth redirect (URL might have changed)
    const checkAuth = () => {
      if (location.pathname === '/' && !me.loading) {
        load()
      }
    }
    
    // Listen for OAuth popup message and focus events
    const onMessage = (e) => {
      console.log('Received message:', e.data)
      if (e && e.data && e.data.type === 'oauth-success') {
        console.log('OAuth success detected, refreshing user state...')
        showToast('Successfully authenticated!')
        
        // Use user data from popup if available
        if (e.data.userData) {
          console.log('Using user data from popup:', e.data.userData)
          setMe({ loading: false, loggedIn: e.data.userData.loggedIn, name: e.data.userData.name || 'User' })
        } else {
          // Fallback: force update to logged in state
          setMe({ loading: false, loggedIn: true, name: 'User' })
        }
        // Don't call load() immediately - let the periodic check handle it
      }
    }
    window.addEventListener('message', onMessage)
    window.addEventListener('focus', checkAuth)
    
    // Also check periodically in case focus event doesn't fire
    const interval = setInterval(checkAuth, 2000)
    
    return () => {
      window.removeEventListener('message', onMessage)
    window.removeEventListener('focus', checkAuth)
    clearInterval(interval)
  }
}, [])

  useEffect(() => {
    if (activeTab === 'list' && me.loggedIn) {
      if (!listLoaded && !listLoading) {
        loadList()
      }
    }
  }, [activeTab, me.loggedIn, listLoaded, listLoading])

  const renderHomePage = () => (
    <>
      {!isHttp && (
        <div className="notice">
          Open this app via http://localhost:3000 (not file://). Run <code>npm start</code> then refresh.
        </div>
      )}

      <div className="row">
        <div className="card">
          <h3>Paste shows</h3>
          <div className="help">One title per line. Use format: "Anime Name (episodes)" for specific episode counts.</div>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="shows">Shows</label>
            <textarea id="shows" value={showsText} onChange={e => setShowsText(e.target.value)} />
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
            <button className="btn" onClick={onPreview} disabled={isLoading}>
              {isLoading ? 'Working...' : (previewResults.length ? 'Refresh Preview' : 'Preview Matches')}
            </button>
            <button
              className="btn"
              disabled={!previewResults.length || isLoading}
              style={{ opacity: !previewResults.length ? 0.6 : 1 }}
              onClick={onConfirm}
            >
              Confirm & Update
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                setShowsText('')
                setPreviewResults([])
                setFinalResults([])
              }}
            >
              Clear
            </button>
          </div>
        </div>
        <div className="card">
          <h3>Result</h3>
          <div className="results-panel">
            {finalResults.length ? (
              <ResultsList items={finalResults} />
            ) : previewResults.length ? (
              <PreviewList items={previewResults} />
            ) : (
              <div className="muted">Preview matches to review them here.</div>
            )}
          </div>
        </div>
      </div>
    </>
  )

  const renderAboutPage = () => (
    <div className="card">
      <h3>About MAL List Updater</h3>
      <p>A modern web application that allows you to bulk add anime shows to your MyAnimeList account.</p>
      
      <h4>Features</h4>
      <ul>
        <li> Secure OAuth2 authentication with MyAnimeList</li>
        <li> Paste multiple anime titles at once</li>
        <li> Specify episode counts for each show</li>
        <li> Modern, responsive UI</li>
        <li> Fast bulk updates to your MAL list</li>
      </ul>

      <h4>Privacy & Security</h4>
      <ul>
        <li>No user data is stored permanently</li>
        <li>Sessions expire after 24 hours</li>
        <li>All API calls go directly to MyAnimeList</li>
        <li>HTTPS enforced in production</li>
      </ul>
    </div>
  )

  const renderUsagePage = () => (
    <div className="card">
      <h3>How to Use</h3>
      
      <h4>1. Authentication</h4>
      <p>Click "Login with MAL" to authenticate with your MyAnimeList account. This opens a secure popup window.</p>
      
      <h4>2. Adding Shows</h4>
      <p>Paste anime titles in the text area, one per line. You can specify episode counts using these formats:</p>
      
      <div className="code-examples">
        <h5>Basic Format (marks as completed):</h5>
        <pre className="code-block">{`Attack on Titan season 1
Demon Slayer season 2
One Piece`}</pre>
        
        <h5>With Episode Count:</h5>
        <pre className="code-block">{`Attack on Titan (25)
Demon Slayer (26)
One Piece (1000)`}</pre>
        
        <h5>Mixed Format:</h5>
        <pre className="code-block">{`Attack on Titan (25)
Demon Slayer
One Piece (1000)
Naruto`}</pre>
      </div>

      <h4>3. Processing</h4>
      <p>The app will:</p>
      <ol>
        <li>Search MyAnimeList for each anime title</li>
        <li>Find the best match</li>
        <li>Update your list with the specified episode count</li>
        <li>Mark as "completed" if no episode count is specified</li>
        <li>Show results in the right panel</li>
      </ol>

      <h4>4. Results</h4>
      <p>Each show will show one of these statuses:</p>
      <ul>
        <li><strong>completed</strong> - Successfully added to your list</li>
        <li><strong>error</strong> - Failed to add (check the error message)</li>
      </ul>
    </div>
  )

  const renderListPage = () => (
    <div className="card">
      <div className="list-header">
        <h3>Your MAL List</h3>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={() => loadList({ notify: true })}
            disabled={!me.loggedIn || listLoading}
          >
            {listLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>
      <div className="help" style={{ marginBottom: 12 }}>
        Snapshot of the shows in your MAL list with current status, progress, and scores.
      </div>
      {!me.loggedIn ? (
        <div className="muted">Log in with MAL to view your personal list.</div>
      ) : listLoading && !listItems.length ? (
        <div className="muted">Loading your list...</div>
      ) : listError ? (
        <div className="notice" style={{ borderColor: 'rgba(239,68,68,0.4)' }}>{listError}</div>
      ) : listItems.length ? (
        <ListGrid items={listItems} />
      ) : (
        <div className="muted">No entries found yet. Refresh after adding shows.</div>
      )}
    </div>
  )

  const renderExportPage = () => (
    <div className="card">
      <h3>Export MAL List</h3>
      <p>Download a JSON snapshot of your current anime list for safekeeping or sharing.</p>
      {!me.loggedIn ? (
        <div className="muted">Log in with MAL to export your personal list.</div>
      ) : (
        <>
          <div className="help" style={{ marginBottom: 16 }}>
            We'll fetch the latest data directly from MyAnimeList when you export.
          </div>
          <button
            className="btn"
            onClick={onExport}
            disabled={exportLoading || listLoading}
          >
            {exportLoading ? 'Preparing export...' : 'Download JSON'}
          </button>
        </>
      )}
    </div>
  )

  return (
    <>
      <img className="side-illustration" src="/rmtj.jpg" alt="" />
      <div className="container">
        <div className="header">
          <div className="title">MAL List Updater</div>
          <a
            className="support-link"
            href="https://ko-fi.com/rmtj_"
            target="_blank"
            rel="noopener noreferrer"
          >
            Buy me a coffee
          </a>
          <div className="toolbar">
            {me.loggedIn ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <a 
                  href={`https://myanimelist.net/profile/${me.name}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="muted"
                  style={{ textDecoration: 'none', color: 'var(--muted)' }}
                >
                  Logged in as <strong style={{ color: 'var(--accent)' }}>{me.name || '...'}</strong>
                </a>
                <button className="btn btn-secondary" onClick={onLogout} style={{ fontSize: '12px', padding: '6px 10px' }}>
                  Logout
                </button>
              </div>
            ) : (
              <button className="btn" onClick={onLogin}>Login with MAL</button>
            )}
          </div>
        </div>

        <nav className="nav-tabs">
          <button 
            className={`nav-tab ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
          >
            Home
          </button>
          <button 
            className={`nav-tab ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            About
          </button>
          <button 
            className={`nav-tab ${activeTab === 'usage' ? 'active' : ''}`}
            onClick={() => setActiveTab('usage')}
          >
            Usage
          </button>
          <button 
            className={`nav-tab ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}
          >
            List
          </button>
          <button 
            className={`nav-tab ${activeTab === 'export' ? 'active' : ''}`}
            onClick={() => setActiveTab('export')}
          >
            Export
          </button>
        </nav>

        <div className="page-content">
          {activeTab === 'home' && renderHomePage()}
          {activeTab === 'about' && renderAboutPage()}
          {activeTab === 'usage' && renderUsagePage()}
          {activeTab === 'list' && renderListPage()}
          {activeTab === 'export' && renderExportPage()}
        </div>

        <div className="footer">rmtj mal-adder • v{version} • MIT License</div>
      </div>
      
      {toast.show && (
        <div className={`toast ${toast.type} show`}>
          {toast.message}
        </div>
      )}
    </>
  )
}

function PreviewList({ items }) {
  const ready = items.filter(item => !item.error)
  const errors = items.filter(item => item.error)

  return (
    <div className="result-section">
      {ready.length > 0 && (
        <>
          <div className="result-heading">Review matches before updating:</div>
          <ul className="result-list">
            {ready.map(item => (
              <li key={`${item.animeId}-${item.rawInput}`} className="result-item">
                <div>
                  <div className="result-title">{item.matchedTitle}</div>
                  <div className="result-sub">Input: {item.rawInput}</div>
                </div>
                <div className="result-meta">
                  <span>{item.plannedStatus}</span>
                  {item.plannedEpisodes !== null && (
                    <span>{item.plannedEpisodes}{item.totalEpisodes ? ` / ${item.totalEpisodes}` : ''} eps</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {errors.length > 0 && (
        <>
          <div className="result-heading" style={{ marginTop: ready.length ? 16 : 0 }}>Issues to fix:</div>
          <ul className="result-list error">
            {errors.map(item => (
              <li key={`${item.rawInput}-error`} className="result-item error">
                <div>
                  <div className="result-title">{item.rawInput || item.inputTitle}</div>
                  <div className="result-sub">{item.error}</div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function ResultsList({ items }) {
  if (!items.length) return null
  return (
    <div className="result-section">
      <ul className="result-list">
        {items.map((item, idx) => (
          <li key={`${item.title}-${idx}`} className={`result-item ${item.status}`}>
            <div>
              <div className="result-title">{item.title}</div>
              {item.error && <div className="result-sub">{item.error}</div>}
            </div>
            <div className="result-meta">
              <span className="badge">{item.status}</span>
              {item.episodes !== null && item.status !== 'error' && (
                <span>{item.episodes}{item.total ? ` / ${item.total}` : ''} eps</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ListGrid({ items }) {
  return (
    <div className="list-grid">
      {items.map((item) => {
        const episodesLabel =
          item.watchedEpisodes !== null && item.totalEpisodes !== null
            ? `${item.watchedEpisodes} / ${item.totalEpisodes}`
            : item.watchedEpisodes !== null
              ? `${item.watchedEpisodes}`
              : '-'
        const scoreLabel = item.score !== null && item.score > 0 ? item.score : '-'
        const statusLabel = (item.status || '-').replace(/_/g, ' ')
        return (
          <div key={item.id || `${item.title}-${episodesLabel}`} className="list-card">
            <div className="list-card-title">{item.title}</div>
            <div className="list-card-meta">
              <span className={`badge ${item.status || ''}`}>{statusLabel}</span>
              <div className="list-card-stat">
                <span className="label">Episodes</span>
                <span>{episodesLabel}</span>
              </div>
              <div className="list-card-stat">
                <span className="label">Score</span>
                <span>{scoreLabel}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}


