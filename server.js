// server.js — 분류 제거 + 영구 디스크 대응(Stable)
// 모든 지속 데이터는 DATA_DIR(기본 /var/data) 아래에 저장됩니다.
//  - /var/data/db.sqlite
//  - /var/data/uploads/*        (오디오 파일)
//  - /var/data/content.json     (관리자 문구/스타일)

import express from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import multer from "multer";
import sqlite3 from "sqlite3";
import crypto from "crypto";
import sanitize from "sanitize-filename";
import { promisify } from "util";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ───────────────────────────────────────────────────────────
// 경로/디렉터리 설정
// ───────────────────────────────────────────────────────────
const PUBLIC_DIR = path.join(__dirname, "public");

// 영구 데이터 루트(환경변수 없으면 /var/data)
const DATA_DIR = process.env.DATA_DIR || "/var/data";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// 업로드 폴더(영구)
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 관리자 텍스트/스타일 저장 파일(영구)
const CONTENT_PATH = path.join(DATA_DIR, "content.json");

// 정적 서빙
app.use(express.static(PUBLIC_DIR));
app.use("/uploads", express.static(UPLOAD_DIR));

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ───────────────────────────────────────────────────────────
// 예쁜 URL (정적 페이지 매핑)
// ───────────────────────────────────────────────────────────
app.get("/", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
app.get("/participate", (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, "participate.html"))
);
app.get("/gallery", (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, "gallery.html"))
);
app.get("/admin", (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, "admin.html"))
);

// ───────────────────────────────────────────────────────────
// 관리자 콘텐츠(문구/스타일) — content.json
// ───────────────────────────────────────────────────────────
const DEFAULT_TEXTS = {
  title: "소리를 담는 글자, 한글",
  subtitle: "의성어·의태어를 직접 말하고 기록해 한글날 디지털 아카이브로 남겨요.",
  participateTitle: "소리를 담고, 소리를 남기다",
  participateSubtitle: "의성어·의태어를 입력하고 직접 소리 내어 녹음해 주세요.",
  galleryTitle: "온라인 전시관",
  gallerySubtitle: "단어 카드를 눌러 직접 들어보세요.",
  footer: "© 2025 withqnx",
};
const DEFAULT_STYLES = {
  title:              { size:"", color:"", align:"", weight:"", lineHeight:"" },
  subtitle:           { size:"", color:"", align:"", weight:"", lineHeight:"" },
  participateTitle:   { size:"", color:"", align:"", weight:"", lineHeight:"" },
  participateSubtitle:{ size:"", color:"", align:"", weight:"", lineHeight:"" },
  galleryTitle:       { size:"", color:"", align:"", weight:"", lineHeight:"" },
  gallerySubtitle:    { size:"", color:"", align:"", weight:"", lineHeight:"" },
  footer:             { size:"", color:"", align:"", weight:"", lineHeight:"" },
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
  } catch (e) {
    console.warn("content.json 읽기 실패:", e);
  }
  return { texts: { ...DEFAULT_TEXTS }, styles: { ...DEFAULT_STYLES } };
}

function saveContent(payload = {}) {
  const current = loadContent();
  const out = {
    texts: { ...current.texts },
    styles: { ...current.styles },
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
        lineHeight: String(s.lineHeight ?? ""),
      };
    }
  }
  fs.writeFileSync(CONTENT_PATH, JSON.stringify(out, null, 2), "utf-8");
  return out;
}

// 파일이 없으면 기본 생성
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
  if (key !== ADMIN_KEY)
    return res.status(401).json({ ok: false, error: "unauthorized" });
  const saved = saveContent(req.body || {});
  res.json({ ok: true, content: saved });
});

// ───────────────────────────────────────────────────────────
// DB (SQLite) — 분류 제거 스키마
// ───────────────────────────────────────────────────────────
sqlite3.verbose();
const dbPath = path.join(DATA_DIR, "db.sqlite");
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_entries_word ON entries(word)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_entries_created ON entries(created_at)`);
});

// ───────────────────────────────────────────────────────────
// 업로드 설정 (multer) — /var/data/uploads 에 저장
// ───────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const id = crypto.randomUUID();
    const ext = path.extname(file.originalname) || ".webm";
    cb(null, `${id}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ───────────────────────────────────────────────────────────
