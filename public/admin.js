// ===== 상태/공통 =====
let ADMIN_TOKEN = "";
const FIELDS = ["title","subtitle","participateTitle","participateSubtitle","galleryTitle","gallerySubtitle","footer"];
const qs = (s)=>document.querySelector(s);
const loginSection  = qs("#loginSection");
const manageTexts   = qs("#manageTexts");
const manageEntries = qs("#manageEntries");
const loginBtn      = qs("#loginBtn");
const logoutBtn     = qs("#logoutBtn");
const loginStatus   = qs("#loginStatus");
const statusEl      = qs("#status");
const editor        = qs("#editor");
const adminList     = qs("#adminList");
const filterWord    = qs("#filterWord");
const loadEntriesBtn= qs("#loadEntriesBtn");
const saveBtn       = qs("#saveBtn");

// ===== 로그인 =====
async function tryAuth(key){
  const r = await fetch("/api/auth",{method:"POST",headers:{"x-admin-key":key}});
  return r.ok;
}
async function doLogin(){
  const key = qs("#adminKey").value || "";
  loginStatus.textContent = "확인 중...";
  const ok = await tryAuth(key);
  if(!ok){ loginStatus.textContent = "인증 실패: 관리자 키를 확인하세요."; return; }
  ADMIN_TOKEN = key; // 메모리 보관, 저장하지 않음
  loginStatus.textContent = "인증 성공!";
  showAdmin();
  await buildEditor(); // 에디터 UI 생성 및 값 바인딩
  await loadEntries();
}
function showAdmin(){
  loginSection.classList.add("hidden");
  manageTexts.classList.remove("hidden");
  manageEntries.classList.remove("hidden");
}
function doLogout(){
  ADMIN_TOKEN = "";
  // 초기화
  editor.innerHTML = "";
  adminList.innerHTML = "";
  qs("#adminKey").value = "";
  statusEl && (statusEl.textContent = "");
  loginStatus.textContent = "";
  filterWord.value = "";
  // 화면 전환
  manageTexts.classList.add("hidden");
  manageEntries.classList.add("hidden");
  loginSection.classList.remove("hidden");
}
window.addEventListener("beforeunload", ()=>{ ADMIN_TOKEN=""; });

loginBtn.addEventListener("click", doLogin);
logoutBtn.addEventListener("click", doLogout);

// ===== 콘텐츠 로드/저장 =====
async function fetchContent(){
  const r = await fetch("/api/content");
  if(!r.ok) throw new Error("content fetch failed");
  return await r.json(); // { texts, styles }
}

function fieldRowTemplate(key, text="", style={}){
  const { size="", color="", align="", weight="", lineHeight="" } = style || {};
  return `
  <div class="row" data-key="${key}">
    <label>${key}</label>
    <textarea class="text-input" rows="3" placeholder="${key} 내용 입력">${text || ""}</textarea>
    <div class="controls">
      <select class="size">
        <option value="">크기</option>
        ${[14,16,18,20,22,24,28,32,36,40,48,56].map(v=>`<option value="${v}" ${String(size)===String(v)?"selected":""}>${v}px</option>`).join("")}
      </select>
      <input class="color" type="color" value="${color || "#000000"}" title="색상">
      <select class="align">
        <option value="">정렬</option>
        <option value="left"   ${align==="left"?"selected":""}>왼쪽</option>
        <option value="center" ${align==="center"?"selected":""}>가운데</option>
        <option value="right"  ${align==="right"?"selected":""}>오른쪽</option>
      </select>
      <select class="weight">
        <option value="">굵기</option>
        ${[300,400,500,600,700,800,900].map(v=>`<option value="${v}" ${String(weight)===String(v)?"selected":""}>${v}</option>`).join("")}
      </select>
      <select class="lineHeight">
        <option value="">줄간격</option>
        ${["1.2","1.4","1.6","1.8","2.0"].map(v=>`<option value="${v}" ${String(lineHeight)===String(v)?"selected":""}>${v}</option>`).join("")}
      </select>
    </div>
  </div>`;
}

