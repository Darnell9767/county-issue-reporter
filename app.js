let map=null;
let problemMarker=null;
let savedMapMarkers=[];
let latitude=null;
let longitude=null;
let selectedIssue="";
let selectedSeverity="";
let mediaRecorder=null;
let audioChunks=[];
let voiceBlob=null;
let previewUrls=[];

const STORAGE_KEY="countyReports";
const DB_NAME="countyIssueReporterDB";
const DB_VERSION=1;
const STORE_NAME="reportAttachments";
const ATHABASCA_CENTER=[54.72,-113.29];

function showScreen(id){
  document.querySelectorAll(".screen").forEach(screen=>screen.classList.remove("active"));
  const target=document.getElementById(id);
  if(target)target.classList.add("active");
  window.scrollTo({top:0,behavior:"smooth"});
  if(id==="step1"){
    setTimeout(()=>{
      initMap();
      if(map)map.invalidateSize();
    },120);
  }
}

function startReport(){
  latitude=null;
  longitude=null;
  selectedIssue="";
  selectedSeverity="";
  voiceBlob=null;
  audioChunks=[];

  document.querySelectorAll(".issue-card").forEach(card=>card.classList.remove("selected"));
  document.querySelectorAll(".severity-card").forEach(card=>card.classList.remove("selected"));

  const description=document.getElementById("description");
  const camera=document.getElementById("cameraMedia");
  const existing=document.getElementById("existingMedia");
  if(description)description.value="";
  if(camera)camera.value="";
  if(existing)existing.value="";

  document.getElementById("locationMessage").innerText="Location has not been recorded yet.";
  document.getElementById("mediaStatus").innerText="No photos or videos selected yet.";
  document.getElementById("dictationStatus").innerText="Voice-to-text ready.";
  document.getElementById("audioStatus").innerText="No voice note recorded.";
  document.getElementById("audioButton").innerText="🎤 Record Voice Note";

  if(problemMarker&&map){map.removeLayer(problemMarker);problemMarker=null;}
  showScreen("step1");
}

function initMap(){
  if(map)return;

  map=L.map("map",{zoomControl:true}).setView(ATHABASCA_CENTER,9);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    maxZoom:19,
    attribution:"© OpenStreetMap contributors"
  }).addTo(map);

  map.on("click",event=>{
    setProblemLocation(event.latlng.lat,event.latlng.lng,true);
  });

  addSavedReportMarkers();
}

function setProblemLocation(lat,lng,zoomTo){
  latitude=Number(lat);
  longitude=Number(lng);

  if(!map)initMap();

  if(problemMarker){problemMarker.setLatLng([latitude,longitude]);}
  else{
    problemMarker=L.marker([latitude,longitude],{draggable:true}).addTo(map);
    problemMarker.bindPopup("Reported problem location").openPopup();
    problemMarker.on("dragend",()=>{
      const point=problemMarker.getLatLng();
      setProblemLocation(point.lat,point.lng,false);
    });
  }

  if(zoomTo&&map)map.setView([latitude,longitude],15);

  const nearby=findNearbyReports(latitude,longitude,1);
  let message=`Location recorded: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}.`;
  if(nearby.length>0){
    message+=` ${nearby.length} saved report${nearby.length===1?"":"s"} on this device ${nearby.length===1?"is":"are"} within about 1 km of this spot.`;
  }
  document.getElementById("locationMessage").innerText=message;
}

function findMyLocation(){
  const message=document.getElementById("locationMessage");
  if(!navigator.geolocation){
    message.innerText="GPS is not available on this device. Tap the map to mark the problem instead.";
    return;
  }

  message.innerText="Finding your location…";
  navigator.geolocation.getCurrentPosition(
    position=>setProblemLocation(position.coords.latitude,position.coords.longitude,true),
    ()=>{message.innerText="We could not get your GPS location. Check Safari location permission, or tap the map instead.";},
    {enableHighAccuracy:true,timeout:15000,maximumAge:10000}
  );
}

