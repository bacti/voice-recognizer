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
