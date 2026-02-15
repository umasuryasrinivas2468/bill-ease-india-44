import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, X, Loader2, Plus, ChevronDown, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/ClerkAuthProvider';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ChatMessage, ChatMessageData } from '@/components/ai-command/ChatMessage';
import { ExampleCommands } from '@/components/ai-command/ExampleCommands';
import { VoiceInput } from '@/components/ai-command/VoiceInput';

interface CommandResult {
  success: boolean;
  message: string;
  recordType?: string;
  recordId?: string;
  data?: unknown;
  error?: string;
  isQuestion?: boolean;
  isReport?: boolean;
  imageUrl?: string | null;
}

type VoiceLanguage = 'english' | 'hindi' | 'telugu';

const VOICE_LANGUAGE_CONFIG: Record<VoiceLanguage, { label: string; lang: string; rate: number; pitch: number }> = {
  english: { label: 'English', lang: 'en-IN', rate: 0.92, pitch: 1.12 },
  hindi: { label: 'Hindi', lang: 'hi-IN', rate: 0.9, pitch: 1.02 },
  telugu: { label: 'Telugu', lang: 'te-IN', rate: 0.9, pitch: 1.02 },
};

const TRANSLATION_TARGET: Record<VoiceLanguage, string> = {
  english: 'en',
  hindi: 'hi',
  telugu: 'te',
};

