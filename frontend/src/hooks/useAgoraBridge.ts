/**
 * useAgoraBridge - Hook for managing Agora bridge mode
 * Captures system audio, publishes to channel, routes TTS to virtual mic
 */
import { useState, useEffect, useRef } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';

interface BridgeState {
  isCapturing: boolean;
  isPublishing: boolean;
  ttsSinkDeviceId: string | null;
  channelName: string | null;
  error: string | null;
}

type LocalAudioTrack = any;
type RemoteUser = any;

export function useAgoraBridge(channelName: string | null) {
  const [state, setState] = useState<BridgeState>({
    isCapturing: false,
    isPublishing: false,
    ttsSinkDeviceId: null,
    channelName: null,
    error: null,
  });

  const clientRef = useRef<any>(null);
  const systemAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const presenterMicTrackRef = useRef<MediaStreamTrack | null>(null);
  const ttsAudioElementRef = useRef<HTMLAudioElement | null>(null);

  // Initialize Agora client
  useEffect(() => {
    if (!channelName) return;

    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    clientRef.current = client;

    return () => {
      (client as any).destroy?.();
    };
  }, [channelName]);

  // Start capturing system audio (Google Meet/Zoom audio)
  const startSystemCapture = async () => {
    try {
      setState(prev => ({ ...prev, error: null }));
      
      // Request system audio capture via getDisplayMedia
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Required for audio capture in Chrome
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } as any,
      });

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        throw new Error('No audio track found in system capture');
      }

      systemAudioTrackRef.current = audioTrack;
      setState(prev => ({ ...prev, isCapturing: true }));

      // Stop video track immediately (we only need audio)
      stream.getVideoTracks().forEach(track => track.stop());

      return audioTrack;
    } catch (err: any) {
      console.error('System audio capture failed:', err);
      setState(prev => ({ 
        ...prev, 
        error: `System audio capture failed: ${err.message}. Use fallback mode.`,
        isCapturing: false 
      }));
      throw err;
    }
  };

  // Enable presenter microphone
  const enablePresenterMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const micTrack = stream.getAudioTracks()[0];
      presenterMicTrackRef.current = micTrack;

      return micTrack;
    } catch (err: any) {
      console.error('Presenter mic failed:', err);
      throw err;
    }
  };

  // Join channel and publish audio tracks
  const joinAndPublish = async (token: string, uid: string) => {
    if (!clientRef.current || !channelName) {
      throw new Error('Client not initialized');
    }

    const client = clientRef.current;

    // Join channel
    await client.join('', channelName, token, uid);

    // Create local audio tracks
    const tracks: LocalAudioTrack[] = [];

    if (systemAudioTrackRef.current) {
      const systemTrack = AgoraRTC.createCustomAudioTrack({
        mediaStreamTrack: systemAudioTrackRef.current,
      });
      tracks.push(systemTrack);
    }

    if (presenterMicTrackRef.current) {
      const micTrack = AgoraRTC.createCustomAudioTrack({
        mediaStreamTrack: presenterMicTrackRef.current,
      });
      tracks.push(micTrack);
    }

    // Publish tracks
    if (tracks.length > 0) {
      await client.publish(tracks);
      setState(prev => ({ ...prev, isPublishing: true }));
    }

    // Subscribe to remote tracks (TTS from agent)
    client.on('user-published', async (user: RemoteUser, mediaType: any) => {
      if (mediaType === 'audio') {
        await client.subscribe(user, mediaType);
        
        // Get the remote audio track
        const remoteTrack = user.audioTrack;
        
        // Play to selected sink device (virtual mic for Meet)
        if (remoteTrack && state.ttsSinkDeviceId) {
          const audioElement = document.createElement('audio');
          audioElement.id = `tts-audio-${user.uid}`;
          
          // Set sink ID to route to virtual microphone
          if ((audioElement as any).setSinkId) {
            await (audioElement as any).setSinkId(state.ttsSinkDeviceId);
          }
          
          remoteTrack.play(audioElement);
          ttsAudioElementRef.current = audioElement;
        }
      }
    });

    return client;
  };

  // Set TTS output device (virtual microphone)
  const setTTSSinkDevice = async (deviceId: string) => {
    setState(prev => ({ ...prev, ttsSinkDeviceId: deviceId }));
    
    // If already playing, switch the device
    if (ttsAudioElementRef.current && (ttsAudioElementRef.current as any).setSinkId) {
      try {
        await (ttsAudioElementRef.current as any).setSinkId(deviceId);
      } catch (err) {
        console.error('Failed to set sink ID:', err);
        throw err;
      }
    }
  };

  // Enumerate available audio output devices
  const enumerateAudioOutputs = async (): Promise<MediaDeviceInfo[]> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'audiooutput');
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
      return [];
    }
  };

  // Stop bridge
  const stopBridge = () => {
    // Stop all tracks
    if (systemAudioTrackRef.current) {
      systemAudioTrackRef.current.stop();
      systemAudioTrackRef.current = null;
    }

    if (presenterMicTrackRef.current) {
      presenterMicTrackRef.current.stop();
      presenterMicTrackRef.current = null;
    }

    // Leave channel
    if (clientRef.current) {
      clientRef.current.leave();
    }

    // Stop TTS audio
    if (ttsAudioElementRef.current) {
      ttsAudioElementRef.current.remove();
      ttsAudioElementRef.current = null;
    }

    setState({
      isCapturing: false,
      isPublishing: false,
      ttsSinkDeviceId: null,
      channelName: null,
      error: null,
    });
  };

  return {
    state,
    startSystemCapture,
    enablePresenterMic,
    joinAndPublish,
    setTTSSinkDevice,
    enumerateAudioOutputs,
    stopBridge,
  };
}
