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

export const INITIAL_RESPONDER: SpeakerProfile = {
  name: 'Commander',
  uid: 1001,
  role: 'Incident Lead',
  avatar: '🧑‍💼',
};

export function getAvatarForName(name: string): string {
  const avatars = ['🧑‍💻', '👩‍💻', '👨‍💻', '👩‍🔬', '👨‍🔬', '🧑‍🚀', '👩‍💼', '👨‍💼', '🧑‍🔧', '👩‍🔧', '🧙‍♂️', '🦸‍♀️'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return avatars[Math.abs(hash) % avatars.length];
}

export function parseInSpeechSpeaker(
  rawText: string,
  currentSpeaker: SpeakerProfile,
  allProfiles: SpeakerProfile[]
): { text: string; speaker: SpeakerProfile } {
  // 1. Phonetic STT Typo Normalization (common browser speech-to-text mishearings)
  let normalized = rawText
    .replace(/\b(?:allies|a lies|ellis|elis)\b/gi, 'Alice')
    .replace(/\b(?:bop)\b/gi, 'Bob')
    .replace(/\b(?:carrel|carroll)\b/gi, 'Carol')
    .replace(/\b(?:serah|sara)\b/gi, 'Sarah')
    .replace(/\b(?:deve|dav)\b/gi, 'Dave');

  const reservedWords = new Set([
    'note', 'fact', 'hypothesis', 'action', 'alert', 'error', 'warning', 'info',
    'step', 'signal', 'question', 'http', 'https', 'we', 'they', 'team', 'service',
    'database', 'redis', 'postgres', 'server', 'system', 'latency', 'pod', 'cluster',
    'status', 'update', 'incident', 'issue', 'problem', 'fix', 'task', 'logs', 'metrics'
  ]);

  const makeProfile = (name: string, role = 'Incident Responder'): SpeakerProfile => {
    const cleanName = name.trim().charAt(0).toUpperCase() + name.trim().slice(1);
    const existing = allProfiles.find((p) => p.name.toLowerCase() === cleanName.toLowerCase());
    if (existing) return existing;
    return {
      name: cleanName,
      uid: Math.floor(1000 + Math.random() * 8999),
      role: role,
      avatar: getAvatarForName(cleanName),
    };
  };

  // Pattern 1: "Name: message" or "Name - message"
  const m1 = normalized.match(/^([A-Za-z0-9_\-]{2,20})\s*[:\-]\s*(.+)/s);
  if (m1) {
    const cand = m1[1].trim();
    if (!reservedWords.has(cand.toLowerCase())) {
      return { text: m1[2].trim(), speaker: makeProfile(cand) };
    }
  }

  // Pattern 2: "Hello/Hi, this is Name from [Team/Role]: message" or "I am Name from [Team]: message"
  const m2 = normalized.match(
    /^(?:hello\s+|hi\s+|hey\s+)?(?:this is|i am|i'm|it's)\s+([A-Za-z0-9_\-]{2,20})(?:\s+from\s+([A-Za-z0-9_\s\-]+?))?(?:\s+here)?\s*[:,\- ]\s*(.+)/is
  );
  if (m2) {
    const cand = m2[1].trim();
    const role = m2[2] ? `${m2[2].trim()} Engineer` : 'Incident Responder';
    if (!reservedWords.has(cand.toLowerCase())) {
      return { text: m2[3].trim(), speaker: makeProfile(cand, role) };
    }
  }

  // Pattern 3: Standalone intro "This is Name" / "Hi I'm Name" (switches speaker for upcoming talk)
  const m3 = normalized.match(/^(?:hello\s+|hi\s+|hey\s+)?(?:this is|i am|i'm|it's)\s+([A-Za-z0-9_\-]{2,20})(?:\s+from\s+([A-Za-z0-9_\s\-]+?))?(?:\s+here)?[.!]?$/is);
  if (m3) {
    const cand = m3[1].trim();
    const role = m3[2] ? `${m3[2].trim()} Engineer` : 'Incident Responder';
    if (!reservedWords.has(cand.toLowerCase())) {
      const sp = makeProfile(cand, role);
      return { text: `Joined incident call as ${sp.name}`, speaker: sp };
    }
  }

  // Pattern 4: "Name here: message" or "Name speaking: message" or "Speaking is Name: message"
  const m4 = normalized.match(/^([A-Za-z0-9_\-]{2,20})\s+(?:here|speaking|on the line)\s*[:,-]\s*(.+)/is);
  if (m4) {
    const cand = m4[1].trim();
    if (!reservedWords.has(cand.toLowerCase())) {
      return { text: m4[2].trim(), speaker: makeProfile(cand) };
    }
  }

  // Pattern 5: "Speaking as Name: message"
  const m5 = normalized.match(/^(?:speaking as|from)\s+([A-Za-z0-9_\-]{2,20})\s*[:,-]\s*(.+)/is);
  if (m5) {
    const cand = m5[1].trim();
    if (!reservedWords.has(cand.toLowerCase())) {
      return { text: m5[2].trim(), speaker: makeProfile(cand) };
    }
  }

  return { text: rawText, speaker: currentSpeaker };
}

export function useVoiceCommander(incidentId: string | null) {
  const [responders, setResponders] = useState<SpeakerProfile[]>([INITIAL_RESPONDER]);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [recentSpoken, setRecentSpoken] = useState<Array<{ text: string; speaker: string; time: string }>>([]);
  const [selectedSpeaker, setSelectedSpeaker] = useState<SpeakerProfile>(INITIAL_RESPONDER);
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

  // Google Meet Tab Audio Bridge inside VoiceCommander
  const [isMeetBridged, setIsMeetBridged] = useState(false);
  const [meetVolumeLevel, setMeetVolumeLevel] = useState(0);
  const tabAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const tabMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const tabAudioIntervalRef = useRef<any>(null);
  const isTranscribingMeetRef = useRef(false);

  const processMeetBlob = useCallback(
    async (blob: Blob) => {
      if (blob.size < 1200 || isTranscribingMeetRef.current || !incidentIdRef.current) return;
      isTranscribingMeetRef.current = true;

      try {
        const formData = new FormData();
        formData.append('file', blob, 'meet_audio.webm');
        formData.append('incident_id', incidentIdRef.current);
        formData.append('speaker_name', selectedSpeakerRef.current.name);

        const res = await apiClient.post('/api/agora/transcribe-audio', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (res.data?.status === 'ok' && res.data?.text) {
          const text = res.data.text.trim();
          const speaker = res.data.speaker || selectedSpeakerRef.current.name;

          const parsed = parseInSpeechSpeaker(
            text,
            { ...selectedSpeakerRef.current, name: speaker },
            respondersRef.current
          );

          addResponder(parsed.speaker);
          dispatchUtterance(parsed.text, parsed.speaker.name);
        }
      } catch (err) {
        console.warn('Meet tab chunk transcription notice:', err);
      } finally {
        isTranscribingMeetRef.current = false;
      }
    },
    [addResponder, dispatchUtterance]
  );

  const startMeetBridge = async () => {
    if (!incidentId) {
      alert('Please select or create an incident first.');
      return;
    }

    try {
      setStatusText('Requesting Google Meet tab audio...');
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as any,
      });

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        stream.getVideoTracks().forEach((t) => t.stop());
        alert('Make sure to select "Chrome Tab" (your Google Meet) and check "Share tab audio" at the bottom left.');
        return;
      }

      // Stop video track immediately
      stream.getVideoTracks().forEach((t) => t.stop());

      tabAudioTrackRef.current = audioTrack;
      setIsMeetBridged(true);
      setStatusText('Google Meet Tab Audio Bridge Active');

      audioTrack.onended = () => {
        stopMeetBridge();
      };

      // Setup VAD and MediaRecorder
      const mediaStream = new MediaStream([audioTrack]);
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      const source = audioCtx.createMediaStreamSource(mediaStream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(mediaStream, { mimeType });
      let recordedChunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (recordedChunks.length > 0) {
          const blob = new Blob(recordedChunks, { type: mimeType });
          recordedChunks = [];
          processMeetBlob(blob);
        }
      };

      tabMediaRecorderRef.current = recorder;

      let speechActive = false;
      let silenceCount = 0;
      let speechStartTime = 0;

      tabAudioIntervalRef.current = setInterval(() => {
        if (!tabAudioTrackRef.current || tabAudioTrackRef.current.readyState !== 'live') return;

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        setMeetVolumeLevel(Math.min(100, Math.round(avg * 3)));

        if (avg > 4) {
          silenceCount = 0;
          if (!speechActive) {
            speechActive = true;
            speechStartTime = Date.now();
            if (recorder.state === 'inactive') {
              try {
                recorder.start();
              } catch (e) {}
            }
          } else if (Date.now() - speechStartTime > 4000) {
            if (recorder.state === 'recording') {
              try {
                recorder.stop();
                recorder.start();
              } catch (e) {}
            }
            speechStartTime = Date.now();
          }
        } else if (speechActive) {
          silenceCount++;
          if (silenceCount > 4) {
            speechActive = false;
            if (recorder.state === 'recording') {
              try {
                recorder.stop();
              } catch (e) {}
            }
          }
        }
      }, 150);
    } catch (err: any) {
      console.error('Failed to start meet bridge:', err);
      setStatusText(`Meet bridge error: ${err.message || 'Permission denied'}`);
    }
  };

  const stopMeetBridge = () => {
    if (tabAudioIntervalRef.current) {
      clearInterval(tabAudioIntervalRef.current);
      tabAudioIntervalRef.current = null;
    }

    if (tabMediaRecorderRef.current && tabMediaRecorderRef.current.state === 'recording') {
      try {
        tabMediaRecorderRef.current.stop();
      } catch (e) {}
      tabMediaRecorderRef.current = null;
    }

    if (tabAudioTrackRef.current) {
      tabAudioTrackRef.current.stop();
      tabAudioTrackRef.current = null;
    }

    setIsMeetBridged(false);
    setMeetVolumeLevel(0);
    setStatusText('Google Meet bridge disconnected');
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
      stopMeetBridge();
    };
  }, []);

  return {
    responders,
    addResponder,
    isListening,
    isMeetBridged,
    meetVolumeLevel,
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
    startMeetBridge,
    stopMeetBridge,
    dispatchUtterance,
  };
}

