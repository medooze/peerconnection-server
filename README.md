# peerconnection-server echo test
Echo test server for libwebrtc peerconnection_client

## Intallation
```
npm install
```

## Run
You need to run the server passing as argument the public IP address of the media server that will be included in the SDP. This IP address is the one facing your clients.
```
node index.js <ip>
```

The server will open an HTPP server at port 8888 so you can connect your peerconection_client to it. When call is established, the server will echo back all the media and dump the unencripted rtp/rtcp to the `dumps` directory.
