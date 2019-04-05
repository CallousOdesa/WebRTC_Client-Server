const WSServer = require('ws').Server;
const EventEmitter = require('events').EventEmitter;

let Server;

{
  let _localPeers;
  let _relay;
  let _engine;
  let _options;
  let _server;
  //TODO
  let _peer_to_peer_map = {};

  /**
   * Use getOurId to generate a peerId
   */
  let _getPeerId = function() {
    return Math.floor(Math.random() * (9000 - 10) + 10).toString();
  }
  let _onServerError = function(error) {
    this.emit('error', error);
  }
  let _onPeerConnection = function(peer) {
    console.log('New connection.');
    // GOOD
    // Generate a peerId for this peer
    // const peerId = peer.peerId = _generatePeerId();

    // Add event handlers to peer
    peer.on('message', (data) => _onPeerMessage(peer, data));
    peer.on('error', (error) => _onPeerError(peer, error));
    peer.on('close', (code, message) => _onPeerClose.bind(this)(peer, code, message));

    //BAD
    peer.send('HELLO');

    // GOOD

    // // Notify peer of its id
    // peer.send(JSON.stringify({
    //   type: 'id',
    //   peerId: peerId
    // }));

    // Add the local peer to the relay
    // if (_relay !== null) {
    //   _relay.addLocalPeerId(peerId);
    // }

    // this.emit('add_peer', peer);

    // Add the peer to the local peers list
    //_localPeers[peerId] = peer;
  }
  let _onPeerError = function(peer, error) {
    peer.emit('error', error);
  }
  let _onPeerMessage = function(peer, data) {
      console.log(`Received message from ${peer.peerId} with ${data}`);
      // TODO REMOVE
      let peerId = peer.peerId;
      if (_peer_to_peer_map[peerId]) {
        
        _localPeers[_peer_to_peer_map[peerId]].send(data);
        return;
      }
      console.log('GET DATA: ', data);
      let parsedData = data.split(' ');
      // TODO BAD CODE!!!!!!!!!!!!!!
      if (parsedData[0] === 'HELLO') {
        peerId = Number(parsedData[1]);
        console.log('Get id: ', peerId);
        // Add the peer to the local peers list
        _localPeers[peerId] = peer;
        peer.peerId = peerId;
      }
      if (parsedData[0] === 'SESSION') {
        let peerId = Number(parsedData[1]);
        if (_localPeers[peerId]) {
          _peer_to_peer_map[peer.peerId] = peerId;
          _peer_to_peer_map[peerId] = peer.peerId;
          console.log(`Connection established between ${peerId} and ${peer.peerId}`);
          console.dir(_peer_to_peer_map);
        } else {
          console.log('Can not found peer with ID: ', peerId);
        }
        peer.send('SESSION_OK');        
      }

    // GOOD CODE - DO NOT EDIT
    // let msg = null
    // try {
    //   msg = JSON.parse(data);
    // } catch (err) {
    //   console.log('Can not parse incoming JSON data:', data);
    // }

    // if (msg !== null) {
    //   if (msg.receiverId) {
    //     if (_isLocalPeer(msg.receiverId)) {
    //       // It's a local peer
    //       _localPeers[msg.receiverId].send(data);
    //     } else if (_relay !== null) {
    //       // We don't have this peer locally
    //       _relay.send(msg.receiverId, data);
    //     } else {
    //       peer.emit('unknown_receiver', msg.receiverId);
    //     }
    //   }
    // }
  }
  let _onPeerClose = function (peer, code, message) {
    if (_isLocalPeer(peer.peerId)) {
      // TODO REMOVE
      let peerId = _peer_to_peer_map[peer.peerId];
      delete _peer_to_peer_map[peer.peerId];
      delete _peer_to_peer_map[peerId];
      console.dir(_peer_to_peer_map);

      // Remove the peer from the local peers list
      delete _localPeers[peer.peerId]

      // If there is a relay, remove it there too
      if (_relay !== null) {
        _relay.removeLocalPeerId(peer.peerId);
      }

      this.emit('remove_peer', peer.peerId);
    }
  }
  let _onRelayMessage = function(peerId, data) {
    if (_isLocalPeer(peerId)) {
      // Send the data to the local peer
      _localPeers[peerId].send(data);
    }
  }
  let _generatePeerId = function() {
    // First check if a custom function was given
    if (_options.generatePeerId && typeof _options.generatePeerId === 'function') {
      return _options.generatePeerId();
    }
    return _getPeerId();
  }
  let _isLocalPeer = function(peerId) {
    return !!_localPeers[peerId];
  }

  Server = class SignalingServer extends EventEmitter {
    constructor(options = {}) {
      super();
      _localPeers = {};
      _relay = options.relay || null;
      _engine = options.engine || WSServer;
      _options = options;
    }

    start() {
      return new Promise((resolve, reject) => {
        try {
          _server = new _engine(_options);
        } catch (error) {
          return reject(new TypeError('invalid engine'));
        }

        // Add event handlers
        _server.on('connection', (peer) => _onPeerConnection.bind(this)(peer));
        _server.on('error', (error) => _onServerError.bind(this)(error));

        // Wire the relay
        if (_relay !== null) {
          _relay.on('message', (peerId, data) => _onRelayMessage.bind(this)(peerId, data));
        }
        return resolve();
      })
    }
  }
}
module.exports = Server;