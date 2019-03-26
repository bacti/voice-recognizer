import { h, render, Component } from 'preact'
const UUID = require('uuid/v1')

import { Trace, Error } from './log'
import { SPEECH_API_KEY, SERVER_DOMAIN, SERVER_PORT, CLIENT_PORT } from '../config'
import './recorder'
import './index.css'

const BUFFER_SIZE = 2048
const SPEECH_THRESHOLD = 5 // 5 times wrt noise amplitude

class SpeechToText extends Component
{
    [x: string]: any
    audioContext = new AudioContext()

    constructor()
    {
        super()
        navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream =>
        {
            const inputPoint = this.audioContext.createGain()

            const realAudioInput = this.audioContext.createMediaStreamSource(stream)
            const audioInput = realAudioInput
            audioInput.connect(inputPoint)

            this.analyserNode = this.audioContext.createAnalyser()
            this.analyserNode.fftSize = 2048
            inputPoint.connect(this.analyserNode)

            this.audioRecorder = new window.Recorder(inputPoint)

            const zeroGain = this.audioContext.createGain()
            zeroGain.gain.value = 0.0
            inputPoint.connect(zeroGain)
            zeroGain.connect(this.audioContext.destination)
        })
        .catch(e =>
        {
            alert('getUserMedia() error: ' + e)
            console.log(e)
        })
    }

    Start()
    {
        Trace('recording...')
        this.startButton.disabled = true
        this.audioRecorder.clear()
        this.audioRecorder.record()
        setTimeout(evt =>
        {
            this.startButton.disabled = false
            this.audioRecorder.stop()
            this.audioRecorder.getBuffers(buffers =>  this.GotBuffers(buffers))
        }, 3000)

    }

    GotBuffers(buffers)
    {
        console.log(this.audioRecorder)
        console.log(buffers)
        // this.audioRecorder.exportWAV(blob =>
        // {
        //     const a = document.createElement('a')
        //     a.href = window.URL.createObjectURL(blob)
        //     a.download = 'myRecording.wav'
        //     a.click()
        // })
    }

    Resample(sourceBuffer, sourceRate, targetRate)
    {
        let length = sourceBuffer.length
        let offlineCtx = new OfflineAudioContext(1, length * targetRate / sourceRate, targetRate)
        let buffer = offlineCtx.createBuffer(1, length, sourceRate)
        buffer.copyToChannel(sourceBuffer, 0)
        let source = offlineCtx.createBufferSource()
        source.buffer = buffer
        source.connect(offlineCtx.destination)
        source.start()
        offlineCtx.startRendering().then(buffer => resolve(buffer))
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
        main: any,
        Recorder: any,
    }
}
window.main = _ =>
{
    Trace('speech-to-text')
    render(<SpeechToText />, document.body)
}
