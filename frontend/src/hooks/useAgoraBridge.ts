/**
 * useAgoraBridge - Hook for managing Agora bridge mode
 * Captures system audio (Google Meet), presenter mic, mixes audio for Agora RTC,
 * and streams speech recognition transcripts to SIGNAL's knowledge graph.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import AgoraRTC, { IAgoraRTCClient, ILocalAudioTrack } from 'agora-rtc-sdk-ng';
import { apiClient } from '../api/client';
import { parseInSpeechSpeaker, SpeakerProfile, INITIAL_RESPONDER } from './useVoiceCommander';
import { useAppStore } from '../store';

export interface BridgeState {
  isCapturing: boolean;
  isPresenterMic: boolean;
  isPublishing: boolean;
  ttsSinkDeviceId: string | null;
  channelName: string | null;
  error: string | null;
  status: string;
  volumeLevel: number;
}

export function useAgoraBridge(rawChannelName: string | null) {
  // Sanitize channel name for Agora RTC (alphanumeric, underscores, hyphens only)
  const cleanChannelName = (rawChannelName || 'signal-incident-room')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 64);

  const [state, setState] = useState<BridgeState>({
    isCapturing: false,
    isPresenterMic: false,
    isPublishing: false,
    ttsSinkDeviceId: null,
    channelName: cleanChannelName,
    error: null,
    status: 'Ready to bridge audio',
    volumeLevel: 0,
  });

  const [bridgeTranscripts, setBridgeTranscripts] = useState<
    Array<{ id: string; speaker: string; text: string; time: string }>
  >([]);
  const [interimText, setInterimText] = useState('');

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const systemAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const presenterMicTrackRef = useRef<MediaStreamTrack | null>(null);
  const publishedCustomTrackRef = useRef<ILocalAudioTrack | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ttsAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const volumeIntervalRef = useRef<any>(null);

  const currentIncident = useAppStore((s) => s.currentIncident);
  const activeIncidentId = currentIncident?.id;

  // Initialize Agora client
  useEffect(() => {
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;

    return () => {
      stopBridge();
      try {
        (client as any).destroy?.();
      } catch (e) {}
    };
  }, [cleanChannelName]);

  // Send transcribed voice line to SIGNAL knowledge graph
  const sendBridgeTranscript = useCallback(
    async (text: string, speakerName = 'Bridge Speaker') => {
      if (!text.trim()) return;
      const eventId = `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const time = new Date().toLocaleTimeString();

      setBridgeTranscripts((prev) => [
        { id: eventId, speaker: speakerName, text, time },
        ...prev.slice(0, 24),
      ]);

      try {
        await apiClient.post('/webhooks/agora/transcript', {
          event_id: eventId,
          channel_name: cleanChannelName,
          incident_id: activeIncidentId,
          speaker_uid: 9990,
          speaker_name: speakerName,
          text: text,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Bridge webhook transcript post:', err);
      }
    },
    [cleanChannelName, activeIncidentId]
  );

  // Initialize Web Speech Recognition for the bridge
  const startBridgeSpeechRecognition = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition not supported in this browser.');
      return;
    }

    try {
      if (!recognitionRef.current) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          if (useAppStore.getState().isSpeaking) {
            setInterimText('');
            return;
          }

          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              const finalTrimmed = transcript.trim();
              if (finalTrimmed.length > 2) {
                const parsed = parseInSpeechSpeaker(finalTrimmed, INITIAL_RESPONDER, [INITIAL_RESPONDER]);
                sendBridgeTranscript(parsed.text, parsed.speaker.name);
              }
              setInterimText('');
            } else {
              interim += transcript;
            }
          }
          if (interim) {
            setInterimText(interim);
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'no-speech') return;
          console.warn('Bridge Speech Recognition error:', event.error);
        };

        recognition.onend = () => {
          if (isListeningRef.current) {
            try {
              recognition.start();
            } catch (e) {}
          }
        };

        recognitionRef.current = recognition;
      }

      isListeningRef.current = true;
      recognitionRef.current.start();
    } catch (e) {
      console.warn('Could not start bridge SpeechRecognition:', e);
    }
  }, [sendBridgeTranscript]);

  const stopBridgeSpeechRecognition = () => {
    isListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setInterimText('');
  };

  // Start capturing system audio (Google Meet/Zoom audio via Chrome tab sharing)
  const startSystemCapture = async () => {
    try {
      setState((prev) => ({ ...prev, error: null, status: 'Requesting Google Meet tab audio...' }));

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Required by Chrome to present the tab audio picker
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as any,
      });

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        stream.getVideoTracks().forEach((track) => track.stop());
        throw new Error(
          'Tab Audio was not checked. In the Chrome popup, select "Chrome Tab" (your Google Meet) and verify the "Share tab audio" checkbox is CHECKED at the bottom left.'
        );
      }

      // Handle user stopping screen share via Chrome floating UI
      audioTrack.onended = () => {
        systemAudioTrackRef.current = null;
        setState((prev) => ({ ...prev, isCapturing: false, status: 'System audio capture stopped' }));
      };

      systemAudioTrackRef.current = audioTrack;
      setState((prev) => ({
        ...prev,
        isCapturing: true,
        error: null,
        status: 'Google Meet tab audio captured successfully',
      }));

      // Stop video track immediately (we only need the audio)
      stream.getVideoTracks().forEach((track) => track.stop());

      // Start speech recognition so spoken tab/mic audio is transcribed
      startBridgeSpeechRecognition();

      return audioTrack;
    } catch (err: any) {
      console.error('System audio capture failed:', err);
      const errMsg = err.message?.includes('Tab Audio was not checked')
        ? err.message
        : `Audio capture failed: ${err.message || 'Permission denied'}. Make sure to select "Chrome Tab" with "Share tab audio" checked.`;
      setState((prev) => ({
        ...prev,
        error: errMsg,
        isCapturing: false,
        status: 'Capture failed',
      }));
      throw err;
    }
  };

  // Enable presenter microphone
  const enablePresenterMic = async () => {
    try {
      setState((prev) => ({ ...prev, status: 'Requesting microphone access...' }));
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const micTrack = stream.getAudioTracks()[0];
      micTrack.onended = () => {
        presenterMicTrackRef.current = null;
        setState((prev) => ({ ...prev, isPresenterMic: false }));
      };

      presenterMicTrackRef.current = micTrack;
      setState((prev) => ({
        ...prev,
        isPresenterMic: true,
        error: null,
        status: 'Presenter microphone active',
      }));

      startBridgeSpeechRecognition();
      return micTrack;
    } catch (err: any) {
      console.error('Presenter mic failed:', err);
      setState((prev) => ({
        ...prev,
        error: `Microphone access error: ${err.message || 'Permission denied'}`,
        status: 'Mic error',
      }));
      throw err;
    }
  };

  // Build a single mixed audio track to prevent CAN_NOT_PUBLISH_MULTIPLE_VIDEO_OR_AUDIO_TRACKS
  const createMixedAudioTrack = (): MediaStreamTrack | null => {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = audioCtx;
    const destination = audioCtx.createMediaStreamDestination();

    let attached = 0;
    if (systemAudioTrackRef.current && systemAudioTrackRef.current.readyState === 'live') {
      try {
        const source1 = audioCtx.createMediaStreamSource(new MediaStream([systemAudioTrackRef.current]));
        source1.connect(destination);
        attached++;
      } catch (e) {
        console.warn('Could not attach system audio to mixer:', e);
      }
    }

    if (presenterMicTrackRef.current && presenterMicTrackRef.current.readyState === 'live') {
      try {
        const source2 = audioCtx.createMediaStreamSource(new MediaStream([presenterMicTrackRef.current]));
        source2.connect(destination);
        attached++;
      } catch (e) {
        console.warn('Could not attach presenter mic to mixer:', e);
      }
    }

    if (attached > 0 && destination.stream.getAudioTracks().length > 0) {
      return destination.stream.getAudioTracks()[0];
    }
    return null;
  };

  // Join channel and publish audio tracks (using numerical UID 9990 for bridge)
  const joinAndPublish = async (token: string, numericUid = 9990, appId?: string) => {
    if (!clientRef.current) {
      throw new Error('Agora Client not initialized');
    }

    const effectiveAppId = (appId || '448514fe68b2427097e014f12cb5d64e').trim();
    const client = clientRef.current;

    try {
      setState((prev) => ({ ...prev, status: `Joining Agora channel "${cleanChannelName}"...`, error: null }));

      // If already connected, leave first to refresh state cleanly
      if (client.connectionState === 'CONNECTED' || client.connectionState === 'CONNECTING') {
        await client.leave();
      }

      // Join channel with valid numerical UID
      await client.join(effectiveAppId, cleanChannelName, token, numericUid);

      // Create single mixed local audio track or standard mic track
      let customMediaTrack = createMixedAudioTrack();
      let agoraTrack: ILocalAudioTrack | null = null;

      if (customMediaTrack) {
        agoraTrack = AgoraRTC.createCustomAudioTrack({
          mediaStreamTrack: customMediaTrack,
        });
      } else {
        // Fallback: create standard high-quality microphone track
        agoraTrack = await AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig: 'high_quality_stereo',
          AEC: true,
          ANS: true,
        });
      }

      if (agoraTrack) {
        publishedCustomTrackRef.current = agoraTrack;
        await client.publish([agoraTrack]);
      }

      setState((prev) => ({
        ...prev,
        isPublishing: true,
        error: null,
        status: `Bridge connected & broadcasting to "${cleanChannelName}" (UID: ${numericUid})`,
      }));

      // Monitor audio volume
      if (publishedCustomTrackRef.current) {
        volumeIntervalRef.current = setInterval(() => {
          if (publishedCustomTrackRef.current) {
            const level = publishedCustomTrackRef.current.getVolumeLevel();
            setState((prev) => ({ ...prev, volumeLevel: Math.min(100, Math.round(level * 100 * 3)) }));
          }
        }, 100);
      }

      // Subscribe to remote tracks (e.g. TTS voice from SIGNAL)
      client.on('user-published', async (user: any, mediaType: string) => {
        if (mediaType === 'audio') {
          await client.subscribe(user, mediaType);
          const remoteTrack = user.audioTrack;

          if (remoteTrack && state.ttsSinkDeviceId) {
            try {
              const audioElement = document.createElement('audio');
              audioElement.id = `tts-audio-${user.uid}`;
              if ((audioElement as any).setSinkId) {
                await (audioElement as any).setSinkId(state.ttsSinkDeviceId);
              }
              remoteTrack.play(audioElement);
              ttsAudioElementRef.current = audioElement;
            } catch (sinkErr) {
              console.warn('Could not set custom sink ID, playing to default audio output:', sinkErr);
              remoteTrack.play();
            }
          } else if (remoteTrack) {
            remoteTrack.play();
          }
        }
      });

      startBridgeSpeechRecognition();
      return client;
    } catch (err: any) {
      console.error('joinAndPublish failed:', err);
      const msg = err.message || 'Agora RTC join failed';
      setState((prev) => ({
        ...prev,
        isPublishing: false,
        error: `Bridge Error: ${msg}`,
        status: 'Connection failed',
      }));
      throw err;
    }
  };

  // Set TTS output device (virtual microphone)
  const setTTSSinkDevice = async (deviceId: string) => {
    setState((prev) => ({ ...prev, ttsSinkDeviceId: deviceId }));

    if (ttsAudioElementRef.current && (ttsAudioElementRef.current as any).setSinkId) {
      try {
        await (ttsAudioElementRef.current as any).setSinkId(deviceId);
      } catch (err) {
        console.error('Failed to set sink ID:', err);
      }
    }
  };

  // Enumerate available audio output devices
  const enumerateAudioOutputs = async (): Promise<MediaDeviceInfo[]> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === 'audiooutput');
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
      return [];
    }
  };

  // Stop bridge
  const stopBridge = () => {
    stopBridgeSpeechRecognition();

    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }

    if (systemAudioTrackRef.current) {
      systemAudioTrackRef.current.stop();
      systemAudioTrackRef.current = null;
    }

    if (presenterMicTrackRef.current) {
      presenterMicTrackRef.current.stop();
      presenterMicTrackRef.current = null;
    }

    if (publishedCustomTrackRef.current) {
      publishedCustomTrackRef.current.stop();
      publishedCustomTrackRef.current.close();
      publishedCustomTrackRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (clientRef.current) {
      clientRef.current.leave().catch(() => {});
    }

    if (ttsAudioElementRef.current) {
      ttsAudioElementRef.current.remove();
      ttsAudioElementRef.current = null;
    }

    setState({
      isCapturing: false,
      isPresenterMic: false,
      isPublishing: false,
      ttsSinkDeviceId: null,
      channelName: cleanChannelName,
      error: null,
      status: 'Bridge stopped',
      volumeLevel: 0,
    });
  };

  return {
    state,
    cleanChannelName,
    bridgeTranscripts,
    interimText,
    startSystemCapture,
    enablePresenterMic,
    joinAndPublish,
    sendBridgeTranscript,
    setTTSSinkDevice,
    enumerateAudioOutputs,
    stopBridge,
  };
}

