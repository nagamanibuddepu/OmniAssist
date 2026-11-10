chrome.runtime.onInstalled.addListener(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }));
let liveTabId=null;

async function ensureOffscreen(){
  const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[chrome.runtime.getURL('offscreen.html')]});
  if(!contexts.length)await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['USER_MEDIA'],justification:'Capture the user-selected active tab and microphone for an explicitly started live assistant session.'});
  for(let i=0;i<20;i++){try{const ready=await chrome.runtime.sendMessage({target:'offscreen',type:'ping'});if(ready?.ready)return}catch{}await new Promise(resolve=>setTimeout(resolve,100))}
  throw Error('The live media processor did not start. Close and reopen the side panel, then try again.');
}
chrome.runtime.onMessage.addListener((message,_sender,respond)=>{
  if(message?.type==='start-live-capture'){
    (async()=>{const streamId=await chrome.tabCapture.getMediaStreamId({targetTabId:message.tabId});await ensureOffscreen();liveTabId=message.tabId;await chrome.storage.session.set({liveTabId,liveStartedAt:Date.now(),liveMicOn:true,liveMicMuted:false});await chrome.runtime.sendMessage({target:'offscreen',type:'capture-stream',streamId,api:message.api,token:message.token,conversationId:message.conversationId});respond({ok:true})})().catch(error=>{liveTabId=null;chrome.storage.session.remove(['liveTabId','liveStartedAt','liveMicOn','liveMicMuted']);respond({error:error.message})});return true;
  }
  if(message?.target==='service-worker'&&message?.type==='stop-live-capture'){
    chrome.runtime.sendMessage({target:'offscreen',type:'stop-streams',which:message.which,muted:message.muted});if(message.which==='screen'||message.which==='all'){liveTabId=null;chrome.storage.session.remove('liveTabId')}if(message.which==='mic')chrome.storage.session.remove(['liveMicOn','liveMicMuted']);if(message.which==='mute-mic')chrome.storage.session.set({liveMicMuted:!!message.muted});if(message.which==='all')chrome.storage.session.remove(['liveStartedAt','liveMicOn','liveMicMuted']);respond({ok:true});return false;
  }
  if(message?.target==='service-worker'&&message?.type==='get-live-status'){
    chrome.storage.session.get(['liveTabId','liveStartedAt','liveMicOn','liveMicMuted']).then(saved=>respond({tabId:saved.liveTabId??null,startedAt:saved.liveStartedAt??null,micOn:saved.liveMicOn??false,micMuted:!!saved.liveMicMuted}));return true;
  }
});
chrome.tabs.onActivated.addListener(async({tabId})=>{const saved=await chrome.storage.session.get('liveTabId');liveTabId=saved.liveTabId??null;if(liveTabId!==null&&tabId!==liveTabId){chrome.runtime.sendMessage({target:'offscreen',type:'stop-streams',which:'screen'});chrome.runtime.sendMessage({target:'panel',type:'live-status',status:'screen-stopped'});liveTabId=null;chrome.storage.session.remove('liveTabId')}});
chrome.tabs.onRemoved.addListener(async tabId=>{const saved=await chrome.storage.session.get('liveTabId');liveTabId=saved.liveTabId??null;if(liveTabId===tabId){chrome.runtime.sendMessage({target:'offscreen',type:'stop-streams',which:'screen'});chrome.runtime.sendMessage({target:'panel',type:'live-status',status:'screen-stopped'});liveTabId=null;chrome.storage.session.remove('liveTabId')}});
