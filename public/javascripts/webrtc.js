let ws_server;
let ws_port;
let default_peer_id;
let rtc_configuration = null;
let mediaConstraints = {video: true, audio: true};
let connect_attempts = 0;
let myPeerConnection;
let ws_conn;
let mediaStreamSource;
let remote_stream;
let localStream;
let audioElement = null;
let remoteVideo = null;
let audioEnabled = false;
let videoEnabled = false;
let webRTCEndLoad = null;
let webRTCStartLoad = null;
senderAudio = null;

function getOurId() {
    return Math.floor(Math.random() * (9000 - 10) + 10).toString();
}

function resetState() {
    ws_conn.close();
}

function handleIncomingError(error) {
    setError("ERROR: " + error);
    resetState();
}

function setStatus(text) {
    console.log(text);
}

function setError(text) {
    console.error(text);
}

function resetIncomingStream() {
    // Reset the video element and stop showing the last received frame
    if (remoteVideo) {    
        remoteVideo.pause();
        remoteVideo.srcObject = null;
    }
}
function startOutgoingAudioStream() {
  if (localStream) {
    let audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      senderAudio.replaceTrack(audioTrack);
    }
  }
}
function stopOutgoingAudioStream() {
  senderAudio.replaceTrack(null);
}
function startOutgoingVideoStream() {
  if (localStream) {
    let videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      senderVideo.replaceTrack(videoTrack);
    }
  }
}
function stopOutgoingVideoStream() {
  senderVideo.replaceTrack(null);
}
function createLocalStream(callback) {
    if (!localStream) {
        /* Send our video/audio to the other peer */
        navigator.mediaDevices.getUserMedia(mediaConstraints)
        .then((stream) => {
            console.log('Adding local stream');
            localStream = stream;
            localVideo = document.getElementById("local_video");
            localVideo.srcObject = localStream;
            localStream.getTracks().forEach(track => {
              if (track.kind == 'audio') {
                senderAudio = myPeerConnection.addTrack(track, localStream)
              } else if (track.kind == 'video') {
                senderVideo = myPeerConnection.addTrack(track, localStream)
              } 
            });
            if (callback) {
                callback();    
            }
        })
        .catch(handleGetUserMediaError);
    }
}
function handleGetUserMediaError(e) {
    switch(e.name) {
      case "NotFoundError":
        alert("Unable to open your call because no camera and/or microphone" +
              "were found.");
        break;
      case "SecurityError":
      case "PermissionDeniedError":
        // Do nothing; this is the same as the user canceling the call.
        break;
      default:
        alert("Error opening your camera and/or microphone: " + e.message);
        break;
    }
  
    closeVideoCall();
  }
  function closeVideoCall() {
  
    if (myPeerConnection) {
      myPeerConnection.ontrack = null;
      myPeerConnection.onremovetrack = null;
      myPeerConnection.onremovestream = null;
      myPeerConnection.onicecandidate = null;
      myPeerConnection.oniceconnectionstatechange = null;
      myPeerConnection.onsignalingstatechange = null;
      myPeerConnection.onicegatheringstatechange = null;
      myPeerConnection.onnegotiationneeded = null;
  
      if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
      }
  
      if (localVideo.srcObject) {
        localVideo.srcObject.getTracks().forEach(track => track.stop());
      }
  
      myPeerConnection.close();
      myPeerConnection = null;
    }
  
    remoteVideo.removeAttribute("src");
    remoteVideo.removeAttribute("srcObject");
    localVideo.removeAttribute("src");
    remoteVideo.removeAttribute("srcObject");

  }
// SDP offer received from peer, set remote description and create an answer
function onIncomingSDP(description) {
    if (description.type == "answer") {
        setStatus("Got SDP answer");
        myPeerConnection.setRemoteDescription(description);
        setStatus("Remote SDP set");
    } else if (description.type == "offer") {
        setStatus("Got SDP offer");
        handleVideoOfferMsg(description);
    }
}

