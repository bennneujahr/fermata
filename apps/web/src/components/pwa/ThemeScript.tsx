// Setzt data-theme vor dem ersten Zeichnen (kein Aufblitzen). Wahl liegt nur im localStorage dieses Geräts
// (vom Menschen gewählt, technisch nötig für die Funktion; kein Cookie). Skript mit Nonce (CSP).
export const THEME_KEY = "fermata-theme";

const code = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="hell")document.documentElement.dataset.theme="light";else if(t==="dunkel")document.documentElement.dataset.theme="dark";}catch(e){}`;

export function ThemeScript({ nonce }: { nonce?: string }) {
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: code }} />;
}
