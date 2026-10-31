import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'bookmark-manager-state-v1';

const defaultFolders = [
  {
    id: 'apps',
    label: 'Apps',
    icon: 'A',
    kind: 'apps',
    items: [
      { id: 1, title: 'GitHub', url: 'https://github.com', favorite: true, tags: ['code', 'team'], type: 'app', source: 'github.com', savedAt: '2026-10-23' },
      { id: 2, title: 'Notion', url: 'https://www.notion.so', favorite: false, tags: ['notes', 'docs'], type: 'app', source: 'notion.so', savedAt: '2026-10-23' },
      { id: 3, title: 'Figma', url: 'https://figma.com', favorite: true, tags: ['design', 'ui'], type: 'app', source: 'figma.com', savedAt: '2026-10-23' },
      { id: 4, title: 'Linear', url: 'https://linear.app', favorite: false, tags: ['product', 'tasks'], type: 'app', source: 'linear.app', savedAt: '2026-10-23' },
    ],
  },
  {
    id: 'news',
    label: 'News',
    icon: 'N',
    kind: 'content',
    items: [
      { id: 5, title: 'CNN World', url: 'https://edition.cnn.com/world', favorite: true, tags: ['global', 'latest'], type: 'news', source: 'CNN', savedAt: '2026-10-23', thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/8/80/CNN.svg' },
      { id: 6, title: 'BBC News', url: 'https://www.bbc.com/news', favorite: false, tags: ['world', 'updates'], type: 'news', source: 'BBC', savedAt: '2026-10-23', thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/e/eb/BBC_News_2022.svg' },
      { id: 7, title: 'Reuters', url: 'https://www.reuters.com', favorite: true, tags: ['business', 'markets'], type: 'news', source: 'Reuters', savedAt: '2026-10-23', thumbnail: 'https://upload.wikimedia.org/wikipedia/commons/4/44/Reuters_Logo.svg' },
    ],
  },
  {
    id: 'articles',
    label: 'Articles',
    icon: 'A',
    kind: 'content',
    items: [
      { id: 8, title: 'React Patterns for Modern Apps', url: 'https://refine.dev/blog/react-patterns/', favorite: false, tags: ['react', 'patterns'], type: 'article', source: 'Refine', savedAt: '2026-10-23', thumbnail: 'https://refine.dev/favicon.ico' },
      { id: 9, title: 'Designing Better User Flows', url: 'https://www.nngroup.com/articles/', favorite: true, tags: ['ux', 'research'], type: 'article', source: 'NN/g', savedAt: '2026-10-23', thumbnail: 'https://www.nngroup.com/favicon.ico' },
      { id: 10, title: 'JavaScript Tutorial', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript', favorite: false, tags: ['tutorial', 'docs'], type: 'article', source: 'MDN', savedAt: '2026-10-23', thumbnail: 'https://developer.mozilla.org/favicon-32x32.png' },
    ],
  },
  {
    id: 'videos',
    label: 'Videos',
    icon: 'V',
    kind: 'standard',
    items: [
      { id: 11, title: 'YouTube', url: 'https://youtube.com', favorite: false, tags: ['learning', 'videos'], type: 'video', source: 'YouTube', savedAt: '2026-10-23' },
      { id: 12, title: 'Coursera', url: 'https://www.coursera.org', favorite: true, tags: ['courses', 'study'], type: 'video', source: 'Coursera', savedAt: '2026-10-23' },
    ],
  },
  {
    id: 'work',
    label: 'Work',
    icon: 'W',
    kind: 'standard',
    items: [
      { id: 13, title: 'Slack', url: 'https://slack.com', favorite: true, tags: ['team', 'communication'], type: 'bookmark', source: 'Slack', savedAt: '2026-10-23' },
      { id: 14, title: 'Google Drive', url: 'https://drive.google.com', favorite: false, tags: ['files', 'docs'], type: 'bookmark', source: 'Google', savedAt: '2026-10-23' },
    ],
  },
  {
    id: 'personal',
    label: 'Personal',
    icon: 'P',
    kind: 'standard',
    items: [
      { id: 15, title: 'Spotify', url: 'https://spotify.com', favorite: true, tags: ['music', 'podcasts'], type: 'bookmark', source: 'Spotify', savedAt: '2026-10-23' },
      { id: 16, title: 'Goodreads', url: 'https://www.goodreads.com', favorite: false, tags: ['books', 'reading'], type: 'bookmark', source: 'Goodreads', savedAt: '2026-10-23' },
    ],
  },
];

const defaultExpanded = { apps: true, news: true, articles: true, videos: true, work: true, personal: true };

const normalizeUrl = (value) => {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
};

const parseTags = (value) =>
  value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag, index, arr) => arr.indexOf(tag) === index);

const getDomain = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const inferItemType = (url, title = '') => {
  const haystack = `${title} ${url}`.toLowerCase();

  if (/github|notion|figma|linear|slack|asana|trello|jira/.test(haystack)) return 'app';
  if (/cnn|bbc|reuters|nytimes|wsj|forbes|theverge|bloomberg/.test(haystack)) return 'news';
  if (/blog|tutorial|guide|docs|documentation|article|medium|dev\.to|mdn|refine/.test(haystack)) return 'article';
  if (/youtube|vimeo|tiktok|video|stream|watch/.test(haystack)) return 'video';
  return 'bookmark';
};

const inferFolderId = (url, title = '') => {
  const type = inferItemType(url, title);
  if (type === 'app') return 'apps';
  if (type === 'news') return 'news';
  if (type === 'article') return 'articles';
  if (type === 'video') return 'videos';
  return 'work';
};

const getFavicon = (url) => `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`;

const readStoredData = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { folders: defaultFolders, expanded: defaultExpanded };
    const parsed = JSON.parse(raw);
    const normalizedFolders = (Array.isArray(parsed) ? parsed : parsed.folders ?? defaultFolders).map((folder) => ({
      ...folder,
      icon: '•',
    }));
    return { folders: normalizedFolders, expanded: (parsed.expanded ?? defaultExpanded) };
  } catch {
    return { folders: defaultFolders, expanded: defaultExpanded };
  }
};