function goToStep2(){
  if(latitude===null||longitude===null){
    alert("Please record the problem location first. Use your GPS or tap the map.");
    return;
  }
  showScreen("step2");
}

function goToStep3(){
  if(!selectedIssue){
    alert("Please choose the type of road or infrastructure problem first.");
    return;
  }
  showScreen("step3");
}

function getSelectedMediaFiles(){
  const camera=Array.from(document.getElementById("cameraMedia")?.files||[]);
  const existing=Array.from(document.getElementById("existingMedia")?.files||[]);
  return [...camera,...existing];
}

function updateMediaStatus(){
  const files=getSelectedMediaFiles();
  const status=document.getElementById("mediaStatus");
  if(files.length===0){
    status.innerText="No photos or videos selected yet.";
    return;
  }
  status.innerText=`${files.length} photo/video file${files.length===1?"":"s"} selected. A wide view plus a close-up usually gives the clearest report.`;
}

function buildReview(){
  if(!selectedSeverity){
    alert("Please choose how serious the problem is before reviewing the report.");
    return;
  }

  const files=getSelectedMediaFiles();
  const description=document.getElementById("description").value.trim();
  const nearby=findNearbyReports(latitude,longitude,1);
  const review=document.getElementById("reviewCard");

  review.innerHTML="";
  addReviewSection(review,"Location",latitude!==null&&longitude!==null?`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`:"Not recorded");
  addReviewSection(review,"Problem",selectedIssue||"Not selected");
  addReviewSection(review,"Severity",selectedSeverity||"Not selected");
  addReviewSection(review,"Description",description||"No written description provided.");
  addReviewSection(review,"Photos / videos",`${files.length} selected`);
  addReviewSection(review,"Voice note",voiceBlob?"Recorded":"Not recorded");

  if(files.length===0){
    const photoNote=document.createElement("div");
    photoNote.className="repeat-alert";
    photoNote.innerHTML="<strong>Photo reminder:</strong> You can still save this report, but a clear wide photo and close-up can make it much easier to understand the problem.";
    review.appendChild(photoNote);
  }

  if(nearby.length>0){
    const repeat=document.createElement("div");
    repeat.className="repeat-alert";
    repeat.innerHTML=`<strong>Possible recurring problem:</strong> ${nearby.length} earlier saved report${nearby.length===1?"":"s"} on this device ${nearby.length===1?"is":"are"} within roughly 1 km of this location. Repeated reports can help reveal patterns over time.`;
    review.appendChild(repeat);
  }

  showScreen("step6");
}

function addReviewSection(parent,label,value){
  const section=document.createElement("div");
  section.className="review-section";
  const labelEl=document.createElement("div");
  labelEl.className="review-label";
  labelEl.innerText=label;
  const valueEl=document.createElement("div");
  valueEl.className="review-value";
  valueEl.innerText=value;
  section.appendChild(labelEl);
  section.appendChild(valueEl);
  parent.appendChild(section);
}

function getReports(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY))||[];}
  catch(error){console.error(error);return [];}
}

function setReports(reports){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(reports));
}