async function buildEditor(){
  statusEl && (statusEl.textContent = "불러오는 중...");
  const { texts={}, styles={} } = await fetchContent();
  editor.innerHTML = FIELDS.map(k => fieldRowTemplate(k, texts[k], styles[k])).join("");
  statusEl && (statusEl.textContent = "불러오기 완료");
}

function collectPayload(){
  const rows = editor.querySelectorAll(".row");
  const payload = { texts:{}, styles:{} };
  rows.forEach(row=>{
    const key = row.getAttribute("data-key");
    const text = row.querySelector(".text-input").value;
    const size = row.querySelector(".size").value;
    const color= row.querySelector(".color").value;
    const align= row.querySelector(".align").value;
    const weight=row.querySelector(".weight").value;
    const lineH = row.querySelector(".lineHeight").value;
    payload.texts[key] = text;
    payload.styles[key] = {
      size: size || "",
      color: color || "",
      align: align || "",
      weight: weight || "",
      lineHeight: lineH || ""
    };
  });
  return payload;
}

async function saveContent(){
  if(!ADMIN_TOKEN) return alert("로그인이 필요합니다.");
  const body = collectPayload();
  statusEl.textContent = "저장 중...";
  try{
    const r = await fetch("/api/content", {
      method:"POST",
      headers:{ "Content-Type":"application/json", "x-admin-key": ADMIN_TOKEN },
      body: JSON.stringify(body)
    });
    const data = await r.json();
    if(!data.ok) throw new Error(data.error||"save failed");
    statusEl.textContent = "저장 완료 ✓";
  }catch(e){
    console.error(e);
    statusEl.textContent = "저장 실패 (키 확인)";
    alert("저장 실패: 관리자 키를 확인하세요.");
  }
}
saveBtn.addEventListener("click", saveContent);

// ===== 참가 내역 관리 =====
async function loadEntries(){
  adminList.innerHTML = "목록 불러오는 중...";
  try{
    const params = new URLSearchParams({ pageSize: 500 });
    const w = (filterWord.value||"").trim();
    if (w) params.set("word", w);
    const r = await fetch("/api/list?"+params.toString());
    const data = await r.json();
    if(!data.ok) throw new Error(data.error||"list failed");
    if(!data.items.length){ adminList.innerHTML = "<div class='notice'>결과가 없습니다.</div>"; return; }

    adminList.innerHTML = "";
    data.items.forEach(item=>{
      const card = document.createElement("div");
      card.className = "entry-card";
      card.innerHTML = `
        <div class="entry-head" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div><strong>${item.word}</strong></div>
          <button class="secondary" data-id="${item.id}">삭제</button>
        </div>
        <div class="entry-desc" style="color:#6B7280;font-size:14px;">${item.description || ""}</div>
        <div class="entry-info" style="color:#9CA3AF;font-size:12px;">${item.id} • ${new Date(item.created_at).toLocaleString()}</div>
      `;
      card.querySelector("button").addEventListener("click", ()=>deleteEntry(item.id));
      adminList.appendChild(card);
    });
  }catch(e){
    console.error(e);
    adminList.innerHTML = "<div class='notice'>불러오기 실패</div>";
  }
}
async function deleteEntry(id){
  if(!ADMIN_TOKEN) return alert("로그인이 필요합니다.");
  if(!confirm("정말 삭제하시겠습니까?")) return;
  try{
    const r = await fetch("/api/entry/"+id, { method:"DELETE", headers:{ "x-admin-key": ADMIN_TOKEN } });
    const data = await r.json();
    if(!data.ok) throw new Error(data.error||"delete failed");
    await loadEntries();
  }catch(e){
    console.error(e);
    alert("삭제 실패: 관리자 키 또는 네트워크를 확인하세요.");
  }
}
loadEntriesBtn.addEventListener("click", loadEntries);