const createBlankForm = (categoryId = 'apps') => ({
  title: '',
  url: '',
  category: categoryId,
  tags: '',
  favorite: false,
});

const systemFeatures = [
  {
    module: 'User Management',
    features: [
      { name: 'Registration & Login', description: 'Create accounts and securely log in with role-based access for future expansion.' },
      { name: 'Profile Management', description: 'View and update personal information as needed.' },
    ],
  },
  {
    module: 'Core Module',
    features: [
      { name: 'Bookmark Management', description: 'Add, edit, delete, and view bookmarks in a clean interface.' },
      { name: 'Categorization & Tagging', description: 'Organize bookmarks by categories and tags for easy retrieval.' },
      { name: 'Search & Filter', description: 'Find bookmarks quickly using keywords and filters.' },
      { name: 'Favorites', description: 'Mark important bookmarks for faster access.' },
      { name: 'Persistent Storage', description: 'Keep bookmarks saved across sessions with local storage or a database.' },
    ],
  },
  {
    module: 'Reporting',
    features: [
      { name: 'Dashboard & Reports', description: 'Summarize bookmark activity, most-used sites, and category usage.' },
    ],
  },
  {
    module: 'Notifications',
    features: [
      { name: 'Alerts / Push Notifications', description: 'Send in-app updates about actions such as imports, exports, and status changes.' },
    ],
  },
  {
    module: 'Administration',
    features: [
      { name: 'System Settings', description: 'Manage categories, user roles, and configuration settings.' },
    ],
  },
];

const systemRequirements = [
  { title: 'Functional Requirements', items: ['User registration and login', 'Bookmark CRUD operations', 'Folder and tag organization', 'Favorites and search filters', 'Local persistence of bookmark data'] },
  { title: 'Non-Functional Requirements', items: ['Responsive mobile-friendly interface', 'Fast access and simple navigation', 'Clear user feedback for actions', 'Accessible and readable layout', 'Reliable local data storage'] },
  { title: 'Admin Requirements', items: ['Manage categories and system settings', 'Control user roles and access levels', 'Configure reporting settings', 'Review notification and system activity'] },
];