function distanceKm(lat1,lon1,lat2,lon2){
  const R=6371;
  const toRad=value=>value*Math.PI/180;
  const dLat=toRad(lat2-lat1);
  const dLon=toRad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function findNearbyReports(lat,lng,radiusKm){
  if(lat===null||lng===null)return [];
  return getReports().filter(report=>{
    const rLat=Number(report.latitude);
    const rLng=Number(report.longitude);
    if(!Number.isFinite(rLat)||!Number.isFinite(rLng))return false;
    return distanceKm(Number(lat),Number(lng),rLat,rLng)<=radiusKm;
  });
}

function addSavedReportMarkers(){
  if(!map)return;
  savedMapMarkers.forEach(marker=>map.removeLayer(marker));
  savedMapMarkers=[];

  getReports().forEach(report=>{
    const lat=Number(report.latitude);
    const lng=Number(report.longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
    const marker=L.circleMarker([lat,lng],{
      radius:7,
      color:"#155ea0",
      fillColor:"#f59e0b",
      fillOpacity:.85,
      weight:2
    }).addTo(map);
    marker.bindPopup(`<strong>${escapeHtml(report.issueType||"Saved report")}</strong><br>${escapeHtml(report.severity||"")}<br>${escapeHtml(formatSavedDate(report))}`);
    savedMapMarkers.push(marker);
  });
}

function openAttachmentDB(){
  return new Promise((resolve,reject)=>{
    if(!window.indexedDB){reject(new Error("IndexedDB is not available"));return;}
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME,{keyPath:"reportId"});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function saveAttachments(reportId,files,audio){
  const db=await openAttachmentDB();
  const media=files.map(file=>({
    name:file.name||"attachment",
    type:file.type||"application/octet-stream",
    size:file.size||0,
    blob:file
  }));
  const voice=audio?{
    name:"voice-note",
    type:audio.type||"audio/webm",
    size:audio.size||0,
    blob:audio
  }:null;

  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_NAME,"readwrite");
    tx.objectStore(STORE_NAME).put({reportId,media,voice,savedAt:new Date().toISOString()});
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{const error=tx.error;db.close();reject(error);};
    tx.onabort=()=>{const error=tx.error;db.close();reject(error);};
  });
}

async function getAttachments(reportId){
  try{
    const db=await openAttachmentDB();
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,"readonly");
      const request=tx.objectStore(STORE_NAME).get(reportId);
      request.onsuccess=()=>resolve(request.result||null);
      request.onerror=()=>reject(request.error);
      tx.oncomplete=()=>db.close();
    });
  }catch(error){console.error(error);return null;}
}

async function deleteAttachments(reportId){
  try{
    const db=await openAttachmentDB();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,"readwrite");
      tx.objectStore(STORE_NAME).delete(reportId);
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error);
    });
    db.close();
  }catch(error){console.error(error);}
}

async function saveReport(){
  if(latitude===null||longitude===null||!selectedIssue||!selectedSeverity){
    alert("This report is missing its location, issue type or severity. Please go back and complete those steps.");
    return;
  }

  const files=getSelectedMediaFiles();
  const description=document.getElementById("description").value.trim();
  const reportId=Date.now();
  const created=new Date().toISOString();
  const reportText=`DARNELL'S APP ROAD REPORT\n\nDate / Time:\n${new Date(created).toLocaleString()}\n\nIssue Type:\n${selectedIssue}\n\nSeverity:\n${selectedSeverity}\n\nDescription:\n${description||"No description provided"}\n\nGPS Location:\n${latitude}, ${longitude}\n\nPhoto / Video Attachments:\n${files.length}\n\nVoice Recording:\n${voiceBlob?"Recorded":"Not recorded"}\n\nStatus:\nReported`;

  if(navigator.storage&&navigator.storage.persist){navigator.storage.persist().catch(()=>{});}

  let attachmentsStored=true;
  try{await saveAttachments(reportId,files,voiceBlob);}
  catch(error){console.error(error);attachmentsStored=false;}

  const reports=getReports();
  reports.unshift({
    id:reportId,
    created,
    issueType:selectedIssue,
    severity:selectedSeverity,
    description,
    latitude,
    longitude,
    mediaCount:files.length,
    voiceRecorded:!!voiceBlob,
    attachmentsStored,
    status:"Reported",
    report:reportText
  });
  setReports(reports);

  addSavedReportMarkers();

  if(attachmentsStored){
    alert("Report saved on this device, including the selected attachments.");
  }else{
    alert("The report details were saved, but Safari could not store one or more attachments. Large files or low device storage can cause this.");
  }

  showSavedReports();
}

function showSavedReports(){
  renderSavedReports();
  showScreen("savedScreen");
}

