function escapeHtml(s){
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function nl2br(s){ return s.replace(/\r?\n/g, "<br>"); }

// 엘리먼트에 스타일 적용
function applyStyle(el, style = {}){
  const { size="", color="", align="", weight="", lineHeight="" } = style || {};
  el.style.fontSize   = size ? `${parseInt(size,10)}px` : "";
  el.style.color      = color || "";
  el.style.textAlign  = align || "";
  el.style.fontWeight = weight || "";
  el.style.lineHeight = lineHeight ? String(lineHeight) : "";
}

async function loadText() {
  try {
    const r = await fetch("/api/content");
    if (!r.ok) return;
    const { texts = {}, styles = {} } = await r.json();

    document.querySelectorAll("[data-text]").forEach(el=>{
      const key = el.getAttribute("data-text");
      const val = texts[key];
      if (typeof val === "string") {
        el.innerHTML = nl2br(escapeHtml(val));
      }
      applyStyle(el, styles[key]);
    });
  } catch(e) {
    console.error("텍스트 로드 실패", e);
  }
}
loadText();