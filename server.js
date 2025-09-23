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

// ------------------------
// 데이터 디렉토리(환경변수) 설정
// Render에 Persistent Disk를 /data 로 마운트하고
// DATA_DIR=/data 환경변수를 설정하면 아래 경로로 저장됩니다.
// ------------------------
const DATA_DIR = process.env.DATA_DIR || process.cwd();
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, "uploads");
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "db.sqlite");

// 디렉토리 준비
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 정적 파일
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 홈 라우팅
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// DB 연결
sqlite3.verbose();
const db = new sqlite3.Database(DB_PATH);
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

// 업로드 설정
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const id = crypto.randomUUID();
    const ext = path.extname(file.originalname) || ".webm";
    cb(null, `${id}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// 제출 API
app.post("/api/submit", upload.single("audio"), async (req, res) => {
  try {
    const { word, description, category } = req.body;
    if (!word || !description || !req.file) {
      return res.status(400).json({ ok: false, error: "필수 항목 누락" });
    }
    const safeWord = sanitize(String(word)).trim().slice(0, 50);
    const safeDesc = String(description).trim().slice(0, 1000);
    const id = crypto.randomUUID();
    const audioPath = `/uploads/${req.file.filename}`;
    const cat = category && category !== "" ? category : "기타";

    await dbRun(
      `INSERT INTO entries (id, word, description, audio_path, category)
       VALUES (?,?,?,?,?)`,
      [id, safeWord, safeDesc, audioPath, cat]
    );
    res.json({ ok: true, id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "서버 오류" });
  }
});

// 목록 API (최신순)
app.get("/api/list", async (req, res) => {
  try {
    const pageSize = Math.min(parseInt(req.query.pageSize || "1000", 10), 2000);
    const items = await dbAll(
      `SELECT id, word, description, audio_path, category, created_at
       FROM entries
       ORDER BY datetime(created_at) DESC
       LIMIT ?`,
      [pageSize]
    );
    res.json({ ok: true, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "서버 오류" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});