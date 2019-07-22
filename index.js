const http = require ('http');
const url = require ('url');

//Get the Medooze Media Server interface
const MediaServer = require("medooze-media-server");

//Get Semantic SDP objects
const SemanticSDP	= require("semantic-sdp");
const SDPInfo		= SemanticSDP.SDPInfo;
const MediaInfo		= SemanticSDP.MediaInfo;
const CandidateInfo	= SemanticSDP.CandidateInfo;
const DTLSInfo		= SemanticSDP.DTLSInfo;
const ICEInfo		= SemanticSDP.ICEInfo;
const StreamInfo	= SemanticSDP.StreamInfo;
const TrackInfo		= SemanticSDP.TrackInfo;
const Direction		= SemanticSDP.Direction;
const CodecInfo		= SemanticSDP.CodecInfo;

//Check 
if (process.argv.length!=3)
	 throw new Error("Missing IP address\nUsage: node index.js <ip>"+process.argv.length);
//Get ip
const ip = process.argv[2];

//Create UDP server endpoint
const endpoint = MediaServer.createEndpoint(ip);

const base = 'www';

//Enable debug
MediaServer.enableDebug(false);
MediaServer.enableUltraDebug(false);

const Capabilities = {
	audio : {
		codecs		: ["opus"],
	},
	video : {
		codecs		: ["AV1"],
		rtx		: true,
		rtcpfbs		: [
			{ "id": "goog-remb"},
			{ "id": "transport-cc"},
			{ "id": "ccm", "params": ["fir"]},
			{ "id": "nack"},
			{ "id": "nack", "params": ["pli"]}
			
		],
		extensions	: [
			"urn:3gpp:video-orientation",
			"http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01",
			"http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time",
			"urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id",
			"urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id",
			"urn:ietf:params:rtp-hdrext:sdes:mid"
		],
		simulcast	: true
	}
};

var waiting;
let recorder;

//Create HTTP server
const httpserver = http.createServer ((req, res) => {
	// parse URL
	const parsedUrl = url.parse (req.url);

	console.log(parsedUrl.pathname,parsedUrl.search );
	
	switch(parsedUrl.pathname)
	{
		case "/sign_in":
			const peers = "demo-server,1,1\n";
			res.setHeader ('Pragma','2');
			res.setHeader ('Content-Type','text/plain');
			res.setHeader ('Content-Length',peers.length);
			res.end(peers);
			break;
		case "/message":
			var body = [];
			//Read data
			req.on('error', function(err) {
				 console.error(err);
			}).on('data', function(chunk) {
				body.push(chunk);
			}).on('end', function() {
				//Get body
				const str = Buffer.concat(body).toString();
				//Check if end
				if (str=="BYE")
					return //recorder.stop();
				//Get string message
				var msg = JSON.parse(str);
			
				//If it is the offer
				if (msg.type==="offer")
				{

					console.log("OFFER:\n",msg.sdp);

					//Process the sdp
					var offer = SDPInfo.process(msg.sdp);
					
					//Create an DTLS ICE transport in that enpoint
					const transport = endpoint.createTransport({
						dtls : offer.getDTLS(),
						ice  : offer.getICE() 
					});
					
					const ts = Date.now();
					
					//Enebla dumps
					transport.dump("dumps/" + ts +".pcap");
					
					//Create recoreder
					//recorder = MediaServer.createRecorder("dumps/"+ ts +".mp4");

					//Set RTP remote properties
					transport.setRemoteProperties({
						audio : offer.getMedia("audio"),
						video : offer.getMedia("video")
					});
					
					//Create local SDP info
					const answer = offer.answer({
						dtls		: transport.getLocalDTLSInfo(),
						ice		: transport.getLocalICEInfo(),
						candidates	: endpoint.getLocalCandidates(),
						capabilities	: Capabilities
					});

					//Set RTP local  properties
					transport.setLocalProperties({
						audio : answer.getMedia("audio"),
						video : answer.getMedia("video")
					});

					//For each stream offered
					for (let offered of offer.getStreams().values())
					{
						//Create the remote stream into the transport
						const incomingStream = transport.createIncomingStream(offered);

						//Create new local stream with only audio
						const outgoingStream  = transport.createOutgoingStream({
							audio: false,
							video: true
						});

						//Get local stream info
						const info = outgoingStream.getStreamInfo();

						//Copy incoming data from the remote stream to the local one
						outgoingStream.attachTo(incomingStream);

						//Add local stream info it to the answer
						answer.addStream(info);
						
						//Record it
						//recorder.record(incomingStream);
					}
					
					const str = answer.toString ();
					console.log("ANSWER:\n",str);
					
					setTimeout(()=>{
						console.log("answer");
						//Crate response
						var response = JSON.stringify ({
							type: "answer",
							sdp: str
						});
						waiting.setHeader ('Pragma','1');
						waiting.setHeader ('Content-Type','text/plain');
						waiting.setHeader ('Content-Length',response.length);
						waiting.end(response);
					},1000);
					
				} 
				//Done
				res.setHeader ('Pragma','2');
				res.setHeader ('Content-Length',0);
				res.end();
			});
			break;
		case "/wait":
			waiting = res;
			break;
		case "/sign_out":
			//recorder.stop();
			break;
	}
}).listen (8888);