// 제출 API (분류 없음)
//  - 필드: word, description, audio(webm/mp3 등)
// ───────────────────────────────────────────────────────────
app.post("/api/submit", upload.single("audio"), async (req, res) => {
  try {
    const word = (req.body.word || "").toString().trim();
    const description = (req.body.description || "").toString().trim();
    if (!word || !description || !req.file) {
      return res.status(400).json({ ok: false, error: "필수 항목 누락" });
    }
    const safeWord = sanitize(word).slice(0, 50);
    const safeDesc = description.slice(0, 1000);
    const id = crypto.randomUUID();
    const audioPath = `/uploads/${req.file.filename}`;

    await dbRun(
      `INSERT INTO entries (id, word, description, audio_path) VALUES (?,?,?,?)`,
      [id, safeWord, safeDesc, audioPath]
    );

    res.json({ ok: true, id, audio_path: audioPath });
  } catch (err) {
    console.error("submit error:", err);
    res.status(500).json({ ok: false, error: "서버 오류" });
  }
});

// ───────────────────────────────────────────────────────────
// 목록 API
//  - /api/list               → 최신순 전체
//  - /api/list?word=사각사각  → 해당 단어만 (최신순)
// ───────────────────────────────────────────────────────────
app.get("/api/list", async (req, res) => {
  try {
    const pageSize = Math.min(parseInt(req.query.pageSize || "1000", 10), 2000);
    const word = (req.query.word || "").toString().trim();
    let items;
    if (word) {
      items = await dbAll(
        `SELECT id, word, description, audio_path, created_at
         FROM entries WHERE word = ? ORDER BY datetime(created_at) DESC LIMIT ?`,
        [word, pageSize]
      );
    } else {
      items = await dbAll(
        `SELECT id, word, description, audio_path, created_at
         FROM entries ORDER BY datetime(created_at) DESC LIMIT ?`,
        [pageSize]
      );
    }
    res.json({ ok: true, items });
  } catch (err) {
    console.error("list error:", err);
    res.status(500).json({ ok: false, error: "서버 오류" });
  }
});

// (선택) 단어별 집계(버튼용) — 갤러리에서 중복 단어 합치기 좋음
app.get("/api/words", async (_req, res) => {
  try {
    const rows = await dbAll(
      `SELECT word, COUNT(*) as count, MAX(created_at) as latest
       FROM entries GROUP BY word ORDER BY latest DESC`
    );
    res.json({ ok: true, words: rows });
  } catch (err) {
    console.error("words error:", err);
    res.status(500).json({ ok: false, error: "서버 오류" });
  }
});

// 삭제(관리자)
app.delete("/api/entry/:id", async (req, res) => {
  try {
    const key = req.headers["x-admin-key"];
    if (key !== ADMIN_KEY)
      return res.status(401).json({ ok: false, error: "unauthorized" });

    const id = req.params.id;
    const row = await dbGet(`SELECT id, audio_path FROM entries WHERE id = ?`, [id]);
    if (!row) return res.status(404).json({ ok: false, error: "not_found" });

    await dbRun(`DELETE FROM entries WHERE id = ?`, [id]);

    // 파일 삭제(실패해도 전체 에러로 취급하진 않음)
    if (row.audio_path && row.audio_path.startsWith("/uploads/")) {
      const full = path.join(UPLOAD_DIR, path.basename(row.audio_path));
      fs.promises.unlink(full).catch(() => {});
    }
    res.json({ ok: true, id });
  } catch (err) {
    console.error("delete error:", err);
    res.status(500).json({ ok: false, error: "서버 오류" });
  }
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
  console.log(`   DATA_DIR: ${DATA_DIR}`);
  console.log(`   UPLOAD_DIR: ${UPLOAD_DIR}`);
  console.log(`   DB: ${dbPath}`);
});
