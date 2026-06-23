const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(",") : true,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
const memoryNotes = new Map();

const COLORS = new Set(["violet", "teal", "amber", "rose", "sky", "emerald"]);

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => String(tag).trim())
    .filter(Boolean)
    .slice(0, 6);
}

function cleanString(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
}

function toPublicNote(note) {
  return {
    id: note._id ? String(note._id) : note.id,
    title: note.title,
    content: note.content || "",
    color: note.color || "violet",
    pinned: Boolean(note.pinned),
    archived: Boolean(note.archived),
    tags: Array.isArray(note.tags) ? note.tags : [],
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

function memorySort(notes) {
  return notes.sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return Number(b.pinned) - Number(a.pinned);
    }

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function buildPayload(body, existing = {}) {
  const title = cleanString(body.title, existing.title || "");

  if (!title) {
    return { error: "Title is required." };
  }

  const color = COLORS.has(body.color) ? body.color : existing.color || "violet";
  const content = cleanString(body.content, existing.content || "");

  return {
    title,
    content,
    color,
    pinned: typeof body.pinned === "boolean" ? body.pinned : Boolean(existing.pinned),
    archived: typeof body.archived === "boolean" ? body.archived : Boolean(existing.archived),
    tags: normalizeTags(body.tags ?? existing.tags ?? []),
  };
}

async function listNotes() {
  return memorySort(Array.from(memoryNotes.values()).map((note) => ({ ...note }))).map(toPublicNote);
}

async function createNote(body) {
  const payload = buildPayload(body);

  if (payload.error) {
    const error = new Error(payload.error);
    error.statusCode = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const note = {
    id: crypto.randomUUID(),
    ...payload,
    createdAt: now,
    updatedAt: now,
  };

  memoryNotes.set(note.id, note);
  return toPublicNote(note);
}

async function updateNote(id, body) {
  const current = memoryNotes.get(id);

  if (!current) {
    return null;
  }

  const payload = buildPayload(body, current);

  if (payload.error) {
    const error = new Error(payload.error);
    error.statusCode = 400;
    throw error;
  }

  const next = {
    ...current,
    ...payload,
    updatedAt: new Date().toISOString(),
  };

  memoryNotes.set(id, next);
  return toPublicNote(next);
}

async function deleteNote(id) {
  return memoryNotes.delete(id);
}

app.get("/api/health", async (req, res) => {
  res.json({
    ok: true,
    status: "ready",
    database: "memory",
    notes: memoryNotes.size,
    uptime: Math.round(process.uptime()),
  });
});

app.get("/api/notes", async (req, res, next) => {
  try {
    const query = cleanString(req.query.query || req.query.q || "").toLowerCase();
    const filter = cleanString(req.query.filter || "all").toLowerCase();
    const notes = await listNotes();

    const filtered = notes.filter((note) => {
      const matchesQuery =
        !query ||
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query) ||
        note.tags.some((tag) => tag.toLowerCase().includes(query));

      const matchesFilter =
        filter === "all" ||
        (filter === "pinned" && note.pinned) ||
        (filter === "active" && !note.archived) ||
        (filter === "archived" && note.archived);

      return matchesQuery && matchesFilter;
    });

    res.json({ notes: filtered });
  } catch (error) {
    next(error);
  }
});

app.post("/api/notes", async (req, res, next) => {
  try {
    const note = await createNote(req.body || {});
    res.status(201).json({ note });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/notes/:id", async (req, res, next) => {
  try {
    const note = await updateNote(req.params.id, req.body || {});

    if (!note) {
      return res.status(404).json({ message: "Note not found" });
    }

    res.json({ note });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/notes/:id/toggle-pin", async (req, res, next) => {
  try {
    const current = memoryNotes.get(req.params.id);

    if (!current) {
      return res.status(404).json({ message: "Note not found" });
    }

    const note = await updateNote(req.params.id, { pinned: !Boolean(current.pinned) });
    res.json({ note });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/notes/:id/toggle-archive", async (req, res, next) => {
  try {
    const current = memoryNotes.get(req.params.id);

    if (!current) {
      return res.status(404).json({ message: "Note not found" });
    }

    const note = await updateNote(req.params.id, { archived: !Boolean(current.archived) });
    res.json({ note });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/notes/:id", async (req, res, next) => {
  try {
    const deleted = await deleteNote(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Note not found" });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({
    message: error.message || "Something went wrong",
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