function onServerMessage(event) {
    console.log("Received " + event.data);
    switch (event.data) {
        case "HELLO":
            setStatus("Registered with server, waiting for call");
            break;
        case "SESSION_OK": {
            createCall();
            break;
        }
        default: {
            if (event.data.startsWith("ERROR")) {
                handleIncomingError(event.data);
                return;
            }
            // Handle incoming JSON SDP and ICE messages
            try {
                msg = JSON.parse(event.data);
            } catch (e) {
                if (e instanceof SyntaxError) {
                    handleIncomingError("Error parsing incoming JSON: " + event.data);
                } else {
                    handleIncomingError("Unknown error parsing response: " + event.data);
                }
                return;
            }
            if (msg.sdp != null) {
                onIncomingSDP(msg.sdp);
            } else if (msg.ice != null) {
                handleNewICECandidateMsg(msg.ice);
            } else {
                handleIncomingError("Unknown incoming JSON: " + msg);
            }
        }
    }
}
function onServerClose(event) {
    setStatus('Disconnected from server');
    resetIncomingStream();
    stopOutgoingAudioStream();
    stopOutgoingVideoStream();
    if (myPeerConnection) {
        myPeerConnection.close();
        myPeerConnection = null;
    }
    remote_stream = null;
    mediaStreamSource = null;
}
function onServerError(event) {
    setError("Unable to connect to server, did you add an exception for the certificate?")
    window.setTimeout(websocketServerConnect, 3000);
}
function websocketServerConnect(callback) {
    connect_attempts++;
    if (connect_attempts > 3) {
        setError("Too many connection attempts, aborting. Refresh page to try again");
        return;
    }
    // Fetch the peer id to use
    peer_id = default_peer_id || getOurId();
    ws_port = ws_port || '8443';
    if (window.location.protocol.startsWith ("file")) {
        ws_server = ws_server || "127.0.0.1";
    // TODO
    // } else if (window.location.protocol.startsWith ("https")) {
    } else if (window.location.protocol.startsWith ("http")) {
        ws_server = ws_server || window.location.hostname;
    } else {
        throw new Error ("Don't know how to connect to the signalling server with uri" + window.location);
    }
    let ws_url = 'wss://' + ws_server + ':' + ws_port
    // TODO
    // let ws_url = 'wss://' + ws_server + ':' + ws_port
    setStatus("Connecting to server " + ws_url);
    ws_conn = new WebSocket(ws_url);
    /* When connected, immediately register with the server */
    ws_conn.addEventListener('open', (event) => {
        // document.getElementById("peer-id").textContent = peer_id;
        ws_conn.send('HELLO ' + peer_id);
        setStatus("Registering with server");
        document.getElementById('peer-id').innerText = peer_id;
        // TODO
        // if (callback) {
        //     callback(peer_id);
        //     console.log('Sent to Signaling server peer id: ', peer_id);
        // }
    });
    ws_conn.addEventListener('error', onServerError);
    ws_conn.addEventListener('message', onServerMessage);
    ws_conn.addEventListener('close', onServerClose);

    if (webRTCStartLoad) {
        webRTCStartLoad();
    }
}
function onRemoteStreamAdded(event) {
    remote_stream = event.stream;

    if (audioEnabled) {
        enableAudio();
    } else {
        disableAudio();
    }
    if (videoEnabled) {
        enableVideo();
    } else {
        disableVideo();
    }
    if (webRTCEndLoad) {
        webRTCEndLoad();
    }
}
function enableAudio() {
    // ws_conn.send('AUDIO_ON');
    audioEnabled = true;
    if (!audioElement || audioElement.readyState != 4) {
        return;
    }
    audioElement.play();
}
function disableAudio() {
    // ws_conn.send('AUDIO_OFF');
    audioEnabled = false;
    if (!audioElement || audioElement.readyState != 4) {
        return;
    }
    audioElement.pause();
}
function enableVideo() {
    // ws_conn.send('VIDEO_ON');
    videoEnabled = true;
    if (!remote_stream) {
        return;
    }
    let videoTracks = remote_stream.getVideoTracks();
    if (videoTracks.length > 0) {
        videoTracks[0].enabled = true;
        remoteVideo.load();
    }
}
function disableVideo() {
    // ws_conn.send('VIDEO_OFF');
    videoEnabled = false;
    if (!remote_stream) {
        return;
    }
    let videoTracks = remote_stream.getVideoTracks();
    if (videoTracks.length > 0) {
        videoTracks[0].enabled = false;
    }
}
function changeSource(element) {
    if (remoteVideo) {
        remoteVideo.pause();
        remoteVideo.srcObject = null;
    }
    remoteVideo = element;
    remoteVideo.srcObject = remote_stream;
    playVideoSource();
}
function playVideoSource() {
    if (videoEnabled) {
        enableVideo();
    }
}
function errorUserMediaHandler() {
    setError("Browser doesn't support getUserMedia!");
}
function createPeerConnection() {
    var options = {
        optional: [
            {DtlsSrtpKeyAgreement: true},
            {RtpDataChannels: true}
        ]
    }
    myPeerConnection = new RTCPeerConnection({
        iceServers: [     // Information about ICE servers - Use your own!
          {
            urls: "stun:stun.stunprotocol.org"
          }
        ]
    },
    options
    );

    myPeerConnection.onicecandidate = handleICECandidateEvent;
    myPeerConnection.ontrack = handleTrackEvent;
    myPeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;
    myPeerConnection.onremovetrack = handleRemoveTrackEvent;
    myPeerConnection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
    myPeerConnection.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
    myPeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
    //myPeerConnection.onaddstream = onRemoteStreamAdded;
}
function handleICECandidateEvent(event) {
    // We have a candidate, send it to the remote party with the
    // same uuid
    if (event.candidate == null) {
        console.log("ICE Candidate was null, done");
        return;
    }
    let candidate = JSON.stringify({'ice': event.candidate});
    console.log('Sending ICE candidate: ', candidate);
    ws_conn.send(candidate);
}
function handleTrackEvent() {
    if (event.track.kind === 'audio') {
        audioElement = document.querySelector('audio');
        audioElement.srcObject = event.streams[0];
        console.log("Audio track added.");
    } else if (event.track.kind === 'video') {
        // TODO Fix vide element for DOCKED mode
        remoteVideo = document.getElementById('remote_video');
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.load();
        console.log("Video track added.");
    }
    console.dir(event);
}
function handleNegotiationNeededEvent(event) {
  // Added workaround due to Chrome defect 
  // https://bugs.chromium.org/p/chromium/issues/detail?id=740501
  // Should be verified in M73
  if (myPeerConnection._negotiating == true) return;
  myPeerConnection._negotiating = true;
  try {
    console.log('AAAAAAAAAAAAA NEGOTIATION NEEDED!', event);
  } finally {
    myPeerConnection._negotiating = false;
  }
}
function handleRemoveTrackEvent() {
    console.log('handleRemoveTrackEvent');
}
function handleICEConnectionStateChangeEvent() {
    console.log('handleICEConnectionStateChangeEvent');
    switch(myPeerConnection.iceConnectionState) {
        case "closed":
        case "failed":
        case "disconnected":
          // closeVideoCall();
          break;
      }
}
function handleICEGatheringStateChangeEvent() {
    console.log('handleICEGatheringStateChangeEvent');
}
function handleSignalingStateChangeEvent() {
    console.log('handleSignalingStateChangeEvent');
    switch(myPeerConnection.signalingState) {
        case "closed":
          closeVideoCall();
          break;
    }
}
function handleNewICECandidateMsg(ice) {
    let candidate = new RTCIceCandidate(ice);
    myPeerConnection.addIceCandidate(candidate).catch(setError);
}
function handleVideoOfferMsg(msg) {
  localStream = null;

  createPeerConnection();

  var desc = new RTCSessionDescription(msg);

  myPeerConnection.setRemoteDescription(desc).then(function () {
    return navigator.mediaDevices.getUserMedia(mediaConstraints);
  })
  .then(function(stream) {
    localStream = stream;
    document.getElementById("local_video").srcObject = localStream;

    localStream.getTracks().forEach(track => {
      if (track.kind == 'audio') {
        senderAudio = myPeerConnection.addTrack(track, localStream)
      } else if (track.kind == 'video') {
        senderVideo = myPeerConnection.addTrack(track, localStream)
      }
    });
  })
  .then(function() {
    return myPeerConnection.createAnswer();
  })
  .then(function(answer) {
    return myPeerConnection.setLocalDescription(answer);
  })
  .then(function() {
    var msg = {
      sdp: myPeerConnection.localDescription
    };

    sendToServer(msg);
  })
  .catch(handleGetUserMediaError);
}
function sendToServer (msg) {
    ws_conn.send(JSON.stringify(msg));
}
function createCall() {
  // Reset connection attempts because we connected successfully
  connect_attempts = 0;
  console.log('Creating RTCPeerConnection');

  createPeerConnection();
  createLocalStream(function() {
    myPeerConnection.createOffer({offerToReceiveAudio: 1, offerToReceiveVideo: 1})
    .then(function(offer) {
        return myPeerConnection.setLocalDescription(offer);
    })
    .then(function() {
        setStatus("Sending SDP offer");
        sdp = {'sdp': myPeerConnection.localDescription}
        console.log(JSON.stringify(myPeerConnection.localDescription));
        ws_conn.send(JSON.stringify(sdp));
    })
    .catch(setError);
  });

  setStatus("Created peer connection for call, waiting for SDP");
}
connect = function() {
    let peer_id = document.getElementById('caller_peer_id').value;
    ws_conn.send('SESSION ' + peer_id);
}
