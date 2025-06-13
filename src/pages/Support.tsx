
import React from 'react';

const Support = () => {
  return (
    <div className="p-6 h-full">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Support</h1>
        <p className="text-muted-foreground mt-2">
          Get help with your questions and issues. Our AI assistant is here to help you.
        </p>
      </div>
      
      <div className="h-[calc(100vh-200px)] w-full relative">
        <iframe 
          src="https://app.relevanceai.com/agents/f1db6c/bed250b6de1d-4fd1-a58c-65508e44f4ab/a6adb977-d58b-47b9-82d6-866c9004a8b4/embed-chat?hide_tool_steps=false&hide_file_uploads=false&hide_conversation_list=false&bubble_style=agent&primary_color=%23685FFF&bubble_icon=pd%2Fchat&input_placeholder_text=Type+your+message...&hide_logo=false&hide_description=false" 
          width="100%" 
          height="100%" 
          frameBorder="0"
          className="rounded-lg border"
        />
      </div>
    </div>
  );
};

export default Support;
