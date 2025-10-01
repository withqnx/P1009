const els = {
  word: document.getElementById("word"),
  category: document.getElementById("category"),
  description: document.getElementById("description"),
  recBtn: document.getElementById("recBtn"),
  stopBtn: document.getElementById("stopBtn"),
  playBtn: document.getElementById("playBtn"),
  recStatus: document.getElementById("recStatus"),
  preview: document.getElementById("preview"),
  submitBtn: document.getElementById("submitBtn"),
  submitStatus: document.getElementById("submitStatus"),
  toGalleryBtn: document.getElementById("toGalleryBtn"),
  toast: document.getElementById("toast"),
  toastErr: document.getElementById("toastErr"),
};

let mediaRecorder = null;
let chunks = [];
let audioBlob = null;

function normalize(s=""){ return String(s).trim(); }

function updateSubmitEnabled(){
  const ok = normalize(els.word.value) && normalize(els.description.value) && !!audioBlob;
  els.submitBtn.disabled = !ok;
}

function setGalleryButtonEnabled(enabled){
  if (enabled) {
    els.toGalleryBtn.classList.remove("disabled");
    els.toGalleryBtn.removeAttribute("aria-disabled");
  } else {
    els.toGalleryBtn.classList.add("disabled");
    els.toGalleryBtn.setAttribute("aria-disabled", "true");
  }
}
setGalleryButtonEnabled(false);

// --- 녹음 ---
async function startRec(){
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    chunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e)=>{ if(e.data.size>0) chunks.push(e.data); };
    mediaRecorder.onstop = () => {
      audioBlob = new Blob(chunks, { type: (chunks[0]?.type || "audio/mp4") });
    
      // 1) 먼저 컨트롤/표시 상태를 켜고
      preview.controls = true;
      preview.classList.remove("hidden");
      preview.classList.add("audio-visible");

      // 2) 그 다음 src를 세팅하고
      preview.src = URL.createObjectURL(audioBlob);

      // 3) 마지막으로 load() 호출 (iOS에서 컨트롤 표시가 더 안정적)
      preview.load();

      playBtn.disabled = false;
      hint.textContent = "녹음이 완료되었습니다. 미리듣기 가능.";
      updateSubmitEnabled();
    };
    mediaRecorder.start();
    els.recBtn.disabled = true;
    els.stopBtn.disabled = false;
    els.recStatus.textContent = "녹음 중…";
  }catch(err){
    console.error(err);
    els.recStatus.textContent = "마이크 권한이 필요합니다.";
  }
}
function stopRec(){
  if(mediaRecorder && mediaRecorder.state !== "inactive"){
    mediaRecorder.stop();
    els.stopBtn.disabled = true;
    els.recBtn.disabled = false;
  }
}
function playPreview(){
  if (els.preview.src) {
    els.preview.currentTime = 0;
    els.preview.play().catch(()=>{});
  }
}

// --- 제출 ---
async function submitForm(){
  els.submitBtn.disabled = true;
  els.submitStatus.textContent = "제출 중…";
  els.toast.classList.add("hidden");
  els.toastErr.classList.add("hidden");

  try{
    const fd = new FormData();
    fd.append("word", normalize(els.word.value));
    fd.append("description", normalize(els.description.value));
    fd.append("category", normalize(els.category.value));
    if (!audioBlob) throw new Error("녹음이 필요합니다.");
    fd.append("audio", audioBlob, "voice.webm");

    const r = await fetch("/api/submit", { method:"POST", body: fd });
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error(data.error || "서버 오류");

    els.submitStatus.textContent = "제출 완료!";
    // 전시관 버튼 즉시 활성화 + 자동 이동
    setGalleryButtonEnabled(true);
    els.toast.classList.remove("hidden");

    setTimeout(()=>{ window.location.href = "/gallery.html"; }, 2000);

  }catch(e){
    console.error(e);
    els.toastErr.textContent = `제출 실패: ${e.message || "오류"}`;
    els.toastErr.classList.remove("hidden");
    els.submitBtn.disabled = false;
    els.submitStatus.textContent = "";
  }
}

// 입력 변화에 따라 제출 버튼 활성화
["input","change"].forEach(ev=>{
  els.word.addEventListener(ev, updateSubmitEnabled);
  els.description.addEventListener(ev, updateSubmitEnabled);
});

// 버튼 이벤트 바인딩
els.recBtn.addEventListener("click", startRec);
els.stopBtn.addEventListener("click", stopRec);
els.playBtn.addEventListener("click", playPreview);
els.submitBtn.addEventListener("click", submitForm);