const AICommandBar: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isChatMode, setIsChatMode] = useState(false);
  const [isFullScreenMode, setIsFullScreenMode] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>(() => {
    if (typeof window === 'undefined') return 'english';
    const saved = window.localStorage.getItem('cherry_voice_language');
    if (saved === 'english' || saved === 'hindi' || saved === 'telugu') {
      return saved;
    }
    return 'english';
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const translateForUiAndSpeech = useCallback(async (text: string, language: VoiceLanguage): Promise<string> => {
    if (!text.trim() || language === 'english') return text;
    try {
      const target = TRANSLATION_TARGET[language];
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
      const response = await fetch(url);
      if (!response.ok) return text;
      const data = await response.json();
      if (!Array.isArray(data) || !Array.isArray(data[0])) return text;
      const translated = data[0]
        .map((part: any[]) => (Array.isArray(part) ? (part[0] ?? '') : ''))
        .join('')
        .trim();
      return translated || text;
    } catch {
      return text;
    }
  }, []);

  const getCherryVoice = useCallback((language: VoiceLanguage) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;

    const allVoices = voicesRef.current.length > 0
      ? voicesRef.current
      : window.speechSynthesis.getVoices();

    const languageConfig = VOICE_LANGUAGE_CONFIG[language];
    const normalizedTargetLang = languageConfig.lang.toLowerCase();
    const primaryLang = normalizedTargetLang.split('-')[0];
    const nameHints: Record<VoiceLanguage, string[]> = {
      english: ['english', 'india', 'en-in'],
      hindi: ['hindi', 'hi-in', 'devanagari'],
      telugu: ['telugu', 'te-in'],
    };

    const voicesInLanguage = allVoices.filter((voice) => {
      const voiceLang = voice.lang.toLowerCase();
      return voiceLang === normalizedTargetLang || voiceLang.startsWith(`${primaryLang}-`) || voiceLang === primaryLang;
    });
    const namedLanguageVoices = allVoices.filter((voice) => {
      const name = voice.name.toLowerCase();
      return nameHints[language].some((hint) => name.includes(hint));
    });

    const femaleVoice = [...voicesInLanguage, ...namedLanguageVoices].find((voice) => {
      const name = voice.name.toLowerCase();
      return (
        name.includes('female') ||
        name.includes('zira') ||
        name.includes('samantha') ||
        name.includes('karen') ||
        name.includes('serena') ||
        name.includes('aria')
      );
    });

    const exactVoice = [...voicesInLanguage, ...namedLanguageVoices].find((voice) => voice.lang.toLowerCase() === normalizedTargetLang);
    const firstLanguageVoice = voicesInLanguage[0] || namedLanguageVoices[0];
    if (firstLanguageVoice && language !== 'english') {
      return femaleVoice || exactVoice || firstLanguageVoice;
    }
    const englishIndianVoice = allVoices.find((voice) => voice.lang.toLowerCase().includes('en-in'));
    return femaleVoice || exactVoice || firstLanguageVoice || englishIndianVoice || allVoices[0] || null;
  }, []);

  const speakAsCherry = useCallback((text: string) => {
    if (!isVoiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const languageConfig = VOICE_LANGUAGE_CONFIG[voiceLanguage];
    const utterance = new SpeechSynthesisUtterance(text);
    const selectedVoice = getCherryVoice(voiceLanguage);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    utterance.lang = selectedVoice?.lang || languageConfig.lang;
    utterance.rate = languageConfig.rate;
    utterance.pitch = languageConfig.pitch;
    utterance.volume = 0.85;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [getCherryVoice, isVoiceEnabled, voiceLanguage]);

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('cherry_voice_language', voiceLanguage);
  }, [voiceLanguage]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!input.trim() || isLoading) return;
    if (!user?.id) {
      toast({
        title: "Not authenticated",
        description: "Please log in to use the command bar.",
        variant: "destructive"
      });
      return;
    }

    const userMessage: ChatMessageData = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-command', {
        body: { prompt: input.trim(), userId: user.id }
      });

      if (error) throw error;

      const commandResult = data as CommandResult;
      const localizedAssistantText = await translateForUiAndSpeech(commandResult.message, voiceLanguage);

      // Expand to chat mode if it's a question or conversation
      if (commandResult.isQuestion || commandResult.isReport || messages.length > 0) {
        setIsChatMode(true);
      }
      if (commandResult.isQuestion || commandResult.isReport) {
        setIsFullScreenMode(true);
      }

      const assistantMessage: ChatMessageData = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: localizedAssistantText,
        timestamp: new Date(),
        recordType: commandResult.recordType,
        recordId: commandResult.recordId,
        success: commandResult.success,
        imageUrl: commandResult.imageUrl || null
      };

      setMessages(prev => [...prev, assistantMessage]);
      speakAsCherry(localizedAssistantText);

      if (commandResult.success && commandResult.recordType) {
        // Invalidate relevant queries
        const queryMap: Record<string, string[]> = {
          invoice: ['invoices', 'dashboard-stats'],
          client: ['clients'],
          journal: ['journals'],
          quotation: ['quotations'],
          vendor: ['vendors'],
          sales_order: ['sales-orders'],
          purchase_order: ['purchase-orders'],
          inventory: ['inventory']
        };

        const queries = queryMap[commandResult.recordType] || [];
        queries.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));

        if (!commandResult.isQuestion && !commandResult.isReport) {
          toast({
            title: "Success!",
            description: localizedAssistantText,
          });
        }
      }
    } catch (err) {
      console.error('AI Command error:', err);
      const errorMessage: ChatMessageData = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: err instanceof Error ? err.message : 'Failed to process command. Please try again.',
        timestamp: new Date(),
        success: false
      };
      setMessages(prev => [...prev, errorMessage]);
      speakAsCherry(errorMessage.content);
      toast({
        title: "Error",
        description: "Failed to process your command.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExampleClick = (example: string) => {
    setInput(example);
    inputRef.current?.focus();
  };

  const handleVoiceTranscript = (text: string) => {
    setInput(text);
    // Auto-submit after voice input
    setTimeout(() => {
      const form = document.getElementById('ai-command-form') as HTMLFormElement;
      if (form) form.requestSubmit();
    }, 100);
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    handleMinimize();
  };

  const handleNewChat = () => {
    setMessages([]);
    setIsChatMode(false);
    setIsFullScreenMode(false);
    setInput('');
    inputRef.current?.focus();
  };

  const handleMinimize = () => {
    setIsExpanded(false);
    setIsChatMode(false);
    setIsFullScreenMode(false);
  };

  const handleClose = () => {
    setIsExpanded(false);
    setIsChatMode(false);
    setIsFullScreenMode(false);
    setMessages([]);
    setInput('');
  };

  // Collapsed pill button
  if (!isExpanded) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 md:bottom-6">
        <Button
          onClick={() => setIsExpanded(true)}
          className="h-12 px-6 rounded-full bg-gradient-to-r from-orange-500 to-blue-600 hover:from-orange-600 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all duration-300 gap-2 text-white border-0"
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">Ask AI to create invoice, client, or ask questions…</span>
          <span className="sm:hidden">AI Command</span>
        </Button>
      </div>
    );
  }

  return (
    <div className={cn(
      isFullScreenMode
        ? "fixed inset-0 z-50 bg-background/90 backdrop-blur-sm p-3 md:p-6"
        : "fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl md:bottom-6",
      "transition-all duration-300 ease-out"
    )}>
      <div className={cn(
        isFullScreenMode ? "mx-auto h-full w-full max-w-5xl" : "",
        "bg-background/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl overflow-hidden",
        "transition-all duration-300 ease-out",
        isFullScreenMode ? "h-full flex flex-col" : isChatMode ? "h-[80vh]" : "h-auto"
      )}>
        {/* Header - Only show in chat mode */}
        {(isChatMode || isFullScreenMode) && (
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-orange-500 to-blue-600 text-white">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Cherry</h3>
                <p className="text-[10px] text-white/70">Soft voice AI assistant for your business</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <select
                value={voiceLanguage}
                onChange={(e) => {
                  setVoiceLanguage(e.target.value as VoiceLanguage);
                  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                  }
                }}
                className="h-8 rounded-md border border-white/40 bg-white/10 px-2 text-xs text-white outline-none"
                title="Voice language"
              >
                {Object.entries(VOICE_LANGUAGE_CONFIG).map(([key, config]) => (
                  <option key={key} value={key} className="text-black">
                    {config.label}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsVoiceEnabled((prev) => {
                  const next = !prev;
                  if (!next && typeof window !== 'undefined' && 'speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                  }
                  return next;
                })}
                className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
                title={isVoiceEnabled ? "Mute Cherry voice" : "Enable Cherry voice"}
              >
                {isVoiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNewChat}
                className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
                title="New chat"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleMinimize}
                className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
                title="Minimize"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Chat Content */}
        <div className={cn(
          "flex flex-col min-h-0",
          isFullScreenMode || isChatMode ? "flex-1" : "max-h-[400px]"
        )}>
          {messages.length === 0 && !isChatMode ? (
            <ExampleCommands onSelect={handleExampleClick} disabled={isLoading} />
          ) : (
            <ScrollArea className={cn("flex-1", isFullScreenMode ? "p-6 md:p-8" : "p-4")} ref={scrollRef}>
              <div className="space-y-4">
                {messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    message={message}
                    onNavigate={handleNavigate}
                  />
                ))}
                {isLoading && (
                  <div className="flex gap-3 justify-start animate-in fade-in-0">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-500 to-blue-600 flex items-center justify-center shrink-0">
                      <Sparkles className="h-4 w-4 text-white" />
                    </div>
                    <div className="bg-muted/80 rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Input Area */}
        <form id="ai-command-form" onSubmit={handleSubmit} className="flex items-center gap-2 p-3 border-t border-border/50 bg-background/50">
          <VoiceInput onTranscript={handleVoiceTranscript} disabled={isLoading} />
          
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isChatMode ? "Ask a follow-up question..." : "Ask AI to create invoice, client, or ask questions…"}
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-sm placeholder:text-muted-foreground/60"
            disabled={isLoading}
          />
          
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim() || isLoading}
            className={cn(
              "h-9 w-9 p-0 shrink-0 rounded-full",
              "bg-gradient-to-r from-orange-500 to-blue-600",
              "hover:from-orange-600 hover:to-blue-700",
              "disabled:opacity-50"
            )}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-white" />
            ) : (
              <Send className="h-4 w-4 text-white" />
            )}
          </Button>
          
          {!isChatMode && !isFullScreenMode && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="h-9 w-9 p-0 shrink-0 rounded-full hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </form>
      </div>
    </div>
  );
};

export default AICommandBar;
