import base64codec from "base64-arraybuffer";
import axios from "axios";

const BUFFER_SIZE = 2048;
const SPEECH_THRESHOLD = 5;    // 5 times wrt noise amplitude

export default class SpeechManager extends PIXI.Container {
    constructor() {
        super();
        this.audioContext = new AudioContext();
        this.started = false;
        this.recording = false;
        this.recordingData = [];
        this.speech = 0;
        this.silent = 0;
        this.words = {};

        this.noiseMag = 0.01;
        this.lastMag = 0;

        this.InitGraphics();
        this.Init();
    }

    async Init() {
        let stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                noiseSuppression: { ideal: false },
                echoCancellation: { ideal: false }
            }
        });
        let source = this.audioContext.createMediaStreamSource(stream);
        let scriptNode = this.audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
        scriptNode.onaudioprocess = this.ProcessAudioBuffer.bind(this);

        source.connect(scriptNode);
        scriptNode.connect(this.audioContext.destination);
    }

    ProcessAudioBuffer(event) {
        let buffer = event.inputBuffer.getChannelData(0);
        let outBuffer = event.outputBuffer.getChannelData(0);

        let avgMag = buffer.reduce((acc, val) => acc + Math.abs(val), 0) / buffer.length;
        if (avgMag < this.noiseMag * 2.5) {
            this.noiseMag = this.noiseMag * 0.95 + 0.05 * avgMag;
            this.noiseMag = Math.min(0.05, this.noiseMag);
        }
        this.lastMag = avgMag;
        console.log((this.lastMag / this.noiseMag).toFixed(3));

        if (this.recording) {
            let copyBuffer = buffer.slice();
            this.recordingData.push(copyBuffer);
            // outBuffer.set(buffer);

            // End-Of-Utterance recognization
            if (avgMag > this.noiseMag * SPEECH_THRESHOLD) {
                this.speech++;
                this.silent = 0;
            } else {
                this.silent++;
            }

            // Trim audio if user not speech yet
            if (this.speech < 4 && this.recordingData.length > 10) {
                this.recordingData = this.recordingData.slice(this.recordingData.length - 10);
                this.speech = Math.max(0, this.speech - 0.2);
            }
        }
        else {
            outBuffer.fill(0);
        }
    }

    static async Resample(sourceBuffer, sourceRate, targetRate) {
        let length = sourceBuffer.length;
        let offlineCtx = new OfflineAudioContext(1, length * targetRate / sourceRate, targetRate);
        let buffer = offlineCtx.createBuffer(1, length, sourceRate);
        buffer.copyToChannel(sourceBuffer, 0);
        let source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(offlineCtx.destination);
        source.start();
        let results = await offlineCtx.startRendering();
        return results.getChannelData(0);
    }

    get endOfUtterance() {
        return (this.speech >= 4 && this.silent >= 10) || this.speech > 30;
    }

    Start() {
        if (!this.started)
            return;

        this.recordingData = [];
        this.speech = 0;
        this.silent = 0;
        this.recording = true;

        // End of utterance recognition
        let eouHandler = async _ => {
            if (this.started && this.recording && !this.endOfUtterance) {
                setTimeout(eouHandler, 100);
                return;
            }
            await this.Stop();
            this.Start() // Restart recording
        }
        setTimeout(eouHandler, 100);
    }

    async Stop(cancel = false) {
        if (!this.recording) return;

        this.recording = false;
        if (cancel) return;
        if (this.recordingData.length == 0) return;
    
        let buffer = new Float32Array(BUFFER_SIZE * this.recordingData.length);
        for (let i = 0; i < this.recordingData.length; i++)
            buffer.set(this.recordingData[i], i * BUFFER_SIZE);
    
        let resampled = await SpeechManager.Resample(buffer, this.audioContext.sampleRate, 16000);
        let linear16 = Int16Array.from(resampled, x => x * 32767);
    
        // visualize(linear16);
    
        let base64 = base64codec.encode(linear16.buffer);
    
        let requestData = {
            "audio": {
                "content": base64
            },
            "config": {
                "enableAutomaticPunctuation": false,
                "encoding": "LINEAR16",
                "languageCode": "en-US",
                "sampleRateHertz": 16000,
                "maxAlternatives": 30
            }
        };
        requestData.config.speechContexts = [{
            "phrases": Object.keys(this.words)
        }];
    
        let res = await axios.post("https://speech.googleapis.com/v1/speech:recognize", requestData, {
            params: {
                key: GameDefine.SPEECH_API_KEY
            }
        });

        let results = res.data.results;
        if (!results) {
            console.log("No results");
            return;
        }
        let transcript = results[0].alternatives.slice()
                .sort((a, b) => b.confidence - a.confidence)
                .map(e => e.transcript);
        console.log("Speech result:", transcript);
        this.Recognize(transcript);
    }

    async Cancel() {
        return this.Stop(true);
    }

    Recognize(alternatives) {
        if (!alternatives) {
            return;
        }

        let recognized = undefined;
        for (let word in this.words) {
            if (alternatives.includes(word)) {
                console.log("Recognized", word);
                recognized = word;
                let callback = this.words[word];
                if (callback)
                    callback();
                break;
            }
        }

        if (!recognized)
            recognized = alternatives[0];

        this.text = recognized;
    }

    InitGraphics() {
        let g = this.recordSym = new PIXI.Graphics();
        this.addChild(g);

        g = this.processIcon = new PIXI.Graphics();
        g.lineStyle(10, 0xFF0000);
        g.moveTo(12, 0);
        g.arc(0, 0, 12, 0, Math.PI * 2 / 3);
        this.addChild(g);

        let t = this.transcript = new PIXI.Text("", {
            fill: 0xFFFFFF,
            fontFamily: "Arial",
            fontSize: 20
        });
        t.position.set(25, -13.5);
        this.addChild(t);
    }

    set text(val) {
        this.transcript.text = val;
    }

    Update(dt) {
        this.processIcon.visible = this.started && !this.recording;
        this.recordSym.visible = !this.processIcon.visible;
        this.processIcon.rotation += dt * 2 * Math.PI;
        
        let relMag = this.lastMag / this.noiseMag;
        let outerRadius = Math.min(relMag * 2 + 13, 25);
        
        let g = this.recordSym;
        g.clear();
        g.lineStyle(0);
        g.beginFill(0xFFFFFF, 1);
        g.drawCircle(0, 0, 10);
        g.endFill();
        g.lineStyle(2, 0xFFFFFF);
        g.drawCircle(0, 0, outerRadius);

        g.tint = !this.started ? 0x777777 : (relMag < SPEECH_THRESHOLD ? 0xFF0000 : 0x00FF00);
    }

    AddWord(word, callback) {
        this.words[word] = callback;
        if (!this.started) {
            this.started = true;
            this.Start();
        }
    }

    RemoveWord(word) {
        delete this.words[word];
        if (this.started && Object.keys(this.words).length == 0) {
            this.Cancel();
            this.started = false;
        }
    }
}