/**
 * BridgePage - Audio bridge for Google Meet/Zoom integration
 * Captures system audio, publishes to Agora, routes TTS back into call
 */
import React, { useState, useEffect } from 'react';
import { useAgoraBridge } from '../hooks/useAgoraBridge';
import { apiClient } from '../api/client';

interface BridgePageProps {
  channelName: string;
}

export const BridgePage: React.FC<BridgePageProps> = ({ channelName }) => {
  const [token, setToken] = useState<string | null>(null);
  const [presenterName, setPresenterName] = useState('Presenter');
  const [selectedSinkDevice, setSelectedSinkDevice] = useState<string>('');
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  
  const {
    state,
    startSystemCapture,
    enablePresenterMic,
    joinAndPublish,
    setTTSSinkDevice,
    enumerateAudioOutputs,
    stopBridge,
  } = useAgoraBridge(channelName);

  // Fetch Agora token on mount
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const response = await apiClient.post('/api/agora/token', {
          channel_name: channelName,
          uid: 'bridge',
        });
        setToken(response.data.token);
      } catch (err: any) {
        console.error('Failed to fetch Agora token:', err);
      }
    };

    if (channelName) {
      fetchToken();
    }
  }, [channelName]);

  // Enumerate audio devices on mount
  useEffect(() => {
    const loadDevices = async () => {
      const devices = await enumerateAudioOutputs();
      setAudioDevices(devices);
      
      // Try to find a virtual device (Cable, BlackHole, etc.)
      const virtualDevice = devices.find(d => 
        d.label.toLowerCase().includes('cable') ||
        d.label.toLowerCase().includes('blackhole') ||
        d.label.toLowerCase().includes('loopback')
      );
      
      if (virtualDevice) {
        setSelectedSinkDevice(virtualDevice.deviceId);
      }
    };

    loadDevices();
  }, []);

  // Handle start capture button
  const handleStartCapture = async () => {
    try {
      await startSystemCapture();
      console.log('System audio capture started');
    } catch (err: any) {
      console.error('Capture failed:', err);
      alert(`Failed to capture system audio: ${err.message}\n\nTry using a virtual loopback device instead.`);
    }
  };

  // Handle enable presenter mic
  const handleEnableMic = async () => {
    try {
      await enablePresenterMic();
      console.log('Presenter microphone enabled');
    } catch (err: any) {
      console.error('Mic failed:', err);
    }
  };

  // Handle join and publish
  const handleJoin = async () => {
    if (!token) {
      alert('Token not loaded yet');
      return;
    }

    try {
      await joinAndPublish(token, 'bridge');
      console.log('Joined channel and publishing');
    } catch (err: any) {
      console.error('Join failed:', err);
    }
  };

  // Handle sink device change
  const handleSinkChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const deviceId = e.target.value;
    setSelectedSinkDevice(deviceId);
    
    try {
      await setTTSSinkDevice(deviceId);
      console.log('TTS sink device changed to:', deviceId);
    } catch (err: any) {
      console.error('Failed to change sink:', err);
    }
  };

  // Handle stop
  const handleStop = () => {
    stopBridge();
    console.log('Bridge stopped');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">🌉 SIGNAL Bridge Mode</h1>
        <p className="text-slate-400 mb-8">
          Connect SIGNAL to Google Meet/Zoom by capturing system audio and routing TTS back into the call.
        </p>

        {/* Status Panel */}
        <div className="bg-slate-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">📊 Status</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${state.isCapturing ? 'bg-green-500' : 'bg-red-500'}`} />
              <span>System Capture: {state.isCapturing ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${state.isPublishing ? 'bg-green-500' : 'bg-red-500'}`} />
              <span>Publishing: {state.isPublishing ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${state.ttsSinkDeviceId ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <span>TTS Sink: {state.ttsSinkDeviceId ? 'Configured' : 'Not Set'}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${token ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <span>Agora Token: {token ? 'Loaded' : 'Loading...'}</span>
            </div>
          </div>
          
          {state.error && (
            <div className="mt-4 p-3 bg-red-900/50 border border-red-500 rounded text-red-200">
              ⚠️ {state.error}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="bg-slate-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">🎛️ Controls</h2>
          
          <div className="space-y-4">
            <button
              onClick={handleStartCapture}
              disabled={state.isCapturing}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 rounded-lg font-medium transition"
            >
              🎤 Start System Audio Capture
            </button>
            
            <button
              onClick={handleEnableMic}
              className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition"
            >
              🎙️ Enable Presenter Microphone
            </button>
            
            <button
              onClick={handleJoin}
              disabled={!token || (!state.isCapturing && !presenterName)}
              className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 rounded-lg font-medium transition"
            >
              📡 Join Channel & Publish
            </button>
            
            <button
              onClick={handleStop}
              disabled={!state.isCapturing && !state.isPublishing}
              className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 disabled:bg-slate-600 rounded-lg font-medium transition"
            >
              ⏹️ Stop Bridge
            </button>
          </div>
        </div>

        {/* TTS Sink Device Selection */}
        <div className="bg-slate-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">🔊 TTS Output Device</h2>
          <p className="text-slate-400 mb-4">
            Select your virtual microphone device (VB-Cable, BlackHole, etc.) to route SIGNAL's voice into the call.
          </p>
          
          <select
            value={selectedSinkDevice}
            onChange={handleSinkChange}
            className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-white"
          >
            <option value="">-- Select Virtual Microphone --</option>
            {audioDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Audio Output (${device.deviceId.slice(0, 8)}...)`}
              </option>
            ))}
          </select>
          
          <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-600 rounded text-yellow-200 text-sm">
            💡 <strong>Setup Instructions:</strong>
            <ol className="list-decimal list-inside mt-2 space-y-1">
              <li>Install VB-Cable (Windows) or BlackHole (Mac)</li>
              <li>In Google Meet settings: Microphone = Cable B Output</li>
              <li>Here: Select Cable B Input as TTS sink</li>
              <li>Test: Say something → Should appear in transcript</li>
            </ol>
          </div>
        </div>

        {/* Channel Info */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">ℹ️ Channel Information</h2>
          <div className="space-y-2 text-slate-300">
            <div><strong>Channel:</strong> {channelName}</div>
            <div><strong>Presenter Name:</strong> {presenterName}</div>
            <div><strong>UID:</strong> bridge</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BridgePage;
