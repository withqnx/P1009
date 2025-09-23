const grid = document.getElementById("grid");
const nowPlaying = document.getElementById("nowPlaying");

let currentAudio = null;
let currentButton = null;

function normalizeWord(w = "") {
  return String(w).trim().replace(/\s+/g, " ");
}
function mmss(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}
function renderNowPlaying(word = "", active = false, cur = 0, dur = 0) {
  nowPlaying.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "now-inner";
  const label = document.createElement("div");
  label.className = "word-live";
  label.textContent = word ? word : "";
  const wave = document.createElement("div");
  wave.className = "wave" + (active ? " active" : "");
  for (let i = 0; i < 6; i++) wave.appendChild(document.createElement("span"));
  const time = document.createElement("div");
  time.className = "timer";
  time.textContent = active ? `${mmss(cur)} / ${mmss(dur)}` : "재생할 단어를 선택하세요";
  wrap.appendChild(label);
  wrap.appendChild(wave);
  wrap.appendChild(time);
  nowPlaying.appendChild(wrap);
}
function stopCurrent() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  if (currentButton) {
    currentButton.classList.remove("playing");
    currentButton = null;
  }
  renderNowPlaying("", false, 0, 0);
}

async function load() {
  grid.innerHTML = "불러오는 중...";
  const res = await fetch("/api/list?" + new URLSearchParams({ pageSize: 1000 }));
  const data = await res.json();
  if (!data.ok) return (grid.innerHTML = "오류가 발생했습니다.");

  // 단어별 그룹핑
  const groups = new Map();
  for (const it of data.items) {
    const key = normalizeWord(it.word);
    if (!groups.has(key)) groups.set(key, { word: key, items: [] });
    groups.get(key).items.push(it);
  }
  for (const g of groups.values()) {
    g.items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  const list = Array.from(groups.values())
    .sort((a, b) => new Date(b.items[0].created_at) - new Date(a.items[0].created_at));

  if (!list.length) {
    grid.innerHTML = "<div class='notice'>아직 작품이 없습니다. 먼저 참여해보세요.</div>";
    renderNowPlaying("", false, 0, 0);
    return;
  }

  grid.innerHTML = "";
  renderNowPlaying("", false, 0, 0);

  list.forEach((group) => {
    const { word, items } = group;
    let playIndex = 0;

    const card = document.createElement("div");
    card.className = "card-item";

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = `${items.length}명`;

    const btn = document.createElement("button");
    btn.className = "play";
    btn.textContent = `🔊 ${word}`;

    // 이유 전부 표시
    const reasonsWrap = document.createElement("div");
    reasonsWrap.className = "reasons-wrap";
    const title = document.createElement("div");
    title.className = "reasons-title";
    title.textContent = "이유들";
    const ul = document.createElement("ul");
    ul.className = "reasons";
    items.forEach((it) => {
      const li = document.createElement("li");
      li.textContent = it.description || "";
      ul.appendChild(li);
    });
    reasonsWrap.appendChild(title);
    reasonsWrap.appendChild(ul);

    btn.addEventListener("click", () => {
      // 기존 재생 정지
      stopCurrent();

      // 다음 녹음 선택 (여러 명이면 클릭마다 순환)
      const current = items[playIndex % items.length];
      playIndex += 1;

      btn.classList.add("playing");
      currentButton = btn;

      const audio = new Audio(current.audio_path);
      currentAudio = audio;

      let total = 0;
      audio.addEventListener("loadedmetadata", () => {
        total = audio.duration || 0;
        renderNowPlaying(word, true, 0, total);
      });
      audio.addEventListener("timeupdate", () => {
        renderNowPlaying(word, true, audio.currentTime, total || audio.duration || 0);
      });
      audio.addEventListener("ended", () => {
        stopCurrent();
      });
      audio.addEventListener("error", () => {
        stopCurrent();
        alert("오디오 재생 중 오류가 발생했습니다.");
      });

      audio.play().catch(err => {
        console.error(err);
        stopCurrent();
        alert("오디오를 재생할 수 없습니다.");
      });
    });

    card.appendChild(badge);
    card.appendChild(btn);
    card.appendChild(reasonsWrap);
    grid.appendChild(card);
  });
}

load();