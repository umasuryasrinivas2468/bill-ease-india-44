
import React, { useEffect } from 'react';

// Extend the Window interface to include chatbase
declare global {
  interface Window {
    chatbase?: any;
  }
}

const Chatbot = () => {
  useEffect(() => {
    // Add the chatbase script
    const script = `
      (function(){
        if(!window.chatbase||window.chatbase("getState")!=="initialized"){
          window.chatbase=(...arguments)=>{
            if(!window.chatbase.q){window.chatbase.q=[]}
            window.chatbase.q.push(arguments)
          };
          window.chatbase=new Proxy(window.chatbase,{
            get(target,prop){
              if(prop==="q"){return target.q}
              return(...args)=>target(prop,...args)
            }
          })
        }
        const onLoad=function(){
          const script=document.createElement("script");
          script.src="https://www.chatbase.co/embed.min.js";
          script.id="RsCSctTSM_4T4ru2o4isT";
          script.domain="www.chatbase.co";
          document.body.appendChild(script)
        };
        if(document.readyState==="complete"){
          onLoad()
        }else{
          window.addEventListener("load",onLoad)
        }
      })();
    `;

    // Create script element and inject the code
    const scriptElement = document.createElement('script');
    scriptElement.textContent = script;
    document.head.appendChild(scriptElement);

    // Cleanup function to remove script when component unmounts
    return () => {
      // Remove the script element
      if (scriptElement.parentNode) {
        scriptElement.parentNode.removeChild(scriptElement);
      }
      
      // Clean up chatbase if it exists
      if (window.chatbase) {
        delete window.chatbase;
      }
    };
  }, []);

  return null; // This component doesn't render anything visible
};

export default Chatbot;
