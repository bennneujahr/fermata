// „Atem“ (Viola) auf der Startseite. Mit Hörprobe: Beim Abspielen atmet Atem im Takt der Stimme.
import "@fermata/brand/atem.js";

const atem = document.querySelector<HTMLElement & { connectAudio?: (s: HTMLMediaElement) => void; state: string }>("[data-atem]");
const audio = document.querySelector<HTMLAudioElement>("[data-hoerprobe-audio]");
if (atem && audio) {
  let connected = false;
  audio.addEventListener("play", () => {
    if (!connected) {
      atem.connectAudio?.(audio);
      connected = true;
    }
    atem.state = "spricht";
  });
  const rest = () => {
    atem.state = "ruhig";
  };
  audio.addEventListener("pause", rest);
  audio.addEventListener("ended", rest);
}
