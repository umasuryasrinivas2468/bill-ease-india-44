import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  onLanguageDetected?: (lang: 'en' | 'hi') => void;
  disabled?: boolean;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({ onTranscript, onLanguageDetected, disabled }) => {
  const [isListening, setIsListening] = useState(false);
  const [volume, setVolume] = useState(0);
  const [voiceLang, setVoiceLang] = useState<'en-IN' | 'hi-IN'>('en-IN');
  const recognitionRef = useRef<any>(null);
  const animFrameRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    setIsListening(false);
    setVolume(0);
  }, []);

  const startListening = useCallback(async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({
        title: "Not supported",
        description: "Voice input is not supported in this browser. Try Chrome.",
        variant: "destructive",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Audio analyser for volume visualization
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((sum, val) => sum + val, 0) / dataArray.length;
        setVolume(Math.min(avg / 128, 1));
        animFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = voiceLang;

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        // Detect Hindi characters
        const hasHindi = /[\u0900-\u097F]/.test(transcript);
        if (onLanguageDetected) {
          onLanguageDetected(hasHindi ? 'hi' : 'en');
        }
        onTranscript(transcript);
        stopListening();
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'no-speech') {
          toast({
            title: "Voice error",
            description: `Could not recognize speech: ${event.error}`,
            variant: "destructive",
          });
        }
        stopListening();
      };

      recognition.onend = () => {
        stopListening();
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch (err) {
      console.error('Microphone error:', err);
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to use voice input.",
        variant: "destructive",
      });
    }
  }, [onTranscript, onLanguageDetected, stopListening, toast, voiceLang]);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  const pulseScale = 1 + volume * 0.6;

  return (
    <div className="relative">
      {/* Animated rings when listening */}
      {isListening && (
        <>
          <div
            className="absolute inset-0 rounded-full bg-primary/30 animate-ping"
            style={{ animationDuration: '1.5s' }}
          />
          <div
            className="absolute -inset-1 rounded-full bg-primary/20 transition-transform duration-75"
            style={{ transform: `scale(${pulseScale})` }}
          />
          <div
            className="absolute -inset-2 rounded-full bg-primary/10 transition-transform duration-75"
            style={{ transform: `scale(${1 + volume * 0.9})` }}
          />
        </>
      )}
      {/* Language toggle */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setVoiceLang(prev => prev === 'en-IN' ? 'hi-IN' : 'en-IN')}
        disabled={disabled || isListening}
        className="relative z-10 h-6 px-1.5 text-[10px] font-bold rounded-md"
        title={voiceLang === 'en-IN' ? 'Switch to Hindi' : 'Switch to English'}
      >
        {voiceLang === 'en-IN' ? 'EN' : 'हि'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={isListening ? stopListening : startListening}
        disabled={disabled}
        className={cn(
          "relative z-10 h-9 w-9 p-0 shrink-0 rounded-full transition-all duration-200",
          isListening
            ? "bg-red-500 text-white hover:bg-red-600"
            : "bg-primary/10 hover:bg-primary/20"
        )}
        title={isListening ? "Stop recording" : `Voice input (${voiceLang === 'en-IN' ? 'English' : 'Hindi'})`}
      >
        {isListening ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4 text-orange-500" />
        )}
      </Button>
    </div>
  );
};

export default VoiceInput;
