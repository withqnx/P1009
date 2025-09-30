let recorder, stream, chunks = [], blob = null, mimeType = "";

const $ = (s) => document.querySelector(s);
const wordEl = $("#word");
const descEl = $("#description");
const recordBtn = $("#recordBtn");
const stopBtn = $("#stopBtn");
const playBtn = $("#playBtn");
const resetBtn = $("#resetBtn");
const submitBtn = $("#submitBtn");
const statusEl = $("#status");
const playerWrap = $("#playerWrap");

function detectMimeType() {
  if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
    if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
    if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
    if (MediaRecorder.isTypeSupported("audio/ogg")) return "audio/ogg";
  }
  return "";
}

function renderPreview(b) {
  playerWrap.innerHTML = "";
  const audio = document.createElement("audio");
  audio.controls = true;
  audio.src = URL.createObjectURL(b);
  playerWrap.appendChild(audio);
}

function updateSubmitState() {
  const ok = wordEl.value.trim() && descEl.value.trim() && !!blob;
  submitBtn.disabled = !ok;
  playBtn.disabled = !blob;
  resetBtn.disabled = !blob;
}

async function startRec() {
  try {
    mimeType = detectMimeType();
    if (!mimeType) return alert("브라우저가 녹음을 지원하지 않습니다. Chrome 권장");
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorder = new MediaRecorder(stream, { mimeType });
    chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      blob = new Blob(chunks, { type: mimeType });
      renderPreview(blob);
      updateSubmitState();
    };
    recorder.start();
    recordBtn.disabled = true;
    stopBtn.disabled = false;
    statusEl.textContent = "녹음 중...";
  } catch (e) {
    console.error(e);
    alert("마이크 권한이 필요합니다.");
  }
}

function stopRec() {
  if (recorder && recorder.state !== "inactive") recorder.stop();
  if (stream) stream.getTracks().forEach(t => t.stop());
  recordBtn.disabled = false;
  stopBtn.disabled = true;
  statusEl.textContent = "녹음이 완료되었습니다.";
}

function playPreview() {
  if (!blob) return;
  const a = new Audio(URL.createObjectURL(blob));
  a.play().catch(console.error);
}

function resetRec() {
  blob = null;
  playerWrap.innerHTML = "";
  updateSubmitState();
  statusEl.textContent = "다시 녹음할 수 있습니다.";
}

async function submitEntry() {
  if (submitBtn.disabled) return;
  const word = wordEl.value.trim();
  const description = descEl.value.trim();
  const ext = (mimeType.split("/")[1] || "webm").replace("x-", "");
  const form = new FormData();
  form.append("word", word);
  form.append("description", description);
  form.append("audio", blob, `voice.${ext}`);

  submitBtn.disabled = true;
  statusEl.textContent = "업로드 중...";

  try {
    const res = await fetch("/api/submit", { method: "POST", body: form });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "업로드 실패");
    statusEl.textContent = "제출 완료! 전시관에서 확인해보세요.";
    // 초기화
    blob = null;
    wordEl.value = "";
    descEl.value = "";
    updateSubmitState();
  } catch (e) {
    console.error(e);
    alert("제출 중 오류가 발생했습니다.");
    statusEl.textContent = "";
    updateSubmitState();
  }
}

recordBtn.addEventListener("click", startRec);
stopBtn.addEventListener("click", stopRec);
playBtn.addEventListener("click", playPreview);
resetBtn.addEventListener("click", resetRec);
submitBtn.addEventListener("click", submitEntry);
[wordEl, descEl].forEach(el => el.addEventListener("input", updateSubmitState));
updateSubmitState();