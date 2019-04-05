/* vim: set sts=4 sw=4 et :
 *
 * Demo Javascript app for negotiating and streaming a sendrecv webrtc stream
 * with a GStreamer app. Runs only in passive mode, i.e., responds to offers
 * with answers, exchanges ICE candidates, and streams.
 *
 * Author: Nirbheek Chauhan <nirbheek@centricular.com>
 */

// Set this to override the automatic detection in websocketServerConnect()
let ws_server;
let ws_port;
// Set this to use a specific peer id instead of a random one
let default_peer_id;
// Override with your own STUN servers if you want
//let rtc_configuration = {iceServers: [{urls: "stun:stun.services.mozilla.com"},
//                                      {urls: "stun:stun.l.google.com:19302"}]};
let rtc_configuration = null;
// The default constraints that will be attempted. Can be overriden by the user.
let default_constraints = {video: true, audio: true};

let connect_attempts = 0;
let peer_connection;
let ws_conn;
let mediaStreamSource;
let remote_stream;
let local_stream;
// let videoElement;
let audioElement;
let audioEnabled = false;
let videoEnabled = false;
// TODO REMOVE
let videoElement = document.getElementById('stream');
let webRTCEndLoad = null;
let webRTCStartLoad = null;
sender = null;

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
    if (videoElement) {    
        videoElement.pause();
        videoElement.srcObject = null;
    }
}
function startOutgoingStream() {
    if (local_stream) {
        // TODO Negotiation mechanism
        // TODO Investigate new API and fix AddTrack 
        // let audioTracks = local_stream.getAudioTracks();
        // if (audioTracks.length == 1) {
        //     if (sender && sender.track) {
        //         peer_connection.removeTrack(sender);
        //     }
        //     // sender = peer_connection.addTrack(audioTracks[0], local_stream);
        //     sender = peer_connection.addTrack(audioTracks[0]);
        //     peer_connection.createOffer({ offerToReceiveAudio: 1 })
        //     // peer_connection.createOffer(default_constraints)
        //     .then(function(offer) {
        //         return peer_connection.setLocalDescription(offer);
        //     })
        //     .then(function() {
        //         setStatus("Sending SDP offer");
        //         sdp = {'sdp': peer_connection.localDescription}
        //         console.log(JSON.stringify(peer_connection.localDescription));
        //         ws_conn.send(JSON.stringify(sdp));
        //     })
        //     .catch(setError);
        // } else {
        //     console.error(`Audio tracks are ${audioTracks.length} is  not equal to 1. Please notify developers!`);
        // }
        let audioTracks = local_stream.getAudioTracks();
        if (audioTracks.length == 1) {
            audioTracks[0].enabled = true;
        } else {
            console.error(`Audio tracks are ${audioTracks.length} is  not equal to 1. Please notify developers!`);
        }
    }
}
function stopOutgoingStream() {
    // TODO Negotiation mechanism
    // peer_connection.removeTrack(sender);
    // peer_connection.createOffer({ offerToReceiveAudio: 1 })
    // .then(function(offer) {
    //     return peer_connection.setLocalDescription(offer);
    // })
    // .then(function() {
    //     setStatus("Sending SDP offer");
    //     sdp = {'sdp': peer_connection.localDescription}
    //     console.log(JSON.stringify(peer_connection.localDescription));
    //     ws_conn.send(JSON.stringify(sdp));
    // })
    // .catch(setError);

    // Release the webcam and mic
    // TODO Investigate new API and fix AddTrack 
    // if (sender) {
    //     peer_connection.removeTrack(sender);
    // }
    // var senders = peer_connection.getSenders();
    // senders.forEach(element => {
    //     peer_connection.removeTrack(element);
    // });
    // peer_connection.dispatchEvent(new Event('negotiationneeded'));
    
    if (local_stream) {
        let audioTracks = local_stream.getAudioTracks();
        if (audioTracks.length == 1) {
            audioTracks[0].enabled = false;
        } else {
            console.error(`Audio tracks are ${audioTracks.length} is  not equal to 1. Please notify developers!`);
        }
    }
}
function createLocalStream(msg, callback) {
    if (!local_stream) {
        /* Send our video/audio to the other peer */
        navigator.mediaDevices.getUserMedia(default_constraints)
        .then((stream) => {
            console.log('Adding local stream');
            local_stream = stream;
            let audioTrack = local_stream.getAudioTracks()[0];
            audioTrack.enabled = true;
            // sender = peer_connection.addTrack(audioTrack, local_stream);
            sender = peer_connection.addTrack(audioTrack);
            // TODO
            if (callback) {
                callback(msg);    
            }
        })
        .catch(setError);
    } else {
        // TODO
        if (callback) {
            callback(msg);    
        }
    }
}
// SDP offer received from peer, set remote description and create an answer
function onIncomingSDP(description) {
    if (description.type == "answer") {
        setStatus("Got SDP answer");
        peer_connection.setRemoteDescription(description);
        setStatus("Remote SDP set");
    } else if (description.type == "offer") {
        setStatus("Got SDP offer");
        // local_stream_promise.then((stream) => {
        setStatus("Got local stream, creating answer");
        peer_connection.createAnswer()
        // peer_connection.createOffer(default_constraints)
        .then(function(answer) {
            return peer_connection.setLocalDescription(answer);
        })
        .then(function() {
            setStatus("Sending SDP answer");
            sdp = {'sdp': peer_connection.localDescription}
            console.log(JSON.stringify(peer_connection.localDescription));
            ws_conn.send(JSON.stringify(sdp));
        })
        .catch(setError);
        stopOutgoingStream();
    }
}

// ICE candidate received from peer, add it to the peer connection
function onIncomingICE(ice) {
    let candidate = new RTCIceCandidate(ice);
    peer_connection.addIceCandidate(candidate).catch(setError);
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
            // Incoming JSON signals the beginning of a call
            if (!peer_connection) {
                createCall(msg, (msg) => {
                    if (msg.sdp != null) {
                        onIncomingSDP(msg.sdp);
                    } else if (msg.ice != null) {
                        onIncomingICE(msg.ice);
                    } else {
                        handleIncomingError("Unknown incoming JSON: " + msg);
                    }
                });
            } else {
                if (msg.sdp != null) {
                    onIncomingSDP(msg);
                } else if (msg.ice != null) {
                    onIncomingICE(msg.ice);
                } else {
                    handleIncomingError("Unknown incoming JSON: " + msg);
                }
            }
        }
    }
}

function onServerClose(event) {
    setStatus('Disconnected from server');
    resetIncomingStream();
    stopOutgoingStream();
    if (peer_connection) {
        peer_connection.close();
        peer_connection = null;
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
    let ws_url = 'ws://' + ws_server + ':' + ws_port
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
    ws_conn.send('AUDIO_ON');
    audioEnabled = true;
    if (!audioElement || audioElement.readyState != 4) {
        return;
    }
    audioElement.play();
}
function disableAudio() {
    ws_conn.send('AUDIO_OFF');
    audioEnabled = false;
    if (!audioElement || audioElement.readyState != 4) {
        return;
    }
    audioElement.pause();
}
function enableVideo() {
    ws_conn.send('VIDEO_ON');
    videoEnabled = true;
    if (!remote_stream) {
        return;
    }
    let videoTracks = remote_stream.getVideoTracks();
    if (videoTracks.length > 0) {
        videoTracks[0].enabled = true;
        videoElement.load();
    }
}
function disableVideo() {
    ws_conn.send('VIDEO_OFF');
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
    if (videoElement) {
        videoElement.pause();
        videoElement.srcObject = null;
    }
    videoElement = element;
    videoElement.srcObject = remote_stream;
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
function createCall(msg, callback) {
    // Reset connection attempts because we connected successfully
    connect_attempts = 0;
    console.log('Creating RTCPeerConnection');
    peer_connection = new RTCPeerConnection(rtc_configuration);
    peer_connection.onaddstream = onRemoteStreamAdded;
    peer_connection.ontrack = function(event) {
        if (event.track.kind === 'audio') {
            audioElement = document.querySelector('audio');
            audioElement.srcObject = event.streams[0];
            console.log("Audio track added.");
        } else if (event.track.kind === 'video') {
            // TODO Fix vide element for DOCKED mode
            videoElement = document.getElementById('video');
            videoElement.srcObject = event.streams[0];
            videoElement.load();
            console.log("Video track added.");
        }
        console.dir(event);
    };
    //TODO 
    if (msg && msg.sdp) {
        peer_connection.setRemoteDescription(msg.sdp).then(() => {
            createLocalStream(msg, callback);
        })
        .catch(setError);
    } else {
        createLocalStream(msg, function() {
            peer_connection.createOffer(default_constraints)
            .then(function(offer) {
                return peer_connection.setLocalDescription(offer);
            })
            .then(function() {
                setStatus("Sending SDP offer");
                sdp = {'sdp': peer_connection.localDescription}
                console.log(JSON.stringify(peer_connection.localDescription));
                ws_conn.send(JSON.stringify(sdp));
            })
            .catch(setError);
        });
    }
    
    // TODO
    // if (!msg.sdp) {
    //     console.log("WARNING: First message wasn't an SDP message!?");
    // }

    peer_connection.onicecandidate = (event) => {
        // We have a candidate, send it to the remote party with the
        // same uuid
        if (event.candidate == null) {
            console.log("ICE Candidate was null, done");
            return;
        }
        ws_conn.send(JSON.stringify({'ice': event.candidate}));
    };

    setStatus("Created peer connection for call, waiting for SDP");
}

connect = function() {
    let peer_id = document.getElementById('caller_peer_id').value;
    ws_conn.send('SESSION ' + peer_id);
}