// <fermata-atem state="ruhig|hoert|denkt|spricht|pause" label="…">
// Rein dekorativ bis auf den Zustandstext für Screenreader (role="status").
// Beim Sprechen: element.level = 0…1 oder element.connectAudio(mediaStream | audioElement).
const MARK =
  '<svg viewBox="0 0 120 72" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3.2 64.6C3.4 28.6 28 5 60 5s56.6 23.6 56.8 59.6c0 1.3-1.9 1.4-2.1.1C110.6 36.2 88.8 15.4 60 15.4S9.4 36.2 5.3 64.7c-.2 1.3-2.1 1.2-2.1-.1Z"/><circle fill="currentColor" cx="60" cy="56" r="7.6"/></svg>';
const LABELS = { ruhig: "Viola ist bereit.", hoert: "Viola hört zu.", denkt: "Viola überlegt.", spricht: "Viola spricht.", pause: "Gespräch pausiert." };

class FermataAtem extends HTMLElement {
  static observedAttributes = ["state", "label"];
  #raf = 0;
  #ctx = null;
  #live = null;

  connectedCallback() {
    if (!this.querySelector(".atem-mark")) {
      this.insertAdjacentHTML("afterbegin", '<span class="atem-ring"></span><span class="atem-ring"></span><span class="atem-mark">' + MARK + "</span>");
      this.#live = document.createElement("span");
      this.#live.setAttribute("role", "status");
      this.#live.className = "visually-hidden";
      this.appendChild(this.#live);
    }
    this.#sync();
  }
  disconnectedCallback() {
    this.disconnectAudio();
  }
  attributeChangedCallback() {
    this.#sync();
  }
  get state() {
    return this.getAttribute("state") || "ruhig";
  }
  set state(v) {
    this.setAttribute("state", v);
  }
  set level(v) {
    const n = Math.max(0, Math.min(1, Number(v) || 0));
    this.style.setProperty("--atem-level", n.toFixed(3));
  }
  #sync() {
    this.dataset.state = this.state;
    if (this.#live) this.#live.textContent = this.getAttribute("label") || LABELS[this.state] || "";
  }
  /** Lautstärke einer Audioquelle live auf --atem-level legen (nur im Browser, keine Aufnahme). */
  connectAudio(source) {
    this.disconnectAudio();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = (this.#ctx = new Ctx());
    const node = source instanceof MediaStream ? ctx.createMediaStreamSource(source) : ctx.createMediaElementSource(source);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    node.connect(analyser);
    if (!(source instanceof MediaStream)) analyser.connect(ctx.destination);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += (v - 128) * (v - 128);
      this.level = Math.min(1, Math.sqrt(sum / data.length) / 40);
      this.#raf = requestAnimationFrame(tick);
    };
    tick();
  }
  disconnectAudio() {
    cancelAnimationFrame(this.#raf);
    if (this.#ctx) this.#ctx.close();
    this.#ctx = null;
    this.level = 0;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("fermata-atem")) {
  customElements.define("fermata-atem", FermataAtem);
}
export { FermataAtem };