function renderSavedReports(){
  clearPreviewUrls();
  const container=document.getElementById("savedReports");
  const reports=getReports();
  container.innerHTML="";

  if(reports.length===0){
    const empty=document.createElement("div");
    empty.className="empty-state";
    empty.innerText="No reports are saved on this device yet.";
    container.appendChild(empty);
    return;
  }

  reports.forEach(report=>{
    const card=document.createElement("article");
    card.className="saved-report-card";

    const title=document.createElement("h3");
    title.innerText=report.issueType||"Saved Road Report";

    const meta=document.createElement("div");
    meta.className="saved-meta";
    meta.innerText=`${formatSavedDate(report)} • ${report.severity||"Severity not recorded"}`;

    const location=document.createElement("div");
    location.className="status-box";
    const lat=Number(report.latitude);
    const lng=Number(report.longitude);
    location.innerText=Number.isFinite(lat)&&Number.isFinite(lng)?`📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}`:"📍 Location not available";

    const description=document.createElement("div");
    description.className="saved-description";
    description.innerText=report.description||"No description provided.";

    const mediaSummary=document.createElement("div");
    mediaSummary.className="status-box";
    if(report.attachmentsStored===true){
      mediaSummary.innerText=`Stored: ${report.mediaCount||0} photo/video${report.voiceRecorded?" + voice note":""}.`;
    }else if(report.attachmentsStored===false){
      mediaSummary.innerText="Report details are saved, but attachment storage failed.";
    }else{
      mediaSummary.innerText="Older report: original attachment files may not be available.";
    }

    const attachments=document.createElement("div");
    attachments.className="attachment-list";

    const actions=document.createElement("div");
    actions.className="saved-actions";

    const open=document.createElement("button");
    open.className="open-report";
    open.innerText="Show Attachments";
    open.onclick=()=>toggleAttachments(report.id,attachments,open);

    const remove=document.createElement("button");
    remove.className="delete-report";
    remove.innerText="Delete Report";
    remove.onclick=()=>removeReport(report.id);

    actions.appendChild(open);
    actions.appendChild(remove);
    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(location);
    card.appendChild(description);
    card.appendChild(mediaSummary);
    card.appendChild(actions);
    card.appendChild(attachments);
    container.appendChild(card);
  });
}

async function toggleAttachments(reportId,container,button){
  if(container.childNodes.length>0){
    container.innerHTML="";
    button.innerText="Show Attachments";
    return;
  }

  button.innerText="Loading…";
  const data=await getAttachments(reportId);
  button.innerText="Hide Attachments";

  if(!data||((!data.media||data.media.length===0)&&!data.voice)){
    const note=document.createElement("div");
    note.className="status-box";
    note.innerText="No stored attachment files were found for this report.";
    container.appendChild(note);
    return;
  }

  (data.media||[]).forEach(item=>{
    const label=document.createElement("div");
    label.className="saved-meta";
    label.innerText=item.name||"Saved attachment";
    container.appendChild(label);

    const url=URL.createObjectURL(item.blob);
    previewUrls.push(url);

    if((item.type||"").startsWith("image/")){
      const image=document.createElement("img");
      image.className="saved-media";
      image.src=url;
      image.alt=item.name||"Saved road photo";
      container.appendChild(image);
    }else if((item.type||"").startsWith("video/")){
      const video=document.createElement("video");
      video.className="saved-media";
      video.src=url;
      video.controls=true;
      container.appendChild(video);
    }else{
      const link=document.createElement("a");
      link.href=url;
      link.target="_blank";
      link.innerText="Open saved attachment";
      container.appendChild(link);
    }
  });

  if(data.voice&&data.voice.blob){
    const label=document.createElement("div");
    label.className="saved-meta";
    label.innerText="Saved voice note";
    const audio=document.createElement("audio");
    audio.className="saved-audio";
    audio.controls=true;
    const url=URL.createObjectURL(data.voice.blob);
    previewUrls.push(url);
    audio.src=url;
    container.appendChild(label);
    container.appendChild(audio);
  }
}

