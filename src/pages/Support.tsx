
import React from 'react';
import { Ticket, BookOpen, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Support = () => {
  const handleRaiseTicket = () => {
    // Open ticket form or redirect to ticketing system
    window.open('https://support.aczen.com/tickets', '_blank');
  };

  const handleKnowledgeBase = () => {
    // Open knowledge base
    window.open('https://support.aczen.com/kb', '_blank');
  };

  const handleWriteToUs = () => {
    // Open email client or contact form
    window.open('mailto:support@aczen.com', '_blank');
  };

  return (
    <div className="p-6 h-full">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Support</h1>
        <p className="text-muted-foreground mt-2">
          Get help with your questions and issues. Our AI assistant is here to help you.
        </p>
      </div>
      
      <div className="h-[calc(100vh-280px)] w-full relative mb-6">
        <iframe 
          src="https://app.relevanceai.com/agents/f1db6c/bed250b6de1d-4fd1-a58c-65508e44f4ab/a6adb977-d58b-47b9-82d6-866c9004a8b4/embed-chat?hide_tool_steps=false&hide_file_uploads=false&hide_conversation_list=false&bubble_style=agent&primary_color=%23685FFF&bubble_icon=pd%2Fchat&input_placeholder_text=Type+your+message...&hide_logo=false&hide_description=false" 
          width="100%" 
          height="100%" 
          frameBorder="0"
          className="rounded-lg border"
        />
      </div>

      <div className="flex gap-4 justify-center">
        <Button
          onClick={handleRaiseTicket}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Ticket className="h-5 w-5" />
          Raise a Ticket
        </Button>

        <Button
          onClick={handleKnowledgeBase}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-green-600 hover:bg-green-700 text-white"
        >
          <BookOpen className="h-5 w-5" />
          Knowledge Base
        </Button>

        <Button
          onClick={handleWriteToUs}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-purple-600 hover:bg-purple-700 text-white"
        >
          <Mail className="h-5 w-5" />
          Write to Us
        </Button>
      </div>
    </div>
  );
};

export default Support;
