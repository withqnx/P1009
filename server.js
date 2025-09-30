// server.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import sqlite3 from "sqlite3";
import cors from "cors";
import crypto from "crypto";
import sanitize from "sanitize-filename";
import { fileURLToPath } from "url";
import { promisify } from "util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------------
// 정적/공통
// ------------------------------------
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.static(PUBLIC_DIR));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// ------------------------------------
// 콘텐츠 관리 (텍스트 + 스타일)
// ------------------------------------
const CONTENT_PATH = path.join(__dirname, "content.json");

const DEFAULT_TEXTS = {
  title: "소리를 담는 글자, 한글",
  subtitle: "의성어·의태어를 직접 말하고 기록해 한글날 디지털 아카이브로 남겨요.",
  participateTitle: "소리를 담고, 소리를 남기다",
  participateSubtitle: "의성어·의태어를 입력하고 직접 소리 내어 녹음해 주세요.",
  galleryTitle: "온라인 전시관",
  gallerySubtitle: "단어 카드를 눌러 직접 들어보세요.",
  footer: "© 2025 withqnx"
};

// 항목별 스타일 기본값
const DEFAULT_STYLES = {
  title:              { size: "", color: "", align: "", weight: "", lineHeight: "" },
  subtitle:           { size: "", color: "", align: "", weight: "", lineHeight: "" },
  participateTitle:   { size: "", color: "", align: "", weight: "", lineHeight: "" },
  participateSubtitle:{ size: "", color: "", align: "", weight: "", lineHeight: "" },
  galleryTitle:       { size: "", color: "", align: "", weight: "", lineHeight: "" },
  gallerySubtitle:    { size: "", color: "", align: "", weight: "", lineHeight: "" },
  footer:             { size: "", color: "", align: "", weight: "", lineHeight: "" }
};

const ADMIN_KEY = process.env.CONTENT_ADMIN_KEY || "changeme";

function loadContent() {
  try {
    if (fs.existsSync(CONTENT_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONTENT_PATH, "utf-8"));
      const texts = { ...DEFAULT_TEXTS, ...(raw.texts || raw) }; // 구버전 호환
      const styles = { ...DEFAULT_STYLES, ...(raw.styles || {}) };
      return { texts, styles };
    }
  } catch (e) { console.warn("content.json 읽기 실패:", e); }
  return { texts: { ...DEFAULT_TEXTS }, styles: { ...DEFAULT_STYLES } };
}

function saveContent(payload) {
  const current = loadContent();
  const out = {
    texts: { ...current.texts },
    styles: { ...current.styles }
  };
  if (payload.texts) {
    for (const k of Object.keys(DEFAULT_TEXTS)) {
      if (k in payload.texts) out.texts[k] = String(payload.texts[k] ?? "");
    }
  }
  if (payload.styles) {
    for (const k of Object.keys(DEFAULT_STYLES)) {
      const s = payload.styles[k] || {};
      out.styles[k] = {
        size: String(s.size ?? ""),
        color: String(s.color ?? ""),
        align: String(s.align ?? ""),
        weight: String(s.weight ?? ""),
        lineHeight: String(s.lineHeight ?? "")
      };
    }
  }
  fs.writeFileSync(CONTENT_PATH, JSON.stringify(out, null, 2), "utf-8");
  return out;
}

if (!fs.existsSync(CONTENT_PATH)) saveContent({});

// 공개 조회
app.get("/api/content", (_req, res) => {
  res.json(loadContent());
});

// 인증
app.post("/api/auth", (req, res) => {
  const key = req.headers["x-admin-key"];
  if (key !== ADMIN_KEY) return res.status(401).json({ ok: false });
  res.json({ ok: true });
});

// 저장(관리자)
app.post("/api/content", (req, res) => {
  const key = req.headers["x-admin-key"];
  if (key !== ADMIN_KEY) return res.status(401).json({ ok: false, error: "unauthorized" });
  const saved = saveContent(req.body || {});
  res.json({ ok: true, content: saved });
});

// ------------------------------------
// DB (sqlite3) + 업로드
// ------------------------------------
sqlite3.verbose();
const dbPath = path.join(__dirname, "db.sqlite");
const db = new sqlite3.Database(dbPath);
const dbRun = promisify(db.run.bind(db));
const dbAll = promisify(db.all.bind(db));
const dbGet = promisify(db.get.bind(db));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      word TEXT NOT NULL,
      description TEXT NOT NULL,
      audio_path TEXT NOT NULL,
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const id = crypto.randomUUID();
    const ext = path.extname(file.originalname) || ".webm";
    cb(null, `${id}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.post("/api/submit", upload.single("audio"), async (req, res) => {
  try {
    const { word, description, category } = req.body;
    if (!word || !description || !req.file) return res.status(400).json({ ok: false, error: "필수 항목 누락" });
    const safeWord = sanitize(String(word)).trim().slice(0, 50);
    const safeDesc = String(description).trim().slice(0, 1000);
    const id = crypto.randomUUID();
    const audioPath = `/uploads/${req.file.filename}`;
    const cat = category && category !== "" ? category : "기타";
    await dbRun(
      `INSERT INTO entries (id, word, description, audio_path, category) VALUES (?,?,?,?,?)`,
      [id, safeWord, safeDesc, audioPath, cat]
    );
    res.json({ ok: true, id });
  } catch (err) { console.error(err); res.status(500).json({ ok: false, error: "서버 오류" }); }
});

// 목록/필터
app.get("/api/list", async (req, res) => {
  try {
    const pageSize = Math.min(parseInt(req.query.pageSize || "1000", 10), 2000);
    const word = (req.query.word || "").toString().trim();
    let items;
    if (word) {
      items = await dbAll(
        `SELECT id, word, description, audio_path, category, created_at
         FROM entries WHERE word = ? ORDER BY datetime(created_at) DESC LIMIT ?`,
        [word, pageSize]
      );
    } else {
      items = await dbAll(
        `SELECT id, word, description, audio_path, category, created_at
         FROM entries ORDER BY datetime(created_at) DESC LIMIT ?`,
        [pageSize]
      );
    }
    res.json({ ok: true, items });
  } catch (err) { console.error(err); res.status(500).json({ ok: false, error: "서버 오류" }); }
});

// 삭제(관리자)
app.delete("/api/entry/:id", async (req, res) => {
  try {
    const key = req.headers["x-admin-key"];
    if (key !== ADMIN_KEY) return res.status(401).json({ ok: false, error: "unauthorized" });
    const id = req.params.id;
    const row = await dbGet(`SELECT id, audio_path FROM entries WHERE id = ?`, [id]);
    if (!row) return res.status(404).json({ ok: false, error: "not_found" });
    await dbRun(`DELETE FROM entries WHERE id = ?`, [id]);
    if (row.audio_path && row.audio_path.startsWith("/uploads/")) {
      const full = path.join(__dirname, row.audio_path);
      fs.promises.unlink(full).catch(() => {});
    }
    res.json({ ok: true, id });
  } catch (err) { console.error(err); res.status(500).json({ ok: false, error: "서버 오류" }); }
});

app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});