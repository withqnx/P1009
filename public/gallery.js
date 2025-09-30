const grid = document.getElementById("grid");
const nowPlaying = document.getElementById("nowPlaying");

let currentAudio = null;
let currentButton = null;

function normalizeWord(w = "") {
  return String(w).trim().replace(/\s+/g, " ");
}
function setNowPlaying(word = "") {
  nowPlaying.innerHTML = "";
  if (!word) return;
  const span = document.createElement("div");
  span.className = "word-live";
  span.textContent = word;
  nowPlaying.appendChild(span);
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
  setNowPlaying("");
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function load() {
  grid.innerHTML = "불러오는 중...";
  const res = await fetch("/api/list?" + new URLSearchParams({ pageSize: 1000 }));
  const data = await res.json();
  if (!data.ok) {
    grid.innerHTML = "오류가 발생했습니다.";
    return;
  }

  // 단어별 그룹핑
  const groups = new Map();
  for (const it of data.items) {
    const key = normalizeWord(it.word);
    if (!groups.has(key)) groups.set(key, { word: key, items: [] });
    groups.get(key).items.push(it);
  }

  // 각 그룹 내 최신순 정렬
  for (const g of groups.values()) {
    g.items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  // 그룹 자체를 셔플하여 매번(입장/새로고침) 다른 순서
  const list = shuffle(Array.from(groups.values()));

  if (!list.length) {
    grid.innerHTML = "<div class='notice'>아직 작품이 없습니다. 먼저 참여해보세요.</div>";
    return;
  }

  grid.innerHTML = "";
  list.forEach((group) => {
    const { word, items } = group;
    let playIndex = 0;

    const card = document.createElement("div");
    card.className = "card-item";

    const btn = document.createElement("button");
    btn.className = "play";
    btn.textContent = `🔊 ${word}`;

    const ul = document.createElement("ul");
    ul.className = "reasons";
    items.forEach((it) => {
      const li = document.createElement("li");
      li.textContent = it.description || "";
      ul.appendChild(li);
    });

    btn.addEventListener("click", () => {
      // 기존 재생 중이면 정지
      stopCurrent();

      // 다음 녹음 (순환)
      const current = items[playIndex % items.length];
      playIndex += 1;

      // 모니터 표시/스타일
      setNowPlaying(word);
      btn.classList.add("playing");
      currentButton = btn;

      // 재생
      const audio = new Audio(current.audio_path);
      currentAudio = audio;
      audio.addEventListener("ended", stopCurrent);
      audio.addEventListener("error", () => {
        stopCurrent();
        alert("오디오 재생 오류");
      });
      audio.play().catch(err => {
        console.error(err);
        stopCurrent();
        alert("오디오를 재생할 수 없습니다.");
      });
    });

    card.appendChild(btn);
    card.appendChild(ul);
    grid.appendChild(card);
  });
}

load();