import { h, render, Component } from 'preact'
const UUID = require('uuid/v1')

import { Trace, Error } from './log'
import { SPEECH_API_KEY, SERVER_DOMAIN, SERVER_PORT, CLIENT_PORT } from '../config'
import './index.css'

const BUFFER_SIZE = 2048
const SPEECH_THRESHOLD = 5 // 5 times wrt noise amplitude

class SpeechToText extends Component
{
    [x: string]: any
    audioContext = new AudioContext()
    state = { url_broadcast: '' }
    noiseMag = 0.01
    lastMag = 0

    constructor()
    {
        super()
    }

    Start()
    {
        Trace('Requesting local stream')
        this.startButton.disabled = true
        navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream =>
        {
            let scriptNode = this.audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1)
            scriptNode.onaudioprocess = event => this.ProcessAudioBuffer(event)
            scriptNode.connect(this.audioContext.destination)
            
            let source = this.audioContext.createMediaStreamSource(stream)
            source.connect(scriptNode)
        })
        .catch(e =>
        {
            alert('getUserMedia() error: ' + e)
            console.log(e)
        })
    }

    ProcessAudioBuffer(event)
    {
        let buffer = event.inputBuffer.getChannelData(0)
        let outBuffer = event.outputBuffer.getChannelData(0)

        let avgMag = buffer.reduce((acc, val) => acc + Math.abs(val), 0) / buffer.length
        if (avgMag < this.noiseMag * 2.5)
        {
            this.noiseMag = this.noiseMag * 0.95 + 0.05 * avgMag
            this.noiseMag = Math.min(0.05, this.noiseMag)
        }
        this.lastMag = avgMag
        console.log((this.lastMag / this.noiseMag).toFixed(3))

        if (this.recording) {
            let copyBuffer = buffer.slice()
            this.recordingData.push(copyBuffer)
            // outBuffer.set(buffer)

            // End-Of-Utterance recognization
            if (avgMag > this.noiseMag * SPEECH_THRESHOLD) {
                this.speech++
                this.silent = 0
            } else {
                this.silent++
            }

            // Trim audio if user not speech yet
            if (this.speech < 4 && this.recordingData.length > 10) {
                this.recordingData = this.recordingData.slice(this.recordingData.length - 10)
                this.speech = Math.max(0, this.speech - 0.2)
            }
        }
        else {
            outBuffer.fill(0)
        }
    }

    Ref(ref, object)
    {
        this[ref] = object
    }

    componentDidMount()
    {
        this.startButton.onclick = _ => this.Start()
    }

    render()
    {
        return (
            <div id='container'>
                <button ref={el => this.Ref('startButton', el)} id='startButton'>Start</button>
            </div>
        )
    }
}

declare global {
    interface Window {
        main: any
    }
}
window.main = _ =>
{
    Trace('speech-to-text')
    render(<SpeechToText />, document.body)
}
