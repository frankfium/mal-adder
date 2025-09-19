import React, { useEffect, useMemo, useState } from 'react'

function useIsHttpOrigin() {
  return useMemo(() => typeof location !== 'undefined' && location.protocol.startsWith('http'), [])
}

export default function App() {
  const isHttp = useIsHttpOrigin()
  const [showsText, setShowsText] = useState('')
  const [output, setOutput] = useState('')
  const [me, setMe] = useState({ loading: true, loggedIn: false, name: '' })
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' })
  const [activeTab, setActiveTab] = useState('home')

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
    } catch (err) {
      console.error('Logout error:', err)
    }
  }

  const onSubmit = async () => {
    if (!isHttp) {
      alert('Please open http://localhost:3000/ in your browser (do not open this file directly).')
      return
    }
    const shows = showsText.split('\n').map(s => s.trim()).filter(Boolean)
    const res = await fetch('/add-shows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shows }),
      credentials: 'include'
    })
    const data = await res.json()
    setOutput(JSON.stringify(data, null, 2))
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
            <button className="btn" onClick={onSubmit}>Update List</button>
            <button className="btn btn-secondary" type="button" onClick={() => { setShowsText(''); setOutput('') }}>Clear</button>
          </div>
        </div>
        <div className="card">
          <h3>Result</h3>
          <pre>{output}</pre>
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

  return (
    <>
      <img className="side-illustration" src="/rmtj.jpg" alt="" />
      <div className="container">
        <div className="header">
          <div className="title">MAL List Updater</div>
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
        </nav>

        <div className="page-content">
          {activeTab === 'home' && renderHomePage()}
          {activeTab === 'about' && renderAboutPage()}
          {activeTab === 'usage' && renderUsagePage()}
        </div>

        <div className="footer">Built for MyAnimeList API • Local demo</div>
      </div>
      
      {toast.show && (
        <div className={`toast ${toast.type} show`}>
          {toast.message}
        </div>
      )}
    </>
  )
}