const settingsGroups = [
  { id: 'general', label: 'General', items: ['Default category: Work', 'Default sorting: Newest', 'Language: English'] },
  { id: 'access', label: 'Access', items: ['Require login for saved data', 'User roles: Admin / User', 'Auto-save bookmarks enabled'] },
  { id: 'notifications', label: 'Notifications', items: ['In-app alerts on bookmark import', 'Favorite updates summary', 'Weekly report emails'] },
  { id: 'security', label: 'Security', items: ['Session timeout: 30 min', 'Two-step auth ready', 'Secure storage for credentials'] },
];

function App() {
  const stored = readStoredData();
  const [folders, setFolders] = useState(stored.folders);
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expanded, setExpanded] = useState(stored.expanded);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [currentView, setCurrentView] = useState('landing');
  const [activeSystemTab, setActiveSystemTab] = useState('overview');
  const [editingBookmark, setEditingBookmark] = useState(null);
  const [formData, setFormData] = useState(createBlankForm());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ folders, expanded }));
  }, [folders, expanded]);

  const categoryOptions = useMemo(
    () =>
      folders.map((folder) => ({
        id: folder.id,
        label: folder.label,
        icon: folder.icon,
      })),
    [folders],
  );

  const filteredFolders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return folders
      .map((folder) => {
        const items = folder.items.filter((item) => {
          const matchesCategory = selectedCategory === 'all' || selectedCategory === folder.id;
          const matchesFilter = filterMode === 'all' || (filterMode === 'favorites' && item.favorite);
          const matchesQuery =
            !normalizedQuery ||
            [folder.label, item.title, item.url, item.tags?.join(' ') ?? '']
              .join(' ')
              .toLowerCase()
              .includes(normalizedQuery);

          return matchesCategory && matchesFilter && matchesQuery;
        });

        return { ...folder, items };
      })
      .filter((folder) => folder.items.length > 0);
  }, [folders, query, filterMode, selectedCategory]);

  const totalFavorites = useMemo(
    () => folders.reduce((count, folder) => count + folder.items.filter((item) => item.favorite).length, 0),
    [folders],
  );

  const toggleFolder = (folderId) => {
    setExpanded((current) => ({
      ...current,
      [folderId]: !current[folderId],
    }));
  };

  const handleDelete = (folderId, bookmarkId) => {
    setFolders((current) =>
      current.map((folder) =>
        folder.id === folderId
          ? { ...folder, items: folder.items.filter((item) => item.id !== bookmarkId) }
          : folder,
      ),
    );
    setMenuOpenId(null);
  };

  const handleFavoriteToggle = (folderId, bookmarkId) => {
    setFolders((current) =>
      current.map((folder) =>
        folder.id === folderId
          ? {
              ...folder,
              items: folder.items.map((item) =>
                item.id === bookmarkId ? { ...item, favorite: !item.favorite } : item,
              ),
            }
          : folder,
      ),
    );
  };

  const toggleActionMenu = (itemId) => {
    setMenuOpenId((current) => (current === itemId ? null : itemId));
  };

  const openBookmark = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openAddModal = () => {
    setEditingBookmark(null);
    setFormData(createBlankForm(selectedCategory !== 'all' ? selectedCategory : 'work'));
    setIsModalOpen(true);
  };

  const openEditModal = (folderId, item) => {
    setEditingBookmark({ folderId, item });
    setFormData({
      title: item.title,
      url: item.url,
      category: folderId,
      tags: item.tags?.join(', ') ?? '',
      favorite: item.favorite,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingBookmark(null);
    setFormData(createBlankForm());
  };

  const openAuthSheet = (mode = 'login') => {
    setAuthMode(mode);
    setIsAuthOpen(true);
  };

  const closeAuthSheet = () => {
    setIsAuthOpen(false);
    setAuthForm({ name: '', email: '', password: '' });
  };

  const handleAuthSubmit = (event) => {
    event.preventDefault();
    setCurrentView('app');
    closeAuthSheet();
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const title = formData.title.trim();
    const url = normalizeUrl(formData.url.trim());
    const inferredFolder = inferFolderId(url, title);
    const categoryId = formData.category || inferredFolder;

    if (!title || !url) return;

    const validTags = parseTags(formData.tags);
    const itemType = inferItemType(url, title);

    if (editingBookmark) {
      setFolders((current) =>
        current.map((folder) => {
          if (folder.id !== editingBookmark.folderId) return folder;

          return {
            ...folder,
            items: folder.items.map((item) =>
              item.id === editingBookmark.item.id
                ? {
                    ...item,
                    title,
                    url,
                    favorite: formData.favorite,
                    tags: validTags,
                    type: itemType,
                    source: getDomain(url),
                    savedAt: new Date().toISOString(),
                  }
                : item,
            ),
          };
        }),
      );
    } else {
      const newBookmark = {
        id: Date.now(),
        title,
        url,
        favorite: formData.favorite,
        tags: validTags,
        type: itemType,
        source: getDomain(url),
        savedAt: new Date().toISOString(),
      };

      setFolders((current) =>
        current.map((folder) =>
          folder.id === categoryId
            ? { ...folder, items: [newBookmark, ...folder.items] }
            : folder,
        ),
      );
      setExpanded((current) => ({ ...current, [categoryId]: true }));
    }

    closeModal();
  };

  if (currentView === 'landing') {
    return (
      <div className="app-shell landing-shell">
        <div className="landing-card">
          <div className="landing-brand">
            <div className="brand-mark large">B</div>
            <span>Bookmark Manager</span>
          </div>

          <div className="landing-copy">
            <p className="eyebrow">Save smarter</p>
            <h1>Organize the pages you use every day.</h1>
            <p className="subtitle">
              Keep your work, research, and inspiration in one calm, searchable space.
            </p>
          </div>

          <div className="landing-actions">
            <button type="button" className="primary-button landing-button" onClick={() => openAuthSheet('login')}>
              Log in
            </button>
            <button type="button" className="secondary-button landing-button" onClick={() => openAuthSheet('signup')}>
              Create account
            </button>
          </div>

          <div className="landing-features">
            <div>
              <strong>3k+</strong>
              <span>saved links</span>
            </div>
            <div>
              <strong>24/7</strong>
              <span>study access</span>
            </div>
            <div>
              <strong>Easy</strong>
              <span>find fast</span>
            </div>
          </div>
        </div>

        {isAuthOpen && (
          <div className="auth-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <div className="auth-sheet">
              <div className="auth-header">
                <div className="auth-logo" aria-label="Bookmark manager logo">B</div>
                <button type="button" className="close-button" onClick={closeAuthSheet} aria-label="Close account panel">
                  ×
                </button>
              </div>

              <div className="auth-toggle" aria-label="Account mode selector">
                <button
                  type="button"
                  className={authMode === 'login' ? 'auth-tab active' : 'auth-tab'}
                  onClick={() => setAuthMode('login')}
                >
                  Log in
                </button>
                <button
                  type="button"
                  className={authMode === 'signup' ? 'auth-tab active' : 'auth-tab'}
                  onClick={() => setAuthMode('signup')}
                >
                  Create account
                </button>
              </div>

              <form className="auth-form" onSubmit={handleAuthSubmit}>
                {authMode === 'signup' && (
                  <label>
                    <span>Full name</span>
                    <input
                      type="text"
                      value={authForm.name}
                      onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })}
                      placeholder="Alex Morgan"
                    />
                  </label>
                )}

                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={authForm.email}
                    onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                    placeholder="you@example.com"
                    required
                  />
                </label>

                <label>
                  <span>Password</span>
                  <input
                    type="password"
                    value={authForm.password}
                    onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                    placeholder="••••••••"
                    required
                  />
                </label>

                <button type="submit" className="primary-button auth-submit">
                  {authMode === 'login' ? 'Log in' : 'Create account'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  const renderFolderItems = (folder) => {
    const folderType = folder.kind || 'standard';

    if (folderType === 'apps') {
      return (
        <div className="app-grid" id={`${folder.id}-items`}>
          {folder.items.map((item) => (
            <div className="app-card" key={item.id}>
              <div className="app-top-row">
                <div className="app-logo" aria-hidden="true">
                  <img src={getFavicon(item.url)} alt="" />
                </div>
                <button
                  type="button"
                  className={`favorite-toggle ${item.favorite ? 'active' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleFavoriteToggle(folder.id, item.id);
                  }}
                  aria-label={item.favorite ? `Remove ${item.title} from favorites` : `Add ${item.title} to favorites`}
                >
                  {item.favorite ? '★' : '☆'}
                </button>
              </div>

              <div className="app-card-body" onClick={() => openBookmark(item.url)} role="button" tabIndex={0} onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openBookmark(item.url);
                }
              }}>
                <h3>{item.title}</h3>
                <p>{getDomain(item.url)}</p>
              </div>

              <div className="app-card-actions">
                <button
                  type="button"
                  className="mini-action edit"
                  onClick={(event) => {
                    event.stopPropagation();
                    openEditModal(folder.id, item);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="mini-action delete"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDelete(folder.id, item.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (folderType === 'content') {
      return (
        <div className="content-grid" id={`${folder.id}-items`}>
          {folder.items.map((item) => (
            <article className="content-card" key={item.id}>
              <div className="content-thumb-wrap">
                <img src={item.thumbnail || getFavicon(item.url)} alt="" className="content-thumb" />
              </div>

              <div className="content-body">
                <div className="content-header-row">
                  <div>
                    <p className="content-source">{item.source || getDomain(item.url)}</p>
                    <h3>{item.title}</h3>
                  </div>
                  <button
                    type="button"
                    className={`favorite-toggle ${item.favorite ? 'active' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleFavoriteToggle(folder.id, item.id);
                    }}
                    aria-label={item.favorite ? `Remove ${item.title} from favorites` : `Add ${item.title} to favorites`}
                  >
                    {item.favorite ? '★' : '☆'}
                  </button>
                </div>

                <div className="tag-row">
                  {item.tags?.slice(0, 3).map((tag) => (
                    <span key={`${item.id}-${tag}`} className="tag">{tag}</span>
                  ))}
                </div>

                <div className="content-meta-row">
                  <span>{item.source || getDomain(item.url)}</span>
                  <span>{item.savedAt ? new Date(item.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Saved recently'}</span>
                </div>

                <div className="content-actions">
                  <button
                    type="button"
                    className="mini-action edit"
                    onClick={() => openEditModal(folder.id, item)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="mini-action delete"
                    onClick={() => handleDelete(folder.id, item.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      );
    }

    return (
      <div className="bookmark-list-grid" id={`${folder.id}-items`}>
        {folder.items.map((item) => (
          <div className="bookmark-card-wrap" key={item.id}>
            <div
              className="bookmark-card"
              role="button"
              tabIndex={0}
              onClick={() => openBookmark(item.url)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openBookmark(item.url);
                }
              }}
              aria-label={`Open ${item.title}`}
            >
              <div className="favicon-wrap">
                <img src={getFavicon(item.url)} alt="" />
              </div>

              <div className="bookmark-copy">
                <div className="bookmark-meta-row">
                  <h3>{item.title}</h3>
                  <button
                    type="button"
                    className={`favorite-toggle ${item.favorite ? 'active' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleFavoriteToggle(folder.id, item.id);
                    }}
                    aria-label={item.favorite ? `Remove ${item.title} from favorites` : `Add ${item.title} to favorites`}
                  >
                    {item.favorite ? '★' : '☆'}
                  </button>
                </div>

                <p>{getDomain(item.url)}</p>
                {item.tags?.length > 0 && (
                  <div className="tag-row">
                    {item.tags.slice(0, 2).map((tag) => (
                      <span key={`${item.id}-${tag}`} className="tag">{tag}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="action-menu-wrap">
                <button
                  type="button"
                  className="menu-trigger"
                  aria-label={`Open actions for ${item.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleActionMenu(item.id);
                  }}
                >
                  ⋯
                </button>

                {menuOpenId === item.id && (
                  <div className="action-menu" role="menu" aria-label={`${item.title} actions`}>
                    <button
                      type="button"
                      className="action edit"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditModal(folder.id, item);
                        setMenuOpenId(null);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="action delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(folder.id, item.id);
                        setMenuOpenId(null);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="app-shell">
      <div className="phone-frame">
        <header className="topbar" aria-label="Bookmark manager navigation">
          <button type="button" className="icon-button brand-button" aria-label="Bookmark manager logo">
            <span className="brand-mark">B</span>
          </button>

          <label className="search-field" aria-label="Search bookmarks">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="2" />
              <path d="M16 16L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              className="search-input"
              type="search"
              aria-label="Search bookmarks"
              placeholder="Search bookmarks"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <button type="button" className="icon-button menu-button" aria-label="Open account menu" onClick={() => openAuthSheet('login')}>
            <span className="hamburger" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </header>

        <div className="filter-panel">
          <div className="utility-row">
            <div className="pill-group" aria-label="Bookmark filters">
              <button
                type="button"
                className={`filter-pill ${filterMode === 'all' ? 'active' : ''}`}
                onClick={() => setFilterMode('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`filter-pill ${filterMode === 'favorites' ? 'active' : ''}`}
                onClick={() => setFilterMode('favorites')}
              >
                Favorites
              </button>
            </div>
            <div className="favorites-badge" aria-label={`${totalFavorites} favorite bookmarks`}>
              {totalFavorites}★
            </div>
          </div>

          <div className="category-row" aria-label="Category filters">
            <button
              type="button"
              className={`category-pill ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              All
            </button>
            {categoryOptions.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`category-pill ${selectedCategory === category.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category.id)}
              >
                {category.icon} {category.label}
              </button>
            ))}
          </div>
        </div>

        <main className="bookmark-list" aria-live="polite">
          {filteredFolders.length === 0 ? (
            <div className="empty-state" role="status">
              No bookmarks match your current filters.
            </div>
          ) : (
            filteredFolders.map((folder) => (
              <section key={folder.id} className="folder-section">
                <button
                  type="button"
                  className="folder-header"
                  onClick={() => toggleFolder(folder.id)}
                  aria-expanded={expanded[folder.id]}
                  aria-controls={`${folder.id}-items`}
                >
                  <span className="folder-icon" aria-hidden="true">{folder.icon}</span>
                  <span className="folder-label">{folder.label}</span>
                  <span className="folder-meta" aria-label={`${folder.items.length} bookmarks`}>
                    {folder.items.length}
                  </span>
                  <span className={`chevron ${expanded[folder.id] ? 'open' : ''}`} aria-hidden="true">
                    ▾
                  </span>
                </button>

                {expanded[folder.id] && <div className="folder-body">{renderFolderItems(folder)}</div>}
              </section>
            ))
          )}
        </main>

        <button type="button" className="fab" onClick={openAddModal} aria-label="Add bookmark">
          +
        </button>

        {isAuthOpen && (
          <div className="auth-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <div className="auth-sheet">
              <div className="auth-header">
                <div className="auth-logo" aria-label="Bookmark manager logo">B</div>
                <button type="button" className="close-button" onClick={closeAuthSheet} aria-label="Close account panel">
                  ×
                </button>
              </div>

              <div className="auth-toggle" aria-label="Account mode selector">
                <button
                  type="button"
                  className={authMode === 'login' ? 'auth-tab active' : 'auth-tab'}
                  onClick={() => setAuthMode('login')}
                >
                  Log in
                </button>
                <button
                  type="button"
                  className={authMode === 'signup' ? 'auth-tab active' : 'auth-tab'}
                  onClick={() => setAuthMode('signup')}
                >
                  Create account
                </button>
              </div>

              <form className="auth-form" onSubmit={handleAuthSubmit}>
                {authMode === 'signup' && (
                  <label>
                    <span>Full name</span>
                    <input
                      type="text"
                      value={authForm.name}
                      onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })}
                      placeholder="Alex Morgan"
                    />
                  </label>
                )}

                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={authForm.email}
                    onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })}
                    placeholder="you@example.com"
                    required
                  />
                </label>

                <label>
                  <span>Password</span>
                  <input
                    type="password"
                    value={authForm.password}
                    onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                    placeholder="••••••••"
                    required
                  />
                </label>

                <button type="submit" className="primary-button auth-submit">
                  {authMode === 'login' ? 'Log in' : 'Create account'}
                </button>
              </form>

              <div className="system-panel">
                <div className="system-tabs" aria-label="System sections">
                  <button type="button" className={activeSystemTab === 'overview' ? 'system-tab active' : 'system-tab'} onClick={() => setActiveSystemTab('overview')}>Overview</button>
                  <button type="button" className={activeSystemTab === 'dashboard' ? 'system-tab active' : 'system-tab'} onClick={() => setActiveSystemTab('dashboard')}>Dashboard</button>
                  <button type="button" className={activeSystemTab === 'settings' ? 'system-tab active' : 'system-tab'} onClick={() => setActiveSystemTab('settings')}>Settings</button>
                  <button type="button" className={activeSystemTab === 'requirements' ? 'system-tab active' : 'system-tab'} onClick={() => setActiveSystemTab('requirements')}>Requirements</button>
                </div>

                {activeSystemTab === 'overview' && (
                  <div className="system-features">
                    <div className="system-features-header">System Features</div>
                    {systemFeatures.map((group) => (
                      <div key={group.module} className="feature-group">
                        <h3>{group.module}</h3>
                        <ul>
                          {group.features.map((feature) => (
                            <li key={feature.name}>
                              <strong>{feature.name}</strong>
                              <span>{feature.description}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {activeSystemTab === 'dashboard' && (
                  <div className="dashboard-panel">
                    <div className="dashboard-grid">
                      <div className="dashboard-card">
                        <span>Total Bookmarks</span>
                        <strong>{folders.reduce((count, folder) => count + folder.items.length, 0)}</strong>
                      </div>
                      <div className="dashboard-card">
                        <span>Favorites</span>
                        <strong>{totalFavorites}</strong>
                      </div>
                      <div className="dashboard-card">
                        <span>Categories</span>
                        <strong>{folders.length}</strong>
                      </div>
                      <div className="dashboard-card">
                        <span>Alerts</span>
                        <strong>3</strong>
                      </div>
                    </div>

                    <div className="chart-panel">
                      <h3>Bookmark Distribution</h3>
                      {folders.map((folder) => (
                        <div key={folder.id} className="chart-row">
                          <span>{folder.label}</span>
                          <div className="chart-bar"><i style={{ width: `${Math.max(18, (folder.items.length / Math.max(1, totalFavorites || 1)) * 100)}%` }} /></div>
                          <strong>{folder.items.length}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeSystemTab === 'settings' && (
                  <div className="settings-panel">
                    <div className="settings-tabs" aria-label="Settings categories">
                      {settingsGroups.map((group) => (
                        <button
                          key={group.id}
                          type="button"
                          className={group.id === 'general' ? 'settings-tab active' : 'settings-tab'}
                        >
                          {group.label}
                        </button>
                      ))}
                    </div>

                    <div className="settings-list">
                      {settingsGroups.map((group) => (
                        <div key={group.id} className="settings-group">
                          <h3>{group.label}</h3>
                          <ul>
                            {group.items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeSystemTab === 'requirements' && (
                  <div className="requirements-panel">
                    {systemRequirements.map((section) => (
                      <div key={section.title} className="requirements-section">
                        <h3>{section.title}</h3>
                        <ul>
                          {section.items.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {isModalOpen && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="bookmark-modal-title">
            <div className="modal-card">
              <div className="modal-header">
                <h2 id="bookmark-modal-title">{editingBookmark ? 'Edit bookmark' : 'Add bookmark'}</h2>
                <button type="button" className="close-button" onClick={closeModal} aria-label="Close form">
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit} className="bookmark-form">
                <label>
                  <span>Title</span>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(event) => setFormData({ ...formData, title: event.target.value })}
                    placeholder="Example: GitHub"
                    required
                  />
                </label>

                <label>
                  <span>URL</span>
                  <input
                    type="url"
                    value={formData.url}
                    onChange={(event) => setFormData({ ...formData, url: event.target.value })}
                    placeholder="https://example.com"
                    required
                  />
                </label>

                <div className="split-fields">
                  <label>
                    <span>Category</span>
                    <select
                      value={formData.category}
                      onChange={(event) => setFormData({ ...formData, category: event.target.value })}
                    >
                      {categoryOptions.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={formData.favorite}
                      onChange={(event) => setFormData({ ...formData, favorite: event.target.checked })}
                    />
                    <span>Favorite</span>
                  </label>
                </div>

                <label>
                  <span>Tags</span>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(event) => setFormData({ ...formData, tags: event.target.value })}
                    placeholder="design, tools, work"
                  />
                </label>

                <div className="form-actions">
                  <button type="button" className="secondary-button" onClick={closeModal}>
                    Cancel
                  </button>
                  <button type="submit" className="primary-button">
                    {editingBookmark ? 'Save changes' : 'Add bookmark'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
