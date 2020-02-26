# Configure COTURN
1. The TURN server https://github.com/coturn/coturn
2. Especially configuration page https://github.com/coturn/coturn/wiki/turnserver
3. Put turnserver.conf to /usr/local/etc/ and should be uncommented next lines with params:

    listening-port=3478

    tls-listening-port=5349

    min-port=55500

    max-port=55510

    Verbose #Optional

    fingerprint

    lt-cred-mech

    user=username1:password1

    realm=testdrive.com

    no-tcp

    no-tcp-relay

    cert=[path_to_key.pem]

    pkey=[path_to_cert.pem]


4. Run turn server via sudo: "sudo /opt/bin/turnserver"

# WebRTC IceServers config:
    {
        iceServers: [ 
          {
            url: 'turn:[ip_address_of_pc_where_coturn_turnserver_running]:3478',
            username: 'username1',
            credential: 'password1'
          }
        ]
    }

# WebRTC_Client-Server
WebRTC: NodeJS Signaling server with browser clients implementation

1. npm install
2. npm start
3. Open browser on https://127.0.0.1:8443/
