/**
 * ttsSpeaker.ts - Studio-Grade Neural TTS Engine for SIGNAL Incident Commander
 * Selects ultra-realistic Natural/Neural voices, cleans technical abbreviations,
 * and strips Markdown formatting for crisp, human-like voice responses.
 */

class TTSSpeakerEngine {
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private voicesLoaded: boolean = false;
  private preferredVoiceName: string | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.loadVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        this.loadVoices();
      };
    }
  }

  private loadVoices() {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      this.voicesLoaded = true;
      this.selectedVoice = this.findBestVoice(voices);
    }
  }

  /**
   * Ranked search for the highest-fidelity natural/neural voice available
   */
  private findBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice {
    // If user explicitly picked a voice
    if (this.preferredVoiceName) {
      const found = voices.find((v) => v.name === this.preferredVoiceName);
      if (found) return found;
    }

    // Top tier: Ultra-realistic Neural/Natural voices (Edge/Chrome/Safari)
    const topTierPatterns = [
      /christopher.*natural/i,
      /guy.*natural/i,
      /jenny.*natural/i,
      /aria.*natural/i,
      /steffan.*natural/i,
      /google us english/i,
      /google uk english male/i,
      /google uk english female/i,
      /daniel/i,
      /samantha/i,
      /serena/i,
      /oliver/i,
    ];

    for (const pattern of topTierPatterns) {
      const match = voices.find((v) => pattern.test(v.name) && v.lang.startsWith('en'));
      if (match) return match;
    }

    // Second tier: Any voice labeled Natural / Neural / Online
    const secondTier = voices.find(
      (v) =>
        (v.name.includes('Natural') || v.name.includes('Neural') || v.name.includes('Online')) &&
        v.lang.startsWith('en')
    );
    if (secondTier) return secondTier;

    // Third tier: Standard English voices
    const thirdTier = voices.find((v) => v.lang === 'en-US' || v.lang === 'en-GB' || v.lang.startsWith('en'));
    if (thirdTier) return thirdTier;

    return voices[0];
  }

  /**
   * Cleans raw LLM markdown text and technical abbreviations into smooth spoken prose
   */
  public cleanTextForSpeech(text: string): string {
    if (!text) return '';

    return text
      // Remove Markdown headers (# Header)
      .replace(/^#{1,6}\s+/gm, '')
      // Remove Bold/Italic formatting (**bold**, *italic*, _italic_)
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      // Remove inline code backticks (`code`)
      .replace(/`([^`]+)`/g, '$1')
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '')
      // Remove bullet points and numbering (e.g. "1. ", "* ", "- ")
      .replace(/^\s*[\*\-\•]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      // Clean ugly IDs (e.g. "(ID 3c2118ba)" -> "")
      .replace(/\(ID\s+[a-f0-9\-]+\)/gi, '')
      // Clean technical terms for natural pronunciation
      .replace(/\bP0\b/g, 'P-zero')
      .replace(/\bP1\b/g, 'P-one')
      .replace(/\bP2\b/g, 'P-two')
      .replace(/\b504s\b/g, '504 errors')
      .replace(/\b502s\b/g, '502 errors')
      .replace(/\b500s\b/g, '500 errors')
      .replace(/\bDB\b/g, 'database')
      .replace(/\bDBA\b/g, 'database administrator')
      .replace(/\bK8s\b/g, 'Kubernetes')
      .replace(/\bSRE\b/g, 'S.R.E.')
      .replace(/\bms\b/g, 'milliseconds')
      .replace(/\bsec\b/g, 'seconds')
      .replace(/\bCPU\b/g, 'C.P.U.')
      .replace(/\bOOM\b/g, 'out of memory')
      .replace(/\bOOMKilled\b/g, 'out of memory killed')
      // Clean extra spaces and linebreaks
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Speak text out loud with studio-quality neural settings
   */
  public speak(
    rawText: string,
    options?: {
      onStart?: () => void;
      onEnd?: () => void;
      onError?: () => void;
      rate?: number;
      pitch?: number;
    }
  ) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();

    const textToSpeak = this.cleanTextForSpeech(rawText);
    if (!textToSpeak) return;

    const utterance = new SpeechSynthesisUtterance(textToSpeak);

    // Refresh voice if needed
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      this.selectedVoice = this.findBestVoice(voices);
      utterance.voice = this.selectedVoice;
    }

    // Fine-tuned studio parameters
    utterance.rate = options?.rate || 1.0;
    utterance.pitch = options?.pitch || 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      if (options?.onStart) options.onStart();
    };

    utterance.onend = () => {
      if (options?.onEnd) options.onEnd();
    };

    utterance.onerror = (e) => {
      console.warn('TTS playback issue:', e);
      if (options?.onError) options.onError();
    };

    window.speechSynthesis.speak(utterance);
  }

  public stop() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public getAvailableVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    return window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
  }

  public setPreferredVoice(name: string) {
    this.preferredVoiceName = name;
    const voices = window.speechSynthesis.getVoices();
    const found = voices.find((v) => v.name === name);
    if (found) {
      this.selectedVoice = found;
    }
  }

  public getCurrentVoiceName(): string {
    return this.selectedVoice?.name || 'Studio Neural Voice';
  }
}

export const ttsSpeaker = new TTSSpeakerEngine();