async function removeReport(reportId){
  if(!confirm("Delete this saved report from this device?"))return;
  const reports=getReports().filter(report=>String(report.id)!==String(reportId));
  setReports(reports);
  await deleteAttachments(reportId);
  renderSavedReports();
  addSavedReportMarkers();
}

function clearPreviewUrls(){
  previewUrls.forEach(url=>URL.revokeObjectURL(url));
  previewUrls=[];
}

function formatSavedDate(report){
  try{
    if(report.created)return new Date(report.created).toLocaleString();
    if(report.id&&Number(report.id)>1000000000000)return new Date(Number(report.id)).toLocaleString();
  }catch(error){}
  return "Saved report";
}

function escapeHtml(value){
  return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
}

function setupSelections(){
  document.querySelectorAll(".issue-card").forEach(card=>{
    card.addEventListener("click",()=>{
      document.querySelectorAll(".issue-card").forEach(item=>item.classList.remove("selected"));
      card.classList.add("selected");
      selectedIssue=card.dataset.issue||"";
    });
  });

  document.querySelectorAll(".severity-card").forEach(card=>{
    card.addEventListener("click",()=>{
      document.querySelectorAll(".severity-card").forEach(item=>item.classList.remove("selected"));
      card.classList.add("selected");
      selectedSeverity=card.dataset.severity||"";
    });
  });

  document.getElementById("cameraMedia").addEventListener("change",updateMediaStatus);
  document.getElementById("existingMedia").addEventListener("change",updateMediaStatus);
}

function setupDictation(){
  const button=document.getElementById("dictateButton");
  const status=document.getElementById("dictationStatus");
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;

  if(!SpeechRecognition){
    button.addEventListener("click",()=>{status.innerText="Voice-to-text is not available in this browser. You can still type or record a voice note.";});
    return;
  }

  const recognition=new SpeechRecognition();
  recognition.lang="en-CA";
  recognition.continuous=false;
  recognition.interimResults=false;

  recognition.onstart=()=>{
    status.innerText="Listening… Describe what you see in your own words.";
    button.innerText="🎙️ Listening…";
  };

  recognition.onresult=event=>{
    const spoken=event.results[0][0].transcript;
    const description=document.getElementById("description");
    description.value=description.value.trim()?`${description.value.trim()} ${spoken}`:spoken;
    status.innerText="Your spoken description was added.";
  };

  recognition.onerror=event=>{
    status.innerText=event.error==="aborted"?"Voice-to-text stopped.":`Voice-to-text error: ${event.error}`;
  };

  recognition.onend=()=>{button.innerText="🎙️ Speak My Description";};

  button.addEventListener("click",()=>{
    try{recognition.start();}
    catch(error){status.innerText="Voice-to-text is already listening.";}
  });
}

function setupAudioRecorder(){
  const button=document.getElementById("audioButton");
  const status=document.getElementById("audioStatus");

  button.addEventListener("click",async()=>{
    if(mediaRecorder&&mediaRecorder.state==="recording"){
      mediaRecorder.stop();
      button.innerText="🎤 Record Voice Note";
      return;
    }

    if(!navigator.mediaDevices||!window.MediaRecorder){
      status.innerText="Voice recording is not available in this browser.";
      return;
    }

    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      audioChunks=[];
      mediaRecorder=new MediaRecorder(stream);

      mediaRecorder.ondataavailable=event=>{
        if(event.data&&event.data.size>0)audioChunks.push(event.data);
      };

      mediaRecorder.onstop=()=>{
        voiceBlob=new Blob(audioChunks,{type:mediaRecorder.mimeType||"audio/webm"});
        status.innerText="Voice note recorded and ready to save with this report.";
        stream.getTracks().forEach(track=>track.stop());
      };

      mediaRecorder.start();
      status.innerText="Recording… Tell us anything that is easier to explain out loud.";
      button.innerText="⏹ Stop Voice Note";
    }catch(error){
      console.error(error);
      status.innerText="Microphone permission was not available. Check Safari microphone permission and try again.";
    }
  });
}

setupSelections();
setupDictation();
setupAudioRecorder();
