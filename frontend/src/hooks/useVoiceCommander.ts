import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store';
import { utterancesApi, apiClient } from '../api/client';
import AgoraRTC, { IAgoraRTCClient, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

export interface SpeakerProfile {
  name: string;
  uid: number;
  role: string;
  avatar: string;
}

export const SPEAKER_PROFILES: SpeakerProfile[] = [
  { name: 'Alice', uid: 1001, role: 'Incident Commander / SRE Lead', avatar: '👩‍💼' },
  { name: 'Bob', uid: 1002, role: 'Backend / DB Engineer', avatar: '👨‍💻' },
  { name: 'Carol', uid: 1003, role: 'Infrastructure / DevOps', avatar: '👩‍🔧' },
  { name: 'Dave', uid: 1004, role: 'Engineering Manager', avatar: '👨‍💼' },
  { name: 'Sarah', uid: 1005, role: 'Payment Gateway SRE', avatar: '👩‍💻' },
  { name: 'Vikram', uid: 1006, role: 'Principal Architect', avatar: '👨‍🔬' },
];

export function parseInSpeechSpeaker(
  rawText: string,
  currentSpeaker: SpeakerProfile,
  allProfiles: SpeakerProfile[]
): { text: string; speaker: SpeakerProfile } {
  // Check for "Name: message" (e.g. "Bob: connection pool exhausted", "Sarah - high latency")
  const m = rawText.match(/^([A-Za-z0-9_\-]{2,20})\s*[:\-]\s*(.+)/s);
  if (m) {
    const cand = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    if (!['Note', 'Fact', 'Hypothesis', 'Action', 'Alert', 'Error', 'Warning', 'Info', 'Step', 'Signal', 'Question', 'Http', 'Https'].includes(cand)) {
      let existing = allProfiles.find((p) => p.name.toLowerCase() === cand.toLowerCase());
      if (!existing) {
        existing = {
          name: cand,
          uid: Math.floor(1000 + Math.random() * 8999),
          role: 'Incident Responder',
          avatar: '👤',
        };
      }
      return { text: m[2].trim(), speaker: existing };
    }
  }

  // Check for "This is Name: message" or "This is Name from SRE: message"
  const m2 = rawText.match(/^(?:this is|i am)\s+([A-Za-z0-9_\-]{2,20})(?:\s+from\s+[\w\s]+)?(?:\s+here)?\s*[:,-]\s*(.+)/is);
  if (m2) {
    const cand = m2[1].charAt(0).toUpperCase() + m2[1].slice(1);
    let existing = allProfiles.find((p) => p.name.toLowerCase() === cand.toLowerCase());
    if (!existing) {
      existing = {
        name: cand,
        uid: Math.floor(1000 + Math.random() * 8999),
        role: 'Incident Responder',
        avatar: '👤',
      };
    }
    return { text: m2[2].trim(), speaker: existing };
  }

  // Check for "Name here: message"
  const m3 = rawText.match(/^([A-Za-z0-9_\-]{2,20})\s+here\s*[:,-]\s*(.+)/is);
  if (m3) {
    const cand = m3[1].charAt(0).toUpperCase() + m3[1].slice(1);
    let existing = allProfiles.find((p) => p.name.toLowerCase() === cand.toLowerCase());
    if (!existing) {
      existing = {
        name: cand,
        uid: Math.floor(1000 + Math.random() * 8999),
        role: 'Incident Responder',
        avatar: '👤',
      };
    }
    return { text: m3[2].trim(), speaker: existing };
  }

  return { text: rawText, speaker: currentSpeaker };
}

export function useVoiceCommander(incidentId: string | null) {
  const [responders, setResponders] = useState<SpeakerProfile[]>(SPEAKER_PROFILES);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [recentSpoken, setRecentSpoken] = useState<Array<{ text: string; speaker: string; time: string }>>([]);
  const [selectedSpeaker, setSelectedSpeaker] = useState<SpeakerProfile>(SPEAKER_PROFILES[0]);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [agoraConnected, setAgoraConnected] = useState(false);
  const [statusText, setStatusText] = useState('Voice ready');

  const recognitionRef = useRef<any>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const audioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const volumeIntervalRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const selectedSpeakerRef = useRef(selectedSpeaker);
  const respondersRef = useRef(responders);
  const incidentIdRef = useRef(incidentId);

  respondersRef.current = responders;
  selectedSpeakerRef.current = selectedSpeaker;
  incidentIdRef.current = incidentId;
  isListeningRef.current = isListening;

  const addResponder = useCallback((profile: SpeakerProfile) => {
    setResponders((prev) => {
      if (prev.some((p) => p.name.toLowerCase() === profile.name.toLowerCase())) {
        return prev;
      }
      return [...prev, profile];
    });
  }, []);

  // Check Web Speech API support
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      console.warn('Web Speech API not supported in this browser. Use Chrome or Edge for live microphone speech-to-text.');
    }
  }, []);

  // Send completed voice line to backend
  const dispatchUtterance = useCallback(async (text: string, speaker: string) => {
    if (!incidentIdRef.current || !text.trim()) return;
    const cleanText = text.trim();
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    setRecentSpoken((prev) => [
      { text: cleanText, speaker, time: timeStr },
      ...prev.slice(0, 10),
    ]);

    try {
      await utterancesApi.add(incidentIdRef.current, {
        speaker_name: speaker,
        text: cleanText,
      });
      setStatusText(`Processed: "${cleanText.length > 35 ? cleanText.slice(0, 32) + '...' : cleanText}"`);
    } catch (err) {
      console.error('Failed to dispatch spoken utterance:', err);
      setStatusText('Error sending speech to incident');
    }
  }, []);

  // Initialize SpeechRecognition
  const initSpeechRecognition = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      // Echo-loop guard: Ignore audio while SIGNAL is actively speaking
      if (useAppStore.getState().isSpeaking) {
        setInterimTranscript('');
        return;
      }

      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          const finalTrimmed = transcript.trim();
          if (finalTrimmed.length > 2) {
            const parsed = parseInSpeechSpeaker(finalTrimmed, selectedSpeakerRef.current, respondersRef.current);
            if (!respondersRef.current.some((p) => p.name.toLowerCase() === parsed.speaker.name.toLowerCase())) {
              addResponder(parsed.speaker);
            }
            dispatchUtterance(parsed.text, parsed.speaker.name);
          }
          setInterimTranscript('');
        } else {
          interim += transcript;
        }
      }
      if (interim && !useAppStore.getState().isSpeaking) {
        const parsed = parseInSpeechSpeaker(interim, selectedSpeakerRef.current, respondersRef.current);
        setInterimTranscript(`${parsed.speaker.avatar} ${parsed.speaker.name}: "${parsed.text}"`);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') return;
      console.warn('Speech recognition event error:', event.error);
      if (event.error === 'not-allowed') {
        setStatusText('Microphone permission blocked. Please allow mic access in browser.');
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      // Auto-restart if user still has voice listening active
      if (isListeningRef.current) {
        try {
          recognition.start();
        } catch (e) {
          // Already running or closing
        }
      }
    };

    return recognition;
  }, [dispatchUtterance]);

  // Connect Voice (Agora RTC + Web Speech STT)
  const startVoice = async () => {
    if (!incidentId) {
      alert('Please select or create an incident first.');
      return;
    }

    setStatusText('Requesting microphone & Agora token...');
    setIsListening(true);
    isListeningRef.current = true;

    // 1. Start Web Speech Recognition
    try {
      if (!recognitionRef.current) {
        recognitionRef.current = initSpeechRecognition();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          // Already started
        }
      }
    } catch (speechErr) {
      console.warn('Could not start SpeechRecognition:', speechErr);
    }

    // 2. Connect Agora RTC Audio Track
    try {
      const channelName = `incident-${incidentId}`;
      const tokenRes = await apiClient.post('/api/agora/token', {
        channel_name: channelName,
        uid: selectedSpeaker.uid,
      });

      const { token, app_id } = tokenRes.data;
      if (app_id) {
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;

        await client.join(app_id, channelName, token, selectedSpeaker.uid);

        const micTrack = await AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig: 'high_quality_stereo',
          AEC: true,
          ANS: true,
        });
        audioTrackRef.current = micTrack;
        await client.publish([micTrack]);

        setAgoraConnected(true);

        // Volume polling
        volumeIntervalRef.current = setInterval(() => {
          if (audioTrackRef.current) {
            const level = audioTrackRef.current.getVolumeLevel();
            setVolumeLevel(Math.min(100, Math.round(level * 100 * 3)));
          }
        }, 100);
      }
    } catch (agoraErr: any) {
      console.warn('Agora RTC stream notice:', agoraErr.message || agoraErr);
      // Even if Agora cloud fails, browser STT continues seamlessly
    }

    setStatusText(`Active · Listening as ${selectedSpeaker.name}`);
  };

  // Stop / Mute Voice
  const stopVoice = () => {
    setIsListening(false);
    isListeningRef.current = false;
    setInterimTranscript('');
    setVolumeLevel(0);

    // Stop Speech Recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }

    // Stop volume polling
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }

    // Leave Agora RTC
    if (audioTrackRef.current) {
      audioTrackRef.current.stop();
      audioTrackRef.current.close();
      audioTrackRef.current = null;
    }
    if (clientRef.current) {
      clientRef.current.leave().catch(() => {});
      clientRef.current = null;
    }

    setAgoraConnected(false);
    setStatusText('Voice paused');
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVoice();
    };
  }, []);

  return {
    responders,
    addResponder,
    isListening,
    interimTranscript,
    recentSpoken,
    selectedSpeaker,
    setSelectedSpeaker,
    volumeLevel,
    speechSupported,
    agoraConnected,
    statusText,
    startVoice,
    stopVoice,
    dispatchUtterance,
  };
}
