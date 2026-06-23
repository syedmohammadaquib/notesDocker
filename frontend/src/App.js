import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE = process.env.REACT_APP_API_URL || "";
const THEME_KEY = "notes-vault-theme";

const QUICK_TEMPLATES = [
  {
    title: "Project kickoff",
    content: "Goals:\n- Define scope\n- Confirm owners\n- Set milestones",
    tags: "work,planning",
    color: "sky",
  },
  {
    title: "Personal focus",
    content: "Today’s priorities:\n- Deep work block\n- Fitness\n- Inbox zero",
    tags: "personal,focus",
    color: "emerald",
  },
  {
    title: "Ideas bucket",
    content: "Capture rough thoughts here before they disappear.",
    tags: "ideas,brainstorm",
    color: "violet",
  },
];

const FILTERS = [
  { key: "all", label: "All notes" },
  { key: "pinned", label: "Pinned" },
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
];

const COLOR_OPTIONS = [
  { key: "violet", label: "Violet" },
  { key: "teal", label: "Teal" },
  { key: "amber", label: "Amber" },
  { key: "rose", label: "Rose" },
  { key: "sky", label: "Sky" },
  { key: "emerald", label: "Emerald" },
];

function sortNotes(items) {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return Number(b.pinned) - Number(a.pinned);
    }

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function App() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [theme, setTheme] = useState("light");
  const [serverStatus, setServerStatus] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    title: "",
    content: "",
    tags: "",
    color: "violet",
  });

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextTheme = storedTheme || (prefersDark ? "dark" : "light");
    setTheme(nextTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setLoading(true);
        const [notesResponse, healthResponse] = await Promise.all([
          fetch(`${API_BASE}/api/notes`),
          fetch(`${API_BASE}/api/health`),
        ]);

        if (!notesResponse.ok) {
          throw new Error("Failed to load notes.");
        }

        const notesData = await notesResponse.json();
        const healthData = healthResponse.ok ? await healthResponse.json() : null;

        if (!active) {
          return;
        }

        setNotes(sortNotes(Array.isArray(notesData.notes) ? notesData.notes : []));
        setServerStatus(healthData);
        setError("");
      } catch (fetchError) {
        if (active) {
          setError(fetchError.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const total = notes.length;
    const pinned = notes.filter((note) => note.pinned).length;
    const archived = notes.filter((note) => note.archived).length;
    const activeNotes = total - archived;

    return { total, pinned, archived, activeNotes };
  }, [notes]);

  const visibleNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return [...notes]
      .filter((note) => {
        const matchesQuery =
          !normalizedQuery ||
          note.title.toLowerCase().includes(normalizedQuery) ||
          note.content.toLowerCase().includes(normalizedQuery) ||
          (note.tags || []).some((tag) => tag.toLowerCase().includes(normalizedQuery));

        const matchesFilter =
          filter === "all" ||
          (filter === "pinned" && note.pinned) ||
          (filter === "active" && !note.archived) ||
          (filter === "archived" && note.archived);

        return matchesQuery && matchesFilter;
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) {
          return Number(b.pinned) - Number(a.pinned);
        }

        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [filter, notes, query]);

  const activeTemplate = useMemo(() => QUICK_TEMPLATES[0], []);

  function applyTheme(nextTheme) {
    setTheme(nextTheme);
  }

  function resetForm() {
    setEditingId(null);
    setForm({
      title: "",
      content: "",
      tags: "",
      color: "violet",
    });
  }

  function fillTemplate(template) {
    setEditingId(null);
    setForm({
      title: template.title,
      content: template.content,
      tags: template.tags,
      color: template.color,
    });
  }

  function updateLocalNote(updatedNote) {
    setNotes((current) => {
      const exists = current.some((note) => note.id === updatedNote.id);

      const next = exists
        ? current.map((note) => (note.id === updatedNote.id ? updatedNote : note))
        : [updatedNote, ...current];

      return sortNotes(next);
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.title.trim()) {
      setError("Add a title before saving your note.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        color: form.color,
      };

      const response = await fetch(
        editingId ? `${API_BASE}/api/notes/${editingId}` : `${API_BASE}/api/notes`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const message = await response.json().catch(() => ({}));
        throw new Error(message.message || "Could not save the note.");
      }

      const data = await response.json();
      updateLocalNote(data.note);
      resetForm();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      setError("");
      const response = await fetch(`${API_BASE}/api/notes/${id}`, { method: "DELETE" });

      if (!response.ok && response.status !== 204) {
        throw new Error("Could not delete the note.");
      }

    setNotes((current) => current.filter((note) => note.id !== id));
  } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  async function handleToggle(id, path) {
    try {
      setError("");
      const response = await fetch(`${API_BASE}/api/notes/${id}/${path}`, { method: "PATCH" });

      if (!response.ok) {
        throw new Error("Action could not be completed.");
      }

      const data = await response.json();
      updateLocalNote(data.note);
    } catch (toggleError) {
      setError(toggleError.message);
    }
  }

  function handleEdit(note) {
    setEditingId(note.id);
    setForm({
      title: note.title,
      content: note.content,
      tags: (note.tags || []).join(", "),
      color: note.color || "violet",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const heroText = editingId ? "Editing note" : "New note";

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <main className="dashboard">
        <section className="hero-card">
          <div className="hero-copy">
            <span className="eyebrow">Notes Vault</span>
            <h1>Fast note taking with a polished light and dark experience.</h1>
            <p>
              Capture ideas, pin important notes, archive clutter, and keep everything
              responsive and clean across every screen.
            </p>

            <div className="hero-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}
              >
                Switch to {theme === "dark" ? "light" : "dark"} mode
              </button>
              <button type="button" className="ghost-button" onClick={resetForm}>
                Start fresh
              </button>
            </div>
          </div>

          <div className="hero-panel">
            <div className="panel-top">
              <span className={`status-pill ${serverStatus?.database === "connected" ? "ready" : "fallback"}`}>
                {serverStatus?.database === "connected" ? "Mongo connected" : "Memory mode"}
              </span>
              <span className="status-pill subtle">
                {loading ? "Loading" : `${stats.total} notes`}
              </span>
            </div>

            <div className="template-card">
              <span className="template-label">Quick start</span>
              <h2>{activeTemplate.title}</h2>
              <p>{activeTemplate.content}</p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => fillTemplate(activeTemplate)}
              >
                Use template
              </button>
            </div>
          </div>
        </section>

        <section className="stats-grid" aria-label="Overview metrics">
          <article className="stat-card">
            <span>Total</span>
            <strong>{stats.total}</strong>
          </article>
          <article className="stat-card">
            <span>Pinned</span>
            <strong>{stats.pinned}</strong>
          </article>
          <article className="stat-card">
            <span>Active</span>
            <strong>{stats.activeNotes}</strong>
          </article>
          <article className="stat-card">
            <span>Archived</span>
            <strong>{stats.archived}</strong>
          </article>
        </section>

        <section className="workspace">
          <form className="composer-card" onSubmit={handleSubmit}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">{heroText}</span>
                <h2>{editingId ? "Refine the note" : "Create a sharp, useful note"}</h2>
              </div>

              <button type="button" className="ghost-button compact" onClick={resetForm}>
                Clear
              </button>
            </div>

            <label className="field">
              <span>Title</span>
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="What are you capturing?"
              />
            </label>

            <label className="field">
              <span>Content</span>
              <textarea
                value={form.content}
                onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                placeholder="Add details, action items, or a quick brain dump."
                rows={7}
              />
            </label>

            <div className="field-grid">
              <label className="field">
                <span>Tags</span>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
                  placeholder="work, personal, idea"
                />
              </label>

              <label className="field">
                <span>Accent</span>
                <select
                  value={form.color}
                  onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
                >
                  {COLOR_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="template-row">
              {QUICK_TEMPLATES.map((template) => (
                <button
                  key={template.title}
                  type="button"
                  className="template-chip"
                  onClick={() => fillTemplate(template)}
                >
                  {template.title}
                </button>
              ))}
            </div>

            {error ? <div className="notice error">{error}</div> : null}

            <button type="submit" className="primary-button submit-button" disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update note" : "Save note"}
            </button>
          </form>

          <section className="notes-section">
            <div className="section-heading notes-header">
              <div>
                <span className="eyebrow">Library</span>
                <h2>Your notes</h2>
              </div>

              <div className="toolbar">
                <label className="search-box" aria-label="Search notes">
                  <span>Search</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Title, content, or tags"
                  />
                </label>

                <div className="filter-group" role="tablist" aria-label="Note filters">
                  {FILTERS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`filter-chip ${filter === item.key ? "active" : ""}`}
                      onClick={() => setFilter(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="notes-grid">
              {visibleNotes.map((note) => (
                <article key={note.id} className={`note-card color-${note.color}`}>
                  <div className="note-card-top">
                    <span className="note-meta">
                      {note.archived ? "Archived" : "Active"}
                    </span>
                    <button
                      type="button"
                      className={`pin-button ${note.pinned ? "active" : ""}`}
                      onClick={() => handleToggle(note.id, "toggle-pin")}
                      aria-label={note.pinned ? "Unpin note" : "Pin note"}
                    >
                      {note.pinned ? "Pinned" : "Pin"}
                    </button>
                  </div>

                  <h3>{note.title}</h3>
                  <p className="note-content">{note.content || "No content yet."}</p>

                  <div className="tag-row">
                    {(note.tags || []).length ? (
                      note.tags.map((tag) => (
                        <span key={tag} className="tag-pill">
                          #{tag}
                        </span>
                      ))
                    ) : (
                      <span className="tag-pill muted">No tags</span>
                    )}
                  </div>

                  <div className="note-footer">
                    <span>{formatDate(note.updatedAt)}</span>
                    <div className="note-actions">
                      <button type="button" className="text-action" onClick={() => handleEdit(note)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => handleToggle(note.id, "toggle-archive")}
                      >
                        {note.archived ? "Restore" : "Archive"}
                      </button>
                      <button
                        type="button"
                        className="text-action danger"
                        onClick={() => handleDelete(note.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {!loading && visibleNotes.length === 0 ? (
              <div className="empty-state">
                <h3>No notes match your current view.</h3>
                <p>
                  Try a different search term, change the filter, or create a fresh note
                  from the composer.
                </p>
              </div>
            ) : null}
          </section>
        </section>
      </main>
    </div>
  );
}

function formatDate(value) {
  if (!value) {
    return "Just now";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default App;
