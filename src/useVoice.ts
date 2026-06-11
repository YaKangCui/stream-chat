import { useRef, useState } from 'react';

/**
 * 语音能力（浏览器原生 Web Speech API，免费免 key）：
 *  - 语音输入：SpeechRecognition（中文识别，边说边出字）
 *  - 朗读回答：SpeechSynthesis
 */
export function useVoice() {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);

  const SR = (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown });
  const Recognition = SR.SpeechRecognition || SR.webkitSpeechRecognition;
  const sttSupported = Boolean(Recognition);
  const ttsSupported = 'speechSynthesis' in window;

  const startListen = (onText: (text: string) => void) => {
    if (!Recognition) return;
    const rec = new Recognition() as {
      lang: string; interimResults: boolean; continuous: boolean;
      onresult: (e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void;
      onend: () => void; onerror: () => void; start: () => void; stop: () => void;
    };
    rec.lang = 'zh-CN';
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onText(finalText + interim);
    };
    rec.onend = () => { setListening(false); recRef.current = null; };
    rec.onerror = () => { setListening(false); recRef.current = null; };
    recRef.current = rec;
    setListening(true);
    rec.start();
  };
  const stopListen = () => { recRef.current?.stop(); recRef.current = null; setListening(false); };

  const speak = (text: string, onEnd?: () => void) => {
    if (!ttsSupported || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.onend = () => { setSpeaking(false); onEnd?.(); };
    u.onerror = () => { setSpeaking(false); onEnd?.(); };
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  };
  const stopSpeak = () => { if (ttsSupported) window.speechSynthesis.cancel(); setSpeaking(false); };

  return { sttSupported, ttsSupported, listening, speaking, startListen, stopListen, speak, stopSpeak };
}
