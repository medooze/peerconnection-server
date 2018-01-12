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
MediaServer.enableDebug(true);
MediaServer.enableUltraDebug(true);

var waiting;
//Create HTTP server
const httpserver = http.createServer ((req, res) => {
	// parse URL
	const parsedUrl = url.parse (req.url);

	console.log(parsedUrl.pathname,parsedUrl.search );
	
	switch(parsedUrl.pathname)
	{
		case "/sign_in":
			const peers = "perc-server,1,1\n";
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
				//Get string message
				var msg = JSON.parse(Buffer.concat(body).toString());
			
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
					
					//Enebla dumps
					transport.dump("dumps/"+(new Date()) +".pcap");

					//Set RTP remote properties
					transport.setRemoteProperties({
						audio : offer.getMedia("audio"),
						video : offer.getMedia("video")
					});

					//Get local DTLS and ICE info
					const dtls = transport.getLocalDTLSInfo();
					const ice  = transport.getLocalICEInfo();

					//Get local candidates
					const candidates = endpoint.getLocalCandidates();

					//Create local SDP info
					let answer = new SDPInfo();
					
					//Add ice and dtls info
					answer.setDTLS(dtls);
					answer.setICE(ice);
					//Add candidates to media info
					answer.addCandidates(candidates);
					
					//Get remote video m-line info 
					let audioOffer = offer.getMedia("audio");

					//If offer had video
					if (audioOffer)
					{
						//Create video media
						let  audio = new MediaInfo(audioOffer.getId(), "audio");
						
						//Get codec types
						let opus = audioOffer.getCodec("opus");
						//Add video codecs
						audio.addCodec(opus);
						//Set recv only
						audio.setDirection(Direction.SENDRECV);
						//Add it to answer
						answer.addMedia(audio);
					}

					//Get remote video m-line info 
					let videoOffer = offer.getMedia("video");

					//If offer had video
					if (videoOffer)
					{
						//Create video media
						let  video = new MediaInfo(videoOffer.getId(), "video");
						
						//Get codec types
						let vp8 = videoOffer.getCodec("vp8");
						//Add video codecs
						video.addCodec(vp8);
						//Limit incoming bitrate
						video.setBitrate(1024);

						//Add video extensions
						for (let [id, uri] of videoOffer.getExtensions().entries())
							//Add it
							video.addExtension(id, uri);

						//Add it to answer
						answer.addMedia(video);
					}

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
	}
}).listen (8888);
