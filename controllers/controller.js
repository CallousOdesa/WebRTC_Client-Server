const Server = require('./signaling')
const program = require('commander');
let controller = {};

controller.init = function(engine) {

  const server = new Server({
    engine
  });
  
  if (program.verbose) {
    server.on('add_peer', peer => {
      console.log(`- Peer added with id ${peer.peerId}`)
    });
    server.on('remove_peer', peerId => {
      console.log(`- Peer removed with id ${peerId}`)
    });
  }

  server.start().then(() => {
    console.log(`signal-fire instance started on port ${program.port}`)
    console.log('press ctrl+c to stop')
    if (program.verbose) {
      console.log()
      console.log('verbose output is enabled...')
    }
  }).catch(err => {
    console.log(`error starting signal-fire server: ${err.message}`)
  });
};

module.exports = controller